import type { Prisma } from "@prisma/client";
import {
  normalizeProblemType,
  parseObjectiveItems,
} from "@/lib/objectiveProblem";

export const adminProblemSummarySelect = {
  _count: { select: { testCases: true } },
  category: true,
  difficulty: true,
  id: true,
  objectiveItems: true,
  problemType: true,
  title: true,
} satisfies Prisma.ProblemSelect;

type AdminProblemSummaryRow = Prisma.ProblemGetPayload<{
  select: typeof adminProblemSummarySelect;
}>;

export function toAdminProblemSummary(problem: AdminProblemSummaryRow) {
  const problemType = normalizeProblemType(problem.problemType);
  return {
    category: problem.category,
    difficulty: problem.difficulty,
    id: problem.id,
    itemCount:
      problemType === "objective"
        ? parseObjectiveItems(problem.objectiveItems).length
        : (problem._count?.testCases ?? 0),
    problemType,
    title: problem.title,
  };
}
