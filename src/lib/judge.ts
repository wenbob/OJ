import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildRunCaseResult,
  compileErrorRunResult,
  summarizeRunCases,
  type CppProcessResult,
  type RunCppInput,
  type RunCppResult,
} from "@/lib/cppRun";
import { dockerRunCppCode } from "@/lib/dockerJudge";
import { assertProductionJudgeMode, getJudgeMode } from "@/lib/env";
import {
  DEFAULT_PROCESS_OUTPUT_LIMIT_BYTES,
  createLimitedOutputCollector,
} from "@/lib/processOutputLimit";
import { JudgeInfrastructureError } from "@/lib/judgeErrors";
import { assertJudgeCasePayload } from "@/lib/judgeCaseLimits";
import type { SubmissionStatus } from "@/lib/status";

export type JudgeTestCase = {
  input: string;
  output: string;
  isSample?: boolean;
};

export type JudgeInput = {
  code: string;
  testCases: JudgeTestCase[];
  timeLimitMs?: number;
  memoryLimitMb?: number;
};

export type JudgeCaseResult = {
  caseIndex: number;
  status: SubmissionStatus;
  input: string;
  expectedOutput: string;
  actualOutput?: string;
  runtimeMs?: number;
  errorMessage?: string;
};

export type JudgeResult = {
  status: SubmissionStatus;
  passedCount: number;
  totalCount: number;
  runtimeMs: number;
  errorMessage?: string;
  caseResults: JudgeCaseResult[];
};

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function runProcess(
  command: string,
  args: string[],
  input: string,
  timeoutMs: number,
  cwd: string,
): Promise<CppProcessResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const outputLimitBytes = readPositiveInt(
      process.env.JUDGE_OUTPUT_LIMIT_BYTES,
      DEFAULT_PROCESS_OUTPUT_LIMIT_BYTES,
    );
    const stdout = createLimitedOutputCollector(outputLimitBytes);
    const stderr = createLimitedOutputCollector(outputLimitBytes);
    let settled = false;
    let timedOut = false;

    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const finish = (result: Omit<CppProcessResult, "runtimeMs">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, runtimeMs: Date.now() - startedAt });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout.append(chunk);
      if (stdout.exceeded()) child.kill();
    });

    child.stderr.on("data", (chunk) => {
      stderr.append(chunk);
      if (stderr.exceeded()) child.kill();
    });

    child.stdin.on("error", () => {
      // The child may exit before stdin is fully written.
    });

    child.on("error", (error) => {
      finish({
        stdout: stdout.value(),
        stderr: stderr.value(),
        exitCode: null,
        timedOut: false,
        errorMessage: error.message,
      });
    });

    child.on("close", (exitCode) => {
      const outputExceeded = stdout.exceeded() || stderr.exceeded();
      finish({
        stdout: stdout.value(),
        stderr: stderr.value(),
        exitCode,
        timedOut,
        errorMessage: outputExceeded ? "程序输出超过限制" : undefined,
      });
    });

    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

function validateRunInput({ expectedOutputs, inputs }: RunCppInput) {
  if (inputs.length === 0) {
    throw new Error("试运行至少需要一组输入");
  }
  if (expectedOutputs && expectedOutputs.length !== inputs.length) {
    throw new Error("样例输入与标准输出数量不一致");
  }
  assertJudgeCasePayload(
    inputs.map((input, index) => ({
      input,
      output: expectedOutputs?.[index],
    })),
  );
}

export async function localRunCppCode({
  code,
  expectedOutputs,
  inputs,
  timeLimitMs = readPositiveInt(process.env.JUDGE_TIME_LIMIT_MS, 2000),
}: RunCppInput): Promise<RunCppResult> {
  validateRunInput({ code, expectedOutputs, inputs, timeLimitMs });
  const workDir = await mkdtemp(path.join(tmpdir(), "cpp-oj-"));
  const sourcePath = path.join(workDir, "main.cpp");
  const executableName = process.platform === "win32" ? "main.exe" : "main";
  const executablePath = path.join(workDir, executableName);

  try {
    await writeFile(sourcePath, code, "utf8");

    const compile = await runProcess(
      "g++",
      ["main.cpp", "-std=c++17", "-O2", "-o", executableName],
      "",
      10000,
      workDir,
    );

    if (compile.errorMessage) {
      if (compile.errorMessage !== "程序输出超过限制") {
        throw new JudgeInfrastructureError(
          "本机评测编译器暂时不可用，请稍后再试",
          compile.errorMessage,
        );
      }
      return compileErrorRunResult({
        errorMessage: `无法启动 g++：${compile.errorMessage}`,
        runtimeMs: compile.runtimeMs,
      });
    }
    if (compile.timedOut) {
      return compileErrorRunResult({
        errorMessage: "g++ 编译超时",
        runtimeMs: compile.runtimeMs,
      });
    }
    if (compile.exitCode !== 0) {
      return compileErrorRunResult({
        errorMessage: compile.stderr || compile.stdout || "编译失败",
        runtimeMs: compile.runtimeMs,
      });
    }

    const cases = [];
    for (const [index, input] of inputs.entries()) {
      const processResult = await runProcess(
        executablePath,
        [],
        input,
        timeLimitMs,
        workDir,
      );
      cases.push(
        buildRunCaseResult({
          caseIndex: index + 1,
          expectedOutput: expectedOutputs?.[index],
          input,
          processResult,
          timeLimitMs,
        }),
      );
    }

    return summarizeRunCases({
      cases,
      compared: expectedOutputs !== undefined,
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function runCaseStatusToSubmissionStatus(
  status: RunCppResult["cases"][number]["status"],
): SubmissionStatus {
  if (status === "mismatched") return "Wrong Answer";
  if (status === "runtime_error") return "Runtime Error";
  if (status === "time_limit_exceeded") return "Time Limit Exceeded";
  return "Accepted";
}

export function convertRunResultToJudgeResult(
  runResult: RunCppResult,
  testCases: JudgeTestCase[],
): JudgeResult {
  if (runResult.status === "compile_error") {
    return {
      caseResults: [],
      errorMessage: runResult.errorMessage,
      passedCount: 0,
      runtimeMs: runResult.runtimeMs,
      status: "Compile Error",
      totalCount: testCases.length,
    };
  }

  const caseResults = runResult.cases.map((item, index) => ({
    actualOutput: item.actualOutput,
    caseIndex: item.caseIndex,
    errorMessage: item.errorMessage,
    expectedOutput: item.expectedOutput ?? testCases[index]?.output ?? "",
    input: item.input,
    runtimeMs: item.runtimeMs,
    status: runCaseStatusToSubmissionStatus(item.status),
  }));
  const firstFailure = caseResults.find((item) => item.status !== "Accepted");

  return {
    caseResults,
    errorMessage: firstFailure?.errorMessage,
    passedCount: caseResults.filter((item) => item.status === "Accepted").length,
    runtimeMs: runResult.runtimeMs,
    status: firstFailure?.status ?? "Accepted",
    totalCount: testCases.length,
  };
}

export async function localJudgeCppCode(input: JudgeInput): Promise<JudgeResult> {
  const runResult = await localRunCppCode({
    code: input.code,
    expectedOutputs: input.testCases.map((item) => item.output),
    inputs: input.testCases.map((item) => item.input),
    memoryLimitMb: input.memoryLimitMb,
    timeLimitMs: input.timeLimitMs,
  });
  return convertRunResultToJudgeResult(runResult, input.testCases);
}

export async function runCppCode(input: RunCppInput): Promise<RunCppResult> {
  validateRunInput(input);
  try {
    assertProductionJudgeMode();
    if (getJudgeMode() === "docker") {
      return await dockerRunCppCode(input);
    }
    return await localRunCppCode(input);
  } catch (error) {
    if (error instanceof JudgeInfrastructureError) throw error;
    throw new JudgeInfrastructureError(undefined, error);
  }
}

export async function judgeCppCode(input: JudgeInput): Promise<JudgeResult> {
  const runResult = await runCppCode({
    code: input.code,
    expectedOutputs: input.testCases.map((item) => item.output),
    inputs: input.testCases.map((item) => item.input),
    memoryLimitMb: input.memoryLimitMb,
    timeLimitMs: input.timeLimitMs,
  });
  return convertRunResultToJudgeResult(runResult, input.testCases);
}
