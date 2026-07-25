import { describe, expect, it } from "vitest";
import { getStaffNav } from "./staffAccess";
import { isShellNavItemActive } from "./shellNavigation";

function getActiveTeacherLabels(pathname: string) {
  const items = [
    ...getStaffNav("teacher"),
    { href: "/teacher/ai-usage", label: "AI 使用" },
    { href: "/teacher/learning", label: "学情看板" },
    { href: "/teacher/leaderboard", label: "天梯榜" },
  ];

  return items
    .filter((item) => isShellNavItemActive(pathname, item.href))
    .map((item) => item.label);
}

describe("shell navigation active path matching", () => {
  it("matches each top-level home only on its exact path", () => {
    expect(isShellNavItemActive("/student", "/student")).toBe(true);
    expect(isShellNavItemActive("/student/problems", "/student")).toBe(false);
    expect(isShellNavItemActive("/admin", "/admin")).toBe(true);
    expect(isShellNavItemActive("/admin/users", "/admin")).toBe(false);
    expect(isShellNavItemActive("/teacher", "/teacher")).toBe(true);
    expect(isShellNavItemActive("/teacher/users", "/teacher")).toBe(false);
  });

  it("keeps a nested teacher exam page under My Exams", () => {
    expect(getActiveTeacherLabels("/teacher/exams/12/edit")).toEqual([
      "我的考试",
    ]);
  });

  it("does not confuse exam submissions with exams or the teacher home", () => {
    expect(getActiveTeacherLabels("/teacher/exam-submissions")).toEqual([
      "考试提交",
    ]);
  });

  it.each([
    ["/teacher", "老师首页"],
    ["/teacher/practice", "题目练习"],
    ["/teacher/exams", "我的考试"],
    ["/teacher/users", "学生管理"],
    ["/teacher/submissions", "日常提交"],
    ["/teacher/ai-usage", "AI 使用"],
    ["/teacher/learning/5", "学情看板"],
    ["/teacher/leaderboard", "天梯榜"],
  ])("selects exactly one item for %s", (pathname, label) => {
    expect(getActiveTeacherLabels(pathname)).toEqual([label]);
  });
});
