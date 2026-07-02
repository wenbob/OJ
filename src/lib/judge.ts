import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { dockerJudgeCppCode } from "@/lib/dockerJudge";
import { assertProductionJudgeMode, getJudgeMode } from "@/lib/env";
import {
  DEFAULT_PROCESS_OUTPUT_LIMIT_BYTES,
  createLimitedOutputCollector,
} from "@/lib/processOutputLimit";
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

type ProcessResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  runtimeMs: number;
  errorMessage?: string;
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
): Promise<ProcessResult> {
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

    const finish = (result: Omit<ProcessResult, "runtimeMs">) => {
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

function normalizeOutput(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trimEnd();
}

function truncateOutput(value: string, maxLength = 5000) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n...（内容过长，已截断）`;
}

export async function localJudgeCppCode({
  code,
  testCases,
  timeLimitMs = readPositiveInt(process.env.JUDGE_TIME_LIMIT_MS, 2000),
}: JudgeInput): Promise<JudgeResult> {
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
      return {
        status: "Compile Error",
        passedCount: 0,
        totalCount: testCases.length,
        runtimeMs: compile.runtimeMs,
        errorMessage: `无法启动 g++：${compile.errorMessage}`,
        caseResults: [],
      };
    }

    if (compile.exitCode !== 0) {
      return {
        status: "Compile Error",
        passedCount: 0,
        totalCount: testCases.length,
        runtimeMs: compile.runtimeMs,
        errorMessage: compile.stderr || compile.stdout || "编译失败",
        caseResults: [],
      };
    }

    let passedCount = 0;
    let runtimeMs = 0;
    let firstError = "";
    let status: SubmissionStatus = "Accepted";
    const caseResults: JudgeCaseResult[] = [];

    for (const [index, testCase] of testCases.entries()) {
      const run = await runProcess(
        executablePath,
        [],
        testCase.input,
        timeLimitMs,
        workDir,
      );
      runtimeMs += run.runtimeMs;

      let caseStatus: SubmissionStatus = "Accepted";
      let errorMessage = "";
      const actualOutput = truncateOutput(run.stdout);
      const expectedOutput = truncateOutput(testCase.output);

      if (run.timedOut) {
        caseStatus = "Time Limit Exceeded";
        errorMessage = `运行超过 ${timeLimitMs}ms`;
      } else if (run.errorMessage || run.exitCode !== 0) {
        caseStatus = "Runtime Error";
        errorMessage = run.errorMessage || run.stderr || "程序运行时异常";
      } else if (normalizeOutput(run.stdout) !== normalizeOutput(testCase.output)) {
        caseStatus = "Wrong Answer";
        errorMessage = "程序输出与标准输出不一致";
      } else {
        passedCount += 1;
      }

      if (caseStatus !== "Accepted" && status === "Accepted") {
        status = caseStatus;
        firstError = errorMessage;
      }

      caseResults.push({
        caseIndex: index + 1,
        status: caseStatus,
        input: truncateOutput(testCase.input),
        expectedOutput,
        actualOutput,
        runtimeMs: run.runtimeMs,
        errorMessage: errorMessage ? truncateOutput(errorMessage) : undefined,
      });
    }

    return {
      status,
      passedCount,
      totalCount: testCases.length,
      runtimeMs,
      errorMessage: firstError || undefined,
      caseResults,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function judgeCppCode(input: JudgeInput): Promise<JudgeResult> {
  assertProductionJudgeMode();
  const mode = getJudgeMode();
  if (mode === "docker") {
    return dockerJudgeCppCode(input);
  }

  return localJudgeCppCode(input);
}
