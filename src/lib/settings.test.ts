import { describe, expect, it, vi } from "vitest";
import { MAX_BROWSER_ICON_BYTES } from "@/lib/browserIdentity";
import { prisma } from "@/lib/prisma";
import {
  defaultSystemSettings,
  getPublicSettings,
  normalizeSystemSettingsPayload,
  validateBrowserIcon,
  validateSystemSettings,
} from "@/lib/settings";

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
    ] as never);

    await expect(getPublicSettings()).resolves.toMatchObject({ browserIcon: "" });
  });

  it("allows an empty browser title but limits custom titles to 60 characters", () => {
    expect(validateSystemSettings({ ...defaultSystemSettings, browserTitle: "" })).toBe("");
    expect(
      validateSystemSettings({ ...defaultSystemSettings, browserTitle: "标".repeat(61) }),
    ).toContain("60");
  });

  it("defaults the independent objective explanation switch to off", () => {
    expect(defaultSystemSettings.aiObjectiveExplanationEnabled).toBe("false");
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
