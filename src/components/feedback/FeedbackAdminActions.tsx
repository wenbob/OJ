"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_LIMITS } from "@/lib/feedbackShared";

export function FeedbackAdminActions({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const sending = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function mutate(reply: boolean) {
    if (sending.current || refreshing) return;
    sending.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/feedback/${id}${reply ? "/replies" : ""}`, {
        method: reply ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reply ? { content } : { status: status === "resolved" ? "pending" : "resolved" }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "操作失败，请稍后重试"); return; }
      if (reply) setContent("");
      setNotice(reply ? "回复已发送，反馈已标记为已处理。" : "处理状态已更新。");
      startTransition(() => router.refresh());
    } catch {
      setError("网络异常，填写内容已保留。请刷新核对是否已保存，再重试。");
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return <section className="surface p-5 md:p-7" aria-labelledby="feedback-handle-title">
    <h2 id="feedback-handle-title" className="text-xl font-black">处理反馈</h2>
    <form className="mt-4" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void mutate(true); }}>
      <fieldset disabled={pending || refreshing} className="min-w-0 space-y-4">
        <div>
          <label htmlFor="feedback-admin-reply" className="block text-sm font-bold text-ink-800">管理员回复</label>
          <textarea id="feedback-admin-reply" className="field mt-2 min-h-32 w-full resize-y" required maxLength={FEEDBACK_LIMITS.reply} value={content} onChange={(event) => setContent(event.target.value)} placeholder="说明处理结果，或提供解决方法" />
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary min-h-11">{pending ? "正在保存…" : "回复并标记已处理"}</button>
          <button type="button" className="btn btn-secondary min-h-11" onClick={() => void mutate(false)}>{status === "resolved" ? "重新打开" : "仅标记已处理"}</button>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-4 text-sm leading-6 text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-4 text-sm leading-6 text-emerald-700">{notice}</p>}
    </form>
  </section>;
}
