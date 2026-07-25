import { afterEach, describe, expect, it, vi } from "vitest";

describe("session tokens", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    delete process.env.SESSION_SECRET;
  });

  it("rejects tokens older than the server-side max age", async () => {
    process.env.SESSION_SECRET = "test-secret-that-is-long-enough-for-session-tests";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    const { createSessionToken } = await import("./auth");
    const token = createSessionToken({
      id: 1,
      role: "student",
      sessionVersion: 4,
      username: "alice",
    });

    vi.setSystemTime(new Date("2026-06-09T00:00:01.000Z"));
    vi.resetModules();
    process.env.SESSION_SECRET = "test-secret-that-is-long-enough-for-session-tests";
    const { readSessionToken } = await import("./auth");

    expect(readSessionToken(token)).toBeNull();
  });

  it("round-trips the signed session version", async () => {
    process.env.SESSION_SECRET = "test-secret-that-is-long-enough-for-session-tests";
    const { createSessionToken, readSessionToken } = await import("./auth");
    const token = createSessionToken({
      id: 7,
      role: "student",
      sessionVersion: 12,
      username: "bob",
    });

    expect(readSessionToken(token)).toMatchObject({
      id: 7,
      role: "student",
      sessionVersion: 12,
      username: "bob",
    });
  });

  it("uses the dedicated teacher home and preserves the teacher role in sessions", async () => {
    process.env.SESSION_SECRET = "test-secret-that-is-long-enough-for-session-tests";
    const { createSessionToken, readSessionToken, roleHome } = await import("./auth");
    const token = createSessionToken({
      id: 9,
      role: "teacher",
      sessionVersion: 3,
      username: "coach",
    });

    expect(roleHome("teacher")).toBe("/teacher");
    expect(readSessionToken(token)).toMatchObject({
      id: 9,
      role: "teacher",
      sessionVersion: 3,
      username: "coach",
    });
  });
});
