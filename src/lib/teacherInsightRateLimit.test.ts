import { beforeEach, describe, expect, it } from "vitest";
import { clearAiAssistCooldowns } from "./aiAssistRateLimit";
import {
  clearTeacherInsightRateLimits,
  reserveTeacherInsight,
} from "./teacherInsightRateLimit";

describe("teacher insight rate limit", () => {
  beforeEach(() => {
    clearAiAssistCooldowns();
    clearTeacherInsightRateLimits();
  });

  it("blocks immediate regeneration for the same admin and student", () => {
    const first = reserveTeacherInsight({
      adminId: 1,
      force: false,
      now: 1_000,
      studentId: 2,
    });
    expect(first.allowed).toBe(true);
    if (first.allowed) first.release();

    const repeated = reserveTeacherInsight({
      adminId: 1,
      force: true,
      now: 2_000,
      studentId: 2,
    });
    expect(repeated).toMatchObject({
      allowed: false,
      reason: "cooldown",
      retryAfterSeconds: 29,
    });
  });

  it("allows regeneration after 30 seconds", () => {
    const first = reserveTeacherInsight({
      adminId: 1,
      force: false,
      now: 1_000,
      studentId: 2,
    });
    if (first.allowed) first.release();
    const later = reserveTeacherInsight({
      adminId: 1,
      force: true,
      now: 31_000,
      studentId: 2,
    });
    expect(later.allowed).toBe(true);
  });
});
