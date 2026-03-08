import { test, expect } from "@playwright/test";
import { loginAsAlice, expectDashboardLoaded } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await loginAsAlice(page);
});

test("shows projects from all three providers + their badges", async ({ page }) => {
  await page.goto("/");
  await expectDashboardLoaded(page);
  await expect(page.getByText("Frontend App (GitHub)")).toBeVisible();
  await expect(page.getByText("API Service (CircleCI)")).toBeVisible();
  // Provider chips
  await expect(page.locator('.chip[data-tone="amber"]').filter({ hasText: "gitlab" }).first()).toBeVisible();
  await expect(page.locator('.chip[data-tone="violet"]').filter({ hasText: "github" }).first()).toBeVisible();
  await expect(page.locator('.chip[data-tone="emerald"]').filter({ hasText: "circleci" }).first()).toBeVisible();
});

test("renders the pipeline names from config", async ({ page }) => {
  await page.goto("/");
  // Exact match — "Deploy" otherwise also matches "Deploy Prod".
  await expect(page.getByText("Deploy", { exact: true })).toBeVisible();
  await expect(page.getByText("Build & Deploy", { exact: true })).toBeVisible();
  await expect(page.getByText("Release", { exact: true })).toBeVisible();
});

test("search filters projects + pipelines client-side", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/search projects/i).fill("frontend");
  await expect(page.getByText("Frontend App (GitHub)")).toBeVisible();
  await expect(page.getByText("Test Project (GitLab)")).not.toBeVisible();
});

test("renders external links in the sidebar", async ({ page }) => {
  await page.goto("/");
  const grafana = page.getByRole("link", { name: /grafana/i });
  await expect(grafana).toHaveAttribute("href", "https://grafana.example.com");
  await expect(grafana).toHaveAttribute("target", "_blank");
});

test("brand wordmark links back to the dashboard", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/profile/);
  await page.getByRole("link", { name: /back to pipelines/i }).click();
  await expect(page).toHaveURL(/\/$/);
});

test.describe("how-to-launch panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Clear any stored dismissal so the panel renders.
    await page.evaluate(() => localStorage.removeItem("buildvalve.flowPanelDismissed"));
    await page.reload();
  });

  test("renders the four numbered cards by default", async ({ page }) => {
    await expect(page.getByText("how to launch")).toBeVisible();
    await expect(page.locator(".flow-card")).toHaveCount(4);
  });

  test("dismiss button hides the panel and persists across reload", async ({ page }) => {
    await page.getByLabel(/hide how-to-launch/i).click();
    await expect(page.getByText("how to launch")).not.toBeVisible();

    await page.reload();
    await expect(page.getByText("how to launch")).not.toBeVisible();

    // Confirm the storage flag is set.
    const flag = await page.evaluate(() => localStorage.getItem("buildvalve.flowPanelDismissed"));
    expect(flag).toBe("1");
  });
});

test.describe("api status indicator", () => {
  test("shows 'api: connected' once the recent-pipelines query succeeds", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/api:\s*connected/)).toBeVisible();
  });
});
