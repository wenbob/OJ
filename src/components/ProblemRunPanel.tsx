"use client";

import { Eraser, FlaskConical, Play } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type {
  RunCppCaseResult,
  RunCppResult,
  RunCppStatus,
} from "@/lib/cppRun";
import { formatRuntime } from "@/lib/format";

type RunMode = "samples" | "custom";

const runStatusLabel: Record<RunCppStatus, string> = {
  sample_passed: "全部公开样例匹配",
  sample_failed: "部分公开样例不匹配",
  completed: "运行完成",
  compile_error: "编译失败",
  runtime_error: "运行时错误",
  time_limit_exceeded: "运行超时",
};

function caseStatusLabel(status: RunCppCaseResult["status"]) {
  if (status === "matched") return "匹配";
  if (status === "mismatched") return "不匹配";
  if (status === "runtime_error") return "运行时错误";
  if (status === "time_limit_exceeded") return "运行超时";
  return "运行完成";
}

export function ProblemRunPanel({
  children,
  code,
  disabled = false,
  disabledMessage,
  examId,
  problemId,
  sampleCount,
  submitPending,
}: {
  children: ReactNode;
  code: string;
  disabled?: boolean;
  disabledMessage?: string;
  examId?: number;
  problemId: number;
  sampleCount: number;
  submitPending: boolean;
}) {
  const [mode, setMode] = useState<RunMode>("samples");
  const [customInput, setCustomInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RunCppResult | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const resultRef = useRef<HTMLDivElement>(null);
  const cooldownSeconds = Math.max(
    0,
    Math.ceil((cooldownUntil - now) / 1000),
  );

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    if (pending || (!result && !error)) return;
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      resultRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error, pending, result]);

  function switchMode(nextMode: RunMode) {
    if (pending) return;
    setMode(nextMode);
    setError("");
    setResult(null);
  }

  async function runCode() {
    if (disabled) {
      setError(disabledMessage ?? "当前不能继续试运行");
      return;
    }
    if (!code.trim()) {
      setError("请先编写代码");
      return;
    }
    if (mode === "samples" && sampleCount === 0) {
      setError("该题暂无公开样例，请使用自定义输入");
      return;
    }

    setPending(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`/api/problems/${problemId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          ...(mode === "custom" ? { customInput } : {}),
          examId,
          mode,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const retryAfterSeconds = Number(data.retryAfterSeconds);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          const until = Date.now() + retryAfterSeconds * 1000;
          setCooldownUntil(until);
          setNow(Date.now());
        }
        setError(data.error ?? "试运行失败，请稍后再试");
        return;
      }

      const nextCooldownSeconds = Number(data.cooldownSeconds);
      if (Number.isFinite(nextCooldownSeconds) && nextCooldownSeconds > 0) {
        const until = Date.now() + nextCooldownSeconds * 1000;
        setCooldownUntil(until);
        setNow(Date.now());
      }
      setResult(data.run as RunCppResult);
    } catch {
      setError("无法连接试运行服务，请稍后再试");
    } finally {
      setPending(false);
    }
  }

  const runDisabled =
    pending || submitPending || disabled || cooldownSeconds > 0;

  return (
    <div className="mt-4">
      <section className="border border-steel/25 bg-[#f3f8fb] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-steel">
              Code Trial
            </p>
            <h3 className="mt-1 font-black text-ink-950">提交前先试一试</h3>
          </div>
          <div
            aria-label="选择试运行方式"
            className="grid grid-cols-2 border border-ink-950/10 bg-white"
            role="tablist"
          >
            <button
              aria-selected={mode === "samples"}
              className={`px-3 py-2 text-sm font-black transition-colors ${
                mode === "samples"
                  ? "bg-ink-950 text-white"
                  : "text-ink-700 hover:bg-stone-100"
              }`}
              disabled={pending}
              onClick={() => switchMode("samples")}
              role="tab"
              type="button"
            >
              运行样例
            </button>
            <button
              aria-selected={mode === "custom"}
              className={`px-3 py-2 text-sm font-black transition-colors ${
                mode === "custom"
                  ? "bg-ink-950 text-white"
                  : "text-ink-700 hover:bg-stone-100"
              }`}
              disabled={pending}
              onClick={() => switchMode("custom")}
              role="tab"
              type="button"
            >
              自定义输入
            </button>
          </div>
        </div>

        {mode === "samples" ? (
          <div className="mt-4 border border-ink-950/10 bg-white/75 p-3">
            {sampleCount > 0 ? (
              <>
                <p className="text-sm font-bold text-ink-700">
                  将一次编译并运行全部 {sampleCount} 组公开样例。
                </p>
                <p className="mt-1 text-xs font-semibold text-amber-800">
                  样例通过不代表全部测试点通过，完成后仍需正式提交。
                </p>
              </>
            ) : (
              <p className="text-sm font-bold text-amber-800">
                该题暂无公开样例，请切换到“自定义输入”。
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-black text-ink-800" htmlFor={`custom-input-${problemId}`}>
                程序输入
              </label>
              <button
                className="inline-flex items-center gap-1 text-xs font-black text-ink-600 hover:text-clay"
                disabled={pending || customInput.length === 0}
                onClick={() => setCustomInput("")}
                type="button"
              >
                <Eraser size={14} />
                清空输入
              </button>
            </div>
            <textarea
              className="mt-2 min-h-32 w-full resize-y border border-ink-950/15 bg-white p-3 font-mono text-sm leading-6 outline-none focus:border-steel"
              id={`custom-input-${problemId}`}
              maxLength={32 * 1024}
              onChange={(event) => setCustomInput(event.target.value)}
              placeholder="按题目的输入格式填写；不需要输入时可以留空。"
              spellCheck={false}
              value={customInput}
            />
          </div>
        )}

        <button
          className="btn btn-secondary mt-3 w-full"
          disabled={runDisabled || (mode === "samples" && sampleCount === 0)}
          onClick={runCode}
          type="button"
        >
          {pending ? <FlaskConical className="animate-pulse" size={16} /> : <Play size={16} />}
          {pending
            ? "正在等待评测资源、编译并运行"
            : cooldownSeconds > 0
              ? `${cooldownSeconds} 秒后可再次运行`
              : mode === "samples"
                ? `运行全部样例${sampleCount > 0 ? `（${sampleCount} 组）` : ""}`
                : "运行自定义输入"}
        </button>
      </section>

      {children}

      <div className="scroll-mt-4" ref={resultRef}>
        {error ? (
          <p
            className="mt-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {result ? (
          <section
            aria-live="polite"
            className="mt-4 border border-ink-950/10 bg-white/75 p-4"
            data-testid="problem-run-result"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-black text-ink-950">
                {runStatusLabel[result.status]}
              </h3>
              <span className="text-xs font-black text-ink-600">
                {formatRuntime(result.runtimeMs)}
              </span>
            </div>
            {result.errorMessage ? (
              <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap border border-rose-200 bg-rose-50 p-3 font-mono text-xs text-rose-700">
                {result.errorMessage}
              </pre>
            ) : null}
            <div className="mt-3 grid gap-3">
              {result.cases.map((item) => {
                const successfulSample = item.status === "matched";
                return (
                  <div
                    className="border border-ink-950/10 bg-stone-50 p-3"
                    key={item.caseIndex}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-black text-ink-900">
                        {item.expectedOutput !== undefined
                          ? `样例 ${item.caseIndex}`
                          : "自定义运行"}
                      </span>
                      <span
                        className={`font-black ${
                          item.status === "matched" || item.status === "completed"
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }`}
                      >
                        {caseStatusLabel(item.status)} · {formatRuntime(item.runtimeMs)}
                      </span>
                    </div>
                    {!successfulSample ? (
                      <div className="mt-3 grid gap-3">
                        <OutputBlock title="输入" value={item.input} />
                        {item.expectedOutput !== undefined ? (
                          <OutputBlock title="标准输出" value={item.expectedOutput} />
                        ) : null}
                        <OutputBlock title="程序输出" value={item.actualOutput} />
                      </div>
                    ) : null}
                    {item.errorMessage && item.errorMessage !== result.errorMessage ? (
                      <pre className="mt-3 whitespace-pre-wrap border border-rose-200 bg-rose-50 p-3 font-mono text-xs text-rose-700">
                        {item.errorMessage}
                      </pre>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {result.status === "sample_passed" ? (
              <p className="mt-3 text-xs font-bold text-amber-800">
                公开样例已经匹配，但隐藏测试点仍需通过“提交代码”检查。
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function OutputBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-black text-ink-600">{title}</p>
      <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap border border-ink-950/10 bg-white p-3 font-mono text-xs text-ink-800">
        {value.length > 0 ? value : "（无内容）"}
      </pre>
    </div>
  );
}
