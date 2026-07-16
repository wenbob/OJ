import { beforeEach, describe, expect, it } from "vitest";
import {
  clearProblemRunRateLimits,
  reserveProblemRun,
} from "./problemRunRateLimit";

describe("problem trial run rate limit", () => {
  beforeEach(() => clearProblemRunRateLimits());

  it("allows only one active run per user", () => {
    const first = reserveProblemRun({ now: 1000, userId: 7 });
    const second = reserveProblemRun({ now: 1000, userId: 7 });

    expect(first.allowed).toBe(true);
    expect(second).toMatchObject({ allowed: false, reason: "busy" });
    if (first.allowed) first.cancel();
  });

  it("starts a five-second cooldown only after a run completes", () => {
    const first = reserveProblemRun({ now: 1000, userId: 7 });
    expect(first.allowed).toBe(true);
    if (!first.allowed) return;
    first.complete(2000);

    expect(reserveProblemRun({ now: 3000, userId: 7 })).toMatchObject({
      allowed: false,
      reason: "cooldown",
      retryAfterSeconds: 4,
    });
    expect(reserveProblemRun({ now: 7000, userId: 7 }).allowed).toBe(true);
  });

  it("does not consume cooldown when a queued run is cancelled before starting", () => {
    const first = reserveProblemRun({ now: 1000, userId: 7 });
    expect(first.allowed).toBe(true);
    if (!first.allowed) return;
    first.cancel();

    expect(reserveProblemRun({ now: 1001, userId: 7 }).allowed).toBe(true);
  });
});
