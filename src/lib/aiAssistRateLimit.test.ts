import { describe, expect, it } from "vitest";
import {
  clearAiAssistCooldowns,
  consumeAiAssistCooldown,
  reserveAiAssistRequest,
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

  it("allows only one in-flight AI request per student", () => {
    clearAiAssistCooldowns();

    const first = reserveAiAssistRequest({ userId: 1, maxConcurrency: 2 });
    const second = reserveAiAssistRequest({ userId: 1, maxConcurrency: 2 });

    expect(first.allowed).toBe(true);
    expect(second).toMatchObject({ allowed: false, reason: "user_busy" });

    if (first.allowed) first.release();
    expect(reserveAiAssistRequest({ userId: 1, maxConcurrency: 2 }).allowed).toBe(true);
  });

  it("caps total concurrent AI requests", () => {
    clearAiAssistCooldowns();

    const first = reserveAiAssistRequest({ userId: 1, maxConcurrency: 2 });
    const second = reserveAiAssistRequest({ userId: 2, maxConcurrency: 2 });
    const third = reserveAiAssistRequest({ userId: 3, maxConcurrency: 2 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third).toMatchObject({ allowed: false, reason: "server_busy" });
  });
});
