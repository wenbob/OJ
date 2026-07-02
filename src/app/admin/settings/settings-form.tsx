"use client";

import { Save } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import type { SystemSettings } from "@/lib/settings";

export function SettingsForm({ initialSettings }: { initialSettings: SystemSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function update(key: keyof SystemSettings, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
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

    setPending(true);
    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await response.json().catch(() => ({}));
    setPending(false);

    if (!response.ok) {
      setError(data.error ?? "保存设置失败");
      return;
    }

    setSettings(data.settings ?? settings);
    setMessage("设置已保存");
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
  min,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  min?: number;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-ink-800">
      {label}
      <input
        className="field"
        min={min}
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
