import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { isProblemType } from "@/lib/objectiveProblem";
import {
  ensureNormalizedActiveProblemSortOrders,
  persistScopedProblemOrder,
} from "@/lib/problemOrderPersistence";
import {
  getProblemOrderBy,
  isPersistableProblemListSort,
  sortProblemsForSavedView,
} from "@/lib/problemOrdering";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  try {
    const body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
    const record =
      typeof body === "object" && body ? (body as Record<string, unknown>) : {};
    const problemType =
      typeof record.problemType === "string" ? record.problemType.trim() : "";
    const category =
      typeof record.category === "string" ? record.category.trim() : "";
    const sort = record.sort;

    if (!isProblemType(problemType)) {
      return NextResponse.json({ error: "题型不合法" }, { status: 400 });
    }
    if (!isPersistableProblemListSort(sort)) {
      return NextResponse.json(
        { error: "只能保存标题或创建时间排序" },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      await ensureNormalizedActiveProblemSortOrders(tx, problemType);
      const currentRows = await tx.problem.findMany({
        where: {
          archivedAt: null,
          problemType,
          ...(category ? { category } : {}),
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          sortOrder: true,
        },
        orderBy: getProblemOrderBy("custom"),
      });
      const orderedRows = sortProblemsForSavedView(currentRows, sort);
      await persistScopedProblemOrder(
        tx,
        currentRows,
        orderedRows.map((problem) => problem.id),
      );
      return { updatedCount: currentRows.length, sort: "custom" as const };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "保存当前题序失败" }, { status: 500 });
  }
}
