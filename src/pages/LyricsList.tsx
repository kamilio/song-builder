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
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1>Lyrics List</h1>
        <Button onClick={handleNewLyrics}>
          <Plus className="h-4 w-4 mr-2" />
          New Lyrics
        </Button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by title or style…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search lyrics"
          className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground mt-4" data-testid="lyrics-list-empty">
          {search.trim() ? (
            "No entries match your search."
          ) : (
            <>
              No lyrics yet.{" "}
              <Link to="/" className="underline underline-offset-2 hover:text-foreground">
                Start a new song from home.
              </Link>
            </>
          )}
        </p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Title
                </th>
                {/* Style column hidden on mobile (<768px) */}
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                  Style
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Songs
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                  Created
                </th>
                <th className="px-4 py-3 w-12" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, idx) => (
                <tr
                  key={entry.id}
                  onClick={() => handleRowClick(entry.id)}
                  className={`cursor-pointer hover:bg-muted/50 active:bg-muted/70 focus-within:bg-muted/30 transition-colors ${
                    idx !== 0 ? "border-t" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium">
                    {entry.title || (
                      <span className="text-muted-foreground italic">
                        Untitled
                      </span>
                    )}
                  </td>
                  {/* Style column hidden on mobile (<768px) */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    {entry.style ? (
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                        data-tag-color={styleTagColor(entry.style)}
                      >
                        {entry.style}
                      </span>
                    ) : (
                      <span className="italic text-muted-foreground">—</span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-muted-foreground"
                    aria-label={`${songCounts.get(entry.id) ?? 0} songs`}
                  >
                    {songCounts.get(entry.id) ?? 0}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {formatDate(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => handleDelete(e, entry.id)}
                      aria-label={`Delete ${entry.title ?? "entry"}`}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
