import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  replaceLearningAssignmentProblems,
  validateLearningAssignmentProblemItems,
} from "@/lib/learningAssignments";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import {
  canManageOwnedResource,
  requireStaffApiUser,
} from "@/lib/staffAccess";

type RouteContext = { params: Promise<{ id: string }> };

function optionalText(value: unknown, max: number, label: string) {
  if (value === undefined) return { present: false as const, value: null };
  if (value !== null && typeof value !== "string") {
    throw new Error(`${label}格式不合法`);
  }
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length > max) throw new Error(`${label}不能超过 ${max} 字`);
  return { present: true as const, value: normalized || null };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;
  const assignmentId = Number((await context.params).id);
  if (!Number.isInteger(assignmentId)) {
    return NextResponse.json({ error: "专项练习 ID 不合法" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }
  const record = typeof body === "object" && body
    ? (body as Record<string, unknown>)
    : {};
  try {
    const title = optionalText(record.title, 60, "专项练习标题");
    const note = optionalText(record.note, 300, "教师说明");
    const data: Prisma.LearningAssignmentUpdateInput = {};
    const updatesProblems = record.problemItems !== undefined;
    const problemItemsValidation = updatesProblems
      ? validateLearningAssignmentProblemItems(record.problemItems)
      : null;
    if (problemItemsValidation?.error) {
      throw new Error(problemItemsValidation.error);
    }
    if (title.present) {
      if (!title.value) throw new Error("专项练习标题不能为空");
      data.title = title.value;
    }
    if (note.present) data.note = note.value;
    if (record.dueAt !== undefined) {
      if (record.dueAt !== null && typeof record.dueAt !== "string") {
        throw new Error("截止日期不合法");
      }
      const raw = typeof record.dueAt === "string" ? record.dueAt.trim() : "";
      const dueAt = raw ? new Date(raw) : null;
      if (raw && Number.isNaN(dueAt?.getTime())) throw new Error("截止日期不合法");
      data.dueAt = dueAt;
    }
    if (record.archive === true) {
      if (updatesProblems) {
        throw new Error("归档任务时不能同时调整题目集合");
      }
      data.status = "archived";
      data.archivedAt = new Date();
    }
    if (Object.keys(data).length === 0 && !updatesProblems) {
      throw new Error("没有可更新的内容");
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.learningAssignment.findUnique({
        where: { id: assignmentId },
        select: {
          createdById: true,
          id: true,
          status: true,
          studentId: true,
        },
      });
      if (
        !existing ||
        !canManageOwnedResource(auth.user, existing.createdById)
      ) {
        throw new LearningAssignmentNotFoundError();
      }
      if (updatesProblems && existing.status !== "active") {
        throw new LearningAssignmentConflictError(
          "已归档的专项练习不能调整题目集合",
        );
      }

      const problemUpdate = problemItemsValidation?.data
        ? await replaceLearningAssignmentProblems({
            assignmentId,
            db: tx,
            items: problemItemsValidation.data,
            studentId: existing.studentId,
          })
        : {
            addedProblemCount: 0,
            removedProblemCount: 0,
            unlinkedSubmissionCount: 0,
          };

      if (Object.keys(data).length > 0) {
        await tx.learningAssignment.update({
          where: { id: assignmentId },
          data,
        });
      }
      const assignment = await tx.learningAssignment.findUniqueOrThrow({
        where: { id: assignmentId },
        include: {
          problems: { orderBy: [{ order: "asc" }, { id: "asc" }] },
        },
      });
      return { assignment, ...problemUpdate };
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LearningAssignmentNotFoundError) {
      return NextResponse.json(
        { error: "专项练习不存在" },
        { status: 404 },
      );
    }
    if (error instanceof LearningAssignmentConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "专项练习更新失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;
  const assignmentId = Number((await context.params).id);
  if (!Number.isInteger(assignmentId)) {
    return NextResponse.json({ error: "专项练习 ID 不合法" }, { status: 400 });
  }

  const existing = await prisma.learningAssignment.findUnique({
    where: { id: assignmentId },
    select: { createdById: true, id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "专项练习不存在" }, { status: 404 });
  }
  if (!canManageOwnedResource(auth.user, existing.createdById)) {
    return NextResponse.json({ error: "专项练习不存在" }, { status: 404 });
  }
  if (existing.status !== "archived") {
    return NextResponse.json(
      { error: "进行中的专项练习不能直接删除，请先归档任务" },
      { status: 409 },
    );
  }

  await prisma.learningAssignment.delete({ where: { id: assignmentId } });
  return NextResponse.json({ ok: true });
}

class LearningAssignmentNotFoundError extends Error {}

class LearningAssignmentConflictError extends Error {}
