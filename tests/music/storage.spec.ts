import { test, expect } from "@playwright/test";
import type { Message, Song, Settings, StorageExport } from "../src/music/lib/storage/types";

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

// ─── Message ─────────────────────────────────────────────────────────────────

test("Message: create and read", async ({ page }) => {
  const created = await page.evaluate(() => {
    return window.storageService.createMessage({
      role: "user",
      content: "Write a song about coffee",
      parentId: null,
    });
  });

  expect(created.id).toBeTruthy();
  expect(created.role).toBe("user");
  expect(created.parentId).toBeNull();
  expect(created.deleted).toBe(false);

  const fetched = await page.evaluate((id) => {
    return window.storageService.getMessage(id);
  }, created.id);

  expect(fetched).toEqual(created);
});

test("Message: create assistant message with lyrics fields", async ({ page }) => {
  const userMsg = await page.evaluate(() => {
    return window.storageService.createMessage({
      role: "user",
      content: "Write a pop song",
      parentId: null,
    });
  });

  const assistantMsg = await page.evaluate((parentId) => {
    return window.storageService.createMessage({
      role: "assistant",
      content: "Coffee Dreams lyrics here",
      parentId,
      title: "Coffee Dreams",
      style: "upbeat pop",
      commentary: "A cheerful coffee song.",
      lyricsBody: "Wake up to the smell of something brewing",
      duration: 180,
    });
  }, userMsg.id);

  expect(assistantMsg.role).toBe("assistant");
  expect(assistantMsg.parentId).toBe(userMsg.id);
  expect(assistantMsg.title).toBe("Coffee Dreams");
  expect(assistantMsg.style).toBe("upbeat pop");
  expect(assistantMsg.duration).toBe(180);
  expect(assistantMsg.deleted).toBe(false);
});

test("Message: update", async ({ page }) => {
  const created = await page.evaluate(() => {
    return window.storageService.createMessage({
      role: "assistant",
      content: "Original lyrics",
      parentId: null,
      title: "Original",
      style: "rock",
    });
  });

  const updated = await page.evaluate((id) => {
    return window.storageService.updateMessage(id, { title: "Updated Title" });
  }, created.id);

  expect(updated?.title).toBe("Updated Title");
  expect(updated?.style).toBe("rock");
});

test("Message: soft delete sets deleted flag", async ({ page }) => {
  const created = await page.evaluate(() => {
    return window.storageService.createMessage({
      role: "user",
      content: "To be deleted",
      parentId: null,
    });
  });

  await page.evaluate((id) => {
    window.storageService.updateMessage(id, { deleted: true });
  }, created.id);

  const msg = await page.evaluate((id) => {
    return window.storageService.getMessage(id);
  }, created.id);

  expect(msg?.deleted).toBe(true);

  // Confirm the message still exists in the list (soft delete, not hard delete)
  const allMessages = await page.evaluate(() => window.storageService.getMessages());
  const found = allMessages.find((m: Message) => m.id === created.id);
  expect(found).toBeDefined();
});

test("Message: getMessages returns all messages", async ({ page }) => {
  await page.evaluate(() => {
    window.storageService.createMessage({
      role: "user",
      content: "Message 1",
      parentId: null,
    });
    window.storageService.createMessage({
      role: "assistant",
      content: "Message 2",
      parentId: null,
    });
  });

  const messages = await page.evaluate(() => window.storageService.getMessages());
  expect(messages).toHaveLength(2);
});

test("Message: getAncestors returns root-first path", async ({ page }) => {
  // Build a 3-message chain: root → child → grandchild
  const root = await page.evaluate(() => {
    return window.storageService.createMessage({
      role: "user",
      content: "Root",
      parentId: null,
    });
  });

  const child = await page.evaluate((rootId) => {
    return window.storageService.createMessage({
      role: "assistant",
      content: "Child",
      parentId: rootId,
    });
  }, root.id);

  const grandchild = await page.evaluate((childId) => {
    return window.storageService.createMessage({
      role: "user",
      content: "Grandchild",
      parentId: childId,
    });
  }, child.id);

  // getAncestors(grandchild.id) should return [root, child, grandchild]
  const ancestors = await page.evaluate((id) => {
    return window.storageService.getAncestors(id);
  }, grandchild.id);

  expect(ancestors).toHaveLength(3);
  expect(ancestors[0].id).toBe(root.id);
  expect(ancestors[1].id).toBe(child.id);
  expect(ancestors[2].id).toBe(grandchild.id);
});

test("Message: getAncestors for root returns just the root", async ({ page }) => {
  const root = await page.evaluate(() => {
    return window.storageService.createMessage({
      role: "user",
      content: "Root only",
      parentId: null,
    });
  });

  const ancestors = await page.evaluate((id) => {
    return window.storageService.getAncestors(id);
  }, root.id);

  expect(ancestors).toHaveLength(1);
  expect(ancestors[0].id).toBe(root.id);
});

test("Message: getLatestLeaf returns the leaf with newest createdAt", async ({ page }) => {
  // Build a tree: root → child1, root → child2 (child2 is newer)
  const root = await page.evaluate(() => {
    return window.storageService.createMessage({
      role: "user",
      content: "Root",
      parentId: null,
    });
  });

  const child1 = await page.evaluate((rootId) => {
    return window.storageService.createMessage({
      role: "assistant",
      content: "Branch 1",
      parentId: rootId,
    });
  }, root.id);

  // child2 created slightly after child1
  await page.waitForTimeout(5);

  const child2 = await page.evaluate((rootId) => {
    return window.storageService.createMessage({
      role: "assistant",
      content: "Branch 2",
      parentId: rootId,
    });
  }, root.id);

  const latestLeaf = await page.evaluate((id) => {
    return window.storageService.getLatestLeaf(id);
  }, root.id);

  // child2 was created later so it is the latest leaf
  expect(latestLeaf?.id).toBe(child2.id);

  // Suppress "unused variable" — child1 is referenced via root, verifying branching
  expect(child1.parentId).toBe(root.id);
});

test("Message: getLatestLeaf returns the message itself when it has no children", async ({
  page,
}) => {
  const msg = await page.evaluate(() => {
    return window.storageService.createMessage({
      role: "user",
      content: "Leaf node",
      parentId: null,
    });
  });

  const latestLeaf = await page.evaluate((id) => {
    return window.storageService.getLatestLeaf(id);
  }, msg.id);

  expect(latestLeaf?.id).toBe(msg.id);
});

// ─── Song ─────────────────────────────────────────────────────────────────────

test("Song: create and read", async ({ page }) => {
  const created = await page.evaluate(() => {
    return window.storageService.createSong({
      messageId: "msg-1",
      title: "My Song",
      audioUrl: "https://example.com/audio.mp3",
    });
  });

  expect(created.id).toBeTruthy();
  expect(created.messageId).toBe("msg-1");
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
      messageId: "msg-1",
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
      messageId: "msg-1",
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

test("Song: getSongsByMessage filters correctly", async ({ page }) => {
  await page.evaluate(() => {
    window.storageService.createSong({
      messageId: "msg-A",
      title: "Song A1",
      audioUrl: "https://example.com/a1.mp3",
    });
    window.storageService.createSong({
      messageId: "msg-A",
      title: "Song A2",
      audioUrl: "https://example.com/a2.mp3",
    });
    window.storageService.createSong({
      messageId: "msg-B",
      title: "Song B1",
      audioUrl: "https://example.com/b1.mp3",
    });
  });

  const msgSongs = await page.evaluate(() =>
    window.storageService.getSongsByMessage("msg-A")
  );
  expect(msgSongs).toHaveLength(2);
  expect(msgSongs.every((s: Song) => s.messageId === "msg-A")).toBe(true);
});

// ─── Import / Export ──────────────────────────────────────────────────────────

test("export serializes all data", async ({ page }) => {
  await page.evaluate(() => {
    window.storageService.saveSettings({ poeApiKey: "export-key", numSongs: 3 });
    window.storageService.createMessage({
      role: "user",
      content: "Export test message",
      parentId: null,
    });
    window.storageService.createSong({
      messageId: "msg-1",
      title: "Export Song",
      audioUrl: "https://example.com/export.mp3",
    });
  });

  const exported = await page.evaluate(() => window.storageService.export());

  expect(exported.settings?.poeApiKey).toBe("export-key");
  expect(exported.messages).toHaveLength(1);
  expect(exported.songs).toHaveLength(1);
});

test("import loads data into localStorage", async ({ page }) => {
  const fixture: StorageExport = {
    settings: { poeApiKey: "imported-key", numSongs: 7 },
    messages: [
      {
        id: "imported-msg-1",
        role: "user",
        content: "Hello",
        parentId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        deleted: false,
      },
      {
        id: "imported-msg-2",
        role: "assistant",
        content: "Imported lyrics here",
        parentId: "imported-msg-1",
        title: "Imported Entry",
        style: "blues",
        commentary: "Imported commentary",
        lyricsBody: "Imported body",
        createdAt: "2026-01-01T00:01:00.000Z",
        deleted: false,
      },
    ],
    songs: [
      {
        id: "imported-song-1",
        messageId: "imported-msg-2",
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

  const messages = await page.evaluate(() => window.storageService.getMessages());
  expect(messages).toHaveLength(2);
  expect(messages[0].content).toBe("Hello");
  expect(messages[1].title).toBe("Imported Entry");

  const songs = await page.evaluate(() => window.storageService.getSongs());
  expect(songs).toHaveLength(1);
  expect(songs[0].pinned).toBe(true);
  expect(songs[0].audioUrl).toBe("https://example.com/imported.mp3");
});

test("export then import round-trip restores all data", async ({ page }) => {
  // Seed initial data
  await page.evaluate(() => {
    window.storageService.saveSettings({ poeApiKey: "roundtrip-key", numSongs: 4 });
    window.storageService.createMessage({
      role: "user",
      content: "Round trip message",
      parentId: null,
    });
    window.storageService.createSong({
      messageId: "rt-msg",
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
  expect(afterClear.messages).toHaveLength(0);

  // Import exported data
  await page.evaluate((data) => {
    window.storageService.import(data);
  }, exported);

  // Verify all data restored
  const restored = await page.evaluate(() => window.storageService.export());
  expect(restored.settings?.poeApiKey).toBe("roundtrip-key");
  expect(restored.settings?.numSongs).toBe(4);
  expect(restored.messages).toHaveLength(1);
  expect(restored.messages[0].content).toBe("Round trip message");
  expect(restored.songs).toHaveLength(1);
  expect(restored.songs[0].title).toBe("Round Trip Song");
});
