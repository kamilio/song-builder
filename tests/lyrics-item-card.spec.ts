/**
 * Tests for US-006: LyricsItem cards in the chat panel (snapshot previews).
 *
 * Verifies that:
 * - Each assistant message in the chat panel is rendered as a LyricsItemCard
 * - Card displays title, style, commentary, collapsible lyrics body, song count badge
 * - Expand toggle shows/hides the full lyrics body
 * - Song count badge reflects the correct count from storage
 * - "Songs" button navigates to /lyrics/:messageId/songs
 * - Clicking the card body navigates to /lyrics/:messageId
 * - No raw frontmatter text is shown in the chat panel
 *
 * Uses multiMessageFixture (3 assistant messages: City Pulse, Dark Frequency,
 * Neon Rain) and baseFixture (1 assistant message with 1 song).
 */

import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import { multiMessageFixture, baseFixture, songGeneratorFixture } from "../fixtures/index";

test.describe("US-006: LyricsItem cards in chat panel", () => {
  test("assistant messages render as LyricsItemCard (not raw frontmatter)", async ({
    page,
  }) => {
    await seedFixture(page, multiMessageFixture);
    await page.goto("/lyrics/fixture-multi-msg-3a");

    // All 3 assistant messages should be cards
    const cards = page.getByTestId("lyrics-item-card");
    await expect(cards).toHaveCount(3);

    // No raw frontmatter markers should appear
    const chatHistory = page.getByTestId("chat-history");
    await expect(chatHistory).not.toContainText("---");
    await expect(chatHistory).not.toContainText("title:");
    await expect(chatHistory).not.toContainText("style:");
    await expect(chatHistory).not.toContainText("commentary:");
  });

  test("card displays title, style, and commentary", async ({ page }) => {
    await seedFixture(page, multiMessageFixture);
    await page.goto("/lyrics/fixture-multi-msg-1a");

    const card = page.getByTestId("lyrics-item-card").first();
    await expect(card).toBeVisible();

    await expect(card.getByTestId("card-title")).toContainText("City Pulse");
    await expect(card.getByTestId("card-style")).toContainText("synthwave");
    await expect(card.getByTestId("card-commentary")).toContainText(
      "First draft, establishing the mood."
    );
  });

  test("card displays the lyrics body", async ({ page }) => {
    await seedFixture(page, multiMessageFixture);
    await page.goto("/lyrics/fixture-multi-msg-1a");

    const card = page.getByTestId("lyrics-item-card").first();
    await expect(card.getByTestId("card-lyrics-body")).toContainText(
      "Pulse beneath the sodium glow"
    );
  });

  test("expand toggle shows/hides full lyrics body when body has more than 4 lines", async ({
    page,
  }) => {
    await seedFixture(page, multiMessageFixture);
    // Neon Rain has 4 lines exactly — use a fixture with more lines for collapse test.
    // City Pulse has only 2 lines, so it won't show a toggle.
    // Neon Rain (3a) has exactly 4 lines — not collapsible.
    // Let's verify toggle appears for Neon Rain which has exactly 4 lines (no toggle expected)
    // and then test with a fixture that has > 4 lines.
    await page.goto("/lyrics/fixture-multi-msg-3a");

    // Neon Rain has 4 lines — not collapsible, no toggle
    const neonCard = page.getByTestId("lyrics-item-card").last();
    await expect(neonCard.getByTestId("card-expand-toggle")).not.toBeVisible();

    // City Pulse has 2 lines — also not collapsible
    const cityCard = page.getByTestId("lyrics-item-card").first();
    await expect(cityCard.getByTestId("card-expand-toggle")).not.toBeVisible();
  });

  test("expand toggle works for cards with more than 4 lines", async ({
    page,
  }) => {
    // Create a fixture with a long lyrics body (> 4 lines)
    const longLyricsFixture = {
      ...baseFixture,
      messages: baseFixture.messages.map((m) =>
        m.id === "fixture-msg-1a"
          ? {
              ...m,
              lyricsBody: [
                "Line one of the song",
                "Line two of the song",
                "Line three of the song",
                "Line four of the song",
                "Line five is now visible",
                "Line six wraps it up",
              ].join("\n"),
            }
          : m
      ),
    };

    await seedFixture(page, longLyricsFixture);
    await page.goto("/lyrics/fixture-msg-1a");

    const card = page.getByTestId("lyrics-item-card").first();

    // Toggle should be visible
    const toggle = card.getByTestId("card-expand-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText("Show more");

    // Lines 5 and 6 should be hidden initially
    const lyricsBody = card.getByTestId("card-lyrics-body");
    await expect(lyricsBody).not.toContainText("Line five is now visible");

    // Click expand
    await toggle.click();
    await expect(toggle).toContainText("Show less");
    await expect(lyricsBody).toContainText("Line five is now visible");
    await expect(lyricsBody).toContainText("Line six wraps it up");

    // Click collapse
    await toggle.click();
    await expect(toggle).toContainText("Show more");
    await expect(lyricsBody).not.toContainText("Line five is now visible");
  });

  test("song count badge shows correct count from storage", async ({ page }) => {
    // baseFixture has 1 non-deleted song for fixture-msg-1a
    await seedFixture(page, baseFixture);
    await page.goto("/lyrics/fixture-msg-1a");

    const card = page.getByTestId("lyrics-item-card").first();
    await expect(card.getByTestId("card-song-count")).toContainText("1 song");
  });

  test("song count badge shows 'No songs yet' when there are no songs", async ({
    page,
  }) => {
    // multiMessageFixture has no songs
    await seedFixture(page, multiMessageFixture);
    await page.goto("/lyrics/fixture-multi-msg-1a");

    const card = page.getByTestId("lyrics-item-card").first();
    await expect(card.getByTestId("card-song-count")).toContainText("No songs yet");
  });

  test("Songs button navigates to /lyrics/:messageId/songs", async ({ page }) => {
    await seedFixture(page, multiMessageFixture);
    await page.goto("/lyrics/fixture-multi-msg-1a");

    const card = page.getByTestId("lyrics-item-card").first();
    await card.getByTestId("card-songs-btn").click();

    await expect(page).toHaveURL(/\/lyrics\/fixture-multi-msg-1a\/songs/);
  });

  test("clicking card body navigates to /lyrics/:messageId", async ({ page }) => {
    await seedFixture(page, multiMessageFixture);
    // Navigate to the latest leaf so we can click an earlier card
    await page.goto("/lyrics/fixture-multi-msg-3a");

    // Click the first card (City Pulse — fixture-multi-msg-1a)
    const firstCard = page.getByTestId("lyrics-item-card").first();
    await firstCard.getByTestId("card-title").click();

    await expect(page).toHaveURL(/\/lyrics\/fixture-multi-msg-1a/);
  });

  test("multi-message fixture: all 3 assistant cards match expected data", async ({
    page,
  }) => {
    await seedFixture(page, multiMessageFixture);
    await page.goto("/lyrics/fixture-multi-msg-3a");

    const cards = page.getByTestId("lyrics-item-card");
    await expect(cards).toHaveCount(3);

    // First card: City Pulse
    await expect(cards.nth(0).getByTestId("card-title")).toContainText("City Pulse");
    await expect(cards.nth(0).getByTestId("card-style")).toContainText("synthwave");
    await expect(cards.nth(0).getByTestId("card-commentary")).toContainText(
      "First draft, establishing the mood."
    );

    // Second card: Dark Frequency
    await expect(cards.nth(1).getByTestId("card-title")).toContainText("Dark Frequency");
    await expect(cards.nth(1).getByTestId("card-style")).toContainText("synthwave, cinematic");
    await expect(cards.nth(1).getByTestId("card-commentary")).toContainText(
      "Darker tone, added tension."
    );

    // Third card: Neon Rain
    await expect(cards.nth(2).getByTestId("card-title")).toContainText("Neon Rain");
    await expect(cards.nth(2).getByTestId("card-style")).toContainText(
      "synthwave, dark, driving beat"
    );
    await expect(cards.nth(2).getByTestId("card-commentary")).toContainText(
      "Third iteration of a city-at-night concept."
    );
  });

  test("MCP QA: cards render correctly at 375x812 mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seedFixture(page, multiMessageFixture);
    await page.goto("/lyrics/fixture-multi-msg-3a");

    // Switch to Chat tab on mobile
    const tabBar = page.getByTestId("mobile-tab-bar");
    await expect(tabBar).toBeVisible();
    await page.getByTestId("tab-chat").click();

    const cards = page.getByTestId("lyrics-item-card");
    await expect(cards).toHaveCount(3);

    // Verify the first card is fully visible and shows title
    await expect(cards.first().getByTestId("card-title")).toContainText("City Pulse");
    await expect(cards.first().getByTestId("card-songs-btn")).toBeVisible();
  });
});
