"use client";

import Image from "next/image";
import { ImagePlus, RefreshCw, RotateCcw, Save } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import { notifyBrowserIdentityUpdated } from "@/components/BrowserIdentity";
import type {
  AiModelOption,
  AiProviderAdminStatus,
  AiProviderId,
} from "@/lib/aiProvider";
import { MAX_BROWSER_ICON_BYTES, resolveBrowserTitle } from "@/lib/browserIdentity";
import type { SystemSettings } from "@/lib/settings";

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

export function SettingsForm({
  initialAiProviderStatus,
  initialSettings,
}: {
  initialAiProviderStatus: AiProviderAdminStatus;
  initialSettings: SystemSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [aiProviderStatus, setAiProviderStatus] = useState(
    initialAiProviderStatus,
  );
  const [availableModels, setAvailableModels] = useState<AiModelOption[]>([]);
  const [customBaseUrl, setCustomBaseUrl] = useState(
    initialSettings.aiProvider === "custom" ? initialSettings.aiBaseUrl : "",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [modelMessage, setModelMessage] = useState("");
  const [modelPending, setModelPending] = useState(false);
  const [pending, setPending] = useState(false);

  function update(key: keyof SystemSettings, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function changeAiProvider(provider: AiProviderId) {
    setAvailableModels([]);
    setModelMessage("");
    setError("");
    if (settings.aiProvider === "custom") {
      setCustomBaseUrl(settings.aiBaseUrl);
    }
    setSettings((current) => {
      return {
        ...current,
        aiBaseUrl:
          provider === "custom" ? customBaseUrl : providerBaseUrls[provider],
        aiModel: "",
        aiProvider: provider,
        aiCustomThinkingProtocol:
          provider === "custom" ? current.aiCustomThinkingProtocol : "none",
      };
    });
  }

  function changeAiBaseUrl(value: string) {
    setCustomBaseUrl(value);
    update("aiBaseUrl", value);
    setAvailableModels([]);
    setModelMessage("");
  }

  async function refreshModels() {
    setError("");
    setModelMessage("");
    if (settings.aiProvider === "custom" && !settings.aiBaseUrl.trim()) {
      setError("请先填写自定义 AI Base URL");
      return;
    }

    setModelPending(true);
    try {
      const response = await fetch("/api/admin/ai-provider/models", {
        body: JSON.stringify({
          baseUrl: settings.aiBaseUrl,
          provider: settings.aiProvider,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "获取模型列表失败");
        return;
      }
      const models = Array.isArray(data.models)
        ? (data.models as AiModelOption[])
        : [];
      setAvailableModels(models);
      setModelMessage(
        `已获取 ${models.length} 个模型；列表中可能包含非对话模型，请按服务商说明选择。`,
      );
    } catch {
      setError("获取模型列表失败，请检查本地服务和网络");
    } finally {
      setModelPending(false);
    }
  }

  function uploadBrowserIcon(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage("");
    setError("");

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "png" && extension !== "ico") {
      setError("浏览器标签图标仅支持 PNG 或 ICO 文件");
      return;
    }
    if (file.size > MAX_BROWSER_ICON_BYTES) {
      setError("浏览器标签图标不能超过 256KB");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setError("图标读取失败，请重新选择");
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = result.indexOf(",");
      if (commaIndex === -1) {
        setError("图标读取失败，请重新选择");
        return;
      }
      const mime = extension === "ico" ? "image/x-icon" : "image/png";
      update("browserIcon", `data:${mime};base64,${result.slice(commaIndex + 1)}`);
    };
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!settings.siteName.trim()) {
      setError("平台名称不能为空");
      return;
    }
    if (Number(settings.defaultTimeLimitMs) <= 0) {
      setError("默认评测时间限制必须大于 0");
      return;
    }
    if (Number(settings.defaultMemoryLimitMb) <= 0) {
      setError("默认评测内存限制必须大于 0");
      return;
    }
    if (!settings.aiModel.trim()) {
      setError("AI 模型 ID 不能为空");
      return;
    }
    if (settings.aiProvider === "custom" && !settings.aiBaseUrl.trim()) {
      setError("自定义 AI 服务必须填写 Base URL");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "保存设置失败");
        return;
      }

      const savedSettings = (data.settings ?? settings) as SystemSettings;
      setSettings(savedSettings);
      if (data.aiProviderStatus) {
        setAiProviderStatus(data.aiProviderStatus as AiProviderAdminStatus);
      }
      notifyBrowserIdentityUpdated(savedSettings);
      setMessage("设置已保存，学生助手和教师学情摘要会统一使用新配置");
    } catch {
      setError("保存设置失败，请检查本地服务");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-6" onSubmit={submit}>
      <section className="surface p-5">
        <h2 className="text-xl font-black">基础设置</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TextInput
            label="平台名称"
            value={settings.siteName}
            onChange={(value) => update("siteName", value)}
          />
          <TextInput
            label="平台副标题"
            value={settings.siteSubtitle}
            onChange={(value) => update("siteSubtitle", value)}
          />
          <Textarea
            label="学生端公告"
            value={settings.studentNotice}
            onChange={(value) => update("studentNotice", value)}
          />
          <Textarea
            label="管理员端公告"
            value={settings.adminNotice}
            onChange={(value) => update("adminNotice", value)}
          />
        </div>
      </section>

      <section className="surface p-5">
        <h2 className="text-xl font-black">浏览器标签设置</h2>
        <p className="mt-2 text-sm font-semibold text-ink-600">
          控制浏览器标签页显示的名称和小图标。名称留空时自动使用平台名称。
        </p>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <TextInput
            label="浏览器标签名称"
            maxLength={60}
            placeholder={`留空则显示：${settings.siteName}`}
            value={settings.browserTitle}
            onChange={(value) => update("browserTitle", value)}
          />
          <div className="border border-ink-950/10 bg-paper-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-ink-500">当前预览</p>
            <div className="mt-2 flex items-center gap-3">
              {settings.browserIcon ? (
                <Image
                  alt="浏览器标签图标预览"
                  className="h-10 w-10 object-contain"
                  height={40}
                  src={settings.browserIcon}
                  unoptimized
                  width={40}
                />
              ) : (
                <span className="grid h-10 w-10 place-items-center border border-dashed border-ink-950/20 text-xs font-black text-ink-400">默认</span>
              )}
              <span className="max-w-64 truncate font-black text-ink-950">
                {resolveBrowserTitle(settings)}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="btn btn-secondary cursor-pointer">
            <ImagePlus size={16} />上传 PNG / ICO
            <input
              accept=".png,.ico,image/png,image/x-icon,image/vnd.microsoft.icon"
              className="sr-only"
              onChange={uploadBrowserIcon}
              type="file"
            />
          </label>
          <button
            className="btn btn-secondary"
            disabled={!settings.browserIcon}
            onClick={() => update("browserIcon", "")}
            type="button"
          >
            <RotateCcw size={16} />恢复默认图标
          </button>
          <p className="text-xs font-semibold text-ink-500">建议使用正方形 64×64 或 128×128 图片，最大 256KB。</p>
        </div>
      </section>

      <section className="surface p-5">
        <h2 className="text-xl font-black">评测默认设置</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TextInput
            label="默认时间限制（ms）"
            min={1}
            type="number"
            value={settings.defaultTimeLimitMs}
            onChange={(value) => update("defaultTimeLimitMs", value)}
          />
          <TextInput
            label="默认内存限制（MB）"
            min={1}
            type="number"
            value={settings.defaultMemoryLimitMb}
            onChange={(value) => update("defaultMemoryLimitMb", value)}
          />
        </div>
        <div className="mt-4">
          <Textarea
            label="默认 C++ 代码模板"
            minHeight="min-h-72"
            value={settings.defaultCppTemplate}
            onChange={(value) => update("defaultCppTemplate", value)}
          />
        </div>
      </section>

      <section className="surface p-5">
        <h2 className="text-xl font-black">AI 助手设置</h2>
        <p className="mt-2 text-sm font-semibold text-ink-600">
          服务商、模型与思考模式会同时作用于学生 AI 助手和教师学情摘要。API Key
          只从服务器环境变量读取，不会写入数据库或发送到浏览器。
        </p>

        <div className="mt-5 border border-steel/20 bg-steel/5 p-4">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-steel">
            当前生效配置
          </p>
          <div className="mt-3 grid gap-3 text-sm font-bold text-ink-800 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <span className="block text-xs text-ink-500">服务商</span>
              {providerLabels[aiProviderStatus.provider]}
            </div>
            <div>
              <span className="block text-xs text-ink-500">模型</span>
              <span className="break-all">{aiProviderStatus.model}</span>
            </div>
            <div>
              <span className="block text-xs text-ink-500">思考模式</span>
              {aiProviderStatus.thinkingMode === "enabled" ? "开启" : "关闭"}
            </div>
            <div>
              <span className="block text-xs text-ink-500">服务器密钥</span>
              <span
                className={
                  aiProviderStatus.credentialConfigured
                    ? "text-emerald-700"
                    : "text-rose-700"
                }
              >
                {aiProviderStatus.credentialConfigured
                  ? "已配置"
                  : "未配置"}
              </span>
            </div>
          </div>
          <p className="mt-3 break-all text-xs font-semibold text-ink-500">
            Base URL：{aiProviderStatus.baseUrl}
            {aiProviderStatus.legacyFallback
              ? "（当前来自旧版 DeepSeek 环境配置，保存本页后转为管理员配置）"
              : ""}
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            AI 服务商
            <select
              className="field"
              onChange={(event) =>
                changeAiProvider(event.target.value as AiProviderId)
              }
              value={settings.aiProvider}
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
              onChange={(event) => changeAiBaseUrl(event.target.value)}
              readOnly={settings.aiProvider !== "custom"}
              value={settings.aiBaseUrl}
            />
          </label>
        </div>
        <p className="mt-2 text-xs font-semibold text-ink-500">
          当前草稿使用服务器密钥槽：
          <span className="font-black">
            {providerCredentialSlots[settings.aiProvider as AiProviderId]}
          </span>
          。如需新增或更换密钥，请修改本地/服务器 .env 后重启服务。
        </p>

        <div className="mt-5 flex flex-wrap items-end gap-3">
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
          <label className="mt-4 grid max-w-2xl gap-2 text-sm font-bold text-ink-800">
            从服务商列表选择
            <select
              className="field"
              onChange={(event) => {
                if (event.target.value) update("aiModel", event.target.value);
              }}
              value={
                availableModels.some((item) => item.id === settings.aiModel)
                  ? settings.aiModel
                  : ""
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

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <TextInput
            label="模型 ID（可手工填写）"
            maxLength={200}
            placeholder="例如服务商提供的 Chat 模型 ID"
            value={settings.aiModel}
            onChange={(value) => update("aiModel", value)}
          />
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            思考模式
            <select
              className="field"
              onChange={(event) =>
                update("aiThinkingMode", event.target.value)
              }
              value={settings.aiThinkingMode}
            >
              <option value="enabled">开启思考</option>
              <option value="disabled">关闭思考</option>
            </select>
          </label>
        </div>

        {settings.aiProvider === "custom" ? (
          <div className="mt-4 border border-amber-300 bg-amber-50 p-4">
            <label className="grid max-w-2xl gap-2 text-sm font-bold text-ink-800">
              自定义服务的思考参数协议
              <select
                className="field"
                onChange={(event) =>
                  update("aiCustomThinkingProtocol", event.target.value)
                }
                value={settings.aiCustomThinkingProtocol}
              >
                <option value="none">不发送 thinking 参数（推荐兼容模式）</option>
                <option value="thinking-object">
                  发送 thinking: {"{"} type {"}"}
                </option>
              </select>
            </label>
            <p className="mt-2 text-xs font-semibold text-amber-800">
              选择“不发送”时，思考行为由模型本身决定；确认上游兼容后再开启
              thinking 参数。
            </p>
          </div>
        ) : null}

        <div className="mt-6 border-t border-ink-950/10 pt-5">
        <label className="mt-5 inline-flex items-center gap-3 text-sm font-bold text-ink-800">
          <input
            checked={settings.aiPracticeEnabled === "true"}
            type="checkbox"
            onChange={(event) =>
              update("aiPracticeEnabled", event.target.checked ? "true" : "false")
            }
          />
          日常练习开启 AI 思路
        </label>
        <p className="mt-2 text-sm font-semibold text-ink-600">
          关闭后，学生日常刷题页不会显示 AI 按钮；服务端接口也会拒绝请求。
        </p>
        <label className="mt-5 grid max-w-md gap-2 text-sm font-bold text-ink-800">
          AI 对话记录保留时间
          <select
            className="field"
            onChange={(event) => update("aiConversationRetentionDays", event.target.value)}
            value={settings.aiConversationRetentionDays}
          >
            <option value="30">30 天</option>
            <option value="90">90 天</option>
            <option value="180">180 天（推荐）</option>
            <option value="365">365 天</option>
            <option value="0">永久保留</option>
          </select>
        </label>
        <p className="mt-2 text-sm font-semibold text-ink-600">
          只保存学生可见的问答和调用统计，不保存学生代码、完整 Prompt 或模型推理内容。
        </p>
        </div>
      </section>

      <section className="surface p-5">
        <h2 className="text-xl font-black">注册设置</h2>
        <label className="mt-5 inline-flex items-center gap-3 text-sm font-bold text-ink-800">
          <input
            checked={settings.allowStudentRegister === "true"}
            type="checkbox"
            onChange={(event) =>
              update("allowStudentRegister", event.target.checked ? "true" : "false")
            }
          />
          允许学生自助注册
        </label>
        <p className="mt-2 text-sm font-semibold text-ink-600">
          当前 Demo 暂未开放注册页，此开关先作为后续注册功能预留。
        </p>
      </section>

      {message ? (
        <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary justify-center" disabled={pending} type="submit">
        <Save size={16} />
        {pending ? "保存中..." : "保存设置"}
      </button>
    </form>
  );
}

function TextInput({
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

function Textarea({
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
