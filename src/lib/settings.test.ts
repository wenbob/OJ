import { describe, expect, it, vi } from "vitest";
import { MAX_BROWSER_ICON_BYTES } from "@/lib/browserIdentity";
import { prisma } from "@/lib/prisma";
import {
  AI_CUSTOM_PROMPT_MAX_CHARS,
  defaultSystemSettings,
  getPublicSettings,
  normalizeSystemSettingsPayload,
  validateBrowserIcon,
  validatePublicSecurityRecordIcon,
  validateSystemSettings,
} from "@/lib/settings";
import { MAX_PUBLIC_SECURITY_RECORD_ICON_BYTES } from "@/lib/siteCompliance";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    systemSetting: {
      findMany: vi.fn(),
    },
  },
}));

function pngDataUrl(size = 8) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const bytes = size <= signature.length
    ? signature.subarray(0, size)
    : Buffer.concat([signature, Buffer.alloc(size - signature.length)]);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

const publicSecurityPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAJklEQVQ4jWOQ8ur6T03MMGrg/9Ew/D+abP6P5pT/o4XD/xFYHgIAm2kCfq3CV6UAAAAASUVORK5CYII=";

describe("browser identity system settings", () => {
  it("normalizes browser title and icon fields", () => {
    const settings = normalizeSystemSettingsPayload({
      ...defaultSystemSettings,
      browserTitle: "好好练题",
      browserIcon: pngDataUrl(),
    });
    expect(settings.browserTitle).toBe("好好练题");
    expect(settings.browserIcon).toBe(pngDataUrl());
  });

  it("accepts a valid PNG data URL", () => {
    expect(validateBrowserIcon(pngDataUrl())).toBe("");
  });

  it("rejects unsupported or disguised icon content", () => {
    expect(validateBrowserIcon("data:image/svg+xml;base64,PHN2Zz4=")).toContain("PNG 或 ICO");
    expect(validateBrowserIcon("data:image/png;base64,SGVsbG8=")).toContain("格式不匹配");
  });

  it("rejects icons larger than 256KB", () => {
    expect(validateBrowserIcon(pngDataUrl(MAX_BROWSER_ICON_BYTES + 1))).toContain("256KB");
  });

  it("does not expose an invalid icon already stored in the database", async () => {
    vi.mocked(prisma.systemSetting.findMany).mockResolvedValueOnce([
      { key: "browserIcon", value: "data:image/png;base64,SGVsbG8=" },
      { key: "icpRecordNumber", value: "not-an-icp-record" },
      {
        key: "publicSecurityRecordNumber",
        value: "陕公网安备61011302001964号",
      },
      { key: "publicSecurityRecordIcon", value: "data:image/png;base64,SGVsbG8=" },
    ] as never);

    await expect(getPublicSettings()).resolves.toMatchObject({
      browserIcon: "",
      icpRecordNumber: "",
      publicSecurityRecordIcon: "",
      publicSecurityRecordNumber: "",
    });
  });

  it("validates ICP-only and complete public-security settings", () => {
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        icpRecordNumber: "陕ICP备2026021441号-1",
      }),
    ).toBe("");
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        icpRecordNumber: "陕ICP备2026021441号-1",
        publicSecurityRecordIcon: publicSecurityPngDataUrl,
        publicSecurityRecordNumber: "陕公网安备61011302001964号",
      }),
    ).toBe("");
  });

  it("rejects incomplete, disguised, oversized, and unreasonable police icons", () => {
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        publicSecurityRecordNumber: "陕公网安备61011302001964号",
      }),
    ).toContain("同时填写");
    expect(
      validatePublicSecurityRecordIcon("data:image/png;base64,SGVsbG8="),
    ).toContain("格式不匹配");
    expect(
      validatePublicSecurityRecordIcon(
        `data:image/png;base64,${Buffer.alloc(
          MAX_PUBLIC_SECURITY_RECORD_ICON_BYTES + 1,
        ).toString("base64")}`,
      ),
    ).toContain("64KB");

    const invalidDimensions = Buffer.from(
      publicSecurityPngDataUrl.slice("data:image/png;base64,".length),
      "base64",
    );
    invalidDimensions.writeUInt32BE(513, 16);
    expect(
      validatePublicSecurityRecordIcon(
        `data:image/png;base64,${invalidDimensions.toString("base64")}`,
      ),
    ).toContain("512×512");
  });

  it("allows an empty browser title but limits custom titles to 60 characters", () => {
    expect(validateSystemSettings({ ...defaultSystemSettings, browserTitle: "" })).toBe("");
    expect(
      validateSystemSettings({ ...defaultSystemSettings, browserTitle: "标".repeat(61) }),
    ).toContain("60");
  });

  it("defaults the independent objective explanation switch to off", () => {
    expect(defaultSystemSettings.aiObjectiveExplanationEnabled).toBe("false");
    expect(defaultSystemSettings.aiStudentObjectiveExplanationEnabled).toBe("false");
    expect(defaultSystemSettings.aiStaffProgrammingAssistEnabled).toBe("false");
    expect(
      normalizeSystemSettingsPayload({
        ...defaultSystemSettings,
        aiObjectiveExplanationEnabled: true,
      }).aiObjectiveExplanationEnabled,
    ).toBe("true");
  });

  it("accepts supported AI retention periods and rejects arbitrary values", () => {
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiConversationRetentionDays: "180",
      }),
    ).toBe("");
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiConversationRetentionDays: "45",
      }),
    ).toContain("保留时间");
  });

  it("validates non-secret AI provider settings and model limits", () => {
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiProvider: "custom",
        aiBaseUrl: "",
      }),
    ).toContain("Base URL");
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiProvider: "unknown",
      }),
    ).toContain("服务商");
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiModel: "model\ninjection",
      }),
    ).toContain("控制字符");
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiThinkingMode: "automatic",
      }),
    ).toContain("思考模式");
  });

  it("inherits the programming profile for legacy settings payloads", () => {
    const settings = normalizeSystemSettingsPayload({
      ...defaultSystemSettings,
      aiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      aiModel: "doubao-programming",
      aiProvider: "doubao",
      aiThinkingMode: "disabled",
      aiObjectiveBaseUrl: undefined,
      aiObjectiveCustomThinkingProtocol: undefined,
      aiObjectiveModel: undefined,
      aiObjectiveProvider: undefined,
      aiObjectiveThinkingMode: undefined,
    });

    expect(settings).toMatchObject({
      aiObjectiveBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      aiObjectiveCustomThinkingProtocol: "none",
      aiObjectiveModel: "doubao-programming",
      aiObjectiveProvider: "doubao",
      aiObjectiveThinkingMode: "disabled",
    });
  });

  it("keeps default AI prompts when an older settings payload omits them", () => {
    const settings = normalizeSystemSettingsPayload({
      ...defaultSystemSettings,
      aiProgrammingOverviewPrompt: undefined,
      aiProgrammingNextStepPrompt: undefined,
      aiProgrammingCodeReviewPrompt: undefined,
      aiProgrammingQuestionPrompt: undefined,
      aiObjectiveExplanationPrompt: undefined,
    });

    expect(settings.aiProgrammingOverviewPrompt).toBe(
      defaultSystemSettings.aiProgrammingOverviewPrompt,
    );
    expect(settings.aiProgrammingNextStepPrompt).toBe(
      defaultSystemSettings.aiProgrammingNextStepPrompt,
    );
    expect(settings.aiProgrammingCodeReviewPrompt).toBe(
      defaultSystemSettings.aiProgrammingCodeReviewPrompt,
    );
    expect(settings.aiProgrammingQuestionPrompt).toBe(
      defaultSystemSettings.aiProgrammingQuestionPrompt,
    );
    expect(settings.aiObjectiveExplanationPrompt).toBe(
      defaultSystemSettings.aiObjectiveExplanationPrompt,
    );
  });

  it("normalizes and validates administrator AI prompts", () => {
    const normalized = normalizeSystemSettingsPayload({
      ...defaultSystemSettings,
      aiProgrammingOverviewPrompt: "  第一行\r\n第二行  ",
    });
    expect(normalized.aiProgrammingOverviewPrompt).toBe("第一行\n第二行");
    expect(validateSystemSettings(normalized)).toBe("");

    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiProgrammingQuestionPrompt: "   ",
      }),
    ).toContain("不能为空");
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiObjectiveExplanationPrompt: "题".repeat(
          AI_CUSTOM_PROMPT_MAX_CHARS + 1,
        ),
      }),
    ).toContain(String(AI_CUSTOM_PROMPT_MAX_CHARS));
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiProgrammingCodeReviewPrompt: "检查\u0000代码",
      }),
    ).toContain("控制字符");
  });

  it("validates objective profile fields and role cooldown boundaries", () => {
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiObjectiveBaseUrl: "",
        aiObjectiveModel: "objective-model",
        aiObjectiveProvider: "custom",
      }),
    ).toContain("选择判断题");
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiObjectiveStudentCooldownSeconds: "4",
      }),
    ).toContain("学生选择判断解析");
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiObjectiveTeacherCooldownSeconds: "4",
      }),
    ).toContain("5");
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiProgrammingAdminCooldownSeconds: "601",
      }),
    ).toContain("600");
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiProgrammingStudentCooldownSeconds: "20.5",
      }),
    ).toContain("整数");
    expect(
      validateSystemSettings({
        ...defaultSystemSettings,
        aiObjectiveAdminCooldownSeconds: "600",
        aiProgrammingStudentCooldownSeconds: "5",
      }),
    ).toBe("");
  });
});
