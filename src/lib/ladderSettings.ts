import { randomUUID } from "node:crypto";
import { cache } from "react";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { DEFAULT_RANK_TIERS, tiersFromThresholds, validateTierThresholds, type LadderSettings } from "./ladderShared";
import { LadderError, ladderTransaction } from "./ladderTransaction";

export const LADDER_SETTINGS_KEY = "__ladderTierConfig";
type Db = typeof prisma | Prisma.TransactionClient;
export class LadderSettingsConflictError extends LadderError {
  constructor() { super("段位门槛已被其他页面更新，请重新加载后再保存"); }
}

export async function getLadderSettings(db: Db = prisma): Promise<LadderSettings> {
  const row = await db.systemSetting.findUnique({ where: { key: LADDER_SETTINGS_KEY }, select: { value: true } });
  if (!row) return { revision: "0", tiers: DEFAULT_RANK_TIERS.map((tier) => ({ ...tier })) };
  const data = JSON.parse(row.value) as { revision?: unknown; minPoints?: unknown };
  if (typeof data.revision !== "string" || !data.revision || validateTierThresholds(data.minPoints)) throw new Error("段位配置无效");
  return { revision: data.revision, tiers: tiersFromThresholds(data.minPoints as number[]) };
}

// Only deduplicate within one server render; changes are read on the next request.
export const getLadderSettingsForRender = cache(() => getLadderSettings());

export async function saveLadderSettings(expectedRevision: string, minPoints: number[], db: PrismaClient = prisma): Promise<LadderSettings> {
  const validation = validateTierThresholds(minPoints);
  if (validation) throw new LadderError(validation, 400);
  return ladderTransaction(async (tx) => {
    const row = await tx.systemSetting.findUnique({ where: { key: LADDER_SETTINGS_KEY }, select: { value: true } });
    const current = row ? await getLadderSettings(tx) : { revision: "0" };
    if (current.revision !== expectedRevision) throw new LadderSettingsConflictError();
    const revision = randomUUID();
    const value = JSON.stringify({ revision, minPoints });
    if (row) {
      const result = await tx.systemSetting.updateMany({ where: { key: LADDER_SETTINGS_KEY, value: row.value }, data: { value } });
      if (result.count !== 1) throw new LadderSettingsConflictError();
    } else {
      await tx.systemSetting.create({ data: { key: LADDER_SETTINGS_KEY, value } });
    }
    return { revision, tiers: tiersFromThresholds(minPoints) };
  }, db);
}
