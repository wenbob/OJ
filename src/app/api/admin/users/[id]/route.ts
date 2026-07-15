import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
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

type RouteContext = {
  params: Promise<{ id: string }>;
};

function readRole(value: unknown) {
  if (value === "admin" || value === "student") return value;
  return null;
}

function readAiAccessEnabled(value: unknown) {
  return value === true || value === "true";
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "admin");
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
  const username =
    typeof record.username === "string" ? record.username.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";
  const role = readRole(record.role);
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
      await tx.user.update({
        where: { id: userId },
        data: {
          username,
          role,
          ...(password ? { passwordHash: await hashPassword(password) } : {}),
        },
        select: { id: true, username: true, role: true, createdAt: true },
      });

      if (role === "student") {
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

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
