import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it("upgrades from 0020 without altering users/rewards, matches fresh init, and restores reads from backup", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "oj-announcement-migration-"));
  const old = new DatabaseSync(path.join(dir, "old.db")); const fresh = new DatabaseSync(":memory:");
  let restored: DatabaseSync | undefined;
  try {
    const migrations = path.resolve("prisma/migrations");
    for (const name of readdirSync(migrations).filter((name) => /^\d/.test(name) && name < "0021").sort())
      old.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
    old.exec("INSERT INTO User(id,username,passwordHash,role) VALUES(1,'kept','test','student')");
    const previous = old.prepare("SELECT * FROM User").all();
    old.exec(readFileSync(path.join(migrations, "0021_announcements/migration.sql"), "utf8"));
    fresh.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8"));
    for (const table of ["Announcement", "AnnouncementRead"]) {
      for (const pragma of ["table_info", "foreign_key_list", "index_list"])
        expect(old.prepare(`PRAGMA ${pragma}("${table}")`).all()).toEqual(fresh.prepare(`PRAGMA ${pragma}("${table}")`).all());
    }
    expect(old.prepare("SELECT * FROM User").all()).toEqual(previous);
    old.exec("INSERT INTO Announcement(id,title,body,publisherName,requestId) VALUES(1,'notice','body','admin','request-id'); INSERT INTO AnnouncementRead(announcementId,userId) VALUES(1,1)");
    const backup = path.join(dir, "backup.db").replaceAll("'", "''");
    old.exec(`VACUUM INTO '${backup}'`); restored = new DatabaseSync(backup);
    for (const table of ["Announcement", "AnnouncementRead"])
      expect(restored.prepare(`SELECT * FROM ${table}`).all()).toEqual(old.prepare(`SELECT * FROM ${table}`).all());
    expect(restored.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
    expect(restored.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    fresh.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8"));
    expect(fresh.prepare("SELECT COUNT(*) AS total FROM Announcement").get()).toMatchObject({ total: 0 });
  } finally { restored?.close(); old.close(); fresh.close(); rmSync(dir, { recursive: true, force: true }); }
});
