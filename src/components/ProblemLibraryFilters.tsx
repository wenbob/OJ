"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { Search } from "lucide-react";
import { NavigationLink } from "@/components/NavigationLink";
import { problemLibraryHref, type ProblemListFilters } from "@/lib/problemListFilters";

export function ProblemLibraryFilters({ filters, difficulties, pageSize }: {
  filters: ProblemListFilters;
  difficulties: string[];
  pageSize: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(form: HTMLFormElement) {
    const data = new FormData(form);
    const completion = data.get("completion");
    const nextFilters: ProblemListFilters = {
      ...filters,
      q: String(data.get("q") ?? "").trim().slice(0, 100),
      difficulty: String(data.get("difficulty") ?? ""),
      completion: completion === "accepted" || completion === "unaccepted" ? completion : "all",
    };
    startTransition(() => router.push(problemLibraryHref(nextFilters, { pageSize })));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(event.currentTarget);
  }

  const clearHref = problemLibraryHref({ ...filters, category: "", q: "", difficulty: "", completion: "all" }, { pageSize });
  return (
    <form aria-label="题库搜索和筛选" aria-busy={pending} className="mt-5 grid min-w-0 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)_minmax(9rem,auto)_auto]" onSubmit={submit}>
      <label className="min-w-0 text-xs font-bold text-ink-700">
        题名 / 题号
        <input className="field mt-1 w-full min-w-0" defaultValue={filters.q} maxLength={100} name="q" placeholder="输入题名或题号，如 101" type="search" />
      </label>
      <label className="min-w-0 text-xs font-bold text-ink-700">
        难度
        <select className="field mt-1 w-full" defaultValue={filters.difficulty} name="difficulty" onChange={(event) => { if (event.currentTarget.form) apply(event.currentTarget.form); }}>
          <option value="">全部难度</option>
          {Array.from(new Set([...difficulties, ...(filters.difficulty ? [filters.difficulty] : [])])).map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-xs font-bold text-ink-700">
        通过状态
        <select className="field mt-1 w-full" defaultValue={filters.completion} name="completion" onChange={(event) => { if (event.currentTarget.form) apply(event.currentTarget.form); }}>
          <option value="all">全部状态</option>
          <option value="unaccepted">未通过</option>
          <option value="accepted">已通过</option>
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending} type="submit"><Search aria-hidden="true" size={16} />{pending ? "查询中…" : "搜索"}</button>
        <NavigationLink className="academy-text-link text-sm" href={clearHref}>清空筛选</NavigationLink>
      </div>
    </form>
  );
}
