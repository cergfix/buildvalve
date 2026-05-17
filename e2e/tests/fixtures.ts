import { type Page, expect } from "@playwright/test";

/**
 * Sign in as alice@company.com (devops group) via the local-auth provider.
 * Uses the test config baked into CI (see .github/workflows/ci.yml smoke-test job).
 */
export async function loginAsAlice(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("alice@company.com");
  await page.locator('input[type="password"]').fill("secret123");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(?!login)/);
}

/**
 * Sign in via the mock provider (one click, no credentials). Lands you in as
 * test@test.com (group: test — does NOT have devops permissions).
 */
export async function loginAsMockUser(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /sign in with mock login/i }).click();
  await page.waitForURL(/\/(?!login)/);
}

/**
 * Wait for the projects dashboard to fully render with at least the first
 * project visible.
 */
export async function expectDashboardLoaded(page: Page) {
  await expect(page.getByText("Test Project (GitLab)")).toBeVisible();
}
