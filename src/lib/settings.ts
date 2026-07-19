import { prisma } from "@/lib/prisma";
import { MAX_BROWSER_ICON_BYTES } from "@/lib/browserIdentity";

export const defaultCppTemplate = `#include <bits/stdc++.h>
using namespace std;

int main() {
    return 0;
}
`;

export const defaultSystemSettings = {
  siteName: "C++ OJ",
  siteSubtitle: "在线练习平台",
  browserTitle: "",
  browserIcon: "",
  studentNotice: "欢迎进入 C++ OJ 练习平台",
  adminNotice: "欢迎进入后台管理",
  defaultCppTemplate,
  defaultTimeLimitMs: "2000",
  defaultMemoryLimitMb: "128",
  allowStudentRegister: "false",
  aiPracticeEnabled: "false",
  aiConversationRetentionDays: "180",
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
  const browserIcon = validateBrowserIcon(settings.browserIcon)
    ? defaultSystemSettings.browserIcon
    : settings.browserIcon;
  return {
    siteName: settings.siteName,
    siteSubtitle: settings.siteSubtitle,
    browserTitle: settings.browserTitle,
    browserIcon,
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
  if (settings.browserTitle.trim().length > 60) {
    return "浏览器标签名称不能超过 60 个字";
  }
  const browserIconError = validateBrowserIcon(settings.browserIcon);
  if (browserIconError) return browserIconError;
  if (positiveInt(settings.defaultTimeLimitMs, 0) <= 0) {
    return "默认评测时间限制必须大于 0";
  }
  if (positiveInt(settings.defaultMemoryLimitMb, 0) <= 0) {
    return "默认评测内存限制必须大于 0";
  }
  if (!settings.defaultCppTemplate.trim()) return "默认 C++ 代码模板不能为空";
  if (!["0", "30", "90", "180", "365"].includes(settings.aiConversationRetentionDays)) {
    return "AI 对话保留时间不合法";
  }
  return "";
}

export function validateBrowserIcon(value: string) {
  if (!value) return "";
  const match = value.match(
    /^data:(image\/png|image\/x-icon|image\/vnd\.microsoft\.icon);base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match) return "浏览器标签图标仅支持 PNG 或 ICO 文件";

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) return "浏览器标签图标内容为空";
  if (bytes.length > MAX_BROWSER_ICON_BYTES) {
    return "浏览器标签图标不能超过 256KB";
  }

  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isIco =
    bytes.length >= 4 &&
    bytes[0] === 0 &&
    bytes[1] === 0 &&
    bytes[2] === 1 &&
    bytes[3] === 0;
  if (match[1] === "image/png" ? !isPng : !isIco) {
    return "浏览器标签图标文件内容与格式不匹配";
  }
  return "";
}

export function systemSettingsEntries(settings: SystemSettings) {
  return settingKeys.map((key) => ({ key, value: settings[key] }));
}
