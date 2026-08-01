"use client";

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

export type AssignmentProblemOption = {
  category: string;
  difficulty: string;
  id: number;
  problemType: string;
  title: string;
};

export function AssignmentProblemPicker({
  activeProblemIds,
  categories,
  onAdd,
  selectedCount,
  selectedProblemIds,
}: {
  activeProblemIds: number[];
  categories: string[];
  onAdd: (problem: AssignmentProblemOption) => void;
  selectedCount: number;
  selectedProblemIds: number[];
}) {
  const [keyword, setKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [results, setResults] = useState<AssignmentProblemOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");
  const selectedIds = useMemo(
    () => new Set(selectedProblemIds),
    [selectedProblemIds],
  );
  const activeIds = useMemo(
    () => new Set(activeProblemIds),
    [activeProblemIds],
  );

  async function searchProblems(
    nextKeyword = keyword,
    nextCategory = selectedCategory,
  ) {
    setSearching(true);
    setError("");
    try {
      const query = new URLSearchParams({ problemType: "programming" });
      if (nextKeyword.trim()) query.set("keyword", nextKeyword.trim());
      if (nextCategory) query.set("category", nextCategory);
      const response = await fetch(`/api/admin/problems/search?${query}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "题目搜索失败");
      setResults(data.problems ?? []);
      setHasSearched(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "题目搜索失败");
    } finally {
      setSearching(false);
    }
  }

  function selectCategory(category: string) {
    setSelectedCategory(category);
    void searchProblems(keyword, category);
  }

  return (
    <div>
      <label className="block text-xs font-black text-ink-700">
        搜索其他编程题
      </label>
      <div className="mt-2 flex flex-wrap gap-2" aria-label="题目分类筛选">
        <CategoryButton
          active={selectedCategory === ""}
          onClick={() => selectCategory("")}
        >
          全部
        </CategoryButton>
        {categories.map((category) => (
          <CategoryButton
            active={selectedCategory === category}
            key={category}
            onClick={() => selectCategory(category)}
          >
            {category}
          </CategoryButton>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="field min-w-0 flex-1"
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void searchProblems();
            }
          }}
          placeholder="输入题目名称，可留空查看全部"
          value={keyword}
        />
        <button
          className="btn btn-secondary"
          disabled={searching}
          onClick={() => void searchProblems()}
          type="button"
        >
          <Search size={15} />
          {searching ? "搜索中" : "搜索"}
        </button>
      </div>
      {error ? (
        <p
          className="mt-2 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {results.length ? (
        <div className="mt-2 max-h-56 overflow-auto border border-ink-950/10 bg-white">
          {results.map((problem) => {
            const selectedAlready = selectedIds.has(problem.id);
            const activeElsewhere = activeIds.has(problem.id);
            return (
              <div
                className="flex items-center justify-between gap-3 border-b border-ink-950/10 p-3 last:border-b-0"
                key={problem.id}
              >
                <span className="min-w-0">
                  <b className="block truncate text-sm">{problem.title}</b>
                  <span className="text-[11px] font-bold text-ink-600">
                    {problem.category} · {problem.difficulty}
                  </span>
                </span>
                <button
                  className="btn btn-secondary px-3 py-2"
                  disabled={
                    selectedAlready || activeElsewhere || selectedCount >= 10
                  }
                  onClick={() => onAdd(problem)}
                  type="button"
                >
                  <Plus size={14} />
                  {selectedAlready
                    ? "已添加"
                    : activeElsewhere
                      ? "其他任务中"
                      : "添加"}
                </button>
              </div>
            );
          })}
        </div>
      ) : hasSearched && !searching ? (
        <p className="mt-2 border border-ink-950/10 bg-white/60 px-3 py-4 text-center text-sm font-semibold text-ink-500">
          当前筛选条件下没有可显示的编程题。
        </p>
      ) : null}
    </div>
  );
}

function CategoryButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`border px-3 py-2 text-xs font-black ${
        active
          ? "border-ink-950 bg-ink-950 text-white"
          : "border-ink-950/10 bg-white/65 text-ink-700 hover:border-steel hover:text-steel"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
