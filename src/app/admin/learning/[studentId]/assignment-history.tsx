"use client";

import {
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AssignmentProblemPicker,
  type AssignmentProblemOption,
} from "./assignment-problem-picker";

type AssignmentProblemItem = {
  category: string;
  completedAt: string | null;
  difficulty: string;
  id: number;
  problemId: number | null;
  title: string;
};

type AssignmentProblemDraft = {
  assignmentProblemId?: number;
  category: string;
  completed: boolean;
  difficulty: string;
  key: string;
  problemId: number | null;
  title: string;
};

type AssignmentItem = {
  canManage: boolean;
  completedCount: number;
  createdAt: string;
  creatorName: string;
  dueAt: string | null;
  id: number;
  note: string;
  problemCount: number;
  problems: AssignmentProblemItem[];
  status: string;
  title: string;
};

export function AssignmentHistory({
  activeProblemIds,
  assignments,
  categories,
}: {
  activeProblemIds: number[];
  assignments: AssignmentItem[];
  categories: string[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [problemDraft, setProblemDraft] = useState<
    AssignmentProblemDraft[]
  >([]);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editingItem =
    assignments.find((item) => item.id === editingId) ?? null;

  function beginEdit(item: AssignmentItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setNote(item.note);
    setDueAt(item.dueAt ? toLocalInput(item.dueAt) : "");
    setProblemDraft(item.problems.map(toExistingDraft));
    setError("");
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setProblemDraft([]);
    setError("");
  }

  function moveProblem(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= problemDraft.length) return;
    setProblemDraft((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function removeProblem(problem: AssignmentProblemDraft) {
    if (
      problem.completed &&
      !window.confirm(
        `题目《${problem.title}》已经完成。移除后不会删除学生的历史提交和代码，但会重新计算本任务进度。确定从编辑草稿中移除吗？`,
      )
    ) {
      return;
    }
    setProblemDraft((current) =>
      current.filter((item) => item.key !== problem.key),
    );
  }

  function addProblem(
    assignment: AssignmentItem,
    problem: AssignmentProblemOption,
  ) {
    const original = assignment.problems.find(
      (item) => item.problemId === problem.id,
    );
    const draft = original
      ? toExistingDraft(original)
      : {
          category: problem.category,
          completed: false,
          difficulty: problem.difficulty,
          key: `new-${problem.id}`,
          problemId: problem.id,
          title: problem.title,
        };
    setProblemDraft((current) =>
      current.some((item) => item.problemId === problem.id)
        ? current
        : [...current, draft],
    );
  }

  async function patch(
    id: number,
    body: Record<string, unknown>,
    successMessage = "专项练习已更新",
  ) {
    setPendingId(id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/learning/assignments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "专项练习更新失败");
      setEditingId(null);
      setProblemDraft([]);
      setMessage(successMessage);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "专项练习更新失败");
    } finally {
      setPendingId(null);
    }
  }

  async function saveAssignment(item: AssignmentItem) {
    if (!title.trim()) {
      setError("专项练习标题不能为空");
      return;
    }
    if (problemDraft.length < 1 || problemDraft.length > 10) {
      setError("每份专项练习必须包含 1 至 10 道题");
      return;
    }
    await patch(
      item.id,
      {
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        note,
        problemItems: problemDraft.map((problem) =>
          problem.assignmentProblemId
            ? { assignmentProblemId: problem.assignmentProblemId }
            : { problemId: problem.problemId },
        ),
        title,
      },
      "专项练习内容和题序已保存，学生端会立即跟随。",
    );
  }

  async function remove(item: AssignmentItem) {
    const confirmed = window.confirm(
      `确定永久删除专项练习《${item.title}》吗？任务题目、完成进度和历史展示会一起删除，此操作无法恢复。`,
    );
    if (!confirmed) return;

    setPendingId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/learning/assignments/${item.id}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "专项练习删除失败");
      setMessage("专项练习已永久删除。");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "专项练习删除失败");
    } finally {
      setPendingId(null);
    }
  }

  const currentIncompleteProblemIds = new Set(
    editingItem?.problems.flatMap((problem) =>
      problem.completedAt === null && problem.problemId !== null
        ? [problem.problemId]
        : [],
    ) ?? [],
  );
  const activeProblemIdsElsewhere = activeProblemIds.filter(
    (problemId) => !currentIncompleteProblemIds.has(problemId),
  );

  return (
    <section className="surface overflow-hidden">
      <div className="border-b border-ink-950/10 p-5">
        <p className="arena-kicker">Assignment History</p>
        <h2 className="mt-1 text-xl font-black">专项练习记录</h2>
        <p className="mt-1 text-xs font-bold text-ink-600">
          进行中任务可统一编辑题目、题序和说明；归档后可永久删除。
        </p>
      </div>
      {error ? (
        <p
          className="m-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="m-4 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
          {message}
        </p>
      ) : null}
      {assignments.length === 0 ? (
        <p className="p-6 text-center text-sm font-semibold text-ink-600">
          尚未下发专项练习。
        </p>
      ) : (
        <div className="divide-y divide-ink-950/10">
          {assignments.map((item) => (
            <div className="p-5" key={item.id}>
              {editingId === item.id ? (
                <div className="grid gap-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-xs font-black text-ink-700">
                      任务标题
                      <input
                        className="field"
                        maxLength={60}
                        onChange={(event) => setTitle(event.target.value)}
                        value={title}
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-black text-ink-700">
                      截止时间
                      <input
                        className="field"
                        onChange={(event) => setDueAt(event.target.value)}
                        type="datetime-local"
                        value={dueAt}
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-xs font-black text-ink-700">
                    教师说明
                    <textarea
                      className="field min-h-24"
                      maxLength={300}
                      onChange={(event) => setNote(event.target.value)}
                      value={note}
                    />
                  </label>

                  <div className="border border-ink-950/10 bg-white/55">
                    <div className="flex items-center justify-between gap-3 border-b border-ink-950/10 px-4 py-3">
                      <div>
                        <p className="text-sm font-black text-ink-950">
                          已发布题目
                        </p>
                        <p className="mt-1 text-[11px] font-bold text-ink-600">
                          调整会在点击保存后一次性生效
                        </p>
                      </div>
                      <span className="data-number text-sm font-black text-steel">
                        {problemDraft.length}/10
                      </span>
                    </div>
                    {problemDraft.length ? (
                      <div className="divide-y divide-ink-950/10">
                        {problemDraft.map((problem, index) => (
                          <div
                            className="flex items-center gap-3 p-3"
                            key={problem.key}
                          >
                            <span className="data-number w-7 text-center text-sm font-black text-steel">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <b className="truncate text-sm text-ink-950">
                                  {problem.title}
                                </b>
                                {problem.completed ? (
                                  <span className="inline-flex items-center gap-1 border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800">
                                    <CheckCircle2 size={12} />
                                    已完成
                                  </span>
                                ) : null}
                                {!problem.assignmentProblemId ? (
                                  <span className="border border-steel/20 bg-[#eef6fb] px-2 py-1 text-[10px] font-black text-steel">
                                    新加入
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-1 block text-[11px] font-bold text-ink-600">
                                {problem.category} · {problem.difficulty}
                                {problem.problemId === null
                                  ? " · 原题已从题库移除"
                                  : ""}
                              </span>
                            </span>
                            <button
                              aria-label={`上移 ${problem.title}`}
                              className="p-1 text-ink-600"
                              disabled={index === 0 || pendingId === item.id}
                              onClick={() => moveProblem(index, -1)}
                              type="button"
                            >
                              <ArrowUp size={15} />
                            </button>
                            <button
                              aria-label={`下移 ${problem.title}`}
                              className="p-1 text-ink-600"
                              disabled={
                                index === problemDraft.length - 1 ||
                                pendingId === item.id
                              }
                              onClick={() => moveProblem(index, 1)}
                              type="button"
                            >
                              <ArrowDown size={15} />
                            </button>
                            <button
                              aria-label={`移除 ${problem.title}`}
                              className="p-1 text-rose-700"
                              disabled={pendingId === item.id}
                              onClick={() => removeProblem(problem)}
                              type="button"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="p-4 text-center text-sm font-semibold text-rose-700">
                        至少保留或添加 1 道题后才能保存。
                      </p>
                    )}
                  </div>

                  <AssignmentProblemPicker
                    activeProblemIds={activeProblemIdsElsewhere}
                    categories={categories}
                    onAdd={(problem) => addProblem(item, problem)}
                    selectedCount={problemDraft.length}
                    selectedProblemIds={problemDraft.flatMap((problem) =>
                      problem.problemId === null ? [] : [problem.problemId],
                    )}
                  />

                  <div className="flex gap-2">
                    <button
                      className="btn btn-primary"
                      disabled={
                        pendingId === item.id ||
                        !title.trim() ||
                        problemDraft.length < 1 ||
                        problemDraft.length > 10
                      }
                      onClick={() => void saveAssignment(item)}
                      type="button"
                    >
                      <Save size={15} />
                      {pendingId === item.id ? "保存中" : "统一保存"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={pendingId === item.id}
                      onClick={cancelEdit}
                      type="button"
                    >
                      <X size={15} />
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-ink-950">{item.title}</h3>
                      <span
                        className={`border px-2 py-1 text-[11px] font-black ${
                          item.status === "archived"
                            ? "border-ink-950/10 bg-stone-100 text-ink-600"
                            : item.completedCount === item.problemCount
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-steel/25 bg-[#eef6fb] text-steel"
                        }`}
                      >
                        {item.status === "archived"
                          ? "已归档"
                          : item.completedCount === item.problemCount
                            ? "已完成"
                            : "进行中"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-bold text-ink-600">
                      进度 {item.completedCount}/{item.problemCount} ·{" "}
                      {item.dueAt
                        ? `截止 ${new Date(item.dueAt).toLocaleString("zh-CN")}`
                        : "无截止日期"}
                    </p>
                    <p className="mt-1 text-xs font-bold text-ink-500">
                      下发老师：{item.creatorName}
                    </p>
                    {item.note ? (
                      <p className="mt-2 max-w-2xl text-sm font-semibold text-ink-700">
                        {item.note}
                      </p>
                    ) : null}
                  </div>
                  {!item.canManage ? (
                    <span className="border border-ink-950/10 bg-stone-100 px-3 py-2 text-xs font-black text-ink-600">
                      仅查看
                    </span>
                  ) : item.status === "active" ? (
                    <div className="flex gap-2">
                      <button
                        className="btn btn-secondary"
                        onClick={() => beginEdit(item)}
                        type="button"
                      >
                        <Pencil size={15} />
                        编辑
                      </button>
                      <button
                        className="btn btn-secondary"
                        disabled={pendingId === item.id}
                        onClick={() =>
                          void patch(
                            item.id,
                            { archive: true },
                            "专项练习已归档。",
                          )
                        }
                        type="button"
                      >
                        <Archive size={15} />
                        归档
                      </button>
                    </div>
                  ) : (
                    <button
                      aria-label={`永久删除专项练习 ${item.title}`}
                      className="btn btn-danger"
                      disabled={pendingId === item.id}
                      onClick={() => void remove(item)}
                      type="button"
                    >
                      <Trash2 size={15} />
                      {pendingId === item.id ? "删除中" : "删除"}
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

function toExistingDraft(
  problem: AssignmentProblemItem,
): AssignmentProblemDraft {
  return {
    assignmentProblemId: problem.id,
    category: problem.category,
    completed: problem.completedAt !== null,
    difficulty: problem.difficulty,
    key: `existing-${problem.id}`,
    problemId: problem.problemId,
    title: problem.title,
  };
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
