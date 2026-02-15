/**
 * LyricsItemCard — compact snapshot preview for an assistant message.
 *
 * Rendered in the chat panel for every assistant message in the ancestor path.
 * Shows: title (heading), style (tag), commentary (italic), collapsible lyrics
 * body (4 lines visible, expand toggle), song count badge, "Songs" button.
 *
 * Clicking the card body navigates to /lyrics/:messageId.
 * "Songs" button navigates to /lyrics/:messageId/songs.
 *
 * Style pills use a colour derived from a stable hash of the style string so
 * the same genre always renders the same colour (cycles through 4 hues).
 */

import { useState } from "react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getSongsByMessage } from "@/lib/storage/storageService";
import type { Message } from "@/lib/storage/types";

/**
 * Returns a tag colour index 1–4 derived from the style string.
 * Same input always yields the same colour; different genres get distinct hues.
 */
function styleTagColor(style: string): "1" | "2" | "3" | "4" {
  let hash = 0;
  for (let i = 0; i < style.length; i++) {
    hash = (hash * 31 + style.charCodeAt(i)) >>> 0;
  }
  return (String((hash % 4) + 1) as "1" | "2" | "3" | "4");
}

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

  const tagColor = message.style ? styleTagColor(message.style) : undefined;

  return (
    <div
      className="rounded-md border bg-card text-card-foreground shadow-sm cursor-pointer hover:bg-muted/40 active:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none transition-colors"
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
      {/* Card header: title + style pill */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <h3
          className="font-semibold leading-snug"
          data-testid="card-title"
        >
          {message.title ?? "Untitled"}
        </h3>
        {message.style && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            data-tag-color={tagColor}
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
              className="mt-1 text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
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
