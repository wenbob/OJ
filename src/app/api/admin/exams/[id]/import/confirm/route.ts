import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { parseProblemsMarkdown } from "@/lib/markdownParser";
import type { ParsedProblemMarkdown } from "@/lib/markdownParser";
import {
  createImportedProblems,
  validateParsedProblems,
} from "@/lib/problemImport";
import {
  getObjectiveTotalScore,
} from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function readDefaults(record: Record<string, unknown>) {
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

  return { defaultCategory, defaultDifficulty };
}

function readProblemPayload(body: unknown, defaults: ReturnType<typeof readDefaults>) {
  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};

  if (Array.isArray(record.problems)) {
    return { errors: [], problems: record.problems as ParsedProblemMarkdown[] };
  }

  if (typeof record.markdown === "string") {
    return parseProblemsMarkdown(record.markdown, defaults);
  }

  return { errors: [], problems: [] };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const examId = Number(id);
    if (!Number.isInteger(examId)) {
      return NextResponse.json({ error: "考试 ID 不合法" }, { status: 400 });
    }

    const body = await readJsonWithLimit(
      request,
      REQUEST_LIMITS.markdownImportJsonBytes,
    );
    const record =
      typeof body === "object" && body ? (body as Record<string, unknown>) : {};
    const defaults = readDefaults(record);
    const parsed = readProblemPayload(body, defaults);
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, examType: true, status: true },
    });
    if (!exam) {
      return NextResponse.json({ error: "考试不存在" }, { status: 404 });
    }
    if (exam.status !== "draft") {
      return NextResponse.json(
        { error: "只有草稿考试可以导入题目" },
        { status: 409 },
      );
    }
    const typeErrors = parsed.problems
      .filter((problem) => problem.problemType !== exam.examType)
      .map(
        (problem) =>
          `题目《${problem.title}》的题型与当前${
            exam.examType === "objective" ? "选择判断考试" : "编程考试"
          }不一致`,
      );
    const errors = [
      ...parsed.errors,
      ...validateParsedProblems(parsed.problems, defaults),
      ...typeErrors,
    ];

    if (errors.length > 0) {
      return NextResponse.json({ errors, error: errors.join("；") }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const problemIds = await createImportedProblems(tx, parsed.problems, defaults);
      const maxOrder = await tx.examProblem.aggregate({
        where: { examId },
        _max: { order: true },
      });
      let nextOrder = (maxOrder._max.order ?? 0) + 1;

      for (const [index, problemId] of problemIds.entries()) {
        const parsedProblem = parsed.problems[index];
        const objectiveScore =
          parsedProblem?.problemType === "objective"
            ? getObjectiveTotalScore(parsedProblem.objectiveItems ?? [])
            : 100;
        await tx.examProblem.create({
          data: {
            examId,
            problemId,
            order: nextOrder,
            score: objectiveScore,
          },
        });
        nextOrder += 1;
      }

      return { problemIds };
    });

    return NextResponse.json(
      {
        count: result.problemIds.length,
        problemIds: result.problemIds,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    const message =
      error instanceof Error ? error.message : "Markdown 导入考试失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
