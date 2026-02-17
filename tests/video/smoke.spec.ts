/**
 * US-051: Playwright smoke test for the video feature critical paths.
 *
 * Verifies that each major video page renders its key elements so regressions
 * are caught early. All tests run against the dev server with
 * VITE_USE_MOCK_LLM=true (configured in playwright.config.ts).
 *
 * Pages covered:
 *   1. / (SharedHome) — Video tab present
 *   2. /video          — page title, prompt textarea, generate button
 *   3. /video/scripts  — script grid and New Script card
 *   4. /video/templates — Characters tab and New Variable button
 *   5. /video/videos   — page heading "All Videos"
 *   6. /video/videos/pinned — page heading "Pinned Videos"
 */

import { test, expect } from "@playwright/test";

test.describe("Video feature smoke test (US-051)", () => {
  test.beforeEach(async ({ page }) => {
    // Start from a clean slate for every test so they are fully isolated.
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  // ── 1. SharedHome — Video tab ──────────────────────────────────────────────
  test("shared home has Video tab", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("tab-video")).toBeVisible();
  });

  // ── 2. /video — page title, textarea, generate button ─────────────────────
  test("/video shows title, prompt textarea, and generate button", async ({
    page,
  }) => {
    await page.goto("/video");

    // Page title
    await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();

    // Prompt textarea
    await expect(page.getByTestId("video-home-prompt")).toBeVisible();

    // Generate button — disabled with empty textarea
    const generateBtn = page.getByTestId("video-home-generate-btn");
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeDisabled();
  });

  // ── 3. /video/scripts — script grid and New Script card ───────────────────
  test("/video/scripts shows scripts grid and New Script card", async ({
    page,
  }) => {
    await page.goto("/video/scripts");

    await expect(page.getByTestId("scripts-grid")).toBeVisible();
    await expect(page.getByTestId("new-script-card")).toBeVisible();
  });

  // ── 4. /video/templates — Characters tab and New Variable button ──────────
  test("/video/templates shows Characters tab and New Variable button", async ({
    page,
  }) => {
    await page.goto("/video/templates");

    await expect(page.getByTestId("templates-tab-characters")).toBeVisible();
    await expect(page.getByTestId("new-variable-btn")).toBeVisible();
  });

  // ── 5. /video/videos — page heading ───────────────────────────────────────
  test("/video/videos shows All Videos heading", async ({ page }) => {
    await page.goto("/video/videos");

    await expect(
      page.getByRole("heading", { name: "All Videos" })
    ).toBeVisible();
  });

  // ── 6. /video/videos/pinned — page heading ────────────────────────────────
  test("/video/videos/pinned shows Pinned Videos heading", async ({ page }) => {
    await page.goto("/video/videos/pinned");

    await expect(
      page.getByRole("heading", { name: "Pinned Videos" })
    ).toBeVisible();
  });
});
