/**
 * US-030: Screenshot regression baselines for image pages.
 *
 * Captures full-page screenshots at desktop (1280×800) and mobile (375×812)
 * for all image pages with appropriate fixture data. On future runs the
 * committed baseline images are used to detect visual regressions.
 *
 * To regenerate all baselines after an intentional UI change:
 *   npx playwright test tests/image/screenshot-baselines.spec.ts --update-snapshots
 *
 * Page / fixture mapping:
 *   /image (empty)             → clearImageStorage      (no sessions)
 *   /image (returning user)    → twoSessionsFixture     (2 recent sessions)
 *   /image/sessions (empty)    → clearImageStorage      (no sessions)
 *   /image/sessions (with img) → imageMultiStepFixture  (1 session, 6 items)
 *   /image/sessions/:id        → imageMultiStepFixture  (2 steps, 6 items)
 *   /image/pinned (empty)      → clearImageStorage      (no pinned images)
 *   /image/pinned (pinned)     → imagePinnedFixture     (1 pinned image)
 */

import { test, expect } from "@playwright/test";
import { seedImageFixture, clearImageStorage } from "./helpers/seed";
import {
  imagePinnedFixture,
  imageMultiStepFixture,
} from "../fixtures/index";
import type { ImageStorageExport } from "../../src/image/lib/storage/types";

// ─── Viewport helpers ─────────────────────────────────────────────────────────

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 375, height: 812 };

/** Two sessions used for the returning-user state screenshots. */
const twoSessionsFixture: ImageStorageExport = {
  sessions: [
    {
      id: "screenshot-session-1",
      title: "A serene mountain landscape at golden hour",
      createdAt: "2026-01-10T10:00:00.000Z",
    },
    {
      id: "screenshot-session-2",
      title: "Futuristic cityscape at night with neon reflections",
      createdAt: "2026-01-11T12:00:00.000Z",
    },
  ],
  generations: [],
  items: [],
  settings: { numImages: 3 },
};

const MULTI_SESSION_ID = "fixture-img-multi-session-1";

// ─── /image — empty state ─────────────────────────────────────────────────────

test(
  "@screenshot:image-home image home empty state desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await clearImageStorage(page);
    await page.goto("/image");
    await page.waitForLoadState("networkidle");

    // Verify empty state content is visible before capturing
    await expect(page.getByTestId("example-prompt-btn").first()).toBeVisible();

    await expect(page).toHaveScreenshot("image-home-empty-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:image-home image home empty state mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await clearImageStorage(page);
    await page.goto("/image");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("example-prompt-btn").first()).toBeVisible();

    await expect(page).toHaveScreenshot("image-home-empty-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── /image — returning user ──────────────────────────────────────────────────

test(
  "@screenshot:image-home image home returning user desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await seedImageFixture(page, twoSessionsFixture);
    await page.goto("/image");
    await page.waitForLoadState("networkidle");

    // Verify recent sessions are visible before capturing
    await expect(page.getByTestId("recent-session-card").first()).toBeVisible();

    await expect(page).toHaveScreenshot("image-home-returning-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:image-home image home returning user mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await seedImageFixture(page, twoSessionsFixture);
    await page.goto("/image");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("recent-session-card").first()).toBeVisible();

    await expect(page).toHaveScreenshot("image-home-returning-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── /image/sessions/:id — multi-step fixture ─────────────────────────────────

test(
  "@screenshot:image-session image session view desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await seedImageFixture(page, imageMultiStepFixture);
    await page.goto(`/image/sessions/${MULTI_SESSION_ID}`);
    await page.waitForLoadState("networkidle");

    // Verify main pane images are visible before capturing
    await expect(page.getByTestId("main-pane-images")).toBeVisible();
    await expect(page.getByTestId("image-card").first()).toBeVisible();

    await expect(page).toHaveScreenshot("image-session-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:image-session image session view mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await seedImageFixture(page, imageMultiStepFixture);
    await page.goto(`/image/sessions/${MULTI_SESSION_ID}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("main-pane-images")).toBeVisible();

    await expect(page).toHaveScreenshot("image-session-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── /image/pinned — empty state ─────────────────────────────────────────────

test(
  "@screenshot:image-pinned image pinned page empty state desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await clearImageStorage(page);
    await page.goto("/image/pinned");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("pinned-images-empty")).toBeVisible();

    await expect(page).toHaveScreenshot("image-pinned-empty-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:image-pinned image pinned page empty state mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await clearImageStorage(page);
    await page.goto("/image/pinned");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("pinned-images-empty")).toBeVisible();

    await expect(page).toHaveScreenshot("image-pinned-empty-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── /image/pinned — with pinned images ──────────────────────────────────────

test(
  "@screenshot:image-pinned image pinned page with pins desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await seedImageFixture(page, imagePinnedFixture);
    await page.goto("/image/pinned");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("pinned-image-list")).toBeVisible();
    await expect(page.getByTestId("pinned-image-item").first()).toBeVisible();

    await expect(page).toHaveScreenshot("image-pinned-with-pins-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:image-pinned image pinned page with pins mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await seedImageFixture(page, imagePinnedFixture);
    await page.goto("/image/pinned");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("pinned-image-list")).toBeVisible();

    await expect(page).toHaveScreenshot("image-pinned-with-pins-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── /image/sessions — empty state ───────────────────────────────────────────

test(
  "@screenshot:image-all-sessions all sessions page empty state desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await clearImageStorage(page);
    await page.goto("/image/sessions");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("all-sessions-empty")).toBeVisible();

    await expect(page).toHaveScreenshot("image-all-sessions-empty-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:image-all-sessions all sessions page empty state mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await clearImageStorage(page);
    await page.goto("/image/sessions");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("all-sessions-empty")).toBeVisible();

    await expect(page).toHaveScreenshot("image-all-sessions-empty-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── /image/sessions — with image thumbnails (US-017) ────────────────────────

test(
  "@screenshot:image-all-sessions all sessions page with thumbnails desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await seedImageFixture(page, imageMultiStepFixture);
    await page.goto("/image/sessions");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("session-list")).toBeVisible();
    await expect(page.getByTestId("session-thumbnail-strip").first()).toBeVisible();

    await expect(page).toHaveScreenshot("image-all-sessions-with-thumbnails-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:image-all-sessions all sessions page with thumbnails mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await seedImageFixture(page, imageMultiStepFixture);
    await page.goto("/image/sessions");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("session-list")).toBeVisible();
    await expect(page.getByTestId("session-thumbnail-strip").first()).toBeVisible();

    await expect(page).toHaveScreenshot("image-all-sessions-with-thumbnails-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);
