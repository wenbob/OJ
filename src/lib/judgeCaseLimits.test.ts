import { describe, expect, it } from "vitest";
import {
  getJudgeCasePayloadError,
  MAX_JUDGE_CASES,
} from "./judgeCaseLimits";

describe("judge case payload limits", () => {
  it("rejects excessive case counts before persistence or judging", () => {
    const cases = Array.from({ length: MAX_JUDGE_CASES + 1 }, () => ({
      input: "1",
      output: "1",
    }));
    expect(getJudgeCasePayloadError(cases)).toContain("100 组");
  });

  it("counts UTF-8 bytes across input and output", () => {
    expect(
      getJudgeCasePayloadError([
        { input: "数".repeat(90_000), output: "ok" },
      ]),
    ).toContain("256KB");
  });
});
