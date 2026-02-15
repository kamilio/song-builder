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
import { Trash2 } from "lucide-react";
import { Button } from "@/music/components/ui/button";
import { getSongsByMessage } from "@/music/lib/storage/storageService";
import type { Message } from "@/music/lib/storage/types";

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
  onDelete?: (e: React.MouseEvent) => void;
}

/** Lines of lyrics to show before the expand toggle. */
const COLLAPSED_LINE_COUNT = 4;

export function LyricsItemCard({ message, onDelete }: LyricsItemCardProps) {
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
    navigate(`/music/lyrics/${message.id}`);
  }

  function handleSongsClick(e: React.MouseEvent) {
    e.stopPropagation();
    navigate(`/music/lyrics/${message.id}/songs`);
  }

  function handleExpandToggle(e: React.MouseEvent) {
    e.stopPropagation();
    setExpanded((v) => !v);
  }

  const tagColor = message.style ? styleTagColor(message.style) : undefined;

  return (
    <div
      className="group rounded-lg border bg-card text-card-foreground shadow-sm cursor-pointer hover:shadow-md hover:border-foreground/20 active:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none transition-all"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/music/lyrics/${message.id}`);
        }
      }}
      aria-label={`View lyrics: ${message.title ?? "Untitled"}`}
      data-testid="lyrics-item-card"
    >
      {/* Card header: title + style pill + optional delete */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3
            className="font-semibold leading-snug min-w-0 truncate"
            data-testid="card-title"
          >
            {message.title ?? "Untitled"}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            {message.style && (
              <span
                className="max-w-[140px] truncate rounded-full px-2 py-0.5 text-xs font-medium mt-0.5"
                data-tag-color={tagColor}
                data-testid="card-style"
                title={message.style}
              >
                {message.style}
              </span>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Delete ${message.title ?? "entry"}`}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 rounded min-h-[32px] min-w-[32px] inline-flex items-center justify-center -mt-0.5 -mr-1"
                data-testid="card-delete-btn"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Commentary */}
        {message.commentary && (
          <p
            className="text-xs text-muted-foreground italic leading-relaxed"
            data-testid="card-commentary"
          >
            {message.commentary}
          </p>
        )}
      </div>

      {/* Collapsible lyrics body */}
      {lyricsLines.length > 0 && (
        <div className="px-4 pb-3 border-t border-dashed border-border/60 pt-3 mx-4 -mx-0">
          <pre
            className="font-mono text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed"
            data-testid="card-lyrics-body"
          >
            {visibleLines.join("\n")}
          </pre>
          {isCollapsible && (
            <button
              className="mt-2 text-xs text-primary/70 underline-offset-2 hover:underline hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded transition-colors"
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
      <div className="flex items-center justify-between px-4 pb-3 pt-2 border-t border-border/50">
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
          className="h-7 text-xs px-2.5"
        >
          Songs
        </Button>
      </div>
    </div>
  );
}
