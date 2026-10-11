import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const databaseUrl = `file:${path.resolve("prisma/e2e.db").replaceAll("\\", "/")}`;
const category = `后台筛选回归 ${process.pid}`;
const password = "e2e-staff-library-password";
const users = { teacher: { id: 0, username: `e2e-library-teacher-${process.pid}` }, admin: { id: 0, username: `e2e-library-admin-${process.pid}` } };
const fixture = { teacherAccepted: 0, adminAccepted: 0, never: 0, digits: 0, objective: 0 };

test.beforeAll(async () => {
  expect(databaseUrl).toMatch(/\/prisma\/e2e\.db$/);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const passwordHash = await hash(password, 10);
    for (const role of ["teacher", "admin"] as const) users[role].id = (await db.user.create({ data: { username: users[role].username, role, passwordHash } })).id;
    const common = { category, description: "后台筛选验证。", inputDescription: "整数。", outputDescription: "整数。", sampleInput: "1", sampleOutput: "1", difficulty: "基础" };
    fixture.never = (await db.problem.create({ data: { ...common, title: "后台筛选 从未作答", sortOrder: 1 } })).id;
    fixture.digits = (await db.problem.create({ data: { ...common, title: `后台筛选 标题数字 ${fixture.never}`, difficulty: "进阶", sortOrder: 4 } })).id;
    fixture.teacherAccepted = (await db.problem.create({ data: { ...common, title: "后台筛选 老师通过", sortOrder: 3 } })).id;
    fixture.adminAccepted = (await db.problem.create({ data: { ...common, title: "后台筛选 管理员通过", sortOrder: 2, testCases: { create: [{ input: "1", output: "1", isSample: true }, { input: "2", output: "2", isSample: true }] } } })).id;
    fixture.objective = (await db.problem.create({ data: { ...common, title: "后台筛选 选择判断", problemType: "objective", objectiveItems: JSON.stringify([{ kind: "choice", stem: "选择 A。", options: [{ label: "A", text: "A" }, { label: "B", text: "B" }], answer: "A", score: 10 }]) } })).id;
    await db.problem.create({ data: { ...common, title: "后台筛选 已下架", difficulty: "后台下架独占难度", archivedAt: new Date() } });
    const exam = await db.exam.create({ data: { title: "后台筛选 历史考试", createdById: users.teacher.id, status: "ended" } });
    for (const role of ["teacher", "admin"] as const) {
      const problemId = role === "teacher" ? fixture.teacherAccepted : fixture.adminAccepted;
      for (const status of ["Accepted", "Wrong Answer"]) await db.submission.create({ data: { userId: users[role].id, problemId, examId: exam.id, submissionType: "exam", code: "// isolated fixture", language: "C++17", status, totalCount: 1, passedCount: status === "Accepted" ? 1 : 0 } });
      await db.submission.create({ data: { userId: users[role].id, problemId: fixture.objective, code: "A", language: "objective", status: "Accepted", totalCount: 1, passedCount: 1 } });
    }
  } finally { await db.$disconnect(); }
});

async function login(page: Page, role: "teacher" | "admin") {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(users[role].username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${role}$`));
}

function listPath(role: "teacher" | "admin", extra: Record<string, string> = {}, management = false) {
  return `/${role}/${management ? "problems" : "practice"}?${new URLSearchParams({ problemType: "programming", category, ...extra })}`;
}

async function capture(page: Page, name: string) {
  const directory = process.env.OJ_UI_SCREENSHOT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true });
}

for (const role of ["teacher", "admin"] as const) test(`${role} practice filters use own history and preserve paging and return links`, async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page, role);
  await page.goto(listPath(role, { q: String(fixture.never), pageSize: "1" }));
  await expect(page.getByText("共 2 道题 · 当前 1 道", { exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: `#${fixture.digits}` })).toBeVisible();
  await page.getByRole("link", { name: "下一页", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: `#${fixture.never}` })).toBeVisible();
  const previous = page.url();
  await page.getByRole("row").filter({ hasText: `#${fixture.never}` }).locator("[data-problem-entry-link]").click();
  await page.getByRole("link", { name: "返回题库", exact: true }).click();
  await expect(page).toHaveURL(previous);
  await page.getByRole("searchbox", { name: "题名 / 题号" }).fill("后台筛选");
  await page.getByRole("searchbox", { name: "题名 / 题号" }).press("Enter");
  await expect(page.getByText("共 4 道题 · 当前 1 道", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await page.getByRole("combobox", { name: "难度", exact: true }).selectOption("基础");
  await expect(page.getByText("共 3 道题 · 当前 1 道", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "通过状态", exact: true }).selectOption("accepted");
  const ownId = role === "teacher" ? fixture.teacherAccepted : fixture.adminAccepted;
  await expect(page.getByRole("row").filter({ hasText: `#${ownId}` })).toContainText("已通过");
  await expect(page.getByText("共 1 道题 · 当前 1 道", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "通过状态", exact: true })).toHaveValue("accepted");
  await page.getByRole("combobox", { name: "通过状态", exact: true }).selectOption("unaccepted");
  await expect(page.getByText("共 2 道题 · 当前 1 道", { exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: `#${ownId}` })).toHaveCount(0);
  expect(await page.getByRole("combobox", { name: "难度", exact: true }).textContent()).not.toContain("后台下架独占难度");
  await page.getByRole("combobox", { name: "通过状态", exact: true }).selectOption("accepted");
  await expect(page.getByText("共 1 道题 · 当前 1 道", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "选择判断题", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: `#${fixture.objective}` })).toBeVisible();
  const query = new URL(page.url()).searchParams;
  expect(query.get("q")).toBe("后台筛选");
  expect(query.get("completion")).toBe("accepted");
  expect(query.has("category")).toBe(false);
  expect(query.has("difficulty")).toBe(false);
  await page.getByRole("searchbox", { name: "题名 / 题号" }).fill("不存在的后台题名");
  await page.getByRole("searchbox", { name: "题名 / 题号" }).press("Enter");
  await expect(page.getByText("没有找到符合条件的题目", { exact: true })).toBeVisible();
  await page.getByRole("form", { name: "题库搜索和筛选" }).getByRole("link", { name: "清空筛选", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "题名 / 题号" })).toHaveValue("");
  expect(new URL(page.url()).searchParams.get("problemType")).toBe("objective");
  if (role === "teacher") expect((await page.request.get("/api/admin/problems?q=后台筛选")).status()).toBe(403);
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await capture(page, `${role}-library-${width}`);
  }
  expect(errors).toEqual([]);
});

test("admin management combines filters with paging and preview sort while preserving edits", async ({ page }) => {
  await login(page, "admin");
  await page.goto(listPath("admin", { q: "后台筛选", pageSize: "1" }, true));
  await expect(page.getByText("共 4 道题 · 当前 1 道", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^下移题目/ })).toBeDisabled();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByText("第 2 / 4 页", { exact: false })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("q")).toBe("后台筛选");
  await page.getByRole("combobox", { name: "通过状态", exact: true }).selectOption("accepted");
  await expect(page.getByRole("row").filter({ hasText: `题号 #${fixture.adminAccepted}` })).toBeVisible();
  await expect(page.getByText("共 1 道题 · 当前 1 道", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await page.getByRole("combobox", { name: "管理员查看排序", exact: true }).selectOption("title-asc");
  await expect(page.getByRole("button", { name: "保存当前题序", exact: true })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "正在更新题目列表" })).toHaveCount(0);
  const filteredUrl = page.url();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "管理员查看排序", exact: true })).toHaveValue("title-asc");
  await expect(page).toHaveURL(filteredUrl);
  const response = await page.request.get(`/api/admin/problems${new URL(page.url()).search}`);
  const data = await response.json();
  expect(data.total).toBe(1);
  expect(data.items.map((item: { id: number }) => item.id)).toEqual([fixture.adminAccepted]);
  expect(data.items[0]).toMatchObject({ canMoveUp: false, canMoveDown: false });
  await page.getByRole("row").filter({ hasText: `题号 #${fixture.adminAccepted}` }).getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.getByLabel("标题", { exact: true })).toHaveValue("后台筛选 管理员通过");
  await page.getByLabel("标题", { exact: true }).fill("未保存的编辑内容");
  await page.getByRole("searchbox", { name: "题名 / 题号" }).fill("没有此题");
  await page.getByRole("searchbox", { name: "题名 / 题号" }).press("Enter");
  await expect(page.getByText("没有找到符合条件的题目", { exact: true })).toBeVisible();
  await expect(page.getByLabel("标题", { exact: true })).toHaveValue("未保存的编辑内容");
  await page.getByRole("searchbox", { name: "题名 / 题号" }).fill("后台筛选");
  await page.getByRole("searchbox", { name: "题名 / 题号" }).press("Enter");
  await expect(page.getByText("共 1 道题 · 当前 1 道", { exact: true })).toBeVisible();
  await page.getByLabel("标题", { exact: true }).fill("后台筛选 管理员通过 已编辑");
  await page.getByRole("button", { name: "保存题目", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "后台筛选 管理员通过 已编辑" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "通过状态", exact: true })).toHaveValue("accepted");
  await page.getByRole("button", { name: "清空筛选", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存当前题序", exact: true })).toBeEnabled();
  await expect(page.getByRole("searchbox", { name: "题名 / 题号" })).toHaveValue("");
  await page.setViewportSize({ width: 320, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, "admin-management-320");
});

test("admin filter failure retains a visible error and recovers on retry", async ({ page }) => {
  await login(page, "admin");
  await page.goto(listPath("admin", { q: "后台筛选" }, true));
  await page.route("**/api/admin/problems?**", route => route.fulfill({ status: 503, json: { error: "暂时无法读取题库" } }));
  await page.getByRole("searchbox", { name: "题名 / 题号" }).fill(String(fixture.never));
  await page.getByRole("searchbox", { name: "题名 / 题号" }).press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "当前仍显示上次结果" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "正在更新题目列表" })).toHaveCount(0);
  await page.unroute("**/api/admin/problems?**");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByText("共 2 道题 · 当前 2 道", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "当前仍显示上次结果" })).toHaveCount(0);
});
