import { describe, expect, it } from "vitest";
import { convertRunResultToJudgeResult } from "./judge";

const testCases = [
  { input: "1 2", output: "3" },
  { input: "2 3", output: "5" },
];

describe("trial execution to formal judge conversion", () => {
  it("preserves formal Accepted and Wrong Answer case semantics", () => {
    const result = convertRunResultToJudgeResult(
      {
        cases: [
          {
            actualOutput: "3",
            caseIndex: 1,
            expectedOutput: "3",
            input: "1 2",
            runtimeMs: 2,
            status: "matched",
          },
          {
            actualOutput: "4",
            caseIndex: 2,
            errorMessage: "程序输出与标准输出不一致",
            expectedOutput: "5",
            input: "2 3",
            runtimeMs: 3,
            status: "mismatched",
          },
        ],
        errorMessage: "程序输出与标准输出不一致",
        runtimeMs: 5,
        status: "sample_failed",
      },
      testCases,
    );

    expect(result).toMatchObject({
      passedCount: 1,
      runtimeMs: 5,
      status: "Wrong Answer",
      totalCount: 2,
    });
    expect(result.caseResults.map((item) => item.status)).toEqual([
      "Accepted",
      "Wrong Answer",
    ]);
  });

  it("preserves formal compile errors without fabricating case results", () => {
    const result = convertRunResultToJudgeResult(
      {
        cases: [],
        errorMessage: "编译失败",
        runtimeMs: 10,
        status: "compile_error",
      },
      testCases,
    );

    expect(result).toEqual({
      caseResults: [],
      errorMessage: "编译失败",
      passedCount: 0,
      runtimeMs: 10,
      status: "Compile Error",
      totalCount: 2,
    });
  });
});
