"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  RotateCcw,
  Search,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  AssignmentProblemPicker,
  type AssignmentProblemOption,
} from "@/components/AssignmentProblemPicker";
import { ViewportCenteredStickyPanel } from "@/components/ViewportCenteredStickyPanel";
import {
  EMPTY_STUDENT_ASSIGNMENT_CUSTOMIZATION,
  getAssignmentConflictProblems,
  getStudentAssignmentProblems,
  hasStudentAssignmentCustomization,
  reconcileStudentAssignmentCustomization,
  type StudentAssignmentCustomization,
} from "@/lib/bulkAssignmentDraft";
import { filterStudentsByUsername } from "@/lib/studentDirectorySearch";

type AssignmentStudentOption = {
  activeProblems: Array<{ id: number; title: string }>;
  id: number;
  username: string;
};

type CreatedAssignment = {
  id: number;
  problemCount: number;
  studentId: number;
  username: string;
};

type ServerConflict = {
  problems: Array<{ problemId: number; title: string }>;
  studentId: number;
  username: string;
};

type InvalidProblem = {
  problemId: number;
  reason: "archived" | "missing";
  title: string;
};

export function AssignmentPublishingWorkspace({
  basePath,
  categories,
  students,
}: {
  basePath: string;
  categories: string[];
  students: AssignmentStudentOption[];
}) {
  const router = useRouter();
  const personalizationRef = useRef<HTMLDivElement>(null);
  const [keyword, setKeyword] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [activeStudentId, setActiveStudentId] = useState<number | null>(null);
  const [commonProblems, setCommonProblems] = useState<AssignmentProblemOption[]>([]);
  const [customizations, setCustomizations] = useState<
    Record<number, StudentAssignmentCustomization>
  >({});
  const [title, setTitle] = useState("课后练习");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [serverConflicts, setServerConflicts] = useState<ServerConflict[]>([]);
  const [invalidProblems, setInvalidProblems] = useState<InvalidProblem[]>([]);
  const [createdAssignments, setCreatedAssignments] = useState<CreatedAssignment[]>([]);

  const filteredStudents = useMemo(
    () => filterStudentsByUsername(students, keyword),
    [keyword, students],
  );
  const selectedIdSet = useMemo(
    () => new Set(selectedStudentIds),
    [selectedStudentIds],
  );
  const selectedStudents = useMemo(
    () => students.filter((student) => selectedIdSet.has(student.id)),
    [selectedIdSet, students],
  );
  const invalidProblemIdSet = useMemo(
    () => new Set(invalidProblems.map((problem) => problem.problemId)),
    [invalidProblems],
  );
  const activeStudent = students.find(
    (student) => student.id === activeStudentId && selectedIdSet.has(student.id),
  );

  function customizationFor(studentId: number) {
    return reconcileStudentAssignmentCustomization(
      commonProblems,
      customizations[studentId] ?? EMPTY_STUDENT_ASSIGNMENT_CUSTOMIZATION,
    );
  }

  function finalProblemsFor(studentId: number) {
    return getStudentAssignmentProblems(
      commonProblems,
      customizationFor(studentId),
    );
  }

  function conflictProblemsFor(student: AssignmentStudentOption) {
    return getAssignmentConflictProblems(
      finalProblemsFor(student.id),
      student.activeProblems.map((problem) => problem.id),
    );
  }

  function clearServerConflicts(studentId?: number) {
    setServerConflicts((current) =>
      studentId === undefined
        ? []
        : current.filter((conflict) => conflict.studentId !== studentId),
    );
  }

  function setCommonDraft(next: AssignmentProblemOption[]) {
    setCommonProblems(next);
    setCustomizations((current) =>
      Object.fromEntries(
        Object.entries(current).map(([studentId, customization]) => [
          studentId,
          reconcileStudentAssignmentCustomization(next, customization),
        ]),
      ),
    );
    clearServerConflicts();
    setError("");
  }

  function updateCustomization(
    studentId: number,
    update: (current: StudentAssignmentCustomization) => StudentAssignmentCustomization,
  ) {
    setCustomizations((current) => ({
      ...current,
      [studentId]: reconcileStudentAssignmentCustomization(
        commonProblems,
        update(
          reconcileStudentAssignmentCustomization(
            commonProblems,
            current[studentId] ?? EMPTY_STUDENT_ASSIGNMENT_CUSTOMIZATION,
          ),
        ),
      ),
    }));
    clearServerConflicts(studentId);
    setError("");
  }

  function toggleStudent(studentId: number) {
    setCreatedAssignments([]);
    setError("");
    setSelectedStudentIds((current) => {
      if (current.includes(studentId)) {
        const next = current.filter((id) => id !== studentId);
        if (activeStudentId === studentId) setActiveStudentId(null);
        return next;
      }
      if (current.length >= 100) {
        setError("一次最多选择 100 名学生");
        return current;
      }
      return [...current, studentId];
    });
  }

  function selectAllFilteredStudents() {
    const newIds = filteredStudents
      .map((student) => student.id)
      .filter((studentId) => !selectedIdSet.has(studentId));
    if (selectedStudentIds.length + newIds.length > 100) {
      setError(
        `当前搜索结果会使已选学生超过 100 名，请缩小搜索范围后再全选。`,
      );
      return;
    }
    setSelectedStudentIds((current) => [...current, ...newIds]);
    setError("");
  }

  function openCustomization(studentId: number) {
    setActiveStudentId(studentId);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const panel = personalizationRef.current;
        if (!panel) return;
        panel.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start",
        });
        panel.focus({ preventScroll: true });
      });
    });
  }

  function moveCommonProblem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= commonProblems.length) return;
    const next = [...commonProblems];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setCommonDraft(next);
  }

  function getDraftIssue(student: AssignmentStudentOption) {
    const finalProblems = finalProblemsFor(student.id);
    const conflicts = conflictProblemsFor(student);
    if (finalProblems.length < 1 || finalProblems.length > 10) {
      return `${student.username} 的最终题单必须保持 1 至 10 道题`;
    }
    const invalid = finalProblems.filter((problem) =>
      invalidProblemIdSet.has(problem.id),
    );
    if (invalid.length) {
      return `${student.username} 的题单包含已下架或不存在的题目：${invalid
        .map((problem) => problem.title)
        .join("、")}`;
    }
    if (conflicts.length) {
      return `${student.username} 与其他未完成任务冲突：${conflicts
        .map((problem) => problem.title)
        .join("、")}`;
    }
    return null;
  }

  function scrollToStudent(studentId: number) {
    document.getElementById(`bulk-assignment-student-${studentId}`)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
    });
  }

  async function publishAssignments() {
    setError("");
    setCreatedAssignments([]);
    setServerConflicts([]);
    if (!title.trim()) {
      setError("课后练习标题不能为空");
      return;
    }
    if (commonProblems.length < 1 || commonProblems.length > 10) {
      setError("公共题必须保持 1 至 10 道");
      return;
    }
    if (!selectedStudents.length) {
      setError("请至少选择一名学生");
      return;
    }
    const firstInvalidStudent = selectedStudents.find((student) =>
      getDraftIssue(student),
    );
    if (firstInvalidStudent) {
      setError(getDraftIssue(firstInvalidStudent) ?? "学生题单不合法");
      scrollToStudent(firstInvalidStudent.id);
      return;
    }
    if (
      !window.confirm(
        `确认向 ${selectedStudents.length} 名学生发布“${title.trim()}”吗？发布后会生成彼此独立的课后练习。`,
      )
    ) {
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/admin/learning/assignments/bulk", {
        body: JSON.stringify({
          assignments: selectedStudents.map((student) => ({
            problemIds: finalProblemsFor(student.id).map((problem) => problem.id),
            studentId: student.id,
          })),
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          note,
          title: title.trim(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409 && Array.isArray(data.conflicts)) {
          const conflicts = data.conflicts as ServerConflict[];
          setServerConflicts(conflicts);
          const first = conflicts[0];
          if (first) scrollToStudent(first.studentId);
        }
        if (Array.isArray(data.invalidProblems)) {
          const unavailable = data.invalidProblems as InvalidProblem[];
          setInvalidProblems(unavailable);
          const unavailableIds = new Set(
            unavailable.map((problem) => problem.problemId),
          );
          const firstAffectedStudent = selectedStudents.find((student) =>
            finalProblemsFor(student.id).some((problem) =>
              unavailableIds.has(problem.id),
            ),
          );
          if (firstAffectedStudent) scrollToStudent(firstAffectedStudent.id);
        }
        throw new Error(data.error ?? "课后练习发布失败");
      }

      setCreatedAssignments(data.assignments ?? []);
      setSelectedStudentIds([]);
      setActiveStudentId(null);
      setCommonProblems([]);
      setCustomizations({});
      setInvalidProblems([]);
      setTitle("课后练习");
      setNote("");
      setDueAt("");
      setKeyword("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "课后练习发布失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="surface">
      <div className="border-b border-ink-950/10 p-5 md:p-6">
        <p className="arena-kicker">Assignment Publisher</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black">批量布置课后练习</h2>
            <p className="mt-1 text-sm font-semibold text-ink-600">
              先确定公共题，再为个别学生增删题目。任一题单冲突时整批不会发布。
            </p>
          </div>
          <span className="border border-clay/25 bg-[#fff7e8] px-3 py-2 text-xs font-black text-clay">
            已选 {selectedStudentIds.length}/100 名学生
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-5 md:p-6 xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.22fr)]">
        <div className="min-w-0">
          <ViewportCenteredStickyPanel enabled>
            <StudentSelector
              filteredStudents={filteredStudents}
              keyword={keyword}
              onClear={() => {
                setSelectedStudentIds([]);
                setActiveStudentId(null);
                setError("");
              }}
              onKeywordChange={setKeyword}
              onSelectAll={selectAllFilteredStudents}
              onToggle={toggleStudent}
              selectedIdSet={selectedIdSet}
              selectedStudentIds={selectedStudentIds}
              serverConflicts={serverConflicts}
              students={students}
              finalProblemsFor={finalProblemsFor}
              conflictProblemsFor={conflictProblemsFor}
              customizationFor={customizationFor}
              onCustomize={openCustomization}
            />
          </ViewportCenteredStickyPanel>
        </div>

        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-black text-ink-700">
              作业标题
              <input
                className="field"
                maxLength={60}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </label>
            <label className="grid gap-1 text-xs font-black text-ink-700">
              截止时间（可选）
              <input
                className="field"
                onChange={(event) => setDueAt(event.target.value)}
                type="datetime-local"
                value={dueAt}
              />
            </label>
            <label className="grid gap-1 text-xs font-black text-ink-700 sm:col-span-2">
              教师说明（可选）
              <textarea
                className="field min-h-24 resize-y"
                maxLength={300}
                onChange={(event) => setNote(event.target.value)}
                value={note}
              />
            </label>
          </div>

          <CommonProblemDraft
            categories={categories}
            commonProblems={commonProblems}
            invalidProblemIds={invalidProblemIdSet}
            onAdd={(problem) => {
              setInvalidProblems((current) =>
                current.filter((item) => item.problemId !== problem.id),
              );
              setCommonDraft([...commonProblems, problem]);
            }}
            onMove={moveCommonProblem}
            onRemove={(problemId) =>
              setCommonDraft(
                commonProblems.filter((problem) => problem.id !== problemId),
              )
            }
          />

          {activeStudent ? (
            <div
              className="scroll-mt-24"
              id="bulk-assignment-personalization"
              ref={personalizationRef}
              tabIndex={-1}
            >
              <PersonalizedProblemDraft
                categories={categories}
                customization={customizationFor(activeStudent.id)}
                commonProblems={commonProblems}
                finalProblems={finalProblemsFor(activeStudent.id)}
                invalidProblemIds={invalidProblemIdSet}
                onAdd={(problem) => {
                  setInvalidProblems((current) =>
                    current.filter((item) => item.problemId !== problem.id),
                  );
                  updateCustomization(activeStudent.id, (current) => ({
                    ...current,
                    addedProblems: [...current.addedProblems, problem],
                  }));
                }}
                onRemoveAdded={(problemId) =>
                  updateCustomization(activeStudent.id, (current) => ({
                    ...current,
                    addedProblems: current.addedProblems.filter(
                      (problem) => problem.id !== problemId,
                    ),
                  }))
                }
                onRestoreCommon={(problemId) =>
                  updateCustomization(activeStudent.id, (current) => ({
                    ...current,
                    removedCommonProblemIds:
                      current.removedCommonProblemIds.filter(
                        (id) => id !== problemId,
                      ),
                  }))
                }
                onRemoveCommon={(problemId) =>
                  updateCustomization(activeStudent.id, (current) => ({
                    ...current,
                    removedCommonProblemIds: [
                      ...current.removedCommonProblemIds,
                      problemId,
                    ],
                  }))
                }
                student={activeStudent}
              />
            </div>
          ) : null}

          {error ? (
            <p
              className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {createdAssignments.length ? (
            <div className="border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <p className="flex items-center gap-2 text-sm font-black">
                <Check size={17} /> 已成功发布 {createdAssignments.length} 份课后练习
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {createdAssignments.map((assignment) => (
                  <Link
                    className="border border-emerald-300 bg-white px-3 py-2 text-xs font-black hover:border-emerald-600"
                    href={`${basePath}/learning/${assignment.studentId}`}
                    key={assignment.id}
                  >
                    {assignment.username} · {assignment.problemCount} 题
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          <button
            className="btn btn-primary w-full"
            disabled={pending}
            onClick={() => void publishAssignments()}
            type="button"
          >
            <Send size={17} />
            {pending
              ? "正在校验并发布"
              : `确认发布给 ${selectedStudentIds.length} 名学生`}
          </button>
        </div>
      </div>
    </section>
  );
}

function StudentSelector({
  conflictProblemsFor,
  customizationFor,
  filteredStudents,
  finalProblemsFor,
  keyword,
  onClear,
  onCustomize,
  onKeywordChange,
  onSelectAll,
  onToggle,
  selectedIdSet,
  selectedStudentIds,
  serverConflicts,
  students,
}: {
  conflictProblemsFor: (student: AssignmentStudentOption) => AssignmentProblemOption[];
  customizationFor: (studentId: number) => StudentAssignmentCustomization;
  filteredStudents: AssignmentStudentOption[];
  finalProblemsFor: (studentId: number) => AssignmentProblemOption[];
  keyword: string;
  onClear: () => void;
  onCustomize: (studentId: number) => void;
  onKeywordChange: (value: string) => void;
  onSelectAll: () => void;
  onToggle: (studentId: number) => void;
  selectedIdSet: Set<number>;
  selectedStudentIds: number[];
  serverConflicts: ServerConflict[];
  students: AssignmentStudentOption[];
}) {
  const serverConflictIds = new Set(
    serverConflicts.map((conflict) => conflict.studentId),
  );
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <label className="grid min-w-0 flex-1 gap-1 text-xs font-black text-ink-700">
          搜索并选择学生
          <span className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel"
              size={16}
            />
            <input
              className="field w-full pl-10 pr-10"
              onChange={(event) => onKeywordChange(event.target.value)}
              placeholder="输入学生用户名"
              value={keyword}
            />
            {keyword ? (
              <button
                aria-label="清空学生搜索"
                className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center text-ink-500 hover:text-clay"
                onClick={() => onKeywordChange("")}
                type="button"
              >
                <X size={16} />
              </button>
            ) : null}
          </span>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-ink-600">
        <span>当前 {filteredStudents.length} / 共 {students.length} 名学生</span>
        <span className="flex gap-2">
          <button className="text-steel hover:text-clay" onClick={onSelectAll} type="button">
            全选当前结果
          </button>
          <button
            className="text-ink-500 hover:text-rose-700 disabled:opacity-40"
            disabled={!selectedStudentIds.length}
            onClick={onClear}
            type="button"
          >
            清空选择
          </button>
        </span>
      </div>
      <div className="mt-3 max-h-[38rem] overflow-auto border border-ink-950/10 bg-white/60 xl:max-h-[29rem]">
        {filteredStudents.length ? (
          filteredStudents.map((student) => {
            const selected = selectedIdSet.has(student.id);
            const conflicts = selected ? conflictProblemsFor(student) : [];
            const serverConflict = serverConflictIds.has(student.id);
            const customized = hasStudentAssignmentCustomization(
              customizationFor(student.id),
            );
            return (
              <div
                className={`scroll-mt-24 border-b border-ink-950/10 p-3 last:border-b-0 ${
                  serverConflict || conflicts.length
                    ? "bg-rose-50"
                    : selected
                      ? "bg-[#f4f7f8]"
                      : "bg-white/50"
                }`}
                id={`bulk-assignment-student-${student.id}`}
                key={student.id}
              >
                <div className="flex items-center gap-3">
                  <input
                    aria-label={`选择学生 ${student.username}`}
                    checked={selected}
                    className="h-5 w-5 accent-[#496e86]"
                    onChange={() => onToggle(student.id)}
                    type="checkbox"
                  />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-ink-950">
                      {student.username}
                    </b>
                    {selected ? (
                      <span className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold text-ink-600">
                        <span>最终 {finalProblemsFor(student.id).length} 题</span>
                        {customized ? (
                          <span className="text-clay">已个性化</span>
                        ) : null}
                        {conflicts.length || serverConflict ? (
                          <span className="inline-flex items-center gap-1 text-rose-700">
                            <AlertTriangle size={12} /> 题目冲突
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                  {selected ? (
                    <button
                      className="btn btn-secondary px-3 py-2 text-xs"
                      onClick={() => onCustomize(student.id)}
                      type="button"
                    >
                      个性化
                    </button>
                  ) : null}
                </div>
                {selected && conflicts.length ? (
                  <p className="mt-2 pl-8 text-xs font-bold leading-5 text-rose-700">
                    其他未完成任务中：{conflicts.map((problem) => problem.title).join("、")}
                  </p>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="p-6 text-center text-sm font-semibold text-ink-500">
            没有找到匹配的学生。
          </p>
        )}
      </div>
    </div>
  );
}

function CommonProblemDraft({
  categories,
  commonProblems,
  invalidProblemIds,
  onAdd,
  onMove,
  onRemove,
}: {
  categories: string[];
  commonProblems: AssignmentProblemOption[];
  invalidProblemIds: Set<number>;
  onAdd: (problem: AssignmentProblemOption) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (problemId: number) => void;
}) {
  return (
    <div className="border border-ink-950/10 bg-white/45 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="arena-kicker">Common Problems</p>
          <h3 className="mt-1 text-lg font-black">公共题（{commonProblems.length}/10）</h3>
        </div>
        <span className="text-xs font-bold text-ink-600">所有已选学生默认继承</span>
      </div>
      <ProblemList
        invalidProblemIds={invalidProblemIds}
        onMove={onMove}
        onRemove={onRemove}
        problems={commonProblems}
      />
      <div className="mt-4">
        <AssignmentProblemPicker
          activeProblemIds={[]}
          categories={categories}
          onAdd={onAdd}
          selectedCount={commonProblems.length}
          selectedProblemIds={commonProblems.map((problem) => problem.id)}
        />
      </div>
    </div>
  );
}

function PersonalizedProblemDraft({
  categories,
  commonProblems,
  customization,
  finalProblems,
  invalidProblemIds,
  onAdd,
  onRemoveAdded,
  onRemoveCommon,
  onRestoreCommon,
  student,
}: {
  categories: string[];
  commonProblems: AssignmentProblemOption[];
  customization: StudentAssignmentCustomization;
  finalProblems: AssignmentProblemOption[];
  invalidProblemIds: Set<number>;
  onAdd: (problem: AssignmentProblemOption) => void;
  onRemoveAdded: (problemId: number) => void;
  onRemoveCommon: (problemId: number) => void;
  onRestoreCommon: (problemId: number) => void;
  student: AssignmentStudentOption;
}) {
  const removedIds = new Set(customization.removedCommonProblemIds);
  return (
    <div className="border-2 border-steel/30 bg-[#f7fafb] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center bg-steel text-white">
          <UserRound size={18} />
        </span>
        <div>
          <p className="arena-kicker">Personalized List</p>
          <h3 className="mt-1 text-lg font-black">{student.username} · 最终 {finalProblems.length} 题</h3>
          <p className="mt-1 text-xs font-semibold text-ink-600">
            最终顺序为保留的公共题，再接个性化新增题。
          </p>
        </div>
      </div>

      <div className="mt-4 divide-y divide-ink-950/10 border border-ink-950/10 bg-white">
        {commonProblems.map((problem, index) => {
          const removed = removedIds.has(problem.id);
          const invalid = invalidProblemIds.has(problem.id);
          return (
            <div
              className={`flex items-center gap-3 p-3 ${
                invalid
                  ? "bg-rose-50"
                  : removed
                    ? "bg-stone-100 opacity-65"
                    : ""
              }`}
              key={problem.id}
            >
              <span className="data-number w-6 text-center text-xs font-black text-steel">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <b className={`block truncate text-sm ${removed ? "line-through" : ""}`}>
                  {problem.title}
                </b>
                <span className={`text-[11px] font-bold ${invalid ? "text-rose-700" : "text-ink-600"}`}>
                  {invalid ? "题目已失效，请移除" : "公共题"}
                </span>
              </span>
              <button
                className="btn btn-secondary px-3 py-2 text-xs"
                onClick={() =>
                  removed ? onRestoreCommon(problem.id) : onRemoveCommon(problem.id)
                }
                type="button"
              >
                {removed ? <RotateCcw size={13} /> : <Trash2 size={13} />}
                {removed ? "恢复" : "仅此人删除"}
              </button>
            </div>
          );
        })}
        {customization.addedProblems.map((problem, index) => (
          <div
            className={`flex items-center gap-3 p-3 ${
              invalidProblemIds.has(problem.id) ? "bg-rose-50" : "bg-[#fffaf1]"
            }`}
            key={problem.id}
          >
            <span className="data-number w-6 text-center text-xs font-black text-clay">
              +{index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-sm">{problem.title}</b>
              <span
                className={`text-[11px] font-bold ${
                  invalidProblemIds.has(problem.id) ? "text-rose-700" : "text-clay"
                }`}
              >
                {invalidProblemIds.has(problem.id)
                  ? "题目已失效，请移除"
                  : "个性化新增"}
              </span>
            </span>
            <button
              aria-label={`移除个性化题目 ${problem.title}`}
              className="p-2 text-rose-700"
              onClick={() => onRemoveAdded(problem.id)}
              type="button"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {!commonProblems.length && !customization.addedProblems.length ? (
          <p className="p-5 text-center text-sm font-semibold text-ink-500">
            当前最终题单为空。
          </p>
        ) : null}
      </div>
      <div className="mt-4">
        <AssignmentProblemPicker
          activeProblemIds={student.activeProblems.map((problem) => problem.id)}
          categories={categories}
          onAdd={onAdd}
          selectedCount={finalProblems.length}
          selectedProblemIds={finalProblems.map((problem) => problem.id)}
        />
      </div>
    </div>
  );
}

function ProblemList({
  invalidProblemIds,
  onMove,
  onRemove,
  problems,
}: {
  invalidProblemIds: Set<number>;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (problemId: number) => void;
  problems: AssignmentProblemOption[];
}) {
  return (
    <div className="mt-3 divide-y divide-ink-950/10 border border-ink-950/10 bg-white">
      {problems.length ? (
        problems.map((problem, index) => (
          <div
            className={`flex items-center gap-3 p-3 ${
              invalidProblemIds.has(problem.id) ? "bg-rose-50" : ""
            }`}
            key={problem.id}
          >
            <span className="data-number w-7 text-center font-black text-steel">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-sm">{problem.title}</b>
              <span className="text-[11px] font-bold text-ink-600">
                {invalidProblemIds.has(problem.id)
                  ? "题目已失效，请移除"
                  : `${problem.category} · ${problem.difficulty}`}
              </span>
            </span>
            <button
              aria-label={`上移 ${problem.title}`}
              className="p-2 text-ink-600 disabled:opacity-30"
              disabled={index === 0}
              onClick={() => onMove(index, -1)}
              type="button"
            >
              <ArrowUp size={15} />
            </button>
            <button
              aria-label={`下移 ${problem.title}`}
              className="p-2 text-ink-600 disabled:opacity-30"
              disabled={index === problems.length - 1}
              onClick={() => onMove(index, 1)}
              type="button"
            >
              <ArrowDown size={15} />
            </button>
            <button
              aria-label={`移除 ${problem.title}`}
              className="p-2 text-rose-700"
              onClick={() => onRemove(problem.id)}
              type="button"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))
      ) : (
        <p className="p-5 text-center text-sm font-semibold text-ink-500">
          先搜索并添加 1–10 道公共编程题。
        </p>
      )}
    </div>
  );
}
