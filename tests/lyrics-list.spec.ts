/**
 * Tests for US-008: Lyrics List page.
 *
 * Verifies that:
 * - Table lists all non-deleted entries with title and style columns
 * - Text search filters by title or style in real time
 * - Clicking a row navigates to the Lyrics Generator for that entry
 * - "New Lyrics" button creates a blank entry and navigates to the generator
 * - Soft-delete removes the entry from the table
 * - Screenshot test with seeded fixture data
 *
 * State is seeded via storageService.import() — the same code path as the
 * real Settings import UI.
 */

import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import { screenshotPage } from "./helpers/screenshot";
import {
  multiEntryFixture,
  emptyFixture,
  baseFixture,
} from "../fixtures/index";

test.describe("Lyrics List page", () => {
  test.beforeEach(async ({ page }) => {
    await seedFixture(page, multiEntryFixture);
    await page.goto("/lyrics");
  });

  test("table lists non-deleted entries with title and style columns", async ({
    page,
  }) => {
    // multiEntryFixture has 3 entries; 1 is soft-deleted → 2 visible
    // Use exact:true to avoid matching the delete button aria-label
    await expect(
      page.getByRole("cell", { name: "Morning Pop", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Midnight Jazz", exact: true })
    ).toBeVisible();

    // Style column values
    await expect(
      page.getByRole("cell", { name: "pop", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "jazz", exact: true })
    ).toBeVisible();

    // Soft-deleted entry should NOT appear
    await expect(
      page.getByRole("cell", { name: "Deleted Entry", exact: true })
    ).not.toBeVisible();
  });

  test("search filters entries by title in real time", async ({ page }) => {
    const search = page.getByRole("textbox", { name: "Search lyrics" });
    await search.fill("Morning");

    await expect(
      page.getByRole("cell", { name: "Morning Pop", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Midnight Jazz", exact: true })
    ).not.toBeVisible();
  });

  test("search filters entries by style in real time", async ({ page }) => {
    const search = page.getByRole("textbox", { name: "Search lyrics" });
    await search.fill("jazz");

    await expect(
      page.getByRole("cell", { name: "Midnight Jazz", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Morning Pop", exact: true })
    ).not.toBeVisible();
  });

  test("search with no matches shows empty state message", async ({ page }) => {
    const search = page.getByRole("textbox", { name: "Search lyrics" });
    await search.fill("xyznotfound");

    await expect(page.getByText("No entries match your search.")).toBeVisible();
  });

  test("clicking a row navigates to Lyrics Generator for that entry", async ({
    page,
  }) => {
    await page
      .getByRole("cell", { name: "Morning Pop", exact: true })
      .click();
    await expect(page).toHaveURL(/\/lyrics\/fixture-multi-entry-1a$/);
  });

  test("soft-delete removes entry from table", async ({ page }) => {
    // Both entries visible before delete
    await expect(
      page.getByRole("cell", { name: "Morning Pop", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Midnight Jazz", exact: true })
    ).toBeVisible();

    // Click the delete button for "Morning Pop"
    await page
      .getByRole("button", { name: "Delete Morning Pop" })
      .click();

    // Morning Pop should be gone; Midnight Jazz still visible
    await expect(
      page.getByRole("cell", { name: "Morning Pop", exact: true })
    ).not.toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Midnight Jazz", exact: true })
    ).toBeVisible();

    // Verify it is soft-deleted in storage (not hard-removed)
    const stored = await page.evaluate(() => {
      return window.storageService.export();
    });
    const deleted = stored.messages.find(
      (m: { id: string }) => m.id === "fixture-multi-entry-1a"
    );
    expect(deleted).toBeDefined();
    expect((deleted as { deleted: boolean }).deleted).toBe(true);
  });

  test("New Lyrics button navigates to /lyrics/new", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "New Lyrics" }).click();

    // Should navigate to /lyrics/new
    await expect(page).toHaveURL(/\/lyrics\/new$/);
  });

  test("empty state message shown when no lyrics entries", async ({ page }) => {
    await seedFixture(page, emptyFixture);
    await page.goto("/lyrics");
    await expect(
      page.getByText(/Click "New Lyrics" to get started/)
    ).toBeVisible();
  });
});

test(
  "@screenshot:lyrics-list lyrics list page renders correctly with seeded data",
  async ({ page }) => {
    await screenshotPage(page, "/lyrics", multiEntryFixture, {
      path: "screenshots/lyrics-list.png",
    });

    // Verify key elements are visible
    await expect(
      page.getByRole("heading", { name: "Lyrics List" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New Lyrics" })
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Search lyrics" })
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Morning Pop", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Midnight Jazz", exact: true })
    ).toBeVisible();
  }
);

test("Lyrics List: single entry fixture - row click navigates correctly", async ({
  page,
}) => {
  await seedFixture(page, baseFixture);
  await page.goto("/lyrics");

  await expect(
    page.getByRole("cell", { name: "Coffee Dreams", exact: true })
  ).toBeVisible();
  await page
    .getByRole("cell", { name: "Coffee Dreams", exact: true })
    .click();
  await expect(page).toHaveURL(/\/lyrics\/fixture-msg-1a$/);
});
