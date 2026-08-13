import { prisma } from "@/lib/prisma";
import { MAX_BROWSER_ICON_BYTES } from "@/lib/browserIdentity";
import {
  MAX_PUBLIC_SECURITY_RECORD_ICON_BYTES,
  normalizeIcpRecordNumber,
  normalizePublicSecurityRecordNumber,
  validateIcpRecordNumber,
  validatePublicSecurityRecordNumber,
} from "@/lib/siteCompliance";
import { cache } from "react";

export const defaultCppTemplate = `#include <bits/stdc++.h>
using namespace std;

int main() {
    return 0;
}
`;

export const AI_CUSTOM_PROMPT_MAX_CHARS = 4_000;

export const defaultAiProgrammingOverviewPrompt = `帮助学生理解这道题，不读取或猜测学生代码。

请按三个部分回答：
题目分析：用 2 到 4 句讲清楚输入是什么、要找到什么、最后输出什么。
解题步骤：根据题目难度决定 3 到 6 步，每一步用“第一步、第二步……”开头，讲清楚具体要想什么、比较什么、记录什么。
小提醒：最后只提醒一个最容易错的地方。`;

export const defaultAiProgrammingNextStepPrompt = `根据当前题目和学生已经写好的代码，只告诉学生现在最应该完成的一个小步骤。

先用一句话说学生已经做到哪里，再用 2 到 4 句说明下一步要检查、比较、记录或补充什么。不要继续讲后面的完整解法。`;

export const defaultAiProgrammingCodeReviewPrompt = `检查学生当前代码。

最多指出三个真正影响结果的问题。每个问题必须说清楚“第几行、哪里不对、为什么会出问题、学生应该检查什么”。只允许说行号和自然语言问题，不要复述该行源码、变量表达式或正确写法。如果暂时看不出错误，就说明已经完成了什么，并只给下一项检查方向。`;

export const defaultAiProgrammingQuestionPrompt = `先判断学生本次问题是否与当前题目、当前代码或当前解法直接相关。

如果无关，只能原样返回系统规定的无关问题回复。如果相关，就结合当前代码和历史对话回答学生现在问的这一小点。只回答当前这一问，不扩展成完整解法。`;

export const defaultAiObjectiveExplanationPrompt = `请使用简短、清楚、适合学生阅读的中文解释这道选择判断题。

先说明整体判断思路，再按原顺序解释每个选项：正确项说明为什么正确，错误项逐一指出错在哪里。最后用一句容易记住的话总结知识点。专业术语首次出现时要顺手解释。允许少量 Markdown、行内代码和 LaTeX，但不要使用表格。`;

export const defaultSystemSettings = {
  siteName: "C++ OJ",
  siteSubtitle: "在线练习平台",
  browserTitle: "",
  browserIcon: "",
  icpRecordNumber: "",
  publicSecurityRecordNumber: "",
  publicSecurityRecordIcon: "",
  studentNotice: "欢迎进入 C++ OJ 练习平台",
  adminNotice: "欢迎进入后台管理",
  defaultCppTemplate,
  defaultTimeLimitMs: "2000",
  defaultMemoryLimitMb: "128",
  allowStudentRegister: "false",
  aiPracticeEnabled: "false",
  aiObjectiveExplanationEnabled: "false",
  aiStudentObjectiveExplanationEnabled: "false",
  aiStaffProgrammingAssistEnabled: "false",
  aiConversationRetentionDays: "180",
  aiProvider: "deepseek",
  aiBaseUrl: "https://api.deepseek.com",
  aiModel: "deepseek-v4-pro",
  aiThinkingMode: "enabled",
  aiCustomThinkingProtocol: "none",
  aiObjectiveProvider: "deepseek",
  aiObjectiveBaseUrl: "https://api.deepseek.com",
  aiObjectiveModel: "deepseek-v4-pro",
  aiObjectiveThinkingMode: "enabled",
  aiObjectiveCustomThinkingProtocol: "none",
  aiProgrammingOverviewPrompt: defaultAiProgrammingOverviewPrompt,
  aiProgrammingNextStepPrompt: defaultAiProgrammingNextStepPrompt,
  aiProgrammingCodeReviewPrompt: defaultAiProgrammingCodeReviewPrompt,
  aiProgrammingQuestionPrompt: defaultAiProgrammingQuestionPrompt,
  aiObjectiveExplanationPrompt: defaultAiObjectiveExplanationPrompt,
  aiProgrammingStudentCooldownSeconds: "20",
  aiProgrammingTeacherCooldownSeconds: "30",
  aiProgrammingAdminCooldownSeconds: "30",
  aiObjectiveTeacherCooldownSeconds: "30",
  aiObjectiveAdminCooldownSeconds: "30",
  aiObjectiveStudentCooldownSeconds: "30",
};

export type SystemSettingKey = keyof typeof defaultSystemSettings;

export type SystemSettings = typeof defaultSystemSettings;

const settingKeys = Object.keys(defaultSystemSettings) as SystemSettingKey[];

export const AI_COOLDOWN_MIN_SECONDS = 5;
export const AI_COOLDOWN_MAX_SECONDS = 600;

const backwardCompatibleAiSettingKeys = new Set<SystemSettingKey>([
  "aiObjectiveProvider",
  "aiObjectiveBaseUrl",
  "aiObjectiveModel",
  "aiObjectiveThinkingMode",
  "aiObjectiveCustomThinkingProtocol",
  "aiProgrammingOverviewPrompt",
  "aiProgrammingNextStepPrompt",
  "aiProgrammingCodeReviewPrompt",
  "aiProgrammingQuestionPrompt",
  "aiObjectiveExplanationPrompt",
  "aiProgrammingStudentCooldownSeconds",
  "aiProgrammingTeacherCooldownSeconds",
  "aiProgrammingAdminCooldownSeconds",
  "aiObjectiveTeacherCooldownSeconds",
  "aiObjectiveAdminCooldownSeconds",
  "aiObjectiveStudentCooldownSeconds",
]);

const aiCustomPromptKeys = new Set<SystemSettingKey>([
  "aiProgrammingOverviewPrompt",
  "aiProgrammingNextStepPrompt",
  "aiProgrammingCodeReviewPrompt",
  "aiProgrammingQuestionPrompt",
  "aiObjectiveExplanationPrompt",
]);

export type AiProgrammingPromptMode =
  | "overview"
  | "next_step"
  | "code_review"
  | "question";

export const aiProgrammingPromptSettingKeys = {
  overview: "aiProgrammingOverviewPrompt",
  next_step: "aiProgrammingNextStepPrompt",
  code_review: "aiProgrammingCodeReviewPrompt",
  question: "aiProgrammingQuestionPrompt",
} as const satisfies Record<AiProgrammingPromptMode, SystemSettingKey>;

export function normalizeAiCustomPrompt(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

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

export const getPublicSettings = cache(async function getPublicSettings() {
  const settings = await getAllSystemSettings();
  const browserIcon = validateBrowserIcon(settings.browserIcon)
    ? defaultSystemSettings.browserIcon
    : settings.browserIcon;
  const icpRecordNumber = normalizeIcpRecordNumber(settings.icpRecordNumber);
  const publicSecurityRecordNumber = normalizePublicSecurityRecordNumber(
    settings.publicSecurityRecordNumber,
  );
  const hasValidIcpRecord =
    Boolean(icpRecordNumber) && !validateIcpRecordNumber(icpRecordNumber);
  const hasValidPublicSecurityRecord =
    Boolean(publicSecurityRecordNumber && settings.publicSecurityRecordIcon) &&
    !validatePublicSecurityRecordNumber(publicSecurityRecordNumber) &&
    !validatePublicSecurityRecordIcon(settings.publicSecurityRecordIcon);
  return {
    siteName: settings.siteName,
    siteSubtitle: settings.siteSubtitle,
    browserTitle: settings.browserTitle,
    browserIcon,
    icpRecordNumber: hasValidIcpRecord ? icpRecordNumber : "",
    publicSecurityRecordNumber: hasValidPublicSecurityRecord
      ? publicSecurityRecordNumber
      : "",
    publicSecurityRecordIcon: hasValidPublicSecurityRecord
      ? settings.publicSecurityRecordIcon
      : "",
    studentNotice: settings.studentNotice,
  };
});

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
    if (value === undefined && backwardCompatibleAiSettingKeys.has(key)) {
      continue;
    }
    if (
      key === "allowStudentRegister" ||
      key === "aiPracticeEnabled" ||
      key === "aiObjectiveExplanationEnabled" ||
      key === "aiStudentObjectiveExplanationEnabled" ||
      key === "aiStaffProgrammingAssistEnabled"
    ) {
      settings[key] = value === true || value === "true" ? "true" : "false";
    } else if (key === "icpRecordNumber") {
      settings[key] =
        typeof value === "string" ? normalizeIcpRecordNumber(value) : "";
    } else if (key === "publicSecurityRecordNumber") {
      settings[key] =
        typeof value === "string"
          ? normalizePublicSecurityRecordNumber(value)
          : "";
    } else {
      settings[key] =
        typeof value === "string"
          ? aiCustomPromptKeys.has(key)
            ? normalizeAiCustomPrompt(value)
            : value
          : "";
    }
  }
  if (record.aiObjectiveProvider === undefined) {
    settings.aiObjectiveProvider = settings.aiProvider;
  }
  if (record.aiObjectiveBaseUrl === undefined) {
    settings.aiObjectiveBaseUrl = settings.aiBaseUrl;
  }
  if (record.aiObjectiveModel === undefined) {
    settings.aiObjectiveModel = settings.aiModel;
  }
  if (record.aiObjectiveThinkingMode === undefined) {
    settings.aiObjectiveThinkingMode = settings.aiThinkingMode;
  }
  if (record.aiObjectiveCustomThinkingProtocol === undefined) {
    settings.aiObjectiveCustomThinkingProtocol =
      settings.aiCustomThinkingProtocol;
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
  const icpRecordError = validateIcpRecordNumber(settings.icpRecordNumber);
  if (icpRecordError) return icpRecordError;
  const publicSecurityRecordError = validatePublicSecurityRecordNumber(
    settings.publicSecurityRecordNumber,
  );
  if (publicSecurityRecordError) return publicSecurityRecordError;
  const publicSecurityRecordIconError = validatePublicSecurityRecordIcon(
    settings.publicSecurityRecordIcon,
  );
  if (publicSecurityRecordIconError) return publicSecurityRecordIconError;
  if (
    Boolean(settings.publicSecurityRecordNumber) !==
    Boolean(settings.publicSecurityRecordIcon)
  ) {
    return "公安备案号与公安备案图标必须同时填写或同时留空";
  }
  if (positiveInt(settings.defaultTimeLimitMs, 0) <= 0) {
    return "默认评测时间限制必须大于 0";
  }
  if (positiveInt(settings.defaultMemoryLimitMb, 0) <= 0) {
    return "默认评测内存限制必须大于 0";
  }
  if (!settings.defaultCppTemplate.trim()) return "默认 C++ 代码模板不能为空";
  for (const [label, key] of [
    ["编程题理解题目", "aiProgrammingOverviewPrompt"],
    ["编程题下一步提示", "aiProgrammingNextStepPrompt"],
    ["编程题检查代码", "aiProgrammingCodeReviewPrompt"],
    ["编程题自由提问", "aiProgrammingQuestionPrompt"],
    ["选择判断题解析", "aiObjectiveExplanationPrompt"],
  ] as const) {
    const value = settings[key];
    if (!value.trim()) return `${label}提示词不能为空`;
    if (value.length > AI_CUSTOM_PROMPT_MAX_CHARS) {
      return `${label}提示词不能超过 ${AI_CUSTOM_PROMPT_MAX_CHARS} 个字`;
    }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
      return `${label}提示词不能包含非法控制字符`;
    }
  }
  if (!["0", "30", "90", "180", "365"].includes(settings.aiConversationRetentionDays)) {
    return "AI 对话保留时间不合法";
  }
  const programmingProfileError = validateAiProfileSettings({
    baseUrl: settings.aiBaseUrl,
    customThinkingProtocol: settings.aiCustomThinkingProtocol,
    label: "编程题",
    model: settings.aiModel,
    provider: settings.aiProvider,
    thinkingMode: settings.aiThinkingMode,
  });
  if (programmingProfileError) return programmingProfileError;
  const objectiveProfileError = validateAiProfileSettings({
    baseUrl: settings.aiObjectiveBaseUrl,
    customThinkingProtocol: settings.aiObjectiveCustomThinkingProtocol,
    label: "选择判断题",
    model: settings.aiObjectiveModel,
    provider: settings.aiObjectiveProvider,
    thinkingMode: settings.aiObjectiveThinkingMode,
  });
  if (objectiveProfileError) return objectiveProfileError;
  for (const [label, value] of [
    ["学生编程助手", settings.aiProgrammingStudentCooldownSeconds],
    ["老师学情摘要", settings.aiProgrammingTeacherCooldownSeconds],
    ["管理员学情摘要", settings.aiProgrammingAdminCooldownSeconds],
    ["学生选择判断解析", settings.aiObjectiveStudentCooldownSeconds],
    ["老师选择判断解析", settings.aiObjectiveTeacherCooldownSeconds],
    ["管理员选择判断解析", settings.aiObjectiveAdminCooldownSeconds],
  ] as const) {
    if (!isValidAiCooldownSeconds(value)) {
      return `${label}触发间隔必须是 ${AI_COOLDOWN_MIN_SECONDS}–${AI_COOLDOWN_MAX_SECONDS} 秒的整数`;
    }
  }
  return "";
}

function validateAiProfileSettings({
  baseUrl,
  customThinkingProtocol,
  label,
  model,
  provider,
  thinkingMode,
}: {
  baseUrl: string;
  customThinkingProtocol: string;
  label: string;
  model: string;
  provider: string;
  thinkingMode: string;
}) {
  if (!["deepseek", "doubao", "custom"].includes(provider)) {
    return `${label} AI 服务商不合法`;
  }
  if (baseUrl.length > 300) {
    return `${label} AI Base URL 不能超过 300 个字符`;
  }
  if (/[\u0000-\u001f\u007f]/.test(baseUrl)) {
    return `${label} AI Base URL 不能包含控制字符`;
  }
  if (!model.trim()) {
    return `${label} AI 模型 ID 不能为空`;
  }
  if (model.length > 200) {
    return `${label} AI 模型 ID 不能超过 200 个字符`;
  }
  if (/[\u0000-\u001f\u007f]/.test(model)) {
    return `${label} AI 模型 ID 不能包含控制字符`;
  }
  if (!["enabled", "disabled"].includes(thinkingMode)) {
    return `${label} AI 思考模式不合法`;
  }
  if (!["thinking-object", "none"].includes(customThinkingProtocol)) {
    return `${label}自定义 AI 思考协议不合法`;
  }
  if (provider === "custom" && !baseUrl.trim()) {
    return `${label}自定义 AI 服务必须填写 Base URL`;
  }
  return "";
}

export function isValidAiCooldownSeconds(value: string) {
  const parsed = Number(value);
  return (
    Number.isInteger(parsed) &&
    parsed >= AI_COOLDOWN_MIN_SECONDS &&
    parsed <= AI_COOLDOWN_MAX_SECONDS
  );
}

export function normalizeAiCooldownSeconds(value: string, fallback: number) {
  return isValidAiCooldownSeconds(value) ? Number(value) : fallback;
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

export function validatePublicSecurityRecordIcon(value: string) {
  if (!value) return "";
  const match = value.match(
    /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match) return "公安备案图标仅支持 PNG 文件";

  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length === 0) return "公安备案图标内容为空";
  if (bytes.length > MAX_PUBLIC_SECURITY_RECORD_ICON_BYTES) {
    return "公安备案图标不能超过 64KB";
  }

  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const hasValidHeader =
    bytes.length >= 33 &&
    bytes.subarray(0, 8).equals(pngSignature) &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.subarray(12, 16).equals(Buffer.from("IHDR"));
  if (!hasValidHeader) return "公安备案图标文件内容与 PNG 格式不匹配";

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 8 || height < 8 || width > 512 || height > 512) {
    return "公安备案图标尺寸必须在 8×8 至 512×512 像素之间";
  }
  return "";
}

export function systemSettingsEntries(settings: SystemSettings) {
  return settingKeys.map((key) => ({ key, value: settings[key] }));
}
