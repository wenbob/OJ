import { spawn } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
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
import {
  DEFAULT_PROCESS_OUTPUT_LIMIT_BYTES,
  createLimitedOutputCollector,
} from "@/lib/processOutputLimit";
import { JudgeInfrastructureError } from "@/lib/judgeErrors";

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoundedPositiveInt(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  return Math.min(readPositiveInt(value, fallback), maximum);
}

function dockerImage() {
  return process.env.JUDGE_DOCKER_IMAGE?.trim() || "oj-cpp-judge";
}

const dockerUnavailableMessage =
  "评测服务暂时没有启动，请老师检查 Docker Judge。你可以先保存代码，稍后再提交。";

function isDockerUnavailableMessage(value: string) {
  const message = value.toLowerCase();
  return (
    message.includes(dockerUnavailableMessage.toLowerCase()) ||
    message.includes("enoent") ||
    message.includes("spawn docker") ||
    message.includes("docker api") ||
    message.includes("dockerdesktoplinuxengine") ||
    message.includes("cannot connect to the docker daemon") ||
    message.includes("error during connect") ||
    message.includes("is the docker daemon running") ||
    message.includes("npipe:////./pipe/docker") ||
    message.includes("//./pipe/docker") ||
    message.includes("unable to find image") ||
    message.includes("pull access denied") ||
    message.includes("no such image") ||
    message.includes("error response from daemon") ||
    message.includes("permission denied while trying to connect") ||
    message.includes("oci runtime") ||
    message.includes("docker: error") ||
    message.includes("executable file not found")
  );
}

export function normalizeDockerErrorMessage(value: string) {
  return isDockerUnavailableMessage(value) ? dockerUnavailableMessage : value;
}

export function isDockerInfrastructureResult(
  result: CppProcessResult,
  phase: "compile" | "run",
) {
  const details = [result.errorMessage, result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n");
  const infrastructureExit =
    result.exitCode === 125 ||
    (phase === "compile" &&
      (result.exitCode === 126 || result.exitCode === 127));
  if (infrastructureExit) return true;
  return (
    result.exitCode === null &&
    !result.timedOut &&
    isDockerUnavailableMessage(details)
  );
}

function getDockerInfrastructureError(
  result: CppProcessResult,
  phase: "compile" | "run",
) {
  if (!isDockerInfrastructureResult(result, phase)) return null;
  const details = [result.errorMessage, result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n");
  return new JudgeInfrastructureError(dockerUnavailableMessage, details);
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
}): Promise<CppProcessResult> {
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
    let cleanupPromise: Promise<void> | null = null;

    const child = spawn("docker", args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const cleanupContainer = () => {
      if (cleanupPromise) return cleanupPromise;
      cleanupPromise = new Promise<void>((cleanupDone) => {
        const cleanup = spawn("docker", ["rm", "-f", containerName], {
          windowsHide: true,
          stdio: "ignore",
        });
        let cleanupSettled = false;
        const finishCleanup = () => {
          if (cleanupSettled) return;
          cleanupSettled = true;
          clearTimeout(cleanupTimer);
          cleanupDone();
        };
        const cleanupTimer = setTimeout(() => {
          cleanup.kill();
          finishCleanup();
        }, 5_000);
        cleanup.once("error", finishCleanup);
        cleanup.once("close", finishCleanup);
      });
      return cleanupPromise;
    };

    const finish = async (result: Omit<CppProcessResult, "runtimeMs">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (cleanupPromise) await cleanupPromise;
      resolve({ ...result, runtimeMs: Date.now() - startedAt });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      void cleanupContainer();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout.append(chunk);
      if (stdout.exceeded()) {
        child.kill();
        void cleanupContainer();
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr.append(chunk);
      if (stderr.exceeded()) {
        child.kill();
        void cleanupContainer();
      }
    });

    child.stdin.on("error", () => {
      // The container may exit before stdin is fully written.
    });

    child.on("error", (error) => {
      void finish({
        stdout: stdout.value(),
        stderr: stderr.value(),
        exitCode: null,
        timedOut: false,
        errorMessage: normalizeDockerErrorMessage(error.message),
      });
    });

    child.on("close", (exitCode) => {
      const outputExceeded = stdout.exceeded() || stderr.exceeded();
      void finish({
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

export function buildDockerRunArgs({
  command,
  fileSizeLimitBytes,
  containerName,
  memoryLimitMb,
  workspaceReadOnly = false,
  workDir,
}: {
  command: string[];
  fileSizeLimitBytes?: number;
  containerName: string;
  memoryLimitMb: number;
  workspaceReadOnly?: boolean;
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
    "--memory-swap",
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
    ...(fileSizeLimitBytes
      ? ["--ulimit", `fsize=${fileSizeLimitBytes}:${fileSizeLimitBytes}`]
      : []),
    "--user",
    "65534:65534",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    "-v",
    `${workDir}:/workspace:${workspaceReadOnly ? "ro" : "rw"}`,
    "-w",
    "/workspace",
    dockerImage(),
    ...command,
  ];
}

export async function dockerRunCppCode({
  code,
  expectedOutputs,
  inputs,
  memoryLimitMb = readPositiveInt(process.env.JUDGE_MEMORY_LIMIT_MB, 128),
  timeLimitMs = readPositiveInt(process.env.JUDGE_TIME_LIMIT_MS, 2000),
}: RunCppInput): Promise<RunCppResult> {
  const compileTimeoutMs = readPositiveInt(
    process.env.JUDGE_COMPILE_TIMEOUT_MS,
    30000,
  );
  const compileMemoryLimitMb = readBoundedPositiveInt(
    process.env.JUDGE_COMPILE_MEMORY_LIMIT_MB,
    Math.max(memoryLimitMb, 512),
    1024,
  );
  const compileFileLimitBytes =
    readBoundedPositiveInt(
      process.env.JUDGE_COMPILE_FILE_LIMIT_MB,
      64,
      256,
    ) *
    1024 *
    1024;
  const workDir = await mkdtemp(path.join(tmpdir(), "cpp-oj-docker-"));
  const sourcePath = path.join(workDir, "main.cpp");
  const executableName = "main";

  try {
    // The judged process runs as an unprivileged numeric user, so only this
    // per-submission temporary directory is made writable to that user.
    await chmod(workDir, 0o777);
    await writeFile(sourcePath, code, "utf8");

    const compileContainerName = createContainerName();
    const compile = await runProcess({
      args: buildDockerRunArgs({
        command: ["g++", "main.cpp", "-std=c++17", "-O2", "-o", executableName],
        fileSizeLimitBytes: compileFileLimitBytes,
        containerName: compileContainerName,
        memoryLimitMb: compileMemoryLimitMb,
        workDir,
      }),
      containerName: compileContainerName,
      input: "",
      timeoutMs: Math.max(compileTimeoutMs, timeLimitMs + 5000),
    });

    const compileInfrastructureError = getDockerInfrastructureError(
      compile,
      "compile",
    );
    if (compileInfrastructureError) throw compileInfrastructureError;

    if (compile.errorMessage) {
      return compileErrorRunResult({
        runtimeMs: compile.runtimeMs,
        errorMessage: compile.errorMessage,
      });
    }

    if (compile.timedOut) {
      return compileErrorRunResult({
        runtimeMs: compile.runtimeMs,
        errorMessage: "Docker 编译超时",
      });
    }

    if (compile.exitCode !== 0) {
      const compileMessage = compile.stderr || compile.stdout || "编译失败";
      return compileErrorRunResult({
        runtimeMs: compile.runtimeMs,
        errorMessage: normalizeDockerErrorMessage(compileMessage),
      });
    }

    const cases = [];

    for (const [index, input] of inputs.entries()) {
      const runContainerName = createContainerName();
      const run = await runProcess({
        args: buildDockerRunArgs({
          command: [`./${executableName}`],
          containerName: runContainerName,
          memoryLimitMb,
          workspaceReadOnly: true,
          workDir,
        }),
        containerName: runContainerName,
        input,
        timeoutMs: timeLimitMs,
      });
      const runInfrastructureError = getDockerInfrastructureError(run, "run");
      if (runInfrastructureError) throw runInfrastructureError;
      cases.push(
        buildRunCaseResult({
          caseIndex: index + 1,
          expectedOutput: expectedOutputs?.[index],
          input,
          processResult: {
            ...run,
            errorMessage: run.errorMessage
              ? normalizeDockerErrorMessage(run.errorMessage)
              : undefined,
            stderr: normalizeDockerErrorMessage(run.stderr),
          },
          runtimeErrorFallback:
            "程序运行时异常，可能触发了容器资源限制",
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
