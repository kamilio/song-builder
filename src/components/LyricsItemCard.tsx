/**
 * LyricsItemCard — compact snapshot preview for an assistant message.
 *
 * Rendered in the chat panel for every assistant message in the ancestor path.
 * Shows: title (heading), style (tag), commentary (italic), collapsible lyrics
 * body (4 lines visible, expand toggle), song count badge, "Songs" button.
 *
 * Clicking the card body navigates to /lyrics/:messageId.
 * "Songs" button navigates to /lyrics/:messageId/songs.
 */

import { useState } from "react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getSongsByMessage } from "@/lib/storage/storageService";
import type { Message } from "@/lib/storage/types";

interface LyricsItemCardProps {
  message: Message;
}

/** Lines of lyrics to show before the expand toggle. */
const COLLAPSED_LINE_COUNT = 4;

export function LyricsItemCard({ message }: LyricsItemCardProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  // Count non-deleted songs for this message.
  const songCount = getSongsByMessage(message.id).filter((s) => !s.deleted)
    .length;

  const lyricsLines = message.lyricsBody ? message.lyricsBody.split("\n") : [];
  const isCollapsible = lyricsLines.length > COLLAPSED_LINE_COUNT;
  const visibleLines =
    isCollapsible && !expanded
      ? lyricsLines.slice(0, COLLAPSED_LINE_COUNT)
      : lyricsLines;

  function handleCardClick(e: React.MouseEvent) {
    // Don't navigate when clicking the Songs button.
    if ((e.target as HTMLElement).closest("[data-songs-btn]")) return;
    navigate(`/lyrics/${message.id}`);
  }

  function handleSongsClick(e: React.MouseEvent) {
    e.stopPropagation();
    navigate(`/lyrics/${message.id}/songs`);
  }

  function handleExpandToggle(e: React.MouseEvent) {
    e.stopPropagation();
    setExpanded((v) => !v);
  }

  return (
    <div
      className="rounded-md border bg-card text-card-foreground shadow-sm cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/lyrics/${message.id}`);
        }
      }}
      aria-label={`View lyrics: ${message.title ?? "Untitled"}`}
      data-testid="lyrics-item-card"
    >
      {/* Card header: title + style tag */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <h3
          className="text-sm font-semibold leading-snug"
          data-testid="card-title"
        >
          {message.title ?? "Untitled"}
        </h3>
        {message.style && (
          <span
            className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            data-testid="card-style"
          >
            {message.style}
          </span>
        )}
      </div>

      {/* Commentary */}
      {message.commentary && (
        <p
          className="px-4 pb-2 text-xs italic text-muted-foreground"
          data-testid="card-commentary"
        >
          {message.commentary}
        </p>
      )}

      {/* Collapsible lyrics body */}
      {lyricsLines.length > 0 && (
        <div className="px-4 pb-2">
          <pre
            className="font-mono text-xs text-muted-foreground whitespace-pre-wrap"
            data-testid="card-lyrics-body"
          >
            {visibleLines.join("\n")}
          </pre>
          {isCollapsible && (
            <button
              className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
              onClick={handleExpandToggle}
              data-testid="card-expand-toggle"
              aria-label={expanded ? "Show less lyrics" : "Show more lyrics"}
              type="button"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {/* Footer: song count badge + Songs button */}
      <div className="flex items-center justify-between px-4 pb-4 pt-1">
        <span
          className="text-xs text-muted-foreground"
          data-testid="card-song-count"
        >
          {songCount === 0 ? "No songs yet" : `${songCount} song${songCount === 1 ? "" : "s"}`}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSongsClick}
          data-songs-btn="true"
          data-testid="card-songs-btn"
          aria-label={`Go to songs for ${message.title ?? "Untitled"}`}
        >
          Songs
        </Button>
      </div>
    </div>
  );
}
