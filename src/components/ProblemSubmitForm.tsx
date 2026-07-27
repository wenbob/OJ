"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ObjectiveSubmissionBreakdown } from "@/components/ObjectiveSubmissionBreakdown";
import { ProblemAiAssist } from "@/components/ProblemAiAssist";
import { ProblemRunPanel } from "@/components/ProblemRunPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRuntime } from "@/lib/format";
import type { ProblemType } from "@/lib/objectiveProblem";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[460px] items-center justify-center border border-ink-950/15 bg-[#1e1e1e] text-sm font-semibold text-stone-300">
      编辑器加载中...
    </div>
  ),
});

const fallbackCppTemplate = `#include <bits/stdc++.h>
using namespace std;

int main() {
    return 0;
}
`;

type SubmissionResult = {
  id: number;
  status: string;
  passedCount: number;
  totalCount: number;
  runtimeMs: number;
  errorMessage?: string | null;
  caseResults?: {
    caseIndex: number;
    status: string;
    actualOutput: string | null;
  }[];
};

export function ProblemSubmitForm({
  aiCooldownSeconds,
  aiEnabled = false,
  aiStudentId,
  defaultCodeTemplate,
  detailHrefBase = "/student/submissions",
  disabled = false,
  disabledMessage,
  draftStorageKey,
  examId,
  examEndsAt,
  fromSubmissionId,
  learningAssignmentId,
  objectiveCompact = false,
  problemType = "programming",
  problemId,
  refreshOnSuccess = false,
  sampleCount = 0,
}: {
  aiCooldownSeconds?: number;
  aiEnabled?: boolean;
  aiStudentId?: number;
  defaultCodeTemplate?: string;
  detailHrefBase?: string;
  disabled?: boolean;
  disabledMessage?: string;
  draftStorageKey?: string;
  examId?: number;
  examEndsAt?: string | null;
  fromSubmissionId?: number;
  learningAssignmentId?: number;
  objectiveCompact?: boolean;
  problemType?: ProblemType;
  problemId: number;
  refreshOnSuccess?: boolean;
  sampleCount?: number;
}) {
  const router = useRouter();
  const objective = problemType === "objective";
  const storageKey =
    draftStorageKey ??
    (examId
      ? `oj-code-exam-${examId}-problem-${problemId}`
      : `oj-code-problem-${problemId}`);
  const initialCode = objective
    ? ""
    : defaultCodeTemplate && defaultCodeTemplate.trim()
      ? defaultCodeTemplate
      : fallbackCppTemplate;
  const [code, setCode] = useState(initialCode);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [loadMessage, setLoadMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showObjectiveExamConfirm, setShowObjectiveExamConfirm] =
    useState(false);
  const [showAcceptedPopup, setShowAcceptedPopup] = useState(false);
  const [countedForLearningAssignment, setCountedForLearningAssignment] =
    useState(false);
  const [learningAssignmentDetached, setLearningAssignmentDetached] =
    useState(false);
  const [timeExpired, setTimeExpired] = useState(false);
  const shouldFinishExamAfterObjectiveSubmit =
    objective && examId !== undefined;

  useEffect(() => {
    let cancelled = false;

    const frame = window.requestAnimationFrame(async () => {
      if (cancelled) return;
      setDraftLoaded(false);
      setLoadedStorageKey(null);
      setLoadMessage("");
      setLoadError("");
      setResult(null);
      setError("");
      setShowObjectiveExamConfirm(false);
      setShowAcceptedPopup(false);
      setCountedForLearningAssignment(false);
      setLearningAssignmentDetached(false);
      setCode(initialCode);

      if (fromSubmissionId) {
        try {
          const response = await fetch(`/api/submissions/${fromSubmissionId}`);
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error ?? "历史代码加载失败");
          }

          if (data.submission?.problem?.id !== problemId) {
            throw new Error("历史提交不属于当前题目");
          }
          const historicalExamId =
            data.submission?.examId ?? data.submission?.exam?.id ?? null;
          const historicalType =
            data.submission?.submissionType ??
            (historicalExamId === null ? "practice" : "exam");
          if (
            examId &&
            (historicalType !== "exam" || historicalExamId !== examId)
          ) {
            throw new Error("历史提交不属于当前考试");
          }
          if (!examId && historicalType !== "practice") {
            throw new Error("考试提交不能加载到日常刷题页");
          }

          const historicalCode = data.submission.code;
          setCode(historicalCode);
          window.localStorage.setItem(storageKey, historicalCode);
          setLoadMessage("已加载历史提交代码，你可以继续修改后重新提交。");
          setDraftLoaded(true);
          setLoadedStorageKey(storageKey);
          return;
        } catch {
          setLoadError("历史代码加载失败，请重新进入提交详情页。");
        }
      }

      const savedCode = window.localStorage.getItem(storageKey);
      if (savedCode !== null) {
        setCode(savedCode);
      }
      setDraftLoaded(true);
      setLoadedStorageKey(storageKey);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [examId, fromSubmissionId, initialCode, problemId, storageKey]);

  useEffect(() => {
    if (!examEndsAt) return;

    const endTime = new Date(examEndsAt).getTime();
    const updateExpired = () => setTimeExpired(Date.now() >= endTime);

    updateExpired();
    const timer = window.setInterval(updateExpired, 1000);
    return () => window.clearInterval(timer);
  }, [examEndsAt]);

  useEffect(() => {
    if (!draftLoaded || loadedStorageKey !== storageKey) return;
    window.localStorage.setItem(storageKey, code);
  }, [code, draftLoaded, loadedStorageKey, storageKey]);

  useEffect(() => {
    if (!showAcceptedPopup) return;

    const timer = window.setTimeout(() => {
      setShowAcceptedPopup(false);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [showAcceptedPopup]);

  useEffect(() => {
    if (!result) return;

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
  }, [result]);

  async function submit() {
    if (shouldFinishExamAfterObjectiveSubmit && !showObjectiveExamConfirm) {
      setError("");
      setResult(null);
      setShowObjectiveExamConfirm(true);
      return;
    }

    await submitAnswer({ finishExam: shouldFinishExamAfterObjectiveSubmit });
  }

  async function submitAnswer({ finishExam }: { finishExam: boolean }) {
    if (disabled || timeExpired) {
      setError(disabledMessage ?? "考试已结束，不能继续提交");
      return;
    }

    setPending(true);
    setError("");
    setResult(null);
    setShowObjectiveExamConfirm(false);
    setShowAcceptedPopup(false);
    setCountedForLearningAssignment(false);
    setLearningAssignmentDetached(false);

    const response = await fetch(`/api/problems/${problemId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, examId, learningAssignmentId }),
    });
    const data = await response.json();

    if (!response.ok) {
      setPending(false);
      setError(data.error ?? "提交失败");
      return;
    }

    if (finishExam && examId !== undefined) {
      const examResponse = await fetch(`/api/exams/${examId}/submit`, {
        method: "POST",
      });
      const examData = await examResponse.json().catch(() => ({}));

      if (!examResponse.ok) {
        setPending(false);
        setResult(data.submission);
        setError(examData.error ?? "答案已提交，但交卷失败，请重试交卷");
        return;
      }

      router.push(examData.resultHref ?? `/student/exams/${examId}/result`);
      router.refresh();
      return;
    }

    setPending(false);
    setResult(data.submission);
    setCountedForLearningAssignment(Boolean(data.countedForLearningAssignment));
    setLearningAssignmentDetached(Boolean(data.learningAssignmentDetached));
    if (data.submission?.status === "Accepted") {
      setShowAcceptedPopup(true);
    }
    if (
      refreshOnSuccess ||
      data.countedForLearningAssignment ||
      data.learningAssignmentDetached
    ) {
      router.refresh();
    }
  }

  const outputCase =
    result?.caseResults?.find((item) => item.status !== "Accepted") ??
    result?.caseResults?.[0];
  const hasActualOutput =
    outputCase?.actualOutput !== undefined && outputCase.actualOutput !== null;
  // AppShell 的入场动画会让内容祖先保留 transform；挂到 body 后，
  // fixed 遮罩才能始终以当前视口为参照，不受结果区自动滚动影响。
  const acceptedPopup =
    showAcceptedPopup && typeof document !== "undefined"
      ? createPortal(
          <div
            aria-label="通过此题提示"
            aria-atomic="true"
            aria-live="polite"
            className="ac-success-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
            onClick={() => setShowAcceptedPopup(false)}
            role="status"
          >
            <div
              className="ac-success-pop relative max-h-[86vh] max-w-[86vw]"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                aria-label="关闭通过提示"
                className="hidden"
                onClick={() => setShowAcceptedPopup(false)}
                type="button"
              >
                关闭
              </button>
              <Image
                alt="你通过了此题，恭喜"
                className="max-h-[86vh] max-w-[86vw] object-contain"
                height={1254}
                src="/ac-success.png"
                width={1254}
              />
            </div>
          </div>,
          document.body,
        )
      : null;
  const submitButton = (
    <button
      className="btn btn-primary mt-4 w-full"
      disabled={pending || disabled || timeExpired}
      onClick={submit}
      type="button"
    >
      <SendHorizontal size={16} />
      {pending ? "提交中" : objective ? "提交答案" : "提交代码"}
    </button>
  );

  return (
    <>
      {aiEnabled && !objective ? (
        <ProblemAiAssist
          code={code}
          examId={examId}
          initialCooldownSeconds={aiCooldownSeconds}
          problemId={problemId}
          studentId={aiStudentId}
        />
      ) : null}
      <section className={`surface ${objectiveCompact && objective ? "p-4" : "p-5"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black">
            {objective ? "答案输入" : "C++17 代码"}
          </h2>
          {objective ? (
            <p className="mt-1 text-xs font-semibold text-ink-600">
              每行对应一道小题，只填写一个选项字母，例如 A。
            </p>
          ) : null}
        </div>
        <span className="border border-ink-950/10 bg-white/65 px-2.5 py-1 text-xs font-bold text-ink-700">
          {objective ? "格式：每行一个答案" : "语言：C++17"}
        </span>
      </div>
      <div className="mt-4">
        <CodeEditor
          key={storageKey}
          height={
            objective
              ? objectiveCompact
                ? "clamp(180px, 22dvh, 260px)"
                : "360px"
              : "460px"
          }
          language={objective ? "plaintext" : "cpp"}
          value={code}
          onChange={setCode}
        />
      </div>
      {loadMessage ? (
        <p className="mt-3 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {loadMessage}
        </p>
      ) : null}
      {loadError ? (
        <p className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          {loadError}
        </p>
      ) : null}
      {objective ? (
        submitButton
      ) : (
        <ProblemRunPanel
          code={code}
          disabled={disabled || timeExpired}
          disabledMessage={disabledMessage ?? "考试已结束，不能继续试运行"}
          examId={examId}
          problemId={problemId}
          sampleCount={sampleCount}
          submitPending={pending}
        >
          {submitButton}
        </ProblemRunPanel>
      )}
      {showObjectiveExamConfirm ? (
        <div
          aria-label="确认提交答案并交卷"
          className="mt-4 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          role="group"
        >
          <h3 className="font-black">确认交卷？</h3>
          <p className="mt-2 font-semibold leading-6">
            本次操作会先提交当前答案，然后结束这场选择判断考试。交卷后不能继续修改答案。
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              className="btn btn-primary w-full"
              disabled={pending || disabled || timeExpired}
              onClick={() => submitAnswer({ finishExam: true })}
              type="button"
            >
              <SendHorizontal size={16} />
              提交答案
            </button>
            <button
              className="btn btn-secondary w-full"
              disabled={pending}
              onClick={() => setShowObjectiveExamConfirm(false)}
              type="button"
            >
              继续作答
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p
          className="mt-3 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {!error && (disabled || timeExpired) ? (
        <p className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          {disabledMessage ?? "考试已结束，不能继续提交"}
        </p>
      ) : null}
      {result ? (
        <div
          aria-live="polite"
          className="scroll-mt-4"
          data-testid="submission-result"
          ref={resultRef}
        >
          {objective ? (
            <ObjectiveSubmissionBreakdown
              caseResults={result.caseResults ?? []}
              detailHref={`${detailHrefBase}/${result.id}`}
            />
          ) : (
            <div className="mt-4 grid gap-2 border border-ink-950/10 bg-white/70 p-4 text-sm font-semibold text-ink-700">
              <StatusBadge status={result.status} />
              <span>{result.passedCount}/{result.totalCount} 测试点</span>
              <span>{formatRuntime(result.runtimeMs)}</span>
              {hasActualOutput ? (
                <div className="mt-2 grid gap-1">
                  <span className="text-xs font-black text-ink-600">
                    {`程序输出（测试点 ${outputCase.caseIndex}）`}
                  </span>
                  <pre className="max-h-44 overflow-auto border border-ink-950/10 bg-stone-50 p-3 text-xs font-mono font-semibold whitespace-pre-wrap text-ink-800">
                    {outputCase.actualOutput?.length
                      ? outputCase.actualOutput
                      : "（无输出）"}
                  </pre>
                </div>
              ) : null}
              {result.errorMessage ? (
                <pre className="mt-2 max-h-44 overflow-auto border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {result.errorMessage}
                </pre>
              ) : null}
              <Link
                className="btn btn-secondary mt-2 w-full"
                href={`${detailHrefBase}/${result.id}`}
              >
                查看详情
              </Link>
            </div>
          )}
          {countedForLearningAssignment ? (
            <p className="mt-3 border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800">
              已计入专项练习，任务进度已更新。
            </p>
          ) : null}
          {learningAssignmentDetached ? (
            <p className="mt-3 border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-black text-amber-900">
              评测期间老师已将此题移出专项练习。本次提交已保留为普通练习，但不会计入任务进度。
            </p>
          ) : null}
        </div>
      ) : null}
      {acceptedPopup}
      </section>
    </>
  );
}
