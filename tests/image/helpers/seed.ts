/**
 * Seed helper for image Playwright tests.
 *
 * Uses `imageStorageService.import()` via page.evaluate to seed image
 * localStorage state before tests run.
 */

import type { Page } from "@playwright/test";
import type { ImageStorageExport } from "../../../src/image/lib/storage/types";

/**
 * Navigate to the app root, clear localStorage, then seed image fixture data
 * by calling `window.imageStorageService.import(fixture)` in the page context.
 */
export async function seedImageFixture(
  page: Page,
  fixture: ImageStorageExport,
  { navigate = true }: { navigate?: boolean } = {}
): Promise<void> {
  if (navigate) {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  }
  await page.evaluate((data: ImageStorageExport) => {
    window.imageStorageService.import(data);
  }, fixture);
}

/**
 * Clear localStorage and navigate to a clean state.
 */
export async function clearImageStorage(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
}
