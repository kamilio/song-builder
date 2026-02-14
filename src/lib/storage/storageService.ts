import type { Settings, LyricsEntry, Song, StorageExport } from "./types";

const KEYS = {
  settings: "song-builder:settings",
  lyricsEntries: "song-builder:lyrics-entries",
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

// ─── LyricsEntry ─────────────────────────────────────────────────────────────

export function getLyricsEntries(): LyricsEntry[] {
  return readJSON<LyricsEntry[]>(KEYS.lyricsEntries) ?? [];
}

export function getLyricsEntry(id: string): LyricsEntry | null {
  return getLyricsEntries().find((e) => e.id === id) ?? null;
}

export function createLyricsEntry(
  data: Omit<LyricsEntry, "id" | "createdAt" | "updatedAt" | "deleted">
): LyricsEntry {
  const now = new Date().toISOString();
  const entry: LyricsEntry = {
    ...data,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
  const entries = getLyricsEntries();
  writeJSON(KEYS.lyricsEntries, [...entries, entry]);
  return entry;
}

export function updateLyricsEntry(
  id: string,
  data: Partial<Omit<LyricsEntry, "id" | "createdAt">>
): LyricsEntry | null {
  const entries = getLyricsEntries();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const updated: LyricsEntry = {
    ...entries[idx],
    ...data,
    updatedAt: new Date().toISOString(),
  };
  entries[idx] = updated;
  writeJSON(KEYS.lyricsEntries, entries);
  return updated;
}

export function deleteLyricsEntry(id: string): boolean {
  const result = updateLyricsEntry(id, { deleted: true });
  return result !== null;
}

// ─── Song ─────────────────────────────────────────────────────────────────────

export function getSongs(): Song[] {
  return readJSON<Song[]>(KEYS.songs) ?? [];
}

export function getSong(id: string): Song | null {
  return getSongs().find((s) => s.id === id) ?? null;
}

export function getSongsByLyricsEntry(lyricsEntryId: string): Song[] {
  return getSongs().filter((s) => s.lyricsEntryId === lyricsEntryId);
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

// ─── Import / Export ──────────────────────────────────────────────────────────

export function exportStorage(): StorageExport {
  return {
    settings: getSettings(),
    lyricsEntries: getLyricsEntries(),
    songs: getSongs(),
  };
}

export function importStorage(data: StorageExport): void {
  if (data.settings !== null && data.settings !== undefined) {
    writeJSON(KEYS.settings, data.settings);
  }
  if (Array.isArray(data.lyricsEntries)) {
    writeJSON(KEYS.lyricsEntries, data.lyricsEntries);
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
  // LyricsEntry
  getLyricsEntries,
  getLyricsEntry,
  createLyricsEntry,
  updateLyricsEntry,
  deleteLyricsEntry,
  // Song
  getSongs,
  getSong,
  getSongsByLyricsEntry,
  createSong,
  updateSong,
  deleteSong,
  pinSong,
  // Import / Export
  export: exportStorage,
  import: importStorage,
};
