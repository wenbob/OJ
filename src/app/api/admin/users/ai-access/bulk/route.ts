import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { requireStaffApiUser } from "@/lib/staffAccess";

const MAX_BULK_STUDENTS = 500;
const allowedKeys = new Set(["enabled", "profile", "userIds"]);

export async function PATCH(request: NextRequest) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await readJsonWithLimit(request, REQUEST_LIMITS.smallJsonBytes);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof PayloadTooLargeError
            ? error.message
            : "请求格式不合法",
      },
      { status: error instanceof PayloadTooLargeError ? 413 : 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "请求格式不合法" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !allowedKeys.has(key)) ||
    record.profile !== "objective" ||
    typeof record.enabled !== "boolean" ||
    !Array.isArray(record.userIds)
  ) {
    return NextResponse.json(
      { error: "批量 AI 权限参数不合法" },
      { status: 400 },
    );
  }

  const userIds = record.userIds.map(Number);
  if (
    userIds.length === 0 ||
    userIds.length > MAX_BULK_STUDENTS ||
    userIds.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(userIds).size !== userIds.length
  ) {
    return NextResponse.json(
      { error: `请选择 1–${MAX_BULK_STUDENTS} 名不重复学生` },
      { status: 400 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const students = await tx.user.findMany({
        where: { id: { in: userIds }, role: "student" },
        select: { id: true },
      });
      if (students.length !== userIds.length) {
        throw new InvalidBulkStudentError();
      }

      for (const userId of userIds) {
        await tx.studentProfile.upsert({
          where: { userId },
          create: {
            aiAccessEnabled: false,
            customTitle: null,
            objectiveAiAccessEnabled: record.enabled as boolean,
            userId,
          },
          update: {
            objectiveAiAccessEnabled: record.enabled as boolean,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof InvalidBulkStudentError) {
      return NextResponse.json(
        { error: "目标账号不存在或包含非学生账号，未修改任何权限" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "批量更新选择判断 AI 权限失败，未修改任何权限" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    enabled: record.enabled,
    profile: "objective",
    updatedCount: userIds.length,
  });
}

class InvalidBulkStudentError extends Error {}
