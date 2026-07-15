"use client";

import {
  ArrowUp,
  BrainCircuit,
  CircleHelp,
  Eraser,
  Lightbulb,
  ScanSearch,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  appendAiChatExchange,
  createAiChatStorageKey,
  readStoredAiChat,
  toAiChatHistory,
  type AiChatMessage,
} from "@/lib/aiChat";

type AiChatMode = "overview" | "next_step" | "code_review" | "question";

const AI_CHAT_COOLDOWN_MS = 20_000;
const AI_CHAT_MAX_QUESTION_CHARS = 300;

const quickPrompts: Record<Exclude<AiChatMode, "question">, string> = {
  overview: "我想先理解这道题",
  next_step: "请告诉我接下来最应该做什么",
  code_review: "请帮我检查当前代码哪里有问题",
};

export function ProblemAiAssist({
  code,
  examId,
  problemId,
  studentId,
}: {
  code: string;
  examId?: number;
  problemId: number;
  studentId?: number;
}) {
  const storageKey = createAiChatStorageKey({ examId, problemId, studentId });
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const messageEndRef = useRef<HTMLDivElement>(null);

  const remainingSeconds = Math.max(
    0,
    Math.ceil((cooldownUntil - now) / 1000),
  );
  const disabled = pending || remainingSeconds > 0;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!storageKey) {
        setMessages([]);
        setLoadedStorageKey(null);
        return;
      }

      setMessages(readStoredAiChat(window.localStorage.getItem(storageKey)));
      setLoadedStorageKey(storageKey);
      setQuestion("");
      setError("");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || loadedStorageKey !== storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify(messages));
  }, [loadedStorageKey, messages, storageKey]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;

    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      messageEndRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, pending]);

  function startCooldown(durationMs = AI_CHAT_COOLDOWN_MS) {
    const startedAt = Date.now();
    setNow(startedAt);
    setCooldownUntil(startedAt + durationMs);
  }

  async function ask(mode: AiChatMode) {
    const userText =
      mode === "question" ? question.trim() : quickPrompts[mode];
    if (!userText) {
      setError("请先写下你对这道题的疑问。");
      return;
    }

    setError("");
    setPending(true);
    setPendingPrompt(userText);

    try {
      const response = await fetch("/api/ai/problem-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          examId,
          history: toAiChatHistory(messages),
          mode,
          problemId,
          question: mode === "question" ? userText : undefined,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const retryAfterSeconds = Number(data?.retryAfterSeconds);
        if (Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0) {
          startCooldown(retryAfterSeconds * 1000);
        } else if (response.status === 502 || response.status === 504) {
          startCooldown();
        }
        const fallbackMessage =
          response.status === 504
            ? "AI 思考时间较长，请稍后再试。"
            : response.status === 502
              ? "AI 这次没有完成回答，请稍后再试。"
              : "AI 请求失败，请稍后再试。";
        setError(
          typeof data?.error === "string" && data.error.trim()
            ? data.error
            : fallbackMessage,
        );
        return;
      }

      const advice = typeof data?.advice === "string" ? data.advice.trim() : "";
      if (!advice) {
        setError("AI 这次没有返回清楚的提示，请稍后再试。");
        startCooldown();
        return;
      }

      const createdAt = Date.now();
      setMessages((current) =>
        appendAiChatExchange(
          current,
          {
            id: `user-${createdAt}-${Math.random()}`,
            role: "user",
            content: userText,
            createdAt,
          },
          {
            id: `assistant-${createdAt}-${Math.random()}`,
            role: "assistant",
            content: advice,
            createdAt: createdAt + 1,
          },
        ),
      );
      if (mode === "question") setQuestion("");
      if (!data?.cached) startCooldown();
    } catch {
      setError("AI 请求失败，请稍后再试。");
      startCooldown();
    } finally {
      setPending(false);
      setPendingPrompt("");
    }
  }

  function clearChat() {
    setMessages([]);
    setError("");
    if (storageKey) window.localStorage.removeItem(storageKey);
  }

  return (
    <section className="mt-4 border border-indigo-200 bg-indigo-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">
            AI Learning Coach
          </p>
          <h3 className="mt-1 flex items-center gap-2 font-black text-indigo-950">
            <BrainCircuit size={18} />
            AI 学习助手
          </h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-indigo-800">
            只辅导当前题目，结合你的最新代码给提示，不直接写答案。
          </p>
        </div>
        {messages.length > 0 ? (
          <button
            className="inline-flex items-center gap-1 text-xs font-black text-indigo-700 hover:text-indigo-950"
            disabled={pending}
            onClick={clearChat}
            type="button"
          >
            <Eraser size={14} />
            清空对话
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <QuickButton
          disabled={disabled}
          icon={<CircleHelp size={15} />}
          label="理解题目"
          onClick={() => ask("overview")}
        />
        <QuickButton
          disabled={disabled}
          icon={<Lightbulb size={15} />}
          label="下一步提示"
          onClick={() => ask("next_step")}
        />
        <QuickButton
          disabled={disabled}
          icon={<ScanSearch size={15} />}
          label="检查当前代码"
          onClick={() => ask("code_review")}
        />
      </div>

      {messages.length > 0 || pending ? (
        <div
          aria-live="polite"
          className="mt-4 max-h-80 space-y-3 overflow-y-auto border border-indigo-200 bg-white/80 p-3"
        >
          {messages.map((message) => (
            <article
              className={`max-w-[92%] border p-3 text-sm font-semibold leading-6 ${
                message.role === "user"
                  ? "ml-auto border-steel/20 bg-steel/10 text-ink-900"
                  : "border-indigo-200 bg-white text-ink-800"
              }`}
              key={message.id}
            >
              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-ink-500">
                {message.role === "user" ? "我的问题" : "AI 提示"}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </article>
          ))}
          {pending ? (
            <div className="border border-indigo-200 bg-indigo-50 p-3 text-sm font-bold leading-6 text-indigo-900">
              <p>{pendingPrompt}</p>
              <p className="mt-1 text-xs text-indigo-700">
                AI 正在结合题目和你的代码思考，难题可能需要几分钟……
              </p>
            </div>
          ) : null}
          <div ref={messageEndRef} />
        </div>
      ) : (
        <div className="mt-4 border border-dashed border-indigo-200 bg-white/60 px-3 py-4 text-center text-xs font-semibold leading-5 text-indigo-800">
          不知道怎么开始时，先点“理解题目”；写到一半卡住时，可以点“下一步提示”。
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <textarea
          aria-label="向 AI 询问当前题目"
          className="field min-h-20 flex-1 resize-y text-sm leading-6"
          disabled={pending}
          maxLength={AI_CHAT_MAX_QUESTION_CHARS}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              if (!disabled) void ask("question");
            }
          }}
          placeholder="只问当前题目，例如：我写到这里了，下一步应该先检查什么？"
          value={question}
        />
        <button
          aria-label="发送当前题目的问题"
          className="btn btn-primary self-stretch px-4"
          disabled={disabled || !question.trim()}
          onClick={() => ask("question")}
          type="button"
        >
          <ArrowUp size={17} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-indigo-700">
        <span>{question.length}/{AI_CHAT_MAX_QUESTION_CHARS} 字 · Ctrl/⌘ + Enter 发送</span>
        {remainingSeconds > 0 ? (
          <span aria-live="polite">请 {remainingSeconds} 秒后再使用 AI</span>
        ) : (
          <span>每次使用间隔 20 秒</span>
        )}
      </div>

      {error ? (
        <p
          className="mt-3 border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function QuickButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex min-h-10 items-center justify-center gap-2 border border-indigo-200 bg-white px-3 py-2 text-xs font-black text-indigo-900 transition hover:-translate-y-0.5 hover:border-indigo-400 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
