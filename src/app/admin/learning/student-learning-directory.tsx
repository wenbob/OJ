"use client";

import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  STUDENT_DIRECTORY_INITIALS,
  type StudentDirectoryInitial,
} from "@/lib/studentDirectoryShared";
import { filterStudentsByUsername } from "@/lib/studentDirectorySearch";

export type LearningStudentDirectoryRow = {
  assignmentCompletedCount: number;
  assignmentProblemCount: number;
  directoryInitial: StudentDirectoryInitial;
  directorySortKey: string;
  hasLearningData: boolean;
  issueLabels: string[];
  lastTrainingAt: string | null;
  pendingProblemCount: number;
  submissionCount: number;
  topCategory: string | null;
  uniqueAcceptedInWindow: number;
  userId: number;
  username: string;
};

export function StudentLearningDirectory({
  basePath,
  rows,
  window,
}: {
  basePath: string;
  rows: LearningStudentDirectoryRow[];
  window: string;
}) {
  const [keyword, setKeyword] = useState("");
  const filteredRows = useMemo(
    () => filterStudentsByUsername(rows, keyword),
    [keyword, rows],
  );
  const groups = useMemo(() => {
    const grouped = new Map<StudentDirectoryInitial, LearningStudentDirectoryRow[]>();
    for (const row of filteredRows) {
      const list = grouped.get(row.directoryInitial) ?? [];
      list.push(row);
      grouped.set(row.directoryInitial, list);
    }
    return grouped;
  }, [filteredRows]);

  function scrollToInitial(initial: StudentDirectoryInitial) {
    const target = document.getElementById(directoryGroupId(initial));
    if (!target) return;
    const reduceMotion = windowMatchMedia("(prefers-reduced-motion: reduce)");
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
    target.focus({ preventScroll: true });
  }

  return (
    <div>
      <div className="border-b border-ink-950/10 bg-[#fffdf7] p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="grid min-w-0 flex-1 gap-1 text-xs font-black text-ink-700">
            搜索学生
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel"
                size={16}
              />
              <input
                className="field w-full pl-10 pr-11"
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="输入学生用户名"
                value={keyword}
              />
              {keyword ? (
                <button
                  aria-label="清空学生搜索"
                  className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center text-ink-500 hover:text-clay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
                  onClick={() => setKeyword("")}
                  type="button"
                >
                  <X size={16} />
                </button>
              ) : null}
            </span>
          </label>
          <p className="text-xs font-black text-ink-600" aria-live="polite">
            当前结果 {filteredRows.length} / {rows.length}
          </p>
        </div>
      </div>

      <nav
        aria-label="按学生姓名首字母定位"
        className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-ink-950/10 bg-[#f5efe2]/95 px-3 py-2 shadow-sm backdrop-blur-sm"
      >
        {STUDENT_DIRECTORY_INITIALS.map((initial) => {
          const available = groups.has(initial);
          return (
            <button
              aria-label={
                available
                  ? `定位到 ${initial} 开头的学生`
                  : `${initial} 开头暂无学生`
              }
              className="grid h-11 min-w-10 flex-none place-items-center border border-ink-950/10 bg-white text-xs font-black text-steel transition-colors hover:border-clay hover:text-clay focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-ink-300"
              disabled={!available}
              key={initial}
              onClick={() => scrollToInitial(initial)}
              type="button"
            >
              {initial}
            </button>
          );
        })}
      </nav>

      {filteredRows.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-base font-black text-ink-800">没有找到匹配的学生</p>
          <p className="mt-2 text-sm font-semibold text-ink-600">
            请检查用户名，或清空搜索查看全部学生。
          </p>
          <button
            className="btn btn-secondary mt-4"
            onClick={() => setKeyword("")}
            type="button"
          >
            清空学生搜索
          </button>
        </div>
      ) : (
        <div>
          {STUDENT_DIRECTORY_INITIALS.flatMap((initial) => {
            const groupRows = groups.get(initial);
            if (!groupRows?.length) return [];
            return [
              <section
                className="scroll-mt-24"
                id={directoryGroupId(initial)}
                key={initial}
                tabIndex={-1}
              >
                <div className="border-b border-ink-950/10 bg-ink-950/[0.035] px-5 py-2">
                  <h3 className="data-number text-sm font-black tracking-[0.22em] text-clay">
                    {initial}
                  </h3>
                </div>
                <div className="divide-y divide-ink-950/10">
                  {groupRows.map((row) => (
                    <Link
                      className="arena-link-card grid gap-4 p-5 md:grid-cols-[1.15fr_1fr_1fr_auto] md:items-center"
                      href={`${basePath}/learning/${row.userId}?window=${window}`}
                      key={row.userId}
                    >
                      <div>
                        <p className="text-lg font-black text-ink-950">
                          {row.username}
                        </p>
                        <p className="mt-1 text-xs font-bold text-ink-600">
                          {row.lastTrainingAt
                            ? `最后训练 ${formatDate(row.lastTrainingAt)}`
                            : "尚无编程提交"}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <MiniStat label="提交" value={row.submissionCount} />
                        <MiniStat
                          label="唯一 AC"
                          value={row.uniqueAcceptedInWindow}
                        />
                        <MiniStat label="待攻克" value={row.pendingProblemCount} />
                      </div>
                      <div>
                        <div className="flex flex-wrap gap-1.5">
                          {!row.hasLearningData ? (
                            <Tag label="尚未形成学情" tone="muted" />
                          ) : row.issueLabels.length ? (
                            row.issueLabels.slice(0, 2).map((label) => (
                              <Tag key={label} label={label} tone="warn" />
                            ))
                          ) : (
                            <Tag label="训练状态稳定" tone="good" />
                          )}
                        </div>
                        <p className="mt-2 text-xs font-bold text-ink-600">
                          {row.topCategory
                            ? `最薄弱：${row.topCategory}`
                            : "暂无薄弱分类"}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-4 md:justify-end">
                        <span className="text-xs font-bold text-ink-600">
                          专项 {row.assignmentCompletedCount}/
                          {row.assignmentProblemCount}
                        </span>
                        <ArrowRight className="text-clay" size={18} />
                      </div>
                    </Link>
                  ))}
                </div>
              </section>,
            ];
          })}
        </div>
      )}
    </div>
  );
}

function directoryGroupId(initial: StudentDirectoryInitial) {
  return `learning-student-group-${initial === "#" ? "other" : initial}`;
}

function windowMatchMedia(query: string) {
  return typeof window !== "undefined" && window.matchMedia(query).matches;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="bg-ink-950/[0.04] px-2 py-2">
      <b className="data-number block text-lg text-ink-950">{value}</b>
      <span className="text-[11px] font-bold text-ink-600">{label}</span>
    </span>
  );
}

function Tag({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "muted" | "warn";
}) {
  const style =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-ink-950/10 bg-stone-100 text-ink-600";
  return (
    <span className={`border px-2 py-1 text-[11px] font-black ${style}`}>
      {label}
    </span>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
