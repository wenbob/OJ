"use client";

import { Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";

export function ProblemAiAssist({
  examId,
  problemId,
}: {
  examId?: number;
  problemId: number;
}) {
  const [advice, setAdvice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const remainingSeconds = Math.max(
    0,
    Math.ceil((cooldownUntil - now) / 1000),
  );
  const disabled = pending || remainingSeconds > 0;

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  function startCooldown(durationMs: number) {
    const startedAt = Date.now();
    setNow(startedAt);
    setCooldownUntil(startedAt + durationMs);
  }

  async function ask() {
    setError("");
    setAdvice("");
    setPending(true);

    try {
      const response = await fetch("/api/ai/problem-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, mode: "hint", problemId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const retryAfterSeconds = Number(data.retryAfterSeconds);
        if (Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0) {
          startCooldown(retryAfterSeconds * 1000);
        }
        setError(data.error ?? "AI 请求失败");
        return;
      }

      const nextAdvice =
        typeof data.advice === "string" ? data.advice.trim() : "";
      if (!nextAdvice) {
        setError("AI 这次没有返回清楚的思路，请稍后再试。");
        return;
      }

      setAdvice(nextAdvice);
    } catch {
      setError("AI 请求失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 border border-indigo-200 bg-indigo-50/80 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-indigo-950">AI 助手</h3>
          <p className="mt-1 text-xs font-semibold text-indigo-800">
            AI 会先分析题目，再按步骤给思路；不直接给答案。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-secondary"
            disabled={disabled}
            onClick={ask}
            type="button"
          >
            <Lightbulb size={16} />
            {pending ? "分析中..." : "AI 思路"}
          </button>
        </div>
      </div>

      {remainingSeconds > 0 ? (
        <p className="mt-3 text-xs font-bold text-indigo-800">
          请 {remainingSeconds} 秒后再使用 AI。
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700">
          {error}
        </p>
      ) : null}

      {advice ? (
        <div className="mt-4 max-h-[48vh] overflow-auto whitespace-pre-wrap border border-indigo-200 bg-white p-4 text-[15px] font-semibold leading-7 text-ink-800">
          {advice}
        </div>
      ) : null}
    </div>
  );
}
