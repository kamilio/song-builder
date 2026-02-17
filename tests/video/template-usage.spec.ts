/**
 * US-060: Unit tests for computeTemplateUsage utility.
 *
 * Verifies the three core cases defined in the acceptance criteria:
 *   - None: no script uses the template → "Not used in any script"
 *   - Partial: some shots in a script use the template → "Shots N, M, …"
 *   - All: every shot in a script uses the template → "All"
 *   - Multiple scripts: each is listed separately
 *
 * The tests run entirely via page.evaluate so they exercise the production
 * ES module code compiled by Vite, without any additional test framework.
 * They run against the mock server (VITE_USE_MOCK_LLM=true).
 */

import { test, expect } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal Script fixture factory — only the fields that computeTemplateUsage reads. */
type MinShot = { id: string; prompt: string };
type MinScript = { id: string; title: string; shots: MinShot[] };

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("US-060: computeTemplateUsage unit tests", () => {
  // Navigate once; we only need the JS runtime — no DOM assertions.
  test.beforeEach(async ({ page }) => {
    await page.goto("/video/templates");
    // Ensure the page is loaded (New Variable button present)
    await page.waitForSelector('[data-testid="new-variable-btn"]', { timeout: 10000 });
  });

  // ── none case ──────────────────────────────────────────────────────────────

  test("returns empty usages when no script references the template", async ({ page }) => {
    const result = await page.evaluate(() => {
      // Import the utility synchronously via the global window.__templateUsage
      // exposed in dev mode, OR we call it directly via dynamic import.
      // Since Vite exposes ESM modules at their dev paths, we use dynamic import.
      return import("/src/video/lib/templateUsage.ts").then(({ computeTemplateUsage }) => {
        const scripts = [
          {
            id: "s1",
            title: "My Script",
            shots: [
              { id: "sh1", prompt: "A mountain range at sunset." },
              { id: "sh2", prompt: "Close up of a flower." },
            ],
          },
        ];
        // Cast to the expected type — only used fields are present
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return computeTemplateUsage("Maya", scripts as any);
      });
    });

    expect(result.templateName).toBe("Maya");
    expect(result.usages).toHaveLength(0);
  });

  // ── partial case ───────────────────────────────────────────────────────────

  test("returns partial shot indices when only some shots reference the template", async ({ page }) => {
    const result = await page.evaluate(() => {
      return import("/src/video/lib/templateUsage.ts").then(({ computeTemplateUsage }) => {
        const scripts = [
          {
            id: "s1",
            title: "Action Movie",
            shots: [
              { id: "sh1", prompt: "{{Maya}} walks through a forest." },
              { id: "sh2", prompt: "A wide aerial shot of a city." },
              { id: "sh3", prompt: "{{Maya}} confronts the villain." },
            ],
          },
        ];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return computeTemplateUsage("Maya", scripts as any);
      });
    });

    expect(result.usages).toHaveLength(1);
    expect(result.usages[0].scriptTitle).toBe("Action Movie");
    expect(result.usages[0].shotIndices).toEqual([1, 3]);
    expect(result.usages[0].allShots).toBe(false);
  });

  // ── all case ───────────────────────────────────────────────────────────────

  test("sets allShots=true when every shot in a script references the template", async ({ page }) => {
    const result = await page.evaluate(() => {
      return import("/src/video/lib/templateUsage.ts").then(({ computeTemplateUsage }) => {
        const scripts = [
          {
            id: "s1",
            title: "Character Study",
            shots: [
              { id: "sh1", prompt: "{{Maya}} opens her eyes." },
              { id: "sh2", prompt: "{{Maya}} runs across the rooftop." },
              { id: "sh3", prompt: "{{Maya}} stares into the camera." },
            ],
          },
        ];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return computeTemplateUsage("Maya", scripts as any);
      });
    });

    expect(result.usages).toHaveLength(1);
    expect(result.usages[0].allShots).toBe(true);
    expect(result.usages[0].shotIndices).toHaveLength(3);
  });

  // ── multiple scripts case ──────────────────────────────────────────────────

  test("returns one usage entry per script that references the template", async ({ page }) => {
    const result = await page.evaluate(() => {
      return import("/src/video/lib/templateUsage.ts").then(({ computeTemplateUsage }) => {
        const scripts = [
          {
            id: "s1",
            title: "Script Alpha",
            shots: [
              { id: "sh1", prompt: "{{style_cinematic}} opening scene." },
              { id: "sh2", prompt: "A plain shot." },
            ],
          },
          {
            id: "s2",
            title: "Script Beta",
            shots: [
              { id: "sh1", prompt: "Intro." },
              { id: "sh2", prompt: "{{style_cinematic}} montage." },
            ],
          },
          {
            id: "s3",
            title: "Script Gamma",
            shots: [
              { id: "sh1", prompt: "No template references here." },
            ],
          },
        ];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return computeTemplateUsage("style_cinematic", scripts as any);
      });
    });

    expect(result.usages).toHaveLength(2);
    const titles = result.usages.map((u: { scriptTitle: string }) => u.scriptTitle);
    expect(titles).toContain("Script Alpha");
    expect(titles).toContain("Script Beta");
    expect(titles).not.toContain("Script Gamma");
  });

  // ── formatTemplateUsage: none ──────────────────────────────────────────────

  test("formatTemplateUsage returns 'Not used in any script' when usages is empty", async ({ page }) => {
    const lines = await page.evaluate(() => {
      return import("/src/video/lib/templateUsage.ts").then(
        ({ computeTemplateUsage, formatTemplateUsage }) => {
          const scripts: never[] = [];
          const usage = computeTemplateUsage("Maya", scripts);
          return formatTemplateUsage(usage);
        }
      );
    });

    expect(lines).toEqual(["Not used in any script"]);
  });

  // ── formatTemplateUsage: partial ───────────────────────────────────────────

  test("formatTemplateUsage formats partial usage as 'Used in: title (Shots N, M)'", async ({ page }) => {
    const lines = await page.evaluate(() => {
      return import("/src/video/lib/templateUsage.ts").then(
        ({ computeTemplateUsage, formatTemplateUsage }) => {
          const scripts = [
            {
              id: "s1",
              title: "The Adventure",
              shots: [
                { id: "sh1", prompt: "{{hero}} faces the dragon." },
                { id: "sh2", prompt: "A quiet village scene." },
                { id: "sh3", prompt: "{{hero}} returns home." },
              ],
            },
          ];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const usage = computeTemplateUsage("hero", scripts as any);
          return formatTemplateUsage(usage);
        }
      );
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("Used in: The Adventure (Shots 1, 3)");
  });

  // ── formatTemplateUsage: all ───────────────────────────────────────────────

  test("formatTemplateUsage formats all-shots usage as 'Used in: title (All)'", async ({ page }) => {
    const lines = await page.evaluate(() => {
      return import("/src/video/lib/templateUsage.ts").then(
        ({ computeTemplateUsage, formatTemplateUsage }) => {
          const scripts = [
            {
              id: "s1",
              title: "Epic Tale",
              shots: [
                { id: "sh1", prompt: "{{hero}} begins the journey." },
                { id: "sh2", prompt: "{{hero}} finds the artifact." },
              ],
            },
          ];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const usage = computeTemplateUsage("hero", scripts as any);
          return formatTemplateUsage(usage);
        }
      );
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("Used in: Epic Tale (All)");
  });
});
