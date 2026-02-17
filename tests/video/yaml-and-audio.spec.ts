/**
 * US-065: Playwright MCP tests — YAML export round-trip and narration audio rejection.
 *
 * Two test scenarios:
 *
 * 1. YAML Export Round-Trip:
 *    - Seeds a script with 2 shots: shot 1 has a pinned video history entry;
 *      shot 2 has a global template variable ({{globalVarName}}) in its prompt.
 *    - Also seeds a global template named "globalVarName".
 *    - Clicks Export Video; intercepts the download; reads the YAML string.
 *    - Asserts YAML history entry for shot 1 contains `pinned: true`.
 *    - Asserts YAML templates block does NOT contain the global template variable.
 *    - Asserts YAML prompt for shot 2 still contains the `{{globalVarName}}` reference.
 *
 * 2. Narration Audio Rejection:
 *    - Seeds a shot with narration enabled, ElevenLabs selected, and an existing audioUrl.
 *    - Before clicking Generate Audio, patches HTMLAudioElement in the page to report
 *      a duration of 9.5s (> VIDEO_DURATION = 8s), simulating a long audio file.
 *    - Also sets window.__mockLLMAudioUrl to a distinct URL so generation resolves quickly.
 *    - Clicks Generate Audio; asserts the rejection error message appears with 'too long'.
 *    - Asserts shot.narration.audioUrl in storage is unchanged (previous audio preserved).
 *    - Asserts video:audio:generate:error event in action log.
 *
 * Runs against the mock LLM (VITE_USE_MOCK_LLM=true, configured in playwright.config.ts).
 * State is seeded and inspected via window.videoStorageService and window.getActionLog.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as yaml from "js-yaml";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SeededExportScript {
  scriptId: string;
  shot1Id: string;
  shot2Id: string;
  globalVarName: string;
  pinnedVideoUrl: string;
  previousAudioUrl: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PINNED_VIDEO_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
const PREVIOUS_AUDIO_URL = "https://example.com/previous-audio.mp3";
const GLOBAL_VAR_NAME = "globalVarName";
const LONG_AUDIO_URL = "mock://long-audio-fixture";

// ─── Storage seed helper ────────────────────────────────────────────────────────

/**
 * Seeds:
 *  - A global template named "globalVarName" (category: character)
 *  - A script with 2 shots:
 *      - Shot 1: one pinned VideoHistoryEntry
 *      - Shot 2: prompt contains {{globalVarName}}; narration enabled; ElevenLabs
 *                selected; previous audioUrl stored
 *
 * Returns IDs for assertions.
 */
async function seedExportScript(
  page: import("@playwright/test").Page
): Promise<SeededExportScript> {
  return page.evaluate(
    (args: {
      globalVarName: string;
      pinnedVideoUrl: string;
      previousAudioUrl: string;
    }) => {
      window.videoStorageService.reset();

      const now = new Date().toISOString();
      const t = Date.now();
      const shot1Id = `yaml-shot-1-${t}`;
      const shot2Id = `yaml-shot-2-${t + 1}`;
      const scriptId = `yaml-script-${t + 2}`;

      // Seed global template
      localStorage.setItem(
        "song-builder:video-global-templates",
        JSON.stringify([
          {
            name: args.globalVarName,
            category: "character",
            value: "a heroic character description for testing",
            global: true,
          },
        ])
      );

      // Seed the script
      const script = {
        id: scriptId,
        title: "YAML Round-Trip Test",
        createdAt: now,
        updatedAt: now,
        settings: {
          subtitles: true,
          defaultAudio: "video" as const,
        },
        shots: [
          {
            id: shot1Id,
            title: "Opening Shot",
            prompt: "A wide aerial view of the city at dawn.",
            narration: {
              enabled: false,
              text: "",
              audioSource: "video" as const,
            },
            video: {
              selectedUrl: args.pinnedVideoUrl,
              history: [
                {
                  url: args.pinnedVideoUrl,
                  generatedAt: new Date(t - 120_000).toISOString(),
                  pinned: true,
                  pinnedAt: new Date(t - 60_000).toISOString(),
                },
              ],
            },
          },
          {
            id: shot2Id,
            title: "Character Intro",
            prompt: `Close-up of {{${args.globalVarName}}} walking into frame.`,
            narration: {
              enabled: true,
              text: "The hero arrives.",
              audioSource: "elevenlabs" as const,
              audioUrl: args.previousAudioUrl,
            },
            video: { selectedUrl: null, history: [] },
          },
        ],
        // Local templates block is empty (global template is NOT local)
        templates: {},
      };

      localStorage.setItem(
        "song-builder:video-scripts",
        JSON.stringify([script])
      );

      return {
        scriptId,
        shot1Id,
        shot2Id,
        globalVarName: args.globalVarName,
        pinnedVideoUrl: args.pinnedVideoUrl,
        previousAudioUrl: args.previousAudioUrl,
      };
    },
    {
      globalVarName: GLOBAL_VAR_NAME,
      pinnedVideoUrl: PINNED_VIDEO_URL,
      previousAudioUrl: PREVIOUS_AUDIO_URL,
    }
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe("US-065: YAML export round-trip and narration audio rejection", () => {
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

  // ────────────────────────────────────────────────────────────────────────────
  // Test 1: YAML export round-trip
  // ────────────────────────────────────────────────────────────────────────────

  test("YAML export preserves pinned entries and excludes global templates", async ({
    page,
  }) => {
    // ── Seed storage ──────────────────────────────────────────────────────────
    await page.goto("/");
    const { scriptId } = await seedExportScript(page);

    // ── Navigate to script editor ─────────────────────────────────────────────
    await page.goto(`/video/scripts/${scriptId}`);

    const scriptPanel = page.getByTestId("script-panel");
    await expect(scriptPanel).toBeVisible();

    // ── Intercept the download and capture the YAML ───────────────────────────
    const downloadPromise = page.waitForEvent("download");

    const exportBtn = page.getByTestId("export-video-btn");
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    const download = await downloadPromise;

    // Save the downloaded YAML to a temp file so we can read it
    const tmpFile = path.join(os.tmpdir(), `yaml-export-${Date.now()}.yaml`);
    await download.saveAs(tmpFile);

    const yamlContent = fs.readFileSync(tmpFile, "utf-8");
    fs.unlinkSync(tmpFile);

    // ── Parse the YAML ────────────────────────────────────────────────────────
    const parsed = yaml.load(yamlContent) as Record<string, unknown>;

    // ── Assert: shot 1 history entry has pinned: true ─────────────────────────
    const shots = parsed.shots as Array<Record<string, unknown>>;
    expect(shots).toHaveLength(2);

    const shot1 = shots[0];
    const shot1Video = shot1.video as Record<string, unknown>;
    const shot1History = shot1Video.history as Array<Record<string, unknown>>;
    expect(shot1History).toHaveLength(1);
    expect(shot1History[0].pinned).toBe(true);

    // ── Assert: YAML raw string also contains 'pinned: true' ──────────────────
    expect(yamlContent).toContain("pinned: true");

    // ── Assert: templates block does NOT contain the global template var ───────
    // The templates block should be empty (no local templates in this script)
    const templates = parsed.templates as Record<string, unknown>;
    expect(Object.keys(templates)).not.toContain(GLOBAL_VAR_NAME);

    // ── Assert: shot 2 prompt still contains the {{globalVarName}} reference ──
    const shot2 = shots[1];
    const shot2Prompt = shot2.prompt as string;
    expect(shot2Prompt).toContain(`{{${GLOBAL_VAR_NAME}}}`);

    // ── Assert: video:script:export event logged ──────────────────────────────
    const logAfterExport = await page.evaluate((sid: string) => {
      const entries = window.getActionLog();
      const exportEvent = entries.find(
        (e) =>
          e.category === "user:action" &&
          e.action === "video:script:export" &&
          (e.data as Record<string, unknown>)?.scriptId === sid
      );
      return { hasExportEvent: exportEvent !== undefined };
    }, scriptId);

    expect(logAfterExport.hasExportEvent).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Test 2: Audio duration rejection
  // ────────────────────────────────────────────────────────────────────────────

  test("audio duration rejection preserves previous audioUrl and logs error", async ({
    page,
  }) => {
    // ── Seed storage ──────────────────────────────────────────────────────────
    await page.goto("/");
    const { scriptId, shot2Id, previousAudioUrl } = await seedExportScript(page);

    // ── Navigate to script editor and switch to Shot mode ────────────────────
    await page.goto(`/video/scripts/${scriptId}`);

    const scriptPanel = page.getByTestId("script-panel");
    await expect(scriptPanel).toBeVisible();

    // Switch to Shot mode
    const shotModeToggle = page.getByTestId("mode-toggle-shot");
    await expect(shotModeToggle).toBeVisible();
    await shotModeToggle.click();

    // Navigate to shot 2 (index 1) — it has narration enabled + ElevenLabs
    const nextBtn = page.getByTestId("shot-next-btn");
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();

    // Confirm we're on shot 2 of 2
    const shotModeHeader = page.getByTestId("shot-mode-header");
    await expect(shotModeHeader).toContainText(/shot 2 of 2/i);

    // ── Patch HTMLAudioElement to report duration > 8s ────────────────────────
    // This simulates an audio file that is too long for the 8-second video clip.
    // We override the prototype so that any `new Audio()` created during the
    // duration check will immediately fire 'loadedmetadata' with duration = 9.5.
    await page.evaluate(() => {
      const OriginalAudio = window.Audio;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__originalAudio = OriginalAudio;

      // Patch: replace the global Audio constructor with a proxy that auto-fires
      // loadedmetadata with a duration of 9.5s whenever __mockAudioDurationOverride is set.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).Audio = class MockAudio extends OriginalAudio {
        constructor(src?: string) {
          super(src);
        }

        // Override src setter to auto-dispatch loadedmetadata after a microtask
        set src(value: string) {
          super.src = value;
          // Schedule loadedmetadata to fire with mocked duration
          setTimeout(() => {
            Object.defineProperty(this, "duration", {
              get: () => 9.5,
              configurable: true,
            });
            this.dispatchEvent(new Event("loadedmetadata"));
          }, 0);
        }
        get src() {
          return super.src;
        }
      };

      // Set the testing hook so MockLLMClient returns our custom URL
      window.__mockLLMAudioUrl = "mock://long-audio-fixture";
    });

    // ── Click Generate Audio ──────────────────────────────────────────────────
    const generateAudioBtn = page.getByTestId("shot-mode-generate-audio-btn");
    await expect(generateAudioBtn).toBeVisible();
    await expect(generateAudioBtn).toBeEnabled();
    await generateAudioBtn.click();

    // ── Assert: rejection error message appears with 'too long' ──────────────
    const audioError = page.getByTestId("shot-mode-audio-error");
    await expect(audioError).toBeVisible({ timeout: 5000 });
    await expect(audioError).toContainText(/too long/i);

    // ── Assert: storage audioUrl is unchanged (previous audio preserved) ──────
    const storageAfterRejection = await page.evaluate(
      (args: { sid: string; shotId: string }) => {
        const script = window.videoStorageService.getScript(args.sid);
        const shot = script?.shots.find((s) => s.id === args.shotId);
        return { audioUrl: shot?.narration?.audioUrl ?? null };
      },
      { sid: scriptId, shotId: shot2Id }
    );

    expect(storageAfterRejection.audioUrl).toBe(previousAudioUrl);

    // ── Assert: video:audio:generate:error event in action log ────────────────
    const logAfterRejection = await page.evaluate(
      (args: { sid: string; shotId: string }) => {
        const entries = window.getActionLog();
        const errorEvent = entries.find(
          (e) =>
            e.category === "user:action" &&
            e.action === "video:audio:generate:error" &&
            (e.data as Record<string, unknown>)?.scriptId === args.sid &&
            (e.data as Record<string, unknown>)?.shotId === args.shotId
        );
        return {
          hasErrorEvent: errorEvent !== undefined,
          errorData: errorEvent?.data ?? null,
        };
      },
      { sid: scriptId, shotId: shot2Id }
    );

    expect(logAfterRejection.hasErrorEvent).toBe(true);
    // Error message should contain 'too long'
    const errorMsg = (logAfterRejection.errorData as Record<string, unknown>)
      ?.error as string;
    expect(errorMsg.toLowerCase()).toContain("too long");

    // ── Cleanup: restore original Audio constructor ────────────────────────────
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orig = (window as any).__originalAudio as typeof Audio | undefined;
      if (orig) {
        window.Audio = orig;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).__originalAudio;
      }
      delete window.__mockLLMAudioUrl;
    });
  });
});
