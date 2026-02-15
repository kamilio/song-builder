/**
 * Tests for US-029: Playwright tests for the Pinned Images page.
 *
 * Verifies that:
 * - Pinned page lists pinned images (imagePinnedFixture)
 * - Unpin from pinned page removes item from the list
 * - Empty state shown when no images are pinned
 *
 * All tests run with VITE_USE_MOCK_LLM=true (configured in playwright.config.ts).
 * Storage is seeded via window.imageStorageService.import() through the helpers.
 */

import { test, expect } from "@playwright/test";
import { seedImageFixture, clearImageStorage } from "./helpers/seed";
import { imageBaseFixture, imagePinnedFixture } from "../fixtures/index";

// ── Empty state ───────────────────────────────────────────────────────────────

test.describe("Pinned images page — empty state when no pinned images (US-025)", () => {
  test.beforeEach(async ({ page }) => {
    await clearImageStorage(page);
    await page.goto("/image/pinned");
  });

  test("shows empty state when no images are pinned", async ({ page }) => {
    await expect(page.getByTestId("pinned-images-empty")).toBeVisible();
  });

  test("does not show the pinned image list when empty", async ({ page }) => {
    await expect(page.getByTestId("pinned-image-list")).toHaveCount(0);
  });

  test("empty state contains a helpful message", async ({ page }) => {
    const emptyState = page.getByTestId("pinned-images-empty");
    await expect(emptyState).toContainText(/No pinned images/i);
  });
});

// ── Pinned images listed ──────────────────────────────────────────────────────

test.describe("Pinned images page — lists pinned images (US-025)", () => {
  test.beforeEach(async ({ page }) => {
    await seedImageFixture(page, imagePinnedFixture);
    await page.goto("/image/pinned");
  });

  test("shows pinned image list when images are pinned", async ({ page }) => {
    await expect(page.getByTestId("pinned-image-list")).toBeVisible();
  });

  test("does not show empty state when images are pinned", async ({ page }) => {
    await expect(page.getByTestId("pinned-images-empty")).toHaveCount(0);
  });

  test("lists one pinned image item for the imagePinnedFixture", async ({ page }) => {
    const items = page.getByTestId("pinned-image-item");
    await expect(items).toHaveCount(1);
  });

  test("each pinned image item contains an img element", async ({ page }) => {
    const firstItem = page.getByTestId("pinned-image-item").first();
    await expect(firstItem.locator("img")).toBeVisible();
  });

  test("each pinned image item has an Unpin button", async ({ page }) => {
    const firstItem = page.getByTestId("pinned-image-item").first();
    await expect(firstItem.getByTestId("unpin-btn")).toBeVisible();
  });

  test("Unpin button has correct aria-label", async ({ page }) => {
    const unpinBtn = page.getByTestId("unpin-btn").first();
    await expect(unpinBtn).toHaveAttribute("aria-label", "Unpin image");
  });
});

// ── Unpin from pinned page ────────────────────────────────────────────────────

test.describe("Pinned images page — unpin removes item from list (US-025)", () => {
  test("clicking Unpin removes item from the list immediately", async ({ page }) => {
    await seedImageFixture(page, imagePinnedFixture);
    await page.goto("/image/pinned");

    // One pinned item is visible
    const items = page.getByTestId("pinned-image-item");
    await expect(items).toHaveCount(1);

    await page.getByTestId("unpin-btn").first().click();

    // Item should be removed from the DOM
    await expect(items).toHaveCount(0);
  });

  test("clicking Unpin shows empty state when last item is removed", async ({ page }) => {
    await seedImageFixture(page, imagePinnedFixture);
    await page.goto("/image/pinned");

    await page.getByTestId("unpin-btn").first().click();

    // Empty state should now be shown
    await expect(page.getByTestId("pinned-images-empty")).toBeVisible();
  });

  test("clicking Unpin updates storage to pinned=false", async ({ page }) => {
    const PINNED_ITEM_ID = "fixture-img-pinned-item-1";

    await seedImageFixture(page, imagePinnedFixture);
    await page.goto("/image/pinned");

    await page.getByTestId("unpin-btn").first().click();

    const item = await page.evaluate((itemId: string) => {
      return window.imageStorageService.getItem(itemId);
    }, PINNED_ITEM_ID);

    expect(item).not.toBeNull();
    expect(item!.pinned).toBe(false);
  });

  test("unpinning one item leaves other pinned items in the list", async ({ page }) => {
    // Build a fixture with two pinned items so we can verify only one is removed
    const twoPinnedFixture = {
      ...imagePinnedFixture,
      items: [
        {
          id: "fixture-img-pinned-item-1",
          generationId: "fixture-img-pinned-gen-1",
          url: "https://pfst.cf2.poecdn.net/base/image/a8b6589b3a89a746bffd7a48afe5587953e16380dc82a712eb05f20149d7121c?w=1024&h=1024",
          pinned: true,
          deleted: false,
          createdAt: "2026-01-11T14:01:05.000Z",
        },
        {
          id: "fixture-img-pinned-item-2",
          generationId: "fixture-img-pinned-gen-1",
          url: "https://pfst.cf2.poecdn.net/base/image/3b4ad274cac34e532177281ef1458c2dbf7f8cf20b8f2c7cd909676760d6f079?w=1024&h=1024",
          pinned: true,
          deleted: false,
          createdAt: "2026-01-11T14:01:06.000Z",
        },
      ],
    };

    await seedImageFixture(page, twoPinnedFixture);
    await page.goto("/image/pinned");

    // Two pinned items
    await expect(page.getByTestId("pinned-image-item")).toHaveCount(2);

    // Unpin the first one
    await page.getByTestId("unpin-btn").first().click();

    // One should remain
    await expect(page.getByTestId("pinned-image-item")).toHaveCount(1);
  });
});

// ── Pinned page with base fixture (no pinned items) ───────────────────────────

test.describe("Pinned images page — base fixture has no pinned items (US-025)", () => {
  test("shows empty state when seeded with imageBaseFixture (all items unpinned)", async ({ page }) => {
    await seedImageFixture(page, imageBaseFixture);
    await page.goto("/image/pinned");

    await expect(page.getByTestId("pinned-images-empty")).toBeVisible();
    await expect(page.getByTestId("pinned-image-list")).toHaveCount(0);
  });
});
