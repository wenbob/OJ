import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  normalizeCustomTitle,
  validateCustomTitle,
} from "@/lib/ranking";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function readRole(value: unknown) {
  if (value === "admin" || value === "student") return value;
  return null;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: "用户 ID 不合法" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = readRole(body?.role);
  const customTitle = normalizeCustomTitle(body?.customTitle);
  const customTitleError = validateCustomTitle(customTitle);

  if (!username) {
    return NextResponse.json({ error: "用户名不能为空" }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "用户角色不合法" }, { status: 400 });
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
        if (customTitle) {
          await tx.studentProfile.upsert({
            where: { userId },
            create: { customTitle, userId },
            update: { customTitle },
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
          studentProfile: { select: { customTitle: true } },
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
