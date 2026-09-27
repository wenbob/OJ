import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fixture = await vi.hoisted(async () => {
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { DatabaseSync } = await import("node:sqlite");
  const dir = mkdtempSync(path.join(tmpdir(), "oj-reward-api-"));
  const file = path.join(dir, "test.db");
  const db = new DatabaseSync(file); db.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8")); db.close();
  return { dir, url: `file:${file.replaceAll("\\", "/")}` };
});
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url: fixture.url } } }) };
});
import { prisma } from "@/lib/prisma";
import { createSessionToken, type Role } from "@/lib/auth";
import { GET } from "./route";
import { POST as draw } from "./[id]/draw/route";
import { POST as challenge } from "./[id]/challenge/route";
import { POST as submit } from "../problems/[id]/submit/route";
import { DELETE as archive } from "../admin/problems/[id]/route";
import { POST as bulkArchive } from "../admin/problems/bulk-delete/route";

const role = (id: number): Role => id === 3 ? "teacher" : id === 4 ? "admin" : "student";
function request(id: number | null, pathname: string, method = "GET", foreign = false, body?: unknown) {
  return new NextRequest(`http://oj.local${pathname}`, { method,
    headers: { ...(id ? { cookie: `oj_session=${createSessionToken({ id, username: `u${id}`, role: role(id), sessionVersion: 0 })}` } : {}),
      origin: foreign ? "https://foreign.local" : "http://oj.local", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
beforeAll(async () => {
  await prisma.user.createMany({ data: [1, 2, 3, 4].map((id) => ({ id, username: `u${id}`, role: role(id), passwordHash: "test" })) });
  for (const id of [1, 2]) await prisma.problem.create({ data: { id, title: `p${id}`, category: "reward", difficulty: "easy", description: "test", inputDescription: "", outputDescription: "", sampleInput: "", sampleOutput: "", problemType: "objective",
    objectiveItems: JSON.stringify([{ kind: "choice", stem: "test", score: 10, answer: "A", options: [{ label: "A", text: "yes" }, { label: "B", text: "no" }] }]) } });
});
afterAll(async () => { await prisma.$disconnect(); const { rmSync } = await import("node:fs"); rmSync(fixture.dir, { recursive: true, force: true }); });

describe("reward routes with real auth and database", () => {
  it("creates opportunity through the real submit route and guards all reward operations", async () => {
    const response = await submit(request(1, "/api/problems/1/submit", "POST", false, { code: "A" }), params(1));
    expect(response.status).toBe(200);
    const body = await response.json();
    const id = body.rewards.rewardId;
    expect(id).toBeGreaterThan(0);
    const list = await GET(request(1, "/api/rewards"));
    expect(list.headers.get("cache-control")).toBe("private, no-store");
    expect((await list.json()).pendingDrawCount).toBe(1);
    for (const [userId, expected] of [[null, 401], [3, 403], [4, 403]] as const) {
      expect((await GET(request(userId, "/api/rewards"))).status).toBe(expected);
      expect((await draw(request(userId, "/api/rewards/1/draw", "POST"), params(id))).status).toBe(expected);
      expect((await challenge(request(userId, "/api/rewards/1/challenge", "POST"), params(id))).status).toBe(expected);
    }
    expect((await GET(request(2, `/api/rewards?rewardId=${id}`))).status).toBe(404);
    expect((await draw(request(2, "/api/rewards/1/draw", "POST"), params(id))).status).toBe(404);
    expect((await challenge(request(2, "/api/rewards/1/challenge", "POST"), params(id))).status).toBe(404);
    expect((await draw(request(1, "/api/rewards/1/draw", "POST", true), params(id))).status).toBe(403);
    expect((await challenge(request(1, "/api/rewards/1/challenge", "POST", true), params(id))).status).toBe(403);
    const first = await (await draw(request(1, "/api/rewards/1/draw", "POST", false, { amount: 99999 }), params(id))).json();
    const second = await (await draw(request(1, "/api/rewards/1/draw", "POST"), params(id))).json();
    expect(first.rewards[0].amount).toBeGreaterThanOrEqual(1); expect(first.rewards[0].amount).toBeLessThanOrEqual(10);
    expect(second.rewards[0].amount).toBe(first.rewards[0].amount);
    const accepted = await challenge(request(1, "/api/rewards/1/challenge", "POST"), params(id));
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).currentChallenge.targetProblemId).toBe(2);
    expect((await GET(request(1, "/api/rewards?page=-1"))).status).toBe(400);
  });
});

it("archives single and bulk targets with offer recovery in the same transaction", async () => {
  for (const userId of [5, 6]) await prisma.user.create({ data: { id: userId, username: `u${userId}`, role: "student", passwordHash: "test" } });
  for (const id of [10, 11, 12]) await prisma.problem.create({ data: { id, title: `p${id}`, category: "archive", difficulty: "easy", description: "test", inputDescription: "", outputDescription: "", sampleInput: "", sampleOutput: "" } });
  const startedAt = new Date(Date.now() - 1000);
  const oldDeadline = new Date(Date.now() - 500);
  for (const [userId, targetProblemId] of [[5, 10], [6, 11]]) {
    const reward = await prisma.rewardDraw.create({ data: { userId, sourceProblemId: 1, sourceSubmissionId: 1000 + userId, problemTitle: "source", problemType: "programming", category: "archive", minPoints: 1, maxPoints: 10, amount: 7, drawnAt: startedAt, offerExpiresAt: oldDeadline } });
    await prisma.pointReward.create({ data: { userId, rewardId: reward.id, kind: "draw", amount: 7 } });
    await prisma.rewardChallenge.create({ data: { userId, rewardId: reward.id, targetProblemId, targetTitle: "target", acceptedAt: startedAt, expiresAt: new Date(Date.now() + 3600000) } });
  }
  await prisma.$executeRawUnsafe('CREATE TRIGGER fail_offer BEFORE UPDATE OF offerExpiresAt ON RewardDraw BEGIN SELECT RAISE(ABORT, \'offer rollback test\'); END;');
  expect((await archive(request(4, "/api/admin/problems/10", "DELETE"), params(10))).status).toBe(500);
  expect((await prisma.problem.findUniqueOrThrow({ where: { id: 10 } })).archivedAt).toBeNull();
  expect((await prisma.rewardChallenge.findFirstOrThrow({ where: { userId: 5 } })).status).toBe("active");
  await prisma.$executeRawUnsafe("DROP TRIGGER fail_offer");
  expect((await archive(request(4, "/api/admin/problems/10", "DELETE"), params(10))).status).toBe(200);
  const archived = await prisma.problem.findUniqueOrThrow({ where: { id: 10 } });
  const reward = await prisma.rewardDraw.findFirstOrThrow({ where: { userId: 5 } });
  expect(reward.offerExpiresAt!.getTime()).toBe(archived.archivedAt!.getTime() + 86400000);
  expect((await prisma.rewardChallenge.findFirstOrThrow({ where: { userId: 5 } })).status).toBe("cancelled");
  expect((await archive(request(4, "/api/admin/problems/10", "DELETE"), params(10))).status).toBe(404);
  expect((await prisma.rewardDraw.findFirstOrThrow({ where: { userId: 5 } })).offerExpiresAt).toEqual(reward.offerExpiresAt);
  const batch = await bulkArchive(request(4, "/api/admin/problems/bulk-delete", "POST", false, { problemIds: [10, 11, 12] }));
  expect(batch.status).toBe(200);
  expect((await batch.json()).archivedCount).toBe(2);
  const second = await prisma.rewardDraw.findFirstOrThrow({ where: { userId: 6 } });
  const secondTarget = await prisma.problem.findUniqueOrThrow({ where: { id: 11 } });
  expect(second.offerExpiresAt!.getTime()).toBe(secondTarget.archivedAt!.getTime() + 86400000);
  expect((await prisma.rewardChallenge.findFirstOrThrow({ where: { userId: 6 } })).status).toBe("cancelled");
  expect((await prisma.pointReward.aggregate({ where: { userId: { in: [5, 6] } }, _sum: { amount: true } }))._sum.amount).toBe(14);
});
