/**
 * US-031: Playwright MCP smoke test for end-to-end image workflow.
 *
 * Interactively walks through the full image generation workflow to verify
 * the critical path before each release. All steps execute against the dev
 * server with VITE_USE_MOCK_LLM=true (configured in playwright.config.ts).
 *
 * Flow verified:
 *   1. Navigate to /image — prompt input is focused
 *   2. Type a prompt and click Generate (home page form) — navigates to session view
 *   3. Verify navigation to /image/sessions/:id
 *   4. Click Generate in session view — skeleton loading cards appear, then resolve to images
 *   5. Pin one image and verify pin button state changes
 *   6. Navigate to /image/pinned and verify the pinned image appears
 *   7. Click New Session and verify return to /image with focused input
 */

import { test, expect } from "@playwright/test";
import { clearImageStorage } from "./helpers/seed";

test.describe("Image workflow smoke test (US-031)", () => {
  test("end-to-end image generation, pin, pinned page, and new session", async ({
    page,
  }) => {
    // ── Step 1: Clear state and navigate to /image ────────────────────────────
    await clearImageStorage(page);

    // Seed an API key so the generation guard passes
    await page.evaluate(() => {
      localStorage.setItem(
        "song-builder:settings",
        JSON.stringify({ poeApiKey: "smoke-test-key", numSongs: 3 })
      );
    });

    await page.goto("/image");

    // Verify prompt input is focused on mount
    const promptInput = page.getByRole("textbox", { name: "Image prompt" });
    await expect(promptInput).toBeFocused();

    // ── Step 2: Type a prompt and click Generate (home page form) ─────────────
    const smokePrompt =
      "A misty mountain range at sunrise, photorealistic landscape";
    await promptInput.fill(smokePrompt);

    const homeGenerateBtn = page.getByRole("button", { name: /Generate/i });
    await expect(homeGenerateBtn).toBeEnabled();
    await homeGenerateBtn.click();

    // ── Step 3: Verify navigation to /image/sessions/:id ─────────────────────
    await expect(page).toHaveURL(/\/image\/sessions\//);

    // ── Step 4: Click Generate in session view — skeletons then real images ───
    // The home page creates the session and navigates; the session view starts
    // with an empty prompt for a brand-new session. Fill the prompt and generate.
    const sessionPromptInput = page.getByTestId("prompt-input");
    await sessionPromptInput.fill(smokePrompt);

    const sessionGenerateBtn = page.getByTestId("generate-btn");
    await expect(sessionGenerateBtn).toBeEnabled();
    await sessionGenerateBtn.click();

    // Skeletons should be visible immediately after clicking Generate
    const skeletons = page.getByTestId("skeleton-card");
    await expect(skeletons.first()).toBeVisible();

    // Wait for generation to complete: skeletons disappear and real images appear
    await expect(skeletons.first()).not.toBeVisible({ timeout: 10000 });

    const imageCards = page.getByTestId("image-card");
    await expect(imageCards.first()).toBeVisible();

    // ── Step 5: Pin one image and verify pin button state changes ─────────────
    const firstPinBtn = page.getByTestId("pin-btn").first();

    // Before pinning: button shows "Pin" and aria-pressed=false
    await expect(firstPinBtn).toHaveAttribute("aria-pressed", "false");
    await expect(firstPinBtn).toContainText("Pin");

    // Click pin
    await firstPinBtn.click();

    // After pinning: button shows "Unpin" and aria-pressed=true
    await expect(firstPinBtn).toHaveAttribute("aria-pressed", "true");
    await expect(firstPinBtn).toContainText("Unpin");

    // ── Step 6: Navigate to /image/pinned and verify the pinned image appears ─
    await page.goto("/image/pinned");

    // Pinned image list should be visible with at least one item
    const pinnedList = page.getByTestId("pinned-image-list");
    await expect(pinnedList).toBeVisible();

    const pinnedItems = page.getByTestId("pinned-image-item");
    await expect(pinnedItems).toHaveCount(1);

    // Each pinned item shows an image
    await expect(pinnedItems.first().locator("img")).toBeVisible();

    // ── Step 7: Navigate back and click New Session ───────────────────────────
    await page.goBack();
    await expect(page).toHaveURL(/\/image\/sessions\//);

    const newSessionBtn = page.getByTestId("new-session-btn");
    await expect(newSessionBtn).toBeVisible();
    await newSessionBtn.click();

    // Should return to /image with input focused
    await expect(page).toHaveURL("/image");
    const freshInput = page.getByRole("textbox", { name: "Image prompt" });
    await expect(freshInput).toBeFocused();
  });
});
