import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { getProblemDraftKey, getObjectiveResultKey, type ProblemDraftContext } from "../src/lib/problemDraft";
import { createObjectiveSubmissionRefreshState } from "../src/lib/objectiveSubmissionRefresh";

const roles = ["student", "teacher", "admin"] as const;
type Role = typeof roles[number];
const password = "e2e-draft-library-password";
const users = {} as Record<Role, Array<{ id: number; username: string }>>;
const fixture = { programming: 0, objective: 0, accepted: 0, digits: 0, exams: [] as number[], assignment: 0, historical: 0 };
const category = "草稿筛选回归";
const databaseUrl = `file:${path.resolve("prisma/e2e.db").replaceAll("\\", "/")}`;

test.beforeAll(async () => {
  expect(databaseUrl).toMatch(/\/prisma\/e2e\.db$/);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const passwordHash = await hash(password, 10);
    for (const role of roles) {
      users[role] = [];
      for (const suffix of ["a", "b"]) {
        const username = `e2e-draft-${role}-${suffix}`;
        const user = await db.user.upsert({ where: { username }, create: { username, passwordHash, role }, update: {} });
        users[role].push(user);
      }
    }
    const common = { category, description: "草稿与搜索回归测试。", inputDescription: "整数。", outputDescription: "整数。", sampleInput: "1", sampleOutput: "1", difficulty: "基础" };
    const problem = async (data: Parameters<typeof db.problem.create>[0]["data"]) => (await db.problem.findFirst({ where: { category, title: data.title } })) ?? await db.problem.create({ data });
    fixture.programming = (await problem({ ...common, title: "筛选回归 未作答", sortOrder: 5 })).id;
    fixture.accepted = (await problem({ ...common, title: "筛选回归 曾在考试通过", sortOrder: 3 })).id;
    fixture.digits = (await problem({ ...common, title: `筛选回归 标题数字 ${fixture.programming}`, difficulty: "进阶", sortOrder: 7 })).id;
    await problem({ ...common, title: "筛选回归 下架题", difficulty: "下架独占难度", archivedAt: new Date() });
    fixture.objective = (await problem({ ...common, title: "筛选回归 客观题", problemType: "objective", objectiveItems: JSON.stringify([{ kind: "choice", stem: "选择 A。", options: [{ label: "A", text: "A" }, { label: "B", text: "B" }], answer: "A", score: 10 }]) })).id;
    for (const index of [0, 1, 2]) {
      const objective = index === 2;
      const problemId = objective ? fixture.objective : fixture.programming;
      const existingExam = await db.exam.findFirst({ where: { title: `草稿考试隔离 ${index}`, createdById: users.teacher[0].id } });
      fixture.exams.push((existingExam ?? await db.exam.create({ data: { title: `草稿考试隔离 ${index}`, createdById: users.teacher[0].id, status: "published", durationMin: 60, examType: objective ? "objective" : "programming", problems: { create: { problemId, order: 1, score: 10, snapshotTitle: objective ? "筛选回归 客观题" : "筛选回归 未作答", snapshotProblemType: objective ? "objective" : "programming", snapshotScore: 10, snapshotAt: new Date(), snapshotObjectiveItems: objective ? (await db.problem.findUniqueOrThrow({ where: { id: problemId } })).objectiveItems : null } } } })).id);
    }
    for (const status of ["Accepted", "Wrong Answer"]) await db.submission.create({ data: { userId: users.student[0].id, problemId: fixture.accepted, examId: fixture.exams[0], submissionType: "exam", code: "// exam", language: "C++17", status, passedCount: status === "Accepted" ? 1 : 0, totalCount: 1 } });
    await db.submission.create({ data: { userId: users.student[1].id, problemId: fixture.digits, code: "// other account", language: "C++17", status: "Accepted", passedCount: 1, totalCount: 1 } });
    fixture.historical = (await db.submission.create({ data: { userId: users.student[0].id, problemId: fixture.programming, code: "// OWN_HISTORY", language: "C++17", status: "Wrong Answer", totalCount: 1 } })).id;
    fixture.assignment = (await db.learningAssignment.create({ data: { studentId: users.student[0].id, createdById: users.teacher[0].id, title: "草稿共用专项", problems: { create: { problemId: fixture.programming, problemTitle: "筛选回归 未作答", problemCategory: category, problemDifficulty: "基础" } } } })).id;
  } finally { await db.$disconnect(); }
});

async function login(page: Page, role: Role, index = 0) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("用户名").fill(users[role][index].username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${role}$`));
  if (role === "student") {
    const reminder = page.getByTestId("pending-assignment-reminder");
    if (await reminder.isVisible()) await page.getByRole("button", { name: "去完成专项练习" }).click();
  }
}

function detail(role: Role, id: number) { return `/${role}/${role === "student" ? "problems" : "practice/problems"}/${id}`; }

async function replaceEditor(page: Page, content: string) {
  const editor = page.getByRole("textbox", { name: "Editor content", exact: true });
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("draft-status")).not.toHaveText("正在读取本机草稿…");
  await editor.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(content);
}

async function storedContent(page: Page, context: ProblemDraftContext, objective = false) {
  const key = getProblemDraftKey(context, objective ? "objective" : "programming", objective ? fixture.objective : fixture.programming);
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "{}").content as string | undefined, key);
}

for (const role of roles) test(`${role}: same-browser account switch isolates programming and objective drafts`, async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page, role);
  const first: ProblemDraftContext = { userId: users[role][0].id, role, scope: "practice" };
  const second: ProblemDraftContext = { ...first, userId: users[role][1].id };
  await page.evaluate(id => { localStorage.setItem(`oj-code-problem-${id}`, "// OWNERLESS_LEGACY"); }, fixture.programming);
  await page.goto(detail(role, fixture.programming));
  await expect.poll(() => storedContent(page, first)).not.toBe("// OWNERLESS_LEGACY");
  await replaceEditor(page, `// ACCOUNT_A_${role}`);
  await expect.poll(() => storedContent(page, first)).toBe(`// ACCOUNT_A_${role}`);
  await page.reload();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(`ACCOUNT_A_${role}`);
  if (role === "student") {
    await page.goto(`${detail(role, fixture.programming)}?assignment=${fixture.assignment}`);
    await expect(page.locator(".monaco-editor .view-lines")).toContainText(`ACCOUNT_A_${role}`);
  }
  await page.goto(detail(role, fixture.objective));
  await replaceEditor(page, "A");
  await expect.poll(() => storedContent(page, first, true)).toBe("A");
  const refreshKey = getObjectiveResultKey(getProblemDraftKey(first, "objective", fixture.objective));
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), { key: refreshKey, value: createObjectiveSubmissionRefreshState({ result: { id: 99999, status: "Wrong Answer", passedCount: 0, totalCount: 1, runtimeMs: 0, caseResults: [{ caseIndex: 1, status: "Wrong Answer", actualOutput: "B" }] }, countedForLearningAssignment: false, learningAssignmentDetached: false }) });
  await login(page, role, 1);
  await page.goto(detail(role, fixture.programming));
  await expect.poll(() => storedContent(page, second)).not.toBe(`// ACCOUNT_A_${role}`);
  await replaceEditor(page, `// ACCOUNT_B_${role}`);
  await expect.poll(() => storedContent(page, second)).toBe(`// ACCOUNT_B_${role}`);
  await page.goto(detail(role, fixture.objective));
  await expect.poll(() => storedContent(page, second, true)).toBe("");
  await expect(page.getByTestId("submission-result")).toHaveCount(0);
  await replaceEditor(page, "B");
  await expect.poll(() => storedContent(page, second, true)).toBe("B");
  await login(page, role);
  await page.goto(detail(role, fixture.programming));
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(`ACCOUNT_A_${role}`);
  expect(await page.evaluate(id => localStorage.getItem(`oj-code-problem-${id}`), fixture.programming)).toBe("// OWNERLESS_LEGACY");
  expect(errors).toEqual([]);
});

test("formal exam drafts are isolated from practice, other exams and other accounts", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page, "student");
  await page.goto(detail("student", fixture.programming));
  await replaceEditor(page, "// DAILY_ONLY");
  await expect.poll(() => storedContent(page, { userId: users.student[0].id, role: "student", scope: "practice" })).toBe("// DAILY_ONLY");
  await page.goto(detail("student", fixture.objective));
  await replaceEditor(page, "A");
  await expect.poll(() => storedContent(page, { userId: users.student[0].id, role: "student", scope: "practice" }, true)).toBe("A");
  for (const [index, examIndex] of [[0, 0], [0, 1], [1, 0], [0, 2], [1, 2]]) {
    await login(page, "student", index);
    const examId = fixture.exams[examIndex];
    const origin = new URL(page.url()).origin;
    expect((await page.request.post(`/api/exams/${examId}/start`, { headers: { origin } })).ok()).toBe(true);
    await page.goto(`/student/exams/${examId}/take`);
    const context: ProblemDraftContext = { userId: users.student[index].id, role: "student", scope: "exam", examId };
    const objective = examIndex === 2;
    if (objective) await expect.poll(() => storedContent(page, context, true)).toBe("");
    else await expect.poll(() => storedContent(page, context)).toContain("#include");
    await replaceEditor(page, objective ? "B" : `// EXAM_${examIndex}_ACCOUNT_${index}`);
    await expect.poll(() => storedContent(page, context, objective)).toBe(objective ? "B" : `// EXAM_${examIndex}_ACCOUNT_${index}`);
    expect((await page.request.post(`/api/exams/${examId}/submit`, { headers: { origin } })).ok()).toBe(true);
    await page.goto(`/student/exams/${examId}/result`);
  }
});

test("staff exam practice has its own draft without creating student exam records", async ({ page }) => {
  await login(page, "admin");
  await page.goto(detail("admin", fixture.programming));
  await replaceEditor(page, "// STAFF_DAILY_ONLY");
  await expect.poll(() => storedContent(page, { userId: users.admin[0].id, role: "admin", scope: "practice" })).toBe("// STAFF_DAILY_ONLY");
  const examId = fixture.exams[0];
  await page.goto(`/admin/exams/${examId}/practice`);
  const context: ProblemDraftContext = { userId: users.admin[0].id, role: "admin", scope: "exam-practice", examId };
  await expect.poll(() => storedContent(page, context)).toContain("#include");
  await replaceEditor(page, "// STAFF_EXAM_ONLY");
  await expect.poll(() => storedContent(page, context)).toBe("// STAFF_EXAM_ONLY");
  await page.goto(detail("admin", fixture.programming));
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("STAFF_DAILY_ONLY");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try { expect(await db.examRecord.count({ where: { userId: users.admin[0].id } })).toBe(0); } finally { await db.$disconnect(); }
});

test("storage failures preserve editing and successful objective submissions", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page, "student");
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, { configurable: true, value: function (key: string, value?: string) {
        if (key.startsWith("oj:problem-draft:") || key === "oj-code-editor-font-size") throw new DOMException("Blocked storage", "SecurityError");
        return Reflect.apply(original, this, [key, value]);
      } });
    }
  });
  await page.goto(detail("student", fixture.objective));
  await expect(page.getByTestId("draft-status")).toContainText("本机草稿保存不可用");
  await replaceEditor(page, "B");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.getByTestId("submission-result")).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("own historical draft loads safely and a delayed response cannot overwrite another problem", async ({ page }) => {
  await login(page, "student");
  await page.goto(`${detail("student", fixture.programming)}?fromSubmission=${fixture.historical}`);
  await expect(page.getByText("已加载历史提交代码，你可以继续修改后重新提交。")).toBeVisible();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("OWN_HISTORY");
  let release = () => {};
  const delayed = new Promise<void>(resolve => { release = resolve; });
  let markRequested = () => {};
  const requested = new Promise<void>(resolve => { markRequested = resolve; });
  await page.route(`**/api/submissions/${fixture.historical}`, async route => { markRequested(); await delayed; await route.continue().catch(() => {}); });
  await page.goto(`${detail("student", fixture.programming)}?fromSubmission=${fixture.historical}`);
  await requested;
  await page.goto(detail("student", fixture.objective));
  release();
  await expect(page.getByTestId("draft-status")).toHaveText("已保存到本机");
  await expect(page.locator(".monaco-editor .view-lines")).not.toContainText("OWN_HISTORY");
});

test("combined filters cover the full library and preserve paging and return context", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page, "student");
  await page.goto(`/student/problems?problemType=programming&category=${encodeURIComponent(category)}&q=${fixture.programming}&pageSize=1`);
  await expect(page.getByText("共 2 道题 · 当前 1 道", { exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: `#${fixture.digits}` })).toBeVisible();
  await page.getByRole("link", { name: "下一页", exact: true }).click();
  await expect(page).toHaveURL(/page=2&pageSize=1$/);
  await expect(page.getByRole("row").filter({ hasText: `#${fixture.programming}` })).toBeVisible();
  const listUrl = page.url();
  await page.getByRole("link", { name: "开始做题", exact: true }).click();
  await page.getByRole("link", { name: "返回日常刷题", exact: true }).click();
  await expect(page).toHaveURL(listUrl);
  await page.getByRole("searchbox", { name: "题名 / 题号" }).fill("筛选回归");
  await page.getByRole("searchbox", { name: "题名 / 题号" }).press("Enter");
  await expect(page).not.toHaveURL(/page=2/);
  await page.getByRole("combobox", { name: "难度", exact: true }).selectOption("基础");
  await page.getByRole("combobox", { name: "通过状态", exact: true }).selectOption("accepted");
  await expect(page.getByRole("row").filter({ hasText: "筛选回归 曾在考试通过" })).toContainText("已通过");
  await expect(page.getByText("共 1 道题 · 当前 1 道", { exact: true })).toBeVisible();
  const api = await page.request.get(`/api/problems?problemType=programming&category=${encodeURIComponent(category)}&q=筛选回归&difficulty=基础&completion=accepted&pageSize=1`);
  expect((await api.json()).items.map((item: { id: number }) => item.id)).toEqual([fixture.accepted]);
  await page.getByRole("combobox", { name: "通过状态", exact: true }).selectOption("unaccepted");
  await expect(page.getByRole("row").filter({ hasText: "筛选回归 未作答" })).toBeVisible();
  await page.getByRole("combobox", { name: "难度", exact: true }).selectOption("");
  await expect(page.getByText("共 2 道题 · 当前 1 道", { exact: true })).toBeVisible();
  for (const width of [320, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("searchbox", { name: "题名 / 题号" })).toBeVisible();
    if (width === 320 || width === 1280) {
      await mkdir(path.resolve("tmp/draft-library-20261011"), { recursive: true });
      await page.screenshot({ path: path.resolve(`tmp/draft-library-20261011/filters-${width}.png`), fullPage: true });
    }
  }
  await page.getByRole("link", { name: "选择判断题", exact: true }).click();
  await expect(page).not.toHaveURL(/category=|difficulty=/);
  await expect(page.getByRole("combobox", { name: "通过状态", exact: true })).toHaveValue("unaccepted");
  await expect(page.getByRole("row").filter({ hasText: "筛选回归 客观题" })).toBeVisible();
  await page.getByRole("searchbox", { name: "题名 / 题号" }).fill("找不到的题目xyz");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByRole("heading", { name: "没有找到符合条件的题目" })).toBeVisible();
  await page.getByRole("link", { name: "清空筛选", exact: true }).first().click();
  await expect(page).toHaveURL(/problemType=objective/);
  await expect(page).not.toHaveURL(/completion=|q=|difficulty=|category=/);
  expect(errors).toEqual([]);
});
