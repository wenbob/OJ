import type { Prisma } from "@prisma/client";

export async function snapshotExamProblems(
  tx: Prisma.TransactionClient,
  examId: number,
) {
  const examProblems = await tx.examProblem.findMany({
    where: { examId, snapshotAt: null },
    select: {
      id: true,
      score: true,
      problem: {
        select: {
          objectiveItems: true,
          problemType: true,
          title: true,
        },
      },
    },
  });
  if (examProblems.length === 0) return;

  const snapshotAt = new Date();
  await Promise.all(
    examProblems.map((examProblem) =>
      tx.examProblem.update({
        where: { id: examProblem.id },
        data: {
          snapshotAt,
          snapshotObjectiveItems: examProblem.problem.objectiveItems,
          snapshotProblemType: examProblem.problem.problemType,
          snapshotScore: examProblem.score,
          snapshotTitle: examProblem.problem.title,
        },
      }),
    ),
  );
}

export async function clearExamProblemSnapshots(
  tx: Prisma.TransactionClient,
  examId: number,
) {
  await tx.examProblem.updateMany({
    where: { examId },
    data: {
      snapshotAt: null,
      snapshotObjectiveItems: null,
      snapshotProblemType: null,
      snapshotScore: null,
      snapshotTitle: null,
    },
  });
}
