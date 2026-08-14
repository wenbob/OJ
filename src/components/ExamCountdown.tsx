"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

function formatRemaining(ms: number) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function getServerClockOffset(serverNow: string, clientNow: number) {
  const serverTime = new Date(serverNow).getTime();
  return Number.isFinite(serverTime) ? serverTime - clientNow : 0;
}

export function getRemainingExamTime({
  clientNow,
  clockOffsetMs,
  endTime,
}: {
  clientNow: number;
  clockOffsetMs: number;
  endTime: number;
}) {
  return Math.max(0, endTime - (clientNow + clockOffsetMs));
}

export function ExamCountdown({
  endAt,
  examId,
  serverNow,
}: {
  endAt: string | null;
  examId: number;
  serverNow?: string;
}) {
  const router = useRouter();
  const expiredRef = useRef(false);
  const endTime = useMemo(
    () => (endAt ? new Date(endAt).getTime() : null),
    [endAt],
  );
  const [error, setError] = useState("");
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!endTime) return;
    const clientNow = Date.now();
    const clockOffsetMs = getServerClockOffset(
      serverNow ?? new Date(clientNow).toISOString(),
      clientNow,
    );

    async function expire() {
      if (expiredRef.current) return;
      expiredRef.current = true;
      setError("");
      try {
        const response = await fetch(`/api/exams/${examId}/expire`, {
          method: "POST",
        });
        const data = await response.json().catch(() => ({}));
        const status = data.examRecord?.status;
        if (
          response.ok &&
          (status === "submitted" || status === "expired")
        ) {
          router.push(
            data.resultHref ?? `/student/exams/${examId}/result`,
          );
          return;
        }
        if (response.status !== 409 && status !== "in_progress") {
          setError(data.error ?? "自动交卷失败，正在重试");
        }
      } catch {
        setError("网络异常，自动交卷失败，正在重试");
      }
      expiredRef.current = false;
    }

    const updateRemaining = () => {
      const nextRemaining = getRemainingExamTime({
        clientNow: Date.now(),
        clockOffsetMs,
        endTime,
      });
      setRemainingMs(nextRemaining);
      if (nextRemaining <= 0) {
        void expire();
      }
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [endTime, examId, router, serverNow]);

  if (!endTime) {
    return (
      <div className="border border-ink-950/10 bg-white/65 px-4 py-3 text-sm font-bold text-ink-700">
        本场考试不限时
      </div>
    );
  }

  return (
    <div
      aria-live="off"
      className="border border-ink-950/10 bg-white/65 px-4 py-3 text-sm font-bold text-ink-700"
    >
      剩余时间：{remainingMs === null ? "--:--" : formatRemaining(remainingMs)}
      {error ? (
        <span className="mt-1 block text-xs text-rose-700" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
