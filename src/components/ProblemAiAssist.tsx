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
  AI_CHAT_QUICK_PROMPTS,
  createAiChatClientId,
  createAiChatStorageKey,
  readStoredAiChatState,
  serializeAiChatState,
  toAiChatHistory,
  type AiChatMessage,
} from "@/lib/aiChat";
import { readAiAssistEventStream } from "@/lib/aiAssistStream";

type AiChatMode = "overview" | "next_step" | "code_review" | "question";

const AI_CHAT_MAX_QUESTION_CHARS = 300;

export function ProblemAiAssist({
  code,
  endpoint = "/api/ai/problem-assist",
  examId,
  initialCooldownSeconds,
  problemId,
  studentId,
}: {
  code: string;
  endpoint?: string;
  examId?: number;
  initialCooldownSeconds?: number;
  problemId: number;
  studentId?: number;
}) {
  const storageKey = createAiChatStorageKey({ examId, problemId, studentId });
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [streamingAdvice, setStreamingAdvice] = useState("");
  const [streamStatus, setStreamStatus] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [configuredCooldownSeconds, setConfiguredCooldownSeconds] = useState(
    initialCooldownSeconds ?? 0,
  );
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
        setConversationId("");
        setLoadedStorageKey(null);
        return;
      }

      const stored = readStoredAiChatState(
        window.localStorage.getItem(storageKey),
      );
      setMessages(stored.messages);
      setConversationId(stored.conversationId);
      setLoadedStorageKey(storageKey);
      setQuestion("");
      setError("");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || loadedStorageKey !== storageKey || !conversationId) return;
    window.localStorage.setItem(
      storageKey,
      serializeAiChatState({ conversationId, messages }),
    );
  }, [conversationId, loadedStorageKey, messages, storageKey]);

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
  }, [messages, pending, streamingAdvice, streamStatus]);

  function startCooldown(durationSeconds: number) {
    if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) return;
    const startedAt = Date.now();
    setNow(startedAt);
    setCooldownUntil(startedAt + durationSeconds * 1_000);
  }

  async function ask(mode: AiChatMode) {
    const userText =
      mode === "question" ? question.trim() : AI_CHAT_QUICK_PROMPTS[mode];
    if (!userText) {
      setError("请先写下你对这道题的疑问。");
      return;
    }

    setError("");
    setPending(true);
    setPendingPrompt(userText);
    setStreamingAdvice("");
    setStreamStatus("AI 已收到问题，正在准备思考……");
    const requestId = createAiChatClientId();

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          conversationId: conversationId || createAiChatClientId(),
          examId,
          history: toAiChatHistory(messages),
          mode,
          problemId,
          question: mode === "question" ? userText : undefined,
          requestId,
          stream: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (typeof data?.conversationId === "string" && data.conversationId) {
          setConversationId(data.conversationId);
        }
        const retryAfterSeconds = Number(data?.retryAfterSeconds);
        const responseCooldownSeconds = Number(data?.cooldownSeconds);
        if (
          Number.isInteger(responseCooldownSeconds) &&
          responseCooldownSeconds > 0
        ) {
          setConfiguredCooldownSeconds(responseCooldownSeconds);
          startCooldown(responseCooldownSeconds);
        } else if (
          Number.isInteger(retryAfterSeconds) &&
          retryAfterSeconds > 0
        ) {
          startCooldown(retryAfterSeconds);
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

      let advice = "";
      let cached = false;
      let responseCooldownSeconds = 0;
      let streamCompleted = false;
      let streamError: {
        cooldownSeconds: number;
        error: string;
        status: number;
      } | null = null;
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && response.body) {
        await readAiAssistEventStream(response.body, (event) => {
          if (event.event === "status") {
            setStreamStatus(event.data.message);
          } else if (event.event === "chunk") {
            advice += event.data.text;
            setStreamingAdvice(advice);
          } else if (event.event === "done") {
            cached = event.data.cached;
            responseCooldownSeconds = event.data.cooldownSeconds;
            streamCompleted = true;
            setConversationId(event.data.conversationId);
          } else if (event.event === "error") {
            streamError = {
              cooldownSeconds: event.data.cooldownSeconds,
              error: event.data.error,
              status: event.data.status,
            };
            setConversationId(event.data.conversationId);
          }
        });
        if (!streamCompleted && !streamError) {
          streamError = {
            cooldownSeconds: 0,
            error: "AI 回复连接中断，请稍后再试。",
            status: 502,
          };
        }
      } else {
        const data = await response.json().catch(() => null);
        advice = typeof data?.advice === "string" ? data.advice : "";
        cached = Boolean(data?.cached);
        responseCooldownSeconds = Number(data?.cooldownSeconds) || 0;
        if (typeof data?.conversationId === "string" && data.conversationId) {
          setConversationId(data.conversationId);
        }
      }

      if (streamError) {
        const failure = streamError as NonNullable<typeof streamError>;
        if (failure.cooldownSeconds > 0) {
          setConfiguredCooldownSeconds(failure.cooldownSeconds);
          startCooldown(failure.cooldownSeconds);
        }
        setError(failure.error || "AI 请求失败，请稍后再试。");
        return;
      }

      advice = advice.trim();
      if (!advice) {
        setError("AI 这次没有返回清楚的提示，请稍后再试。");
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
      if (!cached && responseCooldownSeconds > 0) {
        setConfiguredCooldownSeconds(responseCooldownSeconds);
        startCooldown(responseCooldownSeconds);
      }
    } catch {
      setError("AI 请求失败，请稍后再试。");
    } finally {
      setPending(false);
      setPendingPrompt("");
      setStreamingAdvice("");
      setStreamStatus("");
    }
  }

  function clearChat() {
    if (
      messages.length > 0 &&
      !window.confirm(
        "确定清空当前面板吗？老师端已经保存的辅导记录会继续保留。",
      )
    ) {
      return;
    }
    setMessages([]);
    setConversationId(createAiChatClientId());
    setError("");
    if (storageKey) window.localStorage.removeItem(storageKey);
  }

  return (
    <section className="surface border-indigo-200 bg-indigo-50/80 p-4">
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
            <>
              <article className="ml-auto max-w-[92%] border border-steel/20 bg-steel/10 p-3 text-sm font-semibold leading-6 text-ink-900">
                <p className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-ink-500">
                  我的问题
                </p>
                <p>{pendingPrompt}</p>
              </article>
              {streamingAdvice ? (
                <article className="max-w-[92%] border border-indigo-200 bg-white p-3 text-sm font-semibold leading-6 text-ink-800">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-ink-500">
                    AI 提示 · 正在回复
                  </p>
                  <p className="whitespace-pre-wrap">
                    {streamingAdvice}
                    <span
                      aria-hidden="true"
                      className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-indigo-500 align-middle"
                    />
                  </p>
                </article>
              ) : null}
              <div className="border border-indigo-200 bg-indigo-50 p-3 text-xs font-bold leading-5 text-indigo-800">
                <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                {streamStatus || "AI 正在结合题目和你的代码思考……"}
              </div>
            </>
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
        <span>{question.length}/{AI_CHAT_MAX_QUESTION_CHARS} 字</span>
        {remainingSeconds > 0 ? (
          <span aria-live="polite">请 {remainingSeconds} 秒后再使用 AI</span>
        ) : (
          <span>
            {configuredCooldownSeconds > 0
              ? `每次使用间隔 ${configuredCooldownSeconds} 秒`
              : "使用间隔由管理员设置"}
          </span>
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
