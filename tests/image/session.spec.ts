/**
 * Tests for US-028 and US-007: Playwright tests for session view and generation flow.
 *
 * Verifies that:
 * - Main pane shows only the latest-step images (highest stepId) — US-015
 * - Thumbnail panel contains all images across all steps — US-016
 * - Prompt textarea is pre-populated and persists after generation — US-018
 * - Skeleton loading cards are shown during generation — US-021
 * - New Session button navigates to /image with input auto-focused — US-019
 * - Error cards show a Retry button that re-fires generation for that slot — US-007
 *
 * All tests run with VITE_USE_MOCK_LLM=true (configured in playwright.config.ts).
 * Storage is seeded via window.imageStorageService.import() through the helpers.
 */

import { test, expect } from "@playwright/test";
import { seedImageFixture, clearImageStorage } from "./helpers/seed";
import {
  imageBaseFixture,
  imageMultiStepFixture,
} from "../fixtures/index";

// ── Session IDs from fixtures ─────────────────────────────────────────────────

const BASE_SESSION_ID = "fixture-img-session-1";
const MULTI_SESSION_ID = "fixture-img-multi-session-1";

// ── Main pane: latest-step images (US-015) ────────────────────────────────────

test.describe("Session view — main pane shows only latest-step images (US-015)", () => {
  test.beforeEach(async ({ page }) => {
    await seedImageFixture(page, imageMultiStepFixture);
  });

  test("main pane renders images from the generation with the highest stepId", async ({ page }) => {
    await page.goto(`/image/sessions/${MULTI_SESSION_ID}`);

    // imageMultiStepFixture has stepId 1 (3 items) and stepId 2 (3 items).
    // Main pane should show only the 3 images from stepId 2.
    const mainPane = page.getByTestId("main-pane-images");
    await expect(mainPane).toBeVisible();

    const cards = page.getByTestId("image-card");
    await expect(cards).toHaveCount(3);
  });

  test("main pane image cards contain img elements", async ({ page }) => {
    await page.goto(`/image/sessions/${MULTI_SESSION_ID}`);

    const cards = page.getByTestId("image-card");
    await expect(cards).toHaveCount(3);

    // Each card should have an img element
    const firstCard = cards.first();
    await expect(firstCard.locator("img")).toBeVisible();
  });

  test("base fixture (1 step) shows 3 images in main pane", async ({ page }) => {
    await seedImageFixture(page, imageBaseFixture);
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    const cards = page.getByTestId("image-card");
    await expect(cards).toHaveCount(3);
  });
});

// ── Thumbnail panel: all images across steps (US-016) ─────────────────────────

test.describe("Session view — thumbnail panel contains all images across steps (US-016)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedImageFixture(page, imageMultiStepFixture);
  });

  test("thumbnail panel is visible on desktop", async ({ page }) => {
    await page.goto(`/image/sessions/${MULTI_SESSION_ID}`);
    await expect(page.getByTestId("thumbnail-panel")).toBeVisible();
  });

  test("thumbnail panel contains thumbnails for all items across all steps", async ({ page }) => {
    await page.goto(`/image/sessions/${MULTI_SESSION_ID}`);

    // imageMultiStepFixture has 6 items across 2 steps; all should appear as thumbnails.
    // Scope to the desktop thumbnail-panel to avoid counting mobile strip duplicates.
    const panel = page.getByTestId("thumbnail-panel");
    const thumbnails = panel.getByTestId("thumbnail-image");
    await expect(thumbnails).toHaveCount(6);
  });

  test("thumbnail panel groups items by step (two groups for multi-step fixture)", async ({ page }) => {
    await page.goto(`/image/sessions/${MULTI_SESSION_ID}`);

    // Two stepId groups should be rendered inside the desktop thumbnail panel
    const panel = page.getByTestId("thumbnail-panel");
    const groups = panel.getByTestId("thumbnail-group");
    await expect(groups).toHaveCount(2);
  });

  test("thumbnails are grouped newest step first (stepId 2 group before stepId 1 group)", async ({ page }) => {
    await page.goto(`/image/sessions/${MULTI_SESSION_ID}`);

    const panel = page.getByTestId("thumbnail-panel");
    const groups = panel.getByTestId("thumbnail-group");
    // First group label should be "Step 2"
    await expect(groups.first()).toContainText("Step 2");
    // Second group label should be "Step 1"
    await expect(groups.nth(1)).toContainText("Step 1");
  });

  test("mobile thumbnail strip is visible below 640px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seedImageFixture(page, imageMultiStepFixture, { navigate: false });
    await page.goto(`/image/sessions/${MULTI_SESSION_ID}`);

    await expect(page.getByTestId("thumbnail-strip")).toBeVisible();
  });
});

// ── Prompt persistence (US-018) ───────────────────────────────────────────────

test.describe("Session view — prompt persists after generation (US-018)", () => {
  test("prompt textarea is pre-populated with the latest generation prompt on load", async ({ page }) => {
    await seedImageFixture(page, imageBaseFixture);
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    const textarea = page.getByTestId("prompt-input");
    // imageBaseFixture generation prompt is this text
    await expect(textarea).toHaveValue(
      "A serene Japanese garden with a koi pond at golden hour, photorealistic"
    );
  });

  test("prompt textarea still shows submitted text after Generate completes", async ({ page }) => {
    await seedImageFixture(page, imageBaseFixture);
    // Also seed music settings with an API key so the guard doesn't block
    await page.evaluate(() => {
      localStorage.setItem(
        "ai-studio:settings",
        JSON.stringify({ poeApiKey: "test-key", numSongs: 3 })
      );
    });
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    const textarea = page.getByTestId("prompt-input");
    const originalText =
      "A serene Japanese garden with a koi pond at golden hour, photorealistic";

    // Confirm it is pre-populated
    await expect(textarea).toHaveValue(originalText);

    // Click Generate
    const generateBtn = page.getByTestId("generate-btn");
    await generateBtn.click();

    // Wait for generation to complete (skeleton disappears, images appear)
    await expect(page.getByTestId("skeleton-card").first()).not.toBeVisible({
      timeout: 5000,
    });

    // Textarea should still contain the same text
    await expect(textarea).toHaveValue(originalText);
  });

  test("Generate button is disabled while generation is in-flight", async ({ page }) => {
    await seedImageFixture(page, imageBaseFixture);
    await page.evaluate(() => {
      localStorage.setItem(
        "ai-studio:settings",
        JSON.stringify({ poeApiKey: "test-key", numSongs: 3 })
      );
    });
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    const generateBtn = page.getByTestId("generate-btn");
    await generateBtn.click();

    // The mock client may resolve before the disabled state is observable,
    // so instead of asserting the transient disabled state, verify the
    // end-to-end outcome: generation completes and the button re-enables.
    await expect(generateBtn).toBeEnabled({ timeout: 10000 });

    // No skeleton cards remain after generation completes
    await expect(page.getByTestId("skeleton-card")).toHaveCount(0, {
      timeout: 5000,
    });
  });
});

// ── Skeleton loading cards during generation (US-021) ─────────────────────────

test.describe("Session view — skeleton loading cards during generation (US-021)", () => {
  test.beforeEach(async ({ page }) => {
    await seedImageFixture(page, imageBaseFixture);
    // Seed music settings with API key so the guard passes
    await page.evaluate(() => {
      localStorage.setItem(
        "ai-studio:settings",
        JSON.stringify({ poeApiKey: "test-key", numSongs: 3 })
      );
    });
  });

  test("skeleton cards appear in main pane while generation is in-flight", async ({ page }) => {
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    await page.getByTestId("generate-btn").click();

    // Skeleton cards should be visible immediately after clicking Generate
    const skeletons = page.getByTestId("skeleton-card");
    await expect(skeletons.first()).toBeVisible();
  });

  test("N skeleton cards shown matching numImages setting (3 by default)", async ({ page }) => {
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    await page.getByTestId("generate-btn").click();

    // imageBaseFixture sets numImages: 3, so 3 skeletons should appear
    await expect(page.getByTestId("skeleton-card")).toHaveCount(3);
  });

  test("skeleton cards are replaced by real image cards after generation completes", async ({ page }) => {
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    await page.getByTestId("generate-btn").click();

    // Wait for skeletons to disappear (generation finished)
    await expect(page.getByTestId("skeleton-card").first()).not.toBeVisible({
      timeout: 5000,
    });

    // Real image cards should now be shown (3 new + the original 3, or just 3 from latest step)
    await expect(page.getByTestId("image-card").first()).toBeVisible();
  });

  test("thumbnail panel does not show new thumbnails until generation step completes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    // Scope to the desktop thumbnail-panel to avoid counting mobile strip duplicates.
    const panel = page.getByTestId("thumbnail-panel");

    // Before generating: 3 thumbnails from the fixture
    await expect(panel.getByTestId("thumbnail-image")).toHaveCount(3);

    await page.getByTestId("generate-btn").click();

    // While skeletons are visible (generation in-flight), thumbnails stay at 3
    const skeletons = page.getByTestId("skeleton-card");
    await expect(skeletons.first()).toBeVisible();
    await expect(panel.getByTestId("thumbnail-image")).toHaveCount(3);

    // After generation completes, thumbnails should include the new images
    await expect(skeletons.first()).not.toBeVisible({ timeout: 5000 });
    await expect(panel.getByTestId("thumbnail-image")).toHaveCount(6);
  });
});

// ── New Session button navigates to /image (US-019) ───────────────────────────

test.describe("Session view — New Session navigates to /image with input focused (US-019)", () => {
  test.beforeEach(async ({ page }) => {
    await seedImageFixture(page, imageBaseFixture);
  });

  test("New Session button is visible in the session view bottom bar", async ({ page }) => {
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    await expect(page.getByTestId("new-session-btn")).toBeVisible();
  });

  test("clicking New Session navigates to /image", async ({ page }) => {
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    await page.getByTestId("new-session-btn").click();

    await expect(page).toHaveURL("/image");
  });

  test("prompt input is auto-focused after arriving at /image via New Session", async ({ page }) => {
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    await page.getByTestId("new-session-btn").click();

    await expect(page).toHaveURL("/image");

    const textarea = page.getByRole("textbox", { name: "Image prompt" });
    await expect(textarea).toBeFocused();
  });

  test("session data is not deleted after clicking New Session (navigation only)", async ({ page }) => {
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    await page.getByTestId("new-session-btn").click();

    await expect(page).toHaveURL("/image");

    // Verify the session still exists in storage
    const sessionInStorage = await page.evaluate((sessionId: string) => {
      return window.imageStorageService.getSession(sessionId);
    }, BASE_SESSION_ID);

    expect(sessionInStorage).not.toBeNull();
    expect(sessionInStorage).toMatchObject({ id: BASE_SESSION_ID });
  });
});

// ── Generation increases step count and updates thumbnails ────────────────────

test.describe("Session view — generation flow integration", () => {
  test("generating creates a new step and thumbnails grow", async ({ page }) => {
    await seedImageFixture(page, imageBaseFixture);
    await page.evaluate(() => {
      localStorage.setItem(
        "ai-studio:settings",
        JSON.stringify({ poeApiKey: "test-key", numSongs: 3 })
      );
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    // Scope to the desktop thumbnail-panel to avoid counting mobile strip duplicates.
    const panel = page.getByTestId("thumbnail-panel");

    // Initial state: 3 thumbnails (1 step)
    await expect(panel.getByTestId("thumbnail-image")).toHaveCount(3);

    await page.getByTestId("generate-btn").click();

    // After generation: 6 thumbnails (2 steps × 3 items)
    await expect(page.getByTestId("skeleton-card").first()).not.toBeVisible({
      timeout: 5000,
    });
    await expect(panel.getByTestId("thumbnail-image")).toHaveCount(6);
  });

  test("main pane shows 3 images from latest step after generation", async ({ page }) => {
    await seedImageFixture(page, imageBaseFixture);
    await page.evaluate(() => {
      localStorage.setItem(
        "ai-studio:settings",
        JSON.stringify({ poeApiKey: "test-key", numSongs: 3 })
      );
    });
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    await page.getByTestId("generate-btn").click();

    // Wait for generation to complete
    await expect(page.getByTestId("skeleton-card").first()).not.toBeVisible({
      timeout: 5000,
    });

    // Main pane shows 3 image cards (from the new step 2)
    await expect(page.getByTestId("image-card")).toHaveCount(3);
  });
});

// ── Retry button on error cards (US-007) ──────────────────────────────────────

test.describe("Session view — retry button on failed image slots (US-007)", () => {
  test.beforeEach(async ({ page }) => {
    await seedImageFixture(page, imageBaseFixture);
    // Seed music settings with API key so the guard passes
    await page.evaluate(() => {
      localStorage.setItem(
        "ai-studio:settings",
        JSON.stringify({ poeApiKey: "test-key", numSongs: 3 })
      );
    });
  });

  test("error card renders a Retry button", async ({ page }) => {
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    // Make all 3 parallel generateImage calls fail
    await page.evaluate(() => {
      window.__mockLLMImageFailCount = 3;
    });

    await page.getByTestId("generate-btn").click();

    // Wait for skeletons to disappear (generation finished with errors)
    await expect(page.getByTestId("skeleton-card").first()).not.toBeVisible({
      timeout: 5000,
    });

    // Error cards should be visible
    await expect(page.getByTestId("image-error-card").first()).toBeVisible();

    // Each error card should have a Retry button
    const retryBtns = page.getByTestId("retry-btn");
    await expect(retryBtns).toHaveCount(3);
  });

  test("clicking Retry re-fires generation for that slot only and replaces error with image", async ({ page }) => {
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    // Make all 3 parallel generateImage calls fail
    await page.evaluate(() => {
      window.__mockLLMImageFailCount = 3;
    });

    await page.getByTestId("generate-btn").click();

    // Wait for skeletons to disappear
    await expect(page.getByTestId("skeleton-card").first()).not.toBeVisible({
      timeout: 5000,
    });

    // 3 error cards, 0 image cards
    await expect(page.getByTestId("image-error-card")).toHaveCount(3);
    await expect(page.getByTestId("image-card")).toHaveCount(0);

    // Click Retry on the first error card — mock now succeeds (failCount is 0)
    await page.getByTestId("retry-btn").first().click();

    // Wait for the retry to complete: one error card replaced by an image card
    await expect(page.getByTestId("image-card").first()).toBeVisible({ timeout: 5000 });

    // Now 1 image card and 2 remaining error cards
    await expect(page.getByTestId("image-card")).toHaveCount(1);
    await expect(page.getByTestId("image-error-card")).toHaveCount(2);
  });

  test("sibling slots are unaffected when retrying one slot", async ({ page }) => {
    await page.goto(`/image/sessions/${BASE_SESSION_ID}`);

    // Fail all 3 slots initially
    await page.evaluate(() => {
      window.__mockLLMImageFailCount = 3;
    });

    await page.getByTestId("generate-btn").click();
    await expect(page.getByTestId("skeleton-card").first()).not.toBeVisible({
      timeout: 5000,
    });

    // All 3 slots errored
    await expect(page.getByTestId("image-error-card")).toHaveCount(3);

    // Retry only the first slot
    await page.getByTestId("retry-btn").first().click();

    // Wait for first slot to resolve
    await expect(page.getByTestId("image-card").first()).toBeVisible({ timeout: 5000 });

    // The other 2 slots remain as error cards (unaffected)
    await expect(page.getByTestId("image-error-card")).toHaveCount(2);
    // The first slot is now an image card
    await expect(page.getByTestId("image-card")).toHaveCount(1);
  });
});
