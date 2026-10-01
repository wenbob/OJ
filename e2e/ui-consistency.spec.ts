import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { expect, test, type Locator, type Page } from "@playwright/test";
const e2eDatabaseUrl = `file:${path.resolve("prisma/e2e.db").replaceAll("\\", "/")}`;

type Role = "student" | "teacher" | "admin";
const category = "UI 一致性回归";
const title = "UI 整块点击题";
const acceptedTitle = "UI 已通过题";
const longTitle = `UI 长标题与换行 ${"题目描述与边界测试".repeat(9)} ${"LongProblemTitle".repeat(9)}`;
const password = "e2e-ui-password";
const users = {
  student: { id: 0, name: "e2e-ui-student", password },
  teacher: { id: 0, name: "e2e-ui-teacher", password },
  admin: { id: 1, name: "e2e-admin", password: "e2e-admin-password" },
};
const fixture = { problemId: 0, acceptedId: 0, longId: 0, objectiveId: 0, failedSubmissionId: 0, assignmentId: 0, examId: 0, acceptedSubmissions: {} as Record<Role, number> };

test.beforeAll(async () => {
  // Only the existing disposable browser-test database is writable here.
  expect(e2eDatabaseUrl).toMatch(/\/prisma\/e2e\.db$/);
  const db = new PrismaClient({ datasources: { db: { url: e2eDatabaseUrl } } });
  try {
    for (const role of ["student", "teacher"] as const) {
      const user = await db.user.upsert({ where: { username: users[role].name }, create: { username: users[role].name, passwordHash: await hash(password, 10), role }, update: {} });
      users[role].id = user.id;
    }
    const common = { description: "读取两个整数，输出它们的和。", inputDescription: "两个整数。", outputDescription: "输出它们的和。", sampleInput: "1 2", sampleOutput: "3", difficulty: "入门", category, problemType: "programming" };
    const programmingProblem = async (problemTitle: string) => (await db.problem.findFirst({ where: { title: problemTitle, category } })) ?? await db.problem.create({ data: { ...common, title: problemTitle } });
    fixture.problemId = (await programmingProblem(title)).id;
    fixture.acceptedId = (await programmingProblem(acceptedTitle)).id;
    fixture.longId = (await programmingProblem(longTitle)).id;
    fixture.objectiveId = ((await db.problem.findFirst({ where: { title: "UI 选择判断题", category } })) ?? await db.problem.create({ data: { ...common, title: "UI 选择判断题", problemType: "objective", objectiveItems: JSON.stringify([{ kind: "choice", stem: "哪个选项是 A？", answer: "A", score: 10, options: [{ label: "A", text: "A" }, { label: "B", text: "B" }] }]) } })).id;
    fixture.failedSubmissionId = ((await db.submission.findFirst({ where: { userId: users.student.id, problemId: fixture.problemId, status: "Wrong Answer" } })) ?? await db.submission.create({ data: { userId: users.student.id, problemId: fixture.problemId, code: "// UI saved code\nint main() { return 0; }", language: "C++17", status: "Wrong Answer", totalCount: 1 } })).id;
    for (const role of ["student", "teacher", "admin"] as const) {
      fixture.acceptedSubmissions[role] = ((await db.submission.findFirst({ where: { userId: users[role].id, problemId: fixture.acceptedId, status: "Accepted" }, orderBy: { id: "desc" } })) ?? await db.submission.create({ data: { userId: users[role].id, problemId: fixture.acceptedId, code: "int main() { return 0; }", language: "C++17", status: "Accepted", totalCount: 1, passedCount: 1 } })).id;
    }
    fixture.assignmentId = ((await db.learningAssignment.findFirst({ where: { studentId: users.student.id, title: "UI 专项题单" } })) ?? await db.learningAssignment.create({ data: { studentId: users.student.id, createdById: users.teacher.id, title: "UI 专项题单", problems: { create: { problemId: fixture.acceptedId, problemTitle: acceptedTitle, problemCategory: category, problemDifficulty: "入门", completedAt: new Date() } } } })).id;
    fixture.examId = ((await db.exam.findFirst({ where: { title: "UI 后台考试练习", createdById: users.teacher.id } })) ?? await db.exam.create({ data: { title: "UI 后台考试练习", createdById: users.teacher.id, problems: { create: [fixture.problemId, fixture.acceptedId].map((problemId, order) => ({ problemId, order, score: 100 })) } } })).id;
    const announcements = await db.announcement.findMany({ select: { id: true } });
    for (const announcement of announcements) for (const user of Object.values(users)) {
      await db.announcementRead.upsert({ where: { announcementId_userId: { announcementId: announcement.id, userId: user.id } }, create: { announcementId: announcement.id, userId: user.id }, update: {} });
    }
  } finally { await db.$disconnect(); }
});

async function login(page: Page, role: Role) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("用户名").fill(users[role].name);
  await page.getByLabel("密码").fill(users[role].password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${role}$`));
}

function listPath(role: Role) {
  return `/${role}/${role === "student" ? "problems" : "practice"}?problemType=programming&category=${encodeURIComponent(category)}`;
}

function detailPath(role: Role, id = fixture.problemId) {
  return `/${role}/${role === "student" ? "problems" : "practice/problems"}/${id}`;
}

async function expectNoOverflow(page: Page) {
  try {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: `Horizontal overflow at ${page.url()}` }).toBe(true);
    const logout = page.locator("[data-app-shell-header]").getByRole("button", { name: "退出", exact: true });
    if (await logout.count()) {
      await expect.poll(() => logout.evaluate(el => {
        const box = el.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth;
      }), { message: `Clipped logout button at ${page.url()}` }).toBe(true);
    }
  } catch (error) {
    const details = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, elements: [...document.querySelectorAll<HTMLElement>("body *")].filter(el => {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.right <= innerWidth + 1) return false;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) if (["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(parent).overflowX) && parent.getBoundingClientRect().right <= innerWidth + 1) return false;
      return true;
    }).slice(0, 12).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width })) }));
    console.log("UI_OVERFLOW", page.url(), JSON.stringify(details));
    const directory = path.resolve("tmp/ui-unification-failures");
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, "overflow.png"), fullPage: true });
    throw error;
  }
}

async function waitForEditor(page: Page) {
  await expect(page.getByRole("textbox", { name: "Editor content", exact: true })).toBeVisible({ timeout: 30_000 });
}

async function capture(page: Page, name: string) {
  const directory = process.env.OJ_UI_SCREENSHOT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  if (await page.getByRole("button", { name: "减小代码字号", exact: true }).count()) await waitForEditor(page);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.mouse.move(2, 2);
  const hideDevTools = await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  try {
    await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true });
  } finally { await hideDevTools.evaluate(el => { el.parentNode?.removeChild(el); }); }
}

async function clickInsideRow(row: Locator, cell: number, blank = false) {
  const rowBox = await row.boundingBox();
  const cellBox = await row.locator("td").nth(cell).boundingBox();
  expect(rowBox).not.toBeNull();
  expect(cellBox).not.toBeNull();
  // Target the row, so a stretched native link may receive the actual pointer event.
  await row.click({ position: { x: cellBox!.x - rowBox!.x + (blank ? 6 : cellBox!.width / 2), y: blank ? 6 : rowBox!.height / 2 } });
}

test("all roles share filters and support whole-row, keyboard and new-tab navigation", async ({ browser }) => {
  test.setTimeout(180_000);
  const filterStyles: unknown[] = [];
  for (const role of ["student", "teacher", "admin"] as const) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await login(page, role);
      for (const [cell, blank] of [[0, false], [1, false], [2, false], [3, true], [4, true]] as const) {
        await page.goto(listPath(role));
        const row = page.getByRole("row").filter({ hasText: title });
        await row.hover();
        await expect.poll(() => row.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgba(79, 111, 136, 0.12)");
        await clickInsideRow(row, cell, blank);
        await expect(page).toHaveURL(new RegExp(`${detailPath(role)}$`));
        await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      }
      await page.goto(listPath(role));
      const activeFilter = page.getByRole("link", { name: category, exact: true });
      await expect(activeFilter).toHaveAttribute("aria-current", "page");
      filterStyles.push(await activeFilter.evaluate(el => {
        const style = getComputedStyle(el);
        return [style.backgroundColor, style.color, style.borderRadius, style.fontSize, style.padding];
      }));
      const acceptedRow = page.getByRole("row").filter({ hasText: acceptedTitle });
      await acceptedRow.hover();
      await expect.poll(() => acceptedRow.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgba(209, 250, 229, 0.7)");
      await capture(page, `${role}-practice-desktop`);

      const mainLink = page.getByRole("row").filter({ hasText: title }).locator("[data-problem-entry-link]");
      await mainLink.focus();
      await mainLink.press("Enter");
      await expect(page).toHaveURL(new RegExp(`${detailPath(role)}$`));
      await page.goto(listPath(role));
      const [tab] = await Promise.all([context.waitForEvent("page"), mainLink.click({ modifiers: ["Control"] })]);
      await expect(tab).toHaveURL(new RegExp(`${detailPath(role)}$`));
      await tab.close();

      if (role !== "student") {
        await acceptedRow.getByRole("link", { name: /查看通过代码/ }).click();
        await expect(page).toHaveURL(new RegExp(`/${role}/submissions/${fixture.acceptedSubmissions[role]}$`));
        await page.goto(listPath(role));
        await page.getByRole("row").filter({ hasText: title }).getByRole("link", { name: /^\d+$/ }).click();
        await expect(page).toHaveURL(new RegExp(`/${role}/submissions\\?problemId=${fixture.problemId}$`));
      }
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
  expect(filterStyles[1]).toEqual(filterStyles[0]);
  expect(filterStyles[2]).toEqual(filterStyles[0]);
});

test("role lists, long problem details and empty states fit four viewport widths", async ({ browser }) => {
  test.setTimeout(180_000);
  for (const role of ["student", "teacher", "admin"] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await login(page, role);
      for (const width of [320, 768, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(listPath(role));
        await expect(page.getByRole("link", { name: category, exact: true })).toBeVisible();
        await expectNoOverflow(page);
        if (width === 320) await capture(page, `${role}-practice-mobile`);
        await page.goto(detailPath(role, fixture.longId));
        await expect(page.getByRole("heading", { name: longTitle, exact: true })).toBeVisible();
        await waitForEditor(page);
        await expectNoOverflow(page);
        if (width === 1280) await capture(page, `${role}-problem-detail`);
      }
      await page.goto(`${listPath(role)}&pageSize=1`);
      await expect(page.locator("tbody tr")).toHaveCount(1);
      await page.getByRole("link", { name: "下一页", exact: true }).click();
      await expect(page).toHaveURL(/page=2&pageSize=1$/);
      await expect(page.getByRole("link", { name: category, exact: true })).toHaveAttribute("aria-current", "page");
      await page.getByRole("link", { name: "上一页", exact: true }).click();
      await expect(page).toHaveURL(/page=1&pageSize=1$/);
      await page.goto(listPath(role).replace(encodeURIComponent(category), encodeURIComponent("UI 空分类")));
      await expect(page.getByRole("heading", { name: "当前分类下还没有题目" })).toBeVisible();
      await page.getByRole("link", { name: "查看全部分类" }).click();
      await expect(page).not.toHaveURL(/category=/);
      await page.getByRole("link", { name: "选择判断题", exact: true }).click();
      await expect(page).toHaveURL(/problemType=objective/);
      await expect(page.getByRole("row").filter({ hasText: "UI 选择判断题" })).toBeVisible();
      await clickInsideRow(page.getByRole("row").filter({ hasText: "UI 选择判断题" }), 1);
      await expect(page).toHaveURL(new RegExp(`${detailPath(role, fixture.objectiveId)}$`));
      await expect(page.getByRole("heading", { name: "UI 选择判断题", exact: true })).toBeVisible();
    } finally { await context.close(); }
  }
});

test("review, assignment and staff exam cards retain their context and secondary actions", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await login(page, "student");
    const reviewPath = `/student/review?category=${encodeURIComponent(category)}`;
    await page.goto(reviewPath);
    const card = page.locator("article.problem-entry").filter({ hasText: title });
    await card.click({ position: { x: 8, y: 8 } });
    await expect(page).toHaveURL(new RegExp(`/student/problems/${fixture.problemId}\\?fromSubmission=${fixture.failedSubmissionId}$`));
    await page.goto(reviewPath);
    await card.getByRole("link", { name: "查看最近提交" }).click();
    await expect(page).toHaveURL(new RegExp(`/student/submissions/${fixture.failedSubmissionId}$`));
    await page.goto(reviewPath);
    await capture(page, "student-review");
    await page.goto(`/student/assignments/${fixture.assignmentId}`);
    await page.getByRole("link", { name: new RegExp(acceptedTitle) }).click({ position: { x: 8, y: 8 } });
    await expect(page).toHaveURL(new RegExp(`/student/problems/${fixture.acceptedId}\\?assignment=${fixture.assignmentId}$`));
    for (const role of ["teacher", "admin"] as const) {
      await login(page, role);
      await page.goto(`/${role}/exams/${fixture.examId}/practice`);
      const acceptedCard = page.locator("aside .problem-entry").filter({ hasText: acceptedTitle });
      await acceptedCard.click({ position: { x: 6, y: 6 } });
      await expect(page).toHaveURL(new RegExp(`problemId=${fixture.acceptedId}$`));
      await acceptedCard.getByRole("link", { name: /查看通过代码/ }).click();
      await expect(page).toHaveURL(new RegExp(`/${role}/submissions/${fixture.acceptedSubmissions[role]}$`));
      await page.goto(`/${role}/exams/${fixture.examId}/practice`);
      await waitForEditor(page);
      await expectNoOverflow(page);
      await capture(page, `${role}-exam-practice`);
    }
  } finally { await context.close(); }
});

test("category buttons, common pages and touch feedback keep their original actions", async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await login(page, "admin");
    await page.goto("/admin/problems");
    const categoryButton = page.getByRole("button", { name: category, exact: true });
    await categoryButton.click();
    await expect(categoryButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: title });
    const url = page.url();
    await row.getByRole("checkbox").check();
    await expect(row.getByRole("checkbox")).toBeChecked();
    expect(page.url()).toBe(url);
    await row.getByRole("checkbox").uncheck();

    for (const role of ["student", "teacher", "admin"] as const) {
      await login(page, role);
      const pages = role === "student" ? ["submissions", "exam-submissions", "exams", "assignments", "leaderboard", "rewards", "announcements", "feedback"] : ["submissions", "exam-submissions", "exams", "assignments", "leaderboard", "learning", "ai-usage", "users", "announcements", "feedback", ...(role === "admin" ? ["settings"] : [])];
      for (const name of pages) {
        await page.goto(`/${role}/${name}`);
        await expect(page.locator("h1.arena-heading")).toBeVisible();
        await expectNoOverflow(page);
        await page.setViewportSize({ width: 320, height: 900 });
        await expectNoOverflow(page);
        if (role === "admin" && name === "settings") await capture(page, "admin-settings-mobile");
        await page.setViewportSize({ width: 1280, height: 900 });
      }
    }
  } finally { await context.close(); }
  const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const touch = await touchContext.newPage();
  try {
    await login(touch, "student");
    await touch.goto(listPath("student"));
    expect(await touch.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(false);
    await touch.getByRole("row").filter({ hasText: title }).tap({ position: { x: 8, y: 8 } });
    await expect(touch).toHaveURL(new RegExp(`${detailPath("student")}$`));
    await touch.goto(listPath("student"));
    await touch.emulateMedia({ reducedMotion: "reduce" });
    const durations = await touch.getByRole("row").filter({ hasText: title }).evaluate(el => getComputedStyle(el).transitionDuration);
    expect(durations.split(",").every(value => parseFloat(value) < 0.01)).toBe(true);
  } finally { await touchContext.close(); }
});
