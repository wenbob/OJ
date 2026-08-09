import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      problems: {
        select: {
          id: true,
          problemId: true,
          order: true,
          score: true,
          problem: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              category: true,
              problemType: true,
            },
          },
        },
        orderBy: [{ order: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!exam || exam.status !== "published") {
    return NextResponse.json({ error: "考试不存在或尚未发布" }, { status: 404 });
  }

  return NextResponse.json({ exam });
}
