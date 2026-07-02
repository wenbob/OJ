import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  JudgeCaseResult,
  JudgeInput,
  JudgeResult,
} from "@/lib/judge";
import {
  DEFAULT_PROCESS_OUTPUT_LIMIT_BYTES,
  createLimitedOutputCollector,
} from "@/lib/processOutputLimit";
import type { SubmissionStatus } from "@/lib/status";

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

function dockerImage() {
  return process.env.JUDGE_DOCKER_IMAGE?.trim() || "oj-cpp-judge";
}

const dockerUnavailableMessage =
  "评测服务暂时没有启动，请老师检查 Docker Judge。你可以先保存代码，稍后再提交。";

function isDockerUnavailableMessage(value: string) {
  const message = value.toLowerCase();
  return (
    message.includes("enoent") ||
    message.includes("spawn docker") ||
    message.includes("docker api") ||
    message.includes("dockerdesktoplinuxengine") ||
    message.includes("cannot connect to the docker daemon") ||
    message.includes("error during connect") ||
    message.includes("is the docker daemon running") ||
    message.includes("npipe:////./pipe/docker") ||
    message.includes("//./pipe/docker")
  );
}

export function normalizeDockerErrorMessage(value: string) {
  return isDockerUnavailableMessage(value) ? dockerUnavailableMessage : value;
}

function createContainerName() {
  return `oj-cpp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function runProcess({
  args,
  input,
  timeoutMs,
  containerName,
}: {
  args: string[];
  input: string;
  timeoutMs: number;
  containerName: string;
}): Promise<ProcessResult> {
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
    let cleanupStarted = false;

    const child = spawn("docker", args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const cleanupContainer = () => {
      if (cleanupStarted) return;
      cleanupStarted = true;
      const cleanup = spawn("docker", ["rm", "-f", containerName], {
        windowsHide: true,
        stdio: "ignore",
      });
      cleanup.on("error", () => {});
    };

    const finish = (result: Omit<ProcessResult, "runtimeMs">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, runtimeMs: Date.now() - startedAt });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      cleanupContainer();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout.append(chunk);
      if (stdout.exceeded()) {
        child.kill();
        cleanupContainer();
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr.append(chunk);
      if (stderr.exceeded()) {
        child.kill();
        cleanupContainer();
      }
    });

    child.stdin.on("error", () => {
      // The container may exit before stdin is fully written.
    });

    child.on("error", (error) => {
      finish({
        stdout: stdout.value(),
        stderr: stderr.value(),
        exitCode: null,
        timedOut: false,
        errorMessage: normalizeDockerErrorMessage(error.message),
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

function dockerRunArgs({
  command,
  containerName,
  memoryLimitMb,
  workDir,
}: {
  command: string[];
  containerName: string;
  memoryLimitMb: number;
  workDir: string;
}) {
  return [
    "run",
    "--rm",
    "-i",
    "--log-driver",
    "none",
    "--name",
    containerName,
    "--network",
    "none",
    "--memory",
    `${memoryLimitMb}m`,
    "--cpus",
    "1",
    "--pids-limit",
    "64",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    "-v",
    `${workDir}:/workspace`,
    "-w",
    "/workspace",
    dockerImage(),
    ...command,
  ];
}

export async function dockerJudgeCppCode({
  code,
  memoryLimitMb = readPositiveInt(process.env.JUDGE_MEMORY_LIMIT_MB, 128),
  testCases,
  timeLimitMs = readPositiveInt(process.env.JUDGE_TIME_LIMIT_MS, 2000),
}: JudgeInput): Promise<JudgeResult> {
  const compileTimeoutMs = readPositiveInt(
    process.env.JUDGE_COMPILE_TIMEOUT_MS,
    30000,
  );
  const workDir = await mkdtemp(path.join(tmpdir(), "cpp-oj-docker-"));
  const sourcePath = path.join(workDir, "main.cpp");
  const executableName = "main";

  try {
    await writeFile(sourcePath, code, "utf8");

    const compileContainerName = createContainerName();
    const compile = await runProcess({
      args: dockerRunArgs({
        command: ["g++", "main.cpp", "-std=c++17", "-O2", "-o", executableName],
        containerName: compileContainerName,
        memoryLimitMb,
        workDir,
      }),
      containerName: compileContainerName,
      input: "",
      timeoutMs: Math.max(compileTimeoutMs, timeLimitMs + 5000),
    });

    if (compile.errorMessage) {
      return {
        status: "Compile Error",
        passedCount: 0,
        totalCount: testCases.length,
        runtimeMs: compile.runtimeMs,
        errorMessage: compile.errorMessage,
        caseResults: [],
      };
    }

    if (compile.timedOut) {
      return {
        status: "Compile Error",
        passedCount: 0,
        totalCount: testCases.length,
        runtimeMs: compile.runtimeMs,
        errorMessage: "Docker 编译超时",
        caseResults: [],
      };
    }

    if (compile.exitCode !== 0) {
      const compileMessage = compile.stderr || compile.stdout || "编译失败";
      return {
        status: "Compile Error",
        passedCount: 0,
        totalCount: testCases.length,
        runtimeMs: compile.runtimeMs,
        errorMessage: normalizeDockerErrorMessage(compileMessage),
        caseResults: [],
      };
    }

    let passedCount = 0;
    let runtimeMs = 0;
    let firstError = "";
    let status: SubmissionStatus = "Accepted";
    const caseResults: JudgeCaseResult[] = [];

    for (const [index, testCase] of testCases.entries()) {
      const runContainerName = createContainerName();
      const run = await runProcess({
        args: dockerRunArgs({
          command: [`./${executableName}`],
          containerName: runContainerName,
          memoryLimitMb,
          workDir,
        }),
        containerName: runContainerName,
        input: testCase.input,
        timeoutMs: timeLimitMs,
      });
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
        const runMessage =
          run.errorMessage ||
          run.stderr ||
          "程序运行时异常，可能触发了容器资源限制";
        errorMessage =
          normalizeDockerErrorMessage(runMessage);
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
