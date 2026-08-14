import { describe, expect, it } from "vitest";
import {
  getRemainingExamTime,
  getServerClockOffset,
} from "./ExamCountdown";

describe("exam countdown clock correction", () => {
  it("uses server time when the client clock is one hour ahead", () => {
    const serverNow = "2026-08-14T02:00:00.000Z";
    const clientNow = new Date("2026-08-14T03:00:00.000Z").getTime();
    const clockOffsetMs = getServerClockOffset(serverNow, clientNow);

    expect(
      getRemainingExamTime({
        clientNow,
        clockOffsetMs,
        endTime: new Date("2026-08-14T02:01:00.000Z").getTime(),
      }),
    ).toBe(60_000);
  });

  it("never returns a negative remaining time", () => {
    expect(
      getRemainingExamTime({
        clientNow: 2_000,
        clockOffsetMs: 0,
        endTime: 1_000,
      }),
    ).toBe(0);
  });

  it("falls back to the client clock for an invalid server timestamp", () => {
    expect(getServerClockOffset("invalid", 10_000)).toBe(0);
  });
});
