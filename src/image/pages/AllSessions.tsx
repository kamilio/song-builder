/**
 * AllSessions page (US-008)
 *
 * Route: /image/sessions
 *
 * Lists all non-deleted ImageSessions sorted by createdAt descending
 * (newest first). Each entry shows the session title and createdAt date,
 * and links to /image/sessions/:id.
 *
 * Layout: same TopBar and NavMenu as other image pages.
 *
 * US-005: After deleting a session the row is removed from the list
 * immediately without requiring navigation. The delete handler calls
 * imageStorageService.deleteSession (soft-delete) and then removes the
 * entry from local state so the list re-renders instantly.
 *
 * US-017: Each session row shows up to 4 small image thumbnails (newest
 * first), plus total image count and pinned count badges. Sessions with
 * no images show no thumbnail area.
 */

import { useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { ImageIcon, LayoutList, Pin, Plus, Settings, Bug, Trash2 } from "lucide-react";
import { NavMenu } from "@/shared/components/NavMenu";
import type { MenuItem } from "@/shared/components/NavMenu";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { imageStorageService } from "@/image/lib/storage";
import type { ImageSession, ImageItem } from "@/image/lib/storage";
import { useReportBug } from "@/shared/hooks/useReportBug";

// ─── Navigation items ──────────────────────────────────────────────────────

const IMAGE_NAV_ITEMS: MenuItem[] = [
  {
    label: "All Sessions",
    href: "/image/sessions",
    icon: LayoutList,
    "data-testid": "nav-menu-all-sessions",
  },
  {
    label: "Pinned Images",
    href: "/image/pinned",
    icon: Pin,
    "data-testid": "nav-menu-pinned",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    "data-testid": "nav-menu-settings",
  },
  {
    label: "Report Bug",
    icon: Bug,
    isReportBug: true,
    "data-testid": "nav-menu-report-bug",
  },
];

// ─── TopBar ────────────────────────────────────────────────────────────────

function TopBar() {
  const { handleReportBug } = useReportBug();
  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b bg-background/95 backdrop-blur-sm gap-4"
      data-testid="top-bar"
    >
      <Link
        to="/"
        className="flex items-center gap-2 shrink-0 hover:opacity-75 transition-opacity"
        aria-label="Studio home"
      >
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
          <ImageIcon className="h-3.5 w-3.5 text-primary-foreground" aria-hidden="true" />
        </div>
        <span className="font-semibold text-sm hidden sm:inline">Studio</span>
      </Link>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          to="/image"
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-border bg-background hover:bg-accent transition-colors"
          data-testid="new-session-btn"
          aria-label="New session"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">New Session</span>
        </Link>
        <NavMenu items={IMAGE_NAV_ITEMS} onReportBug={handleReportBug} />
      </div>
    </header>
  );
}

// ─── SessionRow ────────────────────────────────────────────────────────────

/** Max thumbnails shown per session card. */
const MAX_THUMBNAILS = 4;

interface SessionRowProps {
  session: ImageSession;
  /** Non-deleted items for this session, sorted newest-first. */
  items: ImageItem[];
  onDelete: (id: string) => void;
}

function SessionRow({ session, items, onDelete }: SessionRowProps) {
  const formatted = new Date(session.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const totalCount = items.length;
  const pinnedCount = items.filter((i) => i.pinned).length;
  const thumbnails = items.slice(0, MAX_THUMBNAILS);
  const hasImages = totalCount > 0;

  return (
    <div
      className="rounded-lg border border-border bg-card hover:shadow-md hover:border-foreground/20 transition-all"
      data-testid="session-list-item"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <Link
          to={`/image/sessions/${session.id}`}
          className="flex items-center justify-between flex-1 min-w-0 gap-4"
        >
          <span className="text-sm font-medium truncate text-foreground">{session.title}</span>
          <span className="text-xs text-muted-foreground shrink-0">{formatted}</span>
        </Link>
        <button
          type="button"
          onClick={() => onDelete(session.id)}
          aria-label={`Delete session: ${session.title}`}
          data-testid="delete-session-btn"
          className="ml-3 shrink-0 flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {hasImages && (
        <Link
          to={`/image/sessions/${session.id}`}
          className="flex items-center gap-2 px-4 pb-3"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="session-thumbnail-strip"
        >
          {thumbnails.map((item) => (
            <img
              key={item.id}
              src={item.url}
              alt=""
              className="w-10 h-10 rounded object-cover shrink-0 border border-border"
              data-testid="session-thumbnail"
            />
          ))}
          <div className="flex items-center gap-2 ml-1 text-xs text-muted-foreground">
            <span data-testid="session-image-count">{totalCount} {totalCount === 1 ? "image" : "images"}</span>
            {pinnedCount > 0 && (
              <span className="flex items-center gap-0.5" data-testid="session-pinned-count">
                <Pin className="h-3 w-3" aria-hidden="true" />
                {pinnedCount}
              </span>
            )}
          </div>
        </Link>
      )}
    </div>
  );
}

// ─── AllSessions ───────────────────────────────────────────────────────────

export default function AllSessions() {
  // Load all non-deleted sessions on mount, sorted newest-first.
  const [sessions, setSessions] = useState<ImageSession[]>(() =>
    imageStorageService
      .listSessions()
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
  );

  /**
   * Map of sessionId → non-deleted items sorted newest-first.
   * Scoped to the currently-visible session IDs so the map stays consistent
   * after deletions without including stale entries.
   *
   * US-017: Feeds thumbnail strips and image/pinned counts into each
   * SessionRow without per-row storage reads.
   */
  const itemsBySession = useMemo<Map<string, ImageItem[]>>(() => {
    const visibleIds = new Set(sessions.map((s) => s.id));
    const { items: allItems, generations: allGenerations } = imageStorageService.export();

    // Build generationId → sessionId lookup (only for visible sessions)
    const genToSession = new Map<string, string>(
      allGenerations
        .filter((g) => visibleIds.has(g.sessionId))
        .map((g) => [g.id, g.sessionId])
    );

    const map = new Map<string, ImageItem[]>();
    for (const item of allItems) {
      if (item.deleted) continue;
      const sessionId = genToSession.get(item.generationId);
      if (!sessionId) continue;
      const list = map.get(sessionId) ?? [];
      list.push(item);
      map.set(sessionId, list);
    }

    // Sort each list newest-first
    for (const list of map.values()) {
      list.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    }

    return map;
  }, [sessions]);

  // Session ID pending deletion confirmation; null when no dialog is open.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  /** Open the delete confirmation dialog for a session. */
  const handleDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  /**
   * Soft-deletes the session from storage and removes it from local state
   * immediately so the list updates without requiring navigation (US-005).
   */
  const handleDeleteConfirm = useCallback(() => {
    if (pendingDeleteId === null) return;
    imageStorageService.deleteSession(pendingDeleteId);
    setSessions((prev) => prev.filter((s) => s.id !== pendingDeleteId));
    setPendingDeleteId(null);
  }, [pendingDeleteId]);

  const handleDeleteCancel = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />

      <main className="flex-1 overflow-auto p-4 md:p-8 max-w-3xl">
        <div className="flex items-center gap-2.5 mb-1">
          <LayoutList size={18} className="text-primary" aria-hidden="true" />
          <h1 className="text-xl font-bold tracking-tight">All Sessions</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-sm mb-6">
          All your image generation sessions, newest first.
        </p>

        {sessions.length === 0 ? (
          <div
            className="mt-10 flex flex-col items-center gap-3 text-center"
            data-testid="all-sessions-empty"
          >
            <LayoutList size={32} className="text-muted-foreground/40" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">No sessions yet</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                <Link to="/image" className="underline underline-offset-2 hover:text-foreground">
                  Start a new session
                </Link>{" "}
                from the home page.
              </p>
            </div>
          </div>
        ) : (
          <div
            className="flex flex-col gap-2"
            data-testid="session-list"
          >
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                items={itemsBySession.get(session.id) ?? []}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {pendingDeleteId !== null && (
        <ConfirmDialog
          title="Delete session?"
          description="This will permanently remove this image session. This cannot be undone."
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />
      )}
    </div>
  );
}
