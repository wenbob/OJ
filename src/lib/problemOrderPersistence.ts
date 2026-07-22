import type { Prisma } from "@prisma/client";
import type { ProblemType } from "./objectiveProblem";
import { getProblemOrderBy } from "./problemOrdering";

type OrderedProblemSlot = {
  id: number;
  sortOrder: number;
};

export async function ensureNormalizedActiveProblemSortOrders(
  tx: Prisma.TransactionClient,
  problemType: ProblemType,
) {
  const rows = await tx.problem.findMany({
    where: { archivedAt: null, problemType },
    select: { id: true, sortOrder: true },
    orderBy: getProblemOrderBy("custom"),
  });
  const hasDuplicates = new Set(rows.map((row) => row.sortOrder)).size !== rows.length;
  if (!hasDuplicates) return false;

  for (const [index, row] of rows.entries()) {
    await tx.problem.update({
      where: { id: row.id },
      data: { sortOrder: rows.length - index },
    });
  }
  return true;
}

export async function persistScopedProblemOrder(
  tx: Prisma.TransactionClient,
  currentRows: OrderedProblemSlot[],
  orderedIds: number[],
) {
  if (
    currentRows.length !== orderedIds.length ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    throw new Error("题目顺序范围不完整");
  }

  const slots = currentRows.map((row) => row.sortOrder);
  const currentSlotById = new Map(
    currentRows.map((row) => [row.id, row.sortOrder]),
  );
  if (orderedIds.some((id) => !currentSlotById.has(id))) {
    throw new Error("题目顺序范围不一致");
  }

  let updatedCount = 0;
  for (const [index, id] of orderedIds.entries()) {
    const nextSortOrder = slots[index];
    if (currentSlotById.get(id) === nextSortOrder) continue;
    await tx.problem.update({
      where: { id },
      data: { sortOrder: nextSortOrder },
    });
    updatedCount += 1;
  }
  return updatedCount;
}
