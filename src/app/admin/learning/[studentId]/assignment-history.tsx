"use client";

import { Archive, Pencil, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AssignmentItem = {
  completedCount: number;
  createdAt: string;
  dueAt: string | null;
  id: number;
  note: string;
  problemCount: number;
  status: string;
  title: string;
};

export function AssignmentHistory({ assignments }: { assignments: AssignmentItem[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  function beginEdit(item: AssignmentItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setNote(item.note);
    setDueAt(item.dueAt ? toLocalInput(item.dueAt) : "");
    setError("");
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setPendingId(id);
    setError("");
    try {
      const response = await fetch(`/api/admin/learning/assignments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "专项练习更新失败");
      setEditingId(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "专项练习更新失败");
    } finally {
      setPendingId(null);
    }
  }

  async function remove(item: AssignmentItem) {
    const confirmed = window.confirm(
      `确定永久删除专项练习《${item.title}》吗？任务题目、完成进度和历史展示会一起删除，此操作无法恢复。`,
    );
    if (!confirmed) return;

    setPendingId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/learning/assignments/${item.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "专项练习删除失败");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "专项练习删除失败");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="surface overflow-hidden">
      <div className="border-b border-ink-950/10 p-5">
        <p className="arena-kicker">Assignment History</p>
        <h2 className="mt-1 text-xl font-black">专项练习记录</h2>
        <p className="mt-1 text-xs font-bold text-ink-600">下发后题目集合锁定；进行中任务可编辑或归档，归档后可永久删除。</p>
      </div>
      {error ? <p className="m-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p> : null}
      {assignments.length === 0 ? (
        <p className="p-6 text-center text-sm font-semibold text-ink-600">尚未下发专项练习。</p>
      ) : (
        <div className="divide-y divide-ink-950/10">
          {assignments.map((item) => (
            <div className="p-5" key={item.id}>
              {editingId === item.id ? (
                <div className="grid gap-3">
                  <input className="field" maxLength={60} onChange={(event) => setTitle(event.target.value)} value={title} />
                  <textarea className="field min-h-24" maxLength={300} onChange={(event) => setNote(event.target.value)} value={note} />
                  <input className="field" onChange={(event) => setDueAt(event.target.value)} type="datetime-local" value={dueAt} />
                  <div className="flex gap-2">
                    <button className="btn btn-primary" disabled={pendingId === item.id || !title.trim()} onClick={() => patch(item.id, { dueAt: dueAt ? new Date(dueAt).toISOString() : null, note, title })} type="button"><Save size={15} />保存</button>
                    <button className="btn btn-secondary" onClick={() => setEditingId(null)} type="button"><X size={15} />取消</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-ink-950">{item.title}</h3>
                      <span className={`border px-2 py-1 text-[11px] font-black ${item.status === "archived" ? "border-ink-950/10 bg-stone-100 text-ink-600" : item.completedCount === item.problemCount ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-steel/25 bg-[#eef6fb] text-steel"}`}>
                        {item.status === "archived" ? "已归档" : item.completedCount === item.problemCount ? "已完成" : "进行中"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-bold text-ink-600">进度 {item.completedCount}/{item.problemCount} · {item.dueAt ? `截止 ${new Date(item.dueAt).toLocaleString("zh-CN")}` : "无截止日期"}</p>
                    {item.note ? <p className="mt-2 max-w-2xl text-sm font-semibold text-ink-700">{item.note}</p> : null}
                  </div>
                  {item.status === "active" ? (
                    <div className="flex gap-2">
                      <button className="btn btn-secondary" onClick={() => beginEdit(item)} type="button"><Pencil size={15} />编辑</button>
                      <button className="btn btn-secondary" disabled={pendingId === item.id} onClick={() => patch(item.id, { archive: true })} type="button"><Archive size={15} />归档</button>
                    </div>
                  ) : (
                    <button
                      aria-label={`永久删除专项练习 ${item.title}`}
                      className="btn btn-danger"
                      disabled={pendingId === item.id}
                      onClick={() => remove(item)}
                      type="button"
                    >
                      <Trash2 size={15} />{pendingId === item.id ? "删除中" : "删除"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
