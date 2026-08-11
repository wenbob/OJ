"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartExamButton({
  examId,
  initialStatus,
}: {
  examId: number;
  initialStatus?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (initialStatus === "submitted" || initialStatus === "expired") {
    return (
      <Link className="btn btn-primary" href={`/student/exams/${examId}/result`}>
        查看结果
      </Link>
    );
  }

  async function startExam() {
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/exams/${examId}/start`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data.resultHref) {
          router.push(data.resultHref);
          return;
        }
        setError(data.error ?? "开始考试失败");
        return;
      }

      router.push(data.redirectTo ?? `/student/exams/${examId}/take`);
    } catch {
      setError("网络异常，无法开始考试，请检查连接后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        className="btn btn-primary"
        disabled={pending}
        onClick={startExam}
        type="button"
      >
        {pending
          ? "处理中..."
          : initialStatus === "in_progress"
            ? "继续考试"
            : "开始考试"}
      </button>
      {error ? (
        <p className="text-sm font-semibold text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}
