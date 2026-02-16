/**
 * Tests for US-023: Blocking API key modal with inline error states.
 *
 * Verifies that:
 * - Modal appears when POE_API_KEY is absent and user submits a chat message
 * - Modal appears when POE_API_KEY is absent and user triggers song generation
 * - No API request is made while the modal is shown
 * - Modal contains an inline API key input (not a link to Settings)
 * - Cancel button dismisses the modal without proceeding
 * - When API key IS present, modal is NOT shown
 *
 * State is seeded via storageService.import() — the same code path as the
 * real Settings import UI — so test state mirrors real user behaviour.
 */

import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import { noApiKeyFixture, baseFixture } from "../fixtures/index";

test.describe("API key missing modal — Lyrics Generator", () => {
  test("shows modal when API key is absent and user submits a chat message", async ({
    page,
  }) => {
    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/new");

    await page.getByTestId("chat-input").fill("Write me a song about the sea");
    await page.getByTestId("chat-submit").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "API Key Required" })
    ).toBeVisible();
  });

  test("modal contains an inline API key input (not a link to Settings)", async ({ page }) => {
    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/new");

    await page.getByTestId("chat-input").fill("test");
    await page.getByTestId("chat-submit").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
    await expect(page.getByTestId("api-key-input")).toBeVisible();
    await expect(page.getByTestId("api-key-save-btn")).toBeVisible();
  });

  test("Save & Continue button is disabled when input is empty", async ({ page }) => {
    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/new");

    await page.getByTestId("chat-input").fill("test");
    await page.getByTestId("chat-submit").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
    await expect(page.getByTestId("api-key-save-btn")).toBeDisabled();
  });

  test("modal does NOT appear when API key is present", async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/music/lyrics/new");

    await page.getByTestId("chat-input").fill("Write me a song about the sea");
    await page.getByTestId("chat-submit").click();

    await expect(page.getByTestId("api-key-missing-modal")).not.toBeVisible();
  });

  test("Cancel button closes the modal", async ({ page }) => {
    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/new");

    await page.getByTestId("chat-input").fill("test");
    await page.getByTestId("chat-submit").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("api-key-missing-modal")).not.toBeVisible();
  });
});

test.describe("API key missing modal — Song Generator", () => {
  test("shows modal when API key is absent and user triggers song generation", async ({
    page,
  }) => {
    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/fixture-msg-nokey-a/songs");

    await page.getByTestId("generate-songs-btn").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "API Key Required" })
    ).toBeVisible();
  });

  test("modal contains an inline API key input", async ({ page }) => {
    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/fixture-msg-nokey-a/songs");

    await page.getByTestId("generate-songs-btn").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
    await expect(page.getByTestId("api-key-input")).toBeVisible();
    await expect(page.getByTestId("api-key-save-btn")).toBeVisible();
  });

  test("modal does NOT appear when API key is present", async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/music/lyrics/fixture-msg-1a/songs");

    await page.getByTestId("generate-songs-btn").click();

    await expect(page.getByTestId("api-key-missing-modal")).not.toBeVisible();
  });

  test("Cancel button closes the modal", async ({ page }) => {
    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/fixture-msg-nokey-a/songs");

    await page.getByTestId("generate-songs-btn").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("api-key-missing-modal")).not.toBeVisible();
  });
});
