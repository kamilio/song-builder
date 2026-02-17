/**
 * US-054: Playwright MCP test — Write mode shot interactions.
 *
 * Exercises the Write mode of the script editor:
 *   1. Seeds a script with 2 shots via window.videoStorageService; navigates to editor.
 *   2. Asserts two shot cards visible in Write mode.
 *   3. Clicks '+ Add Shot'; asserts third card appears; asserts storage has 3 shots.
 *   4. Asserts video:shot:add event in action log.
 *   5. Edits the prompt textarea of shot 1; blurs it; asserts updated value in storage.
 *   6. Asserts video:shot:prompt:edit event with correct shotId.
 *   7. Toggles narration on for shot 2; asserts narration textarea becomes visible.
 *   8. Asserts video:shot:narration:toggle event.
 *   9. Changes audio source to ElevenLabs for shot 2; asserts Generate Audio button appears.
 *  10. Asserts video:shot:audio:source event.
 *  11. Drags shot 2 above shot 1 via keyboard DnD (Space → ArrowUp → Enter);
 *      asserts shot order in storage is reversed.
 *  12. Asserts video:shot:reorder event.
 *
 * Runs against the mock LLM (VITE_USE_MOCK_LLM=true, configured in playwright.config.ts).
 * State is seeded and inspected via window.videoStorageService and window.getActionLog.
 */

import { test, expect } from "@playwright/test";

// ─── Seed helpers ─────────────────────────────────────────────────────────────

interface SeededScript {
  scriptId: string;
  shot1Id: string;
  shot2Id: string;
}

/**
 * Seed a fresh script with 2 shots directly in localStorage.
 * Returns the IDs needed for assertions.
 */
async function seedScript(
  page: import("@playwright/test").Page
): Promise<SeededScript> {
  return page.evaluate(() => {
    // Clear any prior video storage so tests are isolated
    window.videoStorageService.reset();

    const now = new Date().toISOString();
    const shot1Id = `shot-1-${Date.now()}`;
    const shot2Id = `shot-2-${Date.now() + 1}`;
    const scriptId = `script-${Date.now() + 2}`;

    const script = {
      id: scriptId,
      title: "Write Mode Test Script",
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
          prompt: "A wide aerial shot of the city at dawn.",
          narration: {
            enabled: false,
            text: "",
            audioSource: "video" as const,
          },
          video: { selectedUrl: null, history: [] },
        },
        {
          id: shot2Id,
          title: "Close-up",
          prompt: "Close-up of a coffee cup steaming on a window sill.",
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

    // Write directly into localStorage under the video-scripts key
    localStorage.setItem(
      "song-builder:video-scripts",
      JSON.stringify([script])
    );

    return { scriptId, shot1Id, shot2Id };
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("US-054: Write mode shot interactions", () => {
  test.beforeEach(async ({ page }) => {
    // Full clean slate; seed POE API key so ApiKeyGuard passes
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

  test("write mode shot interactions persist to storage and action log", async ({
    page,
  }) => {
    // ── Seed storage ─────────────────────────────────────────────────────────
    await page.goto("/");
    const { scriptId, shot1Id, shot2Id } = await seedScript(page);

    // ── Navigate to editor ────────────────────────────────────────────────────
    await page.goto(`/video/scripts/${scriptId}`);

    // Editor must load (script panel present)
    const scriptPanel = page.getByTestId("script-panel");
    await expect(scriptPanel).toBeVisible();

    // Write mode is the default — assert write-mode-content is rendered
    const writeMode = page.getByTestId("write-mode-content");
    await expect(writeMode).toBeVisible();

    // ── Step 2: Assert two shot cards visible ─────────────────────────────────
    const shotCard1 = page.getByTestId(`shot-card-${shot1Id}`);
    const shotCard2 = page.getByTestId(`shot-card-${shot2Id}`);
    await expect(shotCard1).toBeVisible();
    await expect(shotCard2).toBeVisible();

    // ── Step 3: Click '+ Shot' (header button); assert third card appears ─────
    const addShotBtn = page.getByTestId("add-shot-btn");
    await expect(addShotBtn).toBeVisible();
    await addShotBtn.click();

    // A third shot card must appear; we don't know the ID yet — count cards
    const allShotCards = writeMode.locator('[data-testid^="shot-card-"]');
    await expect(allShotCards).toHaveCount(3);

    // Verify storage has 3 shots
    const storageAfterAdd = await page.evaluate((sid: string) => {
      const script = window.videoStorageService.getScript(sid);
      return { shotCount: script?.shots?.length ?? 0 };
    }, scriptId);
    expect(storageAfterAdd.shotCount).toBe(3);

    // ── Step 4: Assert video:shot:add in action log ───────────────────────────
    const logAfterAdd = await page.evaluate((sid: string) => {
      const entries = window.getActionLog();
      const addEvent = entries.find(
        (e) =>
          e.category === "user:action" &&
          e.action === "video:shot:add" &&
          (e.data as Record<string, unknown>)?.scriptId === sid
      );
      return { hasAddEvent: addEvent !== undefined };
    }, scriptId);
    expect(logAfterAdd.hasAddEvent).toBe(true);

    // ── Step 5: Edit prompt of shot 1; blur; assert storage updated ───────────
    const promptTextarea1 = page.getByTestId(`shot-prompt-${shot1Id}`);
    await expect(promptTextarea1).toBeVisible();

    const newPromptText = "A MODIFIED prompt for shot one.";
    await promptTextarea1.fill(newPromptText);
    // Blur by clicking outside the textarea (clicking the shot card border)
    await page.keyboard.press("Tab");

    // Verify the new prompt value is persisted to storage
    const storageAfterPromptEdit = await page.evaluate(
      (args: { sid: string; shotId: string }) => {
        const script = window.videoStorageService.getScript(args.sid);
        const shot = script?.shots.find((s) => s.id === args.shotId);
        return { prompt: shot?.prompt ?? null };
      },
      { sid: scriptId, shotId: shot1Id }
    );
    expect(storageAfterPromptEdit.prompt).toBe(newPromptText);

    // ── Step 6: Assert video:shot:prompt:edit in action log with correct shotId
    const logAfterPromptEdit = await page.evaluate(
      (args: { sid: string; shotId: string }) => {
        const entries = window.getActionLog();
        const editEvent = entries.find(
          (e) =>
            e.category === "user:action" &&
            e.action === "video:shot:prompt:edit" &&
            (e.data as Record<string, unknown>)?.scriptId === args.sid &&
            (e.data as Record<string, unknown>)?.shotId === args.shotId
        );
        return { hasEditEvent: editEvent !== undefined };
      },
      { sid: scriptId, shotId: shot1Id }
    );
    expect(logAfterPromptEdit.hasEditEvent).toBe(true);

    // ── Step 7: Toggle narration on for shot 2; assert narration textarea ──────
    const narrationToggle2 = page.getByTestId(`narration-toggle-${shot2Id}`);
    await expect(narrationToggle2).toBeVisible();
    await narrationToggle2.click();

    // Narration textarea should now be visible
    const narrationText2 = page.getByTestId(`narration-text-${shot2Id}`);
    await expect(narrationText2).toBeVisible();

    // ── Step 8: Assert video:shot:narration:toggle in action log ─────────────
    const logAfterNarrationToggle = await page.evaluate(
      (args: { sid: string; shotId: string }) => {
        const entries = window.getActionLog();
        const toggleEvent = entries.find(
          (e) =>
            e.category === "user:action" &&
            e.action === "video:shot:narration:toggle" &&
            (e.data as Record<string, unknown>)?.scriptId === args.sid &&
            (e.data as Record<string, unknown>)?.shotId === args.shotId
        );
        return {
          hasToggleEvent: toggleEvent !== undefined,
          toggleData: toggleEvent?.data ?? null,
        };
      },
      { sid: scriptId, shotId: shot2Id }
    );
    expect(logAfterNarrationToggle.hasToggleEvent).toBe(true);
    // The toggle turned narration on
    expect(
      (logAfterNarrationToggle.toggleData as Record<string, unknown>)?.enabled
    ).toBe(true);

    // ── Step 9: Change audio source to ElevenLabs; assert Generate Audio btn ──
    const audioSourceElevenLabs = page.getByTestId(
      `audio-source-elevenlabs-${shot2Id}`
    );
    await expect(audioSourceElevenLabs).toBeVisible();
    await audioSourceElevenLabs.click();

    // Generate Audio button should now be visible (narration is on + ElevenLabs)
    const generateAudioBtn2 = page.getByTestId(`generate-audio-btn-${shot2Id}`);
    await expect(generateAudioBtn2).toBeVisible();

    // ── Step 10: Assert video:shot:audio:source in action log ─────────────────
    const logAfterAudioSource = await page.evaluate(
      (args: { sid: string; shotId: string }) => {
        const entries = window.getActionLog();
        const sourceEvent = entries.find(
          (e) =>
            e.category === "user:action" &&
            e.action === "video:shot:audio:source" &&
            (e.data as Record<string, unknown>)?.scriptId === args.sid &&
            (e.data as Record<string, unknown>)?.shotId === args.shotId &&
            (e.data as Record<string, unknown>)?.source === "elevenlabs"
        );
        return { hasSourceEvent: sourceEvent !== undefined };
      },
      { sid: scriptId, shotId: shot2Id }
    );
    expect(logAfterAudioSource.hasSourceEvent).toBe(true);

    // ── Step 11: Keyboard DnD — move shot 2 above shot 1 ─────────────────────
    // @dnd-kit KeyboardSensor: Space/Enter to pick up, Arrow keys to move,
    // Space/Enter to drop, Escape to cancel.
    // The drag handle span has {...attributes} {...listeners} from useSortable,
    // which includes tabIndex={0} and React onKeyDown handler.
    const dragHandle2 = page.getByTestId(`shot-drag-handle-${shot2Id}`);
    await expect(dragHandle2).toBeVisible();

    // Focus the drag handle span directly. useSortable spreads tabIndex={0}.
    await dragHandle2.focus();

    // Small pause to ensure focus settles
    await page.waitForTimeout(50);

    // Press Space to activate drag (Space is in dnd-kit's keyboardCodes.start)
    // page.keyboard.press fires the key on the currently focused element,
    // which will be the drag handle span. React's onKeyDown handler receives
    // the event and checks event.target === activatorNode. Since the span is
    // both focused and the target, the activation guard passes.
    await page.keyboard.press("Space");
    await page.waitForTimeout(100);

    // Move up one position (shot 2 → position 1, above shot 1)
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(100);

    // Drop with Enter (also in keyboardCodes.end)
    await page.keyboard.press("Enter");

    // Wait for storage write (react state update + storage persist)
    await page.waitForTimeout(500);

    // Assert storage shot order is reversed: shot2 first, shot1 second
    const storageAfterReorder = await page.evaluate(
      (args: { sid: string; shot1Id: string; shot2Id: string }) => {
        const script = window.videoStorageService.getScript(args.sid);
        const shots = script?.shots ?? [];
        return {
          firstShotId: shots[0]?.id ?? null,
          secondShotId: shots[1]?.id ?? null,
          shotCount: shots.length,
        };
      },
      { sid: scriptId, shot1Id, shot2Id }
    );
    // After reorder: shot2 should be at index 0, shot1 at index 1
    expect(storageAfterReorder.firstShotId).toBe(shot2Id);
    expect(storageAfterReorder.secondShotId).toBe(shot1Id);

    // ── Step 12: Assert video:shot:reorder in action log ─────────────────────
    const logAfterReorder = await page.evaluate(
      (args: { sid: string; shot2Id: string }) => {
        const entries = window.getActionLog();
        const reorderEvent = entries.find(
          (e) =>
            e.category === "user:action" &&
            e.action === "video:shot:reorder" &&
            (e.data as Record<string, unknown>)?.scriptId === args.sid &&
            (e.data as Record<string, unknown>)?.shotId === args.shot2Id
        );
        return { hasReorderEvent: reorderEvent !== undefined };
      },
      { sid: scriptId, shot2Id }
    );
    expect(logAfterReorder.hasReorderEvent).toBe(true);
  });
});
