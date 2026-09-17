import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

const fixture = await vi.hoisted(async () => {
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { DatabaseSync } = await import("node:sqlite");
  const dir = mkdtempSync(path.join(tmpdir(), "oj-feedback-api-"));
  const dbPath = path.join(dir, "test.db");
  const db = new DatabaseSync(dbPath);
  db.exec(readFileSync(path.resolve("prisma/init.sql"), "utf8"));
  db.close();
  return { dir, url: `file:${dbPath.replaceAll("\\", "/")}` };
});

vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url: fixture.url } } }) };
});

import { prisma } from "@/lib/prisma";
import { createSessionToken, type CurrentUser } from "@/lib/auth";
import { createFeedback, getFeedback } from "@/lib/feedback";
import { GET, POST } from "./route";
import { GET as getDetail } from "./[id]/route";
import { GET as getImage } from "./[id]/attachments/[attachmentId]/route";
import { GET as getAll } from "../admin/feedback/route";
import { PATCH } from "../admin/feedback/[id]/route";
import { POST as reply } from "../admin/feedback/[id]/replies/route";

const origin = "http://oj.local";
let sequence = 0;
let student: CurrentUser;
let teacher: CurrentUser;
let otherStudent: CurrentUser;
let otherTeacher: CurrentUser;
let admin: CurrentUser;

function request(user: CurrentUser | null, url = "/api/feedback", method = "GET", body?: BodyInit, foreign = false) {
  const headers: Record<string, string> = {};
  if (user) headers.cookie = `oj_session=${createSessionToken({ ...user, sessionVersion: 0 })}`;
  if (method !== "GET") headers.origin = foreign ? "http://evil.local" : origin;
  if (typeof body === "string") headers["content-type"] = "application/json";
  return new NextRequest(`${origin}${url}`, { method, headers, body });
}
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const imageParams = (id: number, attachmentId: number) => ({ params: Promise.resolve({ id: String(id), attachmentId: String(attachmentId) }) });

async function submission(user: CurrentUser, images = 0) {
  const form = new FormData();
  form.set("title", `${user.username} 的反馈`);
  form.set("content", "<script>alert('plain text')</script>\n页面操作未成功");
  if (images) {
    const bytes = new Uint8Array(await sharp({ create: { width: 12, height: 8, channels: 3, background: "orange" } }).png().toBuffer());
    for (let i = 0; i < images; i++) form.append("attachments", new File([bytes], `${i}.png`, { type: "image/png" }));
  }
  return POST(request(user, "/api/feedback", "POST", form));
}

beforeEach(async () => {
  vi.restoreAllMocks();
  sequence++;
  await prisma.feedback.deleteMany();
  async function user(role: CurrentUser["role"], suffix: string): Promise<CurrentUser> {
    const row = await prisma.user.create({ data: { username: `feedback-${sequence}-${suffix}`, role, passwordHash: "test-not-a-password" } });
    return { id: row.id, username: row.username, role };
  }
  [student, teacher, otherStudent, otherTeacher, admin] = await Promise.all([
    user("student", "student"), user("teacher", "teacher"), user("student", "other-student"), user("teacher", "other-teacher"), user("admin", "admin"),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
  const { rmSync } = await import("node:fs");
  rmSync(fixture.dir, { recursive: true, force: true });
});

describe("feedback API with real auth and isolated SQLite", () => {
  it("allows student/teacher submission, enforces cooldown, and never puts image bytes in JSON", async () => {
    const created = await submission(student, 3);
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("private, no-store");
    const { id } = await created.json();
    expect((await submission(student)).status).toBe(429);
    expect((await submission(teacher)).status).toBe(201);
    expect((await submission(admin)).status).toBe(403);
    const detail = await (await getDetail(request(student), params(id))).json();
    expect(detail.attachments).toHaveLength(3);
    expect(detail.content).toContain("<script>");
    expect(detail.attachments[0]).not.toHaveProperty("data");
    const own = await (await GET(request(student, "/api/feedback?authorId=999&role=teacher"))).json();
    expect(own.pagination.total).toBe(1);
    expect(own.items[0]._count.attachments).toBe(3);
    expect(own.items[0]).not.toHaveProperty("content");
    expect(own.items[0]).not.toHaveProperty("attachments");
  });

  it("protects details and screenshot bytes for owners/admins only, including guessed attachment IDs", async () => {
    const { id } = await (await submission(student, 1)).json();
    const detail = await getFeedback(student, id);
    const attachmentId = detail.attachments[0].id;
    for (const user of [student, admin]) {
      expect((await getDetail(request(user), params(id))).status).toBe(200);
      const image = await getImage(request(user), imageParams(id, attachmentId));
      expect(image.status).toBe(200);
      expect(image.headers.get("content-type")).toBe("image/webp");
      expect(image.headers.get("cache-control")).toBe("private, no-store");
      expect(image.headers.get("x-content-type-options")).toBe("nosniff");
      expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0);
    }
    for (const user of [otherStudent, teacher, otherTeacher]) {
      expect((await getDetail(request(user), params(id))).status).toBe(404);
      expect((await getImage(request(user), imageParams(id, attachmentId))).status).toBe(404);
    }
    expect((await getImage(request(admin), imageParams(id + 100, attachmentId))).status).toBe(404);
    expect((await getImage(request(null), imageParams(id, attachmentId))).status).toBe(401);
    expect((await getDetail(request(null), params(id))).status).toBe(401);
    await prisma.user.update({ where: { id: student.id }, data: { sessionVersion: 1 } });
    expect((await getImage(request(student), imageParams(id, attachmentId))).status).toBe(401);
  });

  it("does not let teachers see one another's feedback or use admin management", async () => {
    const { id } = await (await submission(teacher)).json();
    expect((await getDetail(request(teacher), params(id))).status).toBe(200);
    for (const user of [student, otherStudent, otherTeacher]) expect((await getDetail(request(user), params(id))).status).toBe(404);
    for (const user of [student, teacher, otherTeacher]) {
      expect((await getAll(request(user, "/api/admin/feedback"))).status).toBe(403);
      expect((await PATCH(request(user, "/api/admin/feedback/1", "PATCH", '{"status":"resolved"}'), params(id))).status).toBe(403);
      expect((await reply(request(user, "/api/admin/feedback/1/replies", "POST", '{"content":"reply"}'), params(id))).status).toBe(403);
    }
    expect((await GET(request(null))).status).toBe(401);
    expect((await getAll(request(null))).status).toBe(401);
  });

  it("rejects cross-origin writes before any mutation", async () => {
    const body = new FormData(); body.set("title", "bad"); body.set("content", "bad");
    expect((await POST(request(student, "/api/feedback", "POST", body, true))).status).toBe(403);
    const { id } = await (await submission(student)).json();
    expect((await PATCH(request(admin, "/api/admin/feedback/1", "PATCH", '{"status":"resolved"}', true), params(id))).status).toBe(403);
    expect((await reply(request(admin, "/api/admin/feedback/1/replies", "POST", '{"content":"bad"}', true), params(id))).status).toBe(403);
    expect((await getFeedback(student, id)).status).toBe("pending");
    expect(await prisma.feedbackReply.count()).toBe(0);
  });

  it("appends multiple replies atomically, resolves and reopens feedback", async () => {
    const { id } = await (await submission(teacher)).json();
    for (const content of ["已修复，请刷新后重试", "补充：不会影响已有成绩"]) {
      expect((await reply(request(admin, "/api/admin/feedback/1/replies", "POST", JSON.stringify({ content })), params(id))).status).toBe(201);
    }
    let detail = await getFeedback(teacher, id);
    expect(detail.replies).toHaveLength(2);
    expect(detail.status).toBe("resolved");
    expect(detail.replies[0].administratorUsername).toBe(admin.username);
    expect((await PATCH(request(admin, "/api/admin/feedback/1", "PATCH", '{"status":"pending"}'), params(id))).status).toBe(200);
    detail = await getFeedback(teacher, id);
    expect(detail.status).toBe("pending");
    expect(detail.replies).toHaveLength(2);
    await expect(import("@/lib/feedback").then(({ replyToFeedback }) => replyToFeedback({ ...admin, id: 999999 }, id, "failed reply"))).rejects.toThrow();
    expect((await getFeedback(teacher, id)).status).toBe("pending");
    expect(await prisma.feedbackReply.count()).toBe(2);
  });

  it("paginates and filters only bounded metadata for administrators", async () => {
    const now = new Date();
    await prisma.feedback.createMany({ data: Array.from({ length: 23 }, (_, index) => ({
      authorId: index === 0 ? teacher.id : student.id,
      authorUsername: index === 0 ? teacher.username : student.username,
      authorRole: index === 0 ? "teacher" : "student",
      title: `issue-${index}`, content: "not-in-list", status: index === 0 ? "resolved" : "pending", createdAt: now,
    })) });
    const first = await (await getAll(request(admin, "/api/admin/feedback"))).json();
    expect(first.pagination).toMatchObject({ total: 22, pageSize: 20, totalPages: 2 });
    expect(first.items).toHaveLength(20);
    expect(first.items[0].title).toBe("issue-22");
    const second = await (await getAll(request(admin, "/api/admin/feedback?page=2"))).json();
    expect(second.items).toHaveLength(2);
    const filtered = await (await getAll(request(admin, `/api/admin/feedback?status=all&role=teacher&q=${teacher.username}`))).json();
    expect(filtered.items).toHaveLength(1);
    const searched = await (await getAll(request(admin, "/api/admin/feedback?q=issue-22"))).json();
    expect(searched.items).toHaveLength(1);
    expect((await (await GET(request(teacher))).json()).pagination.total).toBe(1);
    expect((await getAll(request(admin, "/api/admin/feedback?role=admin"))).status).toBe(400);
  });

  it("rolls back partial attachments, hides internal errors and permits retry after failure", async () => {
    const image = { data: new Uint8Array([1]), mimeType: "image/webp", width: 1, height: 1, byteSize: 1, position: 0 };
    await expect(createFeedback(student, { title: "rollback", content: "content", attachments: [image, image] })).rejects.toThrow();
    expect(await prisma.feedback.count()).toBe(0);
    expect(await prisma.feedbackAttachment.count()).toBe(0);
    vi.spyOn(prisma.feedback, "create").mockRejectedValueOnce(new Error("private content must not leak"));
    const failed = await submission(student);
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain("private content");
    expect((await submission(student)).status).toBe(201);
  });

  it("retains original identity and reply snapshots after accounts are renamed/deleted", async () => {
    const { id } = await (await submission(student, 1)).json();
    await reply(request(admin, "/api/admin/feedback/1/replies", "POST", '{"content":"kept reply"}'), params(id));
    await prisma.user.update({ where: { id: student.id }, data: { username: "renamed-student" } });
    await prisma.user.delete({ where: { id: student.id } });
    const survivor = await prisma.user.create({ data: { username: `surviving-admin-${sequence}`, role: "admin", passwordHash: "test" } });
    await prisma.user.delete({ where: { id: admin.id } });
    const detail = await getFeedback({ id: survivor.id, username: survivor.username, role: "admin" }, id);
    expect(detail.authorUsername).toBe(student.username);
    expect(detail.replies[0].administratorUsername).toBe(admin.username);
    expect(detail.attachments).toHaveLength(1);
    expect((await prisma.feedback.findUnique({ where: { id } }))?.authorId).toBeNull();
    expect((await prisma.feedbackReply.findFirst({ where: { feedbackId: id } }))?.administratorId).toBeNull();
  });

  it("validates status, replies, IDs and malformed bodies without saving changes", async () => {
    const { id } = await (await submission(student)).json();
    expect((await PATCH(request(admin, "/api/admin/feedback/1", "PATCH", '{"status":"deleted"}'), params(id))).status).toBe(400);
    expect((await PATCH(request(admin, "/api/admin/feedback/1", "PATCH", "broken"), params(id))).status).toBe(400);
    for (const content of ["", " ", "x".repeat(3001)]) expect((await reply(request(admin, "/api/admin/feedback/1/replies", "POST", JSON.stringify({ content })), params(id))).status).toBe(400);
    expect((await getDetail(request(student), { params: Promise.resolve({ id: "abc" }) })).status).toBe(404);
    expect((await PATCH(request(admin, "/api/admin/feedback/1", "PATCH", '{"status":"resolved"}'), params(999999))).status).toBe(404);
    expect(await prisma.feedbackReply.count()).toBe(0);
  });
});
