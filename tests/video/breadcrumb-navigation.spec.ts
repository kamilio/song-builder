/**
 * US-067: Sub-routes and breadcrumb navigation.
 *
 * Verifies:
 *   1. /video/scripts/:id renders Write mode (shot list), breadcrumb "Scripts › {title}"
 *   2. /video/scripts/:id/:shotId renders Shot detail view, breadcrumb third segment = shot title
 *   3. /video/scripts/:id/templates renders Templates view, breadcrumb third segment = "Templates"
 *   4. /video/scripts/:id/settings renders Settings page, breadcrumb third segment = "Settings"
 *   5. Clicking "Scripts" breadcrumb navigates to /video/scripts
 *   6. Clicking script title breadcrumb from shot view navigates to /video/scripts/:id
 *   7. Navigating to a non-existent shotId redirects to /video/scripts/:id
 */

import { test, expect } from "@playwright/test";

interface SeededScript {
  scriptId: string;
  shot1Id: string;
}

async function seedScript(page: import("@playwright/test").Page): Promise<SeededScript> {
  return page.evaluate(() => {
    window.videoStorageService.reset();

    const now = new Date().toISOString();
    const t = Date.now();
    const shot1Id = `shot-1-${t}`;
    const scriptId = `script-${t + 1}`;

    const script = {
      id: scriptId,
      title: "Breadcrumb Test Script",
      createdAt: now,
      updatedAt: now,
      settings: {
        subtitles: false,
        defaultAudio: "video" as const,
        narrationEnabled: false,
        globalPrompt: "",
      },
      shots: [
        {
          id: shot1Id,
          title: "Opening Shot",
          prompt: "A wide aerial view.",
          narration: { enabled: false, text: "", audioSource: "video" as const },
          video: { selectedUrl: null, history: [] },
          subtitles: false,
          duration: 8,
        },
      ],
      templates: {},
    };

    localStorage.setItem(
      "song-builder:video-scripts",
      JSON.stringify([script])
    );

    return { scriptId, shot1Id };
  });
}

test.describe("US-067: Sub-routes and breadcrumb navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  // ── 1. /video/scripts/:id → Write mode + breadcrumb ──────────────────────────
  test("script index route shows write mode and breadcrumb with script title", async ({
    page,
  }) => {
    const { scriptId } = await seedScript(page);

    await page.goto(`/video/scripts/${scriptId}`);

    // Write mode content should be visible
    await expect(page.getByTestId("write-mode-content")).toBeVisible();

    // Breadcrumb: "Scripts" then "Breadcrumb Test Script"
    const breadcrumb = page.getByTestId("breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText("Scripts");
    await expect(breadcrumb).toContainText("Breadcrumb Test Script");
  });

  // ── 2. /video/scripts/:id/:shotId → Shot detail + breadcrumb ─────────────────
  test("shot route shows shot detail and breadcrumb with shot title", async ({
    page,
  }) => {
    const { scriptId, shot1Id } = await seedScript(page);

    await page.goto(`/video/scripts/${scriptId}/${shot1Id}`);

    // Shot mode content should be visible (via data-testid on shot panel)
    // The script-editor div is the container; and shot mode renders ShotModeView
    await expect(page.getByTestId("script-editor")).toBeVisible();

    // Mode toggle shows Shot as active
    const shotToggle = page.getByTestId("mode-toggle-shot");
    await expect(shotToggle).toContainText("●");

    // Breadcrumb: "Scripts" › "Breadcrumb Test Script" › "Opening Shot"
    const breadcrumb = page.getByTestId("breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText("Scripts");
    await expect(breadcrumb).toContainText("Breadcrumb Test Script");
    await expect(breadcrumb).toContainText("Opening Shot");
  });

  // ── 3. /video/scripts/:id/templates → Templates view + breadcrumb ────────────
  test("templates route shows templates view and breadcrumb with Templates segment", async ({
    page,
  }) => {
    const { scriptId } = await seedScript(page);

    await page.goto(`/video/scripts/${scriptId}/templates`);

    // Templates mode content should be visible
    await expect(page.getByTestId("tmpl-mode-content")).toBeVisible();

    // Breadcrumb: "Scripts" › "Breadcrumb Test Script" › "Templates"
    const breadcrumb = page.getByTestId("breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText("Scripts");
    await expect(breadcrumb).toContainText("Breadcrumb Test Script");
    await expect(breadcrumb).toContainText("Templates");
  });

  // ── 4. /video/scripts/:id/settings → Settings page + breadcrumb ──────────────
  test("settings route shows settings page and breadcrumb with Settings segment", async ({
    page,
  }) => {
    const { scriptId } = await seedScript(page);

    await page.goto(`/video/scripts/${scriptId}/settings`);

    // Settings page should be visible
    await expect(page.getByTestId("script-settings")).toBeVisible();

    // Breadcrumb: "Scripts" › "Breadcrumb Test Script" › "Settings"
    const breadcrumb = page.getByTestId("breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText("Scripts");
    await expect(breadcrumb).toContainText("Breadcrumb Test Script");
    await expect(breadcrumb).toContainText("Settings");
  });

  // ── 5. Clicking "Scripts" breadcrumb navigates to /video/scripts ─────────────
  test("clicking Scripts breadcrumb navigates to scripts list", async ({
    page,
  }) => {
    const { scriptId } = await seedScript(page);

    await page.goto(`/video/scripts/${scriptId}`);

    // Click the "Scripts" breadcrumb link (first segment)
    const scriptsLink = page.getByTestId("breadcrumb-segment-0");
    await expect(scriptsLink).toBeVisible();
    await scriptsLink.click();

    // Should navigate to scripts list
    await expect(page).toHaveURL(/\/video\/scripts$/);
    await expect(page.getByTestId("scripts-grid")).toBeVisible();
  });

  // ── 6. Clicking script title breadcrumb from shot view navigates to :id ───────
  test("clicking script title in breadcrumb from shot view returns to write mode", async ({
    page,
  }) => {
    const { scriptId, shot1Id } = await seedScript(page);

    await page.goto(`/video/scripts/${scriptId}/${shot1Id}`);

    // Wait for shot view to load
    await expect(page.getByTestId("script-editor")).toBeVisible();

    // Click the script title breadcrumb (second segment, index 1)
    const scriptTitleLink = page.getByTestId("breadcrumb-segment-1");
    await expect(scriptTitleLink).toBeVisible();
    await scriptTitleLink.click();

    // Should navigate to /video/scripts/:id (write mode)
    await expect(page).toHaveURL(new RegExp(`/video/scripts/${scriptId}$`));
    await expect(page.getByTestId("write-mode-content")).toBeVisible();
  });

  // ── 7. Non-existent shotId redirects to /video/scripts/:id ───────────────────
  test("navigating to a non-existent shotId redirects to script index", async ({
    page,
  }) => {
    const { scriptId } = await seedScript(page);

    await page.goto(`/video/scripts/${scriptId}/nonexistent-shot-id`);

    // Should redirect to /video/scripts/:id
    await expect(page).toHaveURL(new RegExp(`/video/scripts/${scriptId}$`));
    await expect(page.getByTestId("write-mode-content")).toBeVisible();
  });
});
