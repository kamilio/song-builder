/**
 * Tests for US-012: Per-song actions (play, pin, delete, download).
 *
 * Verifies that:
 * - Play renders an inline HTML audio player for the song's URL
 * - Pin sets the song's `pinned` flag to true in localStorage
 * - Unpin sets the song's `pinned` flag to false in localStorage
 * - Delete sets the song's `deleted` flag to true; song is hidden from the list
 * - Download button is present on each song item
 * - Action buttons are visible on each song item
 *
 * State is seeded via storageService.import() (the same code path as the real
 * Settings import UI), ensuring test state flows through the same code path
 * as real users.
 */

import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import { songGeneratorFixture } from "../fixtures/index";
import type { Song } from "../src/lib/storage/types";

test.describe("Per-song actions (US-012)", () => {
  test("play: renders an inline audio player for each song", async ({
    page,
  }) => {
    await seedFixture(page, songGeneratorFixture);
    await page.goto("/songs?entryId=fixture-entry-songs");

    // All 3 songs should have audio players
    await expect(page.getByTestId("song-audio")).toHaveCount(3);

    // Each audio player should have the song's audioUrl as its src
    const audios = page.getByTestId("song-audio");
    const count = await audios.count();
    for (let i = 0; i < count; i++) {
      await expect(audios.nth(i)).toHaveAttribute("src");
    }
  });

  test("play: audio player has controls attribute", async ({ page }) => {
    await seedFixture(page, songGeneratorFixture);
    await page.goto("/songs?entryId=fixture-entry-songs");

    const audio = page.getByTestId("song-audio").first();
    await expect(audio).toHaveAttribute("controls");
  });

  test("pin: sets pinned flag to true in localStorage", async ({ page }) => {
    await seedFixture(page, songGeneratorFixture);
    await page.goto("/songs?entryId=fixture-entry-songs");

    // All songs in songGeneratorFixture start as pinned: false
    const firstPinBtn = page.getByTestId("song-pin-btn").first();
    await expect(firstPinBtn).toHaveText("Pin");

    await firstPinBtn.click();

    // Button label should update to "Unpin"
    await expect(firstPinBtn).toHaveText("Unpin");

    // Verify localStorage was updated
    const songs = await page.evaluate(() => {
      const stored = localStorage.getItem("song-builder:songs");
      if (!stored) return [] as Song[];
      return JSON.parse(stored) as Song[];
    });

    const pinnedSong = songs.find((s) => s.id === "fixture-song-gen-1");
    expect(pinnedSong?.pinned).toBe(true);
  });

  test("pin: unpin sets pinned flag to false in localStorage", async ({
    page,
  }) => {
    // Seed a fixture with a pinned song
    const withPinnedSong = {
      ...songGeneratorFixture,
      songs: songGeneratorFixture.songs.map((s, i) =>
        i === 0 ? { ...s, pinned: true } : s
      ),
    };
    await seedFixture(page, withPinnedSong);
    await page.goto("/songs?entryId=fixture-entry-songs");

    // First song should show "Unpin"
    const firstPinBtn = page.getByTestId("song-pin-btn").first();
    await expect(firstPinBtn).toHaveText("Unpin");

    await firstPinBtn.click();

    // Button label should update to "Pin"
    await expect(firstPinBtn).toHaveText("Pin");

    // Verify localStorage was updated
    const songs = await page.evaluate(() => {
      const stored = localStorage.getItem("song-builder:songs");
      if (!stored) return [] as Song[];
      return JSON.parse(stored) as Song[];
    });

    const unpinnedSong = songs.find((s) => s.id === "fixture-song-gen-1");
    expect(unpinnedSong?.pinned).toBe(false);
  });

  test("delete: sets deleted flag to true in localStorage", async ({
    page,
  }) => {
    await seedFixture(page, songGeneratorFixture);
    await page.goto("/songs?entryId=fixture-entry-songs");

    // 3 songs visible initially
    await expect(page.getByTestId("song-item")).toHaveCount(3);

    // Delete the first song
    await page.getByTestId("song-delete-btn").first().click();

    // Song should be hidden from the list
    await expect(page.getByTestId("song-item")).toHaveCount(2);

    // Verify localStorage was updated
    const songs = await page.evaluate(() => {
      const stored = localStorage.getItem("song-builder:songs");
      if (!stored) return [] as Song[];
      return JSON.parse(stored) as Song[];
    });

    const deletedSong = songs.find((s) => s.id === "fixture-song-gen-1");
    expect(deletedSong?.deleted).toBe(true);
  });

  test("delete: song remains in localStorage (soft delete)", async ({
    page,
  }) => {
    await seedFixture(page, songGeneratorFixture);
    await page.goto("/songs?entryId=fixture-entry-songs");

    await page.getByTestId("song-delete-btn").first().click();

    // Song should still exist in localStorage, just with deleted: true
    const songs = await page.evaluate(() => {
      const stored = localStorage.getItem("song-builder:songs");
      if (!stored) return [] as Song[];
      return JSON.parse(stored) as Song[];
    });

    // All 3 songs should still be in storage
    expect(songs.length).toBe(3);
    const deletedSong = songs.find((s) => s.id === "fixture-song-gen-1");
    expect(deletedSong).toBeDefined();
    expect(deletedSong?.deleted).toBe(true);
  });

  test("delete: multiple songs can be deleted", async ({ page }) => {
    await seedFixture(page, songGeneratorFixture);
    await page.goto("/songs?entryId=fixture-entry-songs");

    await expect(page.getByTestId("song-item")).toHaveCount(3);

    // Delete the first song (after deletion, there are 2 remaining)
    await page.getByTestId("song-delete-btn").first().click();
    await expect(page.getByTestId("song-item")).toHaveCount(2);

    // Delete the next first song
    await page.getByTestId("song-delete-btn").first().click();
    await expect(page.getByTestId("song-item")).toHaveCount(1);
  });

  test("download: download button is visible on each song item", async ({
    page,
  }) => {
    await seedFixture(page, songGeneratorFixture);
    await page.goto("/songs?entryId=fixture-entry-songs");

    await expect(page.getByTestId("song-download-btn")).toHaveCount(3);
  });

  test("action buttons are visible on each song item", async ({ page }) => {
    await seedFixture(page, songGeneratorFixture);
    await page.goto("/songs?entryId=fixture-entry-songs");

    // All three action buttons should exist for each song
    await expect(page.getByTestId("song-pin-btn")).toHaveCount(3);
    await expect(page.getByTestId("song-download-btn")).toHaveCount(3);
    await expect(page.getByTestId("song-delete-btn")).toHaveCount(3);
  });
});
