import { prisma } from "@/lib/prisma";
import { finishExamRecord, refreshFinishedExamScore } from "@/lib/examScoring";
import { getExamAccessWhere, type StaffUser } from "@/lib/staffAccess";

export class ExamLifecycleError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

// Production has one Node process, as does the existing Judge queue. Keep this
// state on globalThis so separately bundled routes and dev reloads share it.
const runtime = globalThis as typeof globalThis & {
  ojExamActivity?: { tails: Map<number, Promise<void>>; submissions: Map<number, number> };
};
const activity = runtime.ojExamActivity ??= {
  tails: new Map<number, Promise<void>>(),
  submissions: new Map<number, number>(),
};

export async function runExamLifecycleSerialized<T>(examId: number, task: () => Promise<T>) {
  const previous = activity.tails.get(examId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  activity.tails.set(examId, current);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (activity.tails.get(examId) === current) activity.tails.delete(examId);
  }
}

export function getExamSubmissionActivity(examId: number) {
  return activity.submissions.get(examId) ?? 0;
}

export async function withExamSubmissionActivity<T>(examId: number | null, task: () => Promise<T>) {
  if (examId === null) return task();
  await runExamLifecycleSerialized(examId, async () => {
    activity.submissions.set(examId, getExamSubmissionActivity(examId) + 1);
  });
  try {
    // Includes validation, queue wait, Judge, persistence and score refresh.
    return await task();
  } finally {
    await runExamLifecycleSerialized(examId, async () => {
      const remaining = getExamSubmissionActivity(examId) - 1;
      if (remaining > 0) activity.submissions.set(examId, remaining);
      else activity.submissions.delete(examId);
    });
  }
}

export async function settleEndedExamRecords(examId: number) {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { status: true } });
  if (exam?.status !== "ended") return;
  const records = await prisma.examRecord.findMany({
    where: { examId, status: "in_progress" }, select: { userId: true },
  });
  // Do not flood SQLite with concurrent write transactions.
  for (const record of records) {
    await finishExamRecord({ examId, userId: record.userId, status: "expired" });
  }
}

export async function deleteUnusedDraftExam(user: StaffUser, examId: number) {
  return runExamLifecycleSerialized(examId, () => prisma.$transaction(async (tx) => {
    const exam = await tx.exam.findFirst({
      where: getExamAccessWhere(user, examId),
      include: { _count: { select: { records: true, submissions: true, aiConversations: true, archiveAudits: true } } },
    });
    if (!exam) throw new ExamLifecycleError(404, "考试不存在");
    if (exam.status !== "draft" || exam.archivedAt || Object.values(exam._count).some((count) => count > 0)) {
      throw new ExamLifecycleError(409, "仅无历史记录的草稿考试可以永久删除；已结束考试请使用归档");
    }
    if (getExamSubmissionActivity(examId) > 0) throw new ExamLifecycleError(409, "仍有提交正在处理，请稍后重试");
    await tx.exam.delete({ where: { id: examId } });
  }));
}

export async function endExam(user: StaffUser, examId: number) {
  const exam = await prisma.$transaction(async (tx) => {
    const current = await tx.exam.findFirst({ where: getExamAccessWhere(user, examId) });
    if (!current) throw new ExamLifecycleError(404, "考试不存在");
    if (current.archivedAt) throw new ExamLifecycleError(409, "已归档考试只允许查看历史记录或取消归档");
    if (current.status === "ended") return current;
    if (current.status !== "published") throw new ExamLifecycleError(409, "草稿考试不能直接结束，请先发布考试");
    const changed = await tx.exam.updateMany({
      where: { ...getExamAccessWhere(user, examId), status: "published", archivedAt: null },
      data: { status: "ended" },
    });
    if (changed.count !== 1) throw new ExamLifecycleError(409, "考试状态已变化，请刷新后重试");
    return tx.exam.findUniqueOrThrow({ where: { id: examId } });
  });
  await settleEndedExamRecords(examId);
  return exam;
}

export async function setExamArchived(user: StaffUser, examId: number, archived: boolean) {
  return runExamLifecycleSerialized(examId, async () => {
    const accessible = await prisma.exam.findFirst({ where: getExamAccessWhere(user, examId) });
    if (!accessible) throw new ExamLifecycleError(404, "考试不存在");
    if (accessible.status !== "ended") throw new ExamLifecycleError(409, "请先结束考试并完成成绩结算，再归档");
    if (Boolean(accessible.archivedAt) === archived) return accessible;
    if (getExamSubmissionActivity(examId) > 0) {
      throw new ExamLifecycleError(409, "仍有提交正在处理，请等待评测和成绩更新完成后再归档");
    }
    if (archived) {
      await settleEndedExamRecords(examId);
      const records = await prisma.examRecord.findMany({ where: { examId }, select: { userId: true } });
      // Repair a stale cached total if a previous Judge score refresh failed.
      // The same snapshot-based calculation is already used by result pages.
      for (const record of records) await refreshFinishedExamScore({ examId, userId: record.userId });
    }
    return prisma.$transaction(async (tx) => {
      const exam = await tx.exam.findFirst({ where: getExamAccessWhere(user, examId) });
      if (!exam) throw new ExamLifecycleError(404, "考试不存在");
      if (exam.status !== "ended") throw new ExamLifecycleError(409, "考试状态已变化，请刷新后重试");
      if (Boolean(exam.archivedAt) === archived) return exam;
      if (archived && await tx.examRecord.count({ where: { examId, status: "in_progress" } }) > 0) {
        throw new ExamLifecycleError(409, "考试成绩尚未完成结算，请稍后重试");
      }
      const changed = await tx.exam.updateMany({
        where: { ...getExamAccessWhere(user, examId), status: "ended", archivedAt: exam.archivedAt },
        data: { archivedAt: archived ? new Date() : null },
      });
      if (changed.count !== 1) throw new ExamLifecycleError(409, "考试状态已变化，请刷新后重试");
      await tx.examArchiveAudit.create({ data: {
        examId, action: archived ? "archive" : "restore", operatorId: user.id,
        operatorUsername: user.username, operatorRole: user.role,
      } });
      return tx.exam.findUniqueOrThrow({ where: { id: examId } });
    });
  });
}
