/**
 * US-055: Playwright MCP test — Shot mode, video generation, and take management.
 *
 * Exercises Shot mode of the script editor:
 *   1. Seeds a script with 3 shots (shot 2 has one pre-existing video history
 *      entry) via window.videoStorageService.
 *   2. Navigates to the editor; clicks Shot mode toggle; asserts header "SHOT 1 OF 3".
 *   3. Clicks next-shot button twice; asserts header "SHOT 3 OF 3".
 *   4. Clicks previous-shot button; asserts header "SHOT 2 OF 3".
 *   5. Asserts video:mode:change and video:shot:navigate events in action log.
 *   6. Asserts the pre-existing video history entry renders as an inline video element.
 *   7. Clicks Generate (count = 1); asserts a loading/spinner card appears.
 *   8. Waits for generation to complete; asserts a new video card appears.
 *   9. Asserts video:generate:start and video:generate:complete events in action log.
 *  10. Clicks Select on the new video; asserts selected indicator + storage selectedUrl.
 *  11. Asserts video:take:select event in action log.
 *  12. Clicks Pin on the pre-existing video; asserts pin button shows active state.
 *  13. Navigates to /video/videos/pinned; asserts the pinned video card is present.
 *  14. Asserts video:take:pin event in action log.
 *
 * Runs against the mock LLM (VITE_USE_MOCK_LLM=true, configured in playwright.config.ts).
 * State is seeded and inspected via window.videoStorageService and window.getActionLog.
 */

import { test, expect } from "@playwright/test";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SeededScript {
  scriptId: string;
  shot1Id: string;
  shot2Id: string;
  shot3Id: string;
  /** URL of the pre-existing history entry on shot 2. */
  preExistingVideoUrl: string;
}

// ─── Seed helper ───────────────────────────────────────────────────────────────

/**
 * Seeds a fresh script with 3 shots.
 * Shot 2 has one pre-existing VideoHistoryEntry (not pinned, not selected).
 * Returns IDs and the pre-existing video URL for later assertions.
 */
async function seedScript(
  page: import("@playwright/test").Page
): Promise<SeededScript> {
  return page.evaluate(() => {
    // Isolate test from any previously stored data
    window.videoStorageService.reset();

    const now = new Date().toISOString();
    const t = Date.now();
    const shot1Id = `shot-1-${t}`;
    const shot2Id = `shot-2-${t + 1}`;
    const shot3Id = `shot-3-${t + 2}`;
    const scriptId = `script-${t + 3}`;

    // A public-domain MP4 that browsers can load without CORS issues
    const preExistingVideoUrl =
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4";

    const script = {
      id: scriptId,
      title: "Shot Mode Test Script",
      createdAt: now,
      updatedAt: now,
      settings: {
        subtitles: true,
        defaultAudio: "video" as const,
      },
      shots: [
        {
          id: shot1Id,
          title: "Opening",
          prompt: "A wide aerial shot of a futuristic city at dawn.",
          narration: {
            enabled: false,
            text: "",
            audioSource: "video" as const,
          },
          video: { selectedUrl: null, history: [] },
        },
        {
          id: shot2Id,
          title: "Hero Arrives",
          prompt: "The hero walks into frame carrying a glowing orb.",
          narration: {
            enabled: false,
            text: "",
            audioSource: "video" as const,
          },
          video: {
            selectedUrl: null,
            history: [
              {
                url: preExistingVideoUrl,
                generatedAt: new Date(t - 60_000).toISOString(),
                pinned: false,
              },
            ],
          },
        },
        {
          id: shot3Id,
          title: "Climax",
          prompt: "Explosion of light as the orb shatters.",
          narration: {
            enabled: false,
            text: "",
            audioSource: "video" as const,
          },
          video: { selectedUrl: null, history: [] },
        },
      ],
      templates: {},
    };

    localStorage.setItem(
      "song-builder:video-scripts",
      JSON.stringify([script])
    );

    return { scriptId, shot1Id, shot2Id, shot3Id, preExistingVideoUrl };
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe("US-055: Shot mode, video generation, and take management", () => {
  test.beforeEach(async ({ page }) => {
    // Start from a clean slate; seed POE API key so ApiKeyGuard passes
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      window.storageService.import({
        settings: { poeApiKey: "test-poe-api-key", numSongs: 3 },
        messages: [],
        songs: [],
      });
    });
  });

  test("shot mode navigation, generation, select, pin, and pinned videos page", async ({
    page,
  }) => {
    // ── Seed storage ──────────────────────────────────────────────────────────
    await page.goto("/");
    const { scriptId, shot2Id, preExistingVideoUrl } = await seedScript(page);

    // ── Navigate to editor ────────────────────────────────────────────────────
    await page.goto(`/video/scripts/${scriptId}`);

    // Wait for the script panel to be visible (editor loaded)
    const scriptPanel = page.getByTestId("script-panel");
    await expect(scriptPanel).toBeVisible();

    // ── Step 1: Click Shot mode toggle; assert header "SHOT 1 OF 3" ──────────
    const shotModeToggle = page.getByTestId("mode-toggle-shot");
    await expect(shotModeToggle).toBeVisible();
    await shotModeToggle.click();

    // Header should read "Shot 1 of 3" (case-insensitive partial match)
    const shotModeHeader = page.getByTestId("shot-mode-header");
    await expect(shotModeHeader).toBeVisible();
    await expect(shotModeHeader).toContainText(/shot 1 of 3/i);

    // ── Step 2: Click next-shot button twice; assert header "SHOT 3 OF 3" ────
    const nextBtn = page.getByTestId("shot-next-btn");
    await expect(nextBtn).toBeVisible();

    // First click → shot 2
    await nextBtn.click();
    await expect(shotModeHeader).toContainText(/shot 2 of 3/i);

    // Second click → shot 3
    await nextBtn.click();
    await expect(shotModeHeader).toContainText(/shot 3 of 3/i);

    // ── Step 3: Click previous-shot button; assert "SHOT 2 OF 3" ─────────────
    const prevBtn = page.getByTestId("shot-prev-btn");
    await expect(prevBtn).toBeVisible();
    await prevBtn.click();
    await expect(shotModeHeader).toContainText(/shot 2 of 3/i);

    // ── Step 4: Assert video:mode:change and video:shot:navigate in action log
    const logAfterNavigation = await page.evaluate((sid: string) => {
      const entries = window.getActionLog();
      const modeChangeEvent = entries.find(
        (e) =>
          e.category === "user:action" &&
          e.action === "video:mode:change" &&
          (e.data as Record<string, unknown>)?.scriptId === sid
      );
      const navigateEvent = entries.find(
        (e) =>
          e.category === "user:action" &&
          e.action === "video:shot:navigate" &&
          (e.data as Record<string, unknown>)?.scriptId === sid
      );
      return {
        hasModeChangeEvent: modeChangeEvent !== undefined,
        hasNavigateEvent: navigateEvent !== undefined,
      };
    }, scriptId);

    expect(logAfterNavigation.hasModeChangeEvent).toBe(true);
    expect(logAfterNavigation.hasNavigateEvent).toBe(true);

    // ── Step 5: Assert the pre-existing history entry renders as <video> ──────
    // We are now on shot 2, which has one pre-existing history entry.
    // The first history card should contain a <video> element.
    const historyCard0 = page.getByTestId("video-history-card-0");
    await expect(historyCard0).toBeVisible();

    // The card contains an inline <video> element
    const inlineVideo = historyCard0.locator("video");
    await expect(inlineVideo).toBeVisible();

    // ── Step 6: Click Generate (count defaults to 1); assert loading card ─────
    const generateBtn = page.getByTestId("generate-btn");
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    // A pending skeleton/spinner card should appear at index 1 (after the pre-existing)
    const skeletonCard = page.getByTestId("video-generation-skeleton-0");
    await expect(skeletonCard).toBeVisible();

    // ── Step 7: Wait for generation to complete; assert new video card appears
    // Mock LLM resolves in ~200 ms — wait generously for the card to appear
    const newHistoryCard = page.getByTestId("video-history-card-1");
    await expect(newHistoryCard).toBeVisible({ timeout: 5000 });

    // Skeleton should be gone once generation is complete
    await expect(skeletonCard).not.toBeVisible({ timeout: 5000 });

    // ── Step 8: Assert video:generate:start and video:generate:complete events
    const logAfterGeneration = await page.evaluate(
      (args: { sid: string; shotId: string }) => {
        const entries = window.getActionLog();
        const startEvent = entries.find(
          (e) =>
            e.category === "user:action" &&
            e.action === "video:generate:start" &&
            (e.data as Record<string, unknown>)?.scriptId === args.sid &&
            (e.data as Record<string, unknown>)?.shotId === args.shotId
        );
        const completeEvent = entries.find(
          (e) =>
            e.category === "user:action" &&
            e.action === "video:generate:complete" &&
            (e.data as Record<string, unknown>)?.scriptId === args.sid &&
            (e.data as Record<string, unknown>)?.shotId === args.shotId
        );
        return {
          hasStartEvent: startEvent !== undefined,
          hasCompleteEvent: completeEvent !== undefined,
          startData: startEvent?.data ?? null,
          completeData: completeEvent?.data ?? null,
        };
      },
      { sid: scriptId, shotId: shot2Id }
    );

    expect(logAfterGeneration.hasStartEvent).toBe(true);
    expect(logAfterGeneration.hasCompleteEvent).toBe(true);
    // start event must include count = 1
    expect(
      (logAfterGeneration.startData as Record<string, unknown>)?.count
    ).toBe(1);

    // ── Step 9: Verify the new video (card index 1) is auto-selected after
    //            generation (US-073), then click Select on the pre-existing
    //            video (card index 0) to trigger a real video:take:select event.
    const selectBtn1 = page.getByTestId("video-select-btn-1");
    await expect(selectBtn1).toBeVisible();
    // Auto-select fired during generation: new video should already be selected.
    await expect(selectBtn1).toContainText(/selected/i);

    // Now select the pre-existing video (index 0) to trigger a select action.
    const selectBtn0 = page.getByTestId("video-select-btn-0");
    await expect(selectBtn0).toBeVisible();
    await selectBtn0.click();

    // Button text should now show "Selected"
    await expect(selectBtn0).toContainText(/selected/i);

    // Verify storage selectedUrl is set (now pointing to pre-existing video)
    const storageAfterSelect = await page.evaluate(
      (args: { sid: string; shotId: string }) => {
        const script = window.videoStorageService.getScript(args.sid);
        const shot = script?.shots.find((s) => s.id === args.shotId);
        return { selectedUrl: shot?.video?.selectedUrl ?? null };
      },
      { sid: scriptId, shotId: shot2Id }
    );
    // A video URL should be stored (pre-existing video was selected)
    expect(storageAfterSelect.selectedUrl).toBeTruthy();

    // ── Step 10: Assert video:take:select event in action log ─────────────────
    const logAfterSelect = await page.evaluate(
      (args: { sid: string; shotId: string }) => {
        const entries = window.getActionLog();
        const selectEvent = entries.find(
          (e) =>
            e.category === "user:action" &&
            e.action === "video:take:select" &&
            (e.data as Record<string, unknown>)?.scriptId === args.sid &&
            (e.data as Record<string, unknown>)?.shotId === args.shotId
        );
        return {
          hasSelectEvent: selectEvent !== undefined,
          selectData: selectEvent?.data ?? null,
        };
      },
      { sid: scriptId, shotId: shot2Id }
    );

    expect(logAfterSelect.hasSelectEvent).toBe(true);
    expect(
      (logAfterSelect.selectData as Record<string, unknown>)?.url
    ).toBeTruthy();

    // ── Step 11: Click Pin on the pre-existing video (card index 0) ──────────
    const pinBtn0 = page.getByTestId("video-pin-btn-0");
    await expect(pinBtn0).toBeVisible();
    await pinBtn0.click();

    // Pin button should show active (amber) styling — check aria-label or class
    // The component sets border-amber-400 on the button when pinned;
    // we verify by checking that the stored entry is now pinned
    const storageAfterPin = await page.evaluate(
      (args: { sid: string; shotId: string; videoUrl: string }) => {
        const script = window.videoStorageService.getScript(args.sid);
        const shot = script?.shots.find((s) => s.id === args.shotId);
        const entry = shot?.video?.history.find(
          (h) => h.url === args.videoUrl
        );
        return {
          pinned: entry?.pinned ?? false,
          pinnedAt: entry?.pinnedAt ?? null,
        };
      },
      { sid: scriptId, shotId: shot2Id, videoUrl: preExistingVideoUrl }
    );

    expect(storageAfterPin.pinned).toBe(true);
    expect(storageAfterPin.pinnedAt).toBeTruthy();

    // ── Step 12: Assert video:take:pin event in action log ────────────────────
    const logAfterPin = await page.evaluate(
      (args: { sid: string; shotId: string; videoUrl: string }) => {
        const entries = window.getActionLog();
        const pinEvent = entries.find(
          (e) =>
            e.category === "user:action" &&
            e.action === "video:take:pin" &&
            (e.data as Record<string, unknown>)?.scriptId === args.sid &&
            (e.data as Record<string, unknown>)?.shotId === args.shotId &&
            (e.data as Record<string, unknown>)?.url === args.videoUrl
        );
        return { hasPinEvent: pinEvent !== undefined };
      },
      { sid: scriptId, shotId: shot2Id, videoUrl: preExistingVideoUrl }
    );

    expect(logAfterPin.hasPinEvent).toBe(true);

    // ── Step 13: Navigate to /video/videos/pinned; assert pinned card present
    await page.goto("/video/videos/pinned");

    // The Pinned Videos page heading should be visible
    await expect(
      page.getByRole("heading", { name: "Pinned Videos" })
    ).toBeVisible();

    // The pinned card for the pre-existing video should be present.
    // The card testid is `pinned-card-{urlHash}` where urlHash is
    // encodeURIComponent(url).slice(0, 40).
    const urlHash = encodeURIComponent(preExistingVideoUrl).slice(0, 40);
    const pinnedCard = page.getByTestId(`pinned-card-${urlHash}`);
    await expect(pinnedCard).toBeVisible();
  });
});
