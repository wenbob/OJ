import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAiAssistCooldowns,
  reserveAiAssistRequest,
  reserveAiProviderRequest,
} from "./aiAssistRateLimit";

describe("AI provider rate limit", () => {
  beforeEach(() => {
    clearAiAssistCooldowns();
  });

  it("does not start cooldown until an upstream request actually begins", () => {
    const first = reserveAiAssistRequest({
      cooldownSeconds: 20,
      now: 1_000,
      userId: 1,
    });
    expect(first.allowed).toBe(true);
    if (first.allowed) first.release();

    expect(
      reserveAiAssistRequest({
        cooldownSeconds: 20,
        now: 2_000,
        userId: 1,
      }).allowed,
    ).toBe(true);
  });

  it("uses the current configured interval after an upstream request starts", () => {
    const first = reserveAiAssistRequest({
      cooldownSeconds: 20,
      now: 1_000,
      userId: 1,
    });
    expect(first.allowed).toBe(true);
    if (first.allowed) {
      first.markProviderRequest(1_000);
      first.release();
    }

    expect(
      reserveAiAssistRequest({
        cooldownSeconds: 20,
        now: 10_000,
        userId: 1,
      }),
    ).toMatchObject({
      allowed: false,
      reason: "cooldown",
      retryAfterSeconds: 11,
    });
    expect(
      reserveAiAssistRequest({
        cooldownSeconds: 5,
        now: 10_000,
        userId: 1,
      }).allowed,
    ).toBe(true);
  });

  it("does not let one account bypass programming cooldown by changing tasks", () => {
    const first = reserveAiAssistRequest({
      cooldownSeconds: 20,
      now: 1_000,
      userId: 1,
    });
    if (first.allowed) {
      first.markProviderRequest(1_000);
      first.release();
    }

    expect(
      reserveAiAssistRequest({
        cooldownSeconds: 20,
        now: 2_000,
        userId: 1,
      }),
    ).toMatchObject({ allowed: false, reason: "cooldown" });
  });

  it("keeps programming and objective cooldowns independent", () => {
    const programming = reserveAiProviderRequest({
      accountId: 5,
      cooldownSeconds: 30,
      now: 1_000,
      profile: "programming",
    });
    if (programming.allowed) {
      programming.markProviderRequest(1_000);
      programming.release();
    }

    expect(
      reserveAiProviderRequest({
        accountId: 5,
        cooldownSeconds: 30,
        now: 2_000,
        profile: "objective",
      }).allowed,
    ).toBe(true);
  });

  it("allows only one in-flight request per account and profile", () => {
    const first = reserveAiAssistRequest({
      cooldownSeconds: 20,
      maxConcurrency: 2,
      userId: 1,
    });
    const second = reserveAiAssistRequest({
      cooldownSeconds: 20,
      maxConcurrency: 2,
      userId: 1,
    });

    expect(first.allowed).toBe(true);
    expect(second).toMatchObject({ allowed: false, reason: "user_busy" });
    if (first.allowed) first.release();
  });

  it("locks the same resource across different staff accounts", () => {
    const first = reserveAiProviderRequest({
      accountId: 1,
      cooldownSeconds: 30,
      profile: "objective",
      requestKey: "objective:10:1",
    });
    const second = reserveAiProviderRequest({
      accountId: 2,
      cooldownSeconds: 30,
      profile: "objective",
      requestKey: "objective:10:1",
    });

    expect(first.allowed).toBe(true);
    expect(second).toMatchObject({ allowed: false, reason: "request_busy" });
    if (first.allowed) first.release();
  });

  it("shares the global concurrency cap across profiles and roles", () => {
    const student = reserveAiAssistRequest({
      cooldownSeconds: 20,
      maxConcurrency: 2,
      userId: 1,
    });
    const teacher = reserveAiProviderRequest({
      accountId: 9,
      cooldownSeconds: 30,
      maxConcurrency: 2,
      profile: "programming",
      requestKey: "teacher-insight:7:30d",
    });
    const objective = reserveAiProviderRequest({
      accountId: 8,
      cooldownSeconds: 30,
      maxConcurrency: 2,
      profile: "objective",
      requestKey: "objective:10:1",
    });

    expect(student.allowed).toBe(true);
    expect(teacher.allowed).toBe(true);
    expect(objective).toMatchObject({
      allowed: false,
      reason: "server_busy",
    });
    if (student.allowed) student.release();
    if (teacher.allowed) teacher.release();
  });
});
