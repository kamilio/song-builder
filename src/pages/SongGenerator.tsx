/**
 * SongGenerator page (US-011 / US-012).
 *
 * Reads the `?messageId=` query parameter to determine which assistant message
 * (lyrics version) is currently open. Triggers N parallel calls to
 * llmClient.generateSong() where N comes from settings.numSongs (default 3).
 * Each call receives a style prompt derived from the message's lyrics fields.
 * Generated songs are persisted to localStorage via storageService.createSong()
 * and rendered as list items with an inline HTML5 audio player.
 *
 * A per-song loading indicator is shown while each request is in flight, so
 * the user sees N skeleton rows immediately after clicking "Generate Songs".
 *
 * The API key guard (useApiKeyGuard) blocks generation when no key is set,
 * matching the behaviour of the Lyrics Generator chat panel (US-007).
 *
 * Per-song actions (US-012):
 *   - Play: inline HTML5 audio player (always visible)
 *   - Pin: sets song.pinned = true in localStorage
 *   - Delete: sets song.deleted = true in localStorage; hides song from list
 *   - Download: fetches the audio URL and triggers the browser's native save dialog
 */

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
interface SongSlot {
  /** Slot index (0-based). Used as a stable React key while loading. */
  index: number;
  /** Whether this slot is still awaiting a response. */
  loading: boolean;
  /** The persisted Song record once the response arrives; null while loading. */
  song: Song | null;
  /** Error message if generation failed for this slot. */
  error: string | null;
}

export default function SongGenerator() {
  const [searchParams] = useSearchParams();
  const messageId = searchParams.get("messageId");

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

  const [slots, setSlots] = useState<SongSlot[]>([]);
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

    // Build N loading slots immediately so the UI shows placeholders.
    const initialSlots: SongSlot[] = Array.from({ length: n }, (_, i) => ({
      index: i,
      loading: true,
      song: null,
      error: null,
    }));
    setSlots(initialSlots);
    setIsGenerating(true);

    const client = createLLMClient(settings?.poeApiKey ?? undefined);

    // Launch N concurrent generation requests.
    const promises = Array.from({ length: n }, async (_, i) => {
      try {
        const audioUrl = await client.generateSong(prompt);
        const songNumber = i + 1;
        const song = createSong({
          messageId,
          title: `${message.title || "Song"} (Take ${songNumber})`,
          audioUrl,
        });

        setSlots((prev) =>
          prev.map((slot) =>
            slot.index === i
              ? { ...slot, loading: false, song, error: null }
              : slot
          )
        );
        setNewSongs((prev) => [...prev, song]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Generation failed";
        setSlots((prev) =>
          prev.map((slot) =>
            slot.index === i
              ? { ...slot, loading: false, song: null, error: message }
              : slot
          )
        );
      }
    });

    await Promise.allSettled(promises);
    setIsGenerating(false);
    // Clear slots now that all have resolved; the persisted songs list shows the results.
    setSlots([]);
  }, [messageId, message, isGenerating, guardAction]);

  /** Pin or unpin a song; reflects the change locally without a full re-read. */
  const handlePin = useCallback((song: Song) => {
    const newPinned = !song.pinned;
    pinSong(song.id, newPinned);
    setSongOverrides((prev) => {
      const next = new Map(prev);
      next.set(song.id, { ...next.get(song.id), pinned: newPinned });
      return next;
    });
  }, []);

  /** Soft-delete a song; hides it from the list immediately. */
  const handleDelete = useCallback((song: Song) => {
    deleteSong(song.id);
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

  // Songs being shown in active slots (not yet moved to the persisted list).
  const slotSongIds = new Set(
    slots.filter((s) => s.song !== null).map((s) => s.song!.id)
  );
  // Songs to show in the static list (excludes those currently in active slots).
  const listedSongs = resolvedSongs.filter((s) => !slotSongIds.has(s.id));

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold">Song Generator</h1>
      <p className="text-muted-foreground mt-2">
        Generate audio from your lyrics using ElevenLabs.
      </p>

      {/* Message info */}
      {message ? (
        <div className="mt-4 rounded-md bg-muted p-4 text-sm font-mono" data-testid="song-entry-info">
          <p>
            <span className="text-muted-foreground">title:</span>{" "}
            <span data-testid="song-entry-title">{message.title}</span>
          </p>
          <p>
            <span className="text-muted-foreground">style:</span>{" "}
            <span data-testid="song-entry-style">{message.style}</span>
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="no-entry-message">
          {messageId
            ? "Lyrics message not found."
            : "No lyrics message selected. Open a lyrics entry and click \"Generate Songs\"."}
        </p>
      )}

      {/* Generate button */}
      <div className="mt-6">
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          data-testid="generate-songs-btn"
        >
          {isGenerating ? "Generating…" : "Generate Songs"}
        </Button>
      </div>

      {/* In-progress slots (shown during generation) */}
      {slots.length > 0 && (
        <div className="mt-6 space-y-4" data-testid="song-slots">
          {slots.map((slot) => (
            <div
              key={slot.index}
              className="rounded-md border p-4"
              data-testid={`song-slot-${slot.index}`}
            >
              {slot.loading ? (
                <div
                  className="animate-pulse text-sm text-muted-foreground"
                  data-testid={`song-loading-${slot.index}`}
                  aria-label={`Generating song ${slot.index + 1}…`}
                >
                  Generating song {slot.index + 1}…
                </div>
              ) : slot.error ? (
                <p className="text-sm text-destructive" data-testid={`song-error-${slot.index}`}>
                  Error: {slot.error}
                </p>
              ) : slot.song ? (
                <SongItem
                  song={slot.song}
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
      {listedSongs.length > 0 && (
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
 * action buttons for pin, delete, and download (US-012).
 */
function SongItem({ song, onPin, onDelete, onDownload }: SongItemProps) {
  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium text-sm" data-testid="song-title">
          {song.title}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPin(song)}
            data-testid="song-pin-btn"
            aria-label={song.pinned ? "Unpin song" : "Pin song"}
          >
            {song.pinned ? "Unpin" : "Pin"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDownload(song)}
            data-testid="song-download-btn"
            aria-label="Download song"
          >
            Download
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(song)}
            data-testid="song-delete-btn"
            aria-label="Delete song"
          >
            Delete
          </Button>
        </div>
      </div>
      <audio
        controls
        src={song.audioUrl}
        className="w-full"
        data-testid="song-audio"
      />
    </>
  );
}
