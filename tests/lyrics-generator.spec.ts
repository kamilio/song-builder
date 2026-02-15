/**
 * Tests for US-009: Lyrics Generator layout and frontmatter display.
 * Tests for US-010: Claude chat integration in Lyrics Generator.
 *
 * US-009 verifies that:
 * - Left panel displays YAML frontmatter (title, style, commentary) and lyrics body
 * - Right panel contains scrollable message history and a text input with send button
 * - "Generate Songs" button is present at the bottom of the page
 * - Clicking "Generate Songs" navigates to the Song Generator for the current entry
 * - Screenshot test with seeded fixture data
 *
 * US-010 verifies that:
 * - Submitting a message calls llmClient.chat() and response updates the left panel
 * - A loading indicator is shown while awaiting the response
 * - Chat history is persisted to localStorage and survives a reload
 *
 * State is seeded via storageService.import() — the same code path as the
 * real Settings import UI.
 */

import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import { screenshotPage } from "./helpers/screenshot";
import { baseFixture } from "../fixtures/index";

test.describe("Lyrics Generator page", () => {
  test.beforeEach(async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/lyrics/fixture-msg-1a");
  });

  test("left panel displays frontmatter fields", async ({ page }) => {
    const panel = page.getByTestId("lyrics-panel");
    await expect(panel).toBeVisible();

    // Title, style, and commentary from the fixture
    await expect(page.getByTestId("lyrics-title")).toContainText("Coffee Dreams");
    await expect(page.getByTestId("lyrics-style")).toContainText("upbeat pop");
    await expect(page.getByTestId("lyrics-commentary")).toContainText(
      "A cheerful song about the morning ritual of coffee."
    );
  });

  test("left panel displays lyrics body", async ({ page }) => {
    const body = page.getByTestId("lyrics-body");
    await expect(body).toBeVisible();
    await expect(body).toContainText("Wake up to the smell of something brewing");
    await expect(body).toContainText("Coffee gets me up");
  });

  test("right panel has scrollable chat history area", async ({ page }) => {
    const chatPanel = page.getByTestId("chat-panel");
    await expect(chatPanel).toBeVisible();

    // The fixture entry has chat history entries
    const history = page.getByTestId("chat-history");
    await expect(history).toBeVisible();
  });

  test("right panel shows existing chat messages", async ({ page }) => {
    // baseFixture has one user and one assistant message
    const userMsgs = page.getByTestId("chat-message-user");
    const assistantMsgs = page.getByTestId("chat-message-assistant");

    await expect(userMsgs.first()).toBeVisible();
    await expect(userMsgs.first()).toContainText("Write a short pop song about coffee");
    await expect(assistantMsgs.first()).toBeVisible();
  });

  test("right panel has text input and send button", async ({ page }) => {
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect(page.getByTestId("chat-submit")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send" })
    ).toBeVisible();
  });

  test("Generate Songs button is present at the bottom of the page", async ({
    page,
  }) => {
    await expect(page.getByTestId("generate-songs-btn")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Generate Songs" })
    ).toBeVisible();
  });

  test("clicking Generate Songs navigates to Song Generator for the current entry", async ({
    page,
  }) => {
    await page.getByTestId("generate-songs-btn").click();
    await expect(page).toHaveURL(/\/songs\?messageId=fixture-msg-1a/);
  });
});

test.describe("Lyrics Generator – empty / new entry", () => {
  test("shows empty state message when navigated to /lyrics/new", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/lyrics/new");

    // The /lyrics/new route has no :id param so entry is null
    await expect(page.getByTestId("lyrics-empty")).toBeVisible();
  });

  test("Generate Songs button is disabled when there is no entry id", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/lyrics/new");

    const btn = page.getByTestId("generate-songs-btn");
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });
});

test(
  "@screenshot:lyrics lyrics generator page renders correctly with seeded data",
  async ({ page }) => {
    await screenshotPage(page, "/lyrics/fixture-msg-1a", baseFixture, {
      path: "screenshots/lyrics-generator.png",
    });

    // Verify key elements are visible
    await expect(page.getByTestId("lyrics-panel")).toBeVisible();
    await expect(page.getByTestId("chat-panel")).toBeVisible();
    await expect(page.getByTestId("lyrics-title")).toContainText("Coffee Dreams");
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Generate Songs" })
    ).toBeVisible();
  }
);

// ────────────────────────────────────────────────────────────────────────────
// US-010: Claude chat integration
// ────────────────────────────────────────────────────────────────────────────

test.describe("Lyrics Generator – chat integration (US-010)", () => {
  test.beforeEach(async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/lyrics/fixture-msg-1a");
  });

  test("submitting a message shows it in the chat history and the left panel updates with MockLLMClient fixture lyrics", async ({
    page,
  }) => {
    const input = page.getByTestId("chat-input");
    const submitBtn = page.getByTestId("chat-submit");

    await input.fill("Make it more energetic");
    await submitBtn.click();

    // User message should appear immediately.
    const userMessages = page.getByTestId("chat-message-user");
    await expect(userMessages.last()).toContainText("Make it more energetic");

    // Wait for the assistant response (MockLLMClient adds ~200 ms delay).
    const assistantMessages = page.getByTestId("chat-message-assistant");
    await expect(assistantMessages.last()).toBeVisible({ timeout: 5000 });

    // The fixture response contains "Sunday Gold" — the left panel should reflect it.
    await expect(page.getByTestId("lyrics-title")).toContainText("Sunday Gold", {
      timeout: 5000,
    });
  });

  test("a loading indicator is shown while awaiting the response", async ({
    page,
  }) => {
    const input = page.getByTestId("chat-input");
    await input.fill("Make it more energetic");

    // Submit and immediately check for loading state.
    await page.getByTestId("chat-submit").click();

    // The loading bubble appears while the mock delay runs.
    await expect(page.getByTestId("chat-loading")).toBeVisible({ timeout: 2000 });

    // After the response arrives the loading bubble is gone.
    await expect(page.getByTestId("chat-loading")).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("chat history persists to localStorage and survives a reload", async ({
    page,
  }) => {
    // Submit a message and wait for the page to navigate to the new assistant message.
    await page.getByTestId("chat-input").fill("Make it more energetic");
    await page.getByTestId("chat-submit").click();

    // In the new model, submitting creates user+assistant messages and navigates to
    // the new assistant message URL. Wait for URL to change from the fixture message.
    await expect(page).not.toHaveURL(/fixture-msg-1a$/, { timeout: 5000 });
    await expect(page).toHaveURL(/\/lyrics\/.+/, { timeout: 5000 });

    // Reload the page to verify persistence.
    await page.reload();

    // The full ancestor path should still be visible (includes "Make it more energetic").
    const userMsgs = page.getByTestId("chat-message-user");
    await expect(userMsgs.last()).toContainText("Make it more energetic");
    await expect(page.getByTestId("chat-message-assistant").last()).toBeVisible();
  });

  test("input is disabled and send button shows 'Sending…' while loading", async ({
    page,
  }) => {
    const input = page.getByTestId("chat-input");
    const submitBtn = page.getByTestId("chat-submit");

    await input.fill("Make it more energetic");
    await submitBtn.click();

    // While the mock is running the input and button should be disabled.
    await expect(input).toBeDisabled({ timeout: 2000 });
    await expect(submitBtn).toBeDisabled({ timeout: 2000 });

    // After response, inputs are re-enabled.
    await expect(input).not.toBeDisabled({ timeout: 5000 });
  });
});
