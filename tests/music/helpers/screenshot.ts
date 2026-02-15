/**
 * Screenshot helper for Playwright tests.
 *
 * Seeds a fixture via storageService.import(), navigates to a page, then
 * captures a full-page screenshot. Intended for visual regression checks and
 * documentation of expected UI states.
 */

import type { Page } from "@playwright/test";
import type { StorageExport } from "../../src/music/lib/storage/types";
import { seedFixture } from "./seed";

export interface ScreenshotOptions {
  /** Path to write the screenshot file. Defaults to `screenshots/<pageName>.png`. */
  path?: string;
  /** Whether to capture the full scrollable page. Defaults to true. */
  fullPage?: boolean;
}

/**
 * Seed a fixture, navigate to a URL, and capture a full-page screenshot.
 *
 * @param page       - Playwright Page object
 * @param url        - The path to navigate to after seeding (e.g. "/music/lyrics")
 * @param fixture    - StorageExport data seeded via storageService.import()
 * @param options    - Screenshot options
 */
export async function screenshotPage(
  page: Page,
  url: string,
  fixture: StorageExport,
  options: ScreenshotOptions = {}
): Promise<Buffer> {
  // Seed state through the real import code path
  await seedFixture(page, fixture);

  // Navigate to the target page
  await page.goto(url);

  const { fullPage = true, path } = options;
  return page.screenshot({ fullPage, path });
}
