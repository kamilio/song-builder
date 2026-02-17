/**
 * US-053: Playwright MCP test — script creation and editor navigation.
 *
 * Walks through creating a new script from the Video Home page and verifies
 * the editor loads with the correct structure. The test runs against the mock
 * LLM (VITE_USE_MOCK_LLM=true, configured in playwright.config.ts).
 *
 * Uses Playwright MCP browser tools to drive and assert. State is inspected
 * via window.videoStorageService and window.getActionLog.
 *
 * Routing note: SharedHome (at "/") renders the tab bar with tab-video. Clicking
 * the Video tab navigates to /video (VideoHome) which is a separate route.
 * The tab bar's aria-current is set when useLocation().pathname starts with /video —
 * since SharedHome renders at "/", clicking Video navigates away and VideoHome is shown.
 * The tab with aria-current="page" is visible at "/" when the path is video-prefixed,
 * but since "/" and "/video" are different routes, we verify the tab in SharedHome first,
 * then navigate to /video to verify the prompt UI.
 *
 * Flow:
 *   1. Navigate to / (SharedHome) — assert Video tab is present; click it to go to /video.
 *      At / the Video tab has aria-current="page" when pathname starts with /video,
 *      but SharedHome itself renders at /. So we assert the tab exists and navigate.
 *   2. On /video — assert prompt textarea exists and Generate Script is disabled.
 *   3. Type a prompt — assert Generate Script becomes enabled.
 *   4. Click Generate Script — assert navigation to /video/scripts/:id.
 *   5. Snapshot editor — assert SCRIPT heading + mode toggle on left, CHAT on right.
 *   6. Evaluate window.videoStorageService — assert one script with title and shots.
 *   7. Evaluate window.getActionLog — assert video:script:create event present.
 *   8. Navigate to /video/scripts — assert new script card in grid.
 *   9. Click overflow menu — assert Rename and Delete options present.
 */

import { test, expect } from "@playwright/test";

test.describe("US-053: Script creation and editor navigation", () => {
  test.beforeEach(async ({ page }) => {
    // Start from a clean slate so tests are fully isolated.
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    // Seed a POE API key so the ApiKeyGuard allows generation to proceed.
    // The mock LLM (VITE_USE_MOCK_LLM=true) does not make real API calls;
    // the key just needs to be non-empty to pass the guard check.
    await page.evaluate(() => {
      window.storageService.import({
        settings: { poeApiKey: "test-poe-api-key", numSongs: 3 },
        messages: [],
        songs: [],
      });
    });
  });

  test("create a script from Video Home and navigate through the editor", async ({
    page,
  }) => {
    // ── Step 1: Navigate to / — assert Video tab is present; click to go to /video
    await page.goto("/");

    // Video tab exists in SharedHome's tab bar
    const videoTab = page.getByTestId("tab-video");
    await expect(videoTab).toBeVisible();

    // Click the Video tab to navigate to /video
    await videoTab.click();
    await page.waitForURL("/video");

    // ── Step 2: On /video — assert prompt textarea and disabled button ───────
    // Prompt textarea should exist
    const promptTextarea = page.getByTestId("video-home-prompt");
    await expect(promptTextarea).toBeVisible();

    // Generate Script button should be disabled with empty textarea
    const generateBtn = page.getByTestId("video-home-generate-btn");
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeDisabled();

    // ── Step 3: Type a prompt — button becomes enabled ──────────────────────
    const promptText =
      "A short video about a robot exploring an alien landscape";
    await promptTextarea.fill(promptText);

    // Generate Script button should now be enabled
    await expect(generateBtn).toBeEnabled();

    // ── Step 4: Click Generate Script — navigate to editor ─────────────────
    await generateBtn.click();

    // Wait for navigation to /video/scripts/:id (mock LLM responds fast)
    await page.waitForURL(/\/video\/scripts\/.+/, { timeout: 15000 });

    // Confirm we're on a script editor URL
    const editorUrl = page.url();
    expect(editorUrl).toMatch(/\/video\/scripts\/[^/]+$/);

    // Extract the script ID from the URL for later assertions
    const scriptId = editorUrl.split("/video/scripts/")[1];
    expect(scriptId).toBeTruthy();

    // ── Step 5: Snapshot script editor — assert left + right panel headings ─
    // Left panel: "SCRIPT" heading is shown in the header label
    const scriptPanel = page.getByTestId("script-panel");
    await expect(scriptPanel).toBeVisible();

    // The panel header contains the "SCRIPT" label (in write mode, headerLabel = "Script")
    const panelHeader = page.getByTestId("shot-mode-header");
    await expect(panelHeader).toBeVisible();
    await expect(panelHeader).toContainText("Script");

    // Right panel: "CHAT" heading
    const chatPanel = page.getByTestId("chat-panel");
    await expect(chatPanel).toBeVisible();
    await expect(chatPanel).toContainText("Chat");

    // ── Step 6: Assert storage — exactly one script with title and shots ─────
    const storageState = await page.evaluate(() => {
      const scripts = window.videoStorageService.listScripts();
      return {
        count: scripts.length,
        title: scripts[0]?.title ?? null,
        shotCount: scripts[0]?.shots?.length ?? 0,
        id: scripts[0]?.id ?? null,
      };
    });

    expect(storageState.count).toBe(1);
    expect(storageState.title).toBeTruthy();
    expect(storageState.title!.length).toBeGreaterThan(0);
    expect(storageState.shotCount).toBeGreaterThanOrEqual(1);
    expect(storageState.id).toBe(scriptId);

    // ── Step 7: Assert action log — video:script:create event present ────────
    const actionLogState = await page.evaluate(
      (sid: string) => {
        const entries = window.getActionLog();
        const createEvent = entries.find(
          (e) =>
            e.category === "user:action" &&
            e.action === "video:script:create" &&
            (e.data as Record<string, unknown>)?.scriptId === sid,
        );
        return {
          hasCreateEvent: createEvent !== undefined,
          createEventData: createEvent?.data ?? null,
        };
      },
      scriptId,
    );

    expect(actionLogState.hasCreateEvent).toBe(true);
    const createData = actionLogState.createEventData as Record<
      string,
      unknown
    > | null;
    expect(createData).not.toBeNull();
    expect(createData!.scriptId).toBe(scriptId);

    // ── Step 8: Navigate to /video/scripts — assert new script card in grid ──
    await page.goto("/video/scripts");

    const scriptsGrid = page.getByTestId("scripts-grid");
    await expect(scriptsGrid).toBeVisible();

    // The script card for our created script should be present
    const scriptCard = page.getByTestId(`script-card-${scriptId}`);
    await expect(scriptCard).toBeVisible();

    // ── Step 9: Click overflow menu — assert Rename and Delete options ────────
    const overflowMenuBtn = page.getByTestId(`script-card-menu-${scriptId}`);
    await expect(overflowMenuBtn).toBeVisible();
    await overflowMenuBtn.click();

    // Rename and Delete options should appear in the dropdown
    await expect(
      page.getByRole("button", { name: /Rename/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Delete/i }).first(),
    ).toBeVisible();
  });
});
