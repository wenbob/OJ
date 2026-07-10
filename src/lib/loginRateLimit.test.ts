import { describe, expect, it } from "vitest";
import {
  clearLoginFailures,
  getLoginClientIp,
  getLoginRateLimitStatus,
  loginRateLimitKey,
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

  it("prefers the reverse proxy's real IP over a client-supplied forwarded chain", () => {
    const request = new Request("https://oj.example.com/api/auth/login", {
      headers: {
        "x-forwarded-for": "198.51.100.99, 203.0.113.10",
        "x-real-ip": "203.0.113.10",
      },
    });

    expect(getLoginClientIp(request)).toBe("203.0.113.10");
    expect(loginRateLimitKey(request, "Admin")).toBe("203.0.113.10:admin");
  });

  it("uses the closest forwarded address only as a local-development fallback", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/login", {
      headers: { "x-forwarded-for": "198.51.100.99, 127.0.0.1" },
    });

    expect(getLoginClientIp(request)).toBe("127.0.0.1");
  });
});
