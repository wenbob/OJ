import { NextRequest, NextResponse } from "next/server";
import { hashPassword, validateAccountPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  normalizeCustomTitle,
  validateCustomTitle,
} from "@/lib/ranking";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { requireStaffApiUser } from "@/lib/staffAccess";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function readRole(value: unknown) {
  if (value === "admin" || value === "teacher" || value === "student") {
    return value;
  }
  return null;
}

function readAiAccessEnabled(value: unknown) {
  return value === true || value === "true";
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;
  if (auth.user.role === "teacher") {
    return NextResponse.json(
      { error: "老师只能切换学生 AI 权限或重置学生密码" },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: "用户 ID 不合法" }, { status: 400 });
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
  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const username =
    typeof record.username === "string" ? record.username.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";
  const requestedRole = readRole(record.role);
  const role = requestedRole;
  const aiAccessEnabled = readAiAccessEnabled(record.aiAccessEnabled);
  const customTitle = normalizeCustomTitle(record.customTitle);
  const customTitleError = validateCustomTitle(customTitle);

  if (!username) {
    return NextResponse.json({ error: "用户名不能为空" }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "用户角色不合法" }, { status: 400 });
  }
  if (password) {
    const passwordError = validateAccountPassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }
  }
  if (customTitleError) {
    return NextResponse.json({ error: customTitleError }, { status: 400 });
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!existingUser) throw new Error("用户不存在");
      const shouldRevokeSessions = Boolean(password) || existingUser.role !== role;

      await tx.user.update({
        where: { id: userId },
        data: {
          username,
          role,
          ...(password ? { passwordHash: await hashPassword(password) } : {}),
          ...(shouldRevokeSessions
            ? { sessionVersion: { increment: 1 } }
            : {}),
        },
        select: { id: true, username: true, role: true, createdAt: true },
      });

      if (role === "student") {
        if (existingUser.role !== "student") {
          await tx.exam.updateMany({
            where: { createdById: userId },
            data: { createdById: null },
          });
        }
        if (customTitle || aiAccessEnabled) {
          await tx.studentProfile.upsert({
            where: { userId },
            create: { aiAccessEnabled, customTitle, userId },
            update: { aiAccessEnabled, customTitle },
          });
        } else {
          await tx.studentProfile.deleteMany({ where: { userId } });
        }
      } else {
        await tx.studentProfile.deleteMany({ where: { userId } });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          role: true,
          createdAt: true,
          studentProfile: {
            select: { aiAccessEnabled: true, customTitle: true },
          },
        },
      });
    });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "更新用户失败，可能用户名已存在" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: "用户 ID 不合法" }, { status: 400 });
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

  const record =
    typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  if (
    Object.keys(record).length !== 1 ||
    typeof record.aiAccessEnabled !== "boolean"
  ) {
    return NextResponse.json(
      { error: "只能提交布尔类型的 AI 权限" },
      { status: auth.user.role === "teacher" ? 403 : 400 },
    );
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!existingUser) throw new StudentUserNotFoundError();
      if (existingUser.role !== "student") {
        throw new StudentUserAccessError();
      }

      await tx.studentProfile.upsert({
        where: { userId },
        create: {
          aiAccessEnabled: record.aiAccessEnabled as boolean,
          customTitle: null,
          userId,
        },
        update: { aiAccessEnabled: record.aiAccessEnabled as boolean },
      });

      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          role: true,
          createdAt: true,
          studentProfile: {
            select: { aiAccessEnabled: true, customTitle: true },
          },
        },
      });
    });

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof StudentUserNotFoundError) {
      return NextResponse.json({ error: "学生账号不存在" }, { status: 404 });
    }
    if (error instanceof StudentUserAccessError) {
      return NextResponse.json(
        { error: "只能调整学生账号的 AI 权限" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "更新 AI 权限失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;
  if (auth.user.role === "teacher") {
    return NextResponse.json(
      { error: "老师不能删除学生账号" },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: "用户 ID 不合法" }, { status: 400 });
  }
  if (userId === auth.user.id) {
    return NextResponse.json({ error: "不能删除当前登录账号" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: userId } });
  return NextResponse.json({ ok: true });
}

class StudentUserNotFoundError extends Error {}
class StudentUserAccessError extends Error {}
