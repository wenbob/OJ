import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { expect, test } from "@playwright/test";
import { submissionStatuses, type SubmissionStatus } from "../src/lib/status";

const roles = ["student", "teacher", "admin"] as const;
type Role = typeof roles[number];
type Submission = {
  id: number;
  status: SubmissionStatus;
  passedCount: number;
  totalCount: number;
  runtimeMs: number;
  errorMessage: string | null;
  caseResults: Array<{ caseIndex: number; status: string; actualOutput: string | null; studentDetailsHidden?: boolean }>;
};
const fixture = {} as Record<Role, Record<SubmissionStatus, Submission>>;
const password = "e2e-submit-result-password";
const screenshotDirectory = path.resolve("tmp/submission-result-20261007");
const reasons: Record<string, string> = {
  "Wrong Answer": "答案不正确",
  "Compile Error": "编译错误",
  "Runtime Error": "程序运行出错",
  "Time Limit Exceeded": "运行超时",
};

test.beforeAll(async () => {
  const databaseUrl = `file:${path.resolve("prisma/e2e.db").replaceAll("\\", "/")}`;
  expect(databaseUrl).toMatch(/\/prisma\/e2e\.db$/);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    for (const role of roles) {
      const user = await db.user.create({ data: { username: `e2e-submit-result-${role}`, role, passwordHash: await hash(password, 10) } });
      fixture[role] = {} as Record<SubmissionStatus, Submission>;
      for (const status of submissionStatuses) {
        const compileError = status === "Compile Error";
        const record = await db.submission.create({
          data: {
            userId: user.id,
            problemId: 101,
            code: "int main() { return 0; }",
            language: "C++17",
            status,
            passedCount: status === "Accepted" ? 2 : compileError ? 0 : 1,
            totalCount: 2,
            runtimeMs: compileError ? 0 : 967,
            errorMessage: compileError ? "COMPILER_DETAIL_E2E" : status === "Accepted" ? null : "RAW_ERROR_DETAIL_E2E",
            caseResults: { create: compileError ? [] : [1, 2].map((caseIndex) => ({
              caseIndex,
              status: caseIndex === 1 ? "Accepted" : status,
              input: "HIDDEN_INPUT_E2E",
              expectedOutput: "HIDDEN_EXPECTED_E2E",
              actualOutput: "HIDDEN_ACTUAL_E2E",
              runtimeMs: 10,
            })) },
          },
          include: { caseResults: true },
        });
        fixture[role][status] = {
          ...record,
          status,
          caseResults: record.caseResults.map((item) => ({
            ...item,
            studentDetailsHidden: role === "student",
          })),
        };
      }
    }
  } finally { await db.$disconnect(); }
});

for (const role of roles) {
  test(`${role} gets a compact, clear programming result and can open full details`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("用户名").fill(`e2e-submit-result-${role}`);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto(role === "student" ? "/student/problems/101" : `/${role}/practice/problems/101`);
    const submit = page.getByRole("button", { name: "提交代码", exact: true });
    await expect(submit).toBeEnabled();
    let response = fixture[role].Accepted;
    await page.route("**/api/problems/101/submit", (route) => route.fulfill({ json: { submission: response } }));
    const summary = page.getByTestId("programming-submission-summary");
    for (const status of submissionStatuses) {
      response = fixture[role][status];
      await submit.click();
      await expect(summary).toBeVisible();
      await expect(summary).toContainText(status === "Accepted" ? "通过了" : "未通过");
      if (status !== "Accepted") await expect(summary).toContainText(reasons[status]);
      await expect(summary).not.toContainText("正式提交的测试输入");
      await expect(summary).not.toContainText("HIDDEN_");
      await expect(summary).not.toContainText("COMPILER_DETAIL_E2E");
      await expect(summary).not.toContainText("RAW_ERROR_DETAIL_E2E");
      await expect(summary).not.toContainText("Accepted");
      if (status === "Compile Error") {
        await expect(summary).toContainText("检查代码后再提交");
        await expect(summary).not.toContainText("测试点");
      } else {
        await expect(summary).toContainText(`${response.passedCount}/2 测试点 · 967 ms`);
      }
      await expect(page.getByRole("status", { name: "通过此题提示", exact: true })).toBeHidden();
      await expect(submit).toBeEnabled();
      await expect(summary.getByRole("link", { name: "查看详情" })).toHaveAttribute("href", `/${role}/submissions/${response.id}`);
      for (const width of [320, 768, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await summary.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(150);
      }
      if (status === "Accepted" || status === "Wrong Answer" || status === "Compile Error") {
        await mkdir(screenshotDirectory, { recursive: true });
        await summary.screenshot({ path: path.join(screenshotDirectory, `${role}-${status.replaceAll(" ", "-").toLowerCase()}.png`) });
      }
    }

    response = fixture[role]["Compile Error"];
    await submit.click();
    await expect(summary).toContainText("编译错误");
    const details = summary.getByRole("link", { name: "查看详情" });
    await details.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${role}/submissions/${response.id}$`));
    await expect(page.getByRole("heading", { name: "提交详情", exact: true })).toBeVisible();
    await expect(page.getByText("COMPILER_DETAIL_E2E", { exact: true })).toBeVisible();
  });
}
