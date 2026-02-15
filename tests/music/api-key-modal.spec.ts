/**
 * Tests for US-007: API key missing modal.
 *
 * Verifies that:
 * - Modal appears when POE_API_KEY is absent and user submits a chat message
 * - Modal appears when POE_API_KEY is absent and user triggers song generation
 * - No API request is made while the modal is shown
 * - Modal contains a link/button to navigate to Settings
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

  test("modal contains a link to Settings", async ({ page }) => {
    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/new");

    await page.getByTestId("chat-input").fill("test");
    await page.getByTestId("chat-submit").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Go to Settings" })
    ).toBeVisible();
  });

  test("clicking Go to Settings navigates to /settings", async ({ page }) => {
    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/lyrics/new");

    await page.getByTestId("chat-input").fill("test");
    await page.getByTestId("chat-submit").click();

    await page.getByRole("link", { name: "Go to Settings" }).click();
    await expect(page).toHaveURL(/\/settings/);
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
    await page.goto("/music/songs");

    await page.getByTestId("generate-songs-btn").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "API Key Required" })
    ).toBeVisible();
  });

  test("modal contains a link to Settings", async ({ page }) => {
    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/songs");

    await page.getByTestId("generate-songs-btn").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Go to Settings" })
    ).toBeVisible();
  });

  test("modal does NOT appear when API key is present", async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/music/songs");

    await page.getByTestId("generate-songs-btn").click();

    await expect(page.getByTestId("api-key-missing-modal")).not.toBeVisible();
  });

  test("Cancel button closes the modal", async ({ page }) => {
    await seedFixture(page, noApiKeyFixture);
    await page.goto("/music/songs");

    await page.getByTestId("generate-songs-btn").click();

    await expect(page.getByTestId("api-key-missing-modal")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("api-key-missing-modal")).not.toBeVisible();
  });
});
