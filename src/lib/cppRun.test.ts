import { describe, expect, it } from "vitest";
import {
  buildRunCaseResult,
  summarizeRunCases,
  truncateCppOutput,
  type CppProcessResult,
} from "./cppRun";

function processResult(
  overrides: Partial<CppProcessResult> = {},
): CppProcessResult {
  return {
    exitCode: 0,
    runtimeMs: 3,
    stderr: "",
    stdout: "3\n",
    timedOut: false,
    ...overrides,
  };
}

describe("C++ trial run result mapping", () => {
  it("normalizes line endings and trailing spaces when comparing samples", () => {
    const result = buildRunCaseResult({
      caseIndex: 1,
      expectedOutput: "3\n",
      input: "1 2",
      processResult: processResult({ stdout: "3  \r\n" }),
      timeLimitMs: 1000,
    });

    expect(result.status).toBe("matched");
  });

  it("marks a different sample output without changing custom-run semantics", () => {
    const mismatched = buildRunCaseResult({
      caseIndex: 1,
      expectedOutput: "4",
      input: "1 2",
      processResult: processResult(),
      timeLimitMs: 1000,
    });
    const custom = buildRunCaseResult({
      caseIndex: 1,
      input: "1 2",
      processResult: processResult(),
      timeLimitMs: 1000,
    });

    expect(mismatched.status).toBe("mismatched");
    expect(custom.status).toBe("completed");
    expect(custom.expectedOutput).toBeUndefined();
  });

  it("maps timeout and runtime failures to dedicated trial statuses", () => {
    const timedOut = buildRunCaseResult({
      caseIndex: 1,
      input: "",
      processResult: processResult({ timedOut: true }),
      timeLimitMs: 1500,
    });
    const runtimeError = buildRunCaseResult({
      caseIndex: 1,
      input: "",
      processResult: processResult({ exitCode: 1, stderr: "boom" }),
      timeLimitMs: 1500,
    });

    expect(timedOut.status).toBe("time_limit_exceeded");
    expect(timedOut.errorMessage).toContain("1500ms");
    expect(runtimeError.status).toBe("runtime_error");
    expect(runtimeError.errorMessage).toBe("boom");
  });

  it("summarizes all matched samples and truncates oversized output", () => {
    const matched = buildRunCaseResult({
      caseIndex: 1,
      expectedOutput: "3",
      input: "1 2",
      processResult: processResult(),
      timeLimitMs: 1000,
    });

    expect(summarizeRunCases({ cases: [matched], compared: true })).toMatchObject({
      runtimeMs: 3,
      status: "sample_passed",
    });
    expect(truncateCppOutput("abcdef", 3)).toContain("已截断");
  });
});
