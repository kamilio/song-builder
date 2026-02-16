/**
 * Tests for US-023: Blocking API key modal with inline error states.
 *
 * Tests the verification flow:
 * - Invalid key shows inline error inside the modal; modal stays open
 * - Network error shows inline error describing the problem
 * - Valid key dismisses the modal and the original action proceeds
 * - Modal can be cancelled without providing a key (action is abandoned)
 *
 * Uses page.route() to mock GET https://api.poe.com/usage/current_balance
 * so no real network calls are made.
 */

import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import { noApiKeyFixture } from "../fixtures/index";

const BALANCE_URL = "https://api.poe.com/usage/current_balance";

test.describe("API key modal — inline verification (US-023)", () => {
  test("inline error shown when invalid key is entered (HTTP 401)", async ({ page }) => {
    // Mock the balance endpoint to return 401
    await page.route(BALANCE_URL, (route) => {
      route.fulfill({ status: 401, body: "Unauthorized" });
    });

    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/new");

    await page.getByTestId("chat-input").fill("test");
    await page.getByTestId("chat-submit").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();

    await page.getByTestId("api-key-input").fill("bad-key");
    await page.getByTestId("api-key-save-btn").click();

    // Modal should stay open with inline error
    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
    await expect(page.getByTestId("api-key-error")).toBeVisible();
    await expect(page.getByTestId("api-key-error")).toContainText("Invalid API key");
  });

  test("inline error shown for unexpected server error (HTTP 500)", async ({ page }) => {
    await page.route(BALANCE_URL, (route) => {
      route.fulfill({ status: 500, body: "Internal Server Error" });
    });

    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/new");

    await page.getByTestId("chat-input").fill("test");
    await page.getByTestId("chat-submit").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();

    await page.getByTestId("api-key-input").fill("some-key");
    await page.getByTestId("api-key-save-btn").click();

    // Modal should stay open with inline error
    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
    await expect(page.getByTestId("api-key-error")).toBeVisible();
    await expect(page.getByTestId("api-key-error")).toContainText("500");
  });

  test("inline error clears when user edits the key after an error", async ({ page }) => {
    await page.route(BALANCE_URL, (route) => {
      route.fulfill({ status: 401, body: "Unauthorized" });
    });

    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/new");

    await page.getByTestId("chat-input").fill("test");
    await page.getByTestId("chat-submit").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();

    await page.getByTestId("api-key-input").fill("bad-key");
    await page.getByTestId("api-key-save-btn").click();

    await expect(page.getByTestId("api-key-error")).toBeVisible();

    // Editing the input should clear the error
    await page.getByTestId("api-key-input").fill("different-key");
    await expect(page.getByTestId("api-key-error")).not.toBeVisible();
  });

  test("valid key dismisses the modal", async ({ page }) => {
    // Mock the balance endpoint to return success
    await page.route(BALANCE_URL, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ balance: 1000 }),
      });
    });

    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/new");

    await page.getByTestId("chat-input").fill("test");
    await page.getByTestId("chat-submit").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();

    await page.getByTestId("api-key-input").fill("valid-key");
    await page.getByTestId("api-key-save-btn").click();

    await expect(page.getByTestId("api-key-missing-modal")).not.toBeVisible();
  });

  test("Cancel button abandons the action and closes modal", async ({ page }) => {
    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/new");

    const inputText = "test prompt";
    await page.getByTestId("chat-input").fill(inputText);
    await page.getByTestId("chat-submit").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByTestId("api-key-missing-modal")).not.toBeVisible();
    // The input text should still be there since the action was abandoned
    await expect(page.getByTestId("chat-input")).toHaveValue(inputText);
  });
});
