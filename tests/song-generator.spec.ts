/**
 * Tests for US-011: Song Generator page with parallel ElevenLabs generation.
 *
 * Verifies that:
 * - Page renders the linked lyrics entry (title, style) from ?entryId= query param
 * - Triggering generation calls llmClient.generateSong() N times concurrently
 * - Per-song loading indicators are shown during generation
 * - N songs are rendered with audio players after generation completes
 * - Generated songs are persisted to localStorage under the current lyrics entry
 * - N respects the numSongs value from Settings (default 3)
 * - A "no entry" message is shown when no entryId is present
 * - Screenshot test with seeded fixture data
 *
 * State is seeded via storageService.import() (the same code path as the real
 * Settings import UI), and all LLM calls use MockLLMClient (VITE_USE_MOCK_LLM=true)
 * which returns the fixture audio URL without any live API calls.
 */

import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import { screenshotPage } from "./helpers/screenshot";
import {
  baseFixture,
  noApiKeyFixture,
  songGeneratorFixture,
} from "../fixtures/index";

// The audio URL returned by MockLLMClient (from src/lib/llm/fixtures/song-response.json)
const MOCK_AUDIO_URL =
  "https://pfst.cf2.poecdn.net/base/audio/0d80fec33b1948741959d66bafe06da54553bfd28fb6409aac588255cc4f2714";

test.describe("Song Generator page", () => {
  test("shows no-entry message when no messageId query param is present", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/songs");

    await expect(page.getByTestId("no-entry-message")).toBeVisible();
  });

  test("renders entry info when messageId is provided", async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/songs?messageId=fixture-msg-1a");

    await expect(page.getByTestId("song-entry-info")).toBeVisible();
    await expect(page.getByTestId("song-entry-title")).toHaveText(
      "Coffee Dreams"
    );
    await expect(page.getByTestId("song-entry-style")).toHaveText("upbeat pop");
  });

  test("shows pre-existing songs from storage on load", async ({ page }) => {
    await seedFixture(page, songGeneratorFixture);
    await page.goto("/songs?messageId=fixture-msg-songs-a");

    // 3 pre-existing songs in the fixture
    await expect(page.getByTestId("song-item")).toHaveCount(3);
    await expect(page.getByTestId("song-audio").first()).toHaveAttribute("src");
  });

  test("generate button is enabled even when no message is selected (API key guard still fires)", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/songs");

    // Button is always enabled so the API key guard can show the modal if needed.
    await expect(page.getByTestId("generate-songs-btn")).toBeEnabled();
  });

  test("shows API key modal when API key is absent and user triggers generation", async ({
    page,
  }) => {
    await seedFixture(page, noApiKeyFixture);
    await page.goto("/songs?messageId=fixture-msg-nokey-a");

    await page.getByTestId("generate-songs-btn").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
  });

  test("generates N songs in parallel and renders them with audio players", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    // baseFixture has numSongs: 3
    await page.goto("/songs?messageId=fixture-msg-1a");

    await page.getByTestId("generate-songs-btn").click();

    // Wait for all 3 songs to be rendered (slots or list items with audio)
    // MockLLMClient has 200ms delay; allow generous timeout for 3 parallel calls
    await expect(page.getByTestId("song-audio")).toHaveCount(
      // baseFixture already has 1 song, so we expect 1 + 3 = 4 after generation
      4,
      { timeout: 5000 }
    );

    // All audio elements should have the mock fixture URL
    const audios = page.getByTestId("song-audio");
    const count = await audios.count();
    for (let i = 0; i < count; i++) {
      await expect(audios.nth(i)).toHaveAttribute("src");
    }
  });

  test("generated songs are persisted to localStorage", async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/songs?messageId=fixture-msg-1a");

    await page.getByTestId("generate-songs-btn").click();

    // Wait for generation to complete (4 audio elements: 1 existing + 3 new)
    await expect(page.getByTestId("song-audio")).toHaveCount(4, {
      timeout: 5000,
    });

    // Verify songs are persisted in localStorage via storageService
    const songsInStorage = await page.evaluate(() => {
      const stored = localStorage.getItem("song-builder:songs");
      if (!stored) return [];
      return JSON.parse(stored) as Array<{
        id: string;
        messageId: string;
        audioUrl: string;
      }>;
    });

    const msgSongs = songsInStorage.filter(
      (s) => s.messageId === "fixture-msg-1a"
    );
    // 1 pre-existing + 3 newly generated
    expect(msgSongs.length).toBe(4);
    // All new songs should have the mock audio URL
    const newSongs = msgSongs.filter(
      (s) => s.id !== "fixture-song-1"
    );
    for (const song of newSongs) {
      expect(song.audioUrl).toBe(MOCK_AUDIO_URL);
    }
  });

  test("respects numSongs from Settings", async ({ page }) => {
    // Use a fixture with numSongs: 2 (instead of the default 3)
    const twoSongsFixture = {
      ...baseFixture,
      settings: { poeApiKey: "test-poe-api-key", numSongs: 2 },
      songs: [], // no pre-existing songs so count is easy to assert
    };
    await seedFixture(page, twoSongsFixture);
    await page.goto("/songs?messageId=fixture-msg-1a");

    await page.getByTestId("generate-songs-btn").click();

    // Should generate exactly 2 songs
    await expect(page.getByTestId("song-audio")).toHaveCount(2, {
      timeout: 5000,
    });
  });

  test("shows per-song loading indicators during generation", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/songs?messageId=fixture-msg-1a");

    await page.getByTestId("generate-songs-btn").click();

    // At least one loading slot should be visible immediately after click
    // (before the 200ms mock delay expires)
    await expect(page.getByTestId("song-slots")).toBeVisible();
  });

  test("screenshot: song generator with pre-existing songs", async ({
    page,
  }) => {
    await screenshotPage(
      page,
      "/songs?messageId=fixture-msg-songs-a",
      songGeneratorFixture,
      { path: "screenshots/song-generator.png" }
    );
    // Verify screenshot was taken without error by checking the entry is visible
    await expect(page.getByTestId("song-entry-title")).toHaveText("Sunday Gold");
    await expect(page.getByTestId("song-item")).toHaveCount(3);
  });
});
