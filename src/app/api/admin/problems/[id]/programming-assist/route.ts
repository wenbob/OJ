import { NextRequest, NextResponse } from "next/server";
import { handleProblemAssist } from "@/lib/problemAiAssistRoute";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const problemId = Number(id);

  if (!Number.isInteger(problemId)) {
    return NextResponse.json({ error: "题目 ID 不合法" }, { status: 400 });
  }

  return handleProblemAssist(request, {
    audience: "staff",
    requiredProblemId: problemId,
  });
}
