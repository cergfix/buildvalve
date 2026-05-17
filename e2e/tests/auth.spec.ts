import { test, expect } from "@playwright/test";
import { loginAsAlice, loginAsMockUser, expectDashboardLoaded } from "./fixtures";

test.describe("login page", () => {
  test("renders brand, both providers and the 'or' separator", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("BUILDVALVE")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in with mock login/i })).toBeVisible();
    await expect(page.getByText(/—\s*or\s*—/)).toBeVisible();
  });

  test("local login with wrong password shows an error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("alice@company.com");
    await page.locator('input[type="password"]').fill("wrong");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator(".text-rose").first()).toBeVisible();
  });

  test("local login with the right credentials redirects to the dashboard", async ({ page }) => {
    await loginAsAlice(page);
    await expectDashboardLoaded(page);
  });

  test("mock provider button signs in as test@test.com", async ({ page }) => {
    await loginAsMockUser(page);
    await page.goto("/profile");
    await expect(page.getByText("test@test.com")).toBeVisible();
  });
});

test.describe("logout", () => {
  test("clicking logout returns to /login", async ({ page }) => {
    await loginAsAlice(page);
    await page.getByRole("button", { name: /^logout$/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("login error query strings", () => {
  for (const [code, match] of [
    ["access_denied", /access denied/i],
    ["oauth_denied", /cancelled or denied/i],
    ["session_error", /session error/i],
    ["saml_error", /SAML authentication failed/i],
  ] as const) {
    test(`?error=${code} shows a contextual message`, async ({ page }) => {
      await page.goto(`/login?error=${code}`);
      await expect(page.getByText(match)).toBeVisible();
    });
  }
});
