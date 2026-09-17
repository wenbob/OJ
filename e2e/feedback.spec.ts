import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import path from "node:path";
import { mkdir } from "node:fs/promises";

async function login(page: Page, role: "student" | "teacher" | "admin") {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(`e2e-${role}`);
  await page.getByLabel("密码").fill(`e2e-${role}-password`);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${role}$`));
}

async function checkMenu(page: Page) {
  const labels = await page.getByRole("navigation", { name: "主导航" }).getByRole("link").allTextContents();
  const index = labels.findIndex((label) => label.trim() === "天梯榜");
  expect(index).toBeGreaterThanOrEqual(0);
  expect(labels[index + 1].trim()).toBe("问题反馈");
  await page.getByRole("link", { name: "问题反馈", exact: true }).click();
  await expect(page.getByRole("heading", { name: "问题反馈", exact: true })).toBeVisible();
}

async function screenshot(page: Page, name: string) {
  const directory = path.resolve("tmp/feedback-qa");
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true });
}

test("feedback lifecycle, role privacy and responsive navigation", async ({ browser }) => {
  const studentContext = await browser.newContext();
  const teacherContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const adminContext = await browser.newContext();
  const student = await studentContext.newPage();
  const teacher = await teacherContext.newPage();
  const admin = await adminContext.newPage();
  const pageErrors: string[] = [];
  [student, teacher, admin].forEach((page) => page.on("pageerror", (error) => pageErrors.push(error.message)));
  try {
    await login(student, "student");
    await checkMenu(student);
    await screenshot(student, "student-form-desktop");
    const image = await sharp({ create: { width: 320, height: 160, channels: 3, background: "#b66b41" } }).png().toBuffer();
    await student.getByLabel("标题", { exact: true }).fill("E2E 学生页面反馈");
    await student.getByLabel("问题描述", { exact: true }).fill("<script>window.feedbackXss = true</script>\n点击按钮后没有响应。");
    await student.getByLabel("截图（可选）").setInputFiles([
      { name: "first.png", mimeType: "image/png", buffer: image },
      { name: "second.png", mimeType: "image/png", buffer: image },
    ]);
    await expect(student.getByAltText("待上传截图 2")).toBeVisible();
    await student.getByRole("button", { name: "移除截图 2" }).click();
    await expect(student.getByAltText("待上传截图 2")).toHaveCount(0);
    // An interrupted request must keep text/images and re-enable the form.
    await student.route("**/api/feedback", async (route) => {
      if (route.request().method() === "POST") await route.abort("failed");
      else await route.continue();
    });
    await student.getByRole("button", { name: "提交反馈", exact: true }).click();
    await expect(student.getByRole("alert").filter({ hasText: "内容已保留" })).toBeVisible();
    await expect(student.getByLabel("标题", { exact: true })).toHaveValue("E2E 学生页面反馈");
    await expect(student.getByAltText("待上传截图 1")).toBeVisible();
    await student.unroute("**/api/feedback");
    await student.getByRole("button", { name: "提交反馈", exact: true }).click();
    await expect(student).toHaveURL(/\/student\/feedback\/\d+$/);
    const studentId = Number(new URL(student.url()).pathname.split("/").at(-1));
    await expect(student.getByRole("heading", { name: "E2E 学生页面反馈" })).toBeVisible();
    const imageUrl = await student.getByAltText("反馈截图 1").getAttribute("src");
    expect(imageUrl).toContain(`/api/feedback/${studentId}/attachments/`);
    expect(imageUrl).not.toContain("_next/image");
    const privateImage = await student.request.get(imageUrl!);
    expect(privateImage.status()).toBe(200);
    expect(privateImage.headers()["cache-control"]).toBe("private, no-store");
    expect(await student.evaluate(() => "feedbackXss" in window)).toBe(false);

    await login(teacher, "teacher");
    await checkMenu(teacher);
    await expect(teacher.getByRole("link", { name: /E2E 已处理的老师反馈/ })).toBeVisible();
    await expect(teacher.getByRole("link", { name: /E2E 学生页面反馈/ })).toHaveCount(0);
    expect((await teacher.request.get(`/api/feedback/${studentId}`)).status()).toBe(404);
    expect((await teacher.request.get(imageUrl!)).status()).toBe(404);
    expect((await teacher.request.get("/api/admin/feedback")).status()).toBe(403);
    await teacher.getByLabel("标题", { exact: true }).fill("E2E 老师页面反馈");
    await teacher.getByLabel("问题描述", { exact: true }).fill("手机页面上的操作建议。");
    await teacher.getByLabel("截图（可选）").setInputFiles({ name: "mobile.png", mimeType: "image/png", buffer: image });
    expect(await teacher.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await screenshot(teacher, "teacher-form-mobile");
    await teacher.getByRole("button", { name: "提交反馈", exact: true }).click();
    await expect(teacher).toHaveURL(/\/teacher\/feedback\/\d+$/);
    const teacherId = Number(new URL(teacher.url()).pathname.split("/").at(-1));
    expect((await student.request.get(`/api/feedback/${teacherId}`)).status()).toBe(404);
    await student.goto(`/student/feedback/${teacherId}`);
    await expect(student.getByRole("heading", { name: "E2E 老师页面反馈" })).toHaveCount(0);
    await student.goto(`/student/feedback/${studentId}`);

    await login(admin, "admin");
    await checkMenu(admin);
    await expect(admin.getByRole("link", { name: /E2E 学生页面反馈/ })).toBeVisible();
    await expect(admin.getByRole("link", { name: /E2E 老师页面反馈/ })).toBeVisible();
    await expect(admin.getByRole("link", { name: /E2E 已处理的老师反馈/ })).toHaveCount(0);
    await screenshot(admin, "admin-list-desktop");
    await admin.getByRole("link", { name: /E2E 学生页面反馈/ }).click();
    await admin.getByLabel("管理员回复", { exact: true }).fill("已记录，刷新页面即可恢复。");
    await admin.route("**/api/admin/feedback/*/replies", (route) => route.fulfill({ status: 500, contentType: "text/plain", body: "not-json" }));
    await admin.getByRole("button", { name: "回复并标记已处理" }).click();
    await expect(admin.getByRole("alert").filter({ hasText: "填写内容已保留" })).toBeVisible();
    await expect(admin.getByLabel("管理员回复", { exact: true })).toHaveValue("已记录，刷新页面即可恢复。");
    await admin.unroute("**/api/admin/feedback/*/replies");
    await admin.getByRole("button", { name: "回复并标记已处理" }).click();
    await expect(admin.getByRole("region", { name: "回复记录" }).getByText("已记录，刷新页面即可恢复。", { exact: true })).toBeVisible();
    await expect(admin.getByRole("button", { name: "重新打开" })).toBeEnabled();
    await admin.getByRole("button", { name: "重新打开" }).click();
    await expect(admin.getByRole("button", { name: "仅标记已处理" })).toBeEnabled();
    await admin.getByLabel("管理员回复", { exact: true }).fill("补充说明：不会影响历史提交。");
    await admin.getByRole("button", { name: "回复并标记已处理" }).click();
    await expect(admin.getByRole("region", { name: "回复记录" }).getByText("补充说明：不会影响历史提交。", { exact: true })).toBeVisible();
    await expect(admin.getByRole("button", { name: "重新打开" })).toBeEnabled();
    await screenshot(admin, "admin-detail-desktop");
    await student.reload();
    await expect(student.getByText("已记录，刷新页面即可恢复。", { exact: true })).toBeVisible();
    await expect(student.getByText("补充说明：不会影响历史提交。", { exact: true })).toBeVisible();
    await expect(student.getByText("已处理", { exact: true })).toBeVisible();
    await expect(student.getByRole("heading", { name: "处理反馈", exact: true })).toHaveCount(0);
    await student.setViewportSize({ width: 390, height: 844 });
    expect(await student.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await screenshot(student, "student-detail-mobile");

    await admin.goto("/admin/feedback");
    await admin.getByLabel("处理状态", { exact: true }).selectOption("all");
    await admin.getByLabel("提交人角色", { exact: true }).selectOption("teacher");
    await admin.getByLabel("搜索", { exact: true }).fill("E2E 老师页面反馈");
    await admin.getByRole("button", { name: "筛选", exact: true }).click();
    await expect(admin.getByRole("link", { name: /E2E 老师页面反馈/ })).toBeVisible();
    await expect(admin.getByRole("link", { name: /E2E 学生页面反馈/ })).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  } finally {
    await studentContext.close(); await teacherContext.close(); await adminContext.close();
  }
});
