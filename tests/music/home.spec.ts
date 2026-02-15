/**
 * Tests for US-009: Shared home at / with Music/Image tab switcher.
 *
 * Verifies that:
 * - The root path / renders the SharedHome component with Music and Image tabs
 * - Music tab links to /music, Image tab links to /image
 * - Active tab highlighting reflects the current URL prefix
 * - No top-bar or breadcrumbs are shown on the shared home
 */

import { test, expect } from "@playwright/test";
import { clearStorage } from "./helpers/seed";

test.describe("Shared home page — tab switcher (US-009)", () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await page.goto("/");
  });

  test("shows Music tab linking to /music", async ({ page }) => {
    const musicTab = page.getByTestId("tab-music");
    await expect(musicTab).toBeVisible();
    await expect(musicTab).toHaveAttribute("href", "/music");
  });

  test("shows Image tab linking to /image", async ({ page }) => {
    const imageTab = page.getByTestId("tab-image");
    await expect(imageTab).toBeVisible();
    await expect(imageTab).toHaveAttribute("href", "/image");
  });

  test("Music tab is active (aria-current=page) when at /", async ({ page }) => {
    const musicTab = page.getByTestId("tab-music");
    await expect(musicTab).toHaveAttribute("aria-current", "page");
  });

  test("Image tab is not active when at /", async ({ page }) => {
    const imageTab = page.getByTestId("tab-image");
    await expect(imageTab).not.toHaveAttribute("aria-current", "page");
  });

  test("does not show breadcrumbs or top bar on shared home", async ({ page }) => {
    await expect(page.getByTestId("top-bar")).not.toBeVisible();
    await expect(page.getByLabel("Breadcrumb")).not.toBeVisible();
  });

  test("clicking Music tab navigates to /music", async ({ page }) => {
    await page.getByTestId("tab-music").click();
    await expect(page).toHaveURL("/music");
  });
});
