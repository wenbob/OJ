import { beforeEach, describe, expect, it } from "vitest";
import { clearAiAssistCooldowns } from "@/lib/aiAssistRateLimit";
import {
  clearObjectiveAiExplanationRateLimits,
  reserveObjectiveAiExplanation,
} from "@/lib/objectiveAiExplanationRateLimit";

describe("objective AI explanation rate limit", () => {
  beforeEach(() => {
    clearAiAssistCooldowns();
    clearObjectiveAiExplanationRateLimits();
  });

  it("applies one 30 second cooldown across a staff account", () => {
    const first = reserveObjectiveAiExplanation({
      itemIndex: 1,
      now: 1_000,
      problemId: 10,
      staffId: 5,
    });
    expect(first.allowed).toBe(true);
    if (first.allowed) first.release();

    expect(
      reserveObjectiveAiExplanation({
        itemIndex: 2,
        now: 2_000,
        problemId: 20,
        staffId: 5,
      }),
    ).toMatchObject({
      allowed: false,
      reason: "cooldown",
      retryAfterSeconds: 29,
    });
  });

  it("locks the same subquestion while generation is active", () => {
    const first = reserveObjectiveAiExplanation({
      itemIndex: 1,
      now: 1_000,
      problemId: 10,
      staffId: 5,
    });
    expect(first.allowed).toBe(true);

    expect(
      reserveObjectiveAiExplanation({
        itemIndex: 1,
        now: 1_000,
        problemId: 10,
        staffId: 6,
      }),
    ).toMatchObject({ allowed: false, reason: "busy" });
    if (first.allowed) first.release();
  });

  it("allows a staff account again after 30 seconds", () => {
    const first = reserveObjectiveAiExplanation({
      itemIndex: 1,
      now: 1_000,
      problemId: 10,
      staffId: 5,
    });
    if (first.allowed) first.release();
    const later = reserveObjectiveAiExplanation({
      itemIndex: 2,
      now: 31_000,
      problemId: 10,
      staffId: 5,
    });
    expect(later.allowed).toBe(true);
    if (later.allowed) later.release();
  });
});
