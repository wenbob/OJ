import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";

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
  const auth = await requireApiUser(request, "admin");
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
      data.status = "archived";
      data.archivedAt = new Date();
    }
    if (Object.keys(data).length === 0) throw new Error("没有可更新的内容");

    const existing = await prisma.learningAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "专项练习不存在" }, { status: 404 });
    }
    const assignment = await prisma.learningAssignment.update({
      where: { id: assignmentId },
      data,
      include: { problems: { orderBy: { order: "asc" } } },
    });
    return NextResponse.json({ assignment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "专项练习更新失败" },
      { status: 400 },
    );
  }
}
