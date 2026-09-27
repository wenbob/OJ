import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { acceptRewardChallenge, cancelRewardChallengesForArchivedProblems, drawReward, getRewards, recordAcceptedRewards, rewardTransaction } from "./rewards";
import { getStudentRankingSummaryForUser } from "./ranking";
import { REWARD_OFFER_DURATION_MS, validateRewardRange } from "./rewardShared";

let db: PrismaClient;
let directory: string;
const objectiveItems = JSON.stringify([{ kind: "choice", stem: "one", options: [{ label: "A", text: "yes" }, { label: "B", text: "no" }], answer: "A", score: 10 }]);
async function problem(id: number, overrides = {}) {
  return db.problem.create({ data: { id, title: `problem-${id}`, description: "test", inputDescription: "", outputDescription: "",
    sampleInput: "", sampleOutput: "", difficulty: "easy", category: "loops", testCases: { create: { input: "", output: "" } }, ...overrides } });
}
async function submit(problemId: number, options: { userId?: number; receivedAt?: Date; status?: string; examId?: number } = {}) {
  const userId = options.userId ?? 1;
  return rewardTransaction(userId, async (tx) => {
    const p = await tx.problem.findUniqueOrThrow({ where: { id: problemId } });
    const receivedAt = options.receivedAt ?? new Date();
    const submission = await tx.submission.create({ data: { userId, problemId, status: options.status ?? "Accepted", code: "A", language: "test",
      createdAt: receivedAt, examId: options.examId ?? null, submissionType: options.examId ? "exam" : "practice" } });
    return recordAcceptedRewards(tx, { userId, submissionId: submission.id, status: submission.status,
      receivedAt, examId: options.examId ?? null, problem: p });
  }, db);
}
async function earned(id = 1) { const result = await submit(id); await drawReward(1, result.rewardId!, db); return result.rewardId!; }

beforeEach(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), "oj-rewards-"));
  const file = path.join(directory, "test.db");
  const sql = new DatabaseSync(file);
  sql.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8")); sql.close();
  db = new PrismaClient({ datasources: { db: { url: `file:${file.replaceAll("\\", "/")}` } } });
  await db.user.createMany({ data: [
    { id: 1, username: "student", role: "student", passwordHash: "test" },
    { id: 2, username: "other", role: "student", passwordHash: "test" },
    { id: 3, username: "teacher", role: "teacher", passwordHash: "test" },
    { id: 4, username: "admin", role: "admin", passwordHash: "test" },
  ] });
  await problem(1); await problem(2);
  await db.systemSetting.update({ where: { key: "rewardMinPoints" }, data: { value: "7" } });
  await db.systemSetting.update({ where: { key: "rewardMaxPoints" }, data: { value: "7" } });
});
afterEach(async () => { vi.useRealTimers(); await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("persisted rewards", () => {
  it("awards one opportunity across concurrent first submissions, retries draw once and changes total ranking", async () => {
    const results = await Promise.all([submit(1), submit(1)]);
    expect(results.filter((r) => r.rewardId)).toHaveLength(1);
    const id = results.find((r) => r.rewardId)!.rewardId!;
    const drawn = await Promise.all([drawReward(1, id, db), drawReward(1, id, db)]);
    expect(drawn.map((r) => r.amount)).toEqual([7, 7]);
    expect(await db.pointReward.count()).toBe(1);
    expect(await getStudentRankingSummaryForUser(1, db)).toMatchObject({ points: 17, basePoints: 10, rewardPoints: 7 });
    expect(await submit(1)).toEqual({ rewardId: null, doubledPoints: 0 });
    await expect(drawReward(2, id, db)).rejects.toMatchObject({ status: 404 });
    await expect(drawReward(3, id, db)).rejects.toMatchObject({ status: 403 });
    await expect(drawReward(4, id, db)).rejects.toMatchObject({ status: 403 });
  });

  it("preserves snapshots across config changes, disabled mode and reconnection", async () => {
    const { rewardId } = await submit(1);
    await db.systemSetting.updateMany({ where: { key: { in: ["rewardMinPoints", "rewardMaxPoints"] } }, data: { value: "99" } });
    await db.systemSetting.update({ where: { key: "rewardsEnabled" }, data: { value: "false" } });
    await db.$disconnect();
    expect((await drawReward(1, rewardId!, db)).amount).toBe(7);
    expect((await submit(2)).rewardId).toBeNull();
    await db.systemSetting.update({ where: { key: "rewardsEnabled" }, data: { value: "true" } });
    expect((await submit(2)).rewardId).toBeNull();
  });

  it("excludes old accepted submissions, exams, partial objective results and staff", async () => {
    await db.submission.create({ data: { userId: 1, problemId: 1, code: "x", language: "test", status: "Accepted", submissionType: "exam" } });
    expect((await submit(1)).rewardId).toBeNull();
    expect((await submit(2, { userId: 3 })).rewardId).toBeNull();
    expect((await submit(2, { userId: 4 })).rewardId).toBeNull();
    expect((await submit(2, { status: "Wrong Answer" })).rewardId).toBeNull();
    const exam = await db.exam.create({ data: { title: "exam", status: "published" } });
    expect((await submit(2, { examId: exam.id })).rewardId).toBeNull();
    expect((await submit(2)).rewardId).toBeNull();
  });

  it("selects only available same-type same-category unanswered valid questions and enforces one active challenge", async () => {
    await problem(3, { category: "different" });
    await problem(4, { problemType: "objective", objectiveItems });
    await problem(5, { archivedAt: new Date() });
    await problem(6, { testCases: undefined });
    const id = await earned();
    const [a, b] = await Promise.all([acceptRewardChallenge(1, id, db), acceptRewardChallenge(1, id, db)]);
    expect(a.id).toBe(b.id); expect(a.targetProblemId).toBe(2);
    expect(a.expiresAt.getTime() - a.acceptedAt.getTime()).toBe(86_400_000);
    const other = await earned(3);
    await expect(acceptRewardChallenge(1, other, db)).rejects.toThrow("已有一道");
    await expect(db.rewardChallenge.create({ data: { userId: 1, rewardId: other, targetProblemId: 4,
      targetTitle: "forced", expiresAt: new Date(Date.now() + 10000) } })).rejects.toThrow();
  });

  it("completes once at the exact deadline, grants a new draw and honors late judge results after expiry", async () => {
    const id = await earned();
    const challenge = await acceptRewardChallenge(1, id, db);
    const deadline = new Date(Date.now() - 1000);
    await db.rewardChallenge.update({ where: { id: challenge.id }, data: { acceptedAt: new Date(deadline.getTime() - 5000), expiresAt: deadline, status: "expired" } });
    const result = await submit(2, { receivedAt: deadline });
    expect(result.doubledPoints).toBe(7); expect(result.rewardId).not.toBeNull();
    expect((await submit(2, { receivedAt: deadline })).doubledPoints).toBe(0);
    expect(await db.pointReward.count({ where: { kind: "double" } })).toBe(1);
    expect(await getStudentRankingSummaryForUser(1, db)).toMatchObject({ points: 34, basePoints: 20, rewardPoints: 14 });
  });

  it("does not count a submission received before acceptance or after the deadline", async () => {
    const id = await earned(); const c = await acceptRewardChallenge(1, id, db);
    expect((await submit(2, { receivedAt: new Date(c.acceptedAt.getTime() - 1) })).doubledPoints).toBe(0);
    expect((await submit(2, { receivedAt: new Date(c.expiresAt.getTime() + 1) })).doubledPoints).toBe(0);
  });

  it("restores the opportunity for an archived target, preserves awarded points and handles no candidates", async () => {
    const id = await earned(); const c = await acceptRewardChallenge(1, id, db);
    await db.$transaction(async (tx) => {
      const archivedAt = new Date();
      await tx.problem.update({ where: { id: 2 }, data: { archivedAt } });
      await cancelRewardChallengesForArchivedProblems(tx, [2], archivedAt);
    });
    expect((await getRewards(1, {}, db)).rewards[0].challenge?.status).toBe("cancelled");
    await expect(acceptRewardChallenge(1, id, db)).rejects.toThrow("暂时没有");
    await problem(3);
    const replacement = await acceptRewardChallenge(1, id, db);
    expect(replacement.id).not.toBe(c.id); expect(replacement.targetProblemId).toBe(3);
    expect(await db.pointReward.count()).toBe(1);
  });

  it("does not allow cancellation or another attempt after timeout", async () => {
    const id = await earned(); const c = await acceptRewardChallenge(1, id, db);
    await db.rewardChallenge.update({ where: { id: c.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await acceptRewardChallenge(1, id, db)).status).toBe("expired");
    expect(await db.rewardChallenge.count()).toBe(1);
    expect((await getRewards(1, {}, db)).rewardPoints).toBe(7);
  });

  it("blocks rewards during real exams even without a supplied exam ID", async () => {
    const id = await earned();
    const exam = await db.exam.create({ data: { title: "active", status: "published", durationMin: 30 } });
    await db.examRecord.create({ data: { examId: exam.id, userId: 1, status: "in_progress" } });
    await expect(drawReward(1, id, db)).rejects.toThrow("考试期间");
    await expect(acceptRewardChallenge(1, id, db)).rejects.toThrow("考试期间");
    expect((await submit(2)).rewardId).toBeNull();
    expect((await getRewards(1, {}, db)).blockedByExam).toBe(true);
  });

  it("rolls back both the draw and ledger when persistence fails", async () => {
    const { rewardId } = await submit(1);
    await db.$executeRawUnsafe('CREATE TRIGGER fail_points BEFORE INSERT ON "PointReward" BEGIN SELECT RAISE(ABORT, \'test rollback\'); END;');
    await expect(drawReward(1, rewardId!, db)).rejects.toThrow();
    expect((await db.rewardDraw.findUniqueOrThrow({ where: { id: rewardId! } })).amount).toBeNull();
    expect(await db.pointReward.count()).toBe(0);
    await db.$executeRawUnsafe("DROP TRIGGER fail_points");
    expect((await drawReward(1, rewardId!, db)).amount).toBe(7);
  });

  it("supports objective questions, pagination and account deletion", async () => {
    await db.problem.updateMany({ data: { problemType: "objective", objectiveItems } });
    const id = await earned();
    expect((await acceptRewardChallenge(1, id, db)).targetProblemId).toBe(2);
    expect((await submit(2)).doubledPoints).toBe(7);
    await db.rewardDraw.createMany({ data: Array.from({ length: 22 }, (_, i) => ({ userId: 1, sourceProblemId: 100 + i, sourceSubmissionId: 100 + i,
      problemTitle: "history", problemType: "programming", category: "loops", minPoints: 1, maxPoints: 10 })) });
    expect((await getRewards(1, { page: 1 }, db)).rewards).toHaveLength(20);
    expect((await getRewards(1, { page: 2 }, db)).rewards).toHaveLength(4);
    await expect(getRewards(2, { rewardId: id }, db)).rejects.toMatchObject({ status: 404 });
    await db.user.delete({ where: { id: 1 } });
    expect(await db.rewardDraw.count()).toBe(0); expect(await db.pointReward.count()).toBe(0); expect(await db.rewardChallenge.count()).toBe(0);
  });

  it("validates positive integer ranges and inclusive single-value awards", () => {
    expect(validateRewardRange("1", "10")).toBeNull();
    expect(validateRewardRange("7", "7")).toBeNull();
    for (const [min, max] of [["0", "10"], ["2", "1"], ["1.5", "10"], ["1", "Infinity"], ["1", "2147483648"]]) expect(validateRewardRange(min, max)).not.toBeNull();
  });
});

describe("24 hour acceptance offers", () => {
  const start = new Date("2030-01-02T03:04:05.123Z");
  function clock(at: Date) { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at); }
  async function archive(ids: number[], at: Date) {
    await db.$transaction(async (tx) => {
      await tx.problem.updateMany({ where: { id: { in: ids }, archivedAt: null }, data: { archivedAt: at } });
      await cancelRewardChallengesForArchivedProblems(tx, ids, at);
    });
  }
  it("starts the offer only when drawn and preserves its deadline across retries and reconnection", async () => {
    clock(start);
    const { rewardId } = await submit(1);
    await db.rewardDraw.update({ where: { id: rewardId! }, data: { createdAt: new Date("2000-01-01") } });
    expect((await getRewards(1, {}, db)).rewards[0]).toMatchObject({ offerExpiresAt: null, offerStatus: "pending_draw" });
    const first = await drawReward(1, rewardId!, db);
    expect(first.offerExpiresAt!.getTime()).toBe(start.getTime() + REWARD_OFFER_DURATION_MS);
    vi.setSystemTime(new Date(start.getTime() + 3600000));
    await db.$disconnect();
    const retry = await drawReward(1, rewardId!, db);
    expect(retry.offerExpiresAt).toEqual(first.offerExpiresAt);
    expect(retry.drawnAt).toEqual(start);
    expect((await getRewards(1, {}, db)).rewards[0].offerStatus).toBe("available");
    expect(await db.pointReward.count()).toBe(1);
  });
  it("rejects at the exact offer deadline without removing history or points", async () => {
    clock(start); const id = await earned();
    vi.setSystemTime(new Date(start.getTime() + REWARD_OFFER_DURATION_MS));
    await expect(acceptRewardChallenge(1, id, db)).rejects.toThrow("翻倍机会已过期");
    await db.$disconnect();
    expect((await getRewards(1, {}, db)).rewards[0]).toMatchObject({ offerStatus: "expired", amount: 7 });
    expect(await db.rewardChallenge.count()).toBe(0);
    expect((await getStudentRankingSummaryForUser(1, db))?.points).toBe(17);
  });
  it("accepts just before expiry, grants a separate 24 hours and settles late judging once", async () => {
    clock(start); const id = await earned();
    vi.setSystemTime(new Date(start.getTime() + REWARD_OFFER_DURATION_MS - 1));
    const accepted = await acceptRewardChallenge(1, id, db);
    expect(accepted.expiresAt.getTime() - accepted.acceptedAt.getTime()).toBe(REWARD_OFFER_DURATION_MS);
    vi.setSystemTime(new Date(start.getTime() + REWARD_OFFER_DURATION_MS + 1000));
    expect((await acceptRewardChallenge(1, id, db)).id).toBe(accepted.id);
    expect((await getRewards(1, {}, db)).rewards[0].offerStatus).toBe("accepted");
    vi.setSystemTime(new Date(accepted.expiresAt.getTime() + 1000));
    expect((await acceptRewardChallenge(1, id, db)).status).toBe("expired");
    expect((await submit(2, { receivedAt: accepted.expiresAt })).doubledPoints).toBe(7);
    expect((await submit(2, { receivedAt: accepted.expiresAt })).doubledPoints).toBe(0);
    expect((await db.rewardChallenge.findUniqueOrThrow({ where: { id: accepted.id } })).expiresAt).toEqual(accepted.expiresAt);
  });
  it("does not extend offers while another challenge, missing candidates or exams block acceptance", async () => {
    clock(start); const first = await earned();
    await acceptRewardChallenge(1, first, db);
    await problem(3, { category: "no candidate" });
    const other = await earned(3);
    const deadline = (await db.rewardDraw.findUniqueOrThrow({ where: { id: other } })).offerExpiresAt;
    await expect(acceptRewardChallenge(1, other, db)).rejects.toThrow("已有一道");
    await db.rewardChallenge.updateMany({ data: { status: "expired" } });
    await expect(acceptRewardChallenge(1, other, db)).rejects.toThrow("暂时没有");
    const exam = await db.exam.create({ data: { title: "blocking", status: "published", durationMin: 60 } });
    const record = await db.examRecord.create({ data: { userId: 1, examId: exam.id, startedAt: start, status: "in_progress" } });
    await expect(acceptRewardChallenge(1, other, db)).rejects.toThrow("考试期间");
    expect((await db.rewardDraw.findUniqueOrThrow({ where: { id: other } })).offerExpiresAt).toEqual(deadline);
    await db.examRecord.update({ where: { id: record.id }, data: { status: "submitted" } });
    vi.setSystemTime(deadline!);
    await expect(acceptRewardChallenge(1, other, db)).rejects.toThrow("翻倍机会已过期");
  });
  it("restores from actual archive time once, not from the later visit time", async () => {
    clock(start); const id = await earned(); const challenge = await acceptRewardChallenge(1, id, db);
    const archivedAt = new Date(start.getTime() + 10 * 3600000);
    vi.setSystemTime(archivedAt); await archive([2], archivedAt);
    const deadline = new Date(archivedAt.getTime() + REWARD_OFFER_DURATION_MS);
    expect((await db.rewardDraw.findUniqueOrThrow({ where: { id } })).offerExpiresAt).toEqual(deadline);
    vi.setSystemTime(new Date(start.getTime() + 25 * 3600000));
    await db.$transaction((tx) => cancelRewardChallengesForArchivedProblems(tx, [2], new Date()));
    expect((await getRewards(1, {}, db)).rewards[0]).toMatchObject({ offerStatus: "available", offerExpiresAt: deadline.toISOString(), challenge: { status: "cancelled" } });
    expect((await db.rewardChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).expiresAt).toEqual(challenge.expiresAt);
    await problem(3);
    const replacement = await acceptRewardChallenge(1, id, db);
    expect(replacement.targetProblemId).toBe(3);
    expect(await db.pointReward.count()).toBe(1);
  });
  it("never restores already expired or completed challenges, and rolls back archive plus offer on failure", async () => {
    clock(start); const id = await earned(); const challenge = await acceptRewardChallenge(1, id, db);
    const deadline = (await db.rewardDraw.findUniqueOrThrow({ where: { id } })).offerExpiresAt;
    await db.rewardChallenge.update({ where: { id: challenge.id }, data: { status: "completed" } });
    await archive([2], new Date(start.getTime() + 1000));
    expect((await db.rewardDraw.findUniqueOrThrow({ where: { id } })).offerExpiresAt).toEqual(deadline);
    await db.rewardChallenge.update({ where: { id: challenge.id }, data: { status: "active" } });
    await db.problem.update({ where: { id: 2 }, data: { archivedAt: null } });
    await expect(db.$transaction(async (tx) => {
      const at = new Date(start.getTime() + 1000);
      await tx.problem.update({ where: { id: 2 }, data: { archivedAt: at } });
      await cancelRewardChallengesForArchivedProblems(tx, [2], at);
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    expect((await db.problem.findUniqueOrThrow({ where: { id: 2 } })).archivedAt).toBeNull();
    expect((await db.rewardDraw.findUniqueOrThrow({ where: { id } })).offerExpiresAt).toEqual(deadline);
    const late = new Date(challenge.expiresAt.getTime() + 1);
    vi.setSystemTime(late); await archive([2], late);
    expect((await db.rewardChallenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("expired");
    expect((await db.rewardDraw.findUniqueOrThrow({ where: { id } })).offerExpiresAt).toEqual(deadline);
  });
});
