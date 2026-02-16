import type {
  ImageSession,
  ImageGeneration,
  ImageItem,
  ImageSettings,
  ImageStorageExport,
} from "./types";
import { emitQuotaExceeded } from "@/shared/lib/storageQuotaEvents";

const KEYS = {
  sessions: "song-builder:image-sessions",
  generations: "song-builder:image-generations",
  items: "song-builder:image-items",
  settings: "song-builder:image-settings",
} as const;

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

// ─── Sessions ────────────────────────────────────────────────────────────────

function getSessions(): ImageSession[] {
  return readJSON<ImageSession[]>(KEYS.sessions) ?? [];
}

function getSession(id: string): ImageSession | null {
  return getSessions().find((s) => s.id === id) ?? null;
}

function listSessions(): ImageSession[] {
  return getSessions().filter((s) => !s.deleted);
}

function deleteSession(id: string): boolean {
  const sessions = getSessions();
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  sessions[idx] = { ...sessions[idx], deleted: true };
  writeJSON(KEYS.sessions, sessions);
  return true;
}

function createSession(prompt: string): ImageSession {
  const title = prompt.slice(0, 60);
  const session: ImageSession = {
    id: generateId(),
    title,
    prompt,
    createdAt: new Date().toISOString(),
  };
  const sessions = getSessions();
  writeJSON(KEYS.sessions, [...sessions, session]);
  return session;
}

// ─── Generations ─────────────────────────────────────────────────────────────

function getGenerations(): ImageGeneration[] {
  return readJSON<ImageGeneration[]>(KEYS.generations) ?? [];
}

function getGenerationsBySession(sessionId: string): ImageGeneration[] {
  return getGenerations().filter((g) => g.sessionId === sessionId);
}

function createGeneration(
  data: Omit<ImageGeneration, "id" | "stepId" | "createdAt">
): ImageGeneration {
  const existing = getGenerationsBySession(data.sessionId);
  const maxStepId = existing.reduce((max, g) => Math.max(max, g.stepId), 0);
  const generation: ImageGeneration = {
    ...data,
    id: generateId(),
    stepId: maxStepId + 1,
    createdAt: new Date().toISOString(),
  };
  const generations = getGenerations();
  writeJSON(KEYS.generations, [...generations, generation]);
  return generation;
}

// ─── Items ────────────────────────────────────────────────────────────────────

function getItems(): ImageItem[] {
  return readJSON<ImageItem[]>(KEYS.items) ?? [];
}

function getItem(id: string): ImageItem | null {
  return getItems().find((i) => i.id === id) ?? null;
}

function listItemsByGeneration(generationId: string): ImageItem[] {
  return getItems().filter((i) => i.generationId === generationId);
}

function listItemsBySession(sessionId: string): ImageItem[] {
  const generationIds = new Set(
    getGenerationsBySession(sessionId).map((g) => g.id)
  );
  return getItems().filter((i) => generationIds.has(i.generationId));
}

function createItem(data: Omit<ImageItem, "id" | "pinned" | "deleted" | "createdAt">): ImageItem {
  const item: ImageItem = {
    ...data,
    id: generateId(),
    pinned: false,
    deleted: false,
    createdAt: new Date().toISOString(),
  };
  const items = getItems();
  writeJSON(KEYS.items, [...items, item]);
  return item;
}

function updateItem(
  id: string,
  data: Partial<Omit<ImageItem, "id" | "createdAt">>
): ImageItem | null {
  const items = getItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const updated: ImageItem = { ...items[idx], ...data };
  items[idx] = updated;
  writeJSON(KEYS.items, items);
  return updated;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getImageSettings(): ImageSettings | null {
  return readJSON<ImageSettings>(KEYS.settings);
}

export function saveImageSettings(settings: ImageSettings): void {
  writeJSON(KEYS.settings, settings);
}

// ─── Reset ────────────────────────────────────────────────────────────────────

/**
 * Remove all song-builder:image-* localStorage keys.
 */
export function resetImageStorage(): void {
  const prefix = "song-builder:image-";
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

// ─── Import / Export ──────────────────────────────────────────────────────────

export function exportImageStorage(): ImageStorageExport {
  return {
    sessions: getSessions(),
    generations: getGenerations(),
    items: getItems(),
    settings: getImageSettings(),
  };
}

export function importImageStorage(data: ImageStorageExport): void {
  if (Array.isArray(data.sessions)) {
    writeJSON(KEYS.sessions, data.sessions);
  }
  if (Array.isArray(data.generations)) {
    writeJSON(KEYS.generations, data.generations);
  }
  if (Array.isArray(data.items)) {
    writeJSON(KEYS.items, data.items);
  }
  if (data.settings !== null && data.settings !== undefined) {
    writeJSON(KEYS.settings, data.settings);
  }
}

// ─── Convenience object ───────────────────────────────────────────────────────

export const imageStorageService = {
  // Sessions
  createSession,
  getSession,
  listSessions,
  deleteSession,
  // Generations
  createGeneration,
  getGenerationsBySession,
  // Items
  createItem,
  getItem,
  listItemsByGeneration,
  listItemsBySession,
  updateItem,
  // Settings
  getImageSettings,
  saveImageSettings,
  // Import / Export
  export: exportImageStorage,
  import: importImageStorage,
  // Reset
  reset: resetImageStorage,
};
