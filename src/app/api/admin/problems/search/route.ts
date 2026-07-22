import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/auth";
import { isProblemType } from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import {
  getOrderedProblemCategories,
  getProblemOrderBy,
  orderProblemCategories,
} from "@/lib/problemOrdering";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const keyword = request.nextUrl.searchParams.get("keyword")?.trim() ?? "";
  const category = request.nextUrl.searchParams.get("category")?.trim() ?? "";
  const problemType = request.nextUrl.searchParams.get("problemType")?.trim() ?? "";
  if (problemType && !isProblemType(problemType)) {
    return NextResponse.json({ error: "题型不合法" }, { status: 400 });
  }
  const where: Prisma.ProblemWhereInput = { archivedAt: null };
  if (keyword) {
    where.title = {
      contains: keyword,
    };
  }
  if (category) {
    where.category = category;
  }
  if (problemType) {
    where.problemType = problemType;
  }
  const problems = await prisma.problem.findMany({
    where,
    select: {
      id: true,
      title: true,
      difficulty: true,
      category: true,
      problemType: true,
    },
    orderBy: problemType
      ? getProblemOrderBy("custom")
      : [{ problemType: "asc" }, ...getProblemOrderBy("custom")],
    take: 200,
  });

  const categoryRows = await prisma.problem.findMany({
    where: { archivedAt: null, ...(problemType ? { problemType } : {}) },
    distinct: ["category"],
    select: { category: true },
  });

  const categoryNames = categoryRows.map((item) => item.category).filter(Boolean);
  const categories = isProblemType(problemType)
    ? await getOrderedProblemCategories(prisma, problemType, categoryNames)
    : orderProblemCategories(categoryNames, []);

  return NextResponse.json({
    problems,
    categories,
  });
}
