import { NextRequest, NextResponse } from "next/server";
import { hashPassword, validateAccountPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  getStudentRankings,
  normalizeCustomTitle,
  validateCustomTitle,
} from "@/lib/ranking";
import {
  PayloadTooLargeError,
  REQUEST_LIMITS,
  readJsonWithLimit,
} from "@/lib/requestLimits";
import { requireStaffApiUser } from "@/lib/staffAccess";
import { boolSetting, getSetting } from "@/lib/settings";
import { TEACHER_STUDENT_INITIAL_PASSWORD } from "@/lib/userManagementPolicy";

function readRole(value: unknown) {
  if (value === "admin" || value === "teacher" || value === "student") {
    return value;
  }
  return null;
}

function readAiAccessEnabled(value: unknown) {
  return value === true || value === "true";
}

function readObjectiveAiAccessEnabled(value: unknown) {
  return value === true || value === "true";
}

export async function GET(request: NextRequest) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

  const [users, rankings, objectiveMaster, objectiveStudent] = await Promise.all([
    prisma.user.findMany({
      where: auth.user.role === "teacher" ? { role: "student" } : undefined,
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        studentProfile: {
          select: {
            aiAccessEnabled: true,
            customTitle: true,
            objectiveAiAccessEnabled: true,
          },
        },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getStudentRankings(),
    getSetting("aiObjectiveExplanationEnabled"),
    getSetting("aiStudentObjectiveExplanationEnabled"),
  ]);
  const rankingByUserId = new Map(rankings.map((item) => [item.userId, item]));

  return NextResponse.json({
    studentObjectiveAiGloballyEnabled:
      boolSetting(objectiveMaster) && boolSetting(objectiveStudent),
    users: users.map((user) => {
      const customTitle = user.studentProfile?.customTitle ?? "";
      return {
        ...user,
        aiAccessEnabled: user.studentProfile?.aiAccessEnabled ?? false,
        objectiveAiAccessEnabled:
          user.studentProfile?.objectiveAiAccessEnabled ?? false,
        customTitle,
        ranking: rankingByUserId.get(user.id) ?? null,
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireStaffApiUser(request);
  if (auth.response) return auth.response;

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
  const teacherRequest = auth.user.role === "teacher";
  if (
    teacherRequest &&
    Object.keys(record).some(
      (key) =>
        key !== "username" &&
        key !== "aiAccessEnabled" &&
        key !== "objectiveAiAccessEnabled",
    )
  ) {
    return NextResponse.json(
      { error: "老师新增学生时只能填写用户名和 AI 权限" },
      { status: 403 },
    );
  }
  const username =
    typeof record.username === "string" ? record.username.trim() : "";
  const password = teacherRequest
    ? TEACHER_STUDENT_INITIAL_PASSWORD
    : typeof record.password === "string"
      ? record.password
      : "";
  const requestedRole = readRole(record.role);
  if (
    teacherRequest &&
    record.aiAccessEnabled !== undefined &&
    typeof record.aiAccessEnabled !== "boolean"
  ) {
    return NextResponse.json(
      { error: "AI 权限必须是布尔值" },
      { status: 400 },
    );
  }
  if (
    teacherRequest &&
    record.objectiveAiAccessEnabled !== undefined &&
    typeof record.objectiveAiAccessEnabled !== "boolean"
  ) {
    return NextResponse.json(
      { error: "选择判断 AI 权限必须是布尔值" },
      { status: 400 },
    );
  }
  const role = teacherRequest ? "student" : requestedRole;
  const aiAccessEnabled = teacherRequest
    ? record.aiAccessEnabled !== false
    : readAiAccessEnabled(record.aiAccessEnabled);
  const objectiveAiAccessEnabled = teacherRequest
    ? record.objectiveAiAccessEnabled === true
    : readObjectiveAiAccessEnabled(record.objectiveAiAccessEnabled);
  const customTitle = teacherRequest
    ? null
    : normalizeCustomTitle(record.customTitle);
  const customTitleError = validateCustomTitle(customTitle);

  if (!username || !password) {
    return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
  }
  const passwordError = validateAccountPassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
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
        ...(role === "student" &&
        (customTitle || aiAccessEnabled || objectiveAiAccessEnabled)
          ? {
              studentProfile: {
                create: {
                  aiAccessEnabled,
                  customTitle,
                  objectiveAiAccessEnabled,
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        studentProfile: {
          select: {
            aiAccessEnabled: true,
            customTitle: true,
            objectiveAiAccessEnabled: true,
          },
        },
      },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "用户名已存在或创建失败" }, { status: 400 });
  }
}
