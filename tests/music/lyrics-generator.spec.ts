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
import { baseFixture, multiMessageFixture, songGeneratorFixture } from "../fixtures/index";

test.describe("Lyrics Generator page", () => {
  test.beforeEach(async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/music/lyrics/fixture-msg-1a");
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
    await expect(page).toHaveURL(/\/music\/lyrics\/fixture-msg-1a\/songs/);
  });
});

test.describe("Lyrics Generator – empty / new entry", () => {
  test("shows empty state message when navigated to /lyrics/new", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/music/lyrics/new");

    // The /lyrics/new route has no :id param so entry is null
    await expect(page.getByTestId("lyrics-empty")).toBeVisible();
  });

  test("Generate Songs button is disabled when there is no entry id", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/music/lyrics/new");

    const btn = page.getByTestId("generate-songs-btn");
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });
});

test(
  "@screenshot:lyrics lyrics generator page renders correctly with seeded data",
  async ({ page }) => {
    await screenshotPage(page, "/music/lyrics/fixture-msg-1a", baseFixture, {
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
    await page.goto("/music/lyrics/fixture-msg-1a");
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
    await expect(page).toHaveURL(/\/music\/lyrics\/.+/, { timeout: 5000 });

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

// ────────────────────────────────────────────────────────────────────────────
// US-004: Lyrics Editor core rebuild (tree traversal, /lyrics/:messageId)
// ────────────────────────────────────────────────────────────────────────────

/**
 * US-004 acceptance criteria: navigating to an intermediate messageId shows
 * only the ancestor path up to (and including) that message, not messages
 * that came after it in the tree.
 *
 * multiMessageFixture tree (root-first):
 *   fixture-multi-msg-1u  → user: "Write a synthwave song…"
 *   fixture-multi-msg-1a  → assistant: "City Pulse"
 *   fixture-multi-msg-2u  → user: "Make it darker…"
 *   fixture-multi-msg-2a  → assistant: "Dark Frequency"
 *   fixture-multi-msg-3u  → user: "Add a neon rain motif…"
 *   fixture-multi-msg-3a  → assistant: "Neon Rain" (latest leaf)
 *
 * Navigating to fixture-multi-msg-2a (Dark Frequency) should show messages
 * 1u, 1a, 2u, 2a but NOT 3u or 3a.
 */
test.describe("Lyrics Generator – US-004: tree traversal and ancestor path", () => {
  test("navigating to an intermediate messageId shows only ancestor path (not later messages)", async ({
    page,
  }) => {
    await seedFixture(page, multiMessageFixture);
    // Navigate to the second assistant message (Dark Frequency), not the latest leaf.
    await page.goto("/music/lyrics/fixture-multi-msg-2a");

    // Left panel should show Dark Frequency (the latest assistant in the path up to 2a).
    await expect(page.getByTestId("lyrics-title")).toContainText("Dark Frequency");

    // Chat history should contain the 4 messages in the ancestor path.
    const userMsgs = page.getByTestId("chat-message-user");
    const assistantMsgs = page.getByTestId("chat-message-assistant");

    // Two user messages: 1u and 2u
    await expect(userMsgs).toHaveCount(2);
    await expect(userMsgs.first()).toContainText("Write a synthwave song about a rainy city night");
    await expect(userMsgs.last()).toContainText("Make it darker and more cinematic");

    // Two assistant messages: 1a and 2a
    await expect(assistantMsgs).toHaveCount(2);
    await expect(assistantMsgs.last()).toContainText("Dark Frequency");

    // The later messages (3u "Add a neon rain motif" and 3a "Neon Rain") must NOT appear.
    const allMessages = page.getByTestId("chat-history");
    await expect(allMessages).not.toContainText("Add a neon rain motif");
    await expect(allMessages).not.toContainText("Neon Rain");
  });

  test("navigating to the latest leaf shows all ancestor messages", async ({
    page,
  }) => {
    await seedFixture(page, multiMessageFixture);
    // Navigate to the latest leaf (Neon Rain).
    await page.goto("/music/lyrics/fixture-multi-msg-3a");

    // Left panel shows Neon Rain.
    await expect(page.getByTestId("lyrics-title")).toContainText("Neon Rain");

    // All 6 messages in the ancestor path should be visible.
    const userMsgs = page.getByTestId("chat-message-user");
    const assistantMsgs = page.getByTestId("chat-message-assistant");

    await expect(userMsgs).toHaveCount(3);
    await expect(assistantMsgs).toHaveCount(3);
  });

  test("left panel shows duration when the latest assistant message has one", async ({
    page,
  }) => {
    // Seed a fixture where the assistant message has a duration.
    const fixtureWithDuration = {
      ...baseFixture,
      messages: [
        ...baseFixture.messages.map((m) =>
          m.id === "fixture-msg-1a" ? { ...m, duration: 185 } : m
        ),
      ],
    };
    await seedFixture(page, fixtureWithDuration);
    await page.goto("/music/lyrics/fixture-msg-1a");

    // Duration should be displayed as M:SS.
    await expect(page.getByTestId("lyrics-duration")).toContainText("3:05");
  });

  test("submitting a chat message creates user+assistant messages with correct parentIds", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/music/lyrics/fixture-msg-1a");

    await page.getByTestId("chat-input").fill("More cowbell");
    await page.getByTestId("chat-submit").click();

    // Wait for navigation to new assistant message URL.
    await expect(page).not.toHaveURL(/fixture-msg-1a$/, { timeout: 5000 });
    await expect(page).toHaveURL(/\/music\/lyrics\/.+/, { timeout: 5000 });

    // Get the new message ID from the URL.
    const newUrl = page.url();
    const newMsgId = newUrl.split("/music/lyrics/")[1];

    // Verify storage: new assistant message has a user message parent,
    // and that user message has fixture-msg-1a as its parent.
    const messages = await page.evaluate(() => {
      const stored = localStorage.getItem("song-builder:messages");
      return stored ? (JSON.parse(stored) as Array<{ id: string; role: string; parentId: string | null }>) : [];
    });

    const assistantMsg = messages.find((m) => m.id === newMsgId);
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.role).toBe("assistant");

    const userMsg = messages.find((m) => m.id === assistantMsg!.parentId);
    expect(userMsg).toBeDefined();
    expect(userMsg!.role).toBe("user");
    expect(userMsg!.parentId).toBe("fixture-msg-1a");
  });

  test("reloading the page at /lyrics/:messageId preserves the view", async ({
    page,
  }) => {
    await seedFixture(page, multiMessageFixture);
    await page.goto("/music/lyrics/fixture-multi-msg-2a");

    // Verify the left panel is showing Dark Frequency.
    await expect(page.getByTestId("lyrics-title")).toContainText("Dark Frequency");

    // Reload and verify the view is preserved.
    await page.reload();
    await expect(page.getByTestId("lyrics-title")).toContainText("Dark Frequency");
    await expect(page.getByTestId("chat-message-user")).toHaveCount(2);
  });

  test("Generate Songs navigates to /lyrics/:id/songs", async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/music/lyrics/fixture-msg-1a");

    await page.getByTestId("generate-songs-btn").click();
    await expect(page).toHaveURL(/\/music\/lyrics\/fixture-msg-1a\/songs/);
  });

  test("mobile tab bar is visible and switches between Lyrics and Chat panels", async ({
    page,
  }) => {
    // Resize to mobile viewport.
    await page.setViewportSize({ width: 375, height: 812 });
    await seedFixture(page, baseFixture);
    await page.goto("/music/lyrics/fixture-msg-1a");

    // Mobile tab bar should be visible.
    await expect(page.getByTestId("mobile-tab-bar")).toBeVisible();

    // Lyrics tab is active by default; Lyrics panel should be visible.
    await expect(page.getByTestId("tab-lyrics")).toBeVisible();
    await expect(page.getByTestId("tab-chat")).toBeVisible();

    // Lyrics panel content should be visible (first match).
    await expect(page.getByTestId("lyrics-title").first()).toContainText("Coffee Dreams");

    // Switch to Chat tab.
    await page.getByTestId("tab-chat").click();
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect(page.getByTestId("chat-history")).toBeVisible();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// US-022: Songs count link in LyricsGenerator
// ────────────────────────────────────────────────────────────────────────────

test.describe("Lyrics Generator – US-022: songs count link", () => {
  test("shows songs count link when songs exist for the current lyric", async ({
    page,
  }) => {
    // baseFixture: fixture-msg-1a has 1 non-deleted song
    await seedFixture(page, baseFixture);
    await page.goto("/music/lyrics/fixture-msg-1a");

    const link = page.getByTestId("songs-count-link");
    await expect(link).toBeVisible();
    await expect(link).toContainText("1 song");
  });

  test("songs count link navigates to /music/lyrics/:id/songs", async ({
    page,
  }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/music/lyrics/fixture-msg-1a");

    await page.getByTestId("songs-count-link").click();
    await expect(page).toHaveURL(/\/music\/lyrics\/fixture-msg-1a\/songs/);
  });

  test("shows plural 'songs' when count is more than one", async ({ page }) => {
    // songGeneratorFixture: fixture-msg-songs-a has 3 non-deleted songs
    await seedFixture(page, songGeneratorFixture);
    await page.goto("/music/lyrics/fixture-msg-songs-a");

    const link = page.getByTestId("songs-count-link");
    await expect(link).toBeVisible();
    await expect(link).toContainText("3 songs");
  });

  test("does not show songs count link when zero songs exist", async ({
    page,
  }) => {
    // multiMessageFixture has no songs
    await seedFixture(page, multiMessageFixture);
    await page.goto("/music/lyrics/fixture-multi-msg-3a");

    await expect(page.getByTestId("songs-count-link")).not.toBeVisible();
  });

  test("does not show songs count link at /lyrics/new", async ({ page }) => {
    await seedFixture(page, baseFixture);
    await page.goto("/music/lyrics/new");

    await expect(page.getByTestId("songs-count-link")).not.toBeVisible();
  });
});
