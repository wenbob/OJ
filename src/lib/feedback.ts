import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildPaginationMeta } from "@/lib/pagination";
import { FeedbackError, feedbackText } from "@/lib/feedbackErrors";
import { FEEDBACK_LIMITS } from "@/lib/feedbackShared";
import type { readFeedbackSubmission } from "@/lib/feedbackUpload";

export function feedbackVisibility(user: CurrentUser): Prisma.FeedbackWhereInput {
  return user.role === "admin" ? {} : { authorId: user.id };
}

export async function listFeedback(user: CurrentUser, params: URLSearchParams) {
  const rawPage = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(rawPage) ? Math.min(1_000_000, Math.max(1, rawPage)) : 1;
  const where: Prisma.FeedbackWhereInput = feedbackVisibility(user);
  if (user.role === "admin") {
    const status = params.get("status") || "pending";
    const role = params.get("role") || "all";
    if (!["pending", "resolved", "all"].includes(status) || !["student", "teacher", "all"].includes(role)) {
      throw new FeedbackError("筛选条件不正确");
    }
    if (status !== "all") where.status = status;
    if (role !== "all") where.authorRole = role;
    const q = (params.get("q") ?? "").trim().slice(0, 100);
    if (q) where.OR = [{ title: { contains: q } }, { authorUsername: { contains: q } }];
  }
  const pageSize = FEEDBACK_LIMITS.pageSize;
  const [total, items] = await prisma.$transaction([
    prisma.feedback.count({ where }),
    prisma.feedback.findMany({
      where, skip: (page - 1) * pageSize, take: pageSize,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true, title: true, status: true, authorUsername: true, authorRole: true, createdAt: true,
        _count: { select: { attachments: true, replies: true } },
      },
    }),
  ]);
  return { items, pagination: buildPaginationMeta({ total, page, pageSize }) };
}

export async function getFeedback(user: CurrentUser, id: number) {
  const result = await prisma.feedback.findFirst({
    where: { id, ...feedbackVisibility(user) },
    select: {
      id: true, authorUsername: true, authorRole: true, title: true, content: true,
      status: true, createdAt: true, updatedAt: true,
      attachments: {
        orderBy: { position: "asc" },
        select: { id: true, width: true, height: true, byteSize: true },
      },
      replies: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, administratorUsername: true, content: true, createdAt: true },
      },
    },
  });
  if (!result) throw new FeedbackError("反馈不存在", 404);
  return result;
}

export async function getFeedbackAttachment(user: CurrentUser, id: number, attachmentId: number) {
  const attachment = await prisma.feedbackAttachment.findFirst({
    where: { id: attachmentId, feedbackId: id, feedback: feedbackVisibility(user) },
    select: { data: true, mimeType: true, byteSize: true },
  });
  if (!attachment) throw new FeedbackError("截图不存在", 404);
  return attachment;
}

export async function createFeedback(user: CurrentUser, submission: Awaited<ReturnType<typeof readFeedbackSubmission>>) {
  if (user.role === "admin") throw new FeedbackError("管理员请使用反馈管理", 403);
  // Nested creation is atomic: an attachment failure rolls back the feedback too.
  return prisma.feedback.create({
    data: {
      authorId: user.id, authorUsername: user.username, authorRole: user.role,
      title: submission.title, content: submission.content,
      attachments: { create: submission.attachments },
    },
    select: { id: true },
  });
}

export async function updateFeedbackStatus(user: CurrentUser, id: number, status: unknown) {
  if (user.role !== "admin") throw new FeedbackError("权限不足", 403);
  if (status !== "pending" && status !== "resolved") throw new FeedbackError("处理状态不正确");
  const result = await prisma.feedback.updateMany({ where: { id }, data: { status } });
  if (!result.count) throw new FeedbackError("反馈不存在", 404);
}

export async function replyToFeedback(user: CurrentUser, id: number, value: unknown) {
  if (user.role !== "admin") throw new FeedbackError("权限不足", 403);
  const content = feedbackText(value, FEEDBACK_LIMITS.reply, "回复");
  await prisma.$transaction(async (tx) => {
    const result = await tx.feedback.updateMany({ where: { id }, data: { status: "resolved" } });
    if (!result.count) throw new FeedbackError("反馈不存在", 404);
    await tx.feedbackReply.create({ data: {
      feedbackId: id, administratorId: user.id, administratorUsername: user.username, content,
    } });
  });
}
