import { AppShell } from "@/components/AppShell";
import { requirePageUser } from "@/lib/auth";
import {
  buildPaginationMeta,
  readPaginationFromObject,
} from "@/lib/pagination";
import { isProblemType, normalizeProblemType } from "@/lib/objectiveProblem";
import { prisma } from "@/lib/prisma";
import { getPracticeSubmissionCountsByProblem } from "@/lib/problemSubmissionCounts";
import { ProblemManager } from "./problem-manager";

const adminNav = [
  { href: "/admin", label: "后台首页" },
  { href: "/admin/practice", label: "题目练习" },
  { href: "/admin/problems", label: "题目管理" },
  { href: "/admin/exams", label: "模拟考试" },
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/submissions", label: "日常提交" },
  { href: "/admin/exam-submissions", label: "考试提交" },
];

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProblemsPage({ searchParams }: PageProps) {
  const user = await requirePageUser("admin");
  const query = await searchParams;
  const selectedCategory = Array.isArray(query.category)
    ? query.category[0]
    : query.category;
  const normalizedCategory = selectedCategory?.trim() || "";
  const selectedProblemType = Array.isArray(query.problemType)
    ? query.problemType[0]
    : query.problemType;
  const problemType = isProblemType(selectedProblemType)
    ? selectedProblemType
    : "programming";
  const createValue = Array.isArray(query.create) ? query.create[0] : query.create;
  const { page, pageSize, skip } = readPaginationFromObject(query);
  const where = {
    archivedAt: null,
    problemType,
    ...(normalizedCategory ? { category: normalizedCategory } : {}),
  };
  const [problems, total, allCategories] = await Promise.all([
    prisma.problem.findMany({
      where,
      include: {
        testCases: { orderBy: { id: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.problem.count({ where }),
    prisma.problem.findMany({
      where: { archivedAt: null, problemType },
      select: { category: true },
      orderBy: { category: "asc" },
    }),
  ]);
  const submissionCounts = await getPracticeSubmissionCountsByProblem({
    problemIds: problems.map((problem) => problem.id),
  });

  const initialProblems = problems.map((problem) => ({
    id: problem.id,
    title: problem.title,
    description: problem.description,
    inputDescription: problem.inputDescription,
    outputDescription: problem.outputDescription,
    sampleInput: problem.sampleInput,
    sampleOutput: problem.sampleOutput,
    dataRange: problem.dataRange ?? "",
    difficulty: problem.difficulty,
    category: problem.category,
    problemType: normalizeProblemType(problem.problemType),
    objectiveItems: problem.objectiveItems,
    testCases: problem.testCases.map((testCase) => ({
      id: testCase.id,
      input: testCase.input,
      output: testCase.output,
      isSample: testCase.isSample,
    })),
    submissions: submissionCounts.get(problem.id) ?? 0,
  }));

  const categories = Array.from(
    new Set(
      allCategories
        .map((problem) => problem.category?.trim() || "未分类")
        .filter(Boolean),
    ),
  );

  return (
    <AppShell nav={adminNav} title="管理员端" user={user}>
      <ProblemManager
        categories={categories}
        initialCategory={normalizedCategory}
        initialPagination={buildPaginationMeta({ page, pageSize, total })}
        initialProblemType={problemType}
        initialProblems={initialProblems}
        key={`${problemType}:${normalizedCategory}:${page}:${pageSize}:${createValue === "1" ? "create" : "list"}`}
        openCreateForm={createValue === "1"}
      />
    </AppShell>
  );
}
