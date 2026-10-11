import type { Prisma } from "@prisma/client";
import { isProblemType, type ProblemType } from "./objectiveProblem";
import type { ProblemListSort } from "./problemOrdering";

export type ProblemLibraryPath = "/student/problems" | "/admin/practice" | "/teacher/practice" | "/admin/problems";

export type ProblemListFilters = {
  problemType?: ProblemType;
  category: string;
  q: string;
  difficulty: string;
  completion: "all" | "accepted" | "unaccepted";
};

export function readProblemListFilters(query: URLSearchParams | Record<string, string | string[] | undefined>): ProblemListFilters {
  const params = query instanceof URLSearchParams ? query : new URLSearchParams();
  if (!(query instanceof URLSearchParams)) {
    for (const [name, value] of Object.entries(query)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (first !== undefined) params.set(name, first);
    }
  }
  const problemType = params.get("problemType")?.trim();
  const completion = params.get("completion");
  return {
    problemType: isProblemType(problemType) ? problemType : undefined,
    category: params.get("category")?.trim() ?? "",
    q: params.get("q")?.trim().slice(0, 100) ?? "",
    difficulty: params.get("difficulty")?.trim() ?? "",
    completion: completion === "accepted" || completion === "unaccepted" ? completion : "all",
  };
}

export function buildProblemListWhere(filters: ProblemListFilters, userId: number): Prisma.ProblemWhereInput {
  const where: Prisma.ProblemWhereInput = {
    archivedAt: null,
    ...(filters.problemType ? { problemType: filters.problemType } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
  };
  if (filters.q) {
    const id = /^\d+$/.test(filters.q) ? Number(filters.q) : NaN;
    const title = { title: { contains: filters.q } };
    where.OR = Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? [{ id }, title] : [title];
  }
  const accepted = { userId, status: "Accepted" };
  if (filters.completion === "accepted") where.submissions = { some: accepted };
  if (filters.completion === "unaccepted") where.submissions = { none: accepted };
  return where;
}

export function problemLibraryHref(
  filters: ProblemListFilters,
  { page = 1, pageSize, basePath = "/student/problems", sort }: {
    page?: number; pageSize?: number; basePath?: ProblemLibraryPath; sort?: ProblemListSort;
  } = {},
) {
  const params = new URLSearchParams();
  if (filters.problemType) params.set("problemType", filters.problemType);
  if (filters.category) params.set("category", filters.category);
  if (filters.q) params.set("q", filters.q);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.completion !== "all") params.set("completion", filters.completion);
  if (sort) params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== undefined) params.set("pageSize", String(pageSize));
  return `${basePath}${params.size ? `?${params}` : ""}`;
}

// 返回入口只允许题库及其已知查询参数，不能成为外站跳转入口。
export function safeProblemLibraryReturnTo(value: string | undefined, basePath: ProblemLibraryPath = "/student/problems") {
  if (!value || !value.startsWith(basePath) || value.startsWith("//")) return basePath;
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || url.pathname !== basePath) return basePath;
    const page = Math.max(1, Math.min(1_000_000, Number(url.searchParams.get("page")) || 1));
    const pageSize = Number(url.searchParams.get("pageSize"));
    return problemLibraryHref(readProblemListFilters(url.searchParams), {
      page: Math.floor(page),
      pageSize: Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : undefined,
      basePath,
    });
  } catch {
    return basePath;
  }
}
