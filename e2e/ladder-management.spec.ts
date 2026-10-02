import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const origin = "http://127.0.0.1:3100";
const shots = path.resolve("tmp/ladder-management-preview");
async function login(page: Page, username = "e2e-admin", password = "e2e-admin-password") {
  const response = await page.request.post("/api/auth/login", { data: { username, password }, headers: { Origin: origin } }); expect(response.status()).toBe(200);
}
async function createStudent(api: APIRequestContext, username: string) {
  const response = await api.post("/api/admin/users", { data: { username, role: "student", password: "ladder-test-password", confirmPassword: "ladder-test-password" }, headers: { Origin: origin } });
  expect(response.ok()).toBe(true); const body = await response.json(); return body.user.id as number;
}
async function findStudent(page: Page, username: string) {
  await page.getByLabel("搜索学生", { exact: true }).fill(username);
  const response = page.waitForResponse((response) => response.url().includes("/api/admin/ladder/students?") && response.request().method() === "GET");
  await page.getByRole("button", { name: "搜索", exact: true }).click(); await response;
  const button = page.getByRole("button", { name: `调整 ${username} 的积分`, exact: true }); await expect(button).toBeEnabled(); await button.click();
}
async function savePoints(page: Page, mode: "add" | "deduct" | "set", points: string, reason: string) {
  await page.getByLabel("操作类型", { exact: true }).selectOption(mode);
  await page.getByLabel(mode === "set" ? "目标总积分" : mode === "deduct" ? "扣除积分" : "增加积分", { exact: true }).fill(points);
  await page.getByLabel("调分理由", { exact: true }).fill(reason);
  const response = page.waitForResponse((response) => response.url().includes("/adjustments") && response.request().method() === "POST");
  await page.getByRole("button", { name: "保存调分", exact: true }).click(); const result = await response; expect(result.ok()).toBe(true); await expect(page.locator(".ladder-management").getByRole("status")).toContainText("调分已保存");
}
async function assertWidthAndScreenshot(page: Page, view: string) {
  mkdirSync(shots, { recursive: true });
  for (const width of [320, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: path.join(shots, `${view}-${width}.png`), fullPage: true });
  }
}

test("admin adjustments retain private reasons, replay a lost response once, and support add/deduct/set", async ({ page, browser }) => {
  await login(page);
  const username = "积分回归_长用户名ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const studentId = await createStudent(page.request, username);
  const privateReason = "管理员私有理由：课堂挑战奖励与积分纠错";
  try {
    await page.goto("/admin/leaderboard");
    await page.getByRole("link", { name: "积分与段位设置", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/leaderboard\/settings$/);
    await findStudent(page, username);
    const url = `**/api/admin/ladder/students/${studentId}/adjustments`;
    let aborted = false;
    await page.route(url, async (route) => {
      if (!aborted) { aborted = true; const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort("failed"); }
      else await route.continue();
    });
    await page.getByLabel("增加积分", { exact: true }).fill("100"); await page.getByLabel("调分理由", { exact: true }).fill(privateReason);
    await page.getByRole("button", { name: "保存调分", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".ladder-management").getByRole("alert")).toContainText("结果尚未确认");
    await expect(page.getByLabel("增加积分", { exact: true })).toHaveValue("100");
    await expect(page.getByLabel("调分理由", { exact: true })).toHaveValue(privateReason);
    await page.getByRole("button", { name: "保存调分", exact: true }).click();
    await expect(page.locator(".ladder-management").getByRole("status")).toContainText("没有重复计分");
    await page.unroute(url);
    let history = await (await page.request.get(`/api/admin/ladder/adjustments?studentId=${studentId}`)).json(); expect(history.total).toBe(1);
    await expect(page.locator(`[data-student-id="${studentId}"]`)).toContainText("100");
    await savePoints(page, "set", "80", privateReason);
    history = await (await page.request.get(`/api/admin/ladder/adjustments?studentId=${studentId}`)).json(); expect(history.records[0]).toMatchObject({ mode: "set", amount: -20, beforePoints: 100, afterPoints: 80 });
    const tooMuch = await page.request.post(`/api/admin/ladder/students/${studentId}/adjustments`, { headers: { Origin: origin }, data: { mode: "deduct", inputPoints: 81, expectedPoints: 80, reason: privateReason, requestId: randomUUID() } }); expect(tooMuch.status()).toBe(400);
    await savePoints(page, "deduct", "80", privateReason); await expect(page.locator(`[data-student-id="${studentId}"]`)).toContainText("青铜学徒");
    await savePoints(page, "add", "100", privateReason);
    await assertWidthAndScreenshot(page, "students");
    await page.getByRole("button", { name: "调分记录", exact: true }).click();
    await page.getByLabel("搜索记录中的学生", { exact: true }).fill(username); await page.getByLabel("筛选操作类型", { exact: true }).selectOption("set"); await page.getByRole("button", { name: "筛选记录", exact: true }).click();
    await expect(page.getByRole("region", { name: "管理员调分记录", exact: true })).toContainText("100 → 80");
    await expect(page.getByRole("region", { name: "管理员调分记录", exact: true })).toContainText(privateReason);
    await assertWidthAndScreenshot(page, "records");
    const context = await browser.newContext(); const studentPage = await context.newPage();
    try {
      await login(studentPage, username, "ladder-test-password");
      await studentPage.goto("/student/leaderboard");
      await expect(studentPage.locator(".ladder-rule")).toHaveCount(0); await expect(studentPage.locator(".ladder-hero-subtitle")).toHaveCount(0);
      await expect(studentPage.locator(".ladder-hero")).not.toContainText("首次通过题数");
      await expect(studentPage.locator(".ladder-my-battle")).toContainText("100 积分");
      expect(await studentPage.content()).not.toContain(privateReason);
      const blocked = await studentPage.request.get(`/api/admin/ladder/adjustments?studentId=${studentId}`); expect(blocked.status()).toBe(403);
      const blockedWrite = await studentPage.request.post(`/api/admin/ladder/students/${studentId}/adjustments`, { headers: { Origin: origin }, data: { mode: "add", inputPoints: 1, expectedPoints: 100, reason: privateReason, requestId: randomUUID() } }); expect(blockedWrite.status()).toBe(403);
    } finally { await context.close(); }
  } finally { const removed = await page.request.delete(`/api/admin/users/${studentId}`, { headers: { Origin: origin } }); expect(removed.ok()).toBe(true); }
});

test("threshold changes synchronize all three roles and reject a stale second settings page", async ({ page, browser }) => {
  await login(page);
  const before = await (await page.request.get("/api/admin/ladder/settings")).json();
  const studentId = await createStudent(page.request, "ladder-tier-student");
  const added = await page.request.post(`/api/admin/ladder/students/${studentId}/adjustments`, { headers: { Origin: origin }, data: { mode: "add", inputPoints: 50, expectedPoints: 0, reason: "private-tier-reason", requestId: randomUUID() } }); expect(added.ok()).toBe(true);
  const second = await browser.newContext(); const secondPage = await second.newPage();
  try {
    await login(secondPage);
    for (const target of [page, secondPage]) { await target.goto("/admin/leaderboard/settings"); await target.getByRole("button", { name: "段位门槛", exact: true }).click(); }
    await page.getByLabel("白银新秀最低积分", { exact: true }).fill("30");
    await page.getByRole("button", { name: "保存段位门槛", exact: true }).click(); await expect(page.locator(".ladder-management").getByRole("status")).toContainText("段位门槛已保存");
    await secondPage.getByLabel("白银新秀最低积分", { exact: true }).fill("40");
    await secondPage.getByRole("button", { name: "保存段位门槛", exact: true }).click(); await expect(secondPage.locator(".ladder-management").getByRole("alert")).toContainText("其他页面更新");
    await expect(secondPage.getByLabel("白银新秀最低积分", { exact: true })).toHaveValue("40"); await expect(secondPage.getByRole("button", { name: "保存段位门槛", exact: true })).toBeDisabled();
    await secondPage.getByRole("button", { name: "重新加载门槛", exact: true }).click(); await expect(secondPage.getByLabel("白银新秀最低积分", { exact: true })).toHaveValue("30");
    await secondPage.getByLabel("白银新秀最低积分", { exact: true }).fill("40"); await secondPage.getByRole("button", { name: "保存段位门槛", exact: true }).click(); await expect(secondPage.locator(".ladder-management").getByRole("status")).toContainText("段位门槛已保存");
    await assertWidthAndScreenshot(secondPage, "tiers");
    for (const role of ["student", "teacher", "admin"] as const) {
      const context = await browser.newContext(); const target = await context.newPage();
      try {
        await login(target, role === "student" ? "ladder-tier-student" : `e2e-${role}`, role === "student" ? "ladder-test-password" : `e2e-${role}-password`);
        await target.goto(`/${role}/leaderboard`);
        const rank = target.locator(`[data-ranking-user-id="${studentId}"]`).filter({ visible: true }); await expect(rank).toContainText("白银新秀"); await expect(rank).toContainText("50");
        await expect(target.locator(".rank-path-step").filter({ hasText: "白银新秀" })).toContainText("40+");
        if (role === "student") {
          await expect(target.locator(".ladder-rule")).toHaveCount(0); await expect(target.locator(".ladder-my-battle")).toContainText("还差 80 积分晋级");
          await target.goto("/student"); await expect(target.locator(".training-rank-copy")).toContainText("白银新秀"); await expect(target.locator(".identity-chip")).toContainText("白银新秀");
          expect(await target.content()).not.toContain("private-tier-reason");
        }
        if (role !== "admin") {
          await expect(target.getByRole("link", { name: "积分与段位设置", exact: true })).toHaveCount(0);
          for (const endpoint of ["settings", "students", "adjustments"]) expect((await target.request.get(`/api/admin/ladder/${endpoint}`)).status()).toBe(403);
          const forbidden = await target.request.put("/api/admin/ladder/settings", { headers: { Origin: origin }, data: { revision: "0", minPoints: [0, 1, 2, 3, 4, 5, 6, 7] } }); expect(forbidden.status()).toBe(403);
        }
      } finally { await context.close(); }
    }
  } finally {
    const latest = await (await page.request.get("/api/admin/ladder/settings")).json();
    const restored = await page.request.put("/api/admin/ladder/settings", { headers: { Origin: origin }, data: { revision: latest.revision, minPoints: before.tiers.map((tier: { minPoints: number }) => tier.minPoints) } }); expect(restored.ok()).toBe(true);
    const removed = await page.request.delete(`/api/admin/users/${studentId}`, { headers: { Origin: origin } }); expect(removed.ok()).toBe(true); await second.close();
  }
});
