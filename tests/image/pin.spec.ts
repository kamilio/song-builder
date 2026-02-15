/**
 * Tests for US-029: Playwright tests for image actions — pin/unpin.
 *
 * Verifies that:
 * - Pin button on an image card toggles the item to pinned state in storage
 * - Unpin button on an image card removes the pinned state from storage
 * - Pin button visual state reflects the current pinned state
 * - Thumbnail panel shows the pin indicator when an item is pinned
 *
 * All tests run with VITE_USE_MOCK_LLM=true (configured in playwright.config.ts).
 * Storage is seeded via window.imageStorageService.import() through the helpers.
 */

import { test, expect } from "@playwright/test";
import { seedImageFixture } from "./helpers/seed";
import { imageBaseFixture } from "../fixtures/index";

// ── Session/item IDs from fixtures ────────────────────────────────────────────

const BASE_SESSION_ID = "fixture-img-session-1";
const FIRST_ITEM_ID = "fixture-img-item-1";

// ── Pin toggle — image to pinned state ────────────────────────────────────────

test.describe("Pin action — pin toggles image to pinned state in storage (US-024)", () => {
  test.beforeEach(async ({ page }) => {
    await seedImageFixture(page, imageBaseFixture);
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);
  });

  test("pin button is visible on each image card", async ({ page }) => {
    const pinBtns = page.getByTestId("pin-btn");
    await expect(pinBtns).toHaveCount(3);
  });

  test("pin button shows 'Pin' label when image is unpinned", async ({ page }) => {
    const firstPinBtn = page.getByTestId("pin-btn").first();
    await expect(firstPinBtn).toContainText("Pin");
    await expect(firstPinBtn).not.toContainText("Unpin");
  });

  test("pin button has aria-pressed=false when image is unpinned", async ({ page }) => {
    const firstPinBtn = page.getByTestId("pin-btn").first();
    await expect(firstPinBtn).toHaveAttribute("aria-pressed", "false");
  });

  test("clicking Pin on unpinned image updates storage to pinned=true", async ({ page }) => {
    const firstPinBtn = page.getByTestId("pin-btn").first();
    await firstPinBtn.click();

    // Verify storage was updated
    const item = await page.evaluate((itemId: string) => {
      return window.imageStorageService.getItem(itemId);
    }, FIRST_ITEM_ID);

    expect(item).not.toBeNull();
    expect(item!.pinned).toBe(true);
  });

  test("clicking Pin on unpinned image changes button label to 'Unpin'", async ({ page }) => {
    const firstPinBtn = page.getByTestId("pin-btn").first();
    await firstPinBtn.click();

    await expect(firstPinBtn).toContainText("Unpin");
    await expect(firstPinBtn).not.toContainText(/^Pin$/);
  });

  test("clicking Pin on unpinned image sets aria-pressed=true", async ({ page }) => {
    const firstPinBtn = page.getByTestId("pin-btn").first();
    await firstPinBtn.click();

    await expect(firstPinBtn).toHaveAttribute("aria-pressed", "true");
  });
});

// ── Unpin — remove pinned state from storage ──────────────────────────────────

test.describe("Unpin action — unpin removes pinned state from storage (US-024)", () => {
  test.beforeEach(async ({ page }) => {
    // Seed base fixture and then manually pin the first item before navigating
    await seedImageFixture(page, imageBaseFixture);
    // Pin the first item directly in storage before the page loads
    await page.evaluate((itemId: string) => {
      window.imageStorageService.updateItem(itemId, { pinned: true });
    }, FIRST_ITEM_ID);
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);
  });

  test("pin button shows 'Unpin' label when image is pinned", async ({ page }) => {
    // The first item was pinned in beforeEach; the main pane renders latest-step items.
    // The first image card in the main pane (latest stepId) corresponds to item-1.
    const firstPinBtn = page.getByTestId("pin-btn").first();
    await expect(firstPinBtn).toContainText("Unpin");
  });

  test("pin button has aria-pressed=true when image is pinned", async ({ page }) => {
    const firstPinBtn = page.getByTestId("pin-btn").first();
    await expect(firstPinBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("clicking Unpin on a pinned image updates storage to pinned=false", async ({ page }) => {
    const firstPinBtn = page.getByTestId("pin-btn").first();
    await firstPinBtn.click();

    const item = await page.evaluate((itemId: string) => {
      return window.imageStorageService.getItem(itemId);
    }, FIRST_ITEM_ID);

    expect(item).not.toBeNull();
    expect(item!.pinned).toBe(false);
  });

  test("clicking Unpin on a pinned image changes button label back to 'Pin'", async ({ page }) => {
    const firstPinBtn = page.getByTestId("pin-btn").first();
    await firstPinBtn.click();

    await expect(firstPinBtn).toContainText("Pin");
    await expect(firstPinBtn).not.toContainText("Unpin");
  });

  test("clicking Unpin on a pinned image sets aria-pressed=false", async ({ page }) => {
    const firstPinBtn = page.getByTestId("pin-btn").first();
    await firstPinBtn.click();

    await expect(firstPinBtn).toHaveAttribute("aria-pressed", "false");
  });
});

// ── Thumbnail pin indicator ───────────────────────────────────────────────────

test.describe("Pin action — thumbnail panel reflects pinned state after toggle (US-024)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedImageFixture(page, imageBaseFixture);
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);
  });

  test("no pin indicator on thumbnails before pinning", async ({ page }) => {
    const panel = page.getByTestId("thumbnail-panel");
    await expect(panel.getByTestId("thumbnail-pin-indicator")).toHaveCount(0);
  });

  test("pin indicator appears on thumbnail after pinning an image", async ({ page }) => {
    const panel = page.getByTestId("thumbnail-panel");

    // Pin the first image card
    const firstPinBtn = page.getByTestId("pin-btn").first();
    await firstPinBtn.click();

    // Thumbnail panel should now show a pin indicator
    await expect(panel.getByTestId("thumbnail-pin-indicator")).toHaveCount(1);
  });

  test("pin indicator disappears from thumbnail after unpinning", async ({ page }) => {
    // Pin the first item
    const firstPinBtn = page.getByTestId("pin-btn").first();
    await firstPinBtn.click();

    const panel = page.getByTestId("thumbnail-panel");
    await expect(panel.getByTestId("thumbnail-pin-indicator")).toHaveCount(1);

    // Unpin it
    await firstPinBtn.click();

    await expect(panel.getByTestId("thumbnail-pin-indicator")).toHaveCount(0);
  });
});
