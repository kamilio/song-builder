/**
 * US-015: Screenshot regression baselines
 *
 * Captures full-page screenshots at desktop (1280×800) and mobile (375×812)
 * for all 7 pages with appropriate fixture data. On future runs the committed
 * baseline images in screenshots/ are used to detect visual regressions.
 *
 * Run an individual page's screenshots:
 *   npm run screenshot:home
 *   npm run screenshot:lyrics-list
 *   npm run screenshot:lyrics
 *   npm run screenshot:checkpoint
 *   npm run screenshot:songs
 *   npm run screenshot:pinned
 *   npm run screenshot:settings
 *
 * To regenerate all baselines after an intentional UI change:
 *   npx playwright test tests/screenshot-baselines.spec.ts --update-snapshots
 *
 * Fixture mapping (from spec):
 *   Home                       → emptyFixture     (no data)
 *   Lyrics List                → multiEntryFixture (several lyrics entries)
 *   Lyrics Editor — latest     → multiMessageFixture, latest leaf (Neon Rain)
 *   Lyrics Editor — checkpoint → multiMessageFixture, earlier message (City Pulse)
 *   Songs View                 → songGeneratorFixture (pre-existing songs)
 *   Pinned Songs               → pinnedFixture (one pinned song)
 *   Settings                   → baseFixture (one entry, API key set)
 */

import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import {
  emptyFixture,
  multiEntryFixture,
  multiMessageFixture,
  songGeneratorFixture,
  pinnedFixture,
  baseFixture,
} from "../fixtures/index";

// ─── Viewport helpers ────────────────────────────────────────────────────────

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 375, height: 812 };

/**
 * Seed a fixture and navigate to the given URL.
 * Returns after the page is stable and no network activity is pending.
 */
async function gotoSeeded(
  page: Parameters<typeof seedFixture>[0],
  url: string,
  fixture: Parameters<typeof seedFixture>[1]
) {
  await seedFixture(page, fixture);
  await page.goto(url);
  // Wait for any animations / skeleton transitions to settle
  await page.waitForLoadState("networkidle");
}

// ─── Home page (SharedHome tab switcher) ─────────────────────────────────────

test(
  "@screenshot:home home page desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoSeeded(page, "/", emptyFixture);

    // Verify key content is visible before capturing
    await expect(page.getByTestId("tab-music")).toBeVisible();
    await expect(page.getByTestId("tab-image")).toBeVisible();

    await expect(page).toHaveScreenshot("home-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:home home page mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoSeeded(page, "/", emptyFixture);

    await expect(page.getByTestId("tab-music")).toBeVisible();
    await expect(page.getByTestId("tab-image")).toBeVisible();

    await expect(page).toHaveScreenshot("home-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── Lyrics List ─────────────────────────────────────────────────────────────

test(
  "@screenshot:lyrics-list lyrics list desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoSeeded(page, "/music/lyrics", multiEntryFixture);

    await expect(
      page.getByRole("heading", { name: "Lyrics" })
    ).toBeVisible();
    await expect(
      page.getByTestId("card-title").filter({ hasText: "Morning Pop" }).first()
    ).toBeVisible();

    await expect(page).toHaveScreenshot("lyrics-list-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:lyrics-list lyrics list mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoSeeded(page, "/music/lyrics", multiEntryFixture);

    await expect(
      page.getByRole("heading", { name: "Lyrics" })
    ).toBeVisible();
    await expect(
      page.getByTestId("lyrics-list-item").first()
    ).toBeVisible();

    await expect(page).toHaveScreenshot("lyrics-list-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── Lyrics Editor — latest view ──────────────────────────────────────────────

test(
  "@screenshot:lyrics lyrics editor latest view desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    // Navigate to the latest leaf (Neon Rain) of the multi-message fixture
    await gotoSeeded(page, "/music/lyrics/fixture-multi-msg-3a", multiMessageFixture);

    await expect(page.getByTestId("lyrics-title")).toContainText("Neon Rain");
    // No checkpoint banner on the latest leaf
    await expect(page.getByTestId("checkpoint-banner")).not.toBeVisible();

    await expect(page).toHaveScreenshot("lyrics-editor-latest-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:lyrics lyrics editor latest view mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoSeeded(page, "/music/lyrics/fixture-multi-msg-3a", multiMessageFixture);

    await expect(page.getByTestId("lyrics-title")).toContainText("Neon Rain");

    await expect(page).toHaveScreenshot("lyrics-editor-latest-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── Lyrics Editor — checkpoint view ─────────────────────────────────────────

test(
  "@screenshot:checkpoint lyrics editor checkpoint view desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    // Navigate to an earlier message (City Pulse) — it has descendants so the banner shows
    await gotoSeeded(page, "/music/lyrics/fixture-multi-msg-1a", multiMessageFixture);

    await expect(page.getByTestId("lyrics-title")).toContainText("City Pulse");
    await expect(page.getByTestId("checkpoint-banner")).toBeVisible();

    await expect(page).toHaveScreenshot("lyrics-editor-checkpoint-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:checkpoint lyrics editor checkpoint view mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoSeeded(page, "/music/lyrics/fixture-multi-msg-1a", multiMessageFixture);

    await expect(page.getByTestId("lyrics-title")).toContainText("City Pulse");
    await expect(page.getByTestId("checkpoint-banner")).toBeVisible();

    await expect(page).toHaveScreenshot("lyrics-editor-checkpoint-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── Songs View ───────────────────────────────────────────────────────────────

test(
  "@screenshot:songs songs view desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoSeeded(
      page,
      "/music/lyrics/fixture-msg-songs-a/songs",
      songGeneratorFixture
    );

    await expect(page.getByTestId("song-entry-title")).toContainText(
      "Sunday Gold"
    );
    await expect(page.getByTestId("song-item")).toHaveCount(3);

    await expect(page).toHaveScreenshot("songs-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:songs songs view mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoSeeded(
      page,
      "/music/lyrics/fixture-msg-songs-a/songs",
      songGeneratorFixture
    );

    await expect(page.getByTestId("song-entry-title")).toContainText(
      "Sunday Gold"
    );

    await expect(page).toHaveScreenshot("songs-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── Pinned Songs ─────────────────────────────────────────────────────────────

test(
  "@screenshot:pinned pinned songs desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoSeeded(page, "/music/pinned", pinnedFixture);

    await expect(
      page.getByRole("heading", { name: "Pinned Songs" })
    ).toBeVisible();
    await expect(page.getByTestId("pinned-song-item")).toHaveCount(1);

    await expect(page).toHaveScreenshot("pinned-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:pinned pinned songs mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoSeeded(page, "/music/pinned", pinnedFixture);

    await expect(
      page.getByRole("heading", { name: "Pinned Songs" })
    ).toBeVisible();

    await expect(page).toHaveScreenshot("pinned-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── Settings ─────────────────────────────────────────────────────────────────

test(
  "@screenshot:settings settings desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoSeeded(page, "/settings", baseFixture);

    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible();
    await expect(page.getByLabel("POE API Key")).toBeVisible();

    await expect(page).toHaveScreenshot("settings-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:settings settings mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoSeeded(page, "/settings", baseFixture);

    await expect(
      page.getByRole("heading", { name: "Settings" })
    ).toBeVisible();

    await expect(page).toHaveScreenshot("settings-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);
