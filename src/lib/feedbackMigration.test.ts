import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrations = path.resolve("prisma/migrations");
const feedbackMigration = readFileSync(path.join(migrations, "0019_problem_feedback/migration.sql"), "utf8");
const tables = ["Feedback", "FeedbackAttachment", "FeedbackReply"];

function shape(db: DatabaseSync) {
  return tables.map((table) => ({
    columns: db.prepare(`PRAGMA table_info("${table}")`).all(),
    keys: db.prepare(`PRAGMA foreign_key_list("${table}")`).all(),
    indexes: db.prepare(`PRAGMA index_list("${table}")`).all(),
  }));
}

describe("feedback schema migration", () => {
  it("matches fresh init, preserves existing records and restores attachments with the database", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "oj-feedback-migration-"));
    const upgraded = new DatabaseSync(path.join(dir, "upgrade.db"));
    const fresh = new DatabaseSync(":memory:");
    let restored: DatabaseSync | undefined;
    try {
      for (const migration of readdirSync(migrations).filter((name) => /^\d/.test(name) && name < "0019").sort()) {
        upgraded.exec(readFileSync(path.join(migrations, migration, "migration.sql"), "utf8"));
      }
      upgraded.exec(`INSERT INTO "User" (id, username, passwordHash, role) VALUES (1, 'kept-user', 'not-a-password', 'student');`);
      const before = upgraded.prepare('SELECT * FROM "User"').all();
      upgraded.exec(feedbackMigration);
      fresh.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8"));
      expect(shape(upgraded)).toEqual(shape(fresh));
      expect(upgraded.prepare('SELECT * FROM "User"').all()).toEqual(before);
      upgraded.exec(`
        INSERT INTO "Feedback" (id, authorId, authorUsername, authorRole, title, content) VALUES (1, 1, 'kept-user', 'student', 'title', 'body');
        INSERT INTO "FeedbackAttachment" (feedbackId, position, mimeType, width, height, byteSize, data) VALUES (1, 0, 'image/webp', 1, 1, 4, X'01020304');
        INSERT INTO "FeedbackReply" (feedbackId, administratorId, administratorUsername, content) VALUES (1, 1, 'snapshot-admin', 'reply');
        DELETE FROM "User" WHERE id = 1;
      `);
      expect(upgraded.prepare('SELECT authorId, authorUsername FROM "Feedback"').get()).toMatchObject({ authorId: null, authorUsername: "kept-user" });
      expect(upgraded.prepare('SELECT administratorId, administratorUsername FROM "FeedbackReply"').get()).toMatchObject({ administratorId: null, administratorUsername: "snapshot-admin" });
      expect(upgraded.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      const backup = path.join(dir, "backup.db");
      upgraded.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
      restored = new DatabaseSync(backup);
      expect(restored.prepare('SELECT * FROM "FeedbackAttachment"').all()).toEqual(upgraded.prepare('SELECT * FROM "FeedbackAttachment"').all());
      expect(restored.prepare('SELECT * FROM "FeedbackReply"').all()).toEqual(upgraded.prepare('SELECT * FROM "FeedbackReply"').all());
      expect(restored.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
      // Re-initializing the isolated database drops all feedback children safely.
      fresh.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8"));
      expect(shape(upgraded)).toEqual(shape(fresh));
    } finally {
      restored?.close(); upgraded.close(); fresh.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
