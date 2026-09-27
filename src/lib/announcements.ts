import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { isExamExpired } from "./examScoring";

export class AnnouncementError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

async function transaction<T>(task: (tx: Prisma.TransactionClient) => Promise<T>, db: PrismaClient) {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(task, { maxWait: 10_000, timeout: 10_000 }); }
    catch (error) {
      if (attempt >= 2 || !["P2002", "P2034", "P1008", "P2028"].includes((error as { code?: string }).code ?? "")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)));
    }
  }
}

const fields = { id: true, title: true, publishedAt: true, withdrawnAt: true, publisherName: true } as const;
function view<T extends { reads: unknown[] }>(row: T) {
  const { reads, ...item } = row;
  return { ...item, read: reads.length > 0 };
}
export async function announcementExamBlocked(userId: number, db: Prisma.TransactionClient = prisma) {
  const records = await db.examRecord.findMany({
    where: { userId, status: "in_progress", exam: { status: "published" } },
    select: { startedAt: true, exam: { select: { durationMin: true } } },
  });
  return records.some((record) => !isExamExpired({ startedAt: record.startedAt, durationMin: record.exam.durationMin }));
}

export async function listAnnouncements(userId: number, admin: boolean, requestedPage: number, db: PrismaClient = prisma) {
  const where = admin ? {} : { withdrawnAt: null };
  return db.$transaction(async (tx) => {
    const total = await tx.announcement.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / 20));
    const page = Math.min(requestedPage, totalPages);
    const items = await tx.announcement.findMany({ where, orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20, take: 20,
      select: { ...fields, ...(admin ? { body: true } : {}), reads: { where: { userId }, select: { readAt: true } } },
    });
    return { items: items.map(view), page, totalPages, total };
  });
}

export async function pendingAnnouncement(userId: number, student: boolean, db: PrismaClient = prisma) {
  return db.$transaction(async (tx) => {
    const blockedByExam = student && await announcementExamBlocked(userId, tx);
    if (blockedByExam) return { announcement: null, unreadCount: 0, blockedByExam };
    const where = { withdrawnAt: null, reads: { none: { userId } } };
    const unreadCount = await tx.announcement.count({ where });
    const announcement = await tx.announcement.findFirst({ where, orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
      select: { ...fields, body: true } });
    return { announcement: announcement ? { ...announcement, read: false } : null, unreadCount, blockedByExam };
  });
}

export async function announcementDetail(userId: number, id: number, db: PrismaClient = prisma) {
  const row = await db.announcement.findFirst({ where: { id, withdrawnAt: null },
    select: { ...fields, body: true, reads: { where: { userId }, select: { readAt: true } } } });
  if (!row) throw new AnnouncementError("公告不存在或已撤下", 404);
  return view(row);
}

export async function publishAnnouncement(userId: number, input: Record<string, unknown>, db: PrismaClient = prisma) {
  const { title, body, requestId } = input;
  if (typeof title !== "string" || !title.trim() || [...title.trim()].length > 100 ||
      typeof body !== "string" || !body.trim() || [...body.trim()].length > 5000 ||
      typeof requestId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) {
    throw new AnnouncementError("请填写 1～100 字标题、1～5000 字正文及有效发布标识");
  }
  return transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, username: true } });
    if (user?.role !== "admin") throw new AnnouncementError("只有管理员可以发布公告", 403);
    const existing = await tx.announcement.findUnique({ where: { requestId } });
    if (existing) {
      if (existing.publisherId !== userId || existing.title !== title.trim() || existing.body !== body.trim())
        throw new AnnouncementError("发布标识已用于其他内容，请重新预览后发布", 409);
      return existing;
    }
    return tx.announcement.create({ data: { title: title.trim(), body: body.trim(), requestId, publisherId: userId, publisherName: user.username } });
  }, db);
}

export async function readAnnouncement(userId: number, id: number, db: PrismaClient = prisma) {
  return transaction(async (tx) => {
    const row = await tx.announcement.findUnique({ where: { id }, select: { withdrawnAt: true } });
    if (!row || row.withdrawnAt) return { withdrawn: true };
    await tx.announcementRead.upsert({ where: { announcementId_userId: { announcementId: id, userId } },
      create: { announcementId: id, userId }, update: {} });
    return { withdrawn: false };
  }, db);
}

export async function withdrawAnnouncement(userId: number, id: number, db: PrismaClient = prisma) {
  return transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== "admin") throw new AnnouncementError("只有管理员可以撤下公告", 403);
    const row = await tx.announcement.findUnique({ where: { id }, select: { withdrawnAt: true } });
    if (!row) throw new AnnouncementError("公告不存在", 404);
    if (!row.withdrawnAt) await tx.announcement.update({ where: { id }, data: { withdrawnAt: new Date() } });
    return { ok: true };
  }, db);
}
