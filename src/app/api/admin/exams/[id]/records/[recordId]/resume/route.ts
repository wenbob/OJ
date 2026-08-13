import { NextRequest, NextResponse } from "next/server";
import { getExamEndAt, isExamExpired } from "@/lib/examScoring";
import { runExamRecordSerialized } from "@/lib/examStartLock";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { getExamAccessWhere, requireStaffApiUser } from "@/lib/staffAccess";

type RouteContext = {
  params: Promise<{ id: string; recordId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const { id, recordId: rawRecordId } = await context.params;
  const examId = Number(id);
  const recordId = Number(rawRecordId);
  if (!Number.isInteger(examId) || !Number.isInteger(recordId)) {
    return NextResponse.json({ error: "考试记录 ID 不合法" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }
  const payload =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const reason =
    typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (reason.length < 2 || reason.length > 200) {
    return NextResponse.json(
      { error: "恢复原因请输入 2–200 个字" },
      { status: 400 },
    );
  }

  const visibleExam = await prisma.exam.findFirst({
    where: getExamAccessWhere(auth.user, examId),
    select: { id: true },
  });
  if (!visibleExam) {
    return NextResponse.json({ error: "考试记录不存在" }, { status: 404 });
  }
  const visibleRecord = await prisma.examRecord.findFirst({
    where: { examId, id: recordId },
    select: { userId: true },
  });
  if (!visibleRecord) {
    return NextResponse.json({ error: "考试记录不存在" }, { status: 404 });
  }

  try {
    const result = await runExamRecordSerialized(visibleRecord.userId, () =>
      prisma.$transaction(async (tx) => {
        const exam = await tx.exam.findFirst({
          where: getExamAccessWhere(auth.user, examId),
          select: { durationMin: true, id: true, status: true },
        });
        const examRecord = await tx.examRecord.findFirst({
          where: { examId, id: recordId },
          include: { user: { select: { role: true, username: true } } },
        });
        if (!exam || !examRecord) throw new ResumeExamNotFoundError();
        if (examRecord.user.role !== "student") {
          throw new ResumeExamConflictError("只能恢复学生的考试记录");
        }
        if (exam.status !== "published") {
          throw new ResumeExamConflictError("考试未处于发布状态，不能恢复");
        }
        if (examRecord.status !== "submitted") {
          throw new ResumeExamConflictError(
            examRecord.status === "expired"
              ? "超时记录不能恢复"
              : "该考试记录当前不能恢复",
          );
        }
        if (
          isExamExpired({
            durationMin: exam.durationMin,
            startedAt: examRecord.startedAt,
          })
        ) {
          throw new ResumeExamConflictError("原考试时间已经结束，不能恢复");
        }

        const otherActiveRecord = await tx.examRecord.findFirst({
          where: {
            id: { not: examRecord.id },
            status: "in_progress",
            userId: examRecord.userId,
          },
          select: { examId: true },
        });
        if (otherActiveRecord) {
          throw new ResumeExamConflictError(
            "该学生还有另一场进行中的考试，不能恢复",
          );
        }

        const updated = await tx.examRecord.updateMany({
          where: { id: examRecord.id, status: "submitted" },
          data: {
            resumeLoginAllowed: true,
            status: "in_progress",
            submittedAt: null,
            totalScore: null,
          },
        });
        if (updated.count !== 1) {
          throw new ResumeExamConflictError("考试状态已变化，请刷新后重试");
        }
        await tx.examRecordResumeAudit.create({
          data: {
            examRecordId: examRecord.id,
            operatorId: auth.user.id,
            operatorRole: auth.user.role,
            operatorUsername: auth.user.username,
            reason,
          },
        });

        const endAt = getExamEndAt(examRecord.startedAt, exam.durationMin);
        return {
          endAt,
          examRecord: await tx.examRecord.findUniqueOrThrow({
            where: { id: examRecord.id },
          }),
          studentUsername: examRecord.user.username,
        };
      }),
    );
    return NextResponse.json({
      ...result,
      remainingSeconds: result.endAt
        ? Math.max(0, Math.ceil((result.endAt.getTime() - Date.now()) / 1000))
        : null,
    });
  } catch (error) {
    if (error instanceof ResumeExamNotFoundError) {
      return NextResponse.json({ error: "考试记录不存在" }, { status: 404 });
    }
    if (error instanceof ResumeExamConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[EXAM_RECORD_RESUME_ERROR]", {
      examId,
      message: error instanceof Error ? error.message : "unknown",
      recordId,
    });
    return NextResponse.json({ error: "恢复考试失败" }, { status: 500 });
  }
}

class ResumeExamNotFoundError extends Error {}

class ResumeExamConflictError extends Error {}
