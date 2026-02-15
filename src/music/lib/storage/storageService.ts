import type { Settings, Message, Song, StorageExport } from "./types";

const KEYS = {
  settings: "song-builder:settings",
  messages: "song-builder:messages",
  songs: "song-builder:songs",
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
  localStorage.setItem(key, JSON.stringify(value));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getSettings(): Settings | null {
  return readJSON<Settings>(KEYS.settings);
}

export function saveSettings(settings: Settings): void {
  writeJSON(KEYS.settings, settings);
}

// ─── Message ─────────────────────────────────────────────────────────────────

export function getMessages(): Message[] {
  return readJSON<Message[]>(KEYS.messages) ?? [];
}

export function getMessage(id: string): Message | null {
  return getMessages().find((m) => m.id === id) ?? null;
}

export function createMessage(
  data: Omit<Message, "id" | "createdAt" | "deleted">
): Message {
  const message: Message = {
    ...data,
    id: generateId(),
    createdAt: new Date().toISOString(),
    deleted: false,
  };
  const messages = getMessages();
  writeJSON(KEYS.messages, [...messages, message]);
  return message;
}

export function updateMessage(
  id: string,
  data: Partial<Omit<Message, "id" | "createdAt">>
): Message | null {
  const messages = getMessages();
  const idx = messages.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  const updated: Message = { ...messages[idx], ...data };
  messages[idx] = updated;
  writeJSON(KEYS.messages, messages);
  return updated;
}

/**
 * Walk parentId links from the given messageId up to the root.
 * Returns the path in root-first order: [root, ..., messageId].
 * Handles cycles/orphans gracefully by stopping when no parent is found.
 */
export function getAncestors(messageId: string): Message[] {
  const messages = getMessages();
  const byId = new Map(messages.map((m) => [m.id, m]));

  const path: Message[] = [];
  const visited = new Set<string>();
  let current = byId.get(messageId);

  while (current) {
    if (visited.has(current.id)) break; // cycle guard
    visited.add(current.id);
    path.unshift(current);
    if (current.parentId === null) break;
    current = byId.get(current.parentId);
  }

  return path;
}

/**
 * Find the most recently created leaf descendant of the given messageId.
 * A leaf is a message that has no children.
 * Returns the message itself if it has no descendants.
 */
export function getLatestLeaf(messageId: string): Message | null {
  const messages = getMessages();
  const byId = new Map(messages.map((m) => [m.id, m]));
  const root = byId.get(messageId);
  if (!root) return null;

  // Build children index
  const children = new Map<string, Message[]>();
  for (const m of messages) {
    if (m.parentId !== null) {
      const list = children.get(m.parentId) ?? [];
      list.push(m);
      children.set(m.parentId, list);
    }
  }

  // DFS to collect all descendants; track the latest leaf
  let latestLeaf: Message = root;
  const stack: Message[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const kids = children.get(node.id) ?? [];
    if (kids.length === 0) {
      // leaf node — compare by createdAt
      if (node.createdAt > latestLeaf.createdAt) {
        latestLeaf = node;
      }
    } else {
      stack.push(...kids);
    }
  }

  return latestLeaf;
}

// ─── Song ─────────────────────────────────────────────────────────────────────

export function getSongs(): Song[] {
  return readJSON<Song[]>(KEYS.songs) ?? [];
}

export function getSong(id: string): Song | null {
  return getSongs().find((s) => s.id === id) ?? null;
}

export function getSongsByMessage(messageId: string): Song[] {
  return getSongs().filter((s) => s.messageId === messageId);
}

export function createSong(
  data: Omit<Song, "id" | "createdAt" | "deleted" | "pinned">
): Song {
  const song: Song = {
    ...data,
    id: generateId(),
    createdAt: new Date().toISOString(),
    pinned: false,
    deleted: false,
  };
  const songs = getSongs();
  writeJSON(KEYS.songs, [...songs, song]);
  return song;
}

export function updateSong(
  id: string,
  data: Partial<Omit<Song, "id" | "createdAt">>
): Song | null {
  const songs = getSongs();
  const idx = songs.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated: Song = { ...songs[idx], ...data };
  songs[idx] = updated;
  writeJSON(KEYS.songs, songs);
  return updated;
}

export function deleteSong(id: string): boolean {
  const result = updateSong(id, { deleted: true });
  return result !== null;
}

export function pinSong(id: string, pinned: boolean): boolean {
  const result = updateSong(id, { pinned });
  return result !== null;
}

// ─── Reset ────────────────────────────────────────────────────────────────────

/**
 * Wipe all app-owned localStorage keys.
 * Equivalent to localStorage.clear() scoped to the known keys.
 */
export function resetStorage(): void {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
}

// ─── Import / Export ──────────────────────────────────────────────────────────

export function exportStorage(): StorageExport {
  return {
    settings: getSettings(),
    messages: getMessages(),
    songs: getSongs(),
  };
}

export function importStorage(data: StorageExport): void {
  if (data.settings !== null && data.settings !== undefined) {
    writeJSON(KEYS.settings, data.settings);
  }
  if (Array.isArray(data.messages)) {
    writeJSON(KEYS.messages, data.messages);
  }
  if (Array.isArray(data.songs)) {
    writeJSON(KEYS.songs, data.songs);
  }
}

// ─── Convenience re-export ────────────────────────────────────────────────────

export const storageService = {
  // Settings
  getSettings,
  saveSettings,
  // Message
  getMessages,
  getMessage,
  createMessage,
  updateMessage,
  getAncestors,
  getLatestLeaf,
  // Song
  getSongs,
  getSong,
  getSongsByMessage,
  createSong,
  updateSong,
  deleteSong,
  pinSong,
  // Import / Export
  export: exportStorage,
  import: importStorage,
  // Reset
  reset: resetStorage,
};
