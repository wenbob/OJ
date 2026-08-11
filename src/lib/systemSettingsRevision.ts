import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { systemSettingsEntries, type SystemSettings } from "@/lib/settings";

export const SYSTEM_SETTINGS_REVISION_KEY = "__systemSettingsRevision";
export const INITIAL_SYSTEM_SETTINGS_REVISION = "0";

export class StaleSystemSettingsError extends Error {
  constructor() {
    super("系统设置已被其他页面更新，请刷新后再保存");
    this.name = "StaleSystemSettingsError";
  }
}

export async function getSystemSettingsRevision() {
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: SYSTEM_SETTINGS_REVISION_KEY },
      select: { value: true },
    });
    return row?.value ?? INITIAL_SYSTEM_SETTINGS_REVISION;
  } catch {
    return INITIAL_SYSTEM_SETTINGS_REVISION;
  }
}

export async function saveSystemSettingsWithRevision({
  expectedRevision,
  settings,
}: {
  expectedRevision: string;
  settings: SystemSettings;
}) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.systemSetting.findUnique({
      where: { key: SYSTEM_SETTINGS_REVISION_KEY },
      select: { value: true },
    });
    const actualRevision =
      current?.value ?? INITIAL_SYSTEM_SETTINGS_REVISION;
    if (actualRevision !== expectedRevision) {
      throw new StaleSystemSettingsError();
    }

    const nextRevision = randomUUID();
    if (current) {
      const updated = await tx.systemSetting.updateMany({
        where: {
          key: SYSTEM_SETTINGS_REVISION_KEY,
          value: expectedRevision,
        },
        data: { value: nextRevision },
      });
      if (updated.count !== 1) throw new StaleSystemSettingsError();
    } else {
      try {
        await tx.systemSetting.create({
          data: {
            key: SYSTEM_SETTINGS_REVISION_KEY,
            value: nextRevision,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new StaleSystemSettingsError();
        }
        throw error;
      }
    }

    for (const item of systemSettingsEntries(settings)) {
      await tx.systemSetting.upsert({
        where: { key: item.key },
        update: { value: item.value },
        create: item,
      });
    }
    return nextRevision;
  });
}
