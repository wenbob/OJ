"use client";

import { useEffect, useRef, useState } from "react";

type NavigationTimingLike = Pick<
  PerformanceNavigationTiming,
  "name" | "startTime" | "type"
>;

type ExamSubmitTrigger =
  | "history-exit"
  | "link-exit"
  | "pagehide"
  | "reload";

const consumedReloadEntries = new Set<string>();

export function isSameExamTakeUrl(value: string, examId: number, base: string) {
  try {
    const url = new URL(value, base);
    const currentOrigin = new URL(base).origin;
    return (
      url.origin === currentOrigin &&
      url.pathname === `/student/exams/${examId}/take`
    );
  } catch {
    return false;
  }
}

export function consumeReloadOfCurrentExam({
  consumedEntries,
  currentUrl,
  examId,
  navigation,
}: {
  consumedEntries: Set<string>;
  currentUrl: string;
  examId: number;
  navigation: NavigationTimingLike | undefined;
}) {
  if (
    navigation?.type !== "reload" ||
    !isSameExamTakeUrl(navigation.name, examId, currentUrl)
  ) {
    return false;
  }

  const entryKey = `${examId}:${navigation.startTime}:${navigation.name}`;
  if (consumedEntries.has(entryKey)) return false;
  consumedEntries.add(entryKey);
  return true;
}

export function ExamExitGuard({ examId }: { examId: number }) {
  const [error, setError] = useState("");
  const exitCommittedRef = useRef(false);
  const submittingRef = useRef<Promise<boolean> | null>(null);
  const unloadSentRef = useRef(false);

  useEffect(() => {
    const lockedUrl = window.location.href;

    function submitUrl(trigger: ExamSubmitTrigger) {
      return `/api/exams/${examId}/submit?trigger=${trigger}`;
    }

    async function submitBeforeNavigation(trigger: ExamSubmitTrigger) {
      if (submittingRef.current) return submittingRef.current;
      const request = fetch(submitUrl(trigger), {
        method: "POST",
        credentials: "same-origin",
      })
        .then(async (response) => {
          if (response.ok) return true;
          const data = await response.json().catch(() => ({}));
          setError(data.error ?? "自动交卷失败，请留在当前页面后重试。");
          return false;
        })
        .catch(() => {
          setError("自动交卷失败，请检查网络后重试。");
          return false;
        })
        .finally(() => {
          submittingRef.current = null;
        });
      submittingRef.current = request;
      return request;
    }

    function submitDuringUnload() {
      if (exitCommittedRef.current || unloadSentRef.current) return;
      unloadSentRef.current = true;
      const url = submitUrl("pagehide");
      const sent = navigator.sendBeacon?.(
        url,
        new Blob([], { type: "text/plain" }),
      );
      if (!sent) {
        void fetch(url, {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
        });
      }
    }

    function onDocumentClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank") return;
      if (isSameExamTakeUrl(anchor.href, examId, window.location.href)) return;

      event.preventDefault();
      event.stopPropagation();
      setError("");
      void submitBeforeNavigation("link-exit").then((submitted) => {
        if (submitted) {
          exitCommittedRef.current = true;
          window.location.assign(anchor.href);
        }
      });
    }

    function onPopState() {
      const targetUrl = window.location.href;
      if (isSameExamTakeUrl(targetUrl, examId, targetUrl)) return;

      window.history.pushState({ examLocked: true }, "", lockedUrl);
      setError("");
      void submitBeforeNavigation("history-exit").then((submitted) => {
        if (submitted) {
          exitCommittedRef.current = true;
          window.location.assign(targetUrl);
        }
      });
    }

    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("pagehide", submitDuringUnload);
    window.addEventListener("popstate", onPopState);

    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (
      consumeReloadOfCurrentExam({
        consumedEntries: consumedReloadEntries,
        currentUrl: window.location.href,
        examId,
        navigation,
      })
    ) {
      void submitBeforeNavigation("reload").then((submitted) => {
        if (submitted) {
          exitCommittedRef.current = true;
          window.location.replace(`/student/exams/${examId}/result`);
        }
      });
    }

    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("pagehide", submitDuringUnload);
      window.removeEventListener("popstate", onPopState);
    };
  }, [examId]);

  return (
    <div className="mb-5 grid gap-2" role="status">
      <p className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-black text-amber-950">
        考试进行中，离开或刷新将自动交卷。同一场考试内切换题目不受影响。
      </p>
      {error ? (
        <p className="form-error border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
