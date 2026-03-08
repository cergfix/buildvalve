import { test, expect } from "@playwright/test";
import { loginAsAlice } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await loginAsAlice(page);
});

test.describe("PipelineHistoryPage", () => {
  test("renders the stats grid, filter pills and runs list", async ({ page }) => {
    // Trigger one run so there's at least one entry to filter.
    await page.goto("/project/1/pipeline/Deploy");
    await page.getByRole("button", { name: /launch pipeline/i }).click();
    await page.waitForURL(/\/run\/\d+$/);

    await page.goto("/project/1/pipeline/Deploy/history");
    await expect(page.getByText("total runs")).toBeVisible();
    await expect(page.locator(".stat-box")).toHaveCount(4);
    await expect(page.getByRole("button", { name: /^all/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^success/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^failed/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^running/i })).toBeVisible();
  });

  test("filter pill narrows visible runs", async ({ page }) => {
    await page.goto("/project/1/pipeline/Deploy/history");
    await page.getByRole("button", { name: /^failed/i }).click();
    // No failed runs in the freshly-launched mock state — empty message should appear.
    await expect(page.getByText(/no runs matching/i)).toBeVisible();
  });

  test("clicking a row navigates to the run page", async ({ page }) => {
    await page.goto("/project/1/pipeline/Deploy");
    await page.getByRole("button", { name: /launch pipeline/i }).click();
    // Wait for the post-trigger navigation to settle so we read the real run id.
    await page.waitForURL(/\/run\/\d+$/);
    const id = page.url().split("/").pop();

    await page.goto("/project/1/pipeline/Deploy/history");
    await page.getByText(`#${id}`).first().click();
    await expect(page).toHaveURL(new RegExp(`/run/${id}$`));
  });

  test("'launch new' button in the head opens the launch page", async ({ page }) => {
    await page.goto("/project/1/pipeline/Deploy/history");
    await page.getByRole("button", { name: /launch new/i }).click();
    await expect(page).toHaveURL(/\/pipeline\/Deploy$/);
  });
});

test.describe("RecentRunsPage", () => {
  test("sidebar 'recent runs' link opens the page and lists runs", async ({ page }) => {
    // Trigger a run so there's something to show.
    await page.goto("/project/1/pipeline/Deploy");
    await page.getByRole("button", { name: /launch pipeline/i }).click();
    await page.waitForURL(/\/run\/\d+$/);

    await page.goto("/");
    await page.getByRole("link", { name: /recent runs/i }).click();
    await expect(page).toHaveURL(/\/recent-runs$/);
    // Scope to the page heading — "recent runs" also appears in the sidebar nav.
    await expect(page.getByRole("heading", { name: /recent runs/i })).toBeVisible();
    // At least one row visible.
    await expect(page.locator(".history-row").first()).toBeVisible();
  });
});
