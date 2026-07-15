import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";

function normalizeProblemIds(value: unknown) {
  if (!Array.isArray(value)) {
    return { ids: [], error: "problemIds 必须是非空数组" };
  }

  if (value.length === 0) {
    return { ids: [], error: "请选择要删除的题目" };
  }

  const ids = Array.from(
    new Set(
      value.map((item) =>
        typeof item === "number" || typeof item === "string" ? Number(item) : NaN,
      ),
    ),
  );

  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { ids: [], error: "题目 ID 必须是有效数字" };
  }

  return { ids, error: "" };
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  try {
    const body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
    const record =
      typeof body === "object" && body ? (body as Record<string, unknown>) : {};
    const { ids, error } = normalizeProblemIds(record.problemIds);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const deletedCount = await prisma.$transaction(async (tx) => {
      const existingProblems = await tx.problem.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      const existingIds = existingProblems.map((problem) => problem.id);
      if (existingIds.length === 0) return 0;

      const assignmentConflict = await tx.learningAssignmentProblem.findFirst({
        where: {
          completedAt: null,
          problemId: { in: existingIds },
          assignment: { status: "active" },
        },
        select: { problemTitle: true },
      });
      if (assignmentConflict) {
        throw new Error(
          `题目《${assignmentConflict.problemTitle}》正在学生未完成的专项练习中，请先归档相关任务`,
        );
      }

      const result = await tx.problem.deleteMany({
        where: { id: { in: existingIds } },
      });
      return result.count;
    });

    return NextResponse.json({ deletedCount });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.includes("专项练习")
            ? error.message
            : "批量删除题目失败",
      },
      { status: error instanceof Error && error.message.includes("专项练习") ? 409 : 500 },
    );
  }
}
