"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProblemType } from "@/lib/objectiveProblem";

type ExamFormValue = {
  id?: number;
  title: string;
  description: string;
  durationMin: string;
  status: string;
  examType: ProblemType;
  aiEnabled: boolean;
};

export function ExamFormClient({
  basePath,
  initialValue = {
    title: "",
    description: "",
    durationMin: "90",
    status: "draft",
    examType: "programming",
    aiEnabled: false,
  },
  lockExamType = false,
  mode,
}: {
  basePath: "/admin" | "/teacher";
  initialValue?: ExamFormValue;
  lockExamType?: boolean;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [form, setForm] = useState(initialValue);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const coreLocked = mode === "edit" && initialValue.status !== "draft";
  const endedLocked = mode === "edit" && initialValue.status === "ended";
  const statusOptions =
    mode === "create"
      ? [{ label: "draft 草稿", value: "draft" }]
      : initialValue.status === "draft"
        ? [
            { label: "draft 草稿", value: "draft" },
            { label: "published 已发布", value: "published" },
          ]
        : initialValue.status === "published"
          ? [
              { label: "published 已发布", value: "published" },
              { label: "ended 已结束", value: "ended" },
            ]
          : [{ label: "ended 已结束", value: "ended" }];

  function update(field: keyof ExamFormValue, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit() {
    if (!form.title.trim()) {
      setMessage("考试名称不能为空");
      return;
    }
    const duration = Number(form.durationMin);
    if (!Number.isInteger(duration) || duration <= 0) {
      setMessage("考试时长必须大于 0 分钟");
      return;
    }

    setPending(true);
    setMessage("");
    const url =
      mode === "create" ? "/api/admin/exams" : `/api/admin/exams/${form.id}`;
    try {
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          durationMin: form.durationMin,
          status: form.status,
          examType: form.examType,
          aiEnabled: form.aiEnabled,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.error ?? "保存失败");
        return;
      }

      const examId = data.exam?.id ?? form.id;
      router.push(
        mode === "create"
          ? `${basePath}/exams/${examId}/edit`
          : `${basePath}/exams`,
      );
      router.refresh();
    } catch {
      setMessage("网络异常，保存失败，请检查连接后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="surface p-5">
      {message ? (
        <p className="mb-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {message}
        </p>
      ) : null}
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-bold text-ink-800">
          考试名称
          <input
            className="field"
            disabled={coreLocked}
            onChange={(event) => update("title", event.target.value)}
            value={form.title}
          />
        </label>
        <label className="grid gap-2 text-sm font-bold text-ink-800">
          考试说明
          <textarea
            className="field min-h-28"
            disabled={coreLocked}
            onChange={(event) => update("description", event.target.value)}
            value={form.description}
          />
        </label>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            考试类型
            <select
              className="field"
              disabled={lockExamType || coreLocked}
              onChange={(event) =>
                update("examType", event.target.value as ProblemType)
              }
              value={form.examType}
            >
              <option value="programming">编程题考试</option>
              <option value="objective">选择判断考试</option>
            </select>
            {lockExamType ? (
              <span className="text-xs font-semibold text-ink-600">
                考试已有题目，移除全部题目后才能修改类型。
              </span>
            ) : null}
          </label>
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            考试时长（分钟）
            <input
              className="field"
              disabled={coreLocked}
              min={1}
              onChange={(event) => update("durationMin", event.target.value)}
              type="number"
              value={form.durationMin}
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            状态
            <select
              className="field"
              disabled={endedLocked}
              onChange={(event) => update("status", event.target.value)}
              value={form.status}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {coreLocked ? (
          <p className="text-xs font-semibold text-ink-600">
            {endedLocked
              ? "考试已经结束，内容和开关均不可再修改。"
              : "已发布考试只能调整 AI 开关或结束考试；若尚无学生记录，可先在列表取消发布后再编辑内容。"}
          </p>
        ) : null}
        <label className="inline-flex items-center gap-3 text-sm font-bold text-ink-800">
          <input
            checked={form.aiEnabled}
            disabled={endedLocked}
            type="checkbox"
            onChange={(event) => update("aiEnabled", event.target.checked)}
          />
          本场考试开启 AI 思路
        </label>
        <p className="-mt-2 text-xs font-semibold text-ink-600">
          关闭后，学生考试答题页不会显示 AI 按钮；选择判断题默认不显示 AI。
        </p>
        <button
          className="btn btn-primary justify-center"
          disabled={pending || endedLocked}
          onClick={submit}
          type="button"
        >
          {pending
            ? "保存中..."
            : endedLocked
              ? "考试已结束"
              : mode === "create"
                ? "创建考试"
                : "保存考试"}
        </button>
      </div>
    </section>
  );
}
