import { expect, test, type Browser, type Page } from "@playwright/test";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function expectPersistentShellNavigation({
  browser,
  destination,
  linkName,
  password,
  username,
}: {
  browser: Browser;
  destination: RegExp;
  linkName: string;
  password: string;
  username: string;
}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, username, password);
  const header = page.locator("[data-app-shell-header]");
  const marker = `probe-${username}`;
  await header.evaluate((element, value) => {
    element.setAttribute("data-persistence-probe", value);
  }, marker);

  await page.getByRole("link", { name: linkName, exact: true }).click();
  await expect(page).toHaveURL(destination);
  await expect(header).toHaveAttribute("data-persistence-probe", marker);
  await context.close();
}

test("slow navigation shows feedback and a content skeleton while the shell stays interactive", async ({
  page,
}) => {
  const publicSettingsRequests: string[] = [];
  let delayedRsc = false;
  let releaseLeaderboardRsc = () => {};
  const leaderboardRscGate = new Promise<void>((resolve) => {
    releaseLeaderboardRsc = resolve;
  });
  await page.route("**/student/leaderboard*", async (route) => {
    if (route.request().headers().rsc === "1") {
      delayedRsc = true;
      await leaderboardRscGate;
    }
    await route.continue();
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/settings/public") {
      publicSettingsRequests.push(request.url());
    }
  });
  await login(page, "e2e-student", "e2e-student-password");
  expect(publicSettingsRequests).toEqual([]);

  const header = page.locator("[data-app-shell-header]");
  await header.evaluate((element) => {
    element.setAttribute("data-persistence-probe", "student-shell");
  });

  const link = page.getByRole("link", { name: "天梯榜", exact: true });
  const startedAt = Date.now();
  await link.evaluate((element) => (element as HTMLElement).click());
  const releaseTimer = setTimeout(releaseLeaderboardRsc, 800);
  try {
    const pendingIndicator = link.locator(".navigation-pending-indicator");
    await expect(pendingIndicator).toHaveCSS("opacity", "1", { timeout: 250 });
    expect(Date.now() - startedAt).toBeLessThan(300);
    await expect(link.locator("[aria-busy='true']")).toBeAttached();
    await expect(page.locator("[data-route-loading]")).toBeVisible();
    await expect(header.getByRole("link").first()).toBeEnabled();

    await expect(page).toHaveURL(/\/student\/leaderboard/);
    expect(delayedRsc).toBe(true);
    await expect(header).toHaveAttribute(
      "data-persistence-probe",
      "student-shell",
    );

    const animation = await page
      .locator("main.app-stage > section, main.app-stage > div")
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          delay: style.animationDelay,
          duration: style.animationDuration,
        };
      });
    expect(animation).toEqual({ delay: "0s", duration: "0.18s" });
  } finally {
    clearTimeout(releaseTimer);
    releaseLeaderboardRsc();
  }
});

test("all three role shells persist across same-role navigation", async ({ browser }) => {
  await expectPersistentShellNavigation({
    browser,
    destination: /\/student\/problems/,
    linkName: "日常刷题",
    password: "e2e-student-password",
    username: "e2e-student",
  });
  await expectPersistentShellNavigation({
    browser,
    destination: /\/teacher\/practice/,
    linkName: "题目练习",
    password: "e2e-teacher-password",
    username: "e2e-teacher",
  });
  await expectPersistentShellNavigation({
    browser,
    destination: /\/admin\/practice/,
    linkName: "题目练习",
    password: "e2e-admin-password",
    username: "e2e-admin",
  });
});

test("formal exam navigation uses one RSC request and never mounts the normal shell", async ({
  page,
}) => {
  await login(page, "e2e-student", "e2e-student-password");
  await page.goto("/student/exams/203");

  const rscRequests: string[] = [];
  page.on("request", (request) => {
    if (request.headers().rsc === "1") rscRequests.push(request.url());
  });
  await page.evaluate(() => {
    const state = window as typeof window & {
      __normalNavSeenOnExam?: boolean;
      __normalNavObserver?: MutationObserver;
    };
    state.__normalNavSeenOnExam = false;
    state.__normalNavObserver = new MutationObserver(() => {
      if (
        location.pathname.endsWith("/take") &&
        document.querySelector('nav[aria-label="主导航"]')
      ) {
        state.__normalNavSeenOnExam = true;
      }
    });
    state.__normalNavObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });

  await page.getByRole("button", { name: "开始考试" }).click();
  await expect(page).toHaveURL(/\/student\/exams\/203\/take$/);
  await expect(page.getByText("考试答题", { exact: true })).toBeVisible();
  await expect(page.locator('nav[aria-label="主导航"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /退出/ })).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const state = window as typeof window & {
        __normalNavSeenOnExam?: boolean;
        __normalNavObserver?: MutationObserver;
      };
      state.__normalNavObserver?.disconnect();
      return state.__normalNavSeenOnExam;
    }),
  ).toBe(false);
  expect(rscRequests).toHaveLength(1);

  rscRequests.length = 0;
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "交卷", exact: true }).click();
  await expect(page).toHaveURL(/\/student\/exams\/203\/result$/);
  expect(rscRequests).toHaveLength(1);
});

test("reduced-motion mode effectively disables page entrance motion", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await login(page, "e2e-teacher", "e2e-teacher-password");
  const duration = await page
    .locator("main.app-stage > section, main.app-stage > div")
    .first()
    .evaluate((element) => parseFloat(getComputedStyle(element).animationDuration));
  expect(duration).toBeLessThanOrEqual(0.001);
  await context.close();
});
