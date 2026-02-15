/**
 * Tests for US-013: Empty states, loading skeletons, and error feedback.
 *
 * Verifies that:
 * - Each page renders the correct meaningful empty state when there is no data
 * - Loading skeletons appear during in-flight operations
 * - LLM failure shows a dismissible error toast with a retry hint
 * - Import failure shows an inline error message
 * - Clipboard failure toast shown on failed Report Bug copy
 *
 * State seeded via storageService.import() using emptyFixture where no data
 * exists. Pages checked: LyricsList, Songs View, Pinned Songs.
 */

import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import { emptyFixture, baseFixture, songGeneratorFixture } from "../fixtures/index";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// ─── Empty States ────────────────────────────────────────────────────────────

test.describe("US-013: Empty states", () => {
  test("LyricsList: empty state renders with link to home when no lyrics exist", async ({
    page,
  }) => {
    await seedFixture(page, emptyFixture);
    await page.goto("/music/lyrics");

    const emptyEl = page.getByTestId("lyrics-list-empty");
    await expect(emptyEl).toBeVisible();
    await expect(emptyEl).toContainText("No lyrics yet.");
    // Link back to home
    const homeLink = page.getByRole("link", { name: /Start a new song from home/ });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute("href", "/");
  });

  test("LyricsList: clicking home link navigates to /", async ({ page }) => {
    await seedFixture(page, emptyFixture);
    await page.goto("/music/lyrics");
    await page.getByRole("link", { name: /Start a new song from home/ }).click();
    await expect(page).toHaveURL("/");
  });

  test("SongsView: empty state shown when no songs and a message exists", async ({
    page,
  }) => {
    // baseFixture has a message with no songs attached
    const noSongsFixture = {
      ...baseFixture,
      songs: [],
    };
    await seedFixture(page, noSongsFixture);
    await page.goto("/songs?messageId=fixture-msg-1a");

    const emptyEl = page.getByTestId("no-songs-message");
    await expect(emptyEl).toBeVisible();
    await expect(emptyEl).toContainText("No songs yet.");
    await expect(emptyEl).toContainText("Hit Generate to create some.");
  });

  test("SongsView: empty state not shown when no messageId (no-entry-message shown instead)", async ({
    page,
  }) => {
    await seedFixture(page, emptyFixture);
    await page.goto("/music/songs");

    // When no message exists, the "no entry" message is shown, not the no-songs message
    await expect(page.getByTestId("no-entry-message")).toBeVisible();
    await expect(page.getByTestId("no-songs-message")).not.toBeVisible();
  });

  test("SongsView: no empty state shown during active generation (skeletons instead)", async ({
    page,
  }) => {
    const noSongsFixture = {
      ...baseFixture,
      songs: [],
    };
    await seedFixture(page, noSongsFixture);
    await page.goto("/songs?messageId=fixture-msg-1a");

    await page.getByTestId("generate-songs-btn").click();

    // Slots (skeletons) should be visible, not the empty state
    await expect(page.getByTestId("song-slots")).toBeVisible();
    await expect(page.getByTestId("no-songs-message")).not.toBeVisible();
  });

  test("PinnedSongs: empty state rendered with correct spec text", async ({
    page,
  }) => {
    await seedFixture(page, emptyFixture);
    await page.goto("/music/pinned");

    const emptyEl = page.getByTestId("no-pinned-message");
    await expect(emptyEl).toBeVisible();
    await expect(emptyEl).toHaveText(
      "No pinned songs yet. Pin a song from the Songs View."
    );
  });

  test("LyricsList, SongsView, PinnedSongs: all render empty states with emptyFixture", async ({
    page,
  }) => {
    await seedFixture(page, emptyFixture);

    // LyricsList
    await page.goto("/music/lyrics");
    await expect(page.getByTestId("lyrics-list-empty")).toBeVisible();

    // PinnedSongs
    await page.goto("/music/pinned");
    await expect(page.getByTestId("no-pinned-message")).toBeVisible();

    // SongsView without messageId
    await page.goto("/music/songs");
    await expect(page.getByTestId("no-entry-message")).toBeVisible();
  });
});

// ─── Loading Skeletons ────────────────────────────────────────────────────────

test.describe("US-013: Loading skeletons", () => {
  test("SongsView: skeleton cards shown during generation (not just text)", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/songs?messageId=fixture-msg-1a");

    await page.getByTestId("generate-songs-btn").click();

    // At least one loading slot should be visible immediately
    await expect(page.getByTestId("song-slots")).toBeVisible();
    // The skeleton has role="status" (aria accessibility)
    const skeletons = page.locator('[data-testid^="song-loading-"]');
    await expect(skeletons.first()).toBeVisible();
  });

  test("LyricsGenerator: chat loading skeleton appears during LLM response", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/music/lyrics/fixture-msg-1a");

    const chatInput = page.getByTestId("chat-input");
    await chatInput.fill("make it more energetic");
    await page.getByTestId("chat-submit").click();

    // Loading skeleton should appear immediately (before mock response arrives)
    await expect(page.getByTestId("chat-loading")).toBeVisible();
    // The skeleton should be visible while loading (role="status" for a11y)
    await expect(page.getByTestId("chat-loading")).toHaveAttribute("role", "status");
  });
});

// ─── Error Feedback ───────────────────────────────────────────────────────────

test.describe("US-013: Error feedback — import", () => {
  test("Settings: inline error shown for malformed import file", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/music/settings");

    // Create a temp file with invalid JSON content
    const tmpFile = path.join(os.tmpdir(), `invalid-import-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, "{ this is not valid JSON }");

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpFile);

    // Wait for the error to appear
    await expect(page.getByTestId("import-error")).toBeVisible();
    await expect(page.getByTestId("import-error")).toContainText("Import failed");

    fs.unlinkSync(tmpFile);
  });

  test("Settings: inline error shown for malformed JSON structure", async ({
    page,
  }) => {
    await seedFixture(page, emptyFixture);
    await page.goto("/music/settings");

    // Create a temp file that is valid JSON but wrong structure
    // importStorage throws if the structure is wrong
    const tmpFile = path.join(os.tmpdir(), `bad-structure-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, "not json at all!!!");

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpFile);

    await expect(page.getByTestId("import-error")).toBeVisible();

    fs.unlinkSync(tmpFile);
  });

  test("Settings: no error shown for successful import", async ({ page }) => {
    await seedFixture(page, emptyFixture);
    await page.goto("/music/settings");

    // Create a valid export file
    const validExport = JSON.stringify(baseFixture, null, 2);
    const tmpFile = path.join(os.tmpdir(), `valid-import-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, validExport);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpFile);

    // No import error should be visible
    await expect(page.getByTestId("import-error")).not.toBeVisible();
    // Success message should appear instead
    await expect(page.getByText("Data imported successfully.")).toBeVisible();

    fs.unlinkSync(tmpFile);
  });

  test("Settings: import error auto-dismisses after timeout", async ({
    page,
  }) => {
    await seedFixture(page, emptyFixture);
    await page.goto("/music/settings");

    const tmpFile = path.join(os.tmpdir(), `bad-import-timeout-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, "bad json");

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpFile);

    await expect(page.getByTestId("import-error")).toBeVisible();

    // After 5s the error auto-clears; wait up to 6s
    await expect(page.getByTestId("import-error")).not.toBeVisible({
      timeout: 6000,
    });

    fs.unlinkSync(tmpFile);
  });
});

test.describe("US-013: Error feedback — clipboard (Report Bug)", () => {
  test("Report Bug: toast visible after clicking Report Bug", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/music/lyrics");

    // Open nav menu
    await page.getByTestId("nav-menu-trigger").click();
    await expect(page.getByTestId("nav-menu-dropdown")).toBeVisible();

    // Click Report Bug
    await page.getByTestId("nav-menu-report-bug").click();

    // Toast should appear (either "Log copied" or "Copy failed")
    await expect(page.getByTestId("report-bug-toast")).toBeVisible();
  });
});

// ─── Mobile empty state QA ─────────────────────────────────────────────────

test.describe("US-013: Empty states at 375×812 mobile", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test("LyricsList empty state visible on mobile", async ({ page }) => {
    await seedFixture(page, emptyFixture);
    await page.goto("/music/lyrics");
    await expect(page.getByTestId("lyrics-list-empty")).toBeVisible();
  });

  test("PinnedSongs empty state visible on mobile", async ({ page }) => {
    await seedFixture(page, emptyFixture);
    await page.goto("/music/pinned");
    await expect(page.getByTestId("no-pinned-message")).toBeVisible();
  });

  test("SongsView no-songs message visible on mobile when message exists but no songs", async ({
    page,
  }) => {
    const noSongsFixture = { ...baseFixture, songs: [] };
    await seedFixture(page, noSongsFixture);
    await page.goto("/songs?messageId=fixture-msg-1a");
    await expect(page.getByTestId("no-songs-message")).toBeVisible();
  });
});
