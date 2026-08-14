"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavigationTimingLike = Pick<
  PerformanceNavigationTiming,
  "name" | "startTime" | "type"
>;

type ExamSubmitTrigger =
  | "link-exit"
  | "pagehide"
  | "reload";

type ExamHistoryGuardMarker = {
  examId: number;
  phase: "base" | "sentinel";
  token: string;
  url: string;
};

type GuardedHistoryEntry = {
  state: Record<string, unknown>;
  url: string;
};

const examHistoryGuardStateKey = "__ojExamGuard";
const consumedReloadEntries = new Set<string>();

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getExamHistoryGuardMarker(
  state: unknown,
): ExamHistoryGuardMarker | null {
  if (!isObjectRecord(state)) return null;
  const marker = state[examHistoryGuardStateKey];
  if (!isObjectRecord(marker)) return null;
  if (!Number.isInteger(marker.examId)) return null;
  if (marker.phase !== "base" && marker.phase !== "sentinel") return null;
  if (typeof marker.token !== "string" || !marker.token) return null;
  if (typeof marker.url !== "string" || !marker.url) return null;

  return marker as ExamHistoryGuardMarker;
}

export function createExamHistoryGuardState({
  examId,
  phase,
  state,
  token,
  url,
}: ExamHistoryGuardMarker & { state: unknown }): Record<string, unknown> {
  return {
    ...(isObjectRecord(state) ? state : {}),
    [examHistoryGuardStateKey]: { examId, phase, token, url },
  };
}

export function isMatchingExamHistorySentinel({
  examId,
  state,
  token,
  url,
}: {
  examId: number;
  state: unknown;
  token: string;
  url: string;
}) {
  const marker = getExamHistoryGuardMarker(state);
  return (
    marker?.examId === examId &&
    marker.phase === "sentinel" &&
    marker.token === token &&
    marker.url === url
  );
}

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [historyNotice, setHistoryNotice] = useState("");
  const exitCommittedRef = useRef(false);
  const guardedHistoryEntryRef = useRef<GuardedHistoryEntry | null>(null);
  const guardTokenRef = useRef("");
  const historyNoticeTimerRef = useRef<number | null>(null);
  const submittingRef = useRef<Promise<boolean> | null>(null);
  const unloadSentRef = useRef(false);
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(
    () => () => {
      if (historyNoticeTimerRef.current !== null) {
        window.clearTimeout(historyNoticeTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const lockedUrl = window.location.href;
    let rearmTimer: number | null = null;

    function getGuardToken() {
      if (!guardTokenRef.current) {
        guardTokenRef.current = `${examId}:${Date.now()}:${Math.random()
          .toString(36)
          .slice(2)}`;
      }
      return guardTokenRef.current;
    }

    function armHistoryGuard(url: string) {
      if (!isSameExamTakeUrl(url, examId, url)) return;

      const currentState = window.history.state;
      const existingMarker = getExamHistoryGuardMarker(currentState);
      if (
        existingMarker?.examId === examId &&
        existingMarker.phase === "sentinel" &&
        existingMarker.url === url
      ) {
        guardTokenRef.current = existingMarker.token;
        guardedHistoryEntryRef.current = {
          state: currentState,
          url,
        };
        return;
      }

      const token = getGuardToken();
      const baseState = createExamHistoryGuardState({
        examId,
        phase: "base",
        state: currentState,
        token,
        url,
      });
      window.history.replaceState(baseState, "", url);

      const sentinelState = createExamHistoryGuardState({
        examId,
        phase: "sentinel",
        state: window.history.state,
        token,
        url,
      });
      window.history.pushState(sentinelState, "", url);
      guardedHistoryEntryRef.current = {
        state: window.history.state,
        url,
      };
    }

    function showHistoryNotice() {
      if (historyNoticeTimerRef.current !== null) {
        window.clearTimeout(historyNoticeTimerRef.current);
      }
      setHistoryNotice(
        "考试进行中，不能通过返回离开；如需结束请点击交卷。",
      );
      historyNoticeTimerRef.current = window.setTimeout(() => {
        setHistoryNotice("");
        historyNoticeTimerRef.current = null;
      }, 3000);
    }

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
      if (isSameExamTakeUrl(anchor.href, examId, window.location.href)) {
        rearmTimer = window.setTimeout(() => {
          armHistoryGuard(window.location.href);
        }, 0);
        return;
      }

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

    function onPopState(event: PopStateEvent) {
      if (exitCommittedRef.current) return;
      const guardedEntry = guardedHistoryEntryRef.current;
      const token = guardTokenRef.current;
      if (
        !guardedEntry ||
        !isMatchingExamHistorySentinel({
          examId,
          state: guardedEntry.state,
          token,
          url: guardedEntry.url,
        })
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      window.history.pushState(
        guardedEntry.state,
        "",
        guardedEntry.url,
      );
      showHistoryNotice();
    }

    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("pagehide", submitDuringUnload);
    window.addEventListener("popstate", onPopState, true);
    armHistoryGuard(lockedUrl);

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
      window.removeEventListener("popstate", onPopState, true);
      if (rearmTimer !== null) window.clearTimeout(rearmTimer);
    };
  }, [examId, routeKey]);

  return (
    <div className="mb-5 grid gap-2" role="status">
      <p className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-black text-amber-950">
        考试进行中，浏览器后退将被拦截；刷新、关闭或离开页面会自动交卷。同一场考试内切换题目不受影响。
      </p>
      {historyNotice ? (
        <p
          className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950"
          data-exam-history-notice
          role="alert"
        >
          {historyNotice}
        </p>
      ) : null}
      {error ? (
        <p className="form-error border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
