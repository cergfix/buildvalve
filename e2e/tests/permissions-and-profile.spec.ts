import { test, expect } from "@playwright/test";
import { loginAsAlice, loginAsMockUser } from "./fixtures";

test.describe("per-pipeline permissions", () => {
  test("alice (devops group) can see Deploy Prod", async ({ page }) => {
    await loginAsAlice(page);
    await page.goto("/");
    await expect(page.getByText("Deploy Prod")).toBeVisible();
  });

  test("mock user (not in devops) cannot see Deploy Prod", async ({ page }) => {
    await loginAsMockUser(page);
    await page.goto("/");
    // Exact match — "Deploy" otherwise also matches "Deploy Prod" as a substring.
    await expect(page.getByText("Deploy", { exact: true })).toBeVisible();
    await expect(page.getByText("Deploy Prod")).not.toBeVisible();
  });
});

test.describe("profile + admin pages", () => {
  test("profile shows the signed-in email", async ({ page }) => {
    await loginAsAlice(page);
    await page.goto("/profile");
    await expect(page.getByText("alice@company.com", { exact: true })).toBeVisible();
  });

  test("admin page shows the loaded config with REDACTED secret values", async ({ page }) => {
    await loginAsAlice(page);
    await page.goto("/admin");
    await expect(page.getByText(/REDACTED/)).toBeVisible();
  });
});
