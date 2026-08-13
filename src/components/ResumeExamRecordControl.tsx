"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function ResumeExamRecordControl({
  examId,
  recordId,
  studentUsername,
}: {
  examId: number;
  recordId: number;
  studentUsername: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 2 || normalizedReason.length > 200) {
      setError("请输入 2–200 个字的恢复原因");
      return;
    }
    if (
      !window.confirm(
        `确认恢复 ${studentUsername} 的考试吗？倒计时仍按首次开考时间计算，不会重置。`,
      )
    ) {
      return;
    }

    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/exams/${examId}/records/${recordId}/resume`,
        {
          body: JSON.stringify({ reason: normalizedReason }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "恢复考试失败");
        return;
      }
      setExpanded(false);
      setReason("");
      router.refresh();
    } catch {
      setError("网络异常，恢复考试失败，请检查连接后重试");
    } finally {
      setPending(false);
    }
  }

  if (!expanded) {
    return (
      <button
        className="btn btn-secondary px-3 py-2 text-sm"
        onClick={() => {
          setError("");
          setExpanded(true);
        }}
        type="button"
      >
        恢复考试
      </button>
    );
  }

  return (
    <form className="ml-auto grid w-72 gap-2 text-left" onSubmit={submit}>
      <label className="grid gap-1 text-xs font-bold text-ink-700">
        恢复原因
        <textarea
          className="field min-h-20 resize-y text-sm"
          disabled={pending}
          maxLength={200}
          onChange={(event) => setReason(event.target.value)}
          placeholder="例如：学生误触交卷"
          required
          value={reason}
        />
      </label>
      <div className="flex justify-end gap-2">
        <button
          className="btn btn-secondary px-3 py-2 text-xs"
          disabled={pending}
          onClick={() => setExpanded(false)}
          type="button"
        >
          取消
        </button>
        <button
          className="btn btn-primary px-3 py-2 text-xs"
          disabled={pending}
          type="submit"
        >
          {pending ? "恢复中..." : "确认恢复"}
        </button>
      </div>
      {error ? (
        <p className="text-xs font-semibold text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
