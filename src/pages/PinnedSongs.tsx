/**
 * PinnedSongs page (US-010 / US-013).
 *
 * Displays all pinned, non-deleted songs across every message.
 * Each song shows its title and the associated message title (lyrics title)
 * as a clickable link to /lyrics/:messageId/songs (US-010).
 *
 * Per-song actions:
 *   - Play: inline HTML5 audio player (always visible)
 *   - Unpin: sets song.pinned = false in localStorage; removes song from view
 *   - Download: fetches the audio URL and triggers the browser's native save dialog
 */

import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getSongs, getMessages, pinSong } from "@/lib/storage/storageService";
import type { Song } from "@/lib/storage/types";
import { log } from "@/lib/actionLog";

export default function PinnedSongs() {
  // Load all songs and messages once on mount; unpinning updates local state.
  const allSongs = useMemo(() => getSongs(), []);
  const allMessages = useMemo(() => getMessages(), []);

  // Map from messageId → message title for display.
  const messageTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const msg of allMessages) {
      if (msg.title) map.set(msg.id, msg.title);
    }
    return map;
  }, [allMessages]);

  // Local unpin tracking: set of song IDs that have been unpinned this session.
  const [unpinnedIds, setUnpinnedIds] = useState<Set<string>>(new Set());

  // All pinned, non-deleted songs (excluding those just unpinned locally).
  const pinnedSongs = useMemo(
    () =>
      allSongs.filter(
        (s) => s.pinned && !s.deleted && !unpinnedIds.has(s.id)
      ),
    [allSongs, unpinnedIds]
  );

  /** Unpin a song: update storage and remove it from the view immediately. */
  const handleUnpin = useCallback((song: Song) => {
    pinSong(song.id, false);
    log({
      category: "user:action",
      action: "song:unpin",
      data: { songId: song.id },
    });
    setUnpinnedIds((prev) => new Set([...prev, song.id]));
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

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold">Pinned Songs</h1>
      <p className="text-muted-foreground mt-2">
        Your pinned songs, ready to play or download.
      </p>

      {pinnedSongs.length === 0 ? (
        <p
          className="mt-6 text-sm text-muted-foreground"
          data-testid="no-pinned-message"
        >
          No pinned songs yet. Pin a song from the Songs View.
        </p>
      ) : (
        <div className="mt-6 space-y-4" data-testid="pinned-song-list">
          {pinnedSongs.map((song) => (
            <PinnedSongItem
              key={song.id}
              song={song}
              entryTitle={messageTitleMap.get(song.messageId) ?? ""}
              onUnpin={handleUnpin}
              onDownload={handleDownload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PinnedSongItemProps {
  song: Song;
  entryTitle: string;
  onUnpin: (song: Song) => void;
  onDownload: (song: Song) => Promise<void>;
}

/**
 * Renders a single pinned song with its title, the associated lyrics entry
 * title as a link to /lyrics/:messageId/songs (US-010), an inline HTML5
 * audio player, and action buttons for unpin and download.
 */
function PinnedSongItem({
  song,
  entryTitle,
  onUnpin,
  onDownload,
}: PinnedSongItemProps) {
  return (
    <div
      className="rounded-md border p-4"
      data-testid="pinned-song-item"
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-medium text-sm" data-testid="pinned-song-title">
            {song.title}
          </p>
          {entryTitle && (
            <Link
              to={`/lyrics/${song.messageId}/songs`}
              className="text-xs text-primary underline-offset-2 hover:underline mt-0.5 block"
              data-testid="pinned-song-entry-title"
            >
              {entryTitle}
            </Link>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUnpin(song)}
            data-testid="pinned-song-unpin-btn"
            aria-label="Unpin song"
          >
            Unpin
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDownload(song)}
            data-testid="pinned-song-download-btn"
            aria-label="Download song"
          >
            Download
          </Button>
        </div>
      </div>
      <audio
        controls
        src={song.audioUrl}
        className="w-full"
        data-testid="pinned-song-audio"
      />
    </div>
  );
}
