import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  normalizeAiProviderBaseUrl,
  requestSafeAiProviderHttp,
  SafeAiProviderHttpError,
} from "@/lib/safeAiProviderHttp";
import {
  defaultSystemSettings,
  type SystemSettings,
} from "@/lib/settings";

export type AiProviderId = "deepseek" | "doubao" | "custom";
export type AiThinkingMode = "enabled" | "disabled";
export type AiCustomThinkingProtocol = "thinking-object" | "none";
export type AiModelProfile = "programming" | "objective";

export const AI_PROVIDER_PRESETS = {
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    label: "DeepSeek",
  },
  doubao: {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    label: "豆包 / 火山方舟",
  },
  custom: {
    baseUrl: "",
    label: "自定义 OpenAI-compatible",
  },
} as const;

const aiProfileSettingKeys = {
  programming: {
    baseUrl: "aiBaseUrl",
    customThinkingProtocol: "aiCustomThinkingProtocol",
    model: "aiModel",
    provider: "aiProvider",
    thinkingMode: "aiThinkingMode",
  },
  objective: {
    baseUrl: "aiObjectiveBaseUrl",
    customThinkingProtocol: "aiObjectiveCustomThinkingProtocol",
    model: "aiObjectiveModel",
    provider: "aiObjectiveProvider",
    thinkingMode: "aiObjectiveThinkingMode",
  },
} as const;

const aiSettingKeys = [
  ...Object.values(aiProfileSettingKeys.programming),
  ...Object.values(aiProfileSettingKeys.objective),
] as const;

export type AiProviderRuntimeConfig = {
  apiKey: string;
  baseUrl: string;
  customThinkingProtocol: AiCustomThinkingProtocol;
  legacyFallback: boolean;
  model: string;
  provider: AiProviderId;
  thinkingMode: AiThinkingMode;
};

export type AiProviderAdminStatus = Omit<AiProviderRuntimeConfig, "apiKey"> & {
  credentialConfigured: boolean;
};

export type AiProviderAdminStatuses = Record<
  AiModelProfile,
  AiProviderAdminStatus
>;

export type AiModelOption = {
  id: string;
  ownedBy: string | null;
};

export type AiChatMessage = {
  content: string;
  role: "system" | "user" | "assistant";
};

export type AiChatCompletionResult = {
  completionTokens: number | null;
  content: string | null;
  finishReason: string | null;
  model: string;
  promptTokens: number | null;
  reasoningContent: string | null;
  totalTokens: number | null;
};

export type AiProviderErrorKind =
  | "invalid-config"
  | "missing-credential"
  | "unsafe-target"
  | "timeout"
  | "network"
  | "upstream"
  | "response-too-large"
  | "invalid-response";

export class AiProviderError extends Error {
  constructor(
    public readonly kind: AiProviderErrorKind,
    message: string,
    public readonly upstreamStatus: number | null = null,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

function isProvider(value: string): value is AiProviderId {
  return value === "deepseek" || value === "doubao" || value === "custom";
}

function isThinkingMode(value: string): value is AiThinkingMode {
  return value === "enabled" || value === "disabled";
}

function isCustomThinkingProtocol(
  value: string,
): value is AiCustomThinkingProtocol {
  return value === "thinking-object" || value === "none";
}

function getProviderApiKey(provider: AiProviderId) {
  if (provider === "deepseek") {
    return process.env.DEEPSEEK_API_KEY?.trim() ?? "";
  }
  if (provider === "doubao") {
    return process.env.ARK_API_KEY?.trim() ?? "";
  }
  return process.env.AI_CUSTOM_API_KEY?.trim() ?? "";
}

function normalizeRuntimeBaseUrl(value: string) {
  try {
    return normalizeAiProviderBaseUrl(value);
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

function toRuntimeConfig({
  baseUrl,
  customThinkingProtocol,
  legacyFallback,
  model,
  provider,
  thinkingMode,
}: Omit<AiProviderRuntimeConfig, "apiKey">): AiProviderRuntimeConfig {
  return {
    apiKey: getProviderApiKey(provider),
    baseUrl,
    customThinkingProtocol,
    legacyFallback,
    model,
    provider,
    thinkingMode,
  };
}

function createLegacyDeepSeekConfig(): AiProviderRuntimeConfig {
  return toRuntimeConfig({
    baseUrl: normalizeRuntimeBaseUrl(
      process.env.DEEPSEEK_BASE_URL?.trim() ||
        AI_PROVIDER_PRESETS.deepseek.baseUrl,
    ),
    customThinkingProtocol: "none",
    legacyFallback: true,
    model:
      process.env.DEEPSEEK_MODEL?.trim() ||
      defaultSystemSettings.aiModel,
    provider: "deepseek",
    thinkingMode: "enabled",
  });
}

export function normalizeAiProviderSettings(
  settings: SystemSettings,
): SystemSettings {
  const programming = normalizeAiProviderProfile({
    baseUrl: settings.aiBaseUrl,
    customThinkingProtocol: settings.aiCustomThinkingProtocol,
    model: settings.aiModel,
    provider: settings.aiProvider,
    thinkingMode: settings.aiThinkingMode,
  });
  const objective = normalizeAiProviderProfile({
    baseUrl: settings.aiObjectiveBaseUrl,
    customThinkingProtocol: settings.aiObjectiveCustomThinkingProtocol,
    model: settings.aiObjectiveModel,
    provider: settings.aiObjectiveProvider,
    thinkingMode: settings.aiObjectiveThinkingMode,
  });

  return {
    ...settings,
    aiProvider: programming.provider,
    aiBaseUrl: programming.baseUrl,
    aiModel: programming.model,
    aiThinkingMode: programming.thinkingMode,
    aiCustomThinkingProtocol: programming.customThinkingProtocol,
    aiObjectiveProvider: objective.provider,
    aiObjectiveBaseUrl: objective.baseUrl,
    aiObjectiveModel: objective.model,
    aiObjectiveThinkingMode: objective.thinkingMode,
    aiObjectiveCustomThinkingProtocol: objective.customThinkingProtocol,
  };
}

function normalizeAiProviderProfile({
  baseUrl,
  customThinkingProtocol,
  model,
  provider: providerValue,
  thinkingMode,
}: {
  baseUrl: string;
  customThinkingProtocol: string;
  model: string;
  provider: string;
  thinkingMode: string;
}) {
  const provider = isProvider(providerValue) ? providerValue : "deepseek";
  return {
    baseUrl:
      provider === "custom"
        ? normalizeAiProviderBaseUrl(baseUrl)
        : AI_PROVIDER_PRESETS[provider].baseUrl,
    customThinkingProtocol: isCustomThinkingProtocol(customThinkingProtocol)
      ? customThinkingProtocol
      : ("none" as const),
    model: model.trim(),
    provider,
    thinkingMode: isThinkingMode(thinkingMode)
      ? thinkingMode
      : ("enabled" as const),
  };
}

export async function getEffectiveAiProviderConfig(
  profile: AiModelProfile = "programming",
): Promise<AiProviderRuntimeConfig> {
  let rows: Array<{ key: string; value: string }>;
  try {
    rows = await prisma.systemSetting.findMany({
      where: { key: { in: [...aiSettingKeys] } },
      select: { key: true, value: true },
    });
  } catch {
    throw new AiProviderError(
      "invalid-config",
      "AI 配置暂时无法读取，请稍后再试",
    );
  }

  const values = new Map(rows.map((row) => [row.key, row.value]));
  const programmingConfig = createStoredProgrammingConfig(values);
  if (profile === "programming") return programmingConfig;

  const keys = aiProfileSettingKeys.objective;
  const hasObjectiveSettings = Object.values(keys).some((key) =>
    values.has(key),
  );
  if (!hasObjectiveSettings) return programmingConfig;

  const providerValue =
    values.get(keys.provider) ?? programmingConfig.provider;
  const provider = isProvider(providerValue)
    ? providerValue
    : programmingConfig.provider;
  const configuredBaseUrl =
    values.get(keys.baseUrl)?.trim() ??
    (provider === programmingConfig.provider ? programmingConfig.baseUrl : "");
  const baseUrl =
    provider === "custom"
      ? normalizeRuntimeBaseUrl(configuredBaseUrl)
      : AI_PROVIDER_PRESETS[provider].baseUrl;
  const thinkingValue =
    values.get(keys.thinkingMode) ?? programmingConfig.thinkingMode;
  const protocolValue =
    values.get(keys.customThinkingProtocol) ??
    programmingConfig.customThinkingProtocol;

  return toRuntimeConfig({
    baseUrl,
    customThinkingProtocol: isCustomThinkingProtocol(protocolValue)
      ? protocolValue
      : "none",
    legacyFallback: false,
    model: values.get(keys.model)?.trim() || programmingConfig.model,
    provider,
    thinkingMode: isThinkingMode(thinkingValue)
      ? thinkingValue
      : "enabled",
  });
}

function createStoredProgrammingConfig(values: Map<string, string>) {
  const keys = aiProfileSettingKeys.programming;
  if (!values.has(keys.provider)) {
    return createLegacyDeepSeekConfig();
  }

  const providerValue = values.get(keys.provider) ?? "";
  const provider = isProvider(providerValue) ? providerValue : "deepseek";
  const configuredBaseUrl = values.get(keys.baseUrl)?.trim() ?? "";
  const baseUrl =
    provider === "custom"
      ? normalizeRuntimeBaseUrl(configuredBaseUrl)
      : AI_PROVIDER_PRESETS[provider].baseUrl;
  const thinkingValue = values.get(keys.thinkingMode) ?? "";
  const protocolValue = values.get(keys.customThinkingProtocol) ?? "";

  return toRuntimeConfig({
    baseUrl,
    customThinkingProtocol: isCustomThinkingProtocol(protocolValue)
      ? protocolValue
      : "none",
    legacyFallback: false,
    model:
      values.get(keys.model)?.trim() ||
      defaultSystemSettings.aiModel,
    provider,
    thinkingMode: isThinkingMode(thinkingValue)
      ? thinkingValue
      : "enabled",
  });
}

export function createAiProviderDraftConfig({
  baseUrl,
  provider,
}: {
  baseUrl: string;
  provider: AiProviderId;
}): AiProviderRuntimeConfig {
  return toRuntimeConfig({
    baseUrl:
      provider === "custom"
        ? normalizeAiProviderBaseUrl(baseUrl)
        : AI_PROVIDER_PRESETS[provider].baseUrl,
    customThinkingProtocol: "none",
    legacyFallback: false,
    model: defaultSystemSettings.aiModel,
    provider,
    thinkingMode: "enabled",
  });
}

export function toAiProviderAdminStatus(
  config: AiProviderRuntimeConfig,
): AiProviderAdminStatus {
  return {
    baseUrl: config.baseUrl,
    credentialConfigured: Boolean(config.apiKey),
    customThinkingProtocol: config.customThinkingProtocol,
    legacyFallback: config.legacyFallback,
    model: config.model,
    provider: config.provider,
    thinkingMode: config.thinkingMode,
  };
}

export function applyAiProviderStatusToSettings(
  settings: SystemSettings,
  status: AiProviderAdminStatus,
  profile: AiModelProfile = "programming",
): SystemSettings {
  if (profile === "objective") {
    return {
      ...settings,
      aiObjectiveProvider: status.provider,
      aiObjectiveBaseUrl: status.baseUrl,
      aiObjectiveModel: status.model,
      aiObjectiveThinkingMode: status.thinkingMode,
      aiObjectiveCustomThinkingProtocol: status.customThinkingProtocol,
    };
  }
  return {
    ...settings,
    aiProvider: status.provider,
    aiBaseUrl: status.baseUrl,
    aiModel: status.model,
    aiThinkingMode: status.thinkingMode,
    aiCustomThinkingProtocol: status.customThinkingProtocol,
  };
}

export function applyAiProviderStatusesToSettings(
  settings: SystemSettings,
  statuses: AiProviderAdminStatuses,
) {
  return applyAiProviderStatusToSettings(
    applyAiProviderStatusToSettings(
      settings,
      statuses.programming,
      "programming",
    ),
    statuses.objective,
    "objective",
  );
}

export function createAiProviderFingerprint(
  config: Pick<
    AiProviderRuntimeConfig,
    | "baseUrl"
    | "customThinkingProtocol"
    | "model"
    | "provider"
    | "thinkingMode"
  >,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        baseUrl: config.baseUrl.trim().replace(/\/+$/, ""),
        customThinkingProtocol: config.customThinkingProtocol,
        model: config.model.trim(),
        provider: config.provider,
        thinkingMode: config.thinkingMode,
      }),
    )
    .digest("hex");
}

function endpointUrl(baseUrl: string, endpoint: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

function usesFixedOfficialEndpoint(config: AiProviderRuntimeConfig) {
  return (
    (config.provider === "deepseek" &&
      config.baseUrl === AI_PROVIDER_PRESETS.deepseek.baseUrl) ||
    (config.provider === "doubao" &&
      config.baseUrl === AI_PROVIDER_PRESETS.doubao.baseUrl)
  );
}

function readTokenCount(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function mapSafeHttpError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (error instanceof SafeAiProviderHttpError) {
    const kindMap: Record<
      SafeAiProviderHttpError["kind"],
      AiProviderErrorKind
    > = {
      "invalid-url": "invalid-config",
      "unsafe-target": "unsafe-target",
      timeout: "timeout",
      "response-too-large": "response-too-large",
      network: "network",
    };
    return new AiProviderError(kindMap[error.kind], error.message);
  }
  return new AiProviderError("network", "AI 服务网络请求失败");
}

function parseJsonResponse(body: string) {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new AiProviderError("invalid-response", "AI 服务返回格式异常");
  }
}

export async function listAvailableAiModels(
  config: AiProviderRuntimeConfig,
): Promise<AiModelOption[]> {
  if (!config.apiKey) {
    throw new AiProviderError(
      "missing-credential",
      "当前 AI 服务商尚未配置服务器密钥",
    );
  }

  let response: Awaited<ReturnType<typeof requestSafeAiProviderHttp>>;
  try {
    response = await requestSafeAiProviderHttp({
      allowDevelopmentNetworkProxy: usesFixedOfficialEndpoint(config),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      maxResponseBytes: 1024 * 1024,
      method: "GET",
      timeoutMs: 15_000,
      url: endpointUrl(config.baseUrl, "models"),
    });
  } catch (error) {
    throw mapSafeHttpError(error);
  }

  if (response.status < 200 || response.status >= 300) {
    throw new AiProviderError(
      "upstream",
      `AI 服务获取模型失败：${response.status}`,
      response.status,
    );
  }

  const data = parseJsonResponse(response.body) as {
    data?: unknown;
  };
  if (!Array.isArray(data.data)) {
    throw new AiProviderError("invalid-response", "AI 服务未返回有效模型列表");
  }

  const unique = new Map<string, AiModelOption>();
  for (const item of data.data) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (
      !id ||
      id.length > 200 ||
      /[\u0000-\u001f\u007f]/.test(id) ||
      unique.has(id)
    ) {
      continue;
    }
    const ownedBy =
      typeof record.owned_by === "string" &&
      record.owned_by.trim() &&
      record.owned_by.length <= 200
        ? record.owned_by.trim()
        : null;
    unique.set(id, { id, ownedBy });
    if (unique.size >= 2_000) break;
  }

  const collator = new Intl.Collator("zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
  return [...unique.values()].sort((left, right) =>
    collator.compare(left.id, right.id),
  );
}

export function buildAiChatRequestBody({
  config,
  maxTokens,
  messages,
}: {
  config: AiProviderRuntimeConfig;
  maxTokens: number;
  messages: AiChatMessage[];
}) {
  const body: Record<string, unknown> = {
    max_tokens: maxTokens,
    messages,
    model: config.model,
  };

  const sendsThinkingObject =
    config.provider === "deepseek" ||
    config.provider === "doubao" ||
    (config.provider === "custom" &&
      config.customThinkingProtocol === "thinking-object");
  if (sendsThinkingObject) {
    body.thinking = { type: config.thinkingMode };
    if (
      config.provider === "deepseek" &&
      config.thinkingMode === "enabled"
    ) {
      body.reasoning_effort = "high";
    }
    if (config.thinkingMode === "disabled") {
      body.temperature = 0.2;
    }
  } else {
    body.temperature = 0.2;
  }

  return body;
}

export async function requestAiChatCompletion({
  config,
  maxTokens,
  messages,
  onProviderRequest,
  timeoutMs,
}: {
  config: AiProviderRuntimeConfig;
  maxTokens: number;
  messages: AiChatMessage[];
  onProviderRequest?: () => void;
  timeoutMs: number;
}): Promise<AiChatCompletionResult> {
  if (!config.apiKey) {
    throw new AiProviderError(
      "missing-credential",
      "当前 AI 服务商尚未配置服务器密钥",
    );
  }
  if (!config.model.trim()) {
    throw new AiProviderError("invalid-config", "当前 AI 模型尚未配置");
  }

  let response: Awaited<ReturnType<typeof requestSafeAiProviderHttp>>;
  try {
    onProviderRequest?.();
    response = await requestSafeAiProviderHttp({
      allowDevelopmentNetworkProxy: usesFixedOfficialEndpoint(config),
      body: JSON.stringify(
        buildAiChatRequestBody({ config, maxTokens, messages }),
      ),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      maxResponseBytes: 2 * 1024 * 1024,
      method: "POST",
      timeoutMs,
      url: endpointUrl(config.baseUrl, "chat/completions"),
    });
  } catch (error) {
    throw mapSafeHttpError(error);
  }

  if (response.status < 200 || response.status >= 300) {
    throw new AiProviderError(
      "upstream",
      `AI 服务请求失败：${response.status}`,
      response.status,
    );
  }

  const data = parseJsonResponse(response.body) as {
    choices?: Array<{
      finish_reason?: unknown;
      message?: {
        content?: unknown;
        reasoning_content?: unknown;
      };
    }>;
    model?: unknown;
    usage?: {
      completion_tokens?: unknown;
      prompt_tokens?: unknown;
      total_tokens?: unknown;
    };
  };
  const choice = data.choices?.[0];

  return {
    completionTokens: readTokenCount(data.usage?.completion_tokens),
    content:
      typeof choice?.message?.content === "string"
        ? choice.message.content
        : null,
    finishReason:
      typeof choice?.finish_reason === "string"
        ? choice.finish_reason
        : null,
    model:
      typeof data.model === "string" && data.model.trim()
        ? data.model.trim()
        : config.model,
    promptTokens: readTokenCount(data.usage?.prompt_tokens),
    reasoningContent:
      typeof choice?.message?.reasoning_content === "string"
        ? choice.message.reasoning_content
        : null,
    totalTokens: readTokenCount(data.usage?.total_tokens),
  };
}
