import { expect, test, type Page } from "@playwright/test";

const icpRecordNumber = "陕ICP备2026021441号-1";
const publicSecurityRecordNumber = "陕公网安备61011302001964号";
const publicSecurityPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAJklEQVQ4jWOQ8ur6T03MMGrg/9Ew/D+abP6P5pT/o4XD/xFYHgIAm2kCfq3CV6UAAAAASUVORK5CYII=",
  "base64",
);

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function expectIcpOnlyFooter(page: Page) {
  const footer = page.locator("[data-site-compliance-footer]");
  await expect(footer).toHaveCount(1);
  await expect(footer.getByRole("link", { name: icpRecordNumber })).toHaveAttribute(
    "href",
    "https://beian.miit.gov.cn/",
  );
  await expect(footer).not.toContainText("公网安备");
}

test("compliance footer covers login, every role, and the locked exam shell", async ({
  browser,
  page,
}) => {
  await page.setViewportSize({ height: 1_100, width: 1_440 });
  await page.goto("/login");
  await expectIcpOnlyFooter(page);
  const shortPageLayout = await page
    .locator("[data-site-compliance-footer]")
    .evaluate((footer) => ({
      bottom: footer.getBoundingClientRect().bottom,
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
  expect(shortPageLayout.documentHeight).toBeLessThanOrEqual(
    shortPageLayout.viewportHeight + 1,
  );
  expect(
    Math.abs(shortPageLayout.bottom - shortPageLayout.viewportHeight),
  ).toBeLessThanOrEqual(1);

  await login(page, "e2e-student", "e2e-student-password");
  await expectIcpOnlyFooter(page);
  await page.goto("/student/exams/204");
  await page.getByRole("button", { name: "开始考试" }).click();
  await expect(page).toHaveURL(/\/student\/exams\/204\/take$/);
  await expectIcpOnlyFooter(page);
  await page.evaluate(async () => {
    await fetch("/api/exams/204/submit", { method: "POST" });
  });

  for (const account of [
    {
      home: /\/teacher$/,
      password: "e2e-teacher-password",
      username: "e2e-teacher",
    },
    {
      home: /\/admin$/,
      password: "e2e-admin-password",
      username: "e2e-admin",
    },
  ]) {
    const context = await browser.newContext();
    const rolePage = await context.newPage();
    await login(rolePage, account.username, account.password);
    await expect(rolePage).toHaveURL(account.home);
    await expectIcpOnlyFooter(rolePage);
    await context.close();
  }
});

test("administrator can publish and clear the police record without a rebuild", async ({
  page,
}) => {
  const publicSettingsRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/settings/public") {
      publicSettingsRequests.push(request.url());
    }
  });

  await login(page, "e2e-admin", "e2e-admin-password");
  await page.goto("/admin/settings");
  await page.getByLabel("公安备案号").fill(publicSecurityRecordNumber);
  await page.getByLabel("上传 PNG", { exact: true }).setInputFiles({
    buffer: publicSecurityPng,
    mimeType: "image/png",
    name: "beian-icon.png",
  });
  await expect(page.getByText("已选择官方图标")).toBeVisible();
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("系统设置已保存并生效")).toBeVisible();

  const footer = page.locator("footer[data-site-compliance-footer]");
  await expect(footer.getByRole("link", { name: publicSecurityRecordNumber })).toHaveAttribute(
    "href",
    "https://beian.mps.gov.cn/#/query/webSearch?code=61011302001964",
  );
  expect(publicSettingsRequests).toEqual([]);

  await page.setViewportSize({ height: 812, width: 375 });
  const mobileFooterLayout = await footer.evaluate((element) => ({
    clientWidth: element.clientWidth,
    links: Array.from(element.querySelectorAll("a"), (link) => {
      const box = link.getBoundingClientRect();
      return { left: box.left, right: box.right };
    }),
    scrollWidth: element.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(mobileFooterLayout.scrollWidth).toBeLessThanOrEqual(
    mobileFooterLayout.clientWidth,
  );
  for (const link of mobileFooterLayout.links) {
    expect(link.left).toBeGreaterThanOrEqual(0);
    expect(link.right).toBeLessThanOrEqual(mobileFooterLayout.viewportWidth);
  }

  await page.getByLabel("公安备案号").fill("");
  await page.getByRole("button", { name: "清除图标" }).click();
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("系统设置已保存并生效")).toBeVisible();
  await expect(footer).not.toContainText("公网安备");
});
