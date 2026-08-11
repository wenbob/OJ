import type { Prisma } from "@prisma/client";
import type { ProblemType } from "./objectiveProblem";

export const problemListSortValues = [
  "custom",
  "title-asc",
  "title-desc",
  "newest",
  "oldest",
] as const;

export type ProblemListSort = (typeof problemListSortValues)[number];

export const persistableProblemListSortValues = [
  "title-asc",
  "title-desc",
  "newest",
  "oldest",
] as const;

export type PersistableProblemListSort =
  (typeof persistableProblemListSortValues)[number];

export type ProblemDropPlacement = "before" | "after";
export const TITLE_SORT_PREVIEW_LIMIT = 5_000;

type TitledProblem = {
  id: number;
  title: string;
};

type CategoryOrderRow = {
  category: string;
  sortOrder: number;
};

const titleCollator = new Intl.Collator("zh-Hans-CN", {
  numeric: true,
  sensitivity: "base",
});

export function normalizeProblemListSort(value: unknown): ProblemListSort {
  return typeof value === "string" &&
    problemListSortValues.includes(value as ProblemListSort)
    ? (value as ProblemListSort)
    : "custom";
}

export function isTitleProblemListSort(
  value: ProblemListSort,
): value is "title-asc" | "title-desc" {
  return value === "title-asc" || value === "title-desc";
}

export function isPersistableProblemListSort(
  value: unknown,
): value is PersistableProblemListSort {
  return (
    typeof value === "string" &&
    persistableProblemListSortValues.includes(
      value as PersistableProblemListSort,
    )
  );
}

export function getProblemOrderBy(
  sort: ProblemListSort,
): Prisma.ProblemOrderByWithRelationInput[] {
  if (sort === "title-asc") {
    return [{ title: "asc" }, { id: "asc" }];
  }
  if (sort === "title-desc") {
    return [{ title: "desc" }, { id: "desc" }];
  }
  if (sort === "newest") {
    return [{ createdAt: "desc" }, { id: "desc" }];
  }
  if (sort === "oldest") {
    return [{ createdAt: "asc" }, { id: "asc" }];
  }
  return [{ sortOrder: "desc" }, { id: "desc" }];
}

export function sortProblemsByTitle<T extends TitledProblem>(
  problems: T[],
  sort: "title-asc" | "title-desc",
) {
  const direction = sort === "title-asc" ? 1 : -1;
  return [...problems].sort((left, right) => {
    const titleResult = titleCollator.compare(left.title, right.title) * direction;
    if (titleResult !== 0) return titleResult;
    return (left.id - right.id) * direction;
  });
}

export function sortProblemsForSavedView<
  T extends TitledProblem & { createdAt: Date },
>(problems: T[], sort: PersistableProblemListSort) {
  if (isTitleProblemListSort(sort)) {
    return sortProblemsByTitle(problems, sort);
  }

  const direction = sort === "newest" ? -1 : 1;
  return [...problems].sort((left, right) => {
    const createdAtResult =
      (left.createdAt.getTime() - right.createdAt.getTime()) * direction;
    if (createdAtResult !== 0) return createdAtResult;
    return (left.id - right.id) * direction;
  });
}

export function moveProblemRelative<T extends { id: number }>(
  problems: T[],
  problemId: number,
  targetProblemId: number,
  placement: ProblemDropPlacement,
) {
  const sourceIndex = problems.findIndex((problem) => problem.id === problemId);
  const targetIndex = problems.findIndex(
    (problem) => problem.id === targetProblemId,
  );
  return moveItemRelative(problems, sourceIndex, targetIndex, placement);
}

export function moveItemRelative<T>(
  items: T[],
  sourceIndex: number,
  targetIndex: number,
  placement: ProblemDropPlacement,
) {
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return [...items];
  }

  const next = [...items];
  const [source] = next.splice(sourceIndex, 1);
  const targetIndexAfterRemoval = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const insertionIndex =
    placement === "before" ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1;
  next.splice(insertionIndex, 0, source);
  return next;
}

export function getTitleSortedProblemPageIds<T extends TitledProblem>(
  problems: T[],
  sort: "title-asc" | "title-desc",
  skip: number,
  take: number,
) {
  return sortProblemsByTitle(problems, sort)
    .slice(skip, skip + take)
    .map((problem) => problem.id);
}

export function orderProblemsByIds<T extends { id: number }>(
  problems: T[],
  orderedIds: number[],
) {
  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  return [...problems].sort(
    (left, right) =>
      (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function orderProblemCategories(
  categories: string[],
  configuredRows: CategoryOrderRow[],
) {
  const normalizedCategories = Array.from(
    new Set(categories.map((category) => category.trim()).filter(Boolean)),
  );
  const configured = new Map(
    configuredRows.map((row) => [row.category.trim(), row.sortOrder]),
  );

  return normalizedCategories.sort((left, right) => {
    const leftOrder = configured.get(left);
    const rightOrder = configured.get(right);
    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder || titleCollator.compare(left, right);
    }
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;
    return titleCollator.compare(left, right);
  });
}

export async function getOrderedProblemCategories(
  db: Prisma.TransactionClient,
  problemType: ProblemType,
  categories: string[],
) {
  const normalizedCategories = Array.from(
    new Set(categories.map((category) => category.trim()).filter(Boolean)),
  );
  if (normalizedCategories.length === 0) return [];

  const configuredRows = await db.problemCategoryOrder.findMany({
    where: {
      problemType,
      category: { in: normalizedCategories },
    },
    select: { category: true, sortOrder: true },
  });
  return orderProblemCategories(normalizedCategories, configuredRows);
}

export async function getNextProblemSortOrder(
  db: Prisma.TransactionClient,
  problemType: ProblemType,
) {
  const aggregate = await db.problem.aggregate({
    where: { problemType },
    _max: { sortOrder: true },
  });
  return (aggregate._max.sortOrder ?? 0) + 1;
}
