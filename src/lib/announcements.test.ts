import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { announcementDetail, listAnnouncements, pendingAnnouncement, publishAnnouncement, readAnnouncement, withdrawAnnouncement } from "./announcements";

let db: PrismaClient;
let directory: string;
const publish = (requestId = "request-announcement-1", title = "平台通知") =>
  publishAnnouncement(3, { title, body: "第一行\n<script>alert(1)</script>", requestId }, db);
beforeEach(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), "oj-announcement-"));
  const file = path.join(directory, "test.db");
  const sql = new DatabaseSync(file);
  sql.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8")); sql.close();
  db = new PrismaClient({ datasources: { db: { url: `file:${file.replaceAll("\\", "/")}` } } });
  await db.user.createMany({ data: [
    { id: 1, username: "student", role: "student", passwordHash: "test" },
    { id: 2, username: "teacher", role: "teacher", passwordHash: "test" },
    { id: 3, username: "admin", role: "admin", passwordHash: "test" },
    { id: 4, username: "admin2", role: "admin", passwordHash: "test" },
  ] });
});
afterEach(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

describe("announcements database invariants", () => {
  it("publishes exactly once under concurrent retries and rejects conflicting replay", async () => {
    const results = await Promise.all([publish(), publish(), publish()]);
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    expect(await db.announcement.count()).toBe(1);
    await expect(publish("request-announcement-1", "changed")).rejects.toMatchObject({ status: 409 });
    await expect(publishAnnouncement(4, { title: "平台通知", body: "第一行\n<script>alert(1)</script>", requestId: "request-announcement-1" }, db)).rejects.toMatchObject({ status: 409 });
  });
  it("confirms per account, preserves text and restores across Prisma reconnect", async () => {
    const row = await publish();
    expect((await pendingAnnouncement(1, true, db)).announcement?.id).toBe(row.id);
    await Promise.all([readAnnouncement(1, row.id, db), readAnnouncement(1, row.id, db)]);
    expect(await db.announcementRead.count()).toBe(1);
    const firstRead = await db.announcementRead.findFirst();
    await db.$disconnect();
    await readAnnouncement(1, row.id, db);
    expect(await db.announcementRead.findFirst()).toEqual(firstRead);
    expect((await pendingAnnouncement(1, true, db)).announcement).toBeNull();
    expect((await pendingAnnouncement(2, false, db)).announcement?.id).toBe(row.id);
    expect((await announcementDetail(1, row.id, db)).body).toContain("<script>");
    expect((await listAnnouncements(1, false, 1, db)).items[0].read).toBe(true);
    expect((await listAnnouncements(2, false, 1, db)).items[0].read).toBe(false);
  });
  it("orders pending oldest first, paginates history newest first and includes new accounts", async () => {
    for (let i = 0; i < 23; i++) await publish(`announcement-key-${i}`, `notice ${i}`);
    const list = await listAnnouncements(1, false, 1, db);
    expect(list.items).toHaveLength(20); expect(list.totalPages).toBe(2);
    expect(list.items[0].title).toBe("notice 22");
    expect((await listAnnouncements(1, false, 2, db)).items).toHaveLength(3);
    const pending = await pendingAnnouncement(1, true, db);
    expect(pending.unreadCount).toBe(23); expect(pending.announcement?.title).toBe("notice 0");
    await readAnnouncement(1, pending.announcement!.id, db);
    expect((await pendingAnnouncement(1, true, db)).announcement?.title).toBe("notice 1");
    await db.user.create({ data: { id: 5, username: "new", role: "student", passwordHash: "test" } });
    expect((await pendingAnnouncement(5, true, db)).unreadCount).toBe(23);
  });
  it("withdraws idempotently, hides history and resolves a stale confirm without a read", async () => {
    const row = await publish();
    await withdrawAnnouncement(3, row.id, db); await withdrawAnnouncement(3, row.id, db);
    expect((await pendingAnnouncement(1, true, db)).announcement).toBeNull();
    expect((await listAnnouncements(1, false, 1, db)).total).toBe(0);
    expect((await listAnnouncements(3, true, 1, db)).total).toBe(1);
    await expect(announcementDetail(1, row.id, db)).rejects.toMatchObject({ status: 404 });
    expect(await readAnnouncement(1, row.id, db)).toEqual({ withdrawn: true });
    expect(await db.announcementRead.count()).toBe(0);
  });
  it("suppresses current exams server-side and resumes after submission or expiry", async () => {
    await publish();
    const exam = await db.exam.create({ data: { title: "exam", status: "published", durationMin: 60 } });
    const record = await db.examRecord.create({ data: { userId: 1, examId: exam.id, status: "in_progress", startedAt: new Date() } });
    expect((await pendingAnnouncement(1, true, db)).blockedByExam).toBe(true);
    await db.examRecord.update({ where: { id: record.id }, data: { status: "submitted" } });
    expect((await pendingAnnouncement(1, true, db)).announcement).not.toBeNull();
    await db.examRecord.update({ where: { id: record.id }, data: { status: "in_progress", startedAt: new Date(Date.now() - 3_600_001) } });
    expect((await pendingAnnouncement(1, true, db)).blockedByExam).toBe(false);
  });
  it("validates content and keeps publisher snapshots after account deletion", async () => {
    for (const title of ["", " ".repeat(10), "a".repeat(101)]) {
      await expect(publish("announcement-invalid", title)).rejects.toMatchObject({ status: 400 });
    }
    await expect(publishAnnouncement(3, { title: "ok", body: "a".repeat(5001), requestId: "announcement-invalid" }, db)).rejects.toMatchObject({ status: 400 });
    await expect(publishAnnouncement(2, { title: "ok", body: "ok", requestId: "announcement-teacher" }, db)).rejects.toMatchObject({ status: 403 });
    const row = await publish();
    await readAnnouncement(1, row.id, db);
    await db.user.delete({ where: { id: 1 } });
    expect(await db.announcementRead.count()).toBe(0);
    await db.user.delete({ where: { id: 3 } });
    expect(await db.announcement.findUnique({ where: { id: row.id } })).toMatchObject({ publisherId: null, publisherName: "admin" });
  });
});
