import { test, expect } from "@playwright/test";

test("an unconfigured preview opens setup instead of the generic data-load error", async ({
  page,
}) => {
  await page.goto("/wines");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(
    page.getByRole("heading", { name: "서비스 연결 설정이 필요합니다" }),
  ).toBeVisible();
  await expect(page.getByText("잠시 연결을 확인해 주세요")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "가상 데모 둘러보기" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/unconfigured-preview.png",
    fullPage: true,
  });
});

test("private, login and callback paths reach setup without a database", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/purchases/new",
    "/wines/new",
    "/admin",
    "/login",
    "/welcome",
    "/reset-password",
    "/auth/callback?code=untrusted",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/setup$/);
    await expect(
      page.getByRole("heading", { name: "서비스 연결 설정이 필요합니다" }),
    ).toBeVisible();
  }
});

test("unconfigured APIs fail closed without exposing internal configuration or saving content", async ({
  request,
}) => {
  for (const path of [
    "/api/wines",
    "/api/analysis/receipt",
    "/api/auth/login",
  ]) {
    const res = await request.post(path, {
      headers: { Origin: "http://127.0.0.1:3101" },
      data: { name_ko: "not-saved", email: "example@example.test" },
    });
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("서비스 연결 설정");
    expect(JSON.stringify(body)).not.toContain("SUPABASE_");
  }
  const csrf = await request.post("/api/wines", {
    headers: { Origin: "https://evil.test" },
    data: {},
  });
  expect(csrf.status()).toBe(403);
});

test("the setup page links to a working public demo", async ({ page }) => {
  await page.goto("/setup");
  await page.getByRole("link", { name: "가상 데모 둘러보기" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator(".wine-card")).toHaveCount(4);
});
