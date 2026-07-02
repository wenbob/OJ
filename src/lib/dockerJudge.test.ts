import { describe, expect, it } from "vitest";
import { normalizeDockerErrorMessage } from "./dockerJudge";

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
});
