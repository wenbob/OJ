"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ProblemRichText } from "@/components/ProblemRichText";
import { createAiChatClientId } from "@/lib/aiChat";
import {
  isObjectiveAiExplanationPayload,
  type ObjectiveAiExplanationPayload,
} from "@/lib/objectiveAiExplanationPayload";

type ExplanationState = {
  cached: boolean;
  explanation: ObjectiveAiExplanationPayload;
};

type ObjectiveAiExplanationContextValue = {
  activeItemIndex: number | null;
  canForceRegenerate: boolean;
  cooldownRemainingSeconds: number;
  error: string;
  explanations: Record<number, ExplanationState>;
  pendingItemIndex: number | null;
  lockedMessage: string;
  requestExplanation: (itemIndex: number, force?: boolean) => Promise<void>;
};

const ObjectiveAiExplanationContext =
  createContext<ObjectiveAiExplanationContextValue | null>(null);

function useObjectiveAiExplanation() {
  const value = useContext(ObjectiveAiExplanationContext);
  if (!value) {
    throw new Error(
      "Objective AI explanation controls must be used inside their provider",
    );
  }
  return value;
}

export function ObjectiveAiExplanationProvider({
  audited = false,
  canForceRegenerate,
  children,
  lockedMessage = "",
  problemId,
  requestPath,
}: {
  audited?: boolean;
  canForceRegenerate: boolean;
  children: ReactNode;
  lockedMessage?: string;
  problemId: number;
  requestPath?: string;
}) {
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [pendingItemIndex, setPendingItemIndex] = useState<number | null>(null);
  const [explanations, setExplanations] = useState<
    Record<number, ExplanationState>
  >({});
  const [error, setError] = useState("");
  const [conversationId] = useState(() => createAiChatClientId());
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const cooldownRemainingSeconds = Math.max(
    0,
    Math.ceil((cooldownUntil - now) / 1_000),
  );

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const startCooldown = useCallback((seconds: unknown) => {
    const value = Number(seconds);
    if (!Number.isInteger(value) || value <= 0) return;
    const startedAt = Date.now();
    setNow(startedAt);
    setCooldownUntil(startedAt + value * 1_000);
  }, []);

  const requestExplanation = useCallback(
    async (itemIndex: number, force = false) => {
      setActiveItemIndex(itemIndex);
      setError("");
      if (lockedMessage) {
        setError(lockedMessage);
        return;
      }
      if (force && cooldownRemainingSeconds > 0) return;
      if (!force && explanations[itemIndex]) return;

      setPendingItemIndex(itemIndex);
      try {
        const response = await fetch(
          requestPath ??
            `/api/admin/problems/${problemId}/objective-explanation`,
          {
            body: JSON.stringify({
              ...(audited
                ? {
                    conversationId,
                    requestId: createAiChatClientId(),
                  }
                : {}),
              force,
              itemIndex,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
        );
        const data = (await response.json().catch(() => ({}))) as {
          cached?: unknown;
          cooldownSeconds?: unknown;
          error?: unknown;
          explanation?: unknown;
          retryAfterSeconds?: unknown;
        };
        if (!response.ok) {
          startCooldown(data.retryAfterSeconds ?? data.cooldownSeconds);
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "AI 解析获取失败，请稍后重试",
          );
        }
        const explanation = data.explanation;
        if (!isObjectiveAiExplanationPayload(explanation)) {
          throw new Error("AI 解析返回格式异常，请稍后重试");
        }
        setExplanations((current) => ({
          ...current,
          [itemIndex]: {
            cached: data.cached === true,
            explanation,
          },
        }));
        startCooldown(data.cooldownSeconds);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "AI 解析获取失败，请稍后重试",
        );
      } finally {
        setPendingItemIndex(null);
      }
    },
    [
      audited,
      conversationId,
      cooldownRemainingSeconds,
      explanations,
      lockedMessage,
      problemId,
      requestPath,
      startCooldown,
    ],
  );

  const value = useMemo(
    () => ({
      activeItemIndex,
      canForceRegenerate,
      cooldownRemainingSeconds,
      error,
      explanations,
      pendingItemIndex,
      lockedMessage,
      requestExplanation,
    }),
    [
      activeItemIndex,
      canForceRegenerate,
      cooldownRemainingSeconds,
      error,
      explanations,
      pendingItemIndex,
      lockedMessage,
      requestExplanation,
    ],
  );

  return (
    <ObjectiveAiExplanationContext.Provider value={value}>
      {children}
    </ObjectiveAiExplanationContext.Provider>
  );
}

export function ObjectiveAiExplanationButton({
  itemIndex,
}: {
  itemIndex: number;
}) {
  const {
    activeItemIndex,
    explanations,
    lockedMessage,
    pendingItemIndex,
    requestExplanation,
  } = useObjectiveAiExplanation();
  const active = activeItemIndex === itemIndex;
  const pending = pendingItemIndex === itemIndex;
  const hasExplanation = Boolean(explanations[itemIndex]);

  return (
    <button
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-black transition-colors ${
        active
          ? "border-steel bg-steel text-white"
          : "border-steel/30 bg-steel/5 text-steel hover:bg-steel/10"
      } disabled:cursor-wait disabled:opacity-60`}
      disabled={pendingItemIndex !== null || Boolean(lockedMessage)}
      onClick={() => requestExplanation(itemIndex)}
      title={lockedMessage || undefined}
      type="button"
    >
      <Sparkles className={pending ? "animate-pulse" : ""} size={13} />
      {lockedMessage
        ? "提交后解锁"
        : pending
          ? "解析中"
          : active && hasExplanation
            ? "正在查看"
            : "AI 解析"}
    </button>
  );
}

export function ObjectiveAiExplanationPanel() {
  const {
    activeItemIndex,
    canForceRegenerate,
    cooldownRemainingSeconds,
    error,
    explanations,
    lockedMessage,
    pendingItemIndex,
    requestExplanation,
  } = useObjectiveAiExplanation();
  const state =
    activeItemIndex === null ? null : explanations[activeItemIndex] ?? null;
  const pending =
    activeItemIndex !== null && pendingItemIndex === activeItemIndex;

  function regenerate() {
    if (activeItemIndex === null) return;
    if (
      !window.confirm(
        `确认重新生成第 ${activeItemIndex} 题的共享 AI 解析吗？成功后会覆盖当前解析。`,
      )
    ) {
      return;
    }
    void requestExplanation(activeItemIndex, true);
  }

  return (
    <section className="surface flex min-h-[22rem] max-h-[68dvh] flex-col overflow-hidden xl:h-full xl:min-h-0 xl:max-h-none">
      <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-ink-950/10 px-5 py-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-clay">
            Objective AI
          </p>
          <h2 className="mt-1 text-lg font-black">
            {activeItemIndex === null
              ? "选择判断 AI 解析"
              : `第 ${activeItemIndex} 题解析`}
          </h2>
        </div>
        {state && canForceRegenerate ? (
          <button
            className="btn btn-secondary px-3 py-2 text-xs"
            disabled={
              pendingItemIndex !== null || cooldownRemainingSeconds > 0
            }
            onClick={regenerate}
            type="button"
          >
            <RefreshCw className={pending ? "animate-spin" : ""} size={14} />
            {cooldownRemainingSeconds > 0
              ? `${cooldownRemainingSeconds} 秒后可刷新`
              : "重新生成"}
          </button>
        ) : null}
      </div>

      <div
        aria-busy={pending}
        aria-live="polite"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5"
      >
        {activeItemIndex === null ? (
          <div className="flex h-full min-h-56 flex-col items-center justify-center border border-dashed border-steel/30 bg-steel/5 p-6 text-center">
            <Sparkles className="text-steel" size={28} />
            <p className="mt-4 font-black text-ink-900">
              {lockedMessage || "点击任意小题旁的“AI 解析”"}
            </p>
            <p className="mt-2 max-w-xs text-sm font-semibold leading-6 text-ink-600">
              {lockedMessage
                ? "完成一次日常提交后，无论答对或答错，都可以逐题查看解析。"
                : "解析会说明正确选项的依据，并逐项指出错误选项的问题。"}
            </p>
          </div>
        ) : pending && !state ? (
          <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
            <RefreshCw className="animate-spin text-steel" size={28} />
            <p className="mt-4 font-black">正在生成第 {activeItemIndex} 题解析</p>
            <p className="mt-2 text-sm font-semibold text-ink-600">
              正在核对标准答案和全部选项，请稍候。
            </p>
          </div>
        ) : state ? (
          <div className={pending ? "opacity-60" : ""}>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
                标准答案 {state.explanation.correctAnswer}
              </span>
              <span className="border border-ink-950/10 bg-white/70 px-2.5 py-1 text-ink-600">
                {state.cached ? "共享解析" : "刚刚生成"}
              </span>
              {state.explanation.model ? (
                <span
                  className="max-w-full truncate border border-ink-950/10 bg-white/70 px-2.5 py-1 text-ink-600"
                  title={state.explanation.model}
                >
                  {state.explanation.model}
                </span>
              ) : null}
            </div>

            <ExplanationSection title="整体思路">
              <ProblemRichText
                className="text-sm font-semibold leading-7 text-ink-800"
                codeClassName="text-xs"
                value={state.explanation.overview}
              />
            </ExplanationSection>

            <div className="mt-5 grid gap-3">
              <h3 className="text-sm font-black text-ink-950">逐项分析</h3>
              {state.explanation.options.map((option) => (
                <div
                  className={`border p-3 ${
                    option.isCorrect
                      ? "border-emerald-200 bg-emerald-50/70"
                      : "border-ink-950/10 bg-white/60"
                  }`}
                  key={option.label}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`grid h-7 w-7 place-items-center font-black ${
                        option.isCorrect
                          ? "bg-emerald-700 text-white"
                          : "bg-ink-950 text-white"
                      }`}
                    >
                      {option.label}
                    </span>
                    <span
                      className={`text-xs font-black ${
                        option.isCorrect
                          ? "text-emerald-700"
                          : "text-ink-600"
                      }`}
                    >
                      {option.isCorrect ? "正确选项" : "错误选项"}
                    </span>
                  </div>
                  <ProblemRichText
                    className="text-sm font-semibold leading-6 text-ink-800"
                    codeClassName="text-xs"
                    value={option.explanation}
                  />
                </div>
              ))}
            </div>

            <ExplanationSection title="记住这一点">
              <ProblemRichText
                className="text-sm font-bold leading-7 text-clay"
                codeClassName="text-xs"
                value={state.explanation.takeaway}
              />
            </ExplanationSection>
          </div>
        ) : null}

        {error ? (
          <div
            className="mt-4 border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700"
            role="alert"
          >
            <p>{error}</p>
            {activeItemIndex !== null && !state ? (
              <button
                className="btn btn-secondary mt-3 px-3 py-2 text-xs"
                disabled={pendingItemIndex !== null}
                onClick={() => requestExplanation(activeItemIndex)}
                type="button"
              >
                重试
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ExplanationSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="mt-5 border-t border-ink-950/10 pt-4">
      <h3 className="mb-2 text-sm font-black text-ink-950">{title}</h3>
      {children}
    </section>
  );
}
