import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  finishExamRecord,
  isExamExpired,
} from "@/lib/examScoring";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const EXAM_SUBMIT_TRIGGERS = new Set([
  "history-exit",
  "link-exit",
  "manual",
  "objective-complete",
  "pagehide",
  "reload",
]);

function getExamSubmitTrigger(request: NextRequest) {
  const trigger = request.nextUrl.searchParams.get("trigger") ?? "";
  return EXAM_SUBMIT_TRIGGERS.has(trigger) ? trigger : "unknown";
}

function logExamSubmit({
  examId,
  initialStatus,
  recordId,
  resultingStatus,
  trigger,
  userId,
}: {
  examId: number;
  initialStatus: string;
  recordId: number;
  resultingStatus: string;
  trigger: string;
  userId: number;
}) {
  console.info(
    JSON.stringify({
      event: "exam_submit",
      examId,
      initialStatus,
      recordId,
      resultingStatus,
      trigger,
      userId,
    }),
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "student");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }

  const record = await prisma.examRecord.findUnique({
    where: {
      examId_userId: {
        examId,
        userId: auth.user.id,
      },
    },
    include: {
      exam: {
        select: {
          durationMin: true,
          status: true,
        },
      },
    },
  });

  if (!record) {
    return NextResponse.json({ error: "请先开始考试" }, { status: 404 });
  }

  const trigger = getExamSubmitTrigger(request);

  if (record.status !== "in_progress") {
    logExamSubmit({
      examId,
      initialStatus: record.status,
      recordId: record.id,
      resultingStatus: record.status,
      trigger,
      userId: auth.user.id,
    });
    return NextResponse.json({
      examRecord: record,
      resultHref: `/student/exams/${examId}/result`,
    });
  }

  const shouldExpire =
    record.exam.status !== "published" ||
    isExamExpired({
      durationMin: record.exam.durationMin,
      startedAt: record.startedAt,
    });

  if (shouldExpire) {
    const examRecord = await finishExamRecord({
      examId,
      status: "expired",
      userId: auth.user.id,
    });
    logExamSubmit({
      examId,
      initialStatus: record.status,
      recordId: record.id,
      resultingStatus: examRecord.status,
      trigger,
      userId: auth.user.id,
    });
    return NextResponse.json({
      examRecord,
      resultHref: `/student/exams/${examId}/result`,
    });
  }

  const examRecord = await finishExamRecord({
    examId,
    status: "submitted",
    userId: auth.user.id,
  });
  logExamSubmit({
    examId,
    initialStatus: record.status,
    recordId: record.id,
    resultingStatus: examRecord.status,
    trigger,
    userId: auth.user.id,
  });

  return NextResponse.json({
    examRecord,
    resultHref: `/student/exams/${examId}/result`,
  });
}
