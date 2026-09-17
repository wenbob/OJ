import { afterEach, describe, expect, it, vi } from "vitest";
import { reserveFeedbackSubmission } from "@/lib/feedbackRateLimit";

afterEach(() => vi.useRealTimers());

describe("feedback submission reservations", () => {
  it("blocks concurrent submission and releases a failed request without cooldown", () => {
    const first = reserveFeedbackSubmission(9001);
    expect(() => reserveFeedbackSubmission(9001)).toThrow("正在提交");
    first.release(false);
    const retry = reserveFeedbackSubmission(9001);
    retry.release(false);
    retry.release(true); // release is idempotent
    reserveFeedbackSubmission(9001).release(false);
  });

  it("starts the 30-second cooldown only after success", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T00:00:00Z"));
    const request = reserveFeedbackSubmission(9002);
    vi.advanceTimersByTime(10_000);
    request.release(true);
    expect(() => reserveFeedbackSubmission(9002)).toThrow("刚刚已提交");
    vi.advanceTimersByTime(29_999);
    expect(() => reserveFeedbackSubmission(9002)).toThrow();
    vi.advanceTimersByTime(1);
    reserveFeedbackSubmission(9002).release(false);
  });

  it("bounds global upload/conversion concurrency without blocking other readers", () => {
    const first = reserveFeedbackSubmission(9003);
    const second = reserveFeedbackSubmission(9004);
    try {
      expect(() => reserveFeedbackSubmission(9005)).toThrow("繁忙");
    } finally {
      first.release(false); second.release(false);
    }
    reserveFeedbackSubmission(9005).release(false);
  });
});
