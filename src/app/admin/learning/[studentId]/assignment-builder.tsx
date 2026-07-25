"use client";

import { ArrowDown, ArrowUp, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AssignmentProblemPicker,
  type AssignmentProblemOption,
} from "./assignment-problem-picker";

export function AssignmentBuilder({
  activeProblemIds,
  categories,
  initialProblems,
  studentId,
  suggestedTitle,
}: {
  activeProblemIds: number[];
  categories: string[];
  initialProblems: AssignmentProblemOption[];
  studentId: number;
  suggestedTitle: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(initialProblems);
  const [title, setTitle] = useState(suggestedTitle);
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selected.length) return;
    setSelected((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function createAssignment() {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/learning/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          note,
          problemIds: selected.map((problem) => problem.id),
          studentId,
          title,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "专项练习下发失败");
      setMessage("专项练习已下发，学生端会立即显示。题目集合已锁定。 ");
      setSelected([]);
      setNote("");
      setDueAt("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "专项练习下发失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="surface overflow-hidden">
      <div className="border-b border-ink-950/10 p-5">
        <p className="arena-kicker">Assignment Builder</p>
        <h2 className="mt-1 text-xl font-black">下发专项练习</h2>
        <p className="mt-1 text-xs font-bold text-ink-600">
          系统只负责推荐；请教师确认、增删和排序后再下发。每份 1–10 题。
        </p>
      </div>
      <div className="grid gap-5 p-5 xl:grid-cols-[1fr_0.8fr]">
        <div>
          <label className="block text-xs font-black text-ink-700">已选题目（{selected.length}/10）</label>
          <div className="mt-2 divide-y divide-ink-950/10 border border-ink-950/10">
            {selected.length ? selected.map((problem, index) => (
              <div className="flex items-center gap-3 bg-white/65 p-3" key={problem.id}>
                <span className="data-number w-7 text-center font-black text-steel">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-ink-950">{problem.title}</span>
                  <span className="block text-[11px] font-bold text-ink-600">{problem.category} · {problem.difficulty}</span>
                </span>
                <button aria-label="上移" className="p-1 text-ink-600" disabled={index === 0} onClick={() => move(index, -1)} type="button"><ArrowUp size={15} /></button>
                <button aria-label="下移" className="p-1 text-ink-600" disabled={index === selected.length - 1} onClick={() => move(index, 1)} type="button"><ArrowDown size={15} /></button>
                <button aria-label="移除" className="p-1 text-rose-700" onClick={() => setSelected((current) => current.filter((item) => item.id !== problem.id))} type="button"><Trash2 size={15} /></button>
              </div>
            )) : (
              <p className="p-5 text-center text-sm font-semibold text-ink-500">暂无已选题目，请从推荐或搜索结果中添加。</p>
            )}
          </div>

          <div className="mt-5">
            <AssignmentProblemPicker
              activeProblemIds={activeProblemIds}
              categories={categories}
              onAdd={(problem) =>
                setSelected((current) => [...current, problem])
              }
              selectedCount={selected.length}
              selectedProblemIds={selected.map((problem) => problem.id)}
            />
          </div>
        </div>

        <div className="grid content-start gap-4">
          <label className="grid gap-1 text-xs font-black text-ink-700">任务标题<input className="field" maxLength={60} onChange={(event) => setTitle(event.target.value)} value={title} /></label>
          <label className="grid gap-1 text-xs font-black text-ink-700">教师说明（可选）<textarea className="field min-h-28 resize-y" maxLength={300} onChange={(event) => setNote(event.target.value)} value={note} /></label>
          <label className="grid gap-1 text-xs font-black text-ink-700">截止时间（可选）<input className="field" onChange={(event) => setDueAt(event.target.value)} type="datetime-local" value={dueAt} /></label>
          {error ? <p className="border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" role="alert">{error}</p> : null}
          {message ? <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</p> : null}
          <button className="btn btn-primary w-full" disabled={pending || selected.length < 1 || selected.length > 10 || !title.trim()} onClick={createAssignment} type="button"><Send size={16} />{pending ? "正在下发" : "确认下发"}</button>
        </div>
      </div>
    </section>
  );
}
