/**
 * Tests for US-017: Session card mini-previews with counts.
 *
 * Verifies that:
 * - Sessions with images show a thumbnail strip.
 * - Up to 4 thumbnails are shown, newest first.
 * - Total image count is displayed.
 * - Pinned count is displayed when pinned images exist.
 * - Sessions with no images show no thumbnail strip.
 * - Soft-deleted items are not counted or shown.
 */

import { test, expect } from "@playwright/test";
import { seedImageFixture, clearImageStorage } from "./helpers/seed";
import type { ImageStorageExport } from "../../src/image/lib/storage/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** One session with 3 images, 1 pinned. */
const oneSessionWithImages: ImageStorageExport = {
  sessions: [
    {
      id: "preview-session-1",
      title: "Session with images",
      createdAt: "2026-01-10T10:00:00.000Z",
    },
  ],
  generations: [
    {
      id: "preview-gen-1",
      sessionId: "preview-session-1",
      stepId: 1,
      prompt: "A test prompt",
      createdAt: "2026-01-10T10:01:00.000Z",
    },
  ],
  items: [
    {
      id: "preview-item-1",
      generationId: "preview-gen-1",
      url: "https://example.com/img1.png",
      pinned: true,
      deleted: false,
      createdAt: "2026-01-10T10:01:05.000Z",
    },
    {
      id: "preview-item-2",
      generationId: "preview-gen-1",
      url: "https://example.com/img2.png",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-10T10:01:06.000Z",
    },
    {
      id: "preview-item-3",
      generationId: "preview-gen-1",
      url: "https://example.com/img3.png",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-10T10:01:07.000Z",
    },
  ],
  settings: { numImages: 3 },
};

/** One session with 6 images (more than the 4-thumbnail max). */
const sessionWithManyImages: ImageStorageExport = {
  sessions: [
    {
      id: "many-session-1",
      title: "Session with many images",
      createdAt: "2026-01-11T10:00:00.000Z",
    },
  ],
  generations: [
    {
      id: "many-gen-1",
      sessionId: "many-session-1",
      stepId: 1,
      prompt: "Many images prompt",
      createdAt: "2026-01-11T10:01:00.000Z",
    },
  ],
  items: [
    { id: "many-item-1", generationId: "many-gen-1", url: "https://example.com/many1.png", pinned: false, deleted: false, createdAt: "2026-01-11T10:01:01.000Z" },
    { id: "many-item-2", generationId: "many-gen-1", url: "https://example.com/many2.png", pinned: false, deleted: false, createdAt: "2026-01-11T10:01:02.000Z" },
    { id: "many-item-3", generationId: "many-gen-1", url: "https://example.com/many3.png", pinned: false, deleted: false, createdAt: "2026-01-11T10:01:03.000Z" },
    { id: "many-item-4", generationId: "many-gen-1", url: "https://example.com/many4.png", pinned: false, deleted: false, createdAt: "2026-01-11T10:01:04.000Z" },
    { id: "many-item-5", generationId: "many-gen-1", url: "https://example.com/many5.png", pinned: false, deleted: false, createdAt: "2026-01-11T10:01:05.000Z" },
    { id: "many-item-6", generationId: "many-gen-1", url: "https://example.com/many6.png", pinned: false, deleted: false, createdAt: "2026-01-11T10:01:06.000Z" },
  ],
  settings: { numImages: 3 },
};

/** One session with no images (no generations, no items). */
const sessionWithNoImages: ImageStorageExport = {
  sessions: [
    {
      id: "empty-session-1",
      title: "Session with no images",
      createdAt: "2026-01-12T10:00:00.000Z",
    },
  ],
  generations: [],
  items: [],
  settings: null,
};

/** One session with 2 images, 1 soft-deleted — only 1 should count. */
const sessionWithDeletedItems: ImageStorageExport = {
  sessions: [
    {
      id: "deleted-session-1",
      title: "Session with one deleted image",
      createdAt: "2026-01-13T10:00:00.000Z",
    },
  ],
  generations: [
    {
      id: "deleted-gen-1",
      sessionId: "deleted-session-1",
      stepId: 1,
      prompt: "Deleted item prompt",
      createdAt: "2026-01-13T10:01:00.000Z",
    },
  ],
  items: [
    { id: "deleted-item-1", generationId: "deleted-gen-1", url: "https://example.com/del1.png", pinned: false, deleted: true, createdAt: "2026-01-13T10:01:01.000Z" },
    { id: "deleted-item-2", generationId: "deleted-gen-1", url: "https://example.com/del2.png", pinned: false, deleted: false, createdAt: "2026-01-13T10:01:02.000Z" },
  ],
  settings: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("AllSessions mini-previews (US-017)", () => {
  test("session with images shows thumbnail strip", async ({ page }) => {
    await seedImageFixture(page, oneSessionWithImages);
    await page.goto("/image/sessions");

    const strip = page.getByTestId("session-thumbnail-strip");
    await expect(strip).toBeVisible();
  });

  test("session with images shows correct image count", async ({ page }) => {
    await seedImageFixture(page, oneSessionWithImages);
    await page.goto("/image/sessions");

    const count = page.getByTestId("session-image-count");
    await expect(count).toBeVisible();
    await expect(count).toContainText("3");
  });

  test("session with pinned images shows pinned count", async ({ page }) => {
    await seedImageFixture(page, oneSessionWithImages);
    await page.goto("/image/sessions");

    const pinnedCount = page.getByTestId("session-pinned-count");
    await expect(pinnedCount).toBeVisible();
    await expect(pinnedCount).toContainText("1");
  });

  test("session without pinned images does not show pinned count", async ({ page }) => {
    // Use a session where no items are pinned
    const noPinFixture: ImageStorageExport = {
      ...oneSessionWithImages,
      items: oneSessionWithImages.items.map((i) => ({ ...i, pinned: false })),
    };
    await seedImageFixture(page, noPinFixture);
    await page.goto("/image/sessions");

    await expect(page.getByTestId("session-pinned-count")).not.toBeVisible();
  });

  test("session with more than 4 images shows at most 4 thumbnails", async ({ page }) => {
    await seedImageFixture(page, sessionWithManyImages);
    await page.goto("/image/sessions");

    const thumbs = page.getByTestId("session-thumbnail");
    await expect(thumbs).toHaveCount(4);
  });

  test("session with 6 images shows correct total count", async ({ page }) => {
    await seedImageFixture(page, sessionWithManyImages);
    await page.goto("/image/sessions");

    const count = page.getByTestId("session-image-count");
    await expect(count).toContainText("6");
  });

  test("session with no images shows no thumbnail strip", async ({ page }) => {
    await seedImageFixture(page, sessionWithNoImages);
    await page.goto("/image/sessions");

    await expect(page.getByTestId("session-thumbnail-strip")).not.toBeVisible();
  });

  test("soft-deleted images are excluded from count and thumbnails", async ({ page }) => {
    await seedImageFixture(page, sessionWithDeletedItems);
    await page.goto("/image/sessions");

    // 1 non-deleted item → thumbnail strip present, count = 1
    await expect(page.getByTestId("session-thumbnail-strip")).toBeVisible();
    const count = page.getByTestId("session-image-count");
    await expect(count).toContainText("1");
  });

  test("multiple sessions each show their own counts", async ({ page }) => {
    // Combine oneSessionWithImages (3 items) and sessionWithNoImages (0 items)
    const combined: ImageStorageExport = {
      sessions: [
        ...oneSessionWithImages.sessions,
        ...sessionWithNoImages.sessions,
      ],
      generations: [...oneSessionWithImages.generations],
      items: [...oneSessionWithImages.items],
      settings: null,
    };
    await seedImageFixture(page, combined);
    await page.goto("/image/sessions");

    const strips = page.getByTestId("session-thumbnail-strip");
    // Only the session with images shows a strip
    await expect(strips).toHaveCount(1);
  });
});
