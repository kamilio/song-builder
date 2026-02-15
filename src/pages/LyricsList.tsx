/**
 * Lyrics List page (US-008 / US-009).
 *
 * Displays all non-deleted assistant messages (lyrics versions) in a searchable table.
 * Users can:
 *  - Search by title or style (real-time filter)
 *  - Click a row to open the Lyrics Generator for that message
 *  - Click "New Lyrics" to navigate to /lyrics/new
 *  - Soft-delete a message (sets deleted=true, hides from table)
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getMessages,
  updateMessage,
} from "@/lib/storage/storageService";
import type { Message } from "@/lib/storage/types";

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
        <h1 className="text-2xl font-bold">Lyrics List</h1>
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
        <p className="text-muted-foreground mt-4">
          {search.trim()
            ? "No entries match your search."
            : 'No lyrics entries yet. Click "New Lyrics" to get started.'}
        </p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Title
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                  Style
                </th>
                <th className="px-4 py-3 w-12" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, idx) => (
                <tr
                  key={entry.id}
                  onClick={() => handleRowClick(entry.id)}
                  className={`cursor-pointer hover:bg-accent transition-colors ${
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
                  <td className="px-4 py-3 text-muted-foreground">
                    {entry.style || <span className="italic">—</span>}
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
