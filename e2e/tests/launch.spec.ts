import { test, expect } from "@playwright/test";
import { loginAsAlice } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await loginAsAlice(page);
});

test.describe("PipelineLaunchPage — controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/project/frontend/pipeline/Build%20%26%20Deploy");
    await expect(page.getByRole("button", { name: /launch pipeline/i })).toBeVisible();
  });

  test("renders the kebab title with emerald slash + the ref chip", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /build-deploy/i })).toBeVisible();
    await expect(page.locator(".chip", { hasText: "main" }).first()).toBeVisible();
  });

  test("TechSelect opens, lists options, applies selection (no native <select>)", async ({ page }) => {
    await expect(page.locator("select")).toHaveCount(0);

    await page.locator(".select-trigger").click();
    await expect(page.locator(".select-menu")).toBeVisible();
    await expect(page.getByRole("option", { name: "staging" })).toBeVisible();
    await expect(page.getByRole("option", { name: "production" })).toBeVisible();

    await page.getByRole("option", { name: "production" }).click();
    await expect(page.locator(".select-trigger")).toContainText("production");
  });

  test("Radio pills toggle the selected state", async ({ page }) => {
    const truePill = page.locator(".var-pill", { hasText: "true" });
    const falsePill = page.locator(".var-pill", { hasText: "false" });
    await expect(truePill).toHaveClass(/selected/);
    await falsePill.click();
    await expect(falsePill).toHaveClass(/selected/);
    await expect(truePill).not.toHaveClass(/selected/);
  });

  test("Esc closes the open TechSelect", async ({ page }) => {
    await page.locator(".select-trigger").click();
    await expect(page.locator(".select-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".select-menu")).not.toBeVisible();
  });
});

test.describe("PipelineLaunchPage — conditional needs", () => {
  test.beforeEach(async ({ page }) => {
    // Frontend App's Build & Deploy pipeline includes a NOTIFY_STAKEHOLDERS
    // variable gated by needs.ENVIRONMENT=production (see CI config).
    await page.goto("/project/frontend/pipeline/Build%20%26%20Deploy");
    await expect(page.getByRole("button", { name: /launch pipeline/i })).toBeVisible();
  });

  test("hides the gated variable when the trigger value is not satisfied", async ({ page }) => {
    await expect(page.getByText("NOTIFY_STAKEHOLDERS")).not.toBeVisible();
  });

  test("reveals the variable after switching the trigger key", async ({ page }) => {
    await page.locator(".select-trigger").click();
    await page.getByRole("option", { name: "production" }).click();
    await expect(page.getByText("NOTIFY_STAKEHOLDERS")).toBeVisible();
  });

  test("hides the variable again when the trigger flips back", async ({ page }) => {
    await page.locator(".select-trigger").click();
    await page.getByRole("option", { name: "production" }).click();
    await expect(page.getByText("NOTIFY_STAKEHOLDERS")).toBeVisible();

    await page.locator(".select-trigger").click();
    await page.getByRole("option", { name: "staging" }).click();
    await expect(page.getByText("NOTIFY_STAKEHOLDERS")).not.toBeVisible();
  });
});

test.describe("PipelineLaunchPage — trigger", () => {
  test("launching navigates to the run page with jobs visible", async ({ page }) => {
    await page.goto("/project/1/pipeline/Deploy");
    await page.getByRole("button", { name: /launch pipeline/i }).click();
    await expect(page).toHaveURL(/\/run\/\d+$/);
    // Jobs section header
    await expect(page.getByText(/^jobs/i).first()).toBeVisible();
  });
});
