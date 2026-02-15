/**
 * Seed helper for Playwright tests.
 *
 * Uses `storageService.import()` via page.evaluate — the same function the
 * Settings import UI calls — to ensure test state flows through the real code path.
 */

import type { Page } from "@playwright/test";
import type { StorageExport } from "../../src/music/lib/storage/types";

/**
 * Navigate to the app root, then seed localStorage with the given fixture data
 * by calling `window.storageService.import(fixture)` in the page context.
 *
 * The page must already expose `window.storageService` (done in main.tsx).
 * If `navigate` is false the caller is responsible for navigation before seeding.
 */
export async function seedFixture(
  page: Page,
  fixture: StorageExport,
  { navigate = true }: { navigate?: boolean } = {}
): Promise<void> {
  if (navigate) {
    await page.goto("/");
    // Clear any existing state before seeding so tests are isolated
    await page.evaluate(() => localStorage.clear());
  }
  await page.evaluate((data: StorageExport) => {
    window.storageService.import(data);
  }, fixture);
}

/**
 * Clear localStorage and reload the page to a clean state.
 * Useful in beforeEach hooks.
 */
export async function clearStorage(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
}
