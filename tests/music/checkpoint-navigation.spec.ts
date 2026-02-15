/**
 * Tests for US-007: Checkpoint navigation with "Viewing earlier version" banner.
 *
 * Acceptance criteria:
 * - Clicking a card navigates to /lyrics/:messageId; ancestor path rendered; later messages absent
 * - Banner visible when current message has descendants
 * - "Return to latest" navigates to latest leaf; banner disappears
 * - Sending from a checkpoint creates new user + assistant Messages; URL updates; banner gone
 *
 * Uses multiMessageFixture (City Pulse → Dark Frequency → Neon Rain) for a
 * multi-turn conversation where intermediate messages have descendants.
 *
 * The multiMessageFixture tree (root-first):
 *   fixture-multi-msg-1u  (user: "Write a synthwave song…")
 *   fixture-multi-msg-1a  (assistant: City Pulse)          ← has descendants
 *   fixture-multi-msg-2u  (user: "Make it darker…")
 *   fixture-multi-msg-2a  (assistant: Dark Frequency)      ← has descendants
 *   fixture-multi-msg-3u  (user: "Add a neon rain motif…")
 *   fixture-multi-msg-3a  (assistant: Neon Rain)            ← latest leaf
 */

import { test, expect } from "@playwright/test";
import { seedFixture } from "./helpers/seed";
import { multiMessageFixture } from "../fixtures/index";

test.describe("US-007: Checkpoint navigation and banner", () => {
  test("banner is visible when viewing an earlier version (has descendants)", async ({
    page,
  }) => {
    await seedFixture(page, multiMessageFixture);
    // Navigate to the first assistant message (City Pulse), which has descendants.
    await page.goto("/music/lyrics/fixture-multi-msg-1a");

    // The "Viewing earlier version" banner must be visible.
    await expect(page.getByTestId("checkpoint-banner")).toBeVisible();
    await expect(page.getByTestId("checkpoint-banner")).toContainText(
      "Viewing an earlier version"
    );
    await expect(page.getByTestId("return-to-latest-btn")).toBeVisible();
    await expect(page.getByTestId("return-to-latest-btn")).toContainText(
      "Return to latest"
    );
  });

  test("banner is hidden when viewing the latest leaf (no descendants)", async ({
    page,
  }) => {
    await seedFixture(page, multiMessageFixture);
    // Navigate to the latest leaf (Neon Rain) — it has no descendants.
    await page.goto("/music/lyrics/fixture-multi-msg-3a");

    // No banner should be visible.
    await expect(page.getByTestId("checkpoint-banner")).not.toBeVisible();
  });

  test("clicking an earlier card navigates to it; ancestor path rendered; later messages absent", async ({
    page,
  }) => {
    await seedFixture(page, multiMessageFixture);
    // Start from the latest leaf.
    await page.goto("/music/lyrics/fixture-multi-msg-3a");

    // Confirm we see all 3 user and 3 assistant messages.
    await expect(page.getByTestId("chat-message-user")).toHaveCount(3);
    await expect(page.getByTestId("chat-message-assistant")).toHaveCount(3);

    // Click the first assistant card (City Pulse).
    const firstCard = page.getByTestId("lyrics-item-card").first();
    await expect(firstCard).toContainText("City Pulse");
    await firstCard.click();

    // URL should update to the City Pulse message ID.
    await expect(page).toHaveURL(/\/music\/lyrics\/fixture-multi-msg-1a$/);

    // Left panel shows City Pulse.
    await expect(page.getByTestId("lyrics-title")).toContainText("City Pulse");

    // Chat history shows only 2 messages (1u and 1a), not the later ones.
    await expect(page.getByTestId("chat-message-user")).toHaveCount(1);
    await expect(page.getByTestId("chat-message-assistant")).toHaveCount(1);

    // Later messages must not appear.
    await expect(page.getByTestId("chat-history")).not.toContainText(
      "Make it darker"
    );
    await expect(page.getByTestId("chat-history")).not.toContainText(
      "Neon Rain"
    );

    // Banner should be visible since City Pulse has descendants.
    await expect(page.getByTestId("checkpoint-banner")).toBeVisible();
  });

  test("Return to latest navigates to latest leaf; banner disappears", async ({
    page,
  }) => {
    await seedFixture(page, multiMessageFixture);
    // Navigate to an intermediate message (Dark Frequency).
    await page.goto("/music/lyrics/fixture-multi-msg-2a");

    // Banner should be visible.
    await expect(page.getByTestId("checkpoint-banner")).toBeVisible();

    // Click "Return to latest".
    await page.getByTestId("return-to-latest-btn").click();

    // URL should update to the latest leaf (Neon Rain).
    await expect(page).toHaveURL(/\/music\/lyrics\/fixture-multi-msg-3a$/);

    // Banner should no longer be visible.
    await expect(page.getByTestId("checkpoint-banner")).not.toBeVisible();

    // Left panel should show Neon Rain.
    await expect(page.getByTestId("lyrics-title")).toContainText("Neon Rain");
  });

  test("sending from a checkpoint creates a new branch; URL updates; banner gone", async ({
    page,
  }) => {
    await seedFixture(page, multiMessageFixture);
    // Navigate to the first assistant message (City Pulse) — a checkpoint.
    await page.goto("/music/lyrics/fixture-multi-msg-1a");

    // Confirm the banner is showing (it has descendants).
    await expect(page.getByTestId("checkpoint-banner")).toBeVisible();

    // Send a message from the checkpoint.
    await page.getByTestId("chat-input").fill("Branch from City Pulse");
    await page.getByTestId("chat-submit").click();

    // Wait for navigation to the new assistant message.
    await expect(page).not.toHaveURL(/fixture-multi-msg-1a$/, {
      timeout: 5000,
    });
    await expect(page).toHaveURL(/\/music\/lyrics\/.+/, { timeout: 5000 });

    // The new URL is the new assistant message (the latest leaf in the new branch).
    // Banner must NOT be visible — the new message has no descendants yet.
    await expect(page.getByTestId("checkpoint-banner")).not.toBeVisible({
      timeout: 5000,
    });

    // Verify storage: new user message has parentId = fixture-multi-msg-1a (the checkpoint).
    const newUrl = page.url();
    const newAssistantId = newUrl.split("/music/lyrics/")[1];

    const messages = await page.evaluate(() => {
      const stored = localStorage.getItem("song-builder:messages");
      return stored
        ? (JSON.parse(stored) as Array<{
            id: string;
            role: string;
            parentId: string | null;
          }>)
        : [];
    });

    const assistantMsg = messages.find((m) => m.id === newAssistantId);
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.role).toBe("assistant");

    const userMsg = messages.find((m) => m.id === assistantMsg!.parentId);
    expect(userMsg).toBeDefined();
    expect(userMsg!.role).toBe("user");
    // The new branch user message must have the checkpoint (City Pulse) as its parent.
    expect(userMsg!.parentId).toBe("fixture-multi-msg-1a");
  });

  test("banner visible at 375×812 (mobile viewport)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seedFixture(page, multiMessageFixture);
    // City Pulse (fixture-multi-msg-1a) has descendants → banner should show.
    await page.goto("/music/lyrics/fixture-multi-msg-1a");

    await expect(page.getByTestId("checkpoint-banner")).toBeVisible();
    await expect(page.getByTestId("checkpoint-banner")).toContainText(
      "Viewing an earlier version"
    );
    await expect(page.getByTestId("return-to-latest-btn")).toBeVisible();
  });

  test("banner disappears after Return to latest at 375×812", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await seedFixture(page, multiMessageFixture);
    await page.goto("/music/lyrics/fixture-multi-msg-1a");

    // Confirm banner is visible.
    await expect(page.getByTestId("checkpoint-banner")).toBeVisible();

    // Click "Return to latest".
    await page.getByTestId("return-to-latest-btn").click();

    // After navigation to the latest leaf, banner must be gone.
    await expect(page).toHaveURL(/\/music\/lyrics\/fixture-multi-msg-3a$/);
    await expect(page.getByTestId("checkpoint-banner")).not.toBeVisible();
  });
});
