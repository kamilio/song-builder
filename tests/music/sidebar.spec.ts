/**
 * Tests for US-002: Top-bar navigation (breadcrumbs + circular NavMenu).
 *
 * Replaces the previous sidebar navigation tests (US-005). Verifies that:
 * - The sidebar is removed; no sidebar component is present
 * - The top bar is visible on all non-Home pages
 * - The NavMenu circular button opens a dropdown with the expected items
 * - All three navigation items route correctly
 * - Report Bug shows a stub toast
 *
 * State is seeded via storageService.import() — the same code path as the
 * real Settings import UI — so test state mirrors real user behaviour.
 */

import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import { baseFixture } from "../fixtures/index";

const PAGES_WITH_TOP_BAR = [
  "/music/lyrics",
  "/music/lyrics/new",
  "/music/pinned",
  "/settings",
] as const;

test.describe("Top-bar navigation (US-002)", () => {
  test.beforeEach(async ({ page }) => {
    await seedFixture(page, baseFixture);
  });

  test("sidebar is absent on all pages", async ({ page }) => {
    for (const route of PAGES_WITH_TOP_BAR) {
      await page.goto(route);
      // The old sidebar had a nav with "Studio" text and nav links.
      // Confirm no element with the old sidebar nav structure exists.
      // The new top-bar also has a "Studio" link, but it's in a <header> not a sidebar nav.
      // The sidebar was a <nav> with w-56 and min-h-screen; we verify there is no sidebar nav.
      const sidebarNav = page.locator("nav.w-56, nav[class*='w-56']");
      await expect(sidebarNav).toHaveCount(0);
    }
  });

  test("top bar is visible on all non-Home pages", async ({ page }) => {
    for (const route of PAGES_WITH_TOP_BAR) {
      await page.goto(route);
      await expect(page.getByTestId("top-bar")).toBeVisible();
    }
  });

  test("top bar is absent on the Home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("top-bar")).not.toBeVisible();
  });

  test("NavMenu trigger button opens the dropdown", async ({ page }) => {
    await page.goto("/music/lyrics");
    const trigger = page.getByTestId("nav-menu-trigger");
    await expect(trigger).toBeVisible();
    await expect(page.getByTestId("nav-menu-dropdown")).not.toBeVisible();

    await trigger.click();
    await expect(page.getByTestId("nav-menu-dropdown")).toBeVisible();
  });

  test("NavMenu contains All Lyrics, Pinned Songs, Settings, Report Bug", async ({ page }) => {
    await page.goto("/music/lyrics");
    await page.getByTestId("nav-menu-trigger").click();

    const dropdown = page.getByTestId("nav-menu-dropdown");
    await expect(dropdown.getByTestId("nav-menu-lyrics")).toBeVisible();
    await expect(dropdown.getByTestId("nav-menu-pinned")).toBeVisible();
    await expect(dropdown.getByTestId("nav-menu-settings")).toBeVisible();
    await expect(dropdown.getByTestId("nav-menu-report-bug")).toBeVisible();
  });

  test("All Lyrics item navigates to /lyrics", async ({ page }) => {
    await page.goto("/settings");
    await page.getByTestId("nav-menu-trigger").click();
    await page.getByTestId("nav-menu-lyrics").click();
    await expect(page).toHaveURL("/music/lyrics");
  });

  test("Pinned Songs item navigates to /pinned", async ({ page }) => {
    await page.goto("/music/lyrics");
    await page.getByTestId("nav-menu-trigger").click();
    await page.getByTestId("nav-menu-pinned").click();
    await expect(page).toHaveURL("/music/pinned");
  });

  test("Settings item navigates to /settings", async ({ page }) => {
    await page.goto("/music/lyrics");
    await page.getByTestId("nav-menu-trigger").click();
    await page.getByTestId("nav-menu-settings").click();
    await expect(page).toHaveURL("/settings");
  });

  test("Report Bug shows a stub toast and does not navigate", async ({ page }) => {
    await page.goto("/music/lyrics");
    await page.getByTestId("nav-menu-trigger").click();
    await page.getByTestId("nav-menu-report-bug").click();

    // A toast should appear
    await expect(page.getByTestId("report-bug-toast")).toBeVisible();
    // URL should remain unchanged
    await expect(page).toHaveURL("/music/lyrics");
  });

  test("NavMenu closes when clicking outside", async ({ page }) => {
    await page.goto("/music/lyrics");
    await page.getByTestId("nav-menu-trigger").click();
    await expect(page.getByTestId("nav-menu-dropdown")).toBeVisible();

    // Click outside the menu
    await page.locator("h1").click();
    await expect(page.getByTestId("nav-menu-dropdown")).not.toBeVisible();
  });
});
