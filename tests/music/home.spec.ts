/**
 * Tests for US-003: Home page redesign (single prompt, creates root message).
 *
 * Verifies that:
 * - The home page shows only a centered prompt input with the correct placeholder
 * - Submitting creates a root Message (parentId: null) in storage
 * - After submit the URL changes to /lyrics/:messageId
 */

import { test, expect } from "@playwright/test";
import { clearStorage } from "./helpers/seed";

test.describe("Home page — single prompt (US-003)", () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
    await page.goto("/");
  });

  test("shows a prompt textarea with correct placeholder", async ({ page }) => {
    const textarea = page.getByPlaceholder("What song do you want to make?");
    await expect(textarea).toBeVisible();
  });

  test("shows a submit button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  });

  test("does not show breadcrumbs or top bar on home", async ({ page }) => {
    await expect(page.getByTestId("top-bar")).not.toBeVisible();
  });

  test("submit creates a root Message and navigates to /lyrics/:messageId", async ({
    page,
  }) => {
    const textarea = page.getByPlaceholder("What song do you want to make?");
    await textarea.fill("A funky anthem about coffee");

    await page.getByRole("button", { name: "Start" }).click();

    // URL should have navigated to /lyrics/:messageId
    await expect(page).toHaveURL(/\/music\/lyrics\/[^/]+$/);

    // Extract messageId from URL
    const url = page.url();
    const messageId = url.split("/music/lyrics/")[1];

    // Verify the message exists in storage with parentId: null
    const message = await page.evaluate((id: string) => {
      return window.storageService.getMessage(id);
    }, messageId);

    expect(message).not.toBeNull();
    expect(message!.parentId).toBeNull();
    expect(message!.role).toBe("user");
    expect(message!.content).toBe("A funky anthem about coffee");
  });

  test("submit button is disabled when input is empty", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Start" })).toBeDisabled();
  });

  test("submit button is enabled after typing", async ({ page }) => {
    await page.getByPlaceholder("What song do you want to make?").fill("hello");
    await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
  });
});
