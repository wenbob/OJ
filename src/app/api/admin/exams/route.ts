import { NextRequest, NextResponse } from "next/server";
import { isProblemType } from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import {
  getExamAccessWhere,
  requireStaffApiUser,
} from "@/lib/staffAccess";

function readExamPayload(body: unknown) {
  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const description =
    typeof record.description === "string" ? record.description.trim() : "";
  const durationMin =
    record.durationMin === undefined ||
    record.durationMin === null ||
    record.durationMin === ""
      ? null
      : Number(record.durationMin);
  const status = typeof record.status === "string" ? record.status : "draft";
  const examType =
    typeof record.examType === "string" ? record.examType : "programming";
  const aiEnabled = record.aiEnabled === true || record.aiEnabled === "true";

  return { title, description, durationMin, status, examType, aiEnabled };
}

function validateExamPayload(payload: ReturnType<typeof readExamPayload>) {
  if (!payload.title) return "考试名称不能为空";
  if (
    payload.durationMin !== null &&
    (!Number.isInteger(payload.durationMin) || payload.durationMin <= 0)
  ) {
    return "考试时长必须是正整数";
  }
  if (!["draft", "published", "ended"].includes(payload.status)) {
    return "考试状态不合法";
  }
  if (!isProblemType(payload.examType)) return "考试类型不合法";
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const exams = await prisma.exam.findMany({
    where: getExamAccessWhere(auth.user),
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, role: true, username: true } },
      _count: { select: { problems: true } },
    },
  });

  return NextResponse.json({ exams });
}

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
  const payload = readExamPayload(body);
  const error = validateExamPayload(payload);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (payload.status === "published") {
    return NextResponse.json(
      { error: "考试至少需要添加 1 道题后才能发布" },
      { status: 400 },
    );
  }

  const exam = await prisma.exam.create({
    data: {
      title: payload.title,
      description: payload.description || null,
      durationMin: payload.durationMin,
      status: payload.status,
      examType: payload.examType,
      aiEnabled: payload.aiEnabled,
      createdById: auth.user.id,
    },
  });

  return NextResponse.json({ exam }, { status: 201 });
}
