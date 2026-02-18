/**
 * All Videos page.
 *
 * Route: /video/videos (TopBar via VideoPageLayout in App.tsx)
 *
 * Displays every generated VideoHistoryEntry across all scripts in a
 * responsive grid. Users can filter by script and shot, sort by date,
 * pin/unpin, download, and delete clips.
 *
 * Implements US-048.
 */

import { useState, useMemo } from "react";
import { Clock, Film, Pin, PinOff, Download, Trash2, Check } from "lucide-react";
import { VideoPlayer } from "@/video/components/VideoPlayer";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { videoStorageService } from "@/video/lib/storage/storageService";
import type { Script, Shot, VideoHistoryEntry } from "@/video/lib/storage/types";
import { log } from "@/music/lib/actionLog";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A flattened view of a single VideoHistoryEntry with its context
 * (which script and shot it belongs to, and its position in the history array).
 */
interface FlatVideoEntry {
  entry: VideoHistoryEntry;
  script: Script;
  shot: Shot;
  /** 0-based shot index within the script's shots array. */
  shotIndex: number;
  /** 0-based history index within the shot's video.history array. */
  historyIndex: number;
}

type SortOrder = "newest" | "oldest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function extractFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split("/");
    const last = parts[parts.length - 1];
    if (last) return last;
  } catch {
    // fall through
  }
  return url.slice(-20) || "video";
}

/**
 * Build the flat list of all VideoHistoryEntry records from all scripts.
 * The list is sorted by generatedAt descending (newest first) by default.
 */
function buildFlatEntries(scripts: Script[]): FlatVideoEntry[] {
  const entries: FlatVideoEntry[] = [];
  for (const script of scripts) {
    script.shots.forEach((shot, shotIndex) => {
      shot.video.history.forEach((entry, historyIndex) => {
        entries.push({ entry, script, shot, shotIndex, historyIndex });
      });
    });
  }
  return entries;
}

// ─── VideoCard ────────────────────────────────────────────────────────────────

interface VideoCardProps {
  flat: FlatVideoEntry;
  onPin: (flat: FlatVideoEntry) => void;
  onDownload: (flat: FlatVideoEntry) => void;
  onDeleteRequest: (flat: FlatVideoEntry) => void;
}

function VideoCard({ flat, onPin, onDownload, onDeleteRequest }: VideoCardProps) {
  const { entry, script, shot, shotIndex, historyIndex } = flat;
  const isSelected = shot.video.selectedUrl === entry.url;

  const versionLabel = `Shot ${shotIndex + 1} · v${historyIndex + 1}`;

  return (
    <div
      className="rounded-lg border border-border bg-card flex flex-col overflow-hidden hover:shadow-md hover:border-foreground/20 transition-all"
      data-testid={`video-card-${encodeURIComponent(entry.url).slice(0, 40)}`}
    >
      {/* Thumbnail */}
      <VideoPlayer
        src={entry.url}
        testIdPrefix={`video-card-${encodeURIComponent(entry.url).slice(0, 40)}`}
        ariaLabel={`${versionLabel} from ${script.title}`}
        overlays={
          <>
            {entry.pinned && (
              <div
                className="absolute top-1.5 left-1.5 bg-amber-400/90 rounded-full p-1"
                aria-label="Pinned"
              >
                <Pin className="h-2.5 w-2.5 text-white fill-white" />
              </div>
            )}
            {isSelected && (
              <div
                className="absolute top-1.5 right-1.5 bg-green-500/90 rounded-full p-1"
                aria-label="Selected take"
              >
                <Check className="h-2.5 w-2.5 text-white" />
              </div>
            )}
          </>
        }
      />

      {/* Card body */}
      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
        {/* Version label + selected indicator */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-foreground">{versionLabel}</span>
          {isSelected && (
            <span className="flex items-center gap-0.5 text-[10px] text-green-600 font-medium">
              <Check className="h-3 w-3" />
              Selected
            </span>
          )}
        </div>

        {/* Script name */}
        <p className="text-[11px] text-muted-foreground truncate">{script.title}</p>

        {/* Shot title */}
        <p className="text-[11px] text-muted-foreground/70 truncate">{shot.title}</p>

        {/* Timestamp */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5 shrink-0" />
          {formatRelativeTime(entry.generatedAt)}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 mt-auto pt-1 flex-wrap">
          {/* Pin / Unpin */}
          <button
            type="button"
            onClick={() => onPin(flat)}
            className={[
              "flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] border transition-colors",
              entry.pinned
                ? "border-amber-400 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent",
            ].join(" ")}
            data-testid={`video-pin-btn-${encodeURIComponent(entry.url).slice(0, 40)}`}
            aria-label={entry.pinned ? "Unpin video" : "Pin video"}
            aria-pressed={entry.pinned}
          >
            {entry.pinned ? <PinOff className="h-3 w-3" aria-hidden="true" /> : <Pin className="h-3 w-3" aria-hidden="true" />}
          </button>

          {/* Download */}
          <button
            type="button"
            onClick={() => onDownload(flat)}
            className="flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Download video"
          >
            <Download className="h-3 w-3" />
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => onDeleteRequest(flat)}
            className="flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] border border-border bg-background text-muted-foreground hover:text-destructive hover:border-destructive hover:bg-accent transition-colors"
            aria-label="Delete video"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VideoVideos ───────────────────────────────────────────────────────────────

export default function VideoVideos() {
  const [scripts, setScripts] = useState<Script[]>(() =>
    videoStorageService.listScripts()
  );

  // Filter state
  const [selectedScriptId, setSelectedScriptId] = useState<string>("__all__");
  const [selectedShotId, setSelectedShotId] = useState<string>("__all__");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  // Confirm delete state — stores the entry to be deleted
  const [pendingDelete, setPendingDelete] = useState<FlatVideoEntry | null>(null);

  // Reload scripts from storage (called after mutations)
  function reloadScripts() {
    setScripts(videoStorageService.listScripts());
  }

  function handleScriptFilterChange(id: string) {
    setSelectedScriptId(id);
    // Reset shot filter whenever the script selection changes.
    setSelectedShotId("__all__");
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  /** Flat list of all history entries across all scripts. */
  const allEntries = useMemo(() => buildFlatEntries(scripts), [scripts]);

  /** Distinct script titles for the filter dropdown. */
  const scriptOptions = useMemo(
    () =>
      scripts.map((s) => ({ id: s.id, title: s.title })),
    [scripts]
  );

  /** The currently selected script (for the shots filter). */
  const selectedScript = useMemo(
    () =>
      selectedScriptId === "__all__"
        ? null
        : scripts.find((s) => s.id === selectedScriptId) ?? null,
    [scripts, selectedScriptId]
  );

  /** Filtered + sorted entries. */
  const displayedEntries = useMemo(() => {
    let filtered = allEntries;

    if (selectedScriptId !== "__all__") {
      filtered = filtered.filter((f) => f.script.id === selectedScriptId);
    }
    if (selectedShotId !== "__all__") {
      filtered = filtered.filter((f) => f.shot.id === selectedShotId);
    }

    filtered = filtered.slice().sort((a, b) => {
      const ta = new Date(a.entry.generatedAt).getTime();
      const tb = new Date(b.entry.generatedAt).getTime();
      return sortOrder === "newest" ? tb - ta : ta - tb;
    });

    return filtered;
  }, [allEntries, selectedScriptId, selectedShotId, sortOrder]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handlePin(flat: FlatVideoEntry) {
    const { entry, script, shot } = flat;
    const isPinned = entry.pinned;
    const updatedHistory: VideoHistoryEntry[] = shot.video.history.map((e) =>
      e.url === entry.url
        ? {
            ...e,
            pinned: !isPinned,
            pinnedAt: !isPinned ? new Date().toISOString() : undefined,
          }
        : e
    );
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id ? { ...s, video: { ...s.video, history: updatedHistory } } : s
    );
    videoStorageService.updateScript(script.id, { shots: updatedShots });
    log({
      category: "user:action",
      action: isPinned ? "video:take:unpin" : "video:take:pin",
      data: { scriptId: script.id, shotId: shot.id, url: entry.url },
    });
    reloadScripts();
  }

  function handleDownload(flat: FlatVideoEntry) {
    const a = document.createElement("a");
    a.href = flat.entry.url;
    a.download = extractFilename(flat.entry.url);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    log({
      category: "user:action",
      action: "video:take:download",
      data: { scriptId: flat.script.id, shotId: flat.shot.id, url: flat.entry.url },
    });
  }

  function handleDeleteConfirm() {
    if (!pendingDelete) return;
    const { entry, script, shot } = pendingDelete;
    const updatedHistory = shot.video.history.filter((e) => e.url !== entry.url);
    const newSelectedUrl =
      shot.video.selectedUrl === entry.url ? null : shot.video.selectedUrl;
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id
        ? {
            ...s,
            video: {
              selectedUrl: newSelectedUrl,
              history: updatedHistory,
            },
          }
        : s
    );
    videoStorageService.updateScript(script.id, { shots: updatedShots });
    log({
      category: "user:action",
      action: "video:take:delete",
      data: { scriptId: script.id, shotId: shot.id, url: entry.url },
    });
    setPendingDelete(null);
    reloadScripts();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">All Videos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse, pin, download, or delete every generated clip across all scripts.
        </p>
      </div>

      {/* Filter / sort bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Script filter */}
        <div className="flex flex-col gap-0.5">
          <label htmlFor="videos-filter-scripts" className="sr-only">
            Filter by script
          </label>
          <select
            id="videos-filter-scripts"
            data-testid="videos-filter-scripts"
            value={selectedScriptId}
            onChange={(e) => handleScriptFilterChange(e.target.value)}
            className="text-sm border border-border rounded-md bg-background px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Filter by script"
          >
            <option value="__all__">All Scripts</option>
            {scriptOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        {/* Shot filter — only when a specific script is selected */}
        {selectedScript !== null && (
          <div className="flex flex-col gap-0.5">
            <label htmlFor="videos-filter-shots" className="sr-only">
              Filter by shot
            </label>
            <select
              id="videos-filter-shots"
              data-testid="videos-filter-shots"
              value={selectedShotId}
              onChange={(e) => setSelectedShotId(e.target.value)}
              className="text-sm border border-border rounded-md bg-background px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Filter by shot"
            >
              <option value="__all__">All Shots</option>
              {selectedScript.shots.map((shot, idx) => (
                <option key={shot.id} value={shot.id}>
                  Shot {idx + 1} · {shot.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sort */}
        <div className="flex flex-col gap-0.5">
          <label htmlFor="videos-sort" className="sr-only">
            Sort order
          </label>
          <select
            id="videos-sort"
            data-testid="videos-sort"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="text-sm border border-border rounded-md bg-background px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label="Sort order"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      </div>

      {/* Grid or empty state */}
      {displayedEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Film className="h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-medium text-foreground">
              {allEntries.length === 0
                ? "No videos yet"
                : "No videos match the current filters"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {allEntries.length === 0
                ? "Generate clips in the script editor to see them here."
                : "Try selecting a different script or clearing the filters."}
            </p>
          </div>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          data-testid="all-videos-grid"
        >
          {displayedEntries.map((flat) => (
            <VideoCard
              key={`${flat.script.id}__${flat.shot.id}__${flat.historyIndex}`}
              flat={flat}
              onPin={handlePin}
              onDownload={handleDownload}
              onDeleteRequest={setPendingDelete}
            />
          ))}
        </div>
      )}

      {/* Confirm delete dialog */}
      {pendingDelete !== null && (
        <ConfirmDialog
          title="Delete video?"
          description="This will permanently remove this clip from the history. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
