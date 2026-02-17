/**
 * Video storage types.
 *
 * Data model mirrors the YAML schema from spec-video.md. All entities are
 * stored in localStorage via storageService.ts.
 *
 * Key design decisions:
 * - VideoHistoryEntry.pinned is always a boolean (never undefined) so the
 *   YAML serialiser can always write `pinned: true/false` and round-trips
 *   correctly preserve pin state.
 * - Shot.narration.audioSource overrides Script.settings.defaultAudio for
 *   that shot and maps to `narration.audio` in the exported YAML.
 * - Templates have a `global` flag: local templates (global: false) are
 *   stored in the script; global templates are stored separately.
 */

export type AudioSource = "video" | "elevenlabs";

// ─── VideoHistoryEntry ────────────────────────────────────────────────────────

/**
 * A single generated video clip in a shot's history.
 *
 * `pinned` is always present (never undefined) so YAML round-trips preserve
 * the pin state correctly — the serialiser must write pinned: true/false
 * for every entry.
 *
 * `pinnedAt` is set to an ISO 8601 string when pinned; cleared (undefined)
 * when unpinned.
 */
export interface VideoHistoryEntry {
  url: string;
  generatedAt: string;
  /** Always a boolean. Default: false. Never omitted during serialisation. */
  pinned: boolean;
  /** ISO 8601 string set when pinned; cleared to undefined when unpinned. */
  pinnedAt?: string;
  audioUrl?: string;
}

// ─── Shot ─────────────────────────────────────────────────────────────────────

export interface ShotNarration {
  enabled: boolean;
  text: string;
  /**
   * Overrides script.settings.defaultAudio for this shot only.
   * Maps to `narration.audio` in the exported YAML.
   */
  audioSource: AudioSource;
  audioUrl?: string;
}

export interface ShotVideo {
  selectedUrl: string | null;
  history: VideoHistoryEntry[];
}

export interface Shot {
  id: string;
  title: string;
  prompt: string;
  narration: ShotNarration;
  video: ShotVideo;
  /** Whether to burn subtitles into this shot's clip. Inherits script.settings.subtitles on creation. */
  subtitles: boolean;
  /** Clip duration in seconds. Must be one of VIDEO_DURATIONS. Default: VIDEO_DURATIONS[0] (8). */
  duration: number;
}

// ─── Script ───────────────────────────────────────────────────────────────────

export interface ScriptSettings {
  /** Whether to burn subtitles into the final video. Default: false. */
  subtitles: boolean;
  /** Default audio source for all shots (overridden per-shot). Default: 'video'. */
  defaultAudio: AudioSource;
  /** Whether narration is enabled globally. New shots inherit this value. Default: false. */
  narrationEnabled: boolean;
  /** Prompt text prepended to every shot during generation. Default: "". */
  globalPrompt: string;
}

/**
 * Local template variable scoped to a single script.
 * Written to the YAML under `templates` with `global: false`.
 */
export interface LocalTemplate {
  name: string;
  value: string;
  global: false;
}

export interface Script {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  settings: ScriptSettings;
  shots: Shot[];
  /** Local templates keyed by variable name. */
  templates: Record<string, LocalTemplate>;
}

// ─── GlobalTemplate ───────────────────────────────────────────────────────────

/**
 * A global template variable accessible from all scripts.
 * Stored separately from scripts; never written into YAML on export.
 */
export interface GlobalTemplate {
  name: string;
  value: string;
  global: true;
}
