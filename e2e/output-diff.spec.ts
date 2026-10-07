import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import { truncateCppOutput, type RunCppCaseResult, type RunCppResult } from "../src/lib/cppRun";

const roles = ["student", "teacher", "admin"] as const;
const password = "e2e-output-password";
const screenshotDirectory = path.resolve("tmp/output-diff-20261007");

test.beforeAll(async () => {
  const databaseUrl = `file:${path.resolve("prisma/e2e.db").replaceAll("\\", "/")}`;
  expect(databaseUrl).toMatch(/\/prisma\/e2e\.db$/);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    for (const role of roles) {
      await db.user.upsert({
        where: { username: `e2e-output-${role}` },
        create: { username: `e2e-output-${role}`, passwordHash: await hash(password, 10), role },
        update: {},
      });
    }
  } finally { await db.$disconnect(); }
});

async function openProblem(page: Page, role: typeof roles[number]) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(`e2e-output-${role}`);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto(role === "student" ? "/student/problems/101" : `/${role}/practice/problems/101`);
  // These tests target the trial result UI, independently of the Monaco CDN load.
  await expect(page.getByRole("button", { name: "在线自测", exact: true })).toBeEnabled();
}

function runResult(expectedOutput: string | undefined, actualOutput: string, status: RunCppCaseResult["status"] = "mismatched"): RunCppResult {
  return {
    status: status === "matched" ? "sample_passed" : status === "completed" ? "completed" : status === "runtime_error" ? "runtime_error" : "sample_failed",
    runtimeMs: 4,
    cases: [{ caseIndex: 1, input: "1 2", expectedOutput, actualOutput, runtimeMs: 4, status }],
  };
}

for (const role of roles) {
  test(`${role} sees plain standard output, red program errors and can copy original text`, async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openProblem(page, role);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const expectedOutput = "sum = 13 \nok\n";
    const actualOutput = "sum = 12\t \nok\n\n";
    await page.route("**/api/problems/101/run", (route) => route.fulfill({ json: { cooldownSeconds: 0, run: runResult(expectedOutput, actualOutput) } }));
    await page.getByRole("button", { name: "在线自测", exact: true }).click();
    const comparison = page.getByTestId("sample-output-comparison");
    await expect(comparison).toBeVisible();
    const standard = comparison.getByTestId("sample-expected-output");
    await expect(standard.locator("mark")).toHaveCount(0);
    expect(await standard.textContent()).toBe(expectedOutput);
    await expect(comparison.getByTestId("sample-actual-output").locator("mark")).toHaveText("2");
    expect(await comparison.getByTestId("sample-actual-output").textContent()).toBe(actualOutput);
    await expect(comparison.getByRole("checkbox")).toHaveCount(0);
    await expect(comparison).not.toContainText("∅");
    const copyActual = comparison.getByRole("button", { name: "复制程序输出", exact: true });
    await copyActual.focus();
    await page.keyboard.press("Enter");
    // Windows clipboard uses CRLF; spaces and other output characters stay exact.
    await expect.poll(() => page.evaluate(async () =>
      (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"),
    )).toBe(actualOutput);
    await comparison.getByRole("button", { name: "复制标准输出", exact: true }).click();
    await expect.poll(() => page.evaluate(async () =>
      (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"),
    )).toBe(expectedOutput);

    for (const width of [320, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await mkdir(screenshotDirectory, { recursive: true });
    await comparison.screenshot({ path: path.join(screenshotDirectory, `${role}-comparison.png`) });
    expect(errors).toEqual([]);
  });
}

test("missing, multiline, long and truncated sample output stays readable", async ({ page }) => {
  await openProblem(page, "student");
  let response = runResult("1 2\n3", "12 3");
  await page.route("**/api/problems/101/run", (route) => route.fulfill({ json: { cooldownSeconds: 0, run: response } }));
  const run = () => page.getByRole("button", { name: "在线自测", exact: true }).click();
  const comparison = page.getByTestId("sample-output-comparison");
  await run();
  expect(await comparison.getByTestId("sample-expected-output").textContent()).toBe("1 2\n3");
  await expect(comparison.getByTestId("sample-actual-output")).toContainText("缺少内容");
  response = runResult("3", "");
  await run();
  await expect(comparison.getByLabel("此处缺少内容", { exact: true })).toBeVisible();
  await expect(comparison.getByRole("button", { name: "复制程序输出" })).toHaveCount(0);

  response = runResult(`begin\n${"a".repeat(4500)}\nend`, `begin\n${"b".repeat(4500)}\nend`);
  await run();
  await expect(comparison).toContainText("输出较长，红色区域需要检查。");
  for (const width of [320, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => comparison.getByTestId("sample-actual-output").evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  }
  const preview = truncateCppOutput("a".repeat(6000));
  response = runResult(preview, preview);
  await run();
  await expect(comparison).toContainText("输出已截断，差异可能在未显示的部分。");
  await expect(comparison.locator("mark")).toHaveCount(0);

  response = runResult("R\nR\nL\n99\nL", "        R\n        R\n1\n99\n1");
  await run();
  expect(await comparison.getByTestId("sample-expected-output").textContent()).toBe(response.cases[0].expectedOutput);
  await expect(comparison.getByTestId("sample-actual-output").locator("mark")).toHaveText(["        ", "        ", "1", "1"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await mkdir(screenshotDirectory, { recursive: true });
  await comparison.screenshot({ path: path.join(screenshotDirectory, "student-whitespace-comparison.png") });
});

test("matched samples, custom input and runtime errors keep their existing feedback", async ({ page }) => {
  await openProblem(page, "student");
  let response = runResult("3\n", "3 \n", "matched");
  await page.route("**/api/problems/101/run", (route) => route.fulfill({ json: { cooldownSeconds: 0, run: response } }));
  await page.getByRole("button", { name: "在线自测", exact: true }).click();
  await expect(page.getByTestId("problem-run-result")).toContainText("全部公开样例匹配");
  await expect(page.getByTestId("sample-output-comparison")).toHaveCount(0);

  await page.getByRole("tab", { name: "自定义输入", exact: true }).click();
  await page.getByLabel("程序输入", { exact: true }).fill("2 3");
  response = runResult(undefined, "CUSTOM_OUTPUT_E2E", "completed");
  await page.getByRole("button", { name: "运行自定义输入", exact: true }).click();
  await expect(page.getByTestId("problem-run-result")).toContainText("CUSTOM_OUTPUT_E2E");
  await expect(page.getByTestId("sample-output-comparison")).toHaveCount(0);

  await page.getByRole("tab", { name: "运行样例", exact: true }).click();
  response = runResult("3", "partial", "runtime_error");
  await page.getByRole("button", { name: "在线自测", exact: true }).click();
  await expect(page.getByTestId("problem-run-result")).toContainText("运行时错误");
  await expect(page.getByTestId("sample-output-comparison")).toHaveCount(0);
});
