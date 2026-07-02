import { describe, expect, it } from "vitest";
import {
  clearAiAssistCooldowns,
  consumeAiAssistCooldown,
} from "./aiAssistRateLimit";

describe("AI assist rate limit", () => {
  it("allows the first request and blocks repeated requests within 20 seconds", () => {
    clearAiAssistCooldowns();

    const first = consumeAiAssistCooldown({
      userId: 1,
      problemId: 2,
      examId: null,
      mode: "hint",
      now: 1_000,
    });
    const second = consumeAiAssistCooldown({
      userId: 1,
      problemId: 2,
      examId: null,
      mode: "hint",
      now: 10_000,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSeconds).toBe(11);
  });

  it("separates cooldowns by problem", () => {
    clearAiAssistCooldowns();
    consumeAiAssistCooldown({
      userId: 1,
      problemId: 2,
      examId: null,
      mode: "hint",
      now: 1_000,
    });

    const otherProblem = consumeAiAssistCooldown({
      userId: 1,
      problemId: 3,
      examId: null,
      mode: "hint",
      now: 2_000,
    });

    expect(otherProblem.allowed).toBe(true);
  });
});
