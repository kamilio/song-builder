/**
 * Typed fixture data for Playwright tests.
 *
 * All fixtures are in the StorageExport format — the same format produced by
 * storageService.export() and consumed by storageService.import(). This ensures
 * that test state flows through the exact same code path as real user imports.
 */

import type { StorageExport } from "../src/lib/storage/types";

/** Empty state: no settings, no entries, no songs. */
export const emptyFixture: StorageExport = {
  settings: null,
  lyricsEntries: [],
  songs: [],
};

/** A fixture with one complete lyrics entry and one song, suitable for most feature tests. */
export const baseFixture: StorageExport = {
  settings: {
    poeApiKey: "test-poe-api-key",
    numSongs: 3,
  },
  lyricsEntries: [
    {
      id: "fixture-entry-1",
      title: "Coffee Dreams",
      style: "upbeat pop",
      commentary: "A cheerful song about the morning ritual of coffee.",
      body: [
        "Wake up to the smell of something brewing",
        "Golden liquid dreams in my cup",
        "Every sip a moment worth pursuing",
        "Coffee gets me up",
      ].join("\n"),
      chatHistory: [
        {
          role: "user",
          content: "Write a short pop song about coffee",
        },
        {
          role: "assistant",
          content: [
            "---",
            "title: Coffee Dreams",
            "style: upbeat pop",
            "commentary: A cheerful song about the morning ritual of coffee.",
            "---",
            "Wake up to the smell of something brewing",
            "Golden liquid dreams in my cup",
            "Every sip a moment worth pursuing",
            "Coffee gets me up",
          ].join("\n"),
        },
      ],
      createdAt: "2026-01-01T08:00:00.000Z",
      updatedAt: "2026-01-01T08:05:00.000Z",
      deleted: false,
    },
  ],
  songs: [
    {
      id: "fixture-song-1",
      lyricsEntryId: "fixture-entry-1",
      title: "Coffee Dreams (Take 1)",
      audioUrl: "https://example.com/fixture-audio-1.mp3",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-01T08:10:00.000Z",
    },
  ],
};

/** A fixture with a pinned song, for testing the Pinned Songs page. */
export const pinnedFixture: StorageExport = {
  settings: {
    poeApiKey: "test-poe-api-key",
    numSongs: 3,
  },
  lyricsEntries: [
    {
      id: "fixture-entry-pinned",
      title: "Pinned Anthem",
      style: "rock",
      commentary: "A rock anthem worth pinning.",
      body: "We rise, we fall, we rise again",
      chatHistory: [],
      createdAt: "2026-01-02T10:00:00.000Z",
      updatedAt: "2026-01-02T10:00:00.000Z",
      deleted: false,
    },
  ],
  songs: [
    {
      id: "fixture-song-pinned-1",
      lyricsEntryId: "fixture-entry-pinned",
      title: "Pinned Anthem (Take 1)",
      audioUrl: "https://example.com/fixture-pinned-1.mp3",
      pinned: true,
      deleted: false,
      createdAt: "2026-01-02T10:05:00.000Z",
    },
    {
      id: "fixture-song-pinned-2",
      lyricsEntryId: "fixture-entry-pinned",
      title: "Pinned Anthem (Take 2)",
      audioUrl: "https://example.com/fixture-pinned-2.mp3",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-02T10:06:00.000Z",
    },
  ],
};

/** A fixture without an API key, for testing the API-key-missing modal. */
export const noApiKeyFixture: StorageExport = {
  settings: {
    poeApiKey: "",
    numSongs: 3,
  },
  lyricsEntries: [
    {
      id: "fixture-entry-nokey",
      title: "Keyless Wonder",
      style: "jazz",
      commentary: "A jazz piece with no API key set.",
      body: "Notes in the air, keys not there",
      chatHistory: [],
      createdAt: "2026-01-03T09:00:00.000Z",
      updatedAt: "2026-01-03T09:00:00.000Z",
      deleted: false,
    },
  ],
  songs: [],
};

/** A fixture for the Song Generator page with a lyrics entry and pre-existing songs. */
export const songGeneratorFixture: StorageExport = {
  settings: {
    poeApiKey: "test-poe-api-key",
    numSongs: 3,
  },
  lyricsEntries: [
    {
      id: "fixture-entry-songs",
      title: "Sunday Gold",
      style: "indie folk",
      commentary: "A warm, reflective song about lazy Sunday mornings.",
      body: [
        "Golden light through curtain lace",
        "Coffee cooling in its place",
        "Sunday holds us soft and slow",
        "Nowhere we need to go",
      ].join("\n"),
      chatHistory: [],
      createdAt: "2026-01-05T09:00:00.000Z",
      updatedAt: "2026-01-05T09:00:00.000Z",
      deleted: false,
    },
  ],
  songs: [
    {
      id: "fixture-song-gen-1",
      lyricsEntryId: "fixture-entry-songs",
      title: "Sunday Gold (Take 1)",
      audioUrl:
        "https://pfst.cf2.poecdn.net/base/audio/0d80fec33b1948741959d66bafe06da54553bfd28fb6409aac588255cc4f2714",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-05T09:05:00.000Z",
    },
    {
      id: "fixture-song-gen-2",
      lyricsEntryId: "fixture-entry-songs",
      title: "Sunday Gold (Take 2)",
      audioUrl:
        "https://pfst.cf2.poecdn.net/base/audio/0d80fec33b1948741959d66bafe06da54553bfd28fb6409aac588255cc4f2714",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-05T09:06:00.000Z",
    },
    {
      id: "fixture-song-gen-3",
      lyricsEntryId: "fixture-entry-songs",
      title: "Sunday Gold (Take 3)",
      audioUrl:
        "https://pfst.cf2.poecdn.net/base/audio/0d80fec33b1948741959d66bafe06da54553bfd28fb6409aac588255cc4f2714",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-05T09:07:00.000Z",
    },
  ],
};

/**
 * A fixture with a multi-turn chat history (3 user/assistant exchanges).
 * Used for: checkpoint navigation, chat history display, LyricsItem card rendering.
 */
export const multiMessageFixture: StorageExport = {
  settings: {
    poeApiKey: "test-poe-api-key",
    numSongs: 3,
  },
  lyricsEntries: [
    {
      id: "fixture-multi-msg-1",
      title: "Neon Rain",
      style: "synthwave, dark, driving beat",
      commentary: "Third iteration of a city-at-night concept.",
      body: [
        "Neon rain falls on the empty street",
        "Echoes swallowed by the city beat",
        "Headlights blur through the wet black glass",
        "Every moment too electric to last",
      ].join("\n"),
      chatHistory: [
        { role: "user", content: "Write a synthwave song about a rainy city night" },
        {
          role: "assistant",
          content: [
            "---",
            "title: City Pulse",
            "style: synthwave",
            "commentary: First draft, establishing the mood.",
            "---",
            "Pulse beneath the sodium glow",
            "Rain-slicked streets and radio",
          ].join("\n"),
        },
        { role: "user", content: "Make it darker and more cinematic" },
        {
          role: "assistant",
          content: [
            "---",
            "title: Dark Frequency",
            "style: synthwave, cinematic",
            "commentary: Darker tone, added tension.",
            "---",
            "Shadows bleed through chrome and wire",
            "The city hums its low desire",
          ].join("\n"),
        },
        { role: "user", content: "Add a neon rain motif throughout" },
        {
          role: "assistant",
          content: [
            "---",
            "title: Neon Rain",
            "style: synthwave, dark, driving beat",
            "commentary: Third iteration of a city-at-night concept.",
            "---",
            "Neon rain falls on the empty street",
            "Echoes swallowed by the city beat",
            "Headlights blur through the wet black glass",
            "Every moment too electric to last",
          ].join("\n"),
        },
      ],
      createdAt: "2026-01-06T20:00:00.000Z",
      updatedAt: "2026-01-06T20:15:00.000Z",
      deleted: false,
    },
  ],
  songs: [],
};

/**
 * A fixture with a mix of deleted and non-deleted songs on the same entry.
 * Used for: soft-delete song flow (Flow 11), confirming deleted songs are hidden.
 */
export const deletedSongFixture: StorageExport = {
  settings: {
    poeApiKey: "test-poe-api-key",
    numSongs: 3,
  },
  lyricsEntries: [
    {
      id: "fixture-entry-deleted-song",
      title: "Faded Signal",
      style: "ambient electronic",
      commentary: "A drifting ambient piece.",
      body: "Signal lost in the static haze",
      chatHistory: [],
      createdAt: "2026-01-07T14:00:00.000Z",
      updatedAt: "2026-01-07T14:00:00.000Z",
      deleted: false,
    },
  ],
  songs: [
    {
      id: "fixture-song-deleted-1",
      lyricsEntryId: "fixture-entry-deleted-song",
      title: "Faded Signal (Take 1)",
      audioUrl: "https://example.com/faded-1.mp3",
      pinned: false,
      deleted: true, // already soft-deleted
      createdAt: "2026-01-07T14:05:00.000Z",
    },
    {
      id: "fixture-song-deleted-2",
      lyricsEntryId: "fixture-entry-deleted-song",
      title: "Faded Signal (Take 2)",
      audioUrl: "https://example.com/faded-2.mp3",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-07T14:06:00.000Z",
    },
    {
      id: "fixture-song-deleted-3",
      lyricsEntryId: "fixture-entry-deleted-song",
      title: "Faded Signal (Take 3)",
      audioUrl: "https://example.com/faded-3.mp3",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-07T14:07:00.000Z",
    },
  ],
};

/**
 * A comprehensive fixture combining multiple entries, multi-turn history,
 * pinned songs, deleted songs, and a no-songs entry.
 * Used for: full-flow MCP QA runs that need realistic mixed state.
 */
export const fullFixture: StorageExport = {
  settings: {
    poeApiKey: "test-poe-api-key",
    numSongs: 3,
  },
  lyricsEntries: [
    {
      id: "fixture-full-entry-1",
      title: "Morning Pop",
      style: "pop, upbeat",
      commentary: "A bright pop song for mornings.",
      body: "Rise and shine, the day is mine\nCoffee in hand, feeling fine",
      chatHistory: [
        { role: "user", content: "Write a morning pop song" },
        {
          role: "assistant",
          content: [
            "---",
            "title: Morning Pop",
            "style: pop, upbeat",
            "commentary: A bright pop song for mornings.",
            "---",
            "Rise and shine, the day is mine",
            "Coffee in hand, feeling fine",
          ].join("\n"),
        },
      ],
      createdAt: "2026-01-08T07:00:00.000Z",
      updatedAt: "2026-01-08T07:05:00.000Z",
      deleted: false,
    },
    {
      id: "fixture-full-entry-2",
      title: "Midnight Jazz",
      style: "jazz, late night",
      commentary: "Smooth late-night jazz.",
      body: "Notes drift through the smoke and blue",
      chatHistory: [
        { role: "user", content: "Write a late-night jazz song" },
        {
          role: "assistant",
          content: [
            "---",
            "title: Midnight Jazz",
            "style: jazz, late night",
            "commentary: Smooth late-night jazz.",
            "---",
            "Notes drift through the smoke and blue",
          ].join("\n"),
        },
        { role: "user", content: "Add a trumpet solo section" },
        {
          role: "assistant",
          content: [
            "---",
            "title: Midnight Jazz",
            "style: jazz, late night, trumpet",
            "commentary: Added trumpet solo bridge.",
            "---",
            "Notes drift through the smoke and blue",
            "[Trumpet Solo]",
            "High and lonesome, cutting through",
          ].join("\n"),
        },
      ],
      createdAt: "2026-01-08T23:00:00.000Z",
      updatedAt: "2026-01-08T23:10:00.000Z",
      deleted: false,
    },
    {
      id: "fixture-full-entry-3",
      title: "Deleted Draft",
      style: "rock",
      commentary: "A scrapped draft.",
      body: "Riff that never made it out",
      chatHistory: [],
      createdAt: "2026-01-08T12:00:00.000Z",
      updatedAt: "2026-01-08T12:01:00.000Z",
      deleted: true,
    },
  ],
  songs: [
    {
      id: "fixture-full-song-1",
      lyricsEntryId: "fixture-full-entry-1",
      title: "Morning Pop (Take 1)",
      audioUrl: "https://example.com/morning-pop-1.mp3",
      pinned: true,
      deleted: false,
      createdAt: "2026-01-08T07:10:00.000Z",
    },
    {
      id: "fixture-full-song-2",
      lyricsEntryId: "fixture-full-entry-1",
      title: "Morning Pop (Take 2)",
      audioUrl: "https://example.com/morning-pop-2.mp3",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-08T07:11:00.000Z",
    },
    {
      id: "fixture-full-song-3",
      lyricsEntryId: "fixture-full-entry-1",
      title: "Morning Pop (Take 3)",
      audioUrl: "https://example.com/morning-pop-3.mp3",
      pinned: false,
      deleted: true, // soft-deleted
      createdAt: "2026-01-08T07:12:00.000Z",
    },
    {
      id: "fixture-full-song-4",
      lyricsEntryId: "fixture-full-entry-2",
      title: "Midnight Jazz (Take 1)",
      audioUrl: "https://example.com/midnight-jazz-1.mp3",
      pinned: false,
      deleted: false,
      createdAt: "2026-01-08T23:15:00.000Z",
    },
  ],
};

/** A fixture with multiple lyrics entries, for testing the Lyrics List page. */
export const multiEntryFixture: StorageExport = {
  settings: {
    poeApiKey: "test-poe-api-key",
    numSongs: 3,
  },
  lyricsEntries: [
    {
      id: "fixture-multi-entry-1",
      title: "Morning Pop",
      style: "pop",
      commentary: "A pop song for the morning.",
      body: "Rise and shine, the day is mine",
      chatHistory: [],
      createdAt: "2026-01-04T07:00:00.000Z",
      updatedAt: "2026-01-04T07:00:00.000Z",
      deleted: false,
    },
    {
      id: "fixture-multi-entry-2",
      title: "Midnight Jazz",
      style: "jazz",
      commentary: "A jazz tune for late nights.",
      body: "Smooth notes drift through the dark",
      chatHistory: [],
      createdAt: "2026-01-04T23:00:00.000Z",
      updatedAt: "2026-01-04T23:00:00.000Z",
      deleted: false,
    },
    {
      id: "fixture-multi-entry-3",
      title: "Deleted Entry",
      style: "blues",
      commentary: "This entry was soft-deleted.",
      body: "Gone but not forgotten",
      chatHistory: [],
      createdAt: "2026-01-04T12:00:00.000Z",
      updatedAt: "2026-01-04T12:01:00.000Z",
      deleted: true,
    },
  ],
  songs: [],
};
