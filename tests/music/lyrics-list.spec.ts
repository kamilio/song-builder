/**
 * Tests for US-009: Lyrics List page (tree-aware, song count column).
 *
 * Verifies that:
 * - Table lists all non-deleted assistant messages with title, style, song count, date
 * - Song count column shows correct count (non-deleted songs per messageId)
 * - Text search filters by title or style in real time
 * - Clicking a row navigates to /lyrics/:messageId
 * - "New Lyrics" button navigates to /lyrics/new
 * - Soft-delete removes the entry from the table; reload — row still absent
 * - Style column hidden on mobile (<768px)
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
    await page.goto("/music/lyrics");
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

  test("song count column shows correct count per messageId", async ({
    page,
  }) => {
    // Morning Pop has 2 non-deleted songs (1 deleted doesn't count)
    // The song count cell has aria-label "N songs"
    await expect(page.getByRole("cell", { name: "2 songs" })).toBeVisible();

    // Midnight Jazz has 0 songs
    await expect(page.getByRole("cell", { name: "0 songs" })).toBeVisible();
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
    await expect(page).toHaveURL(/\/music\/lyrics\/fixture-multi-entry-1a$/);
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

  test("soft-delete persists after page reload — row still absent", async ({
    page,
  }) => {
    // Delete Morning Pop
    await page
      .getByRole("button", { name: "Delete Morning Pop" })
      .click();

    await expect(
      page.getByRole("cell", { name: "Morning Pop", exact: true })
    ).not.toBeVisible();

    // Reload the page
    await page.reload();

    // Morning Pop still absent after reload
    await expect(
      page.getByRole("cell", { name: "Morning Pop", exact: true })
    ).not.toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Midnight Jazz", exact: true })
    ).toBeVisible();
  });

  test("New Lyrics button navigates to /lyrics/new", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "New Lyrics" }).click();

    // Should navigate to /lyrics/new
    await expect(page).toHaveURL(/\/music\/lyrics\/new$/);
  });

  test("empty state message shown when no lyrics entries", async ({ page }) => {
    await seedFixture(page, emptyFixture);
    await page.goto("/music/lyrics");
    await expect(page.getByTestId("lyrics-list-empty")).toBeVisible();
    await expect(page.getByText(/No lyrics yet/)).toBeVisible();
    // Should include a link back to home
    await expect(
      page.getByRole("link", { name: /Start a new song from home/ })
    ).toBeVisible();
  });

  test("style column hidden on mobile (375x812)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Rows still show title
    await expect(
      page.getByRole("cell", { name: "Morning Pop", exact: true })
    ).toBeVisible();

    // Style column header should not be visible on mobile
    const styleHeader = page.getByRole("columnheader", { name: "Style" });
    await expect(styleHeader).toBeHidden();

    // Style cell values should also be hidden
    await expect(
      page.getByRole("cell", { name: "pop", exact: true })
    ).toBeHidden();
  });
});

test(
  "@screenshot:lyrics-list lyrics list page renders correctly with seeded data",
  async ({ page }) => {
    await screenshotPage(page, "/music/lyrics", multiEntryFixture, {
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
  await page.goto("/music/lyrics");

  await expect(
    page.getByRole("cell", { name: "Coffee Dreams", exact: true })
  ).toBeVisible();
  await page
    .getByRole("cell", { name: "Coffee Dreams", exact: true })
    .click();
  await expect(page).toHaveURL(/\/music\/lyrics\/fixture-msg-1a$/);
});

test(
  "@screenshot:lyrics-list-mobile lyrics list at 375x812 hides style column",
  async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await screenshotPage(page, "/music/lyrics", multiEntryFixture, {
      path: "screenshots/lyrics-list-mobile.png",
    });

    // Rows visible but style column header hidden
    await expect(
      page.getByRole("cell", { name: "Morning Pop", exact: true })
    ).toBeVisible();
    const styleHeader = page.getByRole("columnheader", { name: "Style" });
    await expect(styleHeader).toBeHidden();
  }
);
