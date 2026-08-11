import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { finishExamRecord, isExamExpired } from "@/lib/examScoring";
import { runExamStartSerialized } from "@/lib/examStartLock";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "student");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }

  const outcome = await runExamStartSerialized(auth.user.id, () =>
    prisma.$transaction(async (tx) => {
      const exam = await tx.exam.findUnique({
        where: { id: examId },
        select: {
          durationMin: true,
          id: true,
          status: true,
        },
      });
      if (!exam) return { kind: "missing" as const };

      const existingRecord = await tx.examRecord.findUnique({
        where: {
          examId_userId: {
            examId,
            userId: auth.user.id,
          },
        },
      });
      if (exam.status !== "published") {
        return {
          existingRecord,
          kind: "unavailable" as const,
          shouldExpire: existingRecord?.status === "in_progress",
        };
      }
      if (existingRecord) {
        if (existingRecord.status !== "in_progress") {
          return { kind: "finished" as const };
        }
        if (
          isExamExpired({
            durationMin: exam.durationMin,
            startedAt: existingRecord.startedAt,
          })
        ) {
          return { kind: "expired" as const };
        }
        return { examRecord: existingRecord, kind: "continue" as const };
      }

      const otherActiveRecord = await tx.examRecord.findFirst({
        where: {
          examId: { not: examId },
          status: "in_progress",
          userId: auth.user.id,
        },
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        select: { examId: true },
      });
      if (otherActiveRecord) {
        return { kind: "other-active" as const, otherActiveRecord };
      }

      const examRecord = await tx.examRecord.upsert({
        where: { examId_userId: { examId, userId: auth.user.id } },
        update: {},
        create: { examId, userId: auth.user.id },
      });
      if (examRecord.status !== "in_progress") {
        return { kind: "finished" as const };
      }
      return { examRecord, kind: "started" as const };
    }),
  );

  if (outcome.kind === "missing") {
    return NextResponse.json({ error: "考试不存在" }, { status: 404 });
  }
  if (outcome.kind === "unavailable") {
    if (outcome.shouldExpire) {
      await finishExamRecord({
        examId,
        status: "expired",
        userId: auth.user.id,
      });
    }
    if (outcome.existingRecord) {
      return NextResponse.json(
        {
          error: "考试已经结束，请查看结果",
          resultHref: `/student/exams/${examId}/result`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "考试未发布或已结束，不能开始考试" },
      { status: 403 },
    );
  }
  if (outcome.kind === "finished") {
    return NextResponse.json(
      {
        error: "考试已经结束，请查看结果",
        resultHref: `/student/exams/${examId}/result`,
      },
      { status: 409 },
    );
  }
  if (outcome.kind === "expired") {
    await finishExamRecord({
      examId,
      status: "expired",
      userId: auth.user.id,
    });
    return NextResponse.json(
      {
        error: "考试已超时，请查看结果",
        resultHref: `/student/exams/${examId}/result`,
      },
      { status: 409 },
    );
  }
  if (outcome.kind === "other-active") {
    return NextResponse.json(
      {
        error: "你还有另一场进行中的考试，请先返回该考试",
        redirectTo: `/student/exams/${outcome.otherActiveRecord.examId}/take`,
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      examRecord: outcome.examRecord,
      redirectTo: `/student/exams/${examId}/take`,
    },
    { status: outcome.kind === "started" ? 201 : 200 },
  );
}
