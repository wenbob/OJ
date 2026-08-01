import { NextRequest, NextResponse } from "next/server";
import {
  BulkLearningAssignmentConflictError,
  BulkLearningAssignmentInvalidProblemError,
  createBulkLearningAssignments,
  validateBulkLearningAssignmentDraft,
} from "@/lib/learningAssignments";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { requireStaffApiUser } from "@/lib/staffAccess";

export async function POST(request: NextRequest) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }

  const validation = validateBulkLearningAssignmentDraft(body);
  if (!validation.data) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const assignments = await prisma.$transaction(
      (tx) =>
        createBulkLearningAssignments({
          createdById: auth.user.id,
          db: tx,
          draft: validation.data,
        }),
      { maxWait: 5_000, timeout: 30_000 },
    );
    return NextResponse.json(
      { assignments, createdCount: assignments.length },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof BulkLearningAssignmentConflictError) {
      return NextResponse.json(
        { error: error.message, conflicts: error.conflicts },
        { status: 409 },
      );
    }
    if (error instanceof BulkLearningAssignmentInvalidProblemError) {
      return NextResponse.json(
        { error: error.message, invalidProblems: error.invalidProblems },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "课后练习发布失败" },
      { status: 400 },
    );
  }
}
