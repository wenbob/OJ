import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it("upgrades without altering old data, matches init and restores reward records from backup", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "oj-reward-migration-"));
  const old = new DatabaseSync(path.join(dir, "old.db"));
  const fresh = new DatabaseSync(":memory:");
  let restored: DatabaseSync | undefined;
  try {
    const migrations = path.resolve("prisma/migrations");
    for (const name of readdirSync(migrations).filter((name) => /^\d/.test(name) && name < "0020").sort()) old.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
    old.exec(`INSERT INTO User(id,username,passwordHash,role) VALUES(1,'kept','test','student');`);
    const previous = old.prepare("SELECT * FROM User").all();
    old.exec(readFileSync(path.join(migrations, "0020_problem_rewards/migration.sql"), "utf8"));
    for (const name of readdirSync(migrations).filter((name) => /^\d/.test(name) && name > "0020_problem_rewards").sort()) old.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
    fresh.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8"));
    const tables = ["RewardDraw", "RewardChallenge", "PointReward"];
    for (const table of tables) {
      for (const pragma of ["table_info", "foreign_key_list", "index_list"]) expect(old.prepare(`PRAGMA ${pragma}("${table}")`).all()).toEqual(fresh.prepare(`PRAGMA ${pragma}("${table}")`).all());
    }
    expect(old.prepare("SELECT * FROM User").all()).toEqual(previous);
    old.exec(`INSERT INTO RewardDraw(id,userId,sourceProblemId,sourceSubmissionId,problemTitle,problemType,category,minPoints,maxPoints,amount) VALUES(1,1,1,1,'p','programming','c',1,10,7);
      INSERT INTO PointReward(userId,rewardId,kind,amount) VALUES(1,1,'draw',7);
      INSERT INTO RewardChallenge(userId,rewardId,targetProblemId,targetTitle,expiresAt) VALUES(1,1,2,'next','2030-01-01');`);
    const backup = path.join(dir, "backup.db").replaceAll("'", "''");
    old.exec(`VACUUM INTO '${backup}'`);
    restored = new DatabaseSync(backup);
    for (const table of tables) expect(restored.prepare(`SELECT * FROM ${table}`).all()).toEqual(old.prepare(`SELECT * FROM ${table}`).all());
    expect(restored.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
    fresh.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8"));
    expect(fresh.prepare("SELECT COUNT(*) AS total FROM RewardDraw").get()).toMatchObject({ total: 0 });
  } finally { restored?.close(); old.close(); fresh.close(); rmSync(dir, { recursive: true, force: true }); }
});
