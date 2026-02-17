/**
 * localStorage-backed storage service for video scripts and global templates.
 *
 * All data is stored under prefixed keys:
 *   song-builder:video-scripts       — Script[]
 *   song-builder:video-global-templates — GlobalTemplate[]
 *
 * Design mirrors src/image/lib/storage/storageService.ts:
 * - readJSON / writeJSON helpers with QuotaExceededError handling
 * - generateId() for stable unique IDs
 *
 * Serialisation contract (VideoHistoryEntry.pinned):
 * The `pinned` field is always written as a boolean in YAML export.
 * This service stores it as a boolean and never defaults it to false on read
 * so that round-trips from YAML back into storage preserve pin state exactly.
 */

import type { Script, GlobalTemplate } from "./types";
import { VIDEO_DURATIONS } from "@/video/lib/config";
import { emitQuotaExceeded } from "@/shared/lib/storageQuotaEvents";
import { log } from "@/music/lib/actionLog";

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEYS = {
  scripts: "song-builder:video-scripts",
  globalTemplates: "song-builder:video-global-templates",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJSON<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ) {
      // Notify the UI and swallow so callers continue running uninterrupted.
      // The pre-existing data in localStorage is never mutated, so no
      // corruption occurs — only the new write is lost.
      emitQuotaExceeded();
      return;
    }
    throw err;
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Scripts ──────────────────────────────────────────────────────────────────

/**
 * Backfill any fields that may be absent in scripts written before the
 * US-066 data-model update.  This is a read-side migration — data in
 * localStorage is never mutated; callers receive fully populated objects.
 *
 * Defaults applied when a field is missing (undefined):
 *   script.settings.narrationEnabled → false
 *   script.settings.globalPrompt     → ""
 *   script.settings.subtitles        → false  (was previously defaulted to true)
 *   shot.subtitles                   → script.settings.subtitles (or false)
 *   shot.duration                    → VIDEO_DURATIONS[0] (8)
 */
function migrateScript(raw: Script): Script {
  const settings = {
    narrationEnabled: false,
    globalPrompt: "",
    subtitles: false,
    ...raw.settings,
  };
  const shots = raw.shots.map((shot) => ({
    subtitles: settings.subtitles,
    duration: VIDEO_DURATIONS[0],
    ...shot,
  }));
  // Backfill templates: older scripts written before the templates field was
  // added may not have it. Default to an empty record to prevent crashes in
  // code that calls Object.values(script.templates).
  // Also strip legacy `category` field from existing templates.
  const rawTemplates = raw.templates ?? {};
  const templates: Script["templates"] = Object.fromEntries(
    Object.entries(rawTemplates).map(([k, v]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = v as any;
      return [k, { name: raw.name as string, value: raw.value as string, global: false as const }];
    })
  );
  return { ...raw, settings, shots, templates };
}

function getScripts(): Script[] {
  const raw = readJSON<Script[]>(KEYS.scripts) ?? [];
  return raw.map(migrateScript);
}

/**
 * Create a new script with default settings and an empty shot list.
 * Returns the persisted script.
 */
export function createScript(title: string): Script {
  const now = new Date().toISOString();
  const script: Script = {
    id: generateId(),
    title,
    createdAt: now,
    updatedAt: now,
    settings: {
      subtitles: false,
      defaultAudio: "video",
      narrationEnabled: false,
      globalPrompt: "",
    },
    shots: [],
    templates: {},
  };
  const scripts = getScripts();
  writeJSON(KEYS.scripts, [...scripts, script]);
  if (import.meta.env.DEV) {
    log({ category: "storage", action: "video:storage:script:write", data: { scriptId: script.id, op: "create" } });
  }
  return script;
}

/**
 * Retrieve a script by ID. Returns null if not found.
 */
export function getScript(id: string): Script | null {
  return getScripts().find((s) => s.id === id) ?? null;
}

/**
 * Overwrite the stored script with the provided value.
 * `updatedAt` is always bumped to the current time.
 * Returns the updated script or null if the ID was not found.
 */
export function updateScript(id: string, data: Partial<Omit<Script, "id" | "createdAt">>): Script | null {
  const scripts = getScripts();
  const idx = scripts.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated: Script = {
    ...scripts[idx],
    ...data,
    id,
    createdAt: scripts[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  scripts[idx] = updated;
  writeJSON(KEYS.scripts, scripts);
  if (import.meta.env.DEV) {
    log({ category: "storage", action: "video:storage:script:write", data: { scriptId: id, op: "update" } });
  }
  return updated;
}

/**
 * Delete a script by ID. Returns true if deleted, false if not found.
 */
export function deleteScript(id: string): boolean {
  const scripts = getScripts();
  const filtered = scripts.filter((s) => s.id !== id);
  if (filtered.length === scripts.length) return false;
  writeJSON(KEYS.scripts, filtered);
  if (import.meta.env.DEV) {
    log({ category: "storage", action: "video:storage:script:write", data: { scriptId: id, op: "delete" } });
  }
  return true;
}

/**
 * Return all scripts sorted by updatedAt descending (most recently updated first).
 */
export function listScripts(): Script[] {
  return getScripts().slice().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

// ─── Global Templates ─────────────────────────────────────────────────────────

function getGlobalTemplatesRaw(): GlobalTemplate[] {
  const raw = readJSON<GlobalTemplate[]>(KEYS.globalTemplates) ?? [];
  // Strip legacy `category` field from existing global templates.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return raw.map((t: any) => ({
    name: t.name as string,
    value: t.value as string,
    global: true as const,
  }));
}

/**
 * Create a new global template. Returns the stored template.
 */
export function createGlobalTemplate(
  data: Omit<GlobalTemplate, "global">
): GlobalTemplate {
  const template: GlobalTemplate = { ...data, global: true };
  const templates = getGlobalTemplatesRaw();
  // Prevent duplicate names — overwrite if already exists.
  const existing = templates.findIndex((t) => t.name === data.name);
  if (existing !== -1) {
    templates[existing] = template;
  } else {
    templates.push(template);
  }
  writeJSON(KEYS.globalTemplates, templates);
  if (import.meta.env.DEV) {
    log({ category: "storage", action: "video:storage:template:write", data: { name: template.name, op: "create", global: true } });
  }
  return template;
}

/**
 * Return all global templates in insertion order.
 */
export function listGlobalTemplates(): GlobalTemplate[] {
  return getGlobalTemplatesRaw();
}

/**
 * Update a global template identified by `name`.
 * Returns the updated template or null if not found.
 */
export function updateGlobalTemplate(
  name: string,
  data: Partial<Omit<GlobalTemplate, "name" | "global">>
): GlobalTemplate | null {
  const templates = getGlobalTemplatesRaw();
  const idx = templates.findIndex((t) => t.name === name);
  if (idx === -1) return null;
  const updated: GlobalTemplate = { ...templates[idx], ...data, name, global: true };
  templates[idx] = updated;
  writeJSON(KEYS.globalTemplates, templates);
  if (import.meta.env.DEV) {
    log({ category: "storage", action: "video:storage:template:write", data: { name, op: "update", global: true } });
  }
  return updated;
}

/**
 * Delete a global template by name. Returns true if deleted, false if not found.
 */
export function deleteGlobalTemplate(name: string): boolean {
  const templates = getGlobalTemplatesRaw();
  const filtered = templates.filter((t) => t.name !== name);
  if (filtered.length === templates.length) return false;
  writeJSON(KEYS.globalTemplates, filtered);
  if (import.meta.env.DEV) {
    log({ category: "storage", action: "video:storage:template:write", data: { name, op: "delete", global: true } });
  }
  return true;
}

// ─── Reset ────────────────────────────────────────────────────────────────────

/**
 * Remove all song-builder:video-* localStorage keys.
 */
export function resetVideoStorage(): void {
  const prefix = "song-builder:video-";
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

// ─── Convenience object ───────────────────────────────────────────────────────

export const videoStorageService = {
  // Scripts
  createScript,
  getScript,
  updateScript,
  deleteScript,
  listScripts,
  // Global templates
  createGlobalTemplate,
  listGlobalTemplates,
  updateGlobalTemplate,
  deleteGlobalTemplate,
  // Reset
  reset: resetVideoStorage,
};
