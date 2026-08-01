import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import {
  requireApiUser,
  requirePageUser,
  type CurrentUser,
  type Role,
} from "@/lib/auth";

export type StaffRole = Extract<Role, "admin" | "teacher">;
export type StaffUser = CurrentUser & { role: StaffRole };

export function isStaffRole(role: Role): role is StaffRole {
  return role === "admin" || role === "teacher";
}

export function getStaffBasePath(role: StaffRole) {
  return role === "admin" ? "/admin" : "/teacher";
}

export function getStaffTitle(role: StaffRole) {
  return role === "admin" ? "管理员端" : "老师端";
}

export function getStaffNav(role: StaffRole) {
  const basePath = getStaffBasePath(role);
  return [
    { href: basePath, label: role === "admin" ? "后台首页" : "老师首页" },
    { href: `${basePath}/practice`, label: "题目练习" },
    ...(role === "admin"
      ? [{ href: `${basePath}/problems`, label: "题目管理" }]
      : []),
    { href: `${basePath}/exams`, label: role === "admin" ? "模拟考试" : "我的考试" },
    { href: `${basePath}/users`, label: role === "admin" ? "用户管理" : "学生管理" },
    { href: `${basePath}/assignments`, label: "作业发布" },
    { href: `${basePath}/submissions`, label: "日常提交" },
    { href: `${basePath}/exam-submissions`, label: "考试提交" },
  ];
}

export async function requireStaffApiUser(request: NextRequest) {
  const auth = await requireApiUser(request, ["admin", "teacher"] as const);
  if (auth.response) return auth;
  return {
    response: null,
    user: auth.user as StaffUser,
  };
}

export async function requireStaffPageUser(role: StaffRole) {
  return (await requirePageUser(role)) as StaffUser;
}

export function getExamAccessWhere(
  user: StaffUser,
  examId?: number,
): Prisma.ExamWhereInput {
  return {
    ...(examId === undefined ? {} : { id: examId }),
    ...(user.role === "teacher" ? { createdById: user.id } : {}),
  };
}

export function canManageOwnedResource(
  user: StaffUser,
  createdById: number | null,
) {
  return user.role === "admin" || createdById === user.id;
}

export function getStaffSubmissionWhere(
  user: StaffUser,
): Prisma.SubmissionWhereInput {
  if (user.role === "admin") return {};
  return {
    OR: [
      { user: { role: "student" } },
      { userId: user.id, submissionType: "practice" },
    ],
  };
}
