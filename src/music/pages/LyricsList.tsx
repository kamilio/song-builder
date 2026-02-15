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
import { Plus } from "lucide-react";
import { Button } from "@/music/components/ui/button";
import { LyricsItemCard } from "@/music/components/LyricsItemCard";
import {
  getMessages,
  updateMessage,
} from "@/music/lib/storage/storageService";
import type { Message } from "@/music/lib/storage/types";

export default function LyricsList() {
  const navigate = useNavigate();

  // Only show non-deleted assistant messages (which carry lyrics fields).
  const [allEntries, setAllEntries] = React.useState<Message[]>(
    () => getMessages().filter((m) => m.role === "assistant" && !m.deleted)
  );
  const [search, setSearch] = React.useState("");

  function reloadEntries() {
    setAllEntries(getMessages().filter((m) => m.role === "assistant" && !m.deleted));
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

  function handleDelete(e: React.MouseEvent, id: string) {
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
        <Button onClick={() => navigate("/music")} data-testid="new-lyrics-btn">
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
                  <Link to="/music" className="underline underline-offset-2 hover:text-foreground">
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
          {filtered.map((entry) => (
            <div key={entry.id} data-testid="lyrics-list-item">
              <LyricsItemCard
                message={entry}
                onDelete={(e) => handleDelete(e, entry.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
