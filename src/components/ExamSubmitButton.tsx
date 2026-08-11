"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ExamSubmitButton({ examId }: { examId: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submitExam() {
    if (!window.confirm("确认交卷吗？交卷后不能继续提交代码。")) return;

    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/exams/${examId}/submit`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "交卷失败");
        return;
      }

      router.push(data.resultHref ?? `/student/exams/${examId}/result`);
    } catch {
      setError("网络异常，交卷失败，请检查连接后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        className="btn btn-danger"
        disabled={pending}
        onClick={submitExam}
        type="button"
      >
        {pending ? "交卷中..." : "交卷"}
      </button>
      {error ? (
        <p className="text-sm font-semibold text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}
