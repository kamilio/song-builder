/**
 * Unit tests for applyToolCall — pure script mutation function.
 *
 * US-076: Regression guard for all 7 tool-call handlers.
 *
 * Test strategy:
 * - Each tool gets a happy-path test with valid args verifying the mutation.
 * - Optional args are tested for sensible defaults (narration fields, afterShotId).
 * - Missing/invalid required args verify the script is returned unchanged (no throw).
 * - An unknown tool name verifies the script is returned unchanged.
 *
 * The function is pure so no browser, storage, or network dependencies exist.
 * Tests run directly in Playwright's Node.js context without a page fixture.
 */

import { test, expect } from "@playwright/test";
import { applyToolCall } from "../applyToolCall";
import type { Script } from "../storage/types";
import { DEFAULT_VIDEO_DURATION } from "../config";

// ─── Fixture builders ──────────────────────────────────────────────────────────

function makeScript(overrides: Partial<Script> = {}): Script {
  const now = new Date().toISOString();
  return {
    id: "script-1",
    title: "Test Script",
    createdAt: now,
    updatedAt: now,
    settings: {
      subtitles: false,
      defaultAudio: "video",
      narrationEnabled: false,
      globalPrompt: "",
    },
    shots: [
      {
        id: "shot-1",
        title: "Shot 1",
        prompt: "original prompt",
        narration: {
          enabled: false,
          text: "original narration",
          audioSource: "video",
        },
        video: { selectedUrl: null, history: [] },
        subtitles: false,
        duration: DEFAULT_VIDEO_DURATION,
      },
      {
        id: "shot-2",
        title: "Shot 2",
        prompt: "second prompt",
        narration: {
          enabled: true,
          text: "second narration",
          audioSource: "elevenlabs",
        },
        video: { selectedUrl: null, history: [] },
        subtitles: true,
        duration: DEFAULT_VIDEO_DURATION,
      },
    ],
    templates: {},
    ...overrides,
  };
}

// ─── update_shot_prompt ────────────────────────────────────────────────────────

test.describe("update_shot_prompt", () => {
  test("happy path: updates matching shot prompt", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_prompt", {
      shotId: "shot-1",
      prompt: "new prompt text",
    });

    expect(result.shots[0].prompt).toBe("new prompt text");
    // Other shots unchanged
    expect(result.shots[1].prompt).toBe("second prompt");
    // Input not mutated
    expect(script.shots[0].prompt).toBe("original prompt");
  });

  test("returns script unchanged when shotId is missing", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_prompt", {
      prompt: "new prompt",
    });
    expect(result).toBe(script);
  });

  test("returns script unchanged when prompt is missing", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_prompt", {
      shotId: "shot-1",
    });
    expect(result).toBe(script);
  });

  test("returns script unchanged when shotId is not a string", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_prompt", {
      shotId: 42,
      prompt: "new prompt",
    });
    expect(result).toBe(script);
  });

  test("returns script unchanged when shotId not found (no-op, no throw)", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_prompt", {
      shotId: "nonexistent",
      prompt: "new prompt",
    });
    // All shots unchanged — shotId not found means no mutation
    expect(result.shots[0].prompt).toBe("original prompt");
    expect(result.shots[1].prompt).toBe("second prompt");
  });
});

// ─── update_shot_narration ─────────────────────────────────────────────────────

test.describe("update_shot_narration", () => {
  test("happy path: updates all narration fields when provided", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_narration", {
      shotId: "shot-1",
      enabled: true,
      text: "new narration text",
      audioSource: "elevenlabs",
    });

    const narration = result.shots[0].narration;
    expect(narration.enabled).toBe(true);
    expect(narration.text).toBe("new narration text");
    expect(narration.audioSource).toBe("elevenlabs");
    // Other shot unchanged
    expect(result.shots[1].narration.enabled).toBe(true);
  });

  test("missing optional enabled: preserves existing enabled value", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_narration", {
      shotId: "shot-1",
      text: "updated text only",
    });

    const narration = result.shots[0].narration;
    // enabled not in args, so original value preserved
    expect(narration.enabled).toBe(false);
    expect(narration.text).toBe("updated text only");
  });

  test("missing optional text: preserves existing text value", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_narration", {
      shotId: "shot-1",
      enabled: true,
    });

    const narration = result.shots[0].narration;
    expect(narration.enabled).toBe(true);
    expect(narration.text).toBe("original narration");
  });

  test("missing optional audioSource: preserves existing audioSource", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_narration", {
      shotId: "shot-1",
      enabled: true,
    });

    expect(result.shots[0].narration.audioSource).toBe("video");
  });

  test("invalid audioSource: ignored, preserves existing value", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_narration", {
      shotId: "shot-1",
      audioSource: "unknown-source",
    });

    expect(result.shots[0].narration.audioSource).toBe("video");
  });

  test("returns script unchanged when shotId is missing", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_narration", {
      enabled: true,
    });
    expect(result).toBe(script);
  });

  test("returns script unchanged when shotId is not a string", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_narration", {
      shotId: 99,
      enabled: true,
    });
    expect(result).toBe(script);
  });
});

// ─── update_shot_subtitles ────────────────────────────────────────────────────

test.describe("update_shot_subtitles", () => {
  test("happy path: sets subtitles to true on matching shot", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_subtitles", {
      shotId: "shot-1",
      subtitles: true,
    });

    expect(result.shots[0].subtitles).toBe(true);
    // Other shot unchanged
    expect(result.shots[1].subtitles).toBe(true);
  });

  test("happy path: sets subtitles to false on matching shot", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_subtitles", {
      shotId: "shot-2",
      subtitles: false,
    });

    expect(result.shots[1].subtitles).toBe(false);
  });

  test("returns script unchanged when shotId is missing", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_subtitles", {
      subtitles: true,
    });
    expect(result).toBe(script);
  });

  test("returns script unchanged when subtitles is missing", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_subtitles", {
      shotId: "shot-1",
    });
    expect(result).toBe(script);
  });

  test("returns script unchanged when subtitles is not a boolean", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_subtitles", {
      shotId: "shot-1",
      subtitles: "yes",
    });
    expect(result).toBe(script);
  });

  test("returns script unchanged when shotId is not a string", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_subtitles", {
      shotId: 0,
      subtitles: true,
    });
    expect(result).toBe(script);
  });
});

// ─── add_shot ─────────────────────────────────────────────────────────────────

test.describe("add_shot", () => {
  test("happy path: appends new shot to end when afterShotId absent", () => {
    const script = makeScript();
    const result = applyToolCall(script, "add_shot", {
      title: "New Shot",
      prompt: "new shot prompt",
    });

    expect(result.shots).toHaveLength(3);
    expect(result.shots[2].title).toBe("New Shot");
    expect(result.shots[2].prompt).toBe("new shot prompt");
    // Inherits script settings
    expect(result.shots[2].narration.enabled).toBe(
      script.settings.narrationEnabled
    );
    expect(result.shots[2].subtitles).toBe(script.settings.subtitles);
    expect(result.shots[2].duration).toBe(DEFAULT_VIDEO_DURATION);
    expect(result.shots[2].video.selectedUrl).toBeNull();
    expect(result.shots[2].video.history).toHaveLength(0);
    // Original shots unchanged
    expect(result.shots[0].id).toBe("shot-1");
    expect(result.shots[1].id).toBe("shot-2");
  });

  test("happy path: inserts shot after specified afterShotId", () => {
    const script = makeScript();
    const result = applyToolCall(script, "add_shot", {
      title: "Middle Shot",
      prompt: "inserted prompt",
      afterShotId: "shot-1",
    });

    expect(result.shots).toHaveLength(3);
    expect(result.shots[0].id).toBe("shot-1");
    expect(result.shots[1].title).toBe("Middle Shot");
    expect(result.shots[2].id).toBe("shot-2");
  });

  test("appends to end when afterShotId not found", () => {
    const script = makeScript();
    const result = applyToolCall(script, "add_shot", {
      title: "Appended Shot",
      prompt: "appended",
      afterShotId: "nonexistent-id",
    });

    expect(result.shots).toHaveLength(3);
    expect(result.shots[2].title).toBe("Appended Shot");
  });

  test("new shot gets a unique id", () => {
    const script = makeScript();
    const result = applyToolCall(script, "add_shot", {
      title: "Shot A",
      prompt: "prompt a",
    });
    const newId = result.shots[2].id;
    expect(newId).toBeTruthy();
    expect(newId).not.toBe("shot-1");
    expect(newId).not.toBe("shot-2");
  });

  test("returns script unchanged when title is missing", () => {
    const script = makeScript();
    const result = applyToolCall(script, "add_shot", {
      prompt: "some prompt",
    });
    expect(result).toBe(script);
  });

  test("returns script unchanged when prompt is missing", () => {
    const script = makeScript();
    const result = applyToolCall(script, "add_shot", {
      title: "Some Title",
    });
    expect(result).toBe(script);
  });

  test("returns script unchanged when title is not a string", () => {
    const script = makeScript();
    const result = applyToolCall(script, "add_shot", {
      title: 42,
      prompt: "some prompt",
    });
    expect(result).toBe(script);
  });
});

// ─── delete_shot ──────────────────────────────────────────────────────────────

test.describe("delete_shot", () => {
  test("happy path: removes matching shot", () => {
    const script = makeScript();
    const result = applyToolCall(script, "delete_shot", { shotId: "shot-1" });

    expect(result.shots).toHaveLength(1);
    expect(result.shots[0].id).toBe("shot-2");
    // Input not mutated
    expect(script.shots).toHaveLength(2);
  });

  test("no-op when shotId not found — returns new object with unchanged shots", () => {
    const script = makeScript();
    const result = applyToolCall(script, "delete_shot", {
      shotId: "nonexistent",
    });

    expect(result.shots).toHaveLength(2);
  });

  test("returns script unchanged when shotId is missing", () => {
    const script = makeScript();
    const result = applyToolCall(script, "delete_shot", {});
    expect(result).toBe(script);
  });

  test("returns script unchanged when shotId is not a string", () => {
    const script = makeScript();
    const result = applyToolCall(script, "delete_shot", { shotId: 1 });
    expect(result).toBe(script);
  });
});

// ─── reorder_shots ────────────────────────────────────────────────────────────

test.describe("reorder_shots", () => {
  test("happy path: reorders shots to match provided shotIds array", () => {
    const script = makeScript();
    const result = applyToolCall(script, "reorder_shots", {
      shotIds: ["shot-2", "shot-1"],
    });

    expect(result.shots).toHaveLength(2);
    expect(result.shots[0].id).toBe("shot-2");
    expect(result.shots[1].id).toBe("shot-1");
    // Input not mutated
    expect(script.shots[0].id).toBe("shot-1");
  });

  test("returns script unchanged when shotIds length mismatches (data loss prevention)", () => {
    const script = makeScript();
    const result = applyToolCall(script, "reorder_shots", {
      shotIds: ["shot-1"],
    });
    expect(result).toBe(script);
  });

  test("returns script unchanged when shotIds contains unknown ids (length mismatch)", () => {
    const script = makeScript();
    const result = applyToolCall(script, "reorder_shots", {
      shotIds: ["shot-1", "nonexistent"],
    });
    expect(result).toBe(script);
  });

  test("returns script unchanged when shotIds is missing", () => {
    const script = makeScript();
    const result = applyToolCall(script, "reorder_shots", {});
    expect(result).toBe(script);
  });

  test("returns script unchanged when shotIds is not an array", () => {
    const script = makeScript();
    const result = applyToolCall(script, "reorder_shots", {
      shotIds: "shot-1,shot-2",
    });
    expect(result).toBe(script);
  });

  test("non-string entries in shotIds are filtered out causing length mismatch → unchanged", () => {
    const script = makeScript();
    const result = applyToolCall(script, "reorder_shots", {
      shotIds: ["shot-1", 42],
    });
    // 42 is filtered out → reordered.length = 1 ≠ 2 → unchanged
    expect(result).toBe(script);
  });
});

// ─── update_script_settings ───────────────────────────────────────────────────

test.describe("update_script_settings", () => {
  test("happy path: updates all three settings fields", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_script_settings", {
      narrationEnabled: true,
      subtitles: true,
      globalPrompt: "Always include dramatic lighting.",
    });

    expect(result.settings.narrationEnabled).toBe(true);
    expect(result.settings.subtitles).toBe(true);
    expect(result.settings.globalPrompt).toBe("Always include dramatic lighting.");
    // Other settings preserved
    expect(result.settings.defaultAudio).toBe("video");
    // Shots unchanged
    expect(result.shots).toHaveLength(2);
    // Input not mutated
    expect(script.settings.narrationEnabled).toBe(false);
  });

  test("missing optional narrationEnabled: preserves existing value", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_script_settings", {
      subtitles: true,
    });

    expect(result.settings.narrationEnabled).toBe(false);
    expect(result.settings.subtitles).toBe(true);
  });

  test("missing optional subtitles: preserves existing value", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_script_settings", {
      narrationEnabled: true,
    });

    expect(result.settings.subtitles).toBe(false);
    expect(result.settings.narrationEnabled).toBe(true);
  });

  test("missing optional globalPrompt: preserves existing value", () => {
    const script = makeScript({
      settings: {
        subtitles: false,
        defaultAudio: "video",
        narrationEnabled: false,
        globalPrompt: "existing prompt",
      },
    });
    const result = applyToolCall(script, "update_script_settings", {
      narrationEnabled: true,
    });

    expect(result.settings.globalPrompt).toBe("existing prompt");
  });

  test("empty args object: settings returned as copy but values preserved", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_script_settings", {});

    expect(result.settings.narrationEnabled).toBe(false);
    expect(result.settings.subtitles).toBe(false);
    expect(result.settings.globalPrompt).toBe("");
  });

  test("non-boolean narrationEnabled is ignored", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_script_settings", {
      narrationEnabled: "yes",
    });
    expect(result.settings.narrationEnabled).toBe(false);
  });

  test("non-boolean subtitles is ignored", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_script_settings", {
      subtitles: 1,
    });
    expect(result.settings.subtitles).toBe(false);
  });

  test("non-string globalPrompt is ignored", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_script_settings", {
      globalPrompt: 42,
    });
    expect(result.settings.globalPrompt).toBe("");
  });
});

// ─── Unknown tool name ────────────────────────────────────────────────────────

test.describe("unknown tool name", () => {
  test("returns script unchanged for completely unknown tool", () => {
    const script = makeScript();
    const result = applyToolCall(script, "nonexistent_tool", {
      shotId: "shot-1",
    });
    expect(result).toBe(script);
  });

  test("returns script unchanged for empty string tool name", () => {
    const script = makeScript();
    const result = applyToolCall(script, "", {});
    expect(result).toBe(script);
  });

  test("returns script unchanged for misspelled tool names", () => {
    const script = makeScript();
    const result = applyToolCall(script, "update_shot_prompts", {
      shotId: "shot-1",
      prompt: "typo in tool name",
    });
    expect(result).toBe(script);
  });
});

// ─── Immutability guard ───────────────────────────────────────────────────────

test.describe("immutability", () => {
  test("update_shot_prompt does not mutate the original script object", () => {
    const script = makeScript();
    const originalShots = script.shots;
    const originalShot0 = script.shots[0];

    applyToolCall(script, "update_shot_prompt", {
      shotId: "shot-1",
      prompt: "mutated?",
    });

    expect(script.shots).toBe(originalShots);
    expect(script.shots[0]).toBe(originalShot0);
    expect(script.shots[0].prompt).toBe("original prompt");
  });

  test("add_shot does not mutate the original shots array", () => {
    const script = makeScript();
    const originalLength = script.shots.length;

    applyToolCall(script, "add_shot", {
      title: "Extra Shot",
      prompt: "extra",
    });

    expect(script.shots.length).toBe(originalLength);
  });

  test("delete_shot does not mutate the original shots array", () => {
    const script = makeScript();

    applyToolCall(script, "delete_shot", { shotId: "shot-1" });

    expect(script.shots.length).toBe(2);
  });
});
