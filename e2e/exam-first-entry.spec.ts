import { expect, test } from "@playwright/test";

test("a reloaded login document does not submit the first exam entry", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const submitRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/api/exams/207/submit")
    ) {
      submitRequests.push(request.url());
    }
  });

  await page.goto("/login");
  await page.reload();
  await page.getByLabel("用户名").fill("e2e-exam-student");
  await page.getByLabel("密码").fill("e2e-exam-student-password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/student$/);

  await page.getByRole("link", { name: "模拟考试", exact: true }).click();
  await expect(page).toHaveURL(/\/student\/exams$/);
  const examCard = page.locator("section.mt-6 > div").filter({
    hasText: "E2E 首次进入考试",
  });
  await examCard.getByRole("button", { name: "开始考试" }).click();
  await expect(page).toHaveURL(/\/student\/exams\/207\/take$/);

  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming;
    return { name: entry.name, type: entry.type };
  });
  expect(navigation.type).toBe("reload");
  expect(new URL(navigation.name).pathname).toBe("/login");

  await page.waitForTimeout(60_000);
  expect(submitRequests).toEqual([]);
  const takeStatus = await page.evaluate(async () => {
    const response = await fetch("/api/exams/207/take");
    return response.status;
  });
  expect(takeStatus).toBe(200);

  await page.reload();
  await expect(page).toHaveURL(/\/student\/exams\/207\/result$/, {
    timeout: 15_000,
  });
  expect(submitRequests.length).toBeGreaterThan(0);
  expect(
    submitRequests.some(
      (url) =>
        url.includes("trigger=pagehide") || url.includes("trigger=reload"),
    ),
  ).toBe(true);
});
