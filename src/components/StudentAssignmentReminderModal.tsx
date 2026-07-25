"use client";

import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import {
  getNextAssignmentReminderAt,
  getStudentAssignmentReminderStorageKey,
  getUnacknowledgedAssignmentReminders,
  parseAssignmentReminderAcknowledgements,
  readAssignmentReminderSnapshot,
  STUDENT_ASSIGNMENT_REMINDER_STORAGE_EVENT,
  storeAssignmentReminderAcknowledgements,
  type PendingAssignmentReminderItem,
} from "@/lib/studentAssignmentReminder";

export function StudentAssignmentReminderModal({
  assignments,
  studentId,
}: {
  assignments: PendingAssignmentReminderItem[];
  studentId: number;
}) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [navigating, setNavigating] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const storageKey = getStudentAssignmentReminderStorageKey(studentId);
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      subscribeToAssignmentReminderStorage(storageKey, onStoreChange),
    [storageKey],
  );
  const getSnapshot = useCallback(
    () => readAssignmentReminderSnapshot(window.localStorage, studentId),
    [studentId],
  );
  const storageSnapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const acknowledgements = useMemo(
    () => parseAssignmentReminderAcknowledgements(storageSnapshot),
    [storageSnapshot],
  );
  const unacknowledgedAssignments =
    nowMs === null
      ? []
      : getUnacknowledgedAssignmentReminders(
          assignments,
          acknowledgements,
          nowMs,
        );
  const visible =
    nowMs !== null &&
    !isRefreshing &&
    unacknowledgedAssignments.length > 0;
  const nextReminderAt =
    nowMs === null
      ? null
      : getNextAssignmentReminderAt(
          assignments,
          acknowledgements,
          nowMs,
        );

  useEffect(() => {
    const timer = window.setTimeout(() => setNowMs(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, [assignments, storageSnapshot]);

  useEffect(() => {
    if (
      nowMs === null ||
      visible ||
      isRefreshing ||
      nextReminderAt === null
    ) {
      return;
    }

    const delay = Math.max(0, nextReminderAt - Date.now());
    const timer = window.setTimeout(() => {
      setNowMs(Date.now());
      startRefreshTransition(() => router.refresh());
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    isRefreshing,
    nextReminderAt,
    nowMs,
    router,
    startRefreshTransition,
    visible,
  ]);

  useEffect(() => {
    if (!visible) return;

    const shell = document.querySelector<HTMLElement>(
      "[data-app-shell-root]",
    );
    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    const shellWasInert = shell?.hasAttribute("inert") ?? false;
    const previousAriaHidden = shell?.getAttribute("aria-hidden") ?? null;

    document.body.style.overflow = "hidden";
    shell?.setAttribute("inert", "");
    shell?.setAttribute("aria-hidden", "true");
    buttonRef.current?.focus();

    function keepFocusInside(event: FocusEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        dialogRef.current &&
        !dialogRef.current.contains(target)
      ) {
        buttonRef.current?.focus();
      }
    }

    function preventDismissal(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        buttonRef.current?.focus();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("focusin", keepFocusInside, true);
    document.addEventListener("keydown", preventDismissal, true);

    return () => {
      document.removeEventListener("focusin", keepFocusInside, true);
      document.removeEventListener("keydown", preventDismissal, true);
      document.body.style.overflow = previousOverflow;

      if (shell) {
        if (!shellWasInert) shell.removeAttribute("inert");
        if (previousAriaHidden === null) {
          shell.removeAttribute("aria-hidden");
        } else {
          shell.setAttribute("aria-hidden", previousAriaHidden);
        }
      }

      if (
        previousActiveElement &&
        document.contains(previousActiveElement)
      ) {
        previousActiveElement.focus();
      }
    };
  }, [visible]);

  function goToAssignments() {
    if (navigating) return;
    setNavigating(true);
    storeAssignmentReminderAcknowledgements(
      window.localStorage,
      studentId,
      assignments,
      new Date().toISOString(),
    );
    window.dispatchEvent(
      new Event(STUDENT_ASSIGNMENT_REMINDER_STORAGE_EVENT),
    );
    router.push("/student/assignments");
  }

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(22,23,19,0.72)] p-3 sm:p-6"
      data-testid="pending-assignment-reminder"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          buttonRef.current?.focus();
        }
      }}
    >
      <div
        aria-busy={navigating}
        aria-describedby="pending-assignment-reminder-description"
        aria-labelledby="pending-assignment-reminder-title"
        aria-modal="true"
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden border border-[#d7c7ad] bg-[#fffaf1] shadow-[0_30px_90px_rgba(22,23,19,0.34)]"
        ref={dialogRef}
        role="dialog"
      >
        <div className="h-1.5 flex-none bg-[linear-gradient(90deg,var(--arena-clay)_0_68%,var(--arena-steel)_68%_100%)]" />
        <header className="relative flex-none overflow-hidden border-b border-ink-950/10 px-5 py-5 sm:px-7 sm:py-6">
          <div className="absolute -right-12 -top-14 h-36 w-36 rounded-full border-[22px] border-clay/5" />
          <div className="relative">
            <p className="arena-kicker">Teacher Training</p>
            <h2
              className="mt-2 text-2xl font-black tracking-tight text-ink-950 sm:text-3xl"
              id="pending-assignment-reminder-title"
            >
              你有未完成的专项练习
            </h2>
            <p
              className="mt-3 max-w-xl text-sm font-semibold leading-6 text-ink-600"
              id="pending-assignment-reminder-description"
            >
              当前共有 {assignments.length} 份任务待完成。老师已经为你安排好训练，请先前往专项练习页面。
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-5">
          <div className="grid gap-3">
            {assignments.map((assignment, index) => (
              <article
                className="border border-ink-950/10 bg-white/60 px-4 py-4"
                key={assignment.id}
              >
                <div className="flex items-start gap-3">
                  <span className="data-number flex h-8 w-8 flex-none items-center justify-center bg-ink-950 text-sm font-black text-linen">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black leading-6 text-ink-950">
                      {assignment.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-ink-600">
                      <span className="inline-flex items-center gap-1.5">
                        <UserRound aria-hidden="true" size={14} />
                        {assignment.publisherLabel}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ClipboardList aria-hidden="true" size={14} />
                        已完成 {assignment.completedCount}/
                        {assignment.problemCount} 题
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock aria-hidden="true" size={14} />
                        {assignment.dueAt
                          ? `截止 ${formatDate(assignment.dueAt)}`
                          : "不限截止日期"}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <footer className="flex-none border-t border-ink-950/10 bg-[#f6efe1] p-4 sm:p-5">
          <button
            className="btn btn-primary w-full"
            disabled={navigating}
            onClick={goToAssignments}
            ref={buttonRef}
            type="button"
          >
            {navigating ? "正在前往专项练习" : "去完成专项练习"}
            <ArrowRight aria-hidden="true" size={17} />
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function subscribeToAssignmentReminderStorage(
  storageKey: string,
  onStoreChange: () => void,
) {
  function handleStorage(event: StorageEvent) {
    if (event.key === null || event.key === storageKey) {
      onStoreChange();
    }
  }

  function handleReminderChange() {
    onStoreChange();
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(
    STUDENT_ASSIGNMENT_REMINDER_STORAGE_EVENT,
    handleReminderChange,
  );
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(
      STUDENT_ASSIGNMENT_REMINDER_STORAGE_EVENT,
      handleReminderChange,
    );
  };
}

function getServerSnapshot() {
  return null;
}
