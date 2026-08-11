import { describe, expect, it } from "vitest";
import {
  buildDockerRunArgs,
  isDockerInfrastructureResult,
  getJudgeTaskBudgetMs,
  normalizeDockerErrorMessage,
  shouldStopAfterRunCase,
} from "./dockerJudge";

describe("normalizeDockerErrorMessage", () => {
  it("hides low-level Docker API connection errors from students", () => {
    const message = normalizeDockerErrorMessage(
      "failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine",
    );

    expect(message).toContain("评测服务暂时没有启动");
    expect(message).not.toContain("docker API");
    expect(message).not.toContain("npipe");
  });

  it("keeps ordinary compiler errors unchanged", () => {
    const message = "main.cpp:3:1: error: expected ';'";

    expect(normalizeDockerErrorMessage(message)).toBe(message);
  });

  it("classifies Docker CLI failures separately from student compiler errors", () => {
    const base = {
      errorMessage: undefined,
      exitCode: 1,
      runtimeMs: 10,
      stderr: "main.cpp:1: error: expected ';'",
      stdout: "",
      timedOut: false,
    };

    expect(isDockerInfrastructureResult(base, "compile")).toBe(false);
    expect(
      isDockerInfrastructureResult(
        { ...base, exitCode: 125, stderr: "docker: Error response from daemon" },
        "compile",
      ),
    ).toBe(true);
    expect(
      isDockerInfrastructureResult(
        {
          ...base,
          errorMessage: normalizeDockerErrorMessage("spawn docker ENOENT"),
          exitCode: null,
          stderr: "",
        },
        "compile",
      ),
    ).toBe(true);
    expect(
      isDockerInfrastructureResult(
        {
          ...base,
          exitCode: 1,
          stderr: "docker: Error response from daemon",
        },
        "run",
      ),
    ).toBe(false);
  });

  it("runs untrusted programs without swap and as an unprivileged user", () => {
    const args = buildDockerRunArgs({
      command: ["./main"],
      containerName: "oj-cpp-test",
      memoryLimitMb: 128,
      workDir: "/tmp/cpp-oj-test",
    });

    expect(args).toContain("--memory-swap");
    expect(args).toContain("128m");
    expect(args).toContain("--user");
    expect(args).toContain("65534:65534");
    expect(args).toContain("--network");
    expect(args).toContain("none");
    expect(args).toContain("/tmp/cpp-oj-test:/workspace:rw");
  });

  it("mounts the workspace read-only for student program execution", () => {
    const args = buildDockerRunArgs({
      command: ["./main"],
      containerName: "oj-cpp-test",
      memoryLimitMb: 128,
      workspaceReadOnly: true,
      workDir: "/tmp/cpp-oj-test",
    });

    expect(args).toContain("/tmp/cpp-oj-test:/workspace:ro");
  });

  it("applies a file-size limit to compiler output", () => {
    const args = buildDockerRunArgs({
      command: ["g++", "main.cpp", "-o", "main"],
      containerName: "oj-cpp-test",
      fileSizeLimitBytes: 64 * 1024 * 1024,
      memoryLimitMb: 512,
      workDir: "/tmp/cpp-oj-test",
    });

    expect(args).toContain("--ulimit");
    expect(args).toContain("fsize=67108864:67108864");
  });

  it("caps the whole judge task budget and stops after terminal run failures", () => {
    expect(getJudgeTaskBudgetMs("999999")).toBe(180_000);
    expect(getJudgeTaskBudgetMs("invalid")).toBe(60_000);
    expect(shouldStopAfterRunCase("time_limit_exceeded")).toBe(true);
    expect(shouldStopAfterRunCase("runtime_error")).toBe(true);
    expect(shouldStopAfterRunCase("mismatched")).toBe(false);
  });

  it("classifies an unverified container cleanup as infrastructure failure", () => {
    expect(
      isDockerInfrastructureResult(
        {
          errorMessage: "评测容器清理失败",
          exitCode: null,
          runtimeMs: 10,
          stderr: "",
          stdout: "",
          timedOut: true,
        },
        "run",
      ),
    ).toBe(true);
  });
});
