/**
 * Tests for US-006: Settings page.
 * Tests for US-030: Export and backup covers all data.
 *
 * Verifies that:
 * - POE_API_KEY input saves to localStorage on submit and is pre-filled on reload
 * - numSongs input saves to localStorage on submit
 * - Export button downloads JSON data (music + image combined)
 * - Export filename uses "studio-backup-<date>.json" branding
 * - "Include API key in export" checkbox controls poeApiKey presence in export
 * - Import button accepts a JSON file and restores all seeded data (music + image)
 * - Reset action clears both music and image data
 * - Screenshot test with seeded fixture data
 *
 * State is seeded via storageService.import() — the same code path as the
 * real Settings import UI — so test state mirrors real user behaviour.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { seedFixture } from "./helpers/seed";
import { seedImageFixture } from "../image/helpers/seed";
import { screenshotPage } from "./helpers/screenshot";
import { baseFixture, emptyFixture } from "../fixtures/index";
import { imageBaseFixture } from "../fixtures/index";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await seedFixture(page, emptyFixture);
    await page.goto("/settings");
  });

  test("save API key and reload: key is pre-filled", async ({ page }) => {
    const apiKeyInput = page.getByLabel("POE API Key");
    await apiKeyInput.fill("my-test-api-key");

    const numSongsInput = page.getByLabel("Songs to generate");
    await numSongsInput.fill("5");

    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    // Reload and verify the key is pre-filled
    await page.reload();
    await expect(page.getByLabel("POE API Key")).toHaveValue("my-test-api-key");
    await expect(page.getByLabel("Songs to generate")).toHaveValue("5");
  });

  test("numSongs saves to localStorage", async ({ page }) => {
    const numSongsInput = page.getByLabel("Songs to generate");
    await numSongsInput.fill("7");
    await page.getByRole("button", { name: "Save Settings" }).click();

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem("song-builder:settings");
      return raw ? JSON.parse(raw) : null;
    });
    expect(stored).not.toBeNull();
    expect(stored.numSongs).toBe(7);
  });

  test("default numSongs is 3 when no settings exist", async ({ page }) => {
    await expect(page.getByLabel("Songs to generate")).toHaveValue("3");
  });

  test("settings form pre-fills from localStorage when seeded", async ({ page }) => {
    // Seed base fixture which has poeApiKey and numSongs: 3
    await seedFixture(page, baseFixture);
    await page.goto("/settings");
    await expect(page.getByLabel("POE API Key")).toHaveValue("test-poe-api-key");
    await expect(page.getByLabel("Songs to generate")).toHaveValue("3");
  });
});

test.describe("Settings: export / import", () => {
  test("export → import round-trip restores all seeded music data", async ({ page }) => {
    // Seed base fixture (has entry + song + settings)
    await seedFixture(page, baseFixture);
    await page.goto("/settings");

    // Check "Include API key in export" so the key is preserved in the exported file
    await page.getByLabel("Include API key in export").check();

    // Start watching for the download
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Data" }).click();
    const download = await downloadPromise;

    // Save the downloaded file to a temp path
    const tmpFile = path.join(os.tmpdir(), `export-${Date.now()}.json`);
    await download.saveAs(tmpFile);

    // Wipe localStorage, then re-import using the Settings import UI
    await page.evaluate(() => localStorage.clear());

    // Verify storage is empty
    const afterClear = await page.evaluate(() =>
      window.storageService.export()
    );
    expect(afterClear.messages).toHaveLength(0);
    expect(afterClear.songs).toHaveLength(0);

    // Use the file input to import the saved export
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpFile);

    // Wait briefly for the import to complete
    await page.waitForTimeout(200);

    // Verify all data is restored
    const restored = await page.evaluate(() => window.storageService.export());
    expect(restored.messages).toHaveLength(baseFixture.messages.length);
    expect(restored.songs).toHaveLength(baseFixture.songs.length);
    expect(restored.settings?.poeApiKey).toBe("test-poe-api-key");
    expect(restored.settings?.numSongs).toBe(3);

    // Clean up temp file
    fs.unlinkSync(tmpFile);
  });

  test("export includes image data and import round-trip restores it", async ({ page }) => {
    // Seed both music and image data
    await seedFixture(page, baseFixture);
    await seedImageFixture(page, imageBaseFixture, { navigate: false });
    await page.goto("/settings");

    await page.getByLabel("Include API key in export").check();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Data" }).click();
    const download = await downloadPromise;

    const tmpFile = path.join(os.tmpdir(), `export-image-${Date.now()}.json`);
    await download.saveAs(tmpFile);

    // Verify exported JSON contains image data
    const content = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(content.image).toBeDefined();
    expect(Array.isArray(content.image.sessions)).toBe(true);
    expect(content.image.sessions).toHaveLength(imageBaseFixture.sessions.length);
    expect(Array.isArray(content.image.generations)).toBe(true);
    expect(content.image.generations).toHaveLength(imageBaseFixture.generations.length);
    expect(Array.isArray(content.image.items)).toBe(true);
    expect(content.image.items).toHaveLength(imageBaseFixture.items.length);

    // Wipe storage and re-import
    await page.evaluate(() => localStorage.clear());

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpFile);
    await page.waitForTimeout(200);

    // Verify image data is restored
    const restoredImage = await page.evaluate(() => window.imageStorageService.export());
    expect(restoredImage.sessions).toHaveLength(imageBaseFixture.sessions.length);
    expect(restoredImage.generations).toHaveLength(imageBaseFixture.generations.length);
    expect(restoredImage.items).toHaveLength(imageBaseFixture.items.length);

    fs.unlinkSync(tmpFile);
  });

  test("export filename uses studio-backup-<date> branding", async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/settings");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Data" }).click();
    const download = await downloadPromise;

    const suggestedFilename = download.suggestedFilename();
    expect(suggestedFilename).toMatch(/^studio-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test("export without include API keys omits poeApiKey", async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/settings");

    // Leave "Include API key in export" unchecked (default)
    await expect(page.getByLabel("Include API key in export")).not.toBeChecked();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Data" }).click();
    const download = await downloadPromise;

    const tmpFile = path.join(os.tmpdir(), `export-nokey-${Date.now()}.json`);
    await download.saveAs(tmpFile);

    const content = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(content.settings.poeApiKey).toBe("");

    fs.unlinkSync(tmpFile);
  });

  test("export with include API keys preserves poeApiKey", async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/settings");

    await page.getByLabel("Include API key in export").check();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Data" }).click();
    const download = await downloadPromise;

    const tmpFile = path.join(os.tmpdir(), `export-withkey-${Date.now()}.json`);
    await download.saveAs(tmpFile);

    const content = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(content.settings.poeApiKey).toBe("test-poe-api-key");

    fs.unlinkSync(tmpFile);
  });
});

test.describe("Settings: Reset Memory", () => {
  test.beforeEach(async ({ page }) => {
    await seedFixture(page, baseFixture);
    await seedImageFixture(page, imageBaseFixture, { navigate: false });
    await page.goto("/settings");
  });

  test("Reset Memory button is present", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Reset Memory" })).toBeVisible();
  });

  test("clicking Reset Memory opens confirmation dialog with exact warning text", async ({ page }) => {
    await page.getByRole("button", { name: "Reset Memory" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByText(
        "This will permanently delete all lyrics, songs, and settings. This cannot be undone."
      )
    ).toBeVisible();
  });

  test("cancelling dialog dismisses it without clearing data", async ({ page }) => {
    await page.getByRole("button", { name: "Reset Memory" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Data should still be intact
    const stored = await page.evaluate(() => window.storageService.export());
    expect(stored.messages.length).toBeGreaterThan(0);
  });

  test("confirming reset clears localStorage and redirects to /", async ({ page }) => {
    await page.getByRole("button", { name: "Reset Memory" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: "Confirm Reset" }).click();

    // Should redirect to /
    await page.waitForURL("/");

    // localStorage should be empty
    const allKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(allKeys).toHaveLength(0);
  });

  test("confirming reset clears image data", async ({ page }) => {
    // Verify image data exists before reset
    const beforeReset = await page.evaluate(() => window.imageStorageService.export());
    expect(beforeReset.sessions.length).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Reset Memory" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Confirm Reset" }).click();
    await page.waitForURL("/");

    // All storage should be cleared
    const allKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(allKeys).toHaveLength(0);
  });
});

test("@screenshot:settings settings page renders correctly with seeded data", async ({
  page,
}) => {
  await screenshotPage(page, "/settings", baseFixture, {
    path: "screenshots/settings.png",
  });

  // Verify key elements are visible
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("POE API Key")).toBeVisible();
  await expect(page.getByLabel("Songs to generate")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export Data" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import Data" })).toBeVisible();
  await expect(page.getByLabel("Include API key in export")).toBeVisible();
});
