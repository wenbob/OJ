import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  getStudentRankings,
  normalizeCustomTitle,
  validateCustomTitle,
} from "@/lib/ranking";

function readRole(value: unknown) {
  if (value === "admin" || value === "student") return value;
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const [users, rankings] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        studentProfile: { select: { customTitle: true } },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getStudentRankings(),
  ]);
  const rankingByUserId = new Map(rankings.map((item) => [item.userId, item]));

  return NextResponse.json({
    users: users.map((user) => {
      const customTitle = user.studentProfile?.customTitle ?? "";
      return {
        ...user,
        customTitle,
        ranking: rankingByUserId.get(user.id) ?? null,
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, "admin");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = readRole(body?.role);
  const customTitle = normalizeCustomTitle(body?.customTitle);
  const customTitleError = validateCustomTitle(customTitle);

  if (!username || !password) {
    return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "用户角色不合法" }, { status: 400 });
  }
  if (customTitleError) {
    return NextResponse.json({ error: customTitleError }, { status: 400 });
  }

  try {
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await hashPassword(password),
        role,
        ...(role === "student" && customTitle
          ? { studentProfile: { create: { customTitle } } }
          : {}),
      },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        studentProfile: { select: { customTitle: true } },
      },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "用户名已存在或创建失败" }, { status: 400 });
  }
}
