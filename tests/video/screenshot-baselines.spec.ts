/**
 * US-058: Screenshot regression baselines for video pages.
 *
 * Captures full-page screenshots at desktop (1280×800) and mobile (375×812)
 * for all 7 video pages with appropriate fixture data. On future runs the
 * committed baseline images in screenshots/ are used to detect visual regressions.
 *
 * Run an individual page's screenshots:
 *   npm run screenshot:video-home
 *   npm run screenshot:video-scripts
 *   npm run screenshot:video-editor
 *   npm run screenshot:video-shot
 *   npm run screenshot:video-templates
 *   npm run screenshot:video-all-videos
 *   npm run screenshot:video-pinned
 *
 * To regenerate all baselines after an intentional UI change:
 *   npx playwright test tests/video/screenshot-baselines.spec.ts --update-snapshots
 *
 * Page / fixture mapping:
 *   /video                     → clearVideoStorage         (no scripts)
 *   /video/scripts             → twoScriptsFixture         (2 seeded scripts)
 *   /video/scripts/:id (Write) → editorWriteFixture        (script, 3 shots, shot 1 has selected video)
 *   /video/scripts/:id (Shot)  → editorShotFixture         (same script, shot 2 focused, 2 history entries)
 *   /video/templates           → twoGlobalTemplatesFixture (1 Character, 1 Style)
 *   /video/videos              → threeVideosFixture        (3 video history entries across 2 scripts)
 *   /video/videos/pinned       → pinnedVideoFixture        (1 pinned video entry)
 */

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// ─── Viewport helpers ─────────────────────────────────────────────────────────

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 375, height: 812 };

// ─── Stable fixture IDs (deterministic for snapshot consistency) ──────────────

const SCRIPT_1_ID = "screenshot-script-1";
const SCRIPT_2_ID = "screenshot-script-2";
const SHOT_1_ID = "screenshot-shot-1";
const SHOT_2_ID = "screenshot-shot-2";
const SHOT_3_ID = "screenshot-shot-3";

// Use a stable URL so the test ID hash is consistent across runs.
const VIDEO_URL_1 =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
const VIDEO_URL_2 =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
const VIDEO_URL_3 =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4";

// Fixed timestamps so screenshot content is stable across runs.
const FIXED_TIME_1 = "2026-01-15T10:00:00.000Z";
const FIXED_TIME_2 = "2026-01-16T12:00:00.000Z";
const FIXED_TIME_3 = "2026-01-17T14:00:00.000Z";

// ─── Storage seed helpers ─────────────────────────────────────────────────────

/**
 * Navigate to the root, clear all localStorage, then seed the POE API key
 * so the ApiKeyGuard allows pages to render.
 */
async function resetAndSeedApiKey(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    window.storageService.import({
      settings: { poeApiKey: "test-poe-api-key", numSongs: 3 },
      messages: [],
      songs: [],
    });
  });
}

/**
 * Clear all video storage (leaves other storage intact).
 */
async function clearVideoStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.videoStorageService.reset();
  });
}

/**
 * Seed 2 scripts with no shots (All Scripts / Video Home fixture).
 */
async function seedTwoScripts(page: Page): Promise<void> {
  await page.evaluate(
    (ids: { s1: string; s2: string; t1: string; t2: string }) => {
      window.videoStorageService.reset();
      localStorage.setItem(
        "song-builder:video-scripts",
        JSON.stringify([
          {
            id: ids.s1,
            title: "City of Lights",
            createdAt: ids.t1,
            updatedAt: ids.t1,
            settings: { subtitles: true, defaultAudio: "video" },
            shots: [
              {
                id: "s1-shot-1",
                title: "Opening",
                prompt: "A wide aerial view of a glittering city at night.",
                narration: { enabled: false, text: "", audioSource: "video" },
                video: { selectedUrl: null, history: [] },
              },
              {
                id: "s1-shot-2",
                title: "Close Up",
                prompt: "A close-up of a neon sign reflected in rain puddles.",
                narration: { enabled: false, text: "", audioSource: "video" },
                video: { selectedUrl: null, history: [] },
              },
            ],
            templates: {},
          },
          {
            id: ids.s2,
            title: "Desert Journey",
            createdAt: ids.t2,
            updatedAt: ids.t2,
            settings: { subtitles: true, defaultAudio: "video" },
            shots: [
              {
                id: "s2-shot-1",
                title: "Dunes at Dawn",
                prompt: "Sun rising over vast golden sand dunes.",
                narration: { enabled: false, text: "", audioSource: "video" },
                video: { selectedUrl: null, history: [] },
              },
            ],
            templates: {},
          },
        ])
      );
    },
    {
      s1: SCRIPT_1_ID,
      s2: SCRIPT_2_ID,
      t1: FIXED_TIME_1,
      t2: FIXED_TIME_2,
    }
  );
}

/**
 * Seed a script with 3 shots, shot 1 having a selected video.
 * Returns the script ID.
 */
async function seedEditorScript(page: Page): Promise<string> {
  await page.evaluate(
    (ids: {
      scriptId: string;
      shot1: string;
      shot2: string;
      shot3: string;
      videoUrl: string;
      t1: string;
      t2: string;
    }) => {
      window.videoStorageService.reset();
      localStorage.setItem(
        "song-builder:video-scripts",
        JSON.stringify([
          {
            id: ids.scriptId,
            title: "Galactic Odyssey",
            createdAt: ids.t1,
            updatedAt: ids.t1,
            settings: { subtitles: true, defaultAudio: "video" },
            shots: [
              {
                id: ids.shot1,
                title: "Launch",
                prompt:
                  "A rocket launching into a starlit sky with {{character}} visible in the cockpit.",
                narration: { enabled: false, text: "", audioSource: "video" },
                video: {
                  selectedUrl: ids.videoUrl,
                  history: [
                    {
                      url: ids.videoUrl,
                      generatedAt: ids.t1,
                      pinned: false,
                    },
                  ],
                },
              },
              {
                id: ids.shot2,
                title: "Space Walk",
                prompt: "An astronaut floats outside the station.",
                narration: { enabled: true, text: "The crew prepares.", audioSource: "video" },
                video: {
                  selectedUrl: null,
                  history: [
                    {
                      url: ids.videoUrl,
                      generatedAt: ids.t1,
                      pinned: false,
                    },
                    {
                      url: ids.videoUrl + "?v=2",
                      generatedAt: ids.t2,
                      pinned: true,
                      pinnedAt: ids.t2,
                    },
                  ],
                },
              },
              {
                id: ids.shot3,
                title: "Landing",
                prompt: "The capsule splashes down in a calm ocean.",
                narration: { enabled: false, text: "", audioSource: "video" },
                video: { selectedUrl: null, history: [] },
              },
            ],
            templates: {
              character: {
                name: "character",
                value: "Commander Nova, a seasoned astronaut",
                global: false,
              },
            },
          },
        ])
      );
    },
    {
      scriptId: SCRIPT_1_ID,
      shot1: SHOT_1_ID,
      shot2: SHOT_2_ID,
      shot3: SHOT_3_ID,
      videoUrl: VIDEO_URL_1,
      t1: FIXED_TIME_1,
      t2: FIXED_TIME_2,
    }
  );
  return SCRIPT_1_ID;
}

/**
 * Seed 2 global templates (1 Character, 1 Style).
 */
async function seedGlobalTemplates(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.videoStorageService.reset();
    localStorage.setItem(
      "song-builder:video-global-templates",
      JSON.stringify([
        {
          name: "Maya",
          value: "a young woman with curly auburn hair and bright green eyes",
          global: true,
        },
        {
          name: "cinematic_style",
          value: "cinematic, anamorphic lens, golden hour lighting, film grain",
          global: true,
        },
      ])
    );
  });
}

/**
 * Seed 3 video history entries across 2 scripts (for All Videos page).
 */
async function seedThreeVideos(page: Page): Promise<void> {
  await page.evaluate(
    (ids: {
      s1: string;
      s2: string;
      shot1: string;
      shot2: string;
      shot3: string;
      url1: string;
      url2: string;
      url3: string;
      t1: string;
      t2: string;
      t3: string;
    }) => {
      window.videoStorageService.reset();
      localStorage.setItem(
        "song-builder:video-scripts",
        JSON.stringify([
          {
            id: ids.s1,
            title: "Ocean Voyage",
            createdAt: ids.t1,
            updatedAt: ids.t2,
            settings: { subtitles: true, defaultAudio: "video" },
            shots: [
              {
                id: ids.shot1,
                title: "Open Sea",
                prompt: "A sailboat glides across a calm turquoise sea.",
                narration: { enabled: false, text: "", audioSource: "video" },
                video: {
                  selectedUrl: ids.url1,
                  history: [
                    { url: ids.url1, generatedAt: ids.t1, pinned: false },
                    { url: ids.url2, generatedAt: ids.t2, pinned: false },
                  ],
                },
              },
            ],
            templates: {},
          },
          {
            id: ids.s2,
            title: "Mountain Trek",
            createdAt: ids.t2,
            updatedAt: ids.t3,
            settings: { subtitles: true, defaultAudio: "video" },
            shots: [
              {
                id: ids.shot2,
                title: "Summit",
                prompt: "A hiker reaches the mountain peak at sunrise.",
                narration: { enabled: false, text: "", audioSource: "video" },
                video: {
                  selectedUrl: null,
                  history: [
                    { url: ids.url3, generatedAt: ids.t3, pinned: false },
                  ],
                },
              },
            ],
            templates: {},
          },
        ])
      );
    },
    {
      s1: SCRIPT_1_ID,
      s2: SCRIPT_2_ID,
      shot1: SHOT_1_ID,
      shot2: SHOT_2_ID,
      shot3: SHOT_3_ID,
      url1: VIDEO_URL_1,
      url2: VIDEO_URL_2,
      url3: VIDEO_URL_3,
      t1: FIXED_TIME_1,
      t2: FIXED_TIME_2,
      t3: FIXED_TIME_3,
    }
  );
}

/**
 * Seed 1 pinned video entry (for Pinned Videos page).
 */
async function seedPinnedVideo(page: Page): Promise<void> {
  await page.evaluate(
    (ids: {
      scriptId: string;
      shotId: string;
      url: string;
      t1: string;
      t2: string;
    }) => {
      window.videoStorageService.reset();
      localStorage.setItem(
        "song-builder:video-scripts",
        JSON.stringify([
          {
            id: ids.scriptId,
            title: "Nature Documentary",
            createdAt: ids.t1,
            updatedAt: ids.t2,
            settings: { subtitles: true, defaultAudio: "video" },
            shots: [
              {
                id: ids.shotId,
                title: "Forest Floor",
                prompt: "A fox sneaks through an ancient forest at dusk.",
                narration: { enabled: false, text: "", audioSource: "video" },
                video: {
                  selectedUrl: ids.url,
                  history: [
                    {
                      url: ids.url,
                      generatedAt: ids.t1,
                      pinned: true,
                      pinnedAt: ids.t2,
                    },
                  ],
                },
              },
            ],
            templates: {},
          },
        ])
      );
    },
    {
      scriptId: SCRIPT_1_ID,
      shotId: SHOT_1_ID,
      url: VIDEO_URL_1,
      t1: FIXED_TIME_1,
      t2: FIXED_TIME_2,
    }
  );
}

// ─── Video Home (/video) — empty storage ─────────────────────────────────────

test(
  "@screenshot:video-home video home empty state desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await resetAndSeedApiKey(page);
    await clearVideoStorage(page);
    await page.goto("/video");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("video-home-prompt")).toBeVisible();
    await expect(page.getByTestId("video-home-generate-btn")).toBeVisible();

    await expect(page).toHaveScreenshot("video-home-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:video-home video home empty state mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await resetAndSeedApiKey(page);
    await clearVideoStorage(page);
    await page.goto("/video");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("video-home-prompt")).toBeVisible();

    await expect(page).toHaveScreenshot("video-home-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── All Scripts (/video/scripts) — 2 seeded scripts ─────────────────────────

test(
  "@screenshot:video-scripts all scripts page desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await resetAndSeedApiKey(page);
    await seedTwoScripts(page);
    await page.goto("/video/scripts");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("scripts-grid")).toBeVisible();
    await expect(page.getByTestId(`script-card-${SCRIPT_1_ID}`)).toBeVisible();
    await expect(page.getByTestId("new-script-card")).toBeVisible();

    await expect(page).toHaveScreenshot("video-scripts-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:video-scripts all scripts page mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await resetAndSeedApiKey(page);
    await seedTwoScripts(page);
    await page.goto("/video/scripts");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("scripts-grid")).toBeVisible();
    await expect(page.getByTestId(`script-card-${SCRIPT_1_ID}`)).toBeVisible();

    await expect(page).toHaveScreenshot("video-scripts-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── Script Editor — Write mode (3 shots, shot 1 has selected video) ──────────

test(
  "@screenshot:video-editor script editor write mode desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await resetAndSeedApiKey(page);
    const scriptId = await seedEditorScript(page);
    await page.goto(`/video/scripts/${scriptId}`);
    await page.waitForLoadState("networkidle");

    // Write mode is the default; assert the script panel and shot cards are visible
    await expect(page.getByTestId("script-panel")).toBeVisible();
    await expect(page.getByTestId("write-mode-content")).toBeVisible();
    await expect(page.getByTestId(`shot-card-${SHOT_1_ID}`)).toBeVisible();

    await expect(page).toHaveScreenshot("video-editor-write-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:video-editor script editor write mode mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await resetAndSeedApiKey(page);
    const scriptId = await seedEditorScript(page);
    await page.goto(`/video/scripts/${scriptId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("script-panel")).toBeVisible();

    await expect(page).toHaveScreenshot("video-editor-write-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── Script Editor — Shot mode (shot 2 focused, 2 video history entries) ─────

test(
  "@screenshot:video-shot script editor shot mode desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await resetAndSeedApiKey(page);
    const scriptId = await seedEditorScript(page);
    await page.goto(`/video/scripts/${scriptId}/${SHOT_2_ID}`);
    await page.waitForLoadState("networkidle");

    // Assert we are on shot 2 with 2 history entries
    await expect(page.getByTestId("shot-mode-header")).toContainText(
      /shot 2 of 3/i
    );
    await expect(page.getByTestId("video-history-card-0")).toBeVisible();
    await expect(page.getByTestId("video-history-card-1")).toBeVisible();

    await expect(page).toHaveScreenshot("video-shot-mode-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:video-shot script editor shot mode mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await resetAndSeedApiKey(page);
    const scriptId = await seedEditorScript(page);
    await page.goto(`/video/scripts/${scriptId}/${SHOT_2_ID}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("shot-mode-header")).toContainText(
      /shot 2 of 3/i
    );

    await expect(page).toHaveScreenshot("video-shot-mode-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── Global Templates (/video/templates) — 2 global templates ─────────────────

test(
  "@screenshot:video-templates global templates page desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await resetAndSeedApiKey(page);
    await seedGlobalTemplates(page);
    await page.goto("/video/templates");
    await page.waitForLoadState("networkidle");

    // Maya should be visible in the flat template list
    await expect(page.getByTestId("template-card-Maya")).toBeVisible();

    await expect(page).toHaveScreenshot("video-templates-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:video-templates global templates page mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await resetAndSeedApiKey(page);
    await seedGlobalTemplates(page);
    await page.goto("/video/templates");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("template-card-Maya")).toBeVisible();

    await expect(page).toHaveScreenshot("video-templates-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── All Videos (/video/videos) — 3 video history entries ─────────────────────

test(
  "@screenshot:video-all-videos all videos page desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await resetAndSeedApiKey(page);
    await seedThreeVideos(page);
    await page.goto("/video/videos");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: "All Videos" })
    ).toBeVisible();
    await expect(page.getByTestId("all-videos-grid")).toBeVisible();

    await expect(page).toHaveScreenshot("video-all-videos-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:video-all-videos all videos page mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await resetAndSeedApiKey(page);
    await seedThreeVideos(page);
    await page.goto("/video/videos");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: "All Videos" })
    ).toBeVisible();

    await expect(page).toHaveScreenshot("video-all-videos-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

// ─── Pinned Videos (/video/videos/pinned) — 1 pinned video entry ──────────────

test(
  "@screenshot:video-pinned pinned videos page desktop baseline",
  async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await resetAndSeedApiKey(page);
    await seedPinnedVideo(page);
    await page.goto("/video/videos/pinned");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: "Pinned Videos" })
    ).toBeVisible();
    await expect(page.getByTestId("pinned-videos-grid")).toBeVisible();

    await expect(page).toHaveScreenshot("video-pinned-desktop.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);

test(
  "@screenshot:video-pinned pinned videos page mobile baseline",
  async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await resetAndSeedApiKey(page);
    await seedPinnedVideo(page);
    await page.goto("/video/videos/pinned");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: "Pinned Videos" })
    ).toBeVisible();
    await expect(page.getByTestId("pinned-videos-grid")).toBeVisible();

    await expect(page).toHaveScreenshot("video-pinned-mobile.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  }
);
