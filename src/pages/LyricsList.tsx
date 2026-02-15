/**
 * Lyrics List page (US-009).
 *
 * Displays all non-deleted assistant messages (lyrics versions) in a searchable table.
 * Users can:
 *  - Search by title or style (real-time filter)
 *  - Click a row to open the Lyrics Generator for that message
 *  - Click "New Lyrics" to navigate to /lyrics/new
 *  - Soft-delete a message (sets deleted=true, hides from table)
 *
 * Columns: title, style (hidden on mobile <768px), song count, created date, actions.
 * Song count reflects non-deleted songs for each messageId.
 */

import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getMessages,
  getSongs,
  updateMessage,
} from "@/lib/storage/storageService";
import type { Message } from "@/lib/storage/types";

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function styleTagColor(style: string): "1" | "2" | "3" | "4" {
  let hash = 0;
  for (let i = 0; i < style.length; i++) {
    hash = (hash * 31 + style.charCodeAt(i)) >>> 0;
  }
  return (String((hash % 4) + 1) as "1" | "2" | "3" | "4");
}

export default function LyricsList() {
  const navigate = useNavigate();

  // Only show non-deleted assistant messages (which carry lyrics fields).
  const [allEntries, setAllEntries] = React.useState<Message[]>(
    () => getMessages().filter((m) => m.role === "assistant" && !m.deleted)
  );
  // Song count map: messageId → count of non-deleted songs
  const [songCounts, setSongCounts] = React.useState<Map<string, number>>(
    () => {
      const songs = getSongs().filter((s) => !s.deleted);
      const counts = new Map<string, number>();
      for (const s of songs) {
        counts.set(s.messageId, (counts.get(s.messageId) ?? 0) + 1);
      }
      return counts;
    }
  );
  const [search, setSearch] = React.useState("");

  function reloadEntries() {
    setAllEntries(getMessages().filter((m) => m.role === "assistant" && !m.deleted));
    const songs = getSongs().filter((s) => !s.deleted);
    const counts = new Map<string, number>();
    for (const s of songs) {
      counts.set(s.messageId, (counts.get(s.messageId) ?? 0) + 1);
    }
    setSongCounts(counts);
  }

  const filtered = search.trim()
    ? allEntries.filter((m) => {
        const q = search.toLowerCase();
        return (
          (m.title ?? "").toLowerCase().includes(q) ||
          (m.style ?? "").toLowerCase().includes(q)
        );
      })
    : allEntries;

  function handleNewLyrics() {
    navigate("/lyrics/new");
  }

  function handleRowClick(id: string) {
    navigate(`/lyrics/${id}`);
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    // Prevent the row click from firing
    e.stopPropagation();
    updateMessage(id, { deleted: true });
    reloadEntries();
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1>Lyrics</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {allEntries.length === 0 ? "No songs yet" : `${allEntries.length} song${allEntries.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Button onClick={handleNewLyrics} data-testid="new-lyrics-btn">
          <Plus className="h-4 w-4 mr-1.5" />
          New
        </Button>
      </div>

      <div className="mb-5">
        <input
          type="text"
          placeholder="Search by title or style…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search lyrics"
          className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-center" data-testid="lyrics-list-empty">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Plus className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {search.trim() ? "No matches found" : "No lyrics yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {search.trim() ? (
                "Try a different search term."
              ) : (
                <>
                  <Link to="/" className="underline underline-offset-2 hover:text-foreground">
                    Start a new song
                  </Link>{" "}
                  from the home page.
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((entry) => {
            const count = songCounts.get(entry.id) ?? 0;
            return (
              <div
                key={entry.id}
                onClick={() => handleRowClick(entry.id)}
                className="group rounded-lg border bg-card p-4 cursor-pointer hover:shadow-sm hover:border-foreground/20 active:bg-muted/30 transition-all flex flex-col gap-2 min-h-[100px] overflow-hidden"
                data-testid="lyrics-list-item"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm leading-snug">
                    {entry.title || (
                      <span className="text-muted-foreground italic font-normal">Untitled</span>
                    )}
                  </p>
                  <button
                    onClick={(e) => handleDelete(e, entry.id)}
                    aria-label={`Delete ${entry.title ?? "entry"}`}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded min-h-[44px] min-w-[44px] inline-flex items-center justify-center -mt-1 -mr-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {entry.style && (
                  <span
                    className="self-start inline-block rounded-full px-2 py-0.5 text-xs font-medium max-w-full truncate"
                    data-tag-color={styleTagColor(entry.style)}
                    title={entry.style}
                  >
                    {entry.style}
                  </span>
                )}

                <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span aria-label={`${count} songs`}>
                    {count === 0 ? "No songs" : `${count} song${count === 1 ? "" : "s"}`}
                  </span>
                  <span>{formatDate(entry.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
