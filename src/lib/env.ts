const DEFAULT_SESSION_SECRET = "replace-this-with-a-long-random-string";

export type RuntimeEnv = Record<string, string | undefined>;

export type EnvValidationResult = {
  ok: boolean;
  errors: string[];
};

function readPositiveInt(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isRelativeSqliteUrl(value: string) {
  if (!value.startsWith("file:")) return false;

  const filePath = value.slice("file:".length);
  if (filePath.startsWith("/")) return false;
  if (/^[A-Za-z]:[\\/]/.test(filePath)) return false;

  return true;
}

export function getJudgeMode(env: RuntimeEnv = process.env) {
  return (env.JUDGE_MODE ?? "local").trim().toLowerCase();
}

export function validateProductionEnv(env: RuntimeEnv = process.env): EnvValidationResult {
  const errors: string[] = [];
  const isProduction = env.NODE_ENV === "production";

  if (!isProduction) {
    return { ok: true, errors };
  }

  const requiredKeys = [
    "DATABASE_URL",
    "SESSION_SECRET",
    "JUDGE_MODE",
    "JUDGE_DOCKER_IMAGE",
    "JUDGE_CONCURRENCY",
    "JUDGE_TIME_LIMIT_MS",
    "JUDGE_MEMORY_LIMIT_MB",
  ] as const;

  for (const key of requiredKeys) {
    if (!env[key]?.trim()) {
      errors.push(`生产环境缺少环境变量 ${key}`);
    }
  }

  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  if (databaseUrl && isRelativeSqliteUrl(databaseUrl)) {
    errors.push(
      "生产环境 SQLite DATABASE_URL 必须使用绝对路径，例如 file:/www/oj/prisma/prod.db，避免 standalone 解析到错误目录",
    );
  }

  const sessionSecret = env.SESSION_SECRET?.trim() ?? "";
  if (!sessionSecret) {
    errors.push("SESSION_SECRET 不能为空");
  } else {
    if (sessionSecret === DEFAULT_SESSION_SECRET) {
      errors.push("SESSION_SECRET 不能使用 .env.example 中的默认值");
    }
    if (sessionSecret.length < 32) {
      errors.push("SESSION_SECRET 建议至少 32 位");
    }
  }

  if (getJudgeMode(env) !== "docker") {
    errors.push("生产环境禁止使用 local Judge，请设置 JUDGE_MODE=docker");
  }

  if (env.JUDGE_CONCURRENCY && readPositiveInt(env.JUDGE_CONCURRENCY) === null) {
    errors.push("JUDGE_CONCURRENCY 必须是大于等于 1 的整数");
  }

  if (env.JUDGE_TIME_LIMIT_MS && readPositiveInt(env.JUDGE_TIME_LIMIT_MS) === null) {
    errors.push("JUDGE_TIME_LIMIT_MS 必须是大于 0 的整数");
  }

  if (env.JUDGE_MEMORY_LIMIT_MB && readPositiveInt(env.JUDGE_MEMORY_LIMIT_MB) === null) {
    errors.push("JUDGE_MEMORY_LIMIT_MB 必须是大于 0 的整数");
  }

  if (
    env.DEEPSEEK_BASE_URL &&
    !env.DEEPSEEK_BASE_URL.trim().startsWith("https://")
  ) {
    errors.push("DEEPSEEK_BASE_URL 必须使用 https:// 地址");
  }

  return { ok: errors.length === 0, errors };
}

export function assertProductionEnv(env: RuntimeEnv = process.env) {
  const result = validateProductionEnv(env);
  if (!result.ok) {
    throw new Error(result.errors.join("；"));
  }
}

export function assertProductionJudgeMode(env: RuntimeEnv = process.env) {
  if (env.NODE_ENV === "production" && getJudgeMode(env) !== "docker") {
    throw new Error("生产环境禁止使用 local Judge，请设置 JUDGE_MODE=docker");
  }
}
