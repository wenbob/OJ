import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it("adds only ladder storage, matches fresh init, and preserves deleted-account audit snapshots", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "oj-ladder-migration-"));
  const old = new DatabaseSync(path.join(directory, "old.db")); const fresh = new DatabaseSync(":memory:");
  let backup: DatabaseSync | undefined;
  try {
    const migrations = path.resolve("prisma/migrations");
    for (const name of readdirSync(migrations).filter((name) => /^\d/.test(name) && name < "0023").sort()) old.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
    old.exec("PRAGMA foreign_keys=ON; INSERT INTO User(id,username,passwordHash,role) VALUES(1,'student','test','student'),(2,'admin','test','admin'),(3,'retained-admin','test','admin');");
    const previousUsers = old.prepare("SELECT * FROM User ORDER BY id").all(); const previousSettings = old.prepare("SELECT key,value FROM SystemSetting ORDER BY key").all();
    old.exec(readFileSync(path.join(migrations, "0023_ladder_point_management/migration.sql"), "utf8"));
    expect(old.prepare("SELECT * FROM User ORDER BY id").all()).toEqual(previousUsers);
    expect(old.prepare("SELECT key,value FROM SystemSetting WHERE key != '__ladderTierConfig' ORDER BY key").all()).toEqual(previousSettings);
    fresh.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8"));
    for (const pragma of ["table_info", "foreign_key_list", "index_list"]) expect(old.prepare(`PRAGMA ${pragma}("StudentPointAdjustment")`).all()).toEqual(fresh.prepare(`PRAGMA ${pragma}("StudentPointAdjustment")`).all());
    old.exec("INSERT INTO StudentPointAdjustment(studentId,studentIdSnapshot,studentUsername,administratorId,administratorIdSnapshot,administratorUsername,mode,inputPoints,amount,beforePoints,afterPoints,reason,requestId) VALUES(1,1,'student',2,2,'admin','add',5,5,10,15,'reward','request-one');");
    expect(() => old.exec("UPDATE StudentPointAdjustment SET afterPoints=-1")).toThrow();
    expect(() => old.exec("UPDATE StudentPointAdjustment SET afterPoints=16")).toThrow();
    old.exec("DELETE FROM User WHERE id IN (1,2)");
    expect(old.prepare("SELECT studentId,administratorId,studentUsername,administratorUsername,amount FROM StudentPointAdjustment").get()).toMatchObject({ studentId: null, administratorId: null, studentUsername: "student", administratorUsername: "admin", amount: 5 });
    const file = path.join(directory, "backup.db").replaceAll("'", "''"); old.exec(`VACUUM INTO '${file}'`); backup = new DatabaseSync(file);
    expect(backup.prepare("SELECT * FROM StudentPointAdjustment").all()).toEqual(old.prepare("SELECT * FROM StudentPointAdjustment").all());
    expect(backup.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
  } finally { backup?.close(); old.close(); fresh.close(); rmSync(directory, { recursive: true, force: true }); }
});
