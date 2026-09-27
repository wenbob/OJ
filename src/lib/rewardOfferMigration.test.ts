import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, it } from "vitest";

it("backfills numeric/text timestamps, legacy cancellations and preserves deadlines, ledger and backups", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "oj-offer-migration-"));
  const file = path.join(dir, "old.db");
  const db = new DatabaseSync(file); const fresh = new DatabaseSync(":memory:");
  let restored: DatabaseSync | undefined; let client: PrismaClient | undefined;
  const start = Date.parse("2026-09-01T12:34:56.789Z"); const day = 86400000;
  try {
    const migrations = path.resolve("prisma/migrations");
    for (const name of readdirSync(migrations).filter((name) => /^\d/.test(name) && name < "0022").sort())
      db.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
    const user = db.prepare("INSERT INTO User(id,username,passwordHash,role) VALUES(?,?,'test','student')");
    const problem = db.prepare("INSERT INTO Problem(id,title,description,inputDescription,outputDescription,sampleInput,sampleOutput,difficulty,category,archivedAt) VALUES(?,'p','','','','','','easy','c',?)");
    const reward = db.prepare("INSERT INTO RewardDraw(id,userId,sourceProblemId,sourceSubmissionId,problemTitle,problemType,category,minPoints,maxPoints,amount,drawnAt) VALUES(?,?,?,?,'p','programming','c',1,10,?,?)");
    for (let id = 1; id <= 9; id++) {
      user.run(id, `u${id}`);
      const archivedAt = [4, 5, 7, 9].includes(id) ? start + 3 * 3600000 : id === 6 ? start + day + 1 : null;
      problem.run(id, archivedAt === null ? null : id % 2 ? new Date(archivedAt).toISOString() : archivedAt);
      reward.run(id, id, id, id, id === 1 ? null : 7, id === 1 ? null : id % 2 ? new Date(start).toISOString() : start);
      if (id !== 1) db.prepare("INSERT INTO PointReward(userId,rewardId,kind,amount) VALUES(?,?,'draw',7)").run(id, id);
    }
    const challenge = db.prepare("INSERT INTO RewardChallenge(id,userId,rewardId,targetProblemId,targetTitle,status,acceptedAt,expiresAt) VALUES(?,?,?,?,'target',?,?,?)");
    for (const [id, status] of [[4, "cancelled"], [5, "active"], [6, "active"], [7, "completed"], [8, "active"], [9, "cancelled"]] as const)
      challenge.run(id, id, id, id, status, start, new Date(start + day).toISOString());
    challenge.run(10, 9, 9, 8, "expired", start, start + day);
    const users = db.prepare("SELECT * FROM User").all();
    const ledger = db.prepare("SELECT * FROM PointReward").all();
    const deadlines = db.prepare("SELECT id, acceptedAt, expiresAt FROM RewardChallenge ORDER BY id").all();
    db.exec(readFileSync(path.join(migrations, "0022_reward_offer_expiry/migration.sql"), "utf8"));
    expect(db.prepare("SELECT * FROM User").all()).toEqual(users);
    expect(db.prepare("SELECT * FROM PointReward").all()).toEqual(ledger);
    expect(db.prepare("SELECT id, acceptedAt, expiresAt FROM RewardChallenge ORDER BY id").all()).toEqual(deadlines);
    expect(db.prepare("SELECT id,offerExpiresAt FROM RewardDraw ORDER BY id").all()).toEqual(
      Array.from({ length: 9 }, (_, i) => ({ id: i + 1, offerExpiresAt: i === 0 ? null : start + day + ([4, 5].includes(i + 1) ? 3 * 3600000 : 0) })));
    expect(db.prepare("SELECT status FROM RewardChallenge WHERE id=5").get()).toMatchObject({ status: "cancelled" });
    expect(db.prepare("SELECT status FROM RewardChallenge WHERE id=6").get()).toMatchObject({ status: "expired" });
    expect(db.prepare("SELECT status FROM RewardChallenge WHERE id=8").get()).toMatchObject({ status: "active" });
    fresh.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8"));
    for (const pragma of ["table_info", "foreign_key_list", "index_list"])
      expect(db.prepare(`PRAGMA ${pragma}("RewardDraw")`).all()).toEqual(fresh.prepare(`PRAGMA ${pragma}("RewardDraw")`).all());
    const backup = path.join(dir, "backup.db");
    db.prepare("VACUUM INTO ?").run(backup); restored = new DatabaseSync(backup);
    expect(restored.prepare("SELECT * FROM RewardDraw").all()).toEqual(db.prepare("SELECT * FROM RewardDraw").all());
    expect(restored.prepare("PRAGMA quick_check").get()).toMatchObject({ quick_check: "ok" });
    expect(restored.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    client = new PrismaClient({ datasources: { db: { url: `file:${file.replaceAll("\\", "/")}` } } });
    expect((await client.rewardDraw.findUniqueOrThrow({ where: { id: 3 } })).offerExpiresAt?.getTime()).toBe(start + day);
    expect((await client.rewardDraw.findUniqueOrThrow({ where: { id: 5 } })).offerExpiresAt?.getTime()).toBe(start + day + 3 * 3600000);
  } finally { await client?.$disconnect(); restored?.close(); db.close(); fresh.close(); rmSync(dir, { recursive: true, force: true }); }
});
