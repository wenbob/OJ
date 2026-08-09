"use client";

import { RefreshCw, RotateCcw } from "lucide-react";
import { useState } from "react";
import type {
  AiModelProfile,
  AiModelOption,
  AiProviderAdminStatus,
  AiProviderId,
} from "@/lib/aiProvider";
import {
  AI_CUSTOM_PROMPT_MAX_CHARS,
  AI_COOLDOWN_MAX_SECONDS,
  AI_COOLDOWN_MIN_SECONDS,
  defaultAiObjectiveExplanationPrompt,
  defaultAiProgrammingCodeReviewPrompt,
  defaultAiProgrammingNextStepPrompt,
  defaultAiProgrammingOverviewPrompt,
  defaultAiProgrammingQuestionPrompt,
  type SystemSettings,
} from "@/lib/settings";

const providerBaseUrls: Record<Exclude<AiProviderId, "custom">, string> = {
  deepseek: "https://api.deepseek.com",
  doubao: "https://ark.cn-beijing.volces.com/api/v3",
};

const providerLabels: Record<AiProviderId, string> = {
  deepseek: "DeepSeek",
  doubao: "豆包 / 火山方舟",
  custom: "自定义 OpenAI-compatible",
};

const providerCredentialSlots: Record<AiProviderId, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  doubao: "ARK_API_KEY",
  custom: "AI_CUSTOM_API_KEY",
};

export const aiProfileSettingKeys = {
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
} as const satisfies Record<
  AiModelProfile,
  Record<
    | "baseUrl"
    | "customThinkingProtocol"
    | "model"
    | "provider"
    | "thinkingMode",
    keyof SystemSettings
  >
>;

export const aiPromptDefinitions = {
  programming: [
    {
      defaultValue: defaultAiProgrammingOverviewPrompt,
      description: "用于“理解题目”，控制题意分析、步骤说明和提醒方式。",
      key: "aiProgrammingOverviewPrompt",
      label: "理解题目",
    },
    {
      defaultValue: defaultAiProgrammingNextStepPrompt,
      description: "用于“下一步提示”，控制对学生当前进度的引导方式。",
      key: "aiProgrammingNextStepPrompt",
      label: "下一步提示",
    },
    {
      defaultValue: defaultAiProgrammingCodeReviewPrompt,
      description: "用于“检查代码”，控制问题定位和解释方式。",
      key: "aiProgrammingCodeReviewPrompt",
      label: "检查代码",
    },
    {
      defaultValue: defaultAiProgrammingQuestionPrompt,
      description: "用于学生或校题人员自由提问时的回答方式。",
      key: "aiProgrammingQuestionPrompt",
      label: "自由提问",
    },
  ],
  objective: [
    {
      defaultValue: defaultAiObjectiveExplanationPrompt,
      description: "控制选择题、判断题的整体思路、逐项分析和知识点表达方式。",
      key: "aiObjectiveExplanationPrompt",
      label: "题目解析",
    },
  ],
} as const satisfies Record<
  AiModelProfile,
  ReadonlyArray<{
    defaultValue: string;
    description: string;
    key: keyof SystemSettings;
    label: string;
  }>
>;

export function AiProviderProfileEditor({
  description,
  label,
  onError,
  pending,
  profile,
  settings,
  status,
  update,
}: {
  description: string;
  label: string;
  onError: (message: string) => void;
  pending: boolean;
  profile: AiModelProfile;
  settings: SystemSettings;
  status: AiProviderAdminStatus;
  update: (key: keyof SystemSettings, value: string) => void;
}) {
  const keys = aiProfileSettingKeys[profile];
  const provider = settings[keys.provider] as AiProviderId;
  const baseUrl = settings[keys.baseUrl];
  const model = settings[keys.model];
  const thinkingMode = settings[keys.thinkingMode];
  const customThinkingProtocol = settings[keys.customThinkingProtocol];
  const [availableModels, setAvailableModels] = useState<AiModelOption[]>([]);
  const [customBaseUrl, setCustomBaseUrl] = useState(
    provider === "custom" ? baseUrl : "",
  );
  const [modelMessage, setModelMessage] = useState("");
  const [modelPending, setModelPending] = useState(false);

  function changeProvider(nextProvider: AiProviderId) {
    setAvailableModels([]);
    setModelMessage("");
    onError("");
    if (provider === "custom") {
      setCustomBaseUrl(baseUrl);
    }
    update(keys.provider, nextProvider);
    update(
      keys.baseUrl,
      nextProvider === "custom"
        ? customBaseUrl
        : providerBaseUrls[nextProvider],
    );
    update(keys.model, "");
    if (nextProvider !== "custom") {
      update(keys.customThinkingProtocol, "none");
    }
  }

  function changeBaseUrl(value: string) {
    setCustomBaseUrl(value);
    update(keys.baseUrl, value);
    setAvailableModels([]);
    setModelMessage("");
  }

  async function refreshModels() {
    onError("");
    setModelMessage("");
    if (provider === "custom" && !baseUrl.trim()) {
      onError(`请先填写${label}的自定义 AI Base URL`);
      return;
    }

    setModelPending(true);
    try {
      const response = await fetch("/api/admin/ai-provider/models", {
        body: JSON.stringify({ baseUrl, provider }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        onError(
          typeof data.error === "string" ? data.error : "获取模型列表失败",
        );
        return;
      }
      const models = Array.isArray(data.models)
        ? (data.models as AiModelOption[])
        : [];
      setAvailableModels(models);
      setModelMessage(
        `已获取 ${models.length} 个模型；请按服务商说明选择对话模型。`,
      );
    } catch {
      onError("获取模型列表失败，请检查本地服务和网络");
    } finally {
      setModelPending(false);
    }
  }

  return (
    <section className="border border-steel/20 bg-steel/5 p-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.12em] text-steel">
          {profile === "programming" ? "Programming AI" : "Objective AI"}
        </p>
        <h3 className="mt-1 text-lg font-black">{label}</h3>
        <p className="mt-1 text-xs font-semibold leading-5 text-ink-600">
          {description}
        </p>
      </div>

      <div className="mt-4 border border-ink-950/10 bg-white/60 p-3">
        <div className="grid gap-3 text-xs font-bold text-ink-800 sm:grid-cols-2">
          <div>
            <span className="block text-ink-500">当前服务商</span>
            {providerLabels[status.provider]}
          </div>
          <div>
            <span className="block text-ink-500">当前模型</span>
            <span className="break-all">{status.model}</span>
          </div>
          <div>
            <span className="block text-ink-500">思考模式</span>
            {status.thinkingMode === "enabled" ? "开启" : "关闭"}
          </div>
          <div>
            <span className="block text-ink-500">服务器密钥</span>
            <span
              className={
                status.credentialConfigured
                  ? "text-emerald-700"
                  : "text-rose-700"
              }
            >
              {status.credentialConfigured ? "已配置" : "未配置"}
            </span>
          </div>
        </div>
        <p className="mt-2 break-all text-[11px] font-semibold text-ink-500">
          Base URL：{status.baseUrl}
          {status.legacyFallback
            ? "（来自旧版 DeepSeek 环境配置，保存后转为管理员配置）"
            : ""}
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-1">
        <label className="grid gap-2 text-sm font-bold text-ink-800">
          AI 服务商
          <select
            className="field"
            onChange={(event) =>
              changeProvider(event.target.value as AiProviderId)
            }
            value={provider}
          >
            <option value="deepseek">DeepSeek</option>
            <option value="doubao">豆包 / 火山方舟</option>
            <option value="custom">自定义 OpenAI-compatible</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold text-ink-800">
          Base URL
          <input
            className="field"
            maxLength={300}
            onChange={(event) => changeBaseUrl(event.target.value)}
            readOnly={provider !== "custom"}
            value={baseUrl}
          />
        </label>
      </div>
      <p className="mt-2 text-xs font-semibold text-ink-500">
        当前草稿使用服务器密钥槽：
        <span className="font-black">
          {providerCredentialSlots[provider]}
        </span>
        。更换密钥需修改本地或服务器 .env 后重启服务。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="btn btn-secondary"
          disabled={modelPending || pending}
          onClick={refreshModels}
          type="button"
        >
          <RefreshCw
            className={modelPending ? "animate-spin" : ""}
            size={16}
          />
          {modelPending ? "获取模型中..." : "获取可用模型"}
        </button>
        {modelMessage ? (
          <p className="text-xs font-semibold text-emerald-700">
            {modelMessage}
          </p>
        ) : null}
      </div>

      {availableModels.length ? (
        <label className="mt-4 grid gap-2 text-sm font-bold text-ink-800">
          从服务商列表选择
          <select
            className="field"
            onChange={(event) => {
              if (event.target.value) update(keys.model, event.target.value);
            }}
            value={
              availableModels.some((item) => item.id === model) ? model : ""
            }
          >
            <option value="">请选择模型</option>
            {availableModels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id}
                {item.ownedBy ? ` · ${item.ownedBy}` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-1">
        <TextInput
          label="模型 ID（可手工填写）"
          maxLength={200}
          placeholder="例如服务商提供的 Chat 模型 ID"
          value={model}
          onChange={(value) => update(keys.model, value)}
        />
        <label className="grid gap-2 text-sm font-bold text-ink-800">
          思考模式
          <select
            className="field"
            onChange={(event) => update(keys.thinkingMode, event.target.value)}
            value={thinkingMode}
          >
            <option value="enabled">开启思考</option>
            <option value="disabled">关闭思考</option>
          </select>
        </label>
      </div>

      {provider === "custom" ? (
        <div className="mt-4 border border-amber-300 bg-amber-50 p-3">
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            自定义服务的思考参数协议
            <select
              className="field"
              onChange={(event) =>
                update(keys.customThinkingProtocol, event.target.value)
              }
              value={customThinkingProtocol}
            >
              <option value="none">不发送 thinking 参数（推荐兼容模式）</option>
              <option value="thinking-object">
                发送 thinking: {"{"} type {"}"}
              </option>
            </select>
          </label>
          <p className="mt-2 text-xs font-semibold text-amber-800">
            确认上游兼容后再开启 thinking 参数。
          </p>
        </div>
      ) : null}

      <div className="mt-5 border-t border-ink-950/10 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="font-black text-ink-950">自定义教学提示词</h4>
            <p className="mt-1 text-xs font-semibold leading-5 text-ink-600">
              只调整教学表达和讲解要求。答案、输出格式、隐藏测试点和代码保护规则由服务端固定。
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-3">
          {aiPromptDefinitions[profile].map((definition) => (
            <AiPromptEditor
              definition={definition}
              disabled={pending}
              key={definition.key}
              update={update}
              value={settings[definition.key]}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
function AiPromptEditor({
  definition,
  disabled,
  update,
  value,
}: {
  definition: {
    defaultValue: string;
    description: string;
    key: keyof SystemSettings;
    label: string;
  };
  disabled: boolean;
  update: (key: keyof SystemSettings, value: string) => void;
  value: string;
}) {
  return (
    <details className="border border-ink-950/10 bg-white/55 p-3">
      <summary className="cursor-pointer select-none font-black text-ink-900">
        {definition.label}
      </summary>
      <p className="mt-3 text-xs font-semibold leading-5 text-ink-600">
        {definition.description}
      </p>
      <textarea
        className="field mt-3 min-h-48 resize-y font-mono text-sm leading-6"
        disabled={disabled}
        maxLength={AI_CUSTOM_PROMPT_MAX_CHARS}
        onChange={(event) => update(definition.key, event.target.value)}
        value={value}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span
          className={`text-xs font-bold ${
            value.length >= AI_CUSTOM_PROMPT_MAX_CHARS
              ? "text-rose-700"
              : "text-ink-500"
          }`}
        >
          {value.length}/{AI_CUSTOM_PROMPT_MAX_CHARS}
        </span>
        <button
          className="btn btn-secondary"
          disabled={disabled || value === definition.defaultValue}
          onClick={() => update(definition.key, definition.defaultValue)}
          type="button"
        >
          <RotateCcw size={15} />
          恢复默认
        </button>
      </div>
      <p className="mt-2 text-[11px] font-semibold text-amber-800">
        恢复默认或修改内容后，还需要点击页面底部“保存设置”才会生效。
      </p>
    </details>
  );
}

export function CooldownRow({
  objectiveKey,
  programmingKey,
  roleLabel,
  settings,
  update,
}: {
  objectiveKey?: keyof SystemSettings;
  programmingKey: keyof SystemSettings;
  roleLabel: string;
  settings: SystemSettings;
  update: (key: keyof SystemSettings, value: string) => void;
}) {
  return (
    <tr>
      <th className="px-4 py-3 text-left font-black text-ink-900">
        {roleLabel}
      </th>
      <td className="px-4 py-3">
        <CooldownInput
          label={`${roleLabel}编程题 AI 触发间隔`}
          value={settings[programmingKey]}
          onChange={(value) => update(programmingKey, value)}
        />
      </td>
      <td className="px-4 py-3">
        {objectiveKey ? (
          <CooldownInput
            label={`${roleLabel}选择判断 AI 触发间隔`}
            value={settings[objectiveKey]}
            onChange={(value) => update(objectiveKey, value)}
          />
        ) : (
          <span className="inline-flex border border-ink-950/10 bg-paper-100 px-3 py-2 text-xs font-black text-ink-500">
            不开放
          </span>
        )}
      </td>
    </tr>
  );
}

function CooldownInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 font-bold text-ink-800">
      <span className="sr-only">{label}</span>
      <input
        className="field w-28"
        max={AI_COOLDOWN_MAX_SECONDS}
        min={AI_COOLDOWN_MIN_SECONDS}
        onChange={(event) => onChange(event.target.value)}
        step={1}
        type="number"
        value={value}
      />
      <span>秒</span>
    </label>
  );
}

export function TextInput({
  label,
  maxLength,
  min,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  maxLength?: number;
  min?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-ink-800">
      {label}
      <input
        className="field"
        maxLength={maxLength}
        min={min}
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function Textarea({
  label,
  minHeight = "min-h-28",
  onChange,
  value,
}: {
  label: string;
  minHeight?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-ink-800">
      {label}
      <textarea
        className={`field resize-y ${minHeight}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
