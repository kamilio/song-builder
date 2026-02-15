/**
 * Tests for US-014: Session view shell — route, layout, and data loading.
 *
 * Verifies that:
 * - /image/sessions/:id route renders the session view when the session exists
 * - Page loads and displays the session title from storage
 * - Redirect to /image occurs when the session id does not exist
 * - TopBar with NavMenu renders with image-specific items
 * - Three structural layout regions are present: main pane, thumbnail panel, bottom bar
 */

import { test, expect } from "@playwright/test";
import { seedImageFixture, clearImageStorage } from "./helpers/seed";
import type { ImageStorageExport } from "../../src/image/lib/storage/types";

const SESSION_ID = "fixture-session-001";

const imageBaseFixture: ImageStorageExport = {
  sessions: [
    {
      id: SESSION_ID,
      title: "A serene mountain landscape at golden hour",
      createdAt: "2026-01-10T10:00:00.000Z",
    },
  ],
  generations: [
    {
      id: "fixture-gen-001",
      sessionId: SESSION_ID,
      stepId: 1,
      prompt: "A serene mountain landscape at golden hour",
      createdAt: "2026-01-10T10:01:00.000Z",
    },
  ],
  items: [
    {
      id: "fixture-item-001",
      generationId: "fixture-gen-001",
      url: "https://example.com/image-1.png",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-10T10:02:00.000Z",
    },
    {
      id: "fixture-item-002",
      generationId: "fixture-gen-001",
      url: "https://example.com/image-2.png",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-10T10:03:00.000Z",
    },
    {
      id: "fixture-item-003",
      generationId: "fixture-gen-001",
      url: "https://example.com/image-3.png",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-10T10:04:00.000Z",
    },
  ],
  settings: { numImages: 3 },
};

test.describe("Session view shell (US-014)", () => {
  test.beforeEach(async ({ page }) => {
    await seedImageFixture(page, imageBaseFixture);
  });

  test("renders session view at /image/sessions/:id", async ({ page }) => {
    await page.goto(`/image/sessions/${SESSION_ID}`);
    await expect(page.getByTestId("session-view")).toBeVisible();
  });

  test("shows TopBar with image nav", async ({ page }) => {
    await page.goto(`/image/sessions/${SESSION_ID}`);
    await expect(page.getByTestId("top-bar")).toBeVisible();
    await expect(page.getByTestId("nav-menu-trigger")).toBeVisible();
  });

  test("NavMenu contains Pinned Images and Settings items", async ({ page }) => {
    await page.goto(`/image/sessions/${SESSION_ID}`);
    await page.getByTestId("nav-menu-trigger").click();
    await expect(page.getByTestId("nav-menu-pinned")).toBeVisible();
    await expect(page.getByTestId("nav-menu-settings")).toBeVisible();
  });

  test("main pane region is present", async ({ page }) => {
    await page.goto(`/image/sessions/${SESSION_ID}`);
    await expect(page.getByTestId("main-pane")).toBeVisible();
  });

  test("main pane shows session title", async ({ page }) => {
    await page.goto(`/image/sessions/${SESSION_ID}`);
    await expect(page.getByTestId("main-pane-placeholder")).toContainText(
      "A serene mountain landscape at golden hour"
    );
  });

  test("bottom bar region is present", async ({ page }) => {
    await page.goto(`/image/sessions/${SESSION_ID}`);
    await expect(page.getByTestId("bottom-bar")).toBeVisible();
  });

  test("redirects to /image when session id does not exist", async ({ page }) => {
    await page.goto("/image/sessions/nonexistent-id");
    await expect(page).toHaveURL("/image");
  });

  test("thumbnail panel is visible on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/image/sessions/${SESSION_ID}`);
    await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  });

  test("thumbnail strip is present on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/image/sessions/${SESSION_ID}`);
    await expect(page.getByTestId("thumbnail-strip")).toBeVisible();
  });
});

test.describe("Session view shell — unknown session redirect", () => {
  test.beforeEach(async ({ page }) => {
    await clearImageStorage(page);
  });

  test("unknown session id redirects to /image", async ({ page }) => {
    await page.goto("/image/sessions/does-not-exist");
    await expect(page).toHaveURL("/image");
  });
});
