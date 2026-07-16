import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  getPublicObjectiveItems,
  parseObjectiveItems,
} from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const problemId = Number(id);
  if (!Number.isInteger(problemId)) {
    return NextResponse.json({ error: "题目 ID 不合法" }, { status: 400 });
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      archivedAt: true,
      id: true,
      title: true,
      description: true,
      inputDescription: true,
      outputDescription: true,
      sampleInput: true,
      sampleOutput: true,
      dataRange: true,
      difficulty: true,
      category: true,
      problemType: true,
      objectiveItems: true,
      testCases: {
        where: { isSample: true },
        orderBy: { id: "asc" },
        select: {
          id: true,
          input: true,
          output: true,
          isSample: true,
        },
      },
    },
  });

  if (!problem || problem.archivedAt) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  return NextResponse.json({
    problem: {
      ...problem,
      archivedAt: undefined,
      objectiveItems:
        problem.problemType === "objective"
          ? getPublicObjectiveItems(parseObjectiveItems(problem.objectiveItems))
          : [],
    },
  });
}
