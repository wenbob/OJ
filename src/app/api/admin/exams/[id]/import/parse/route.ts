import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { parseProblemsMarkdown } from "@/lib/markdownParser";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const examId = Number(id);
  if (!Number.isInteger(examId)) {
    return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, examType: true },
  });
  if (!exam) return NextResponse.json({ error: "考试不存在" }, { status: 404 });

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.markdownImportJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }
  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const markdown = typeof record.markdown === "string" ? record.markdown : "";
  const defaultDifficulty =
    typeof record.defaultDifficulty === "string"
      ? record.defaultDifficulty
      : typeof record.difficulty === "string"
        ? record.difficulty
        : undefined;
  const defaultCategory =
    typeof record.defaultCategory === "string"
      ? record.defaultCategory
      : typeof record.category === "string"
        ? record.category
        : undefined;
  const result = parseProblemsMarkdown(markdown, {
    defaultCategory,
    defaultDifficulty,
  });
  const typeErrors = result.problems
    .filter((problem) => problem.problemType !== exam.examType)
    .map(
      (problem) =>
        `题目《${problem.title}》的题型与当前${
          exam.examType === "objective" ? "选择判断考试" : "编程考试"
        }不一致`,
    );
  return NextResponse.json({
    ...result,
    errors: [...result.errors, ...typeErrors],
  });
}
