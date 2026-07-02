"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import type { ProblemType } from "@/lib/objectiveProblem";
import { ExamFormClient } from "./exam-form-client";

type ExamProblemItem = {
  id: number;
  problemId: number;
  order: number;
  score: number;
  problem: {
    id: number;
    title: string;
    difficulty: string;
    category: string;
    problemType: ProblemType;
  };
};

type ExamValue = {
  id: number;
  title: string;
  description: string | null;
  durationMin: number | null;
  status: string;
  examType: ProblemType;
  aiEnabled: boolean;
  problems: ExamProblemItem[];
};

type SearchProblem = {
  id: number;
  title: string;
  difficulty: string;
  category: string;
  problemType: ProblemType;
};

export function ExamEditClient({
  categories = [],
  exam,
}: {
  categories?: string[];
  exam: ExamValue;
}) {
  const router = useRouter();
  const [problems, setProblems] = useState(exam.problems);
  const [keyword, setKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [results, setResults] = useState<SearchProblem[]>([]);
  const [selectedProblemIds, setSelectedProblemIds] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [orderValue, setOrderValue] = useState(
    String((problems.at(-1)?.order ?? 0) + 1),
  );
  const [scoreValue, setScoreValue] = useState("100");
  const existingProblemIds = useMemo(
    () => new Set(problems.map((problem) => problem.problemId)),
    [problems],
  );
  const selectableResults = results.filter(
    (problem) => !existingProblemIds.has(problem.id),
  );
  const allSelectableSelected =
    selectableResults.length > 0 &&
    selectableResults.every((problem) => selectedProblemIds.includes(problem.id));

  async function search(
    nextKeyword = keyword,
    nextCategory = selectedCategory,
  ) {
    setPending(true);
    setMessage("");
    setSelectedProblemIds([]);
    const query = new URLSearchParams();
    if (nextKeyword.trim()) query.set("keyword", nextKeyword.trim());
    if (nextCategory) query.set("category", nextCategory);
    query.set("problemType", exam.examType);
    const response = await fetch(
      `/api/admin/problems/search?${query.toString()}`,
    );
    const data = await response.json().catch(() => ({}));
    setPending(false);

    if (!response.ok) {
      setMessage(data.error ?? "搜索失败");
      return;
    }
    setResults(data.problems ?? []);
    if (Array.isArray(data.categories)) {
      setCategoryOptions(data.categories);
    }
  }

  function readAddValues() {
    const score = exam.examType === "objective" ? 1 : Number(scoreValue);
    const order =
      orderValue.trim() === ""
        ? (problems.at(-1)?.order ?? 0) + 1
        : Number(orderValue);
    if (!Number.isInteger(score) || score <= 0) {
      setMessage("题目分值必须为正整数");
      return null;
    }
    if (!Number.isInteger(order) || order < 0) {
      setMessage("排序值不能为负数");
      return null;
    }
    return { order, score };
  }

  async function addProblem(problemId: number) {
    const values = readAddValues();
    if (!values) {
      return;
    }

    setPending(true);
    setMessage("");
    const response = await fetch(`/api/admin/exams/${exam.id}/problems`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problemId,
        order: values.order,
        score: values.score,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(false);

    if (!response.ok) {
      setMessage(data.error ?? "添加失败");
      return;
    }

    setProblems((current) =>
      [...current, data.examProblem].sort(
        (a, b) => a.order - b.order || a.id - b.id,
      ),
    );
    setOrderValue(String(values.order + 1));
    setSelectedProblemIds((current) =>
      current.filter((selectedId) => selectedId !== problemId),
    );
    setMessage("题目已添加到考试");
    router.refresh();
  }

  async function addSelectedProblems() {
    const values = readAddValues();
    if (!values) return;

    const problemIds = selectedProblemIds.filter(
      (problemId) => !existingProblemIds.has(problemId),
    );
    if (problemIds.length === 0) {
      setMessage("请先选择要添加的题目");
      return;
    }

    setPending(true);
    setMessage("");
    const response = await fetch(`/api/admin/exams/${exam.id}/problems`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problemIds,
        order: values.order,
        score: values.score,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(false);

    if (!response.ok) {
      setMessage(data.error ?? "批量添加失败");
      return;
    }

    const addedProblems = data.examProblems ?? [];
    setProblems((current) =>
      [...current, ...addedProblems].sort(
        (a, b) => a.order - b.order || a.id - b.id,
      ),
    );
    setSelectedProblemIds([]);
    setOrderValue(String(values.order + addedProblems.length));
    setMessage(`已添加 ${addedProblems.length} 道题到考试`);
    router.refresh();
  }

  function selectCategory(category: string) {
    setSelectedCategory(category);
    void search(keyword, category);
  }

  function toggleProblem(problemId: number) {
    if (existingProblemIds.has(problemId)) return;
    setSelectedProblemIds((current) =>
      current.includes(problemId)
        ? current.filter((selectedId) => selectedId !== problemId)
        : [...current, problemId],
    );
  }

  function toggleAllSelectableResults() {
    if (allSelectableSelected) {
      setSelectedProblemIds([]);
      return;
    }
    setSelectedProblemIds(selectableResults.map((problem) => problem.id));
  }

  async function removeProblem(item: ExamProblemItem) {
    if (
      !window.confirm(
        `确定要从考试中移除题目《${item.problem.title}》吗？该操作不会删除题库中的题目。`,
      )
    ) {
      return;
    }

    setPending(true);
    setMessage("");
    const response = await fetch(
      `/api/admin/exams/${exam.id}/problems/${item.id}`,
      { method: "DELETE" },
    );
    const data = await response.json().catch(() => ({}));
    setPending(false);

    if (!response.ok) {
      setMessage(data.error ?? "移除失败");
      return;
    }

    setProblems((current) => current.filter((problem) => problem.id !== item.id));
    setMessage("题目已移除");
    router.refresh();
  }

  async function updateProblem(item: ExamProblemItem) {
    if (!Number.isInteger(item.order) || item.order < 0) {
      setMessage("排序值不能为负数");
      return;
    }
    if (!Number.isInteger(item.score) || item.score <= 0) {
      setMessage("题目分值必须为正整数");
      return;
    }

    setPending(true);
    setMessage("");
    const response = await fetch(
      `/api/admin/exams/${exam.id}/problems/${item.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: item.order, score: item.score }),
      },
    );
    const data = await response.json().catch(() => ({}));
    setPending(false);

    if (!response.ok) {
      setMessage(data.error ?? "保存题目设置失败");
      return;
    }

    setProblems((current) =>
      current
        .map((problem) => (problem.id === item.id ? data.examProblem : problem))
        .sort((a, b) => a.order - b.order || a.id - b.id),
    );
    setMessage("题目设置已保存");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <ExamFormClient
        initialValue={{
          id: exam.id,
          title: exam.title,
          description: exam.description ?? "",
          durationMin: exam.durationMin?.toString() ?? "",
          status: exam.status,
          examType: exam.examType,
          aiEnabled: exam.aiEnabled,
        }}
        lockExamType={problems.length > 0}
        mode="edit"
      />

      <section className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">考试题目</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <ProblemTypeBadge type={exam.examType} />
              <p className="text-sm font-semibold text-ink-600">
                只能添加与当前考试相同类型的题目。
              </p>
            </div>
          </div>
          <Link
            className="btn btn-primary"
            href={`/admin/exams/${exam.id}/import`}
          >
            通过 Markdown 导入题目到考试
          </Link>
        </div>

        {message ? (
          <p className="mt-4 border border-ink-950/10 bg-white/70 px-3 py-2 text-sm font-semibold text-ink-700">
            {message}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <CategoryButton
            active={selectedCategory === ""}
            onClick={() => selectCategory("")}
          >
            全部
          </CategoryButton>
          {categoryOptions.map((category) => (
            <CategoryButton
              active={selectedCategory === category}
              key={category}
              onClick={() => selectCategory(category)}
            >
              {category}
            </CategoryButton>
          ))}
        </div>

        <div
          className={`mt-5 grid gap-3 ${
            exam.examType === "objective"
              ? "md:grid-cols-[minmax(0,1fr)_120px_110px]"
              : "md:grid-cols-[minmax(0,1fr)_120px_120px_110px]"
          }`}
        >
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            搜索题目名称
            <input
              className="field"
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="例如：A+B"
              value={keyword}
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            排序
            <input
              className="field"
              onChange={(event) => setOrderValue(event.target.value)}
              type="number"
              value={orderValue}
            />
          </label>
          {exam.examType === "programming" ? (
            <label className="grid gap-2 text-sm font-bold text-ink-800">
              分值
              <input
                className="field"
                onChange={(event) => setScoreValue(event.target.value)}
                type="number"
                value={scoreValue}
              />
            </label>
          ) : null}
          <button
            className="btn btn-secondary self-end justify-center"
            disabled={pending}
            onClick={() => search()}
            type="button"
          >
            搜索
          </button>
        </div>

        {results.length > 0 ? (
          <div className="mt-4 grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border border-ink-950/10 bg-white/55 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="btn btn-secondary px-3 py-2 text-sm"
                  disabled={pending || selectableResults.length === 0}
                  onClick={toggleAllSelectableResults}
                  type="button"
                >
                  {allSelectableSelected ? "取消全选当前结果" : "全选当前结果"}
                </button>
                <span className="text-sm font-bold text-ink-600">
                  已选择 {selectedProblemIds.length} 道题
                </span>
              </div>
              <button
                className="btn btn-primary px-3 py-2 text-sm"
                disabled={pending || selectedProblemIds.length === 0}
                onClick={addSelectedProblems}
                type="button"
              >
                添加选中题目
              </button>
            </div>
            {results.map((problem) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 border border-ink-950/10 bg-white/65 p-3"
                key={problem.id}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input
                    checked={selectedProblemIds.includes(problem.id)}
                    className="mt-1 h-4 w-4"
                    disabled={existingProblemIds.has(problem.id)}
                    onChange={() => toggleProblem(problem.id)}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block font-black">{problem.title}</span>
                    <span className="text-sm font-semibold text-ink-600">
                      {problem.category || "未分类"} / {problem.difficulty}
                      {existingProblemIds.has(problem.id) ? " / 已在考试中" : ""}
                    </span>
                    <span className="mt-2 block">
                      <ProblemTypeBadge type={problem.problemType} />
                    </span>
                  </span>
                </label>
                <button
                  className="btn btn-primary px-3 py-2 text-sm"
                  disabled={pending || existingProblemIds.has(problem.id)}
                  onClick={() => addProblem(problem.id)}
                  type="button"
                >
                  添加到考试
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="border-b border-ink-950/10 bg-white/55 text-left">
                <th className="table-head px-4 py-3">排序</th>
                <th className="table-head px-4 py-3">题目</th>
                <th className="table-head px-4 py-3">分类</th>
                <th className="table-head px-4 py-3">分值</th>
                <th className="table-head px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((item) => (
                <tr className="border-b border-ink-950/10" key={item.id}>
                  <td className="px-4 py-3">
                    <input
                      className="field w-24"
                      onChange={(event) =>
                        setProblems((current) =>
                          current.map((problem) =>
                            problem.id === item.id
                              ? { ...problem, order: Number(event.target.value) }
                              : problem,
                          ),
                        )
                      }
                      type="number"
                      value={item.order}
                    />
                  </td>
                  <td className="px-4 py-3 font-black">{item.problem.title}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-ink-700">
                    {item.problem.category || "未分类"}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="field w-24"
                      disabled={exam.examType === "objective"}
                      onChange={(event) =>
                        setProblems((current) =>
                          current.map((problem) =>
                            problem.id === item.id
                              ? { ...problem, score: Number(event.target.value) }
                              : problem,
                          ),
                        )
                      }
                      type="number"
                      value={item.score}
                    />
                    {exam.examType === "objective" ? (
                      <p className="mt-1 text-xs font-semibold text-ink-600">
                        小题分值合计
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className="btn btn-secondary px-3 py-2 text-sm"
                        disabled={pending}
                        onClick={() => updateProblem(item)}
                        type="button"
                      >
                        保存
                      </button>
                      <button
                        className="btn btn-danger px-3 py-2 text-sm"
                        disabled={pending}
                        onClick={() => removeProblem(item)}
                        type="button"
                      >
                        移除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {problems.length === 0 ? (
                <tr>
                  <td
                    className="px-5 py-10 text-center text-sm font-semibold text-ink-600"
                    colSpan={5}
                  >
                    当前考试还没有题目。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CategoryButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`border px-3 py-2 text-sm font-black ${
        active
          ? "border-ink-950 bg-ink-950 text-white"
          : "border-ink-950/10 bg-white/65 text-ink-700 hover:bg-white"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
