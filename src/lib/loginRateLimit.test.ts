import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAllLoginFailures,
  clearAllLoginVerificationReservations,
  clearLoginFailures,
  getLoginClientIp,
  getLoginRateLimitBucketCount,
  getLoginRateLimitStatus,
  loginIpRateLimitKey,
  loginRateLimitKey,
  recordFailedLogin,
  recordFailedLoginForIp,
  reserveLoginVerification,
} from "./loginRateLimit";

const originalMaxBuckets = process.env.LOGIN_RATE_LIMIT_MAX_BUCKETS;

beforeEach(() => {
  clearAllLoginFailures();
  clearAllLoginVerificationReservations();
});

afterEach(() => {
  clearAllLoginFailures();
  clearAllLoginVerificationReservations();
  if (originalMaxBuckets === undefined) {
    delete process.env.LOGIN_RATE_LIMIT_MAX_BUCKETS;
  } else {
    process.env.LOGIN_RATE_LIMIT_MAX_BUCKETS = originalMaxBuckets;
  }
});

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
    expect(loginIpRateLimitKey(request)).toBe("ip:203.0.113.10");
  });

  it("uses the closest forwarded address only as a local-development fallback", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/login", {
      headers: { "x-forwarded-for": "198.51.100.99, 127.0.0.1" },
    });

    expect(getLoginClientIp(request)).toBe("127.0.0.1");
  });

  it("does not allocate buckets while checking untouched identities", () => {
    expect(getLoginRateLimitStatus("unknown:rotating-user").limited).toBe(false);
    expect(getLoginRateLimitBucketCount()).toBe(0);
  });

  it("blocks aggregate IP failures even when usernames rotate", () => {
    const ipKey = "ip:203.0.113.10";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      recordFailedLoginForIp(ipKey, 1_000 + attempt);
    }

    expect(getLoginRateLimitStatus(ipKey, 2_000).limited).toBe(true);
  });

  it("expires idle buckets and caps total in-memory identities", () => {
    recordFailedLogin("stale", 1_000);
    expect(
      getLoginRateLimitStatus("stale", 21 * 60 * 1000).limited,
    ).toBe(false);
    expect(getLoginRateLimitBucketCount()).toBe(0);

    process.env.LOGIN_RATE_LIMIT_MAX_BUCKETS = "3";
    recordFailedLogin("user-1", 2_000_001);
    recordFailedLogin("user-2", 2_000_002);
    recordFailedLogin("user-3", 2_000_003);
    recordFailedLogin("user-4", 2_000_004);

    expect(getLoginRateLimitBucketCount()).toBe(3);
    expect(getLoginRateLimitStatus("user-1", 2_000_005).limited).toBe(false);
    expect(getLoginRateLimitBucketCount()).toBe(3);
  });

  it("reserves bcrypt work atomically per account and releases idempotently", () => {
    const first = reserveLoginVerification("account:alice", "ip:local");
    const overlapping = reserveLoginVerification("account:alice", "ip:other");

    expect(first.allowed).toBe(true);
    expect(overlapping).toMatchObject({ allowed: false, retryAfterSeconds: 1 });

    first.release();
    first.release();
    const next = reserveLoginVerification("account:alice", "ip:local");
    expect(next.allowed).toBe(true);
    next.release();
  });
});
