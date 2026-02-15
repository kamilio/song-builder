/**
 * Tests for US-002: Breadcrumb navigation.
 *
 * Verifies that the breadcrumb bar renders the correct segments on each page
 * and that each segment is a clickable link.
 *
 * Breadcrumb segment rules:
 *   /lyrics                  → Lyrics
 *   /lyrics/:messageId       → Lyrics / {title}
 *   /lyrics/:messageId/songs → Lyrics / {title} / Songs
 *   /pinned                  → Pinned Songs
 *   /settings                → Settings
 *
 * State is seeded via storageService.import() to mirror real user behaviour.
 */

import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import { baseFixture } from "../fixtures/index";

test.describe("Breadcrumb navigation (US-002)", () => {
  test.beforeEach(async ({ page }) => {
    await seedFixture(page, baseFixture);
  });

  test("/lyrics shows 'Lyrics' breadcrumb", async ({ page }) => {
    await page.goto("/music/lyrics");
    const breadcrumb = page.getByLabel("Breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText("Lyrics");
  });

  test("/pinned shows 'Pinned Songs' breadcrumb", async ({ page }) => {
    await page.goto("/music/pinned");
    const breadcrumb = page.getByLabel("Breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText("Pinned Songs");
  });

  test("/settings shows 'Settings' breadcrumb", async ({ page }) => {
    await page.goto("/music/settings");
    const breadcrumb = page.getByLabel("Breadcrumb");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText("Settings");
  });

  test("/music/lyrics/:id shows 'Lyrics / {title}' breadcrumb", async ({ page }) => {
    await page.goto("/music/lyrics/fixture-msg-1a");
    const breadcrumb = page.getByLabel("Breadcrumb");
    await expect(breadcrumb).toBeVisible();
    // First segment: Lyrics (link)
    await expect(breadcrumb.getByRole("link", { name: "Lyrics" })).toBeVisible();
    // Last segment: title of the message
    await expect(breadcrumb).toContainText("Coffee Dreams");
  });

  test("breadcrumb 'Lyrics' segment on /lyrics/:id is a clickable link to /lyrics", async ({
    page,
  }) => {
    await page.goto("/music/lyrics/fixture-msg-1a");
    const lyricsLink = page.getByLabel("Breadcrumb").getByRole("link", { name: "Lyrics" });
    await expect(lyricsLink).toBeVisible();
    await lyricsLink.click();
    await expect(page).toHaveURL("/music/lyrics");
  });

  test("/ (Home) has no breadcrumb nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Breadcrumb")).not.toBeVisible();
  });
});
