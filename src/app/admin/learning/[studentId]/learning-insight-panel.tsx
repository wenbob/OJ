"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import type { LearningWindow } from "@/lib/learningAnalytics";

export function LearningInsightPanel({
  initialGeneratedAt,
  initialStale,
  initialSummary,
  studentId,
  window,
}: {
  initialGeneratedAt: string | null;
  initialStale: boolean;
  initialSummary: string | null;
  studentId: number;
  window: LearningWindow;
}) {
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt);
  const [stale, setStale] = useState(initialStale);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function generate(force: boolean) {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/learning/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, studentId, window }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "AI 摘要生成失败");
      setSummary(data.aiSummary ?? "");
      setGeneratedAt(data.generatedAt ?? null);
      setStale(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 摘要生成失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="surface overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-950/10 p-5">
        <div>
          <p className="arena-kicker">AI Teacher Brief</p>
          <h2 className="mt-1 text-xl font-black">AI 学情摘要</h2>
          <p className="mt-1 text-xs font-bold text-ink-600">
            只发送聚合统计，不发送学生代码、隐藏测试点或 AI 对话。
          </p>
        </div>
        <button
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => generate(Boolean(summary))}
          type="button"
        >
          {summary ? <RefreshCw size={16} /> : <Sparkles size={16} />}
          {pending ? "正在整理" : summary ? "重新生成" : "生成摘要"}
        </button>
      </div>
      <div className="p-5">
        {stale ? (
          <p className="mb-3 border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
            学情数据已经变化，当前摘要已过期，可重新生成。
          </p>
        ) : null}
        {error ? (
          <p className="mb-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">
            {error} 规则诊断和专项练习下发不受影响。
          </p>
        ) : null}
        {summary ? (
          <div className="whitespace-pre-wrap text-sm font-semibold leading-7 text-ink-800">
            {summary}
          </div>
        ) : (
          <div className="border border-dashed border-ink-950/20 p-6 text-center text-sm font-semibold text-ink-600">
            点击“生成摘要”，让 AI 把当前规则统计整理成教师可读的教学建议。
          </div>
        )}
        {generatedAt ? (
          <p className="mt-4 text-xs font-bold text-ink-500">
            生成时间：{new Date(generatedAt).toLocaleString("zh-CN")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
