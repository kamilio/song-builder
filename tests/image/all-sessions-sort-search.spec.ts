/**
 * Tests for US-018: Session list sort and search.
 *
 * Verifies that:
 * - Sort dropdown offers newest first, oldest first, most images, most pinned.
 * - Default sort is newest first.
 * - Search input filters sessions by title in real time.
 * - Sort and search can be combined.
 * - Empty search query shows all sessions.
 * - No results state shown when search has no matches.
 * - Sort and search controls are hidden when there are no sessions at all.
 */

import { test, expect } from "@playwright/test";
import { seedImageFixture } from "./helpers/seed";
import type { ImageStorageExport } from "../../src/image/lib/storage/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Three sessions with different creation dates and image/pinned counts.
 *
 * Session order by date:
 *   newest → "Charlie session" (2026-01-03)
 *   middle → "Beta session"   (2026-01-02)
 *   oldest → "Alpha session"  (2026-01-01)
 *
 * Image counts:  Alpha=3, Beta=1, Charlie=0
 * Pinned counts: Alpha=2, Beta=0, Charlie=0
 */
const sortSearchFixture: ImageStorageExport = {
  sessions: [
    {
      id: "sort-session-alpha",
      title: "Alpha session",
      createdAt: "2026-01-01T10:00:00.000Z",
    },
    {
      id: "sort-session-beta",
      title: "Beta session",
      createdAt: "2026-01-02T10:00:00.000Z",
    },
    {
      id: "sort-session-charlie",
      title: "Charlie session",
      createdAt: "2026-01-03T10:00:00.000Z",
    },
  ],
  generations: [
    {
      id: "sort-gen-alpha",
      sessionId: "sort-session-alpha",
      stepId: 1,
      prompt: "Alpha prompt",
      createdAt: "2026-01-01T10:01:00.000Z",
    },
    {
      id: "sort-gen-beta",
      sessionId: "sort-session-beta",
      stepId: 1,
      prompt: "Beta prompt",
      createdAt: "2026-01-02T10:01:00.000Z",
    },
  ],
  items: [
    // Alpha: 3 items, 2 pinned
    {
      id: "sort-item-a1",
      generationId: "sort-gen-alpha",
      url: "https://example.com/a1.png",
      pinned: true,
      deleted: false,
      createdAt: "2026-01-01T10:01:01.000Z",
    },
    {
      id: "sort-item-a2",
      generationId: "sort-gen-alpha",
      url: "https://example.com/a2.png",
      pinned: true,
      deleted: false,
      createdAt: "2026-01-01T10:01:02.000Z",
    },
    {
      id: "sort-item-a3",
      generationId: "sort-gen-alpha",
      url: "https://example.com/a3.png",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-01T10:01:03.000Z",
    },
    // Beta: 1 item, 0 pinned
    {
      id: "sort-item-b1",
      generationId: "sort-gen-beta",
      url: "https://example.com/b1.png",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-02T10:01:01.000Z",
    },
    // Charlie: 0 items
  ],
  settings: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("AllSessions sort and search (US-018)", () => {
  test.beforeEach(async ({ page }) => {
    await seedImageFixture(page, sortSearchFixture);
    await page.goto("/image/sessions");
  });

  // ── Controls visibility ──────────────────────────────────────────────────

  test("sort select and search input are visible when sessions exist", async ({ page }) => {
    await expect(page.getByTestId("sessions-sort-select")).toBeVisible();
    await expect(page.getByTestId("sessions-search-input")).toBeVisible();
  });

  // ── Default sort ─────────────────────────────────────────────────────────

  test("default sort is newest first", async ({ page }) => {
    const select = page.getByTestId("sessions-sort-select");
    await expect(select).toHaveValue("newest");
  });

  test("newest first shows Charlie, Beta, Alpha in that order", async ({ page }) => {
    const rows = page.getByTestId("session-list-item");
    await expect(rows).toHaveCount(3);

    const titles = await page.getByTestId("session-list-item").allTextContents();
    // Charlie (newest) should come before Beta, which comes before Alpha (oldest)
    const charlieIdx = titles.findIndex((t) => t.includes("Charlie session"));
    const betaIdx = titles.findIndex((t) => t.includes("Beta session"));
    const alphaIdx = titles.findIndex((t) => t.includes("Alpha session"));
    expect(charlieIdx).toBeLessThan(betaIdx);
    expect(betaIdx).toBeLessThan(alphaIdx);
  });

  // ── Oldest first ─────────────────────────────────────────────────────────

  test("oldest first shows Alpha, Beta, Charlie in that order", async ({ page }) => {
    await page.getByTestId("sessions-sort-select").selectOption("oldest");

    const titles = await page.getByTestId("session-list-item").allTextContents();
    const charlieIdx = titles.findIndex((t) => t.includes("Charlie session"));
    const betaIdx = titles.findIndex((t) => t.includes("Beta session"));
    const alphaIdx = titles.findIndex((t) => t.includes("Alpha session"));
    expect(alphaIdx).toBeLessThan(betaIdx);
    expect(betaIdx).toBeLessThan(charlieIdx);
  });

  // ── Most images ──────────────────────────────────────────────────────────

  test("most images shows Alpha (3) before Beta (1) before Charlie (0)", async ({ page }) => {
    await page.getByTestId("sessions-sort-select").selectOption("most-images");

    const titles = await page.getByTestId("session-list-item").allTextContents();
    const charlieIdx = titles.findIndex((t) => t.includes("Charlie session"));
    const betaIdx = titles.findIndex((t) => t.includes("Beta session"));
    const alphaIdx = titles.findIndex((t) => t.includes("Alpha session"));
    expect(alphaIdx).toBeLessThan(betaIdx);
    expect(betaIdx).toBeLessThan(charlieIdx);
  });

  // ── Most pinned ──────────────────────────────────────────────────────────

  test("most pinned shows Alpha (2 pinned) first", async ({ page }) => {
    await page.getByTestId("sessions-sort-select").selectOption("most-pinned");

    const titles = await page.getByTestId("session-list-item").allTextContents();
    const alphaIdx = titles.findIndex((t) => t.includes("Alpha session"));
    const betaIdx = titles.findIndex((t) => t.includes("Beta session"));
    expect(alphaIdx).toBeLessThan(betaIdx);
  });

  // ── Search ───────────────────────────────────────────────────────────────

  test("searching filters sessions by title in real time", async ({ page }) => {
    await page.getByTestId("sessions-search-input").fill("Alpha");

    await expect(page.getByTestId("session-list-item")).toHaveCount(1);
    await expect(page.getByText("Alpha session")).toBeVisible();
    await expect(page.getByText("Beta session")).not.toBeVisible();
    await expect(page.getByText("Charlie session")).not.toBeVisible();
  });

  test("search is case-insensitive", async ({ page }) => {
    await page.getByTestId("sessions-search-input").fill("alpha");

    await expect(page.getByTestId("session-list-item")).toHaveCount(1);
    await expect(page.getByText("Alpha session")).toBeVisible();
  });

  test("search matching multiple sessions shows all matching sessions", async ({ page }) => {
    // "session" matches all three
    await page.getByTestId("sessions-search-input").fill("session");

    await expect(page.getByTestId("session-list-item")).toHaveCount(3);
  });

  test("clearing search shows all sessions again", async ({ page }) => {
    const input = page.getByTestId("sessions-search-input");
    await input.fill("Alpha");
    await expect(page.getByTestId("session-list-item")).toHaveCount(1);

    await input.clear();
    await expect(page.getByTestId("session-list-item")).toHaveCount(3);
  });

  test("search with no matches shows no-results state", async ({ page }) => {
    await page.getByTestId("sessions-search-input").fill("zzznomatch");

    await expect(page.getByTestId("sessions-search-empty")).toBeVisible();
    await expect(page.getByTestId("session-list")).not.toBeVisible();
  });

  // ── Sort + search combined ────────────────────────────────────────────────

  test("sort and search can be combined", async ({ page }) => {
    // Sort oldest first, then search for "alpha" — only Alpha session matches
    await page.getByTestId("sessions-sort-select").selectOption("oldest");
    await page.getByTestId("sessions-search-input").fill("alpha");

    // Only Alpha matches; Beta and Charlie are filtered out
    await expect(page.getByTestId("session-list-item")).toHaveCount(1);
    await expect(page.getByText("Alpha session")).toBeVisible();
    await expect(page.getByText("Beta session")).not.toBeVisible();
    await expect(page.getByText("Charlie session")).not.toBeVisible();

    // Now change search to "session" (all match) and verify oldest-first order holds
    await page.getByTestId("sessions-search-input").fill("session");
    await expect(page.getByTestId("session-list-item")).toHaveCount(3);

    const titles = await page.getByTestId("session-list-item").allTextContents();
    const alphaIdx = titles.findIndex((t) => t.includes("Alpha session"));
    const betaIdx = titles.findIndex((t) => t.includes("Beta session"));
    const charlieIdx = titles.findIndex((t) => t.includes("Charlie session"));
    // Oldest first: Alpha (Jan 1) → Beta (Jan 2) → Charlie (Jan 3)
    expect(alphaIdx).toBeLessThan(betaIdx);
    expect(betaIdx).toBeLessThan(charlieIdx);
  });

  // ── No sessions edge case ─────────────────────────────────────────────────

  test("sort and search controls are hidden when no sessions exist", async ({ page }) => {
    // Clear storage and reload
    await page.evaluate(() => localStorage.clear());
    await page.goto("/image/sessions");

    await expect(page.getByTestId("all-sessions-empty")).toBeVisible();
    await expect(page.getByTestId("sessions-sort-select")).not.toBeVisible();
    await expect(page.getByTestId("sessions-search-input")).not.toBeVisible();
  });
});
