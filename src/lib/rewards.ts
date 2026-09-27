import { randomInt } from "node:crypto";
import type { Prisma, PrismaClient, RewardChallenge } from "@prisma/client";
import { prisma } from "./prisma";
import { runExamRecordSerialized } from "./examStartLock";
import { isExamExpired } from "./examScoring";
import { parseObjectiveItems, validateObjectiveItems } from "./objectiveProblem";
import { CHALLENGE_DURATION_MS, REWARD_OFFER_DURATION_MS, REWARD_PAGE_SIZE, getRewardOfferStatus, validateRewardRange } from "./rewardShared";
import type { RewardChallengeView, RewardsResponse, RewardSubmissionUpdate } from "./rewardShared";

type Db = Prisma.TransactionClient;
export class RewardError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

// Shares the exam transition lock; database constraints remain the final authority.
export function rewardTransaction<T>(userId: number, task: (tx: Db) => Promise<T>, db: PrismaClient = prisma) {
  return runExamRecordSerialized(userId, async () => {
    for (let attempt = 0; ; attempt++) {
      try { return await db.$transaction(task, { maxWait: 15_000, timeout: 15_000 }); }
      catch (error) {
        const code = (error as { code?: string }).code;
        if (attempt >= 2 || !["P2034", "P1008", "P2028", "P2002"].includes(code ?? "")) throw error;
        await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)));
      }
    }
  });
}

export async function hasRewardBlockingExam(db: Db, userId: number, now = new Date()) {
  const records = await db.examRecord.findMany({
    where: { userId, startedAt: { lte: now }, OR: [{ status: "in_progress", exam: { status: "published" } }, { submittedAt: { gte: now } }] },
    select: { startedAt: true, exam: { select: { durationMin: true } } },
  });
  return records.some((record) => !isExamExpired({ startedAt: record.startedAt, durationMin: record.exam.durationMin, now }));
}

async function requireRewardStudent(db: Db, userId: number, now: Date) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== "student") throw new RewardError("只有学生可以领取奖励", 403);
  if (await hasRewardBlockingExam(db, userId, now)) throw new RewardError("考试期间不能抽奖或接受挑战");
}

function challengeView(challenge: RewardChallenge, amount: number, now: Date): RewardChallengeView {
  const status = challenge.status === "active"
    ? (challenge.expiresAt.getTime() < now.getTime() ? "expired" : "active")
    : challenge.status;
  return { id: challenge.id, rewardId: challenge.rewardId, targetProblemId: challenge.targetProblemId,
    targetTitle: challenge.targetTitle, status, acceptedAt: challenge.acceptedAt.toISOString(),
    expiresAt: challenge.expiresAt.toISOString(), amount };
}

// Called in the transaction that writes Problem.archivedAt (single or bulk).
// Repeated calls cannot extend an offer because only active challenges match.
export async function cancelRewardChallengesForArchivedProblems(db: Db, problemIds: number[], archivedAt: Date) {
  const valid = { targetProblemId: { in: problemIds }, status: "active", acceptedAt: { lte: archivedAt }, expiresAt: { gte: archivedAt } };
  await db.rewardDraw.updateMany({ where: { challenges: { some: valid } },
    data: { offerExpiresAt: new Date(archivedAt.getTime() + REWARD_OFFER_DURATION_MS) } });
  await db.rewardChallenge.updateMany({ where: valid, data: { status: "cancelled" } });
  await db.rewardChallenge.updateMany({ where: { targetProblemId: { in: problemIds }, status: "active", expiresAt: { lt: archivedAt } }, data: { status: "expired" } });
}

async function reconcileChallenges(db: Db, userId: number, now: Date) {
  await db.rewardChallenge.updateMany({ where: { userId, status: "active", expiresAt: { lt: now } }, data: { status: "expired" } });
}

export async function drawReward(userId: number, rewardId: number, db: PrismaClient = prisma) {
  return rewardTransaction(userId, async (tx) => {
    const now = new Date();
    await requireRewardStudent(tx, userId, now);
    const reward = await tx.rewardDraw.findFirst({ where: { id: rewardId, userId } });
    if (!reward) throw new RewardError("奖励不存在", 404);
    if (reward.amount !== null) return reward;
    const amount = randomInt(reward.minPoints, reward.maxPoints + 1);
    await tx.pointReward.create({ data: { userId, rewardId, kind: "draw", amount } });
    return tx.rewardDraw.update({ where: { id: rewardId }, data: { amount, drawnAt: now,
      offerExpiresAt: new Date(now.getTime() + REWARD_OFFER_DURATION_MS) } });
  }, db);
}

export async function acceptRewardChallenge(userId: number, rewardId: number, db: PrismaClient = prisma) {
  return rewardTransaction(userId, async (tx) => {
    const now = new Date();
    await requireRewardStudent(tx, userId, now);
    const reward = await tx.rewardDraw.findFirst({ where: { id: rewardId, userId } });
    if (!reward) throw new RewardError("奖励不存在", 404);
    if (reward.amount === null) throw new RewardError("请先完成抽奖");
    await reconcileChallenges(tx, userId, now);
    const previous = await tx.rewardChallenge.findFirst({ where: { rewardId }, orderBy: { id: "desc" } });
    if (previous && previous.status !== "cancelled") return previous;
    if (getRewardOfferStatus(reward.amount, reward.offerExpiresAt, previous?.status, now) !== "available") {
      throw new RewardError("翻倍机会已过期，原奖励积分保留");
    }
    if (await tx.rewardChallenge.findFirst({ where: { userId, status: "active" } })) {
      throw new RewardError("你已有一道进行中的翻倍挑战，完成或超时后可再接受");
    }
    // Randomly inspect candidate IDs, avoiding loading all test data or question bodies.
    const candidates = await tx.problem.findMany({
      where: { archivedAt: null, problemType: reward.problemType, category: reward.category,
        submissions: { none: { userId, status: "Accepted" } } }, select: { id: true },
    });
    while (candidates.length) {
      const [candidate] = candidates.splice(randomInt(candidates.length), 1);
      const problem = await tx.problem.findUnique({ where: { id: candidate.id },
        select: { id: true, title: true, problemType: true, objectiveItems: true, _count: { select: { testCases: true } } } });
      if (!problem) continue;
      if (problem.problemType === "programming" ? problem._count.testCases === 0
        : validateObjectiveItems(parseObjectiveItems(problem.objectiveItems)).length > 0) continue;
      return tx.rewardChallenge.create({ data: { userId, rewardId, targetProblemId: problem.id,
        targetTitle: problem.title, acceptedAt: now, expiresAt: new Date(now.getTime() + CHALLENGE_DURATION_MS) } });
    }
    throw new RewardError("同题型、同分类暂时没有你未通过的可用题目，可在接受期限内重试，倒计时不会暂停");
  }, db);
}

// Called inside the same transaction that saves the judged submission.
export async function recordAcceptedRewards(tx: Db, input: {
  userId: number; submissionId: number; status: string; examId: number | null; receivedAt: Date;
  problem: { id: number; title: string; problemType: string; category: string };
}): Promise<RewardSubmissionUpdate> {
  const empty = { rewardId: null, doubledPoints: 0 };
  if (input.status !== "Accepted" || input.examId !== null) return empty;
  const user = await tx.user.findUnique({ where: { id: input.userId }, select: { role: true } });
  if (user?.role !== "student" || await hasRewardBlockingExam(tx, input.userId, input.receivedAt)) return empty;
  let doubledPoints = 0;
  const target = await tx.problem.findUnique({ where: { id: input.problem.id }, select: { archivedAt: true } });
  if (target && !target.archivedAt) {
    const challenges = await tx.rewardChallenge.findMany({ where: {
      userId: input.userId, targetProblemId: input.problem.id, status: { in: ["active", "expired"] },
      acceptedAt: { lte: input.receivedAt }, expiresAt: { gte: input.receivedAt },
    }, include: { reward: true } });
    for (const challenge of challenges) {
      const amount = challenge.reward.amount;
      if (amount === null) continue;
      const existing = await tx.pointReward.findUnique({ where: { rewardId_kind: { rewardId: challenge.rewardId, kind: "double" } } });
      if (!existing) {
        await tx.pointReward.create({ data: { userId: input.userId, rewardId: challenge.rewardId, kind: "double", amount } });
        doubledPoints += amount;
      }
      await tx.rewardChallenge.update({ where: { id: challenge.id }, data: {
        status: "completed", completedAt: new Date(), completedSubmissionId: input.submissionId,
      } });
    }
  }
  const prior = await tx.submission.findFirst({ where: { userId: input.userId, problemId: input.problem.id,
    status: "Accepted", id: { not: input.submissionId } }, select: { id: true } });
  if (prior) return { rewardId: null, doubledPoints };
  const config = { rewardsEnabled: "true", rewardMinPoints: "1", rewardMaxPoints: "10" };
  const rows = await tx.systemSetting.findMany({ where: { key: { in: Object.keys(config) } } });
  for (const row of rows) config[row.key as keyof typeof config] = row.value;
  if (config.rewardsEnabled !== "true" || validateRewardRange(config.rewardMinPoints, config.rewardMaxPoints)) return { rewardId: null, doubledPoints };
  const reward = await tx.rewardDraw.upsert({
    where: { userId_sourceProblemId: { userId: input.userId, sourceProblemId: input.problem.id } }, update: {},
    create: { userId: input.userId, sourceProblemId: input.problem.id, sourceSubmissionId: input.submissionId,
      problemTitle: input.problem.title, problemType: input.problem.problemType, category: input.problem.category,
      minPoints: Number(config.rewardMinPoints), maxPoints: Number(config.rewardMaxPoints) },
  });
  return { rewardId: reward.id, doubledPoints };
}

export async function getRewards(userId: number, options: { page?: number; rewardId?: number; problemId?: number } = {}, db: PrismaClient = prisma): Promise<RewardsResponse> {
  const now = new Date();
  const where = { userId, ...(options.rewardId ? { id: options.rewardId } : {}),
    ...(options.problemId ? { sourceProblemId: options.problemId } : {}) };
  const total = await db.rewardDraw.count({ where });
  if (options.rewardId && !total) throw new RewardError("奖励不存在", 404);
  const totalPages = Math.max(1, Math.ceil(total / REWARD_PAGE_SIZE));
  const page = Math.min(options.page ?? 1, totalPages);
  const [rewards, active, points, pendingDrawCount, blockedByExam] = await Promise.all([
    db.rewardDraw.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: REWARD_PAGE_SIZE,
      skip: (page - 1) * REWARD_PAGE_SIZE, include: { challenges: { orderBy: { id: "desc" }, take: 1 } } }),
    db.rewardChallenge.findMany({ where: { userId, status: "active" }, include: { reward: true } }),
    db.pointReward.aggregate({ where: { userId }, _sum: { amount: true } }),
    db.rewardDraw.count({ where: { userId, amount: null } }),
    hasRewardBlockingExam(db, userId, now),
  ]);
  const views = active.map((c) => challengeView(c, c.reward.amount ?? 0, now));
  return { serverNow: now.toISOString(), page, totalPages, rewardPoints: points._sum.amount ?? 0, pendingDrawCount, blockedByExam,
    currentChallenge: views.find((c) => c.status === "active") ?? null,
    rewards: rewards.map((reward) => ({ id: reward.id, problemTitle: reward.problemTitle,
      amount: reward.amount, minPoints: reward.minPoints, maxPoints: reward.maxPoints,
      offerExpiresAt: reward.offerExpiresAt?.toISOString() ?? null,
      offerStatus: getRewardOfferStatus(reward.amount, reward.offerExpiresAt, reward.challenges[0]?.status, now),
      createdAt: reward.createdAt.toISOString(), challenge: reward.challenges[0]
        ? challengeView(reward.challenges[0], reward.amount ?? 0, now) : null })),
  };
}
