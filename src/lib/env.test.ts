import { describe, expect, it } from "vitest";
import {
  assertProductionJudgeMode,
  validateProductionEnv,
} from "./env";

const validProductionEnv = {
  DATABASE_URL: "file:/www/oj/prisma/prod.db",
  JUDGE_CONCURRENCY: "1",
  JUDGE_DOCKER_IMAGE: "oj-cpp-judge",
  JUDGE_MEMORY_LIMIT_MB: "128",
  JUDGE_MODE: "docker",
  JUDGE_TIME_LIMIT_MS: "2000",
  NODE_ENV: "production",
  SESSION_SECRET: "a-very-long-random-session-secret-value",
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
