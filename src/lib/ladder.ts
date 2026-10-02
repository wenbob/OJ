import type { Prisma, PrismaClient, StudentPointAdjustment } from "@prisma/client";
import { prisma } from "./prisma";
import { runExamRecordSerialized } from "./examStartLock";
import { buildPaginationMeta } from "./pagination";
import { getLadderSettings } from "./ladderSettings";
import { getStudentRankingSummariesForUsers, getStudentRankingSummaryForUser } from "./ranking";
import { LadderError, ladderTransaction } from "./ladderTransaction";
import { isLadderPointValue, parsePointAdjustmentInput, previewAdjustedPoints, type PointAdjustmentInput, type PointAdjustmentMode, type PointAdjustmentView, type RankTier } from "./ladderShared";

function adjustmentView(row: StudentPointAdjustment): PointAdjustmentView {
  return { id: row.id, studentId: row.studentId, studentIdSnapshot: row.studentIdSnapshot,
    studentUsername: row.studentUsername, administratorUsername: row.administratorUsername,
    mode: row.mode as PointAdjustmentMode, inputPoints: row.inputPoints, amount: row.amount,
    beforePoints: row.beforePoints, afterPoints: row.afterPoints, reason: row.reason,
    createdAt: row.createdAt.toISOString() };
}

export async function getLadderStudentPage({ page, pageSize, query = "", tiers }: {
  page: number; pageSize: number; query?: string; tiers?: readonly RankTier[];
}, db: PrismaClient = prisma) {
  const normalizedQuery = query.trim().slice(0, 100);
  const currentTiers = tiers ?? (await getLadderSettings(db)).tiers;
  const where = { role: "student", ...(normalizedQuery ? { username: { contains: normalizedQuery } } : {}) };
  const [total, students] = await db.$transaction([
    db.user.count({ where }),
    db.user.findMany({ where, select: { id: true, username: true, role: true, studentProfile: { select: { customTitle: true } } },
      orderBy: [{ username: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const rankings = await getStudentRankingSummariesForUsers(students, db, currentTiers);
  return { ...buildPaginationMeta({ page, pageSize, total }), query: normalizedQuery, tiers: currentTiers,
    students: rankings.map((ranking) => ({ ...ranking, adjustmentPoints: ranking.points - ranking.basePoints - ranking.rewardPoints })) };
}

export async function getPointAdjustmentPage({ page, pageSize, query = "", mode, studentId }: {
  page: number; pageSize: number; query?: string; mode?: PointAdjustmentMode; studentId?: number;
}, db: PrismaClient = prisma) {
  const normalizedQuery = query.trim().slice(0, 100);
  const where: Prisma.StudentPointAdjustmentWhereInput = {
    ...(normalizedQuery ? { studentUsername: { contains: normalizedQuery } } : {}),
    ...(mode ? { mode } : {}), ...(studentId ? { studentIdSnapshot: studentId } : {}),
  };
  const [total, rows] = await db.$transaction([
    db.studentPointAdjustment.count({ where }),
    db.studentPointAdjustment.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { ...buildPaginationMeta({ page, pageSize, total }), query: normalizedQuery, mode: mode ?? ("" as const), records: rows.map(adjustmentView) };
}

export async function applyPointAdjustment(studentId: number, actorId: number, rawInput: PointAdjustmentInput, db: PrismaClient = prisma) {
  let input: PointAdjustmentInput;
  try { input = parsePointAdjustmentInput(rawInput); }
  catch (error) { throw new LadderError((error as Error).message, 400); }
  return runExamRecordSerialized(studentId, () => ladderTransaction(async (tx) => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, username: true, role: true } });
    if (actor?.role !== "admin") throw new LadderError("只有管理员可以调整积分", 403);
    const existing = await tx.studentPointAdjustment.findUnique({ where: { requestId: input.requestId } });
    if (existing) {
      if (existing.studentIdSnapshot !== studentId || existing.administratorIdSnapshot !== actorId ||
        existing.mode !== input.mode || existing.inputPoints !== input.inputPoints || existing.beforePoints !== input.expectedPoints || existing.reason !== input.reason) {
        throw new LadderError("请求标识已用于其他调分操作");
      }
      return { adjustment: adjustmentView(existing), ranking: await getStudentRankingSummaryForUser(studentId, tx), replayed: true, changed: false };
    }
    const settings = await getLadderSettings(tx);
    const ranking = await getStudentRankingSummaryForUser(studentId, tx, settings.tiers);
    if (!ranking) throw new LadderError("学生不存在或已不是学生账号", 404);
    if (ranking.points !== input.expectedPoints) throw new LadderError("学生积分已变化，请重新核对后再提交", 409, ranking.points);
    const afterPoints = previewAdjustedPoints(ranking.points, input.mode, input.inputPoints);
    if (!isLadderPointValue(afterPoints)) throw new LadderError(afterPoints < 0 ? "扣分后总积分不能低于 0" : "调整后的积分超出允许范围", 400);
    const amount = afterPoints - ranking.points;
    if (amount === 0) return { adjustment: null, ranking, replayed: false, changed: false };
    const adjustment = await tx.studentPointAdjustment.create({ data: {
      studentId, studentIdSnapshot: studentId, studentUsername: ranking.username,
      administratorId: actor.id, administratorIdSnapshot: actor.id, administratorUsername: actor.username,
      mode: input.mode, inputPoints: input.inputPoints, amount, beforePoints: ranking.points, afterPoints,
      reason: input.reason, requestId: input.requestId,
    } });
    return { adjustment: adjustmentView(adjustment), ranking: await getStudentRankingSummaryForUser(studentId, tx, settings.tiers), replayed: false, changed: true };
  }, db));
}
