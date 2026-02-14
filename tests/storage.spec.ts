import { test, expect } from "@playwright/test";
import type { LyricsEntry, Song, Settings, StorageExport } from "../src/lib/storage/types";

// Helper: navigate to the app and clear localStorage before each test
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

// ─── Settings ────────────────────────────────────────────────────────────────

test("Settings: round-trip save and read", async ({ page }) => {
  const settings: Settings = { poeApiKey: "test-key-123", numSongs: 5 };

  await page.evaluate((s) => {
    window.storageService.saveSettings(s);
  }, settings);

  const stored = await page.evaluate(() => window.storageService.getSettings());
  expect(stored).toEqual(settings);
});

test("Settings: getSettings returns null when not set", async ({ page }) => {
  const result = await page.evaluate(() => window.storageService.getSettings());
  expect(result).toBeNull();
});

// ─── LyricsEntry ─────────────────────────────────────────────────────────────

test("LyricsEntry: create and read", async ({ page }) => {
  const created = await page.evaluate(() => {
    return window.storageService.createLyricsEntry({
      title: "Test Song",
      style: "pop",
      commentary: "A test",
      body: "Verse one\nVerse two",
      chatHistory: [],
    });
  });

  expect(created.id).toBeTruthy();
  expect(created.title).toBe("Test Song");
  expect(created.deleted).toBe(false);

  const fetched = await page.evaluate((id) => {
    return window.storageService.getLyricsEntry(id);
  }, created.id);

  expect(fetched).toEqual(created);
});

test("LyricsEntry: update", async ({ page }) => {
  const created = await page.evaluate(() => {
    return window.storageService.createLyricsEntry({
      title: "Original",
      style: "rock",
      commentary: "",
      body: "Body",
      chatHistory: [],
    });
  });

  const updated = await page.evaluate((id) => {
    return window.storageService.updateLyricsEntry(id, { title: "Updated" });
  }, created.id);

  expect(updated?.title).toBe("Updated");
  expect(updated?.style).toBe("rock");
});

test("LyricsEntry: soft delete sets deleted flag", async ({ page }) => {
  const created = await page.evaluate(() => {
    return window.storageService.createLyricsEntry({
      title: "To Delete",
      style: "jazz",
      commentary: "",
      body: "Body",
      chatHistory: [],
    });
  });

  await page.evaluate((id) => {
    window.storageService.deleteLyricsEntry(id);
  }, created.id);

  const entry = await page.evaluate((id) => {
    return window.storageService.getLyricsEntry(id);
  }, created.id);

  expect(entry?.deleted).toBe(true);

  // Confirm the entry still exists in the list (soft delete, not hard delete)
  const allEntries = await page.evaluate(() => window.storageService.getLyricsEntries());
  const found = allEntries.find((e: LyricsEntry) => e.id === created.id);
  expect(found).toBeDefined();
});

test("LyricsEntry: getLyricsEntries returns all entries", async ({ page }) => {
  await page.evaluate(() => {
    window.storageService.createLyricsEntry({
      title: "Entry 1",
      style: "pop",
      commentary: "",
      body: "Body 1",
      chatHistory: [],
    });
    window.storageService.createLyricsEntry({
      title: "Entry 2",
      style: "rock",
      commentary: "",
      body: "Body 2",
      chatHistory: [],
    });
  });

  const entries = await page.evaluate(() => window.storageService.getLyricsEntries());
  expect(entries).toHaveLength(2);
});

// ─── Song ─────────────────────────────────────────────────────────────────────

test("Song: create and read", async ({ page }) => {
  const created = await page.evaluate(() => {
    return window.storageService.createSong({
      lyricsEntryId: "entry-1",
      title: "My Song",
      audioUrl: "https://example.com/audio.mp3",
    });
  });

  expect(created.id).toBeTruthy();
  expect(created.pinned).toBe(false);
  expect(created.deleted).toBe(false);

  const fetched = await page.evaluate((id) => {
    return window.storageService.getSong(id);
  }, created.id);

  expect(fetched).toEqual(created);
});

test("Song: soft delete sets deleted flag", async ({ page }) => {
  const created = await page.evaluate(() => {
    return window.storageService.createSong({
      lyricsEntryId: "entry-1",
      title: "Song to Delete",
      audioUrl: "https://example.com/audio.mp3",
    });
  });

  await page.evaluate((id) => {
    window.storageService.deleteSong(id);
  }, created.id);

  const song = await page.evaluate((id) => {
    return window.storageService.getSong(id);
  }, created.id);

  expect(song?.deleted).toBe(true);

  // Confirm the song still exists in the list (soft delete, not hard delete)
  const allSongs = await page.evaluate(() => window.storageService.getSongs());
  const found = allSongs.find((s: Song) => s.id === created.id);
  expect(found).toBeDefined();
});

test("Song: pin and unpin", async ({ page }) => {
  const created = await page.evaluate(() => {
    return window.storageService.createSong({
      lyricsEntryId: "entry-1",
      title: "Song to Pin",
      audioUrl: "https://example.com/audio.mp3",
    });
  });

  await page.evaluate((id) => {
    window.storageService.pinSong(id, true);
  }, created.id);

  let song = await page.evaluate((id) => window.storageService.getSong(id), created.id);
  expect(song?.pinned).toBe(true);

  await page.evaluate((id) => {
    window.storageService.pinSong(id, false);
  }, created.id);

  song = await page.evaluate((id) => window.storageService.getSong(id), created.id);
  expect(song?.pinned).toBe(false);
});

test("Song: getSongsByLyricsEntry filters correctly", async ({ page }) => {
  await page.evaluate(() => {
    window.storageService.createSong({
      lyricsEntryId: "entry-A",
      title: "Song A1",
      audioUrl: "https://example.com/a1.mp3",
    });
    window.storageService.createSong({
      lyricsEntryId: "entry-A",
      title: "Song A2",
      audioUrl: "https://example.com/a2.mp3",
    });
    window.storageService.createSong({
      lyricsEntryId: "entry-B",
      title: "Song B1",
      audioUrl: "https://example.com/b1.mp3",
    });
  });

  const entrySongs = await page.evaluate(() =>
    window.storageService.getSongsByLyricsEntry("entry-A")
  );
  expect(entrySongs).toHaveLength(2);
  expect(entrySongs.every((s: Song) => s.lyricsEntryId === "entry-A")).toBe(true);
});

// ─── Import / Export ──────────────────────────────────────────────────────────

test("export serializes all data", async ({ page }) => {
  await page.evaluate(() => {
    window.storageService.saveSettings({ poeApiKey: "export-key", numSongs: 3 });
    window.storageService.createLyricsEntry({
      title: "Export Entry",
      style: "classical",
      commentary: "Export test",
      body: "Body",
      chatHistory: [],
    });
    window.storageService.createSong({
      lyricsEntryId: "entry-1",
      title: "Export Song",
      audioUrl: "https://example.com/export.mp3",
    });
  });

  const exported = await page.evaluate(() => window.storageService.export());

  expect(exported.settings?.poeApiKey).toBe("export-key");
  expect(exported.lyricsEntries).toHaveLength(1);
  expect(exported.songs).toHaveLength(1);
});

test("import loads data into localStorage", async ({ page }) => {
  const fixture: StorageExport = {
    settings: { poeApiKey: "imported-key", numSongs: 7 },
    lyricsEntries: [
      {
        id: "imported-entry-1",
        title: "Imported Entry",
        style: "blues",
        commentary: "Imported commentary",
        body: "Imported body",
        chatHistory: [{ role: "user", content: "Hello" }],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deleted: false,
      },
    ],
    songs: [
      {
        id: "imported-song-1",
        lyricsEntryId: "imported-entry-1",
        title: "Imported Song",
        audioUrl: "https://example.com/imported.mp3",
        pinned: true,
        deleted: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };

  await page.evaluate((data) => {
    window.storageService.import(data);
  }, fixture);

  const settings = await page.evaluate(() => window.storageService.getSettings());
  expect(settings?.poeApiKey).toBe("imported-key");
  expect(settings?.numSongs).toBe(7);

  const entries = await page.evaluate(() => window.storageService.getLyricsEntries());
  expect(entries).toHaveLength(1);
  expect(entries[0].title).toBe("Imported Entry");
  expect(entries[0].chatHistory[0].content).toBe("Hello");

  const songs = await page.evaluate(() => window.storageService.getSongs());
  expect(songs).toHaveLength(1);
  expect(songs[0].pinned).toBe(true);
  expect(songs[0].audioUrl).toBe("https://example.com/imported.mp3");
});

test("export then import round-trip restores all data", async ({ page }) => {
  // Seed initial data
  await page.evaluate(() => {
    window.storageService.saveSettings({ poeApiKey: "roundtrip-key", numSongs: 4 });
    window.storageService.createLyricsEntry({
      title: "Round Trip Entry",
      style: "country",
      commentary: "Round trip test",
      body: "Round trip body",
      chatHistory: [],
    });
    window.storageService.createSong({
      lyricsEntryId: "rt-entry",
      title: "Round Trip Song",
      audioUrl: "https://example.com/rt.mp3",
    });
  });

  // Export current state
  const exported = await page.evaluate(() => window.storageService.export());

  // Clear localStorage and re-import
  await page.evaluate(() => localStorage.clear());

  const afterClear = await page.evaluate(() => window.storageService.export());
  expect(afterClear.settings).toBeNull();
  expect(afterClear.lyricsEntries).toHaveLength(0);

  // Import exported data
  await page.evaluate((data) => {
    window.storageService.import(data);
  }, exported);

  // Verify all data restored
  const restored = await page.evaluate(() => window.storageService.export());
  expect(restored.settings?.poeApiKey).toBe("roundtrip-key");
  expect(restored.settings?.numSongs).toBe(4);
  expect(restored.lyricsEntries).toHaveLength(1);
  expect(restored.lyricsEntries[0].title).toBe("Round Trip Entry");
  expect(restored.songs).toHaveLength(1);
  expect(restored.songs[0].title).toBe("Round Trip Song");
});
