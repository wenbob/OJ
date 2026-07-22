import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { isProblemType } from "@/lib/objectiveProblem";
import {
  ensureNormalizedActiveProblemSortOrders,
  persistScopedProblemOrder,
} from "@/lib/problemOrderPersistence";
import {
  getProblemOrderBy,
  moveProblemRelative,
  type ProblemDropPlacement,
} from "@/lib/problemOrdering";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";

class ProblemOrderError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  try {
    const body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
    const record =
      typeof body === "object" && body ? (body as Record<string, unknown>) : {};
    const problemId = Number(record.problemId);
    const problemType =
      typeof record.problemType === "string" ? record.problemType.trim() : "";
    const direction = record.direction;
    const rawTargetProblemId = record.targetProblemId;
    const targetProblemId = Number(rawTargetProblemId);
    const placement = record.placement;
    const category =
      typeof record.category === "string" ? record.category.trim() : "";

    if (!Number.isInteger(problemId) || problemId <= 0) {
      throw new ProblemOrderError("题目 ID 不合法");
    }
    if (!isProblemType(problemType)) {
      throw new ProblemOrderError("题型不合法");
    }

    const hasDirection = direction !== undefined;
    const hasRelativeTarget =
      rawTargetProblemId !== undefined || placement !== undefined;
    if (hasDirection === hasRelativeTarget) {
      throw new ProblemOrderError("上下移动和拖动目标必须二选一");
    }

    const moveMode:
      | { kind: "adjacent"; direction: "up" | "down" }
      | {
          kind: "relative";
          targetProblemId: number;
          placement: ProblemDropPlacement;
        } = (() => {
      if (hasDirection) {
        if (direction !== "up" && direction !== "down") {
          throw new ProblemOrderError("移动方向不合法");
        }
        return { kind: "adjacent", direction };
      }
      if (!Number.isInteger(targetProblemId) || targetProblemId <= 0) {
        throw new ProblemOrderError("拖动目标题目 ID 不合法");
      }
      if (placement !== "before" && placement !== "after") {
        throw new ProblemOrderError("拖动放置位置不合法");
      }
      return { kind: "relative", targetProblemId, placement };
    })();

    const result = await prisma.$transaction(async (tx) => {
      const source = await tx.problem.findUnique({
        where: { id: problemId },
        select: {
          id: true,
          archivedAt: true,
          category: true,
          problemType: true,
        },
      });
      if (!source || source.archivedAt) {
        throw new ProblemOrderError("题目不存在或已经下架", 404);
      }
      if (source.problemType !== problemType) {
        throw new ProblemOrderError("题目与当前题型不一致");
      }
      if (category && source.category !== category) {
        throw new ProblemOrderError("题目与当前分类不一致");
      }

      if (moveMode.kind === "relative") {
        const dropTarget = await tx.problem.findUnique({
          where: { id: moveMode.targetProblemId },
          select: {
            archivedAt: true,
            category: true,
            problemType: true,
          },
        });
        if (!dropTarget || dropTarget.archivedAt) {
          throw new ProblemOrderError("拖动目标不存在或已经下架", 404);
        }
        if (dropTarget.problemType !== problemType) {
          throw new ProblemOrderError("拖动目标与当前题型不一致");
        }
        if (category && dropTarget.category !== category) {
          throw new ProblemOrderError("拖动目标与当前分类不一致");
        }
      }

      await ensureNormalizedActiveProblemSortOrders(tx, problemType);

      const where = {
        archivedAt: null,
        problemType,
        ...(category ? { category } : {}),
      };
      const candidates = await tx.problem.findMany({
        where,
        select: { id: true, sortOrder: true },
        orderBy: getProblemOrderBy("custom"),
      });
      const sourceIndex = candidates.findIndex(
        (problem) => problem.id === problemId,
      );
      if (sourceIndex < 0) {
        throw new ProblemOrderError("题目不在当前排序范围内", 404);
      }

      let orderedCandidates;
      if (moveMode.kind === "adjacent") {
        const neighborIndex =
          moveMode.direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
        if (neighborIndex < 0 || neighborIndex >= candidates.length) {
          return { moved: false, position: sourceIndex + 1 };
        }
        orderedCandidates = moveProblemRelative(
          candidates,
          problemId,
          candidates[neighborIndex].id,
          moveMode.direction === "up" ? "before" : "after",
        );
      } else {
        const dropTargetIndex = candidates.findIndex(
          (problem) => problem.id === moveMode.targetProblemId,
        );
        if (dropTargetIndex < 0) {
          throw new ProblemOrderError("拖动目标不在当前排序范围内", 404);
        }
        orderedCandidates = moveProblemRelative(
          candidates,
          problemId,
          moveMode.targetProblemId,
          moveMode.placement,
        );
      }

      const position =
        orderedCandidates.findIndex((problem) => problem.id === problemId) + 1;
      if (
        orderedCandidates.every(
          (problem, index) => problem.id === candidates[index]?.id,
        )
      ) {
        return { moved: false, position };
      }

      await persistScopedProblemOrder(
        tx,
        candidates,
        orderedCandidates.map((problem) => problem.id),
      );

      return {
        moved: true,
        position,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof ProblemOrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "调整题目顺序失败" }, { status: 500 });
  }
}
