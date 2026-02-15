/**
 * SessionView page (US-014)
 *
 * Route: /image/sessions/:id
 *
 * Loads the ImageSession, all ImageGenerations, and all ImageItems for the
 * given session id from localStorage via imageStorageService. Shows a 404
 * message if the session does not exist.
 *
 * Layout (three structural regions):
 *   TopBar  — branding + NavMenu with image-specific items
 *   ──────────────────────────────────────────────────────
 *   main pane (center/left)  │  thumbnail panel (right)
 *   ─────────────────────────┘──────────────────────────
 *   bottom input bar (full width)
 *
 * On mobile (< 640px) the thumbnail panel collapses into a horizontal
 * scrollable strip above the bottom input bar.
 *
 * Subsequent stories (US-015 – US-021) will fill the three regions with
 * real content. For now each region renders a labelled placeholder so the
 * structural skeleton is testable.
 */

import { Link, Navigate, useParams } from "react-router-dom";
import { ImageIcon, Pin, Settings, Bug } from "lucide-react";
import { NavMenu } from "@/shared/components/NavMenu";
import type { MenuItem } from "@/shared/components/NavMenu";
import { imageStorageService } from "@/image/lib/storage";
import type { ImageSession, ImageGeneration, ImageItem } from "@/image/lib/storage";
import { log, getAll } from "@/music/lib/actionLog";

// ─── Navigation items ──────────────────────────────────────────────────────

const IMAGE_NAV_ITEMS: MenuItem[] = [
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

async function handleImageReportBug() {
  log({
    category: "user:action",
    action: "report:bug",
    data: {},
  });
  const entries = getAll();
  await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
}

// ─── TopBar ────────────────────────────────────────────────────────────────

function TopBar() {
  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b bg-background/95 backdrop-blur-sm gap-4"
      data-testid="top-bar"
    >
      <Link
        to="/image"
        className="flex items-center gap-2 shrink-0 hover:opacity-75 transition-opacity"
        aria-label="Image Generator home"
      >
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
          <ImageIcon className="h-3.5 w-3.5 text-primary-foreground" aria-hidden="true" />
        </div>
        <span className="font-semibold text-sm hidden sm:inline">Image Generator</span>
      </Link>

      <NavMenu items={IMAGE_NAV_ITEMS} onReportBug={handleImageReportBug} />
    </header>
  );
}

// ─── SessionView ───────────────────────────────────────────────────────────

interface SessionData {
  session: ImageSession;
  generations: ImageGeneration[];
  items: ImageItem[];
}

function loadSession(id: string | undefined): SessionData | null {
  if (!id) return null;
  const session = imageStorageService.getSession(id);
  if (!session) return null;
  return {
    session,
    generations: imageStorageService.getGenerationsBySession(id),
    items: imageStorageService.listItemsBySession(id),
  };
}

export default function SessionView() {
  const { id } = useParams<{ id: string }>();

  // Derive session data synchronously from storage on each render.
  // This avoids the need for useEffect + setState and keeps the logic
  // straightforward since storage reads are synchronous.
  const data = loadSession(id);

  if (!data) {
    return <Navigate to="/image" replace />;
  }

  return (
    <div className="flex flex-col h-screen" data-testid="session-view">
      <TopBar />

      {/*
       * Body: three structural regions.
       *
       * Desktop (≥ 640px):
       *   [ main pane (flex-1) | thumbnail panel (fixed width) ]
       *   [ bottom input bar (full width)                       ]
       *
       * Mobile (< 640px):
       *   [ main pane (flex-1)                       ]
       *   [ thumbnail strip (horizontal scroll)      ]
       *   [ bottom input bar                         ]
       */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Main + thumbnail row */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ── Main pane ──────────────────────────────────────────────── */}
          <main
            className="flex-1 overflow-auto p-4"
            aria-label="Generated images"
            data-testid="main-pane"
          >
            {/* Placeholder — content filled by US-015 */}
            <p className="text-muted-foreground text-sm" data-testid="main-pane-placeholder">
              {`Session: ${data.session.title}`}
            </p>
          </main>

          {/* ── Thumbnail panel (desktop right panel) ──────────────────── */}
          <aside
            className="hidden sm:flex flex-col w-40 border-l overflow-y-auto p-2 shrink-0"
            aria-label="Image thumbnails"
            data-testid="thumbnail-panel"
          >
            {/* Placeholder — content filled by US-016 */}
            <p className="text-xs text-muted-foreground text-center mt-2" data-testid="thumbnail-panel-placeholder">
              Thumbnails
            </p>
          </aside>
        </div>

        {/* ── Mobile thumbnail strip (below main pane, above input) ─── */}
        <div
          className="flex sm:hidden overflow-x-auto border-t p-2 gap-2 shrink-0"
          aria-label="Image thumbnails"
          data-testid="thumbnail-strip"
        >
          {/* Placeholder — content filled by US-016 */}
          <p className="text-xs text-muted-foreground whitespace-nowrap" data-testid="thumbnail-strip-placeholder">
            Thumbnails
          </p>
        </div>

        {/* ── Bottom input bar ──────────────────────────────────────────── */}
        <div
          className="border-t bg-background px-4 py-3 shrink-0"
          data-testid="bottom-bar"
        >
          {/* Placeholder — content filled by US-018 */}
          <p className="text-xs text-muted-foreground" data-testid="bottom-bar-placeholder">
            Prompt input
          </p>
        </div>
      </div>
    </div>
  );
}
