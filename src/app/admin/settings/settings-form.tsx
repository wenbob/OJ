"use client";

import Image from "next/image";
import { ImagePlus, RotateCcw, Save } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import { notifyBrowserIdentityUpdated } from "@/components/BrowserIdentity";
import type {
  AiProviderAdminStatus,
  AiProviderAdminStatuses,
} from "@/lib/aiProvider";
import { MAX_BROWSER_ICON_BYTES, resolveBrowserTitle } from "@/lib/browserIdentity";
import {
  AI_CUSTOM_PROMPT_MAX_CHARS,
  AI_COOLDOWN_MAX_SECONDS,
  AI_COOLDOWN_MIN_SECONDS,
  isValidAiCooldownSeconds,
  type SystemSettings,
} from "@/lib/settings";
import {
  AiProviderProfileEditor,
  CooldownRow,
  Textarea,
  TextInput,
  aiProfileSettingKeys,
  aiPromptDefinitions,
} from "./settings-form-sections";

export function SettingsForm({
  initialAiProviderStatuses,
  initialSettings,
}: {
  initialAiProviderStatuses: AiProviderAdminStatuses;
  initialSettings: SystemSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [aiProviderStatuses, setAiProviderStatuses] = useState(
    initialAiProviderStatuses,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function update(key: keyof SystemSettings, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
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
    for (const profile of ["programming", "objective"] as const) {
      const keys = aiProfileSettingKeys[profile];
      const label = profile === "programming" ? "编程题" : "选择判断题";
      if (!settings[keys.model].trim()) {
        setError(`${label} AI 模型 ID 不能为空`);
        return;
      }
      if (
        settings[keys.provider] === "custom" &&
        !settings[keys.baseUrl].trim()
      ) {
        setError(`${label}自定义 AI 服务必须填写 Base URL`);
        return;
      }
    }
    for (const definition of [
      ...aiPromptDefinitions.programming,
      ...aiPromptDefinitions.objective,
    ]) {
      const value = settings[definition.key];
      if (!value.trim()) {
        setError(`${definition.label}提示词不能为空`);
        return;
      }
      if (value.length > AI_CUSTOM_PROMPT_MAX_CHARS) {
        setError(
          `${definition.label}提示词不能超过 ${AI_CUSTOM_PROMPT_MAX_CHARS} 个字`,
        );
        return;
      }
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
        setError(`${definition.label}提示词不能包含非法控制字符`);
        return;
      }
    }
    for (const [label, value] of [
      ["学生编程助手", settings.aiProgrammingStudentCooldownSeconds],
      ["老师学情摘要", settings.aiProgrammingTeacherCooldownSeconds],
      ["管理员学情摘要", settings.aiProgrammingAdminCooldownSeconds],
      ["学生选择判断解析", settings.aiObjectiveStudentCooldownSeconds],
      ["老师选择判断解析", settings.aiObjectiveTeacherCooldownSeconds],
      ["管理员选择判断解析", settings.aiObjectiveAdminCooldownSeconds],
    ] as const) {
      if (!isValidAiCooldownSeconds(value)) {
        setError(
          `${label}触发间隔必须是 ${AI_COOLDOWN_MIN_SECONDS}–${AI_COOLDOWN_MAX_SECONDS} 秒的整数`,
        );
        return;
      }
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
      if (data.aiProviderStatuses) {
        setAiProviderStatuses(
          data.aiProviderStatuses as AiProviderAdminStatuses,
        );
      } else if (data.aiProviderStatus) {
        setAiProviderStatuses((current) => ({
          ...current,
          programming: data.aiProviderStatus as AiProviderAdminStatus,
        }));
      }
      notifyBrowserIdentityUpdated(savedSettings);
      setMessage("设置已保存，两类 AI 模型、提示词与角色触发间隔已经生效");
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
          编程题与选择判断题可以使用不同服务商、模型和思考模式。API Key
          仍只从服务器环境变量读取，不会写入数据库或发送到浏览器。
        </p>

        <div className="mt-5 grid gap-5 2xl:grid-cols-2">
          <AiProviderProfileEditor
            label="编程题 AI 模型"
            description="用于学生编程助手、后台编程校题助手，以及老师和管理员的学情 AI 摘要。"
            onError={setError}
            pending={pending}
            profile="programming"
            settings={settings}
            status={aiProviderStatuses.programming}
            update={update}
          />
          <AiProviderProfileEditor
            label="选择判断 AI 模型"
            description="用于管理员和老师校题时生成选择题、判断题解析。"
            onError={setError}
            pending={pending}
            profile="objective"
            settings={settings}
            status={aiProviderStatuses.objective}
            update={update}
          />
        </div>

        <div className="mt-6 border-t border-ink-950/10 pt-5">
          <h3 className="text-lg font-black">角色 AI 触发间隔</h3>
          <p className="mt-2 text-sm font-semibold text-ink-600">
            只在真正调用上游模型时开始计时；有效缓存和幂等重放不会消耗间隔。
          </p>
          <div className="mt-4 overflow-x-auto border border-ink-950/10">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead className="bg-paper-100 text-left text-xs font-black uppercase tracking-[0.08em] text-ink-600">
                <tr>
                  <th className="border-b border-ink-950/10 px-4 py-3">角色</th>
                  <th className="border-b border-ink-950/10 px-4 py-3">
                    编程题 AI
                  </th>
                  <th className="border-b border-ink-950/10 px-4 py-3">
                    选择判断 AI
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-950/10 bg-white/45">
                <CooldownRow
                  objectiveKey="aiObjectiveStudentCooldownSeconds"
                  programmingKey="aiProgrammingStudentCooldownSeconds"
                  roleLabel="学生"
                  settings={settings}
                  update={update}
                />
                <CooldownRow
                  objectiveKey="aiObjectiveTeacherCooldownSeconds"
                  programmingKey="aiProgrammingTeacherCooldownSeconds"
                  roleLabel="老师"
                  settings={settings}
                  update={update}
                />
                <CooldownRow
                  objectiveKey="aiObjectiveAdminCooldownSeconds"
                  programmingKey="aiProgrammingAdminCooldownSeconds"
                  roleLabel="管理员"
                  settings={settings}
                  update={update}
                />
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs font-semibold text-ink-500">
            客观题间隔同时用于首次生成和主动刷新；有效共享缓存的普通读取不计时。
          </p>
        </div>

        <div className="mt-6 border-t border-ink-950/10 pt-5">
          <label className="inline-flex items-center gap-3 text-sm font-bold text-ink-800">
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
          <label className="mt-5 inline-flex items-center gap-3 text-sm font-bold text-ink-800">
            <input
              checked={settings.aiObjectiveExplanationEnabled === "true"}
              type="checkbox"
              onChange={(event) =>
                update(
                  "aiObjectiveExplanationEnabled",
                  event.target.checked ? "true" : "false",
                )
              }
            />
            选择判断题开启 AI 解析
          </label>
          <p className="mt-2 text-sm font-semibold text-ink-600">
            解析结果由管理员、老师和获授权学生共享；任一角色重新生成成功后都会更新共享版本。
          </p>
          <label className="mt-5 inline-flex items-center gap-3 text-sm font-bold text-ink-800">
            <input
              checked={settings.aiStudentObjectiveExplanationEnabled === "true"}
              type="checkbox"
              onChange={(event) =>
                update(
                  "aiStudentObjectiveExplanationEnabled",
                  event.target.checked ? "true" : "false",
                )
              }
            />
            学生端开启选择判断 AI 解析
          </label>
          <p className="mt-2 text-sm font-semibold text-ink-600">
            还需学生个人权限开启且当前题已完成至少一次日常提交；正式考试中始终不可用。
          </p>
          <label className="mt-5 inline-flex items-center gap-3 text-sm font-bold text-ink-800">
            <input
              checked={settings.aiStaffProgrammingAssistEnabled === "true"}
              type="checkbox"
              onChange={(event) =>
                update(
                  "aiStaffProgrammingAssistEnabled",
                  event.target.checked ? "true" : "false",
                )
              }
            />
            后台开启编程题 AI 助手
          </label>
          <p className="mt-2 text-sm font-semibold text-ink-600">
            供管理员和老师校题使用，不受学生日常或考试 AI 开关影响。
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
