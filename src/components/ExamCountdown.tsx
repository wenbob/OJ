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

export function ExamCountdown({
  endAt,
  examId,
}: {
  endAt: string | null;
  examId: number;
}) {
  const router = useRouter();
  const expiredRef = useRef(false);
  const endTime = useMemo(
    () => (endAt ? new Date(endAt).getTime() : null),
    [endAt],
  );
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!endTime) return;

    async function expire() {
      if (expiredRef.current) return;
      expiredRef.current = true;
      await fetch(`/api/exams/${examId}/expire`, { method: "POST" }).catch(
        () => null,
      );
      router.push(`/student/exams/${examId}/result`);
    }

    const updateRemaining = () => {
      const nextRemaining = Math.max(0, endTime - Date.now());
      setRemainingMs(nextRemaining);
      if (nextRemaining <= 0) {
        void expire();
      }
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [endTime, examId, router]);

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
    </div>
  );
}
