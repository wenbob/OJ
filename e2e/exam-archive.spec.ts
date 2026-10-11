import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const databaseUrl = `file:${path.resolve("prisma/e2e.db").replaceAll("\\", "/")}`;
const password = "e2e-archive-password";
const fixture = { zero: 0, programming: 0, objective: 0, draft: 0, submission: 0, objectiveProblem: 0 };
const screenshots = path.resolve("tmp/release-exam-archive-20261011/screenshots");

test.beforeAll(async () => {
  expect(databaseUrl).toMatch(/\/prisma\/e2e\.db$/);
  await mkdir(screenshots, { recursive: true });
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const passwordHash = await hash(password, 10);
    const users = [];
    for (const [role, suffix] of [["teacher", "teacher"], ["teacher", "other-teacher"], ["student", "student"], ["student", "other-student"]]) {
      users.push(await db.user.create({ data: { username: `e2e-archive-${suffix}`, role, passwordHash } }));
    }
    const [teacher, , student] = users;
    const problem = await db.problem.create({ data: { title: "归档回归编程题", description: "归档回归", inputDescription: "", outputDescription: "", sampleInput: "", sampleOutput: "", difficulty: "基础", category: "归档回归" } });
    const items = JSON.stringify([{ kind: "choice", stem: "选择 A", options: [{ label: "A", text: "甲" }, { label: "B", text: "乙" }], answer: "A", score: 10 }]);
    const objectiveProblem = await db.problem.create({ data: { title: "归档回归客观题", description: "归档回归", inputDescription: "", outputDescription: "", sampleInput: "", sampleOutput: "", difficulty: "基础", category: "归档回归", problemType: "objective", objectiveItems: items } });
    fixture.objectiveProblem = objectiveProblem.id;
    for (const [key, title, objective] of [["zero", "归档回归 未提交", false], ["programming", "归档回归 编程成绩", false], ["objective", "归档回归 客观题成绩", true]] as const) {
      const exam = await db.exam.create({ data: { title, status: "ended", durationMin: 60, createdById: teacher.id, examType: objective ? "objective" : "programming",
        problems: { create: { problemId: objective ? objectiveProblem.id : problem.id, score: objective ? 10 : 100,
          snapshotTitle: objective ? "原始客观题快照" : "原始编程题快照", snapshotProblemType: objective ? "objective" : "programming", snapshotScore: objective ? 10 : 100,
          snapshotObjectiveItems: objective ? items : null, snapshotAt: new Date() } },
        records: { create: { userId: student.id, status: "submitted", submittedAt: new Date(), totalScore: key === "zero" ? 0 : objective ? 10 : 100 } },
      } });
      fixture[key] = exam.id;
      if (key !== "zero") {
        const submission = await db.submission.create({ data: { examId: exam.id, userId: student.id, problemId: objective ? objectiveProblem.id : problem.id, submissionType: "exam", code: objective ? "A" : "// ARCHIVE_REVIEW_CODE", language: objective ? "Objective" : "C++17", status: "Accepted", passedCount: 1, totalCount: 1,
          caseResults: { create: { caseIndex: 1, status: "Accepted", input: objective ? "" : "HIDDEN_ARCHIVE_INPUT", expectedOutput: objective ? "A" : "HIDDEN_ARCHIVE_OUTPUT", actualOutput: objective ? "A" : "HIDDEN_ARCHIVE_OUTPUT" } } } });
        if (key === "programming") fixture.submission = submission.id;
      }
    }
    fixture.draft = (await db.exam.create({ data: { title: "归档回归 空草稿", createdById: teacher.id } })).id;
  } finally { await db.$disconnect(); }
});

async function login(page: Page, suffix: string) {
  await page.context().setExtraHTTPHeaders({ origin: "http://127.0.0.1:3100" });
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("用户名").fill(`e2e-archive-${suffix}`);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("teacher archive survives network failure and preserves a student's zero-submission exam", async ({ page, browser }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await login(page, "teacher");
  await page.goto("/teacher/exams");
  let row = page.getByRole("row").filter({ hasText: "归档回归 未提交" });
  await expect(row.getByRole("button", { name: "删除草稿" })).toHaveCount(0);
  await page.route(`**/api/admin/exams/${fixture.zero}/archive`, (route) => route.abort());
  await row.getByRole("button", { name: "归档", exact: true }).click();
  await expect(page.getByText("网络异常，操作失败，请检查连接后重试")).toBeVisible();
  await expect(row.getByRole("button", { name: "归档", exact: true })).toBeEnabled();
  await page.unroute(`**/api/admin/exams/${fixture.zero}/archive`);
  await row.getByRole("button", { name: "归档", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("link", { name: "已归档", exact: true }).click();
  row = page.getByRole("row").filter({ hasText: "归档回归 未提交" });
  await expect(row.getByRole("button", { name: "取消归档" })).toBeVisible();
  await expect(row.getByRole("link", { name: "进入做题" })).toHaveCount(0);
  await page.screenshot({ path: path.join(screenshots, "teacher-archived.png"), fullPage: true });
  const studentPage = await browser.newPage();
  try {
    await login(studentPage, "student");
    await studentPage.goto("/student/exams");
    await studentPage.getByRole("link", { name: "我的历史考试" }).click();
    const card = studentPage.getByRole("article").filter({ hasText: "归档回归 未提交" });
    await expect(card).toContainText("0 分");
    await card.getByRole("link", { name: "查看成绩与复盘" }).click();
    await expect(studentPage).toHaveURL(new RegExp(`/exams/${fixture.zero}/result$`));
    await expect(studentPage.getByText("已归档，成绩和提交记录继续保留")).toBeVisible();
    await expect(studentPage.getByRole("link", { name: "继续考试" })).toHaveCount(0);
    await studentPage.setViewportSize({ width: 320, height: 800 });
    await studentPage.goto("/student/exams?view=history&pageSize=1");
    await expect(studentPage.getByRole("article")).toHaveCount(1);
    await expect(studentPage.getByRole("link", { name: "下一页" })).toHaveAttribute("href", /view=history/);
    expect(await studentPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await studentPage.screenshot({ path: path.join(screenshots, "student-history-mobile.png"), fullPage: true });
  } finally { await studentPage.close(); }
});

test("archived programming and objective results preserve scores, code, snapshots and hidden-data protection", async ({ page }) => {
  await login(page, "teacher");
  for (const id of [fixture.programming, fixture.objective]) expect((await page.request.post(`/api/admin/exams/${id}/archive`)).status()).toBe(200);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try { await db.problem.update({ where: { id: fixture.objectiveProblem }, data: { title: "修改后的题库标题", objectiveItems: JSON.stringify([{ kind: "choice", stem: "新题目", options: [{ label: "A", text: "甲" }, { label: "B", text: "乙" }], answer: "B", score: 30 }]) } }); }
  finally { await db.$disconnect(); }
  await login(page, "student");
  await page.goto(`/student/exams/${fixture.objective}/result`);
  await expect(page.getByText("10 分", { exact: true })).toBeVisible();
  await expect(page.getByText("原始客观题快照", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("标准答案");
  await page.goto(`/student/exams/${fixture.programming}/result`);
  await expect(page.getByText("100 分", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "查看本场提交与代码" }).click();
  await expect(page).toHaveURL(new RegExp(`exam-submissions\\?examId=${fixture.programming}$`));
  await expect(page.getByRole("button", { name: "继续修改" })).toHaveCount(0);
  const response = await page.request.get(`/api/submissions/${fixture.submission}`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(JSON.stringify(body)).toContain("ARCHIVE_REVIEW_CODE");
  expect(JSON.stringify(body)).not.toContain("HIDDEN_ARCHIVE");
});

test("restore keeps exams ended, other users cannot manage or read history, and only unused drafts can be deleted", async ({ page }) => {
  await login(page, "other-teacher");
  expect((await page.request.post(`/api/admin/exams/${fixture.zero}/archive`)).status()).toBe(404);
  expect((await page.request.delete(`/api/admin/exams/${fixture.zero}/archive`)).status()).toBe(404);
  await login(page, "other-student");
  await page.goto("/student/exams?view=history");
  await expect(page.locator("body")).not.toContainText("归档回归 未提交");
  expect((await page.request.get(`/api/exams/${fixture.zero}`)).status()).toBe(404);
  expect((await page.goto(`/student/exams/${fixture.zero}/result`))?.status()).toBe(404);
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("用户名").fill("e2e-admin");
  await page.getByLabel("密码").fill("e2e-admin-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect((await page.request.delete(`/api/admin/exams/${fixture.zero}/archive`)).status()).toBe(200);
  expect((await page.request.post(`/api/admin/exams/${fixture.zero}/publish`)).status()).toBe(409);
  expect((await page.request.delete(`/api/admin/exams/${fixture.zero}`)).status()).toBe(409);
  expect((await page.request.delete(`/api/admin/exams/${fixture.draft}`)).status()).toBe(200);
  expect((await page.request.get(`/api/admin/exams/${fixture.draft}`)).status()).toBe(404);
});
