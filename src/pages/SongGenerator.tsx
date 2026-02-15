/**
 * SongGenerator page (US-008).
 *
 * Route: /lyrics/:messageId/songs
 * Also accepts legacy /songs?messageId=... query param for backwards compat.
 *
 * Reads the messageId to determine which assistant message (lyrics version) to
 * generate songs for. Triggers N parallel calls to llmClient.generateSong()
 * where N comes from settings.numSongs (default 3).
 *
 * music_length_ms is derived from message.duration * 1000 so the generated
 * audio matches the intended duration set in the Lyrics Editor.
 *
 * State model: Map<songId, SongState> so that each card update only touches
 * its own entry — sibling cards are not re-rendered when one slot completes
 * (React.memo ensures this guarantee at the component level).
 *
 * Stable song IDs are pre-generated (crypto.randomUUID) before any async work
 * begins, giving each Map entry a stable key for the lifetime of the request.
 *
 * Per-song actions: Pin, Delete, Download.
 */

import { memo, useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Zap, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiKeyMissingModal } from "@/components/ApiKeyMissingModal";
import { useApiKeyGuard } from "@/hooks/useApiKeyGuard";
import {
  getMessage,
  getSettings,
  getSongsByMessage,
  createSong,
  deleteSong,
  pinSong,
} from "@/lib/storage/storageService";
import type { Message, Song } from "@/lib/storage/types";
import { createLLMClient } from "@/lib/llm/factory";
import { log } from "@/lib/actionLog";

/** Build the style prompt sent to ElevenLabs from a message's lyrics fields. */
function buildStylePrompt(message: Message): string {
  const parts: string[] = [];
  if (message.title) parts.push(`Title: ${message.title}`);
  if (message.style) parts.push(`Style: ${message.style}`);
  if (message.commentary) parts.push(`Commentary: ${message.commentary}`);
  if (message.lyricsBody) parts.push(`\nLyrics:\n${message.lyricsBody}`);
  return parts.join("\n");
}

/** State for a single in-progress or completed song generation slot. */
interface SongState {
  /** Whether this slot is still awaiting a response. */
  loading: boolean;
  /** The persisted Song record once the response arrives; null while loading. */
  song: Song | null;
  /** Error message if generation failed for this slot. */
  error: string | null;
}

export default function SongGenerator() {
  // Support both /lyrics/:id/songs (route param) and /songs?messageId=... (legacy query param).
  const { id: routeId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const messageId = routeId ?? searchParams.get("messageId");

  const { isModalOpen, guardAction, closeModal } = useApiKeyGuard();

  // Derive message from storage on every render; re-derives when messageId changes.
  const message = useMemo(
    () => (messageId ? getMessage(messageId) : null),
    [messageId]
  );

  // Persisted songs from storage (baseline for this message).
  const storedSongs = useMemo(
    () =>
      messageId
        ? getSongsByMessage(messageId).filter((s) => !s.deleted)
        : [],
    [messageId]
  );

  // Songs added during the current page session (before a reload).
  const [newSongs, setNewSongs] = useState<Song[]>([]);

  /**
   * Map<songId, SongState> for in-flight generation slots.
   * Pre-generated stable IDs are used as keys so only the relevant entry is
   * updated when a slot resolves — React.memo prevents sibling card re-renders.
   */
  const [slots, setSlots] = useState<Map<string, SongState>>(new Map());
  const [isGenerating, setIsGenerating] = useState(false);

  // Local overrides for pin/delete state applied during this session.
  // Maps song id -> partial Song fields so we can reflect storage changes
  // without forcing a full re-read after every action.
  const [songOverrides, setSongOverrides] = useState<
    Map<string, Partial<Song>>
  >(new Map());

  // All songs to display: stored baseline + new songs added this session.
  const songs = useMemo(() => {
    const storedIds = new Set(storedSongs.map((s) => s.id));
    const uniqueNew = newSongs.filter((s) => !storedIds.has(s.id));
    return [...storedSongs, ...uniqueNew];
  }, [storedSongs, newSongs]);

  const handleGenerate = useCallback(async () => {
    // API key guard must run first so the modal appears even without a message.
    if (!guardAction()) return;
    if (isGenerating) return;
    if (!messageId || !message) return;

    const settings = getSettings();
    const n = settings?.numSongs ?? 3;
    const prompt = buildStylePrompt(message);
    // Derive duration: message.duration (seconds) → music_length_ms
    const musicLengthMs =
      message.duration != null ? message.duration * 1000 : undefined;

    // Pre-generate stable IDs for each slot so the Map has keys before async work.
    const slotIds = Array.from({ length: n }, () => crypto.randomUUID());

    // Build initial Map with all slots in loading state.
    const initialSlots = new Map<string, SongState>(
      slotIds.map((id) => [id, { loading: true, song: null, error: null }])
    );
    setSlots(initialSlots);
    setIsGenerating(true);

    log({
      category: "user:action",
      action: "song:generate:start",
      data: { messageId, numSongs: n },
    });

    const client = createLLMClient(settings?.poeApiKey ?? undefined);

    // Launch N concurrent generation requests.
    const promises = slotIds.map(async (slotId, i) => {
      log({
        category: "llm:request",
        action: "llm:song:start",
        data: { messageId, slotId, slotIndex: i },
      });
      try {
        const audioUrl = await client.generateSong(prompt, musicLengthMs);
        const songNumber = i + 1;
        const song = createSong({
          messageId,
          title: `${message.title || "Song"} (Take ${songNumber})`,
          audioUrl,
        });

        log({
          category: "llm:response",
          action: "llm:song:complete",
          data: { messageId, slotId, songId: song.id },
        });

        // Update only this slot's entry in the Map — siblings are unaffected.
        setSlots((prev) => {
          const next = new Map(prev);
          next.set(slotId, { loading: false, song, error: null });
          return next;
        });
        setNewSongs((prev) => [...prev, song]);
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : "Generation failed";
        log({
          category: "llm:response",
          action: "llm:song:error",
          data: { messageId, slotId, error: errMsg },
        });
        setSlots((prev) => {
          const next = new Map(prev);
          next.set(slotId, { loading: false, song: null, error: errMsg });
          return next;
        });
      }
    });

    await Promise.allSettled(promises);
    setIsGenerating(false);
    // Clear slots now that all have resolved; the persisted songs list shows the results.
    setSlots(new Map());
  }, [messageId, message, isGenerating, guardAction]);

  /** Pin or unpin a song; reflects the change locally without a full re-read. */
  const handlePin = useCallback((song: Song) => {
    const newPinned = !song.pinned;
    pinSong(song.id, newPinned);
    log({
      category: "user:action",
      action: newPinned ? "song:pin" : "song:unpin",
      data: { songId: song.id },
    });
    setSongOverrides((prev) => {
      const next = new Map(prev);
      next.set(song.id, { ...next.get(song.id), pinned: newPinned });
      return next;
    });
  }, []);

  /** Soft-delete a song; hides it from the list immediately. */
  const handleDelete = useCallback((song: Song) => {
    deleteSong(song.id);
    log({
      category: "user:action",
      action: "song:delete",
      data: { songId: song.id },
    });
    setSongOverrides((prev) => {
      const next = new Map(prev);
      next.set(song.id, { ...next.get(song.id), deleted: true });
      return next;
    });
  }, []);

  /**
   * Download the song's audio file using the browser's native save dialog.
   * Fetches the URL as a blob so the browser prompts for a save location even
   * when the audio is served from a cross-origin CDN.
   */
  const handleDownload = useCallback(async (song: Song) => {
    log({
      category: "user:action",
      action: "song:download",
      data: { songId: song.id },
    });
    try {
      const response = await fetch(song.audioUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${song.title}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // If fetch fails (e.g. CORS or network), fall back to a direct link.
      const a = document.createElement("a");
      a.href = song.audioUrl;
      a.download = `${song.title}.mp3`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, []);

  // Merge local overrides into the songs list and filter out deleted ones.
  const resolvedSongs = useMemo(
    () =>
      songs
        .map((s) => ({ ...s, ...songOverrides.get(s.id) }))
        .filter((s) => !s.deleted),
    [songs, songOverrides]
  );

  // Song IDs currently shown in active slots (not yet moved to the persisted list).
  const slotSongIds = new Set<string>();
  for (const state of slots.values()) {
    if (state.song !== null) slotSongIds.add(state.song.id);
  }
  // Songs to show in the static list (excludes those currently in active slots).
  const listedSongs = resolvedSongs.filter((s) => !slotSongIds.has(s.id));

  // Ordered slot entries for rendering (Map insertion order = slot order).
  const slotEntries = [...slots.entries()];

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="flex items-center gap-2.5 mb-1">
        <Music size={18} className="text-primary" aria-hidden="true" />
        <h1>Song Generator</h1>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Generate audio versions of your lyrics with ElevenLabs.
      </p>

      {/* Message info + generate */}
      {message ? (
        <div className="mt-5 rounded-lg border bg-card p-4 flex items-center justify-between gap-4" data-testid="song-entry-info">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" data-testid="song-entry-title">
              {message.title || "Untitled"}
            </p>
            {message.style && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate" data-testid="song-entry-style">
                {message.style}
              </p>
            )}
          </div>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            data-testid="generate-songs-btn"
            className="min-h-[44px] shrink-0 gap-2"
          >
            <Zap size={14} aria-hidden="true" />
            {isGenerating ? "Generating…" : "Generate"}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="no-entry-message">
          {messageId
            ? "Lyrics message not found."
            : "No lyrics message selected. Open a lyrics entry and click \"Generate Songs\"."}
        </p>
      )}

      {/* In-progress slots (shown during generation) */}
      {slotEntries.length > 0 && (
        <div className="mt-6 space-y-4" data-testid="song-slots">
          {slotEntries.map(([slotId, state], index) => (
            <div
              key={slotId}
              className="rounded-md border p-4"
              data-testid={`song-slot-${index}`}
            >
              {state.loading ? (
                <div
                  className="animate-pulse"
                  data-testid={`song-loading-${index}`}
                  aria-label={`Generating song ${index + 1}…`}
                  role="status"
                >
                  {/* Skeleton mimicking the shape of a SongItem card */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-4 w-1/3 rounded bg-muted" />
                    <div className="flex gap-2">
                      <div className="h-7 w-12 rounded bg-muted" />
                      <div className="h-7 w-16 rounded bg-muted" />
                      <div className="h-7 w-14 rounded bg-muted" />
                    </div>
                  </div>
                  <div className="h-8 w-full rounded bg-muted" />
                </div>
              ) : state.error ? (
                <p className="text-sm text-destructive" data-testid={`song-error-${index}`}>
                  Error: {state.error}
                </p>
              ) : state.song ? (
                <SongItem
                  song={state.song}
                  onPin={handlePin}
                  onDelete={handleDelete}
                  onDownload={handleDownload}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Pre-existing + newly generated songs (after slots clear) */}
      {listedSongs.length > 0 ? (
        <div className="mt-6 space-y-4" data-testid="song-list">
          {listedSongs.map((song) => (
            <div
              key={song.id}
              className="rounded-md border p-4"
              data-testid="song-item"
            >
              <SongItem
                song={song}
                onPin={handlePin}
                onDelete={handleDelete}
                onDownload={handleDownload}
              />
            </div>
          ))}
        </div>
      ) : (
        slots.size === 0 && message && (
          <p
            className="mt-6 text-sm text-muted-foreground"
            data-testid="no-songs-message"
          >
            No songs yet. Hit Generate to create some.
          </p>
        )
      )}

      {isModalOpen && <ApiKeyMissingModal onClose={closeModal} />}
    </div>
  );
}

interface SongItemProps {
  song: Song;
  onPin: (song: Song) => void;
  onDelete: (song: Song) => void;
  onDownload: (song: Song) => void;
}

/**
 * Renders a single song with its title, an inline HTML5 audio player, and
 * action buttons for pin, delete, and download.
 *
 * Wrapped in React.memo so that a Map state update for one song does not
 * cause sibling SongItem components to re-render.
 */
const SongItem = memo(function SongItem({
  song,
  onPin,
  onDelete,
  onDownload,
}: SongItemProps) {
  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium text-sm" data-testid="song-title">
          {song.title}
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPin(song)}
            data-testid="song-pin-btn"
            aria-label={song.pinned ? "Unpin song" : "Pin song"}
            className="min-h-[44px]"
          >
            {song.pinned ? "Unpin" : "Pin"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDownload(song)}
            data-testid="song-download-btn"
            aria-label="Download song"
            className="min-h-[44px]"
          >
            Download
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(song)}
            data-testid="song-delete-btn"
            aria-label="Delete song"
            className="min-h-[44px]"
          >
            Delete
          </Button>
        </div>
      </div>
      <audio
        controls
        src={song.audioUrl}
        className="song-audio"
        data-testid="song-audio"
      />
    </>
  );
});
