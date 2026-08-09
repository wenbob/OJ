import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  requestHttp: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    systemSetting: {
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("@/lib/safeAiProviderHttp", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/safeAiProviderHttp")
  >("@/lib/safeAiProviderHttp");
  return {
    ...actual,
    requestSafeAiProviderHttp: mocks.requestHttp,
  };
});

import {
  AiProviderError,
  AI_PROVIDER_PRESETS,
  buildAiChatRequestBody,
  createAiProviderFingerprint,
  getEffectiveAiProviderConfig,
  listAvailableAiModels,
  requestAiChatCompletion,
  toAiProviderAdminStatus,
  type AiProviderRuntimeConfig,
} from "./aiProvider";

const originalEnvironment = {
  AI_CUSTOM_API_KEY: process.env.AI_CUSTOM_API_KEY,
  ARK_API_KEY: process.env.ARK_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
};

function restoreEnvironment() {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function config(
  overrides: Partial<AiProviderRuntimeConfig> = {},
): AiProviderRuntimeConfig {
  return {
    apiKey: "test-key",
    baseUrl: AI_PROVIDER_PRESETS.deepseek.baseUrl,
    customThinkingProtocol: "none",
    legacyFallback: false,
    model: "model-1",
    provider: "deepseek",
    thinkingMode: "enabled",
    ...overrides,
  };
}

function rows(values: Record<string, string>) {
  return Object.entries(values).map(([key, value]) => ({ key, value }));
}

beforeEach(() => {
  vi.clearAllMocks();
  restoreEnvironment();
});

afterEach(() => {
  restoreEnvironment();
});

describe("effective AI provider configuration", () => {
  it("keeps the legacy DeepSeek environment fallback until an admin saves settings", async () => {
    process.env.DEEPSEEK_API_KEY = "secret-not-for-client";
    process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.com/";
    process.env.DEEPSEEK_MODEL = "legacy-model";
    mocks.findMany.mockResolvedValueOnce([]);

    const effective = await getEffectiveAiProviderConfig();
    const status = toAiProviderAdminStatus(effective);

    expect(effective).toMatchObject({
      apiKey: "secret-not-for-client",
      baseUrl: "https://api.deepseek.com",
      legacyFallback: true,
      model: "legacy-model",
      provider: "deepseek",
      thinkingMode: "enabled",
    });
    expect(status.credentialConfigured).toBe(true);
    expect(status).not.toHaveProperty("apiKey");
    expect(JSON.stringify(status)).not.toContain("secret-not-for-client");
  });

  it("fails closed when the database configuration read fails", async () => {
    process.env.DEEPSEEK_API_KEY = "legacy-key-must-not-be-used";
    mocks.findMany.mockRejectedValueOnce(new Error("database busy"));

    await expect(getEffectiveAiProviderConfig()).rejects.toMatchObject({
      kind: "invalid-config",
      message: "AI 配置暂时无法读取，请稍后再试",
    });
  });

  it("maps saved providers to fixed official URLs and their own key slots", async () => {
    process.env.ARK_API_KEY = "ark-secret";
    mocks.findMany.mockResolvedValueOnce(
      rows({
        aiProvider: "doubao",
        aiBaseUrl: "https://attacker.invalid",
        aiModel: "doubao-chat",
        aiThinkingMode: "disabled",
        aiCustomThinkingProtocol: "none",
      }),
    );

    await expect(getEffectiveAiProviderConfig()).resolves.toMatchObject({
      apiKey: "ark-secret",
      baseUrl: AI_PROVIDER_PRESETS.doubao.baseUrl,
      legacyFallback: false,
      model: "doubao-chat",
      provider: "doubao",
      thinkingMode: "disabled",
    });
  });

  it("loads custom URL, model, thinking protocol and custom key slot", async () => {
    process.env.AI_CUSTOM_API_KEY = "custom-secret";
    mocks.findMany.mockResolvedValueOnce(
      rows({
        aiProvider: "custom",
        aiBaseUrl: "https://models.example.com/v1/",
        aiModel: "chat-2",
        aiThinkingMode: "enabled",
        aiCustomThinkingProtocol: "thinking-object",
      }),
    );

    await expect(getEffectiveAiProviderConfig()).resolves.toMatchObject({
      apiKey: "custom-secret",
      baseUrl: "https://models.example.com/v1",
      customThinkingProtocol: "thinking-object",
      model: "chat-2",
      provider: "custom",
    });
  });

  it("inherits the programming profile when objective settings are not stored", async () => {
    process.env.DEEPSEEK_API_KEY = "shared-secret";
    mocks.findMany.mockResolvedValueOnce(
      rows({
        aiProvider: "deepseek",
        aiBaseUrl: "https://api.deepseek.com",
        aiModel: "programming-model",
        aiThinkingMode: "disabled",
        aiCustomThinkingProtocol: "none",
      }),
    );

    await expect(
      getEffectiveAiProviderConfig("objective"),
    ).resolves.toMatchObject({
      apiKey: "shared-secret",
      model: "programming-model",
      provider: "deepseek",
      thinkingMode: "disabled",
    });
  });

  it("loads an independent objective provider without changing programming", async () => {
    process.env.ARK_API_KEY = "objective-secret";
    const stored = rows({
      aiProvider: "deepseek",
      aiBaseUrl: "https://api.deepseek.com",
      aiModel: "programming-model",
      aiThinkingMode: "enabled",
      aiCustomThinkingProtocol: "none",
      aiObjectiveProvider: "doubao",
      aiObjectiveBaseUrl: "https://ignored.invalid",
      aiObjectiveModel: "objective-model",
      aiObjectiveThinkingMode: "disabled",
      aiObjectiveCustomThinkingProtocol: "none",
    });
    mocks.findMany.mockResolvedValueOnce(stored).mockResolvedValueOnce(stored);

    const programming = await getEffectiveAiProviderConfig("programming");
    const objective = await getEffectiveAiProviderConfig("objective");

    expect(programming).toMatchObject({
      model: "programming-model",
      provider: "deepseek",
      thinkingMode: "enabled",
    });
    expect(objective).toMatchObject({
      apiKey: "objective-secret",
      baseUrl: AI_PROVIDER_PRESETS.doubao.baseUrl,
      model: "objective-model",
      provider: "doubao",
      thinkingMode: "disabled",
    });
  });

  it("creates a stable non-secret fingerprint that changes with every behavior field", () => {
    const base = config();
    const fingerprint = createAiProviderFingerprint(base);
    expect(createAiProviderFingerprint({ ...base })).toBe(fingerprint);
    expect(
      createAiProviderFingerprint({ ...base, model: "model-2" }),
    ).not.toBe(fingerprint);
    expect(
      createAiProviderFingerprint({ ...base, provider: "doubao" }),
    ).not.toBe(fingerprint);
    expect(
      createAiProviderFingerprint({
        ...base,
        thinkingMode: "disabled",
      }),
    ).not.toBe(fingerprint);
    expect(fingerprint).not.toContain(base.apiKey);
  });
});

describe("AI thinking request bodies", () => {
  const messages = [{ content: "hello", role: "user" as const }];

  it("uses DeepSeek thinking plus high reasoning effort without temperature", () => {
    const body = buildAiChatRequestBody({
      config: config({ provider: "deepseek", thinkingMode: "enabled" }),
      maxTokens: 100,
      messages,
    });
    expect(body).toMatchObject({
      reasoning_effort: "high",
      thinking: { type: "enabled" },
    });
    expect(body).not.toHaveProperty("temperature");
  });

  it("disables DeepSeek or Doubao thinking with temperature 0.2", () => {
    for (const provider of ["deepseek", "doubao"] as const) {
      expect(
        buildAiChatRequestBody({
          config: config({ provider, thinkingMode: "disabled" }),
          maxTokens: 100,
          messages,
        }),
      ).toMatchObject({
        temperature: 0.2,
        thinking: { type: "disabled" },
      });
    }
  });

  it("supports custom thinking-object and compatibility modes", () => {
    const thinkingBody = buildAiChatRequestBody({
      config: config({
        customThinkingProtocol: "thinking-object",
        provider: "custom",
        thinkingMode: "enabled",
      }),
      maxTokens: 100,
      messages,
    });
    const compatibleBody = buildAiChatRequestBody({
      config: config({
        customThinkingProtocol: "none",
        provider: "custom",
        thinkingMode: "enabled",
      }),
      maxTokens: 100,
      messages,
    });

    expect(thinkingBody).toMatchObject({
      thinking: { type: "enabled" },
    });
    expect(thinkingBody).not.toHaveProperty("temperature");
    expect(compatibleBody).not.toHaveProperty("thinking");
    expect(compatibleBody).toMatchObject({ temperature: 0.2 });
  });
});

describe("OpenAI-compatible model and chat responses", () => {
  it("filters, deduplicates and naturally sorts model IDs", async () => {
    mocks.requestHttp.mockResolvedValueOnce({
      body: JSON.stringify({
        data: [
          { id: "model-10", owned_by: "vendor" },
          { id: "model-2", owned_by: "vendor" },
          { id: "model-2", owned_by: "duplicate" },
          { id: "" },
          { id: "bad\nmodel" },
        ],
      }),
      headers: {},
      status: 200,
    });

    await expect(listAvailableAiModels(config())).resolves.toEqual([
      { id: "model-2", ownedBy: "vendor" },
      { id: "model-10", ownedBy: "vendor" },
    ]);
  });

  it("does not start discovery without the selected provider credential", async () => {
    await expect(
      listAvailableAiModels(config({ apiKey: "" })),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AiProviderError>>({
        kind: "missing-credential",
      }),
    );
    expect(mocks.requestHttp).not.toHaveBeenCalled();
  });

  it("parses actual model and token usage while retaining reasoning only internally", async () => {
    mocks.requestHttp.mockResolvedValueOnce({
      body: JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "安全的最终回复",
              reasoning_content: "内部推理",
            },
          },
        ],
        model: "actual-model",
        usage: {
          completion_tokens: 5,
          prompt_tokens: 10,
          total_tokens: 15,
        },
      }),
      headers: {},
      status: 200,
    });

    await expect(
      requestAiChatCompletion({
        config: config(),
        maxTokens: 100,
        messages: [{ content: "question", role: "user" }],
        timeoutMs: 1_000,
      }),
    ).resolves.toEqual({
      completionTokens: 5,
      content: "安全的最终回复",
      finishReason: "stop",
      model: "actual-model",
      promptTokens: 10,
      reasoningContent: "内部推理",
      totalTokens: 15,
    });
  });

  it("never includes upstream response bodies in status errors", async () => {
    mocks.requestHttp.mockResolvedValueOnce({
      body: "secret upstream diagnostic",
      headers: {},
      status: 401,
    });

    let caught: unknown;
    try {
      await listAvailableAiModels(config());
    } catch (error) {
      caught = error;
    }
    expect(caught).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("获取模型失败：401"),
      }),
    );
    expect(caught instanceof Error ? caught.message : "").not.toContain(
      "secret upstream diagnostic",
    );
  });
});
