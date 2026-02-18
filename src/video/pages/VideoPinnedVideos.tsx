/**
 * Pinned Videos page.
 *
 * Route: /video/videos/pinned (TopBar via VideoPageLayout in App.tsx)
 *
 * Displays only VideoHistoryEntry records with pinned: true across all
 * scripts. Users can unpin, download, or navigate directly to the shot
 * in the script editor (Shot mode).
 *
 * Implements US-049.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Pin, PinOff, Download, Check, ArrowRight, Film } from "lucide-react";
import { VideoPlayer } from "@/video/components/VideoPlayer";
import { videoStorageService } from "@/video/lib/storage/storageService";
import type { Script, Shot, VideoHistoryEntry } from "@/video/lib/storage/types";
import { log } from "@/music/lib/actionLog";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A flattened view of a single pinned VideoHistoryEntry with its context.
 */
interface FlatPinnedEntry {
  entry: VideoHistoryEntry;
  script: Script;
  shot: Shot;
  /** 0-based shot index within the script's shots array. */
  shotIndex: number;
  /** 0-based history index within the shot's video.history array. */
  historyIndex: number;
}

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
 * Build a flat list of all pinned VideoHistoryEntry records across all scripts,
 * sorted by pinnedAt (or generatedAt as fallback) descending.
 */
function buildPinnedEntries(scripts: Script[]): FlatPinnedEntry[] {
  const entries: FlatPinnedEntry[] = [];
  for (const script of scripts) {
    script.shots.forEach((shot, shotIndex) => {
      shot.video.history.forEach((entry, historyIndex) => {
        if (entry.pinned) {
          entries.push({ entry, script, shot, shotIndex, historyIndex });
        }
      });
    });
  }
  // Sort by pinnedAt desc, falling back to generatedAt
  entries.sort((a, b) => {
    const ta = new Date(a.entry.pinnedAt ?? a.entry.generatedAt).getTime();
    const tb = new Date(b.entry.pinnedAt ?? b.entry.generatedAt).getTime();
    return tb - ta;
  });
  return entries;
}

// ─── PinnedCard ───────────────────────────────────────────────────────────────

interface PinnedCardProps {
  flat: FlatPinnedEntry;
  onUnpin: (flat: FlatPinnedEntry) => void;
  onDownload: (flat: FlatPinnedEntry) => void;
  onOpen: (flat: FlatPinnedEntry) => void;
}

function PinnedCard({ flat, onUnpin, onDownload, onOpen }: PinnedCardProps) {
  const { entry, script, shot, shotIndex, historyIndex } = flat;
  const isSelected = shot.video.selectedUrl === entry.url;
  const versionLabel = `Shot ${shotIndex + 1} · v${historyIndex + 1}`;
  const pinnedTimeLabel = `Pinned ${formatRelativeTime(entry.pinnedAt ?? entry.generatedAt)}`;
  const urlHash = encodeURIComponent(entry.url).slice(0, 40);

  return (
    <div
      className="rounded-lg border border-border bg-card flex flex-col overflow-hidden hover:shadow-md hover:border-foreground/20 transition-all"
      data-testid={`pinned-card-${urlHash}`}
    >
      {/* Thumbnail */}
      <VideoPlayer
        src={entry.url}
        testIdPrefix={`pinned-card-${urlHash}`}
        ariaLabel={`${versionLabel} from ${script.title}`}
        overlays={
          <>
            <div
              className="absolute top-1.5 left-1.5 bg-amber-400/90 rounded-full p-1"
              aria-label="Pinned"
            >
              <Pin className="h-2.5 w-2.5 text-white fill-white" />
            </div>
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

        {/* Pinned timestamp */}
        <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <Pin className="h-2.5 w-2.5 shrink-0" />
          {pinnedTimeLabel}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 mt-auto pt-1 flex-wrap">
          {/* Unpin */}
          <button
            type="button"
            onClick={() => onUnpin(flat)}
            className="flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] border border-amber-400 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 transition-colors"
            data-testid={`pinned-unpin-btn-${urlHash}`}
            aria-label="Unpin video"
            aria-pressed={true}
          >
            <PinOff className="h-3 w-3" aria-hidden="true" />
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

          {/* Open in editor → Shot mode */}
          <button
            type="button"
            onClick={() => onOpen(flat)}
            className="flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ml-auto"
            data-testid={`pinned-open-btn-${urlHash}`}
            aria-label={`Open ${versionLabel} in script editor`}
          >
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VideoPinnedVideos ────────────────────────────────────────────────────────

export default function VideoPinnedVideos() {
  const navigate = useNavigate();
  const [scripts, setScripts] = useState<Script[]>(() =>
    videoStorageService.listScripts()
  );

  // Reload scripts from storage (called after mutations)
  function reloadScripts() {
    setScripts(videoStorageService.listScripts());
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const pinnedEntries = useMemo(() => buildPinnedEntries(scripts), [scripts]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleUnpin(flat: FlatPinnedEntry) {
    const { entry, script, shot } = flat;
    const updatedHistory: VideoHistoryEntry[] = shot.video.history.map((e) =>
      e.url === entry.url
        ? { ...e, pinned: false, pinnedAt: undefined }
        : e
    );
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id ? { ...s, video: { ...s.video, history: updatedHistory } } : s
    );
    videoStorageService.updateScript(script.id, { shots: updatedShots });
    log({
      category: "user:action",
      action: "video:take:unpin",
      data: { scriptId: script.id, shotId: shot.id, url: entry.url },
    });
    reloadScripts();
  }

  function handleDownload(flat: FlatPinnedEntry) {
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

  function handleOpen(flat: FlatPinnedEntry) {
    navigate(`/video/scripts/${flat.script.id}`, {
      state: { targetShotIndex: flat.shotIndex },
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Pinned Videos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Videos you&apos;ve pinned for safekeeping. Generation is expensive — pin the good ones.
        </p>
      </div>

      {/* Grid or empty state */}
      {pinnedEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Film className="h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-medium text-foreground">No pinned videos yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Pin clips from the editor or All Videos page.
            </p>
          </div>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          data-testid="pinned-videos-grid"
        >
          {pinnedEntries.map((flat) => (
            <PinnedCard
              key={`${flat.script.id}__${flat.shot.id}__${flat.historyIndex}`}
              flat={flat}
              onUnpin={handleUnpin}
              onDownload={handleDownload}
              onOpen={handleOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
