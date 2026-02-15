/**
 * Tests for US-006: Settings page.
 *
 * Verifies that:
 * - POE_API_KEY input saves to localStorage on submit and is pre-filled on reload
 * - numSongs input saves to localStorage on submit
 * - Export button downloads JSON data
 * - "Include API keys in export" checkbox controls poeApiKey presence in export
 * - Import button accepts a JSON file and restores all seeded data
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
import { screenshotPage } from "./helpers/screenshot";
import { baseFixture, emptyFixture } from "../fixtures/index";

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
  test("export → import round-trip restores all seeded data", async ({ page }) => {
    // Seed base fixture (has entry + song + settings)
    await seedFixture(page, baseFixture);
    await page.goto("/settings");

    // Check "Include API keys in export" so the key is preserved in the exported file
    await page.getByLabel("Include API keys in export").check();

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
    expect(afterClear.lyricsEntries).toHaveLength(0);
    expect(afterClear.songs).toHaveLength(0);

    // Use the file input to import the saved export
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpFile);

    // Wait briefly for the import to complete
    await page.waitForTimeout(200);

    // Verify all data is restored
    const restored = await page.evaluate(() => window.storageService.export());
    expect(restored.lyricsEntries).toHaveLength(baseFixture.lyricsEntries.length);
    expect(restored.songs).toHaveLength(baseFixture.songs.length);
    expect(restored.settings?.poeApiKey).toBe("test-poe-api-key");
    expect(restored.settings?.numSongs).toBe(3);

    // Clean up temp file
    fs.unlinkSync(tmpFile);
  });

  test("export without include API keys omits poeApiKey", async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/settings");

    // Leave "Include API keys in export" unchecked (default)
    await expect(page.getByLabel("Include API keys in export")).not.toBeChecked();

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

    await page.getByLabel("Include API keys in export").check();

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
  await expect(page.getByLabel("Include API keys in export")).toBeVisible();
});
