import { expect, test, type Locator, type Page } from "@playwright/test";

type BrowserResponse = {
  body: Record<string, unknown>;
  retryAfter: string | null;
  status: number;
};

const acceptedHoverBackground = "rgba(209, 250, 229, 0.7)";
const incompleteHoverBackground = "rgba(79, 111, 136, 0.12)";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function expectHoverBackground(
  target: Locator,
  expectedBackground: string,
) {
  await expect(target).toBeVisible();
  await target.hover();
  await expect
    .poll(() =>
      target.evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .toBe(expectedBackground);
}

async function postJson(
  page: Page,
  url: string,
  body: Record<string, unknown> = {},
): Promise<BrowserResponse> {
  return page.evaluate(
    async ({ requestBody, requestUrl }) => {
      const response = await fetch(requestUrl, {
        body: JSON.stringify(requestBody),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      return {
        body: await response.json().catch(() => ({})),
        retryAfter: response.headers.get("Retry-After"),
        status: response.status,
      };
    },
    { requestBody: body, requestUrl: url },
  );
}

test("critical student, exam, AI, Judge, and administrator boundaries", async ({
  browser,
  page,
}) => {
  await test.step("student login and role boundary", async () => {
    await login(page, "e2e-student", "e2e-student-password");
    await expect(page).toHaveURL(/\/student$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/student$/);
  });

  await test.step("problem hover states stay visible for students and teachers", async () => {
    await page.goto("/student/problems?problemType=programming");
    const studentIncompleteRow = page.getByRole("row").filter({
      hasText: "E2E 加法题",
    });
    await expectHoverBackground(
      studentIncompleteRow,
      incompleteHoverBackground,
    );
    await expect
      .poll(() =>
        studentIncompleteRow.evaluate(
          (element) => getComputedStyle(element).transform,
        ),
      )
      .not.toBe("none");
    await expect(
      studentIncompleteRow.getByRole("link", { name: "开始做题" }),
    ).toHaveAttribute("href", "/student/problems/101");

    await page.goto("/student/problems?problemType=objective");
    const studentAcceptedRow = page.getByRole("row").filter({
      hasText: "E2E 客观题",
    });
    await expectHoverBackground(studentAcceptedRow, acceptedHoverBackground);

    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();
    await login(teacherPage, "e2e-teacher", "e2e-teacher-password");
    await teacherPage.goto("/teacher/practice?problemType=programming");
    const teacherIncompleteRow = teacherPage.getByRole("row").filter({
      hasText: "E2E 加法题",
    });
    await expectHoverBackground(
      teacherIncompleteRow,
      incompleteHoverBackground,
    );
    await expect(
      teacherIncompleteRow.getByRole("link", { name: "进入做题" }),
    ).toHaveAttribute("href", "/teacher/practice/problems/101");
    await teacherContext.close();
  });

  await test.step("hidden programming tests stay redacted", async () => {
    await page.goto("/student/submissions/501");
    await page.locator("details summary").click();
    await expect(
      page.getByText(
        "正式提交的测试输入、标准输出、程序输出和详细运行错误不对学生公开；请使用公开样例或自定义输入调试。",
      ),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText("HIDDEN_INPUT_E2E");
    await expect(page.locator("body")).not.toContainText(
      "HIDDEN_EXPECTED_E2E",
    );
    await expect(page.locator("body")).not.toContainText("HIDDEN_ACTUAL_E2E");
    await expect(page.locator("body")).not.toContainText("HIDDEN_STDERR_E2E");
  });

  await test.step("Judge infrastructure failure is retryable and not stored", async () => {
    const response = await postJson(page, "/api/problems/101/submit", {
      code: "#include <iostream>\nint main(){std::cout << 3;}",
    });
    expect(response.status).toBe(503);
    expect(response.retryAfter).toBeTruthy();
    expect(String(response.body.error)).toContain("评测服务");
  });

  await test.step("an active exam blocks out-of-scope AI", async () => {
    const started = await postJson(page, "/api/exams/201/start");
    expect(started.status).toBe(201);

    const blocked = await postJson(
      page,
      "/api/problems/103/objective-explanation",
      {
        itemIndex: 1,
        requestId: "request_e2e_exam_lock",
      },
    );
    expect(blocked.status).toBe(403);
    expect(String(blocked.body.error)).toContain("正式考试");

    const programmingBlocked = await postJson(
      page,
      "/api/ai/problem-assist",
      {
        code: "",
        mode: "overview",
        problemId: 102,
      },
    );
    expect(programmingBlocked.status).toBe(403);
    expect(String(programmingBlocked.body.error)).toContain(
      "考试期间不能使用日常练习 AI",
    );
  });

  await test.step("exam submission is idempotent", async () => {
    const first = await postJson(page, "/api/exams/201/submit");
    const second = await postJson(page, "/api/exams/201/submit");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.examRecord).toMatchObject(
      first.body.examRecord as Record<string, unknown>,
    );
  });

  await test.step("request id cannot replay across AI contexts", async () => {
    const conflict = await postJson(
      page,
      "/api/problems/103/objective-explanation",
      {
        itemIndex: 1,
        requestId: "request_e2e_context",
      },
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({
      error: "AI 请求标识与当前请求不匹配",
    });
  });

  await test.step("exam buttons recover after the network drops", async () => {
    await page.route("**/api/exams/202/start", (route) => route.abort());
    await page.goto("/student/exams/202");
    await page.getByRole("button", { name: "开始考试" }).click();
    await expect(page.getByText(/网络异常，无法开始考试/)).toBeVisible();
    await expect(page.getByRole("button", { name: "开始考试" })).toBeEnabled();
    await page.unroute("**/api/exams/202/start");

    await page.getByRole("button", { name: "开始考试" }).click();
    await expect(page).toHaveURL(/\/student\/exams\/202\/take$/);
    const studentExamProblem = page
      .locator("aside .problem-hover-incomplete")
      .filter({ hasText: "E2E 加法题" });
    await expectHoverBackground(
      studentExamProblem,
      incompleteHoverBackground,
    );
    await page.route("**/api/exams/202/submit", (route) => route.abort());
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "交卷", exact: true }).click();
    await expect(page.getByText(/网络异常，交卷失败/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "交卷", exact: true }),
    ).toBeEnabled();
    await page.unroute("**/api/exams/202/submit");
    const submitted = await postJson(page, "/api/exams/202/submit");
    expect(submitted.status).toBe(200);
  });

  await test.step("the final administrator cannot demote itself", async () => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, "e2e-admin", "e2e-admin-password");
    await adminPage.goto("/admin/practice?problemType=programming");
    const adminIncompleteRow = adminPage.getByRole("row").filter({
      hasText: "E2E 加法题",
    });
    await expectHoverBackground(
      adminIncompleteRow,
      incompleteHoverBackground,
    );
    await expect(
      adminIncompleteRow.getByRole("link", { name: "进入做题" }),
    ).toHaveAttribute("href", "/admin/practice/problems/101");

    await adminPage.goto("/admin/exams/201/practice");
    const adminExamProblem = adminPage
      .locator("aside .problem-hover-incomplete")
      .filter({ hasText: "E2E 加法题" });
    await expectHoverBackground(adminExamProblem, incompleteHoverBackground);

    const response = await adminPage.evaluate(async () => {
      const result = await fetch("/api/admin/users/1", {
        body: JSON.stringify({
          customTitle: "",
          password: "",
          role: "teacher",
          username: "e2e-admin",
        }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      return {
        body: await result.json().catch(() => ({})),
        status: result.status,
      };
    });
    expect(response.status).toBe(409);
    expect(String(response.body.error)).toContain("至少保留一个管理员");

    await adminPage.route("**/api/admin/exams/201/unpublish", (route) =>
      route.abort(),
    );
    await adminPage.goto("/admin/exams");
    const examRow = adminPage.getByRole("row").filter({
      hasText: "E2E 考试 201",
    });
    await examRow.getByRole("button", { name: "取消发布" }).click();
    await expect(adminPage.getByText(/网络异常，操作失败/)).toBeVisible();
    await expect(
      examRow.getByRole("button", { name: "取消发布" }),
    ).toBeEnabled();
    await adminPage.unroute("**/api/admin/exams/201/unpublish");

    await adminPage.route("**/api/admin/exams", (route) => {
      if (route.request().method() === "POST") {
        return route.abort();
      }
      return route.continue();
    });
    await adminPage.goto("/admin/exams/new");
    await adminPage.getByLabel("考试名称").fill("不会写入的断网考试");
    await adminPage.getByRole("button", { name: "创建考试" }).click();
    await expect(adminPage.getByText(/网络异常，保存失败/)).toBeVisible();
    await expect(
      adminPage.getByRole("button", { name: "创建考试" }),
    ).toBeEnabled();
    await adminPage.unroute("**/api/admin/exams");

    await adminPage.route("**/api/admin/problems/search?*", (route) =>
      route.abort(),
    );
    await adminPage.goto("/admin/exams/201/edit");
    await adminPage.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(adminPage.getByText(/网络异常，搜索失败/)).toBeVisible();
    await expect(
      adminPage.getByRole("button", { name: "搜索", exact: true }),
    ).toBeEnabled();
    await adminPage.unroute("**/api/admin/problems/search?*");
    await adminContext.close();
  });
});
