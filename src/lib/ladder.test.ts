import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPointAdjustment, getLadderStudentPage, getPointAdjustmentPage } from "./ladder";
import { getLadderSettings, LADDER_SETTINGS_KEY, saveLadderSettings } from "./ladderSettings";
import { DEFAULT_RANK_TIERS, getRankTierProgress, getRankTierTitle, parsePointAdjustmentInput, tiersFromThresholds, validateTierThresholds, type PointAdjustmentInput } from "./ladderShared";
import { getStudentRankingSummaryForUser, getStudentRankings } from "./ranking";
import { rewardTransaction } from "./rewards";
import { defaultSystemSettings, systemSettingsEntries } from "./settings";

let db: PrismaClient;
let directory: string;
let sourceSubmissionId: number;
function input(overrides: Partial<PointAdjustmentInput> = {}): PointAdjustmentInput {
  return { mode: "add", inputPoints: 20, expectedPoints: 10, reason: "课堂挑战奖励", requestId: randomUUID(), ...overrides };
}
beforeEach(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), "oj-ladder-"));
  const file = path.join(directory, "test.db");
  const sql = new DatabaseSync(file); sql.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8")); sql.close();
  db = new PrismaClient({ datasources: { db: { url: `file:${file.replaceAll("\\", "/")}` } } });
  await db.user.createMany({ data: [
    { id: 1, username: "alice", role: "student", passwordHash: "test" },
    { id: 2, username: "bob", role: "student", passwordHash: "test" },
    { id: 3, username: "admin-one", role: "admin", passwordHash: "test" },
    { id: 4, username: "admin-two", role: "admin", passwordHash: "test" },
    { id: 5, username: "teacher", role: "teacher", passwordHash: "test" },
  ] });
  for (const id of [1, 2]) await db.problem.create({ data: { id, title: `p${id}`, description: "test", inputDescription: "", outputDescription: "", sampleInput: "", sampleOutput: "", difficulty: "easy", category: "test" } });
  sourceSubmissionId = (await db.submission.create({ data: { userId: 1, problemId: 1, code: "test", language: "cpp", status: "Accepted" } })).id;
});
afterEach(async () => { vi.restoreAllMocks(); await db?.$disconnect(); if (directory) rmSync(directory, { recursive: true, force: true }); });

describe("admin ladder ledger", () => {
  it("adds, deducts, sets a total and still adds ten for a subsequent new Accepted", async () => {
    const added = await applyPointAdjustment(1, 3, input({ inputPoints: 90 }), db);
    expect(added.ranking?.points).toBe(100);
    const set = await applyPointAdjustment(1, 3, input({ mode: "set", inputPoints: 80, expectedPoints: 100, reason: "积分纠错" }), db);
    expect(set.adjustment).toMatchObject({ mode: "set", inputPoints: 80, amount: -20, beforePoints: 100, afterPoints: 80 });
    await db.submission.create({ data: { userId: 1, problemId: 2, code: "test", language: "cpp", status: "Accepted", submissionType: "exam" } });
    expect(await getStudentRankingSummaryForUser(1, db)).toMatchObject({ points: 90, acCount: 2, basePoints: 20 });
    await applyPointAdjustment(1, 4, input({ mode: "deduct", inputPoints: 90, expectedPoints: 90, reason: "纠错至零" }), db);
    expect(await getStudentRankingSummaryForUser(1, db)).toMatchObject({ points: 0, tierTitle: "青铜学徒", acCount: 2 });
    expect(await db.studentPointAdjustment.count()).toBe(3);
    expect(await db.pointReward.count()).toBe(0);
  });
  it("replays the same request once, including after the student subsequently earns points", async () => {
    const request = input();
    const [first, second] = await Promise.all([applyPointAdjustment(1, 3, request, db), applyPointAdjustment(1, 3, request, db)]);
    expect(first.adjustment?.id).toBe(second.adjustment?.id); expect(second.replayed).toBe(true);
    await db.submission.create({ data: { userId: 1, problemId: 2, code: "test", language: "cpp", status: "Accepted" } });
    const replay = await applyPointAdjustment(1, 3, request, db);
    expect(replay.ranking?.points).toBe(40); expect(replay.adjustment?.afterPoints).toBe(30);
    expect(await db.studentPointAdjustment.count()).toBe(1);
  });
  it.each(["reason", "actor", "student", "amount", "mode", "expected"])("rejects requestId reuse with a different %s", async (field) => {
    const request = input(); await applyPointAdjustment(1, 3, request, db);
    const changed = { ...request, ...(field === "reason" ? { reason: "不同理由" } : field === "amount" ? { inputPoints: 21 } : field === "mode" ? { mode: "deduct" as const } : field === "expected" ? { expectedPoints: 30 } : {}) };
    await expect(applyPointAdjustment(field === "student" ? 2 : 1, field === "actor" ? 4 : 3, changed, db)).rejects.toMatchObject({ status: 409 });
    expect(await db.studentPointAdjustment.count()).toBe(1);
  });
  it("rejects two concurrent deductions against the same original balance", async () => {
    const results = await Promise.allSettled([applyPointAdjustment(1, 3, input({ mode: "deduct", inputPoints: 8 }), db), applyPointAdjustment(1, 4, input({ mode: "deduct", inputPoints: 8 }), db)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409, currentPoints: 2 } });
    expect(await db.studentPointAdjustment.count()).toBe(1);
    expect((await getStudentRankingSummaryForUser(1, db))?.points).toBe(2);
  });
  it("rejects a stale preview after a newly accepted problem", async () => {
    await rewardTransaction(1, (tx) => tx.submission.create({ data: { userId: 1, problemId: 2, code: "test", language: "cpp", status: "Accepted" } }), db);
    await expect(applyPointAdjustment(1, 3, input(), db)).rejects.toMatchObject({ status: 409, currentPoints: 20 });
    expect(await db.studentPointAdjustment.count()).toBe(0);
  });
  it("serializes with a concurrent earned reward and rejects the stale deduction", async () => {
    const draw = await db.rewardDraw.create({ data: { userId: 1, sourceProblemId: 1, sourceSubmissionId, problemTitle: "p1", problemType: "programming", category: "test", minPoints: 7, maxPoints: 7, amount: 7 } });
    const results = await Promise.allSettled([
      rewardTransaction(1, (tx) => tx.pointReward.create({ data: { userId: 1, rewardId: draw.id, kind: "draw", amount: 7 } }), db),
      applyPointAdjustment(1, 3, input({ mode: "deduct", inputPoints: 5 }), db),
    ]);
    expect(results[0].status).toBe("fulfilled"); expect(results[1]).toMatchObject({ status: "rejected", reason: { status: 409, currentPoints: 17 } });
    expect(await db.studentPointAdjustment.count()).toBe(0);
    expect((await getStudentRankingSummaryForUser(1, db))?.points).toBe(17);
  });
  it.each([input({ mode: "deduct", inputPoints: 11 }), input({ reason: "  " }), input({ inputPoints: -1 }), input({ inputPoints: 1.5 }), input({ inputPoints: 0 }), input({ reason: "字".repeat(201) })])("refuses invalid adjustments without writing", async (request) => {
    await expect(applyPointAdjustment(1, 3, request, db)).rejects.toMatchObject({ status: 400 }); expect(await db.studentPointAdjustment.count()).toBe(0);
  });
  it("ignores a set operation that changes no points", async () => {
    const result = await applyPointAdjustment(1, 3, input({ mode: "set", inputPoints: 10 }), db);
    expect(result).toMatchObject({ adjustment: null, changed: false }); expect(await db.studentPointAdjustment.count()).toBe(0);
  });
  it("requires a current admin actor and a current student target", async () => {
    for (const actor of [1, 5, 999]) await expect(applyPointAdjustment(1, actor, input(), db)).rejects.toMatchObject({ status: 403 });
    for (const student of [3, 999]) await expect(applyPointAdjustment(student, 3, input(), db)).rejects.toMatchObject({ status: 404 });
  });
  it("keeps signed source sums separate and preserves sorting without exposing audit details", async () => {
    await applyPointAdjustment(2, 3, input({ expectedPoints: 0, inputPoints: 10, reason: "管理员专用理由" }), db);
    const rankings = await getStudentRankings(db);
    expect(rankings.map((ranking) => ranking.userId)).toEqual([1, 2]);
    expect(JSON.stringify(rankings)).not.toContain("管理员专用理由"); expect(JSON.stringify(rankings)).not.toContain("admin-one");
    const page = await getLadderStudentPage({ page: 1, pageSize: 20 }, db);
    expect(page.students.find((student) => student.userId === 2)).toMatchObject({ adjustmentPoints: 10, basePoints: 0, rewardPoints: 0, points: 10 });
  });
  it("retains username and ID snapshots after renaming and deleting both related accounts", async () => {
    await applyPointAdjustment(1, 3, input(), db);
    await db.user.update({ where: { id: 1 }, data: { username: "renamed" } });
    await db.user.delete({ where: { id: 1 } }); await db.user.delete({ where: { id: 3 } });
    const record = (await getPointAdjustmentPage({ page: 1, pageSize: 20, query: "alice", mode: "add", studentId: 1 }, db)).records[0];
    expect(record).toMatchObject({ studentId: null, studentIdSnapshot: 1, studentUsername: "alice", administratorUsername: "admin-one", amount: 20, reason: "课堂挑战奖励" });
    expect(await db.studentPointAdjustment.count()).toBe(1);
  });
  it("paginates student searches and only aggregates the students on that page", async () => {
    await db.user.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ username: `test-${String(i).padStart(2, "0")}`, role: "student", passwordHash: "test" })) });
    const aggregate = vi.spyOn(db.studentPointAdjustment, "groupBy");
    const page = await getLadderStudentPage({ page: 2, pageSize: 20, query: "test-" }, db);
    expect(page.total).toBe(25); expect(page.students).toHaveLength(5);
    expect(aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { studentId: { in: page.students.map((student) => student.userId) } } }));
  });
});

describe("configured tiers", () => {
  it("updates rank, title and progress with the same thresholds without changing points", async () => {
    const current = await getLadderSettings(db);
    const points = [0, 10, 20, 30, 40, 50, 60, 70];
    const saved = await saveLadderSettings(current.revision, points, db);
    expect(saved.revision).not.toBe(current.revision);
    const ranking = await getStudentRankingSummaryForUser(1, db);
    expect(ranking).toMatchObject({ points: 10, tierTitle: "白银新秀" });
    const page = await getLadderStudentPage({ page: 1, pageSize: 20 }, db);
    expect(page.tiers).toEqual(saved.tiers);
    expect(getRankTierTitle(11, page.tiers)).toBe("白银新秀");
    expect(getRankTierProgress(10, saved.tiers)).toMatchObject({ nextTierTitle: "黄金精英", pointsToNextTier: 10, progressPercent: 0 });
    expect(getRankTierTitle(70, saved.tiers)).toBe("荣耀王者");
    await expect(saveLadderSettings(current.revision, points, db)).rejects.toMatchObject({ status: 409 });
  });
  it("only one of two simultaneous updates of the same revision commits", async () => {
    const current = await getLadderSettings(db);
    const results = await Promise.allSettled([saveLadderSettings(current.revision, [0, 10, 20, 30, 40, 50, 60, 70], db), saveLadderSettings(current.revision, [0, 20, 40, 60, 80, 100, 120, 140], db)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
  });
  it("preserves the independent ladder key when the old system settings form saves", async () => {
    const config = await saveLadderSettings("0", [0, 10, 20, 30, 40, 50, 60, 70], db);
    expect(systemSettingsEntries(defaultSystemSettings).some((row) => row.key === (LADDER_SETTINGS_KEY as never))).toBe(false);
    for (const entry of systemSettingsEntries(defaultSystemSettings)) await db.systemSetting.upsert({ where: { key: entry.key }, create: entry, update: { value: entry.value } });
    expect(await getLadderSettings(db)).toEqual(config);
  });
  it("uses defaults only for a missing setting, and fails on corrupt config or query errors", async () => {
    await db.systemSetting.delete({ where: { key: LADDER_SETTINGS_KEY } });
    expect((await getLadderSettings(db)).tiers).toEqual(DEFAULT_RANK_TIERS);
    await db.systemSetting.create({ data: { key: LADDER_SETTINGS_KEY, value: "{}" } });
    await expect(getLadderSettings(db)).rejects.toThrow("段位配置无效");
    vi.spyOn(db.systemSetting, "findUnique").mockRejectedValueOnce(new Error("unavailable"));
    await expect(getLadderSettings(db)).rejects.toThrow("unavailable");
  });
  it("validates strict threshold ordering and all boundary ranks", () => {
    for (const values of [[1, 10, 20, 30, 40, 50, 60, 70], [0, 10, 10, 30, 40, 50, 60, 70], [0, 1.2, 20, 30, 40, 50, 60, 70], [0, 10]]) expect(validateTierThresholds(values)).not.toBeNull();
    const tiers = tiersFromThresholds([0, 10, 20, 30, 40, 50, 60, 70]);
    for (const [index, tier] of tiers.entries()) {
      expect(getRankTierTitle(tier.minPoints, tiers)).toBe(tier.title);
      if (index) expect(getRankTierTitle(tier.minPoints - 1, tiers)).toBe(tiers[index - 1].title);
    }
    expect(() => parsePointAdjustmentInput({ ...input(), administratorId: 4 })).toThrow("不支持的字段");
  });
});
