import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const e2eDatabaseUrl = `file:${path.resolve("prisma/e2e.db").replaceAll("\\", "/")}`;

async function login(page: Page, name: string, password: string, role: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(name);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${role}$`));
}
async function refreshNotices(page: Page) {
  const response = page.waitForResponse((r) => r.url().endsWith("/api/announcements/pending"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await response;
}
test("announcement publishing, persistent reads, overlay queue, exam suppression and history", async ({ browser }) => {
  test.setTimeout(180_000);
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  const student = await browser.newPage();
  const teacher = await browser.newPage();
  const admin = await browser.newPage();
  const errors: string[] = [];
  for (const page of [student, teacher, admin]) page.on("pageerror", (e) => errors.push(e.message));
  const ids: number[] = [];
  try {
    await login(student, "e2e-announcement-student", "e2e-announcement-password", "student");
    await login(admin, "e2e-admin", "e2e-admin-password", "admin");
    await admin.goto("/admin/announcements");
    await admin.getByLabel("公告标题").fill("E2E 公告一");
    await admin.getByLabel("公告正文").fill("第一行通知\n<script>window.announcementUnsafe=true</script>\n" + "课程安排与系统更新说明，请阅读后确认。\n".repeat(50));
    await admin.getByRole("button", { name: "预览公告" }).click();
    // The server saves successfully but the response is lost; retry must not duplicate.
    await admin.route("**/api/admin/announcements", async (route) => {
      if (route.request().method() === "POST") {
        await route.fetch();
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "测试：响应丢失，请重试" }) });
      }
      else await route.continue();
    });
    await admin.getByRole("button", { name: "确认发布" }).click();
    await expect(admin.getByText("测试：响应丢失，请重试")).toBeVisible();
    await expect(admin.getByLabel("公告标题")).toHaveValue("E2E 公告一");
    await admin.unroute("**/api/admin/announcements");
    await admin.getByRole("button", { name: "确认发布" }).click();
    await expect(admin.getByText("公告已发布，学生和老师将在普通页面收到提醒。")).toBeVisible();
    const rows = await db.announcement.findMany({ where: { title: "E2E 公告一" } });
    expect(rows).toHaveLength(1); ids.push(rows[0].id);
    await refreshNotices(student);
    const first = student.getByRole("dialog", { name: "E2E 公告一", exact: true });
    await expect(first).toBeVisible();
    await student.keyboard.press("Escape");
    await expect(first).toBeVisible();
    expect(await student.evaluate(() => Object.hasOwn(window, "announcementUnsafe"))).toBe(false);
    await student.route("**/api/announcements/*/read", (route) => route.abort());
    await first.getByRole("button", { name: "我知道了" }).click();
    await expect(first.getByRole("alert")).toBeVisible();
    await expect(first.getByRole("button", { name: "我知道了" })).toBeEnabled();
    await student.setViewportSize({ width: 390, height: 844 });
    expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await first.locator('div[tabindex="0"]').evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await student.keyboard.press("Tab");
    expect(await first.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await mkdir(path.resolve("tmp/announcements-qa"), { recursive: true });
    await student.screenshot({ path: path.resolve("tmp/announcements-qa/mobile-notice.png") });
    await student.unroute("**/api/announcements/*/read");
    await first.getByRole("button", { name: "我知道了" }).click();
    await expect(first).toHaveCount(0);
    await student.reload();
    await expect(first).toHaveCount(0);
    await student.goto("/student/announcements");
    await expect(student.getByRole("link", { name: "E2E 公告一", exact: true })).toBeVisible();
    await expect(student.getByText("已读", { exact: true })).toBeVisible();
    const labels = await student.getByRole("navigation", { name: "主导航" }).getByRole("link").allTextContents();
    expect(labels[labels.findIndex((label) => label.trim() === "问题反馈") + 1].trim()).toBe("公告");
    await login(teacher, "e2e-teacher", "e2e-teacher-password", "teacher");
    await expect(teacher.getByRole("dialog", { name: "E2E 公告一", exact: true })).toBeVisible();
    await teacher.getByRole("button", { name: "我知道了" }).click();
    await teacher.goto("/teacher/announcements");
    await teacher.getByRole("link", { name: "E2E 公告一" }).click();
    await expect(teacher.getByText("已确认阅读")).toBeVisible();

    const publish = async (title: string) => {
      const response = await admin.request.post("/api/admin/announcements", { headers: { origin: new URL(admin.url()).origin }, data: { title, body: "公告正文", requestId: crypto.randomUUID() } });
      expect(response.ok()).toBe(true); const { id } = await response.json(); ids.push(id); return id as number;
    };
    // Pending task retains priority over a new announcement.
    const assignment = await db.learningAssignment.create({ data: { studentId: 6, createdById: 1, title: "公告排队测试任务",
      problems: { create: { problemId: 101, order: 1, problemTitle: "练习", problemCategory: "测试", problemDifficulty: "入门" } } } });
    await student.goto("/student");
    await expect(student.getByTestId("pending-assignment-reminder")).toBeVisible();
    await publish("E2E 公告二");
    await refreshNotices(student);
    await expect(student.getByRole("dialog", { name: "E2E 公告二" })).toHaveCount(0);
    await student.getByRole("button", { name: "去完成专项练习" }).click();
    await expect(student.getByRole("dialog", { name: "E2E 公告二" })).toBeVisible();
    await student.getByRole("button", { name: "我知道了" }).click();
    await db.learningAssignment.update({ where: { id: assignment.id }, data: { archivedAt: new Date() } });

    await student.evaluate(() => localStorage.setItem("oj-code-problem-112", "A"));
    await student.goto("/student/problems/112");
    await student.getByRole("button", { name: "提交答案", exact: true }).click();
    const reward = student.getByRole("dialog", { name: "通过奖励" });
    await expect(reward).toBeVisible();
    await publish("E2E 公告三");
    await refreshNotices(student);
    await expect(student.getByRole("dialog", { name: "E2E 公告三" })).toHaveCount(0);
    await reward.getByRole("button", { name: "稍后再说" }).click();
    await expect(student.getByRole("dialog", { name: "E2E 公告三" })).toBeVisible();
    await student.getByRole("button", { name: "我知道了" }).click();

    // Even on an ordinary page, a real in-progress exam suppresses notices.
    const record = await db.examRecord.create({ data: { userId: 6, examId: 201, status: "in_progress", startedAt: new Date() } });
    await publish("E2E 考试后公告");
    await refreshNotices(student);
    await expect(student.getByRole("dialog")).toHaveCount(0);
    await student.goto("/student/exams/201/take");
    await expect(student.getByRole("navigation", { name: "主导航" })).toHaveCount(0);
    await expect(student.getByRole("dialog", { name: "E2E 考试后公告" })).toHaveCount(0);
    await db.examRecord.update({ where: { id: record.id }, data: { status: "submitted", submittedAt: new Date() } });
    await student.goto("/student/announcements");
    await expect(student.getByRole("dialog", { name: "E2E 考试后公告" })).toBeVisible();
    await student.getByRole("button", { name: "我知道了" }).click();
    await admin.reload();
    const article = admin.locator("article").filter({ has: admin.getByRole("heading", { name: "E2E 公告一", exact: true }) });
    await article.getByRole("button", { name: "撤下公告", exact: true }).click();
    await article.getByRole("button", { name: "确认撤下" }).click();
    await expect(article.getByText("已撤下")).toBeVisible();
    await admin.screenshot({ path: path.resolve("tmp/announcements-qa/admin-history.png"), fullPage: true });
    await student.reload();
    await expect(student.getByRole("link", { name: "E2E 公告一", exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await db.announcement.updateMany({ where: { id: { in: ids } }, data: { withdrawnAt: new Date() } });
    await db.examRecord.updateMany({ where: { userId: 6 }, data: { status: "submitted" } });
    await db.$disconnect();
    await student.close(); await teacher.close(); await admin.close();
  }
});
