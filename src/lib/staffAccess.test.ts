import { describe, expect, it } from "vitest";
import {
  canManageOwnedResource,
  getExamAccessWhere,
  getStaffBasePath,
  getStaffNav,
  getStaffSubmissionWhere,
  getStaffTitle,
  type StaffUser,
} from "./staffAccess";

const admin: StaffUser = {
  id: 1,
  role: "admin",
  username: "admin",
};

const teacher: StaffUser = {
  id: 7,
  role: "teacher",
  username: "teacher",
};

describe("staff access boundaries", () => {
  it("scopes teacher exams to their creator id while administrators see all exams", () => {
    expect(getExamAccessWhere(teacher)).toEqual({ createdById: 7 });
    expect(getExamAccessWhere(teacher, 18)).toEqual({
      createdById: 7,
      id: 18,
    });
    expect(getExamAccessWhere(admin, 18)).toEqual({ id: 18 });
  });

  it("shows teacher navigation without problem or settings management", () => {
    const teacherNav = getStaffNav("teacher");
    expect(getStaffBasePath("teacher")).toBe("/teacher");
    expect(getStaffTitle("teacher")).toBe("老师端");
    expect(teacherNav.some((item) => item.href === "/teacher/problems")).toBe(false);
    expect(teacherNav.some((item) => item.href === "/teacher/settings")).toBe(false);
    expect(teacherNav).toContainEqual({
      href: "/teacher/exams",
      label: "我的考试",
    });
  });

  it("allows teachers to manage only their own creator-scoped resources", () => {
    expect(canManageOwnedResource(teacher, 7)).toBe(true);
    expect(canManageOwnedResource(teacher, 8)).toBe(false);
    expect(canManageOwnedResource(teacher, null)).toBe(false);
    expect(canManageOwnedResource(admin, null)).toBe(true);
  });

  it("lets teachers inspect student submissions and only their own practice submissions", () => {
    expect(getStaffSubmissionWhere(teacher)).toEqual({
      OR: [
        { user: { role: "student" } },
        { submissionType: "practice", userId: 7 },
      ],
    });
    expect(getStaffSubmissionWhere(admin)).toEqual({});
  });
});
