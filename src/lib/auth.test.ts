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
      username: "alice",
    });

    vi.setSystemTime(new Date("2026-06-09T00:00:01.000Z"));
    vi.resetModules();
    process.env.SESSION_SECRET = "test-secret-that-is-long-enough-for-session-tests";
    const { readSessionToken } = await import("./auth");

    expect(readSessionToken(token)).toBeNull();
  });
});
