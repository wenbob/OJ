import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { isProblemType } from "@/lib/objectiveProblem";
import { orderProblemCategories } from "@/lib/problemOrdering";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  try {
    const body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
    const record =
      typeof body === "object" && body ? (body as Record<string, unknown>) : {};
    const problemType =
      typeof record.problemType === "string" ? record.problemType.trim() : "";
    const rawCategories = Array.isArray(record.categories) ? record.categories : null;
    if (!isProblemType(problemType)) {
      return NextResponse.json({ error: "题型不合法" }, { status: 400 });
    }
    if (!rawCategories) {
      return NextResponse.json({ error: "分类顺序格式不合法" }, { status: 400 });
    }

    const categories = rawCategories.map((value) =>
      typeof value === "string" ? value.trim() : "",
    );
    if (
      categories.some((category) => !category || category.length > 200) ||
      new Set(categories).size !== categories.length
    ) {
      return NextResponse.json(
        { error: "分类不能为空、重复或超过 200 个字符" },
        { status: 400 },
      );
    }

    const currentRows = await prisma.problem.findMany({
      where: { archivedAt: null, problemType },
      select: { category: true },
    });
    const currentCategories = orderProblemCategories(
      currentRows.map((row) => row.category),
      [],
    );
    const submittedSet = new Set(categories);
    if (
      currentCategories.length !== categories.length ||
      currentCategories.some((category) => !submittedSet.has(category))
    ) {
      return NextResponse.json(
        { error: "分类列表已发生变化，请刷新后重试" },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.problemCategoryOrder.deleteMany({
        where: {
          problemType,
          ...(categories.length > 0
            ? { category: { notIn: categories } }
            : {}),
        },
      });
      for (const [sortOrder, category] of categories.entries()) {
        await tx.problemCategoryOrder.upsert({
          where: { problemType_category: { problemType, category } },
          create: { problemType, category, sortOrder },
          update: { sortOrder },
        });
      }
    });

    return NextResponse.json({ categories, ok: true });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "保存分类顺序失败" }, { status: 500 });
  }
}
