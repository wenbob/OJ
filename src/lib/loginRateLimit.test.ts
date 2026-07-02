import { describe, expect, it } from "vitest";
import {
  clearLoginFailures,
  getLoginRateLimitStatus,
  recordFailedLogin,
} from "./loginRateLimit";

describe("login rate limiting", () => {
  it("blocks a username and IP after repeated failed attempts", () => {
    const key = "127.0.0.1:admin";
    clearLoginFailures(key);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(getLoginRateLimitStatus(key, 1_000).limited).toBe(false);
      recordFailedLogin(key, 1_000 + attempt);
    }

    expect(getLoginRateLimitStatus(key, 2_000)).toMatchObject({
      limited: true,
    });

    clearLoginFailures(key);
    expect(getLoginRateLimitStatus(key, 2_001).limited).toBe(false);
  });
});
