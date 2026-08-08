import { describe, expect, it } from "vitest";
import {
  assertProductionJudgeMode,
  shouldUseSecureSessionCookies,
  validateProductionEnv,
} from "./env";

const validProductionEnv = {
  APP_ORIGIN: "https://botcode.work",
  DATABASE_URL: "file:/www/oj/prisma/prod.db",
  JUDGE_CONCURRENCY: "1",
  JUDGE_DOCKER_IMAGE: "oj-cpp-judge",
  JUDGE_MEMORY_LIMIT_MB: "128",
  JUDGE_MODE: "docker",
  JUDGE_TIME_LIMIT_MS: "2000",
  NODE_ENV: "production",
  SESSION_SECRET: "a-very-long-random-session-secret-value",
  SESSION_COOKIE_SECURE: "true",
};

describe("production environment validation", () => {
  it("accepts a complete production Docker Judge environment", () => {
    expect(validateProductionEnv(validProductionEnv)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("rejects local Judge in production", () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      JUDGE_MODE: "local",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("生产环境禁止使用 local Judge，请设置 JUDGE_MODE=docker");
  });

  it("throws when production tries to use local Judge", () => {
    expect(() =>
      assertProductionJudgeMode({
        JUDGE_MODE: "local",
        NODE_ENV: "production",
      }),
    ).toThrow("生产环境禁止使用 local Judge，请设置 JUDGE_MODE=docker");
  });

  it("rejects weak default session secrets in production", () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      SESSION_SECRET: "replace-this-with-a-long-random-string",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("SESSION_SECRET 不能使用 .env.example 中的默认值");
  });

  it("requires a canonical public HTTPS application origin", () => {
    const missing = validateProductionEnv({
      ...validProductionEnv,
      APP_ORIGIN: "",
    });
    const insecure = validateProductionEnv({
      ...validProductionEnv,
      APP_ORIGIN: "http://botcode.work",
    });
    const withPath = validateProductionEnv({
      ...validProductionEnv,
      APP_ORIGIN: "https://botcode.work/login",
    });
    const ipOrigin = validateProductionEnv({
      ...validProductionEnv,
      APP_ORIGIN: "https://39.105.91.81",
    });

    expect(missing.errors).toContain("生产环境缺少环境变量 APP_ORIGIN");
    for (const result of [insecure, withPath, ipOrigin]) {
      expect(result.errors).toContain(
        "APP_ORIGIN 必须是无路径、参数、片段和端口的公网 HTTPS Origin，例如 https://botcode.work",
      );
    }
  });

  it("rejects disabled or malformed secure-cookie settings in production", () => {
    const disabled = validateProductionEnv({
      ...validProductionEnv,
      SESSION_COOKIE_SECURE: "false",
    });
    const malformed = validateProductionEnv({
      ...validProductionEnv,
      SESSION_COOKIE_SECURE: "sometimes",
    });

    expect(disabled.errors).toContain(
      "生产环境禁止设置 SESSION_COOKIE_SECURE=false",
    );
    expect(malformed.errors).toContain(
      "SESSION_COOKIE_SECURE 只能设置为 true 或 false",
    );
  });

  it("rejects relative SQLite database paths in production", () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      DATABASE_URL: "file:./prod.db",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "生产环境 SQLite DATABASE_URL 必须使用绝对路径，例如 file:/www/oj/prisma/prod.db，避免 standalone 解析到错误目录",
    );
  });

  it("rejects invalid positive integer settings", () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      JUDGE_CONCURRENCY: "0",
      JUDGE_MEMORY_LIMIT_MB: "-1",
      JUDGE_TIME_LIMIT_MS: "abc",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("JUDGE_CONCURRENCY 必须是大于等于 1 的整数");
    expect(result.errors).toContain("JUDGE_TIME_LIMIT_MS 必须是大于 0 的整数");
    expect(result.errors).toContain("JUDGE_MEMORY_LIMIT_MB 必须是大于 0 的整数");
  });

  it("rejects unsafe public listen hosts and invalid AI concurrency", () => {
    const result = validateProductionEnv({
      ...validProductionEnv,
      AI_ASSIST_MAX_CONCURRENCY: "0",
      OJ_LISTEN_HOST: "0.0.0.0",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("AI_ASSIST_MAX_CONCURRENCY 必须是大于 0 的整数");
    expect(result.errors).toContain("OJ_LISTEN_HOST 生产环境只能监听本机地址");
  });

  it("does not block local Judge outside production", () => {
    expect(() =>
      assertProductionJudgeMode({
        JUDGE_MODE: "local",
        NODE_ENV: "development",
      }),
    ).not.toThrow();
  });
});

describe("secure session cookie policy", () => {
  it("prefers the explicit setting and otherwise follows APP_ORIGIN", () => {
    expect(
      shouldUseSecureSessionCookies({
        APP_ORIGIN: "http://127.0.0.1:3000",
        SESSION_COOKIE_SECURE: "true",
      }),
    ).toBe(true);
    expect(
      shouldUseSecureSessionCookies({
        APP_ORIGIN: "https://botcode.work",
        SESSION_COOKIE_SECURE: "false",
      }),
    ).toBe(false);
    expect(
      shouldUseSecureSessionCookies({ APP_ORIGIN: "https://botcode.work" }),
    ).toBe(true);
    expect(
      shouldUseSecureSessionCookies({ APP_ORIGIN: "http://127.0.0.1:3000" }),
    ).toBe(false);
  });
});
