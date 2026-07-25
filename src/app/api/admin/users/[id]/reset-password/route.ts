import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { requireStaffApiUser } from "@/lib/staffAccess";
import { TEACHER_STUDENT_INITIAL_PASSWORD } from "@/lib/userManagementPolicy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: "用户 ID 不合法" }, { status: 400 });
  }

  const result = await prisma.user.updateMany({
    where: { id: userId, role: "student" },
    data: {
      passwordHash: await hashPassword(TEACHER_STUDENT_INITIAL_PASSWORD),
      sessionVersion: { increment: 1 },
    },
  });
  if (result.count !== 1) {
    return NextResponse.json({ error: "学生账号不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
