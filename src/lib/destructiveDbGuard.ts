export const DESTRUCTIVE_DB_OVERRIDE = "I_UNDERSTAND_THIS_WILL_DELETE_OJ_DATA";

export type DestructiveDbEnv = Record<string, string | undefined>;

function isProductionDatabase(databaseUrl: string) {
  const normalized = databaseUrl.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/www/oj/prisma/prod.db");
}

export function validateDestructiveDbOperation(env: DestructiveDbEnv) {
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  const productionLike =
    env.NODE_ENV === "production" || isProductionDatabase(databaseUrl);
  const override =
    env.ALLOW_DESTRUCTIVE_DB_INIT === DESTRUCTIVE_DB_OVERRIDE;

  if (productionLike && !override) {
    return {
      ok: false,
      error:
        "拒绝执行破坏式数据库操作：当前环境像生产库。若确实要清库，必须显式设置 ALLOW_DESTRUCTIVE_DB_INIT=I_UNDERSTAND_THIS_WILL_DELETE_OJ_DATA。",
    };
  }

  return { ok: true, error: "" };
}

export function assertDestructiveDbOperationAllowed(
  env: DestructiveDbEnv = process.env,
) {
  const result = validateDestructiveDbOperation(env);
  if (!result.ok) {
    throw new Error(result.error);
  }
}
