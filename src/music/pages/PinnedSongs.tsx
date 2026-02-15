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
import { Pin } from "lucide-react";
import { Button } from "@/music/components/ui/button";
import { getSongs, getMessages, pinSong } from "@/music/lib/storage/storageService";
import type { Song } from "@/music/lib/storage/types";
import { log } from "@/music/lib/actionLog";

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
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="flex items-center gap-2.5 mb-1">
        <Pin size={18} className="text-primary" aria-hidden="true" />
        <h1>Pinned Songs</h1>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Your saved songs, ready to play or download.
      </p>

      {pinnedSongs.length === 0 ? (
        <div
          className="mt-10 flex flex-col items-center gap-3 text-center"
          data-testid="no-pinned-message"
        >
          <Pin size={32} className="text-muted-foreground/40" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">No pinned songs yet</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pin a song from the Song Generator to save it here.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-3" data-testid="pinned-song-list">
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
      className="rounded-lg border bg-card p-4 shadow-sm"
      data-testid="pinned-song-item"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" data-testid="pinned-song-title">
            {song.title}
          </p>
          {entryTitle && (
            <Link
              to={`/music/lyrics/${song.messageId}/songs`}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline hover:text-foreground mt-0.5 block"
              data-testid="pinned-song-entry-title"
            >
              from "{entryTitle}"
            </Link>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUnpin(song)}
            data-testid="pinned-song-unpin-btn"
            aria-label="Unpin song"
            className="min-h-[44px]"
          >
            Unpin
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDownload(song)}
            data-testid="pinned-song-download-btn"
            aria-label="Download song"
            className="min-h-[44px]"
          >
            Download
          </Button>
        </div>
      </div>
      <audio
        controls
        src={song.audioUrl}
        className="song-audio"
        data-testid="pinned-song-audio"
      />
    </div>
  );
}
