import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, role: "student" | "teacher" | "admin") {
  const response = await page.request.post("/api/auth/login", {
    data: { username: `e2e-${role}`, password: `e2e-${role}-password` },
    headers: { Origin: "http://127.0.0.1:3100" },
  });
  expect(response.status()).toBe(200);
}

test("student home keeps native practice links, tier fallback and keyboard ranking location", async ({ page }) => {
  await login(page, "student");
  await page.goto("/student");
  const start = page.getByRole("link", { name: "开始刷题", exact: true });
  await expect(start).toHaveAttribute("href", "/student/problems");
  await expect(page.locator(".rank-emblem-home")).toHaveAttribute("data-image-state", "loaded");
  await page.setViewportSize({ width: 320, height: 900 });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/student\/problems$/);

  await page.goto("/student/leaderboard");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const locate = page.getByRole("button", { name: "定位到我" });
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await locate.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-ranking-user-id"))).toBe("2");
  }

  await page.route("**/ui/ranks/**", (route) => route.abort());
  await page.goto("/student");
  await expect(page.locator(".rank-emblem-home")).toHaveAttribute("data-image-state", "failed");
  await expect(page.locator(".rank-emblem-home .rank-emblem-fallback")).toBeVisible();
  await expect(page.getByRole("link", { name: "开始刷题", exact: true })).toBeVisible();
});

test("all three roles share podium badges and retain their own navigation permissions", async ({ browser }) => {
  const signatures: unknown[] = [];
  for (const role of ["student", "teacher", "admin"] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, role);
    await page.goto(`/${role}/leaderboard`);
    await expect(page.locator(".rank-path-step")).toHaveCount(8);
    await page.setViewportSize({ width: 320, height: 900 });
    for (const score of await page.locator(".ladder-mobile-points").all()) {
      const box = await score.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    }
    await expect(page.locator(".ladder-hero-actions a").first()).toHaveAttribute("href", role === "student" ? "/student/problems" : `/${role}/practice`);
    if (role === "teacher") {
      await expect(page.getByRole("link", { name: "查看学生", exact: true })).toHaveAttribute("href", "/teacher/users");
      await expect(page.getByRole("link", { name: "管理学生头衔" })).toHaveCount(0);
    }
    if (role === "admin") await expect(page.getByRole("link", { name: "管理学生头衔" })).toHaveAttribute("href", "/admin/users");
    signatures.push(await page.locator(".podium-card").evaluateAll((cards) => cards.map((card) => ({
      user: card.getAttribute("data-ranking-user-id"),
      tier: card.querySelector(".rank-emblem")?.getAttribute("data-tier"),
      points: card.querySelector(".podium-points strong")?.textContent,
    }))));
    await context.close();
  }
  expect(signatures[0]).toEqual(signatures[1]);
  expect(signatures[0]).toEqual(signatures[2]);
});
