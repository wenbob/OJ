import { prisma } from "@/lib/prisma";

export const defaultCppTemplate = `#include <bits/stdc++.h>
using namespace std;

int main() {
    return 0;
}
`;

export const defaultSystemSettings = {
  siteName: "C++ OJ",
  siteSubtitle: "在线练习平台",
  studentNotice: "欢迎进入 C++ OJ 练习平台",
  adminNotice: "欢迎进入后台管理",
  defaultCppTemplate,
  defaultTimeLimitMs: "2000",
  defaultMemoryLimitMb: "128",
  allowStudentRegister: "false",
  aiPracticeEnabled: "false",
};

export type SystemSettingKey = keyof typeof defaultSystemSettings;

export type SystemSettings = typeof defaultSystemSettings;

const settingKeys = Object.keys(defaultSystemSettings) as SystemSettingKey[];

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function boolSetting(value: string) {
  return value === "true";
}

export async function getSetting<K extends SystemSettingKey>(
  key: K,
  fallback = defaultSystemSettings[key],
) {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    return setting?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getAllSystemSettings(): Promise<SystemSettings> {
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: settingKeys } },
    });
    const settings = { ...defaultSystemSettings };
    for (const row of rows) {
      if (row.key in settings) {
        settings[row.key as SystemSettingKey] = row.value;
      }
    }
    return settings;
  } catch {
    return { ...defaultSystemSettings };
  }
}

export async function getPublicSettings() {
  const settings = await getAllSystemSettings();
  return {
    siteName: settings.siteName,
    siteSubtitle: settings.siteSubtitle,
    studentNotice: settings.studentNotice,
  };
}

export async function getAdminDisplaySettings() {
  const settings = await getAllSystemSettings();
  return {
    siteName: settings.siteName,
    adminNotice: settings.adminNotice,
  };
}

export async function getDefaultCppTemplate() {
  const value = await getSetting("defaultCppTemplate");
  return value.trim() ? value : defaultCppTemplate;
}

export async function getJudgeDefaultSettings() {
  const [timeLimitSetting, memoryLimitSetting] = await Promise.all([
    getSetting("defaultTimeLimitMs", process.env.JUDGE_TIME_LIMIT_MS ?? "2000"),
    getSetting("defaultMemoryLimitMb", process.env.JUDGE_MEMORY_LIMIT_MB ?? "128"),
  ]);
  return {
    timeLimitMs: positiveInt(
      timeLimitSetting,
      positiveInt(process.env.JUDGE_TIME_LIMIT_MS, 2000),
    ),
    memoryLimitMb: positiveInt(
      memoryLimitSetting,
      positiveInt(process.env.JUDGE_MEMORY_LIMIT_MB, 128),
    ),
  };
}

export function normalizeSystemSettingsPayload(body: unknown): SystemSettings {
  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const settings = { ...defaultSystemSettings };
  for (const key of settingKeys) {
    const value = record[key];
    if (key === "allowStudentRegister" || key === "aiPracticeEnabled") {
      settings[key] = value === true || value === "true" ? "true" : "false";
    } else {
      settings[key] = typeof value === "string" ? value : "";
    }
  }
  return settings;
}

export function validateSystemSettings(settings: SystemSettings) {
  if (!settings.siteName.trim()) return "平台名称不能为空";
  if (positiveInt(settings.defaultTimeLimitMs, 0) <= 0) {
    return "默认评测时间限制必须大于 0";
  }
  if (positiveInt(settings.defaultMemoryLimitMb, 0) <= 0) {
    return "默认评测内存限制必须大于 0";
  }
  if (!settings.defaultCppTemplate.trim()) return "默认 C++ 代码模板不能为空";
  return "";
}

export function systemSettingsEntries(settings: SystemSettings) {
  return settingKeys.map((key) => ({ key, value: settings[key] }));
}
