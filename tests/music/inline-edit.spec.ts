/**
 * Tests for US-005: Inline-editable fields in the Lyrics Editor left panel.
 *
 * Verifies:
 * - Pencil icon is visible on hover for each field
 * - Clicking a field activates an inline editor with the current value
 * - Save on blur updates the Message in storage and returns to display mode
 * - Save on Enter (single-line fields) updates the Message in storage
 * - Duration displayed as M:SS; edited as integer seconds
 * - Editing each field (title, style, commentary, duration, lyricsBody) works
 */

import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import { baseFixture } from "../fixtures/index";

/** Fixture with a duration set so the duration field is always visible. */
const fixtureWithDuration = {
  ...baseFixture,
  messages: baseFixture.messages.map((m) =>
    m.id === "fixture-msg-1a" ? { ...m, duration: 185 } : m
  ),
};

test.describe("US-005: Inline-editable fields", () => {
  test.beforeEach(async ({ page }) => {
    await seedFixture(page, fixtureWithDuration);
    await page.goto("/music/lyrics/fixture-msg-1a");
    // Ensure left panel is loaded
    await expect(page.getByTestId("lyrics-title")).toBeVisible();
  });

  // ── Pencil icon on hover ────────────────────────────────────────────────

  test("pencil icon is visible on hover for the title field", async ({
    page,
  }) => {
    const editable = page.getByTestId("lyrics-title-editable");
    await editable.hover();
    await expect(page.getByTestId("lyrics-title-pencil")).toBeVisible();
  });

  test("pencil icon is visible on hover for the style field", async ({
    page,
  }) => {
    const editable = page.getByTestId("lyrics-style-editable");
    await editable.hover();
    await expect(page.getByTestId("lyrics-style-pencil")).toBeVisible();
  });

  test("pencil icon is visible on hover for the duration field", async ({
    page,
  }) => {
    const editable = page.getByTestId("lyrics-duration-editable");
    await editable.hover();
    await expect(page.getByTestId("lyrics-duration-pencil")).toBeVisible();
  });

  // ── Activate editor with current value ─────────────────────────────────

  test("clicking the title field activates the inline editor with current value", async ({
    page,
  }) => {
    await page.getByTestId("lyrics-title-editable").click();
    const input = page.getByTestId("lyrics-title-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("Coffee Dreams");
  });

  test("clicking the style field activates the inline editor with current value", async ({
    page,
  }) => {
    await page.getByTestId("lyrics-style-editable").click();
    const input = page.getByTestId("lyrics-style-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("upbeat pop");
  });

  test("clicking the duration field activates the inline editor showing seconds", async ({
    page,
  }) => {
    await page.getByTestId("lyrics-duration-editable").click();
    const input = page.getByTestId("lyrics-duration-input");
    await expect(input).toBeVisible();
    // The raw seconds value (185), not M:SS
    await expect(input).toHaveValue("185");
  });

  test("duration is displayed as M:SS in display mode", async ({ page }) => {
    await expect(page.getByTestId("lyrics-duration")).toContainText("3:05");
  });

  // ── Save on blur: title ─────────────────────────────────────────────────

  test("editing the title and blurring saves to storage and updates display", async ({
    page,
  }) => {
    // Activate edit mode
    await page.getByTestId("lyrics-title-editable").click();
    const input = page.getByTestId("lyrics-title-input");
    await input.clear();
    await input.fill("Espresso Nights");

    // Blur by clicking elsewhere
    await page.getByTestId("lyrics-frontmatter").click({ position: { x: 5, y: 5 } });

    // Display should update immediately (after refresh)
    await expect(page.getByTestId("lyrics-title")).toContainText("Espresso Nights", {
      timeout: 3000,
    });

    // Verify storage was updated
    const messages = await page.evaluate(() => {
      const stored = localStorage.getItem("song-builder:messages");
      return stored
        ? (JSON.parse(stored) as Array<{ id: string; title?: string }>)
        : [];
    });
    const msg = messages.find((m) => m.id === "fixture-msg-1a");
    expect(msg?.title).toBe("Espresso Nights");
  });

  // ── Save on Enter: title ────────────────────────────────────────────────

  test("pressing Enter in the title input saves and returns to display mode", async ({
    page,
  }) => {
    await page.getByTestId("lyrics-title-editable").click();
    const input = page.getByTestId("lyrics-title-input");
    await input.clear();
    await input.fill("Latte Sunrise");
    await input.press("Enter");

    // Input gone, display shows new value
    await expect(page.getByTestId("lyrics-title-input")).not.toBeVisible();
    await expect(page.getByTestId("lyrics-title")).toContainText("Latte Sunrise");

    // Verify storage
    const messages = await page.evaluate(() => {
      const stored = localStorage.getItem("song-builder:messages");
      return stored
        ? (JSON.parse(stored) as Array<{ id: string; title?: string }>)
        : [];
    });
    const msg = messages.find((m) => m.id === "fixture-msg-1a");
    expect(msg?.title).toBe("Latte Sunrise");
  });

  // ── Save duration as integer seconds ────────────────────────────────────

  test("editing duration saves as integer seconds and displays as M:SS", async ({
    page,
  }) => {
    await page.getByTestId("lyrics-duration-editable").click();
    const input = page.getByTestId("lyrics-duration-input");
    await input.clear();
    await input.fill("240");
    await input.press("Enter");

    // Display should show 4:00
    await expect(page.getByTestId("lyrics-duration")).toContainText("4:00");

    // Verify storage has integer 240
    const messages = await page.evaluate(() => {
      const stored = localStorage.getItem("song-builder:messages");
      return stored
        ? (JSON.parse(stored) as Array<{ id: string; duration?: number }>)
        : [];
    });
    const msg = messages.find((m) => m.id === "fixture-msg-1a");
    expect(msg?.duration).toBe(240);
  });

  // ── Escape cancels edit ─────────────────────────────────────────────────

  test("pressing Escape cancels the edit without saving", async ({ page }) => {
    await page.getByTestId("lyrics-title-editable").click();
    const input = page.getByTestId("lyrics-title-input");
    await input.clear();
    await input.fill("Should Not Save");
    await input.press("Escape");

    // Input gone, original value still shown
    await expect(page.getByTestId("lyrics-title-input")).not.toBeVisible();
    await expect(page.getByTestId("lyrics-title")).toContainText("Coffee Dreams");
  });

  // ── Commentary (multiline) ───────────────────────────────────────────────

  test("clicking commentary field activates a textarea with current value", async ({
    page,
  }) => {
    await page.getByTestId("lyrics-commentary-editable").click();
    const textarea = page.getByTestId("lyrics-commentary-input");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue(
      "A cheerful song about the morning ritual of coffee."
    );
  });

  test("editing commentary and blurring saves to storage", async ({ page }) => {
    await page.getByTestId("lyrics-commentary-editable").click();
    const textarea = page.getByTestId("lyrics-commentary-input");
    await textarea.fill("Updated commentary text.");

    // Blur
    await page.keyboard.press("Tab");

    await expect(page.getByTestId("lyrics-commentary")).toContainText(
      "Updated commentary text.",
      { timeout: 3000 }
    );

    const messages = await page.evaluate(() => {
      const stored = localStorage.getItem("song-builder:messages");
      return stored
        ? (JSON.parse(stored) as Array<{ id: string; commentary?: string }>)
        : [];
    });
    const msg = messages.find((m) => m.id === "fixture-msg-1a");
    expect(msg?.commentary).toBe("Updated commentary text.");
  });

  // ── Lyrics body (multiline) ─────────────────────────────────────────────

  test("clicking lyrics body activates a textarea editor", async ({ page }) => {
    await page.getByTestId("lyrics-body-editable").click();
    const textarea = page.getByTestId("lyrics-body-input");
    await expect(textarea).toBeVisible();
    await expect(textarea).toContainText("Wake up to the smell of something brewing");
  });
});

// ── Mobile QA: 375×812 ────────────────────────────────────────────────────────

test.describe("US-005: Inline-editable fields — mobile (375×812)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seedFixture(page, fixtureWithDuration);
    await page.goto("/music/lyrics/fixture-msg-1a");
    // On mobile, lyrics tab is active by default
    await expect(page.getByTestId("lyrics-title")).toBeVisible();
  });

  test("inline editing works on mobile viewport", async ({ page }) => {
    await page.getByTestId("lyrics-title-editable").click();
    const input = page.getByTestId("lyrics-title-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("Coffee Dreams");

    await input.fill("Mobile Edit");
    await input.press("Enter");

    await expect(page.getByTestId("lyrics-title")).toContainText("Mobile Edit");
  });
});
