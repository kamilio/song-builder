/**
 * Breadcrumb bar for contextual navigation.
 *
 * Renders breadcrumb segments based on the current route:
 *   /lyrics                  → Lyrics
 *   /lyrics/:messageId       → Lyrics / {title}
 *   /lyrics/:messageId/songs → Lyrics / {title} / Songs
 *   /pinned                  → Pinned Songs
 *   /settings                → Settings
 *
 *   /video/scripts           → Scripts
 *   /video/scripts/:id       → Scripts / {script title}
 *   /video/scripts/:id/templates → Scripts / {script title} / Templates
 *   /video/scripts/:id/settings  → Scripts / {script title} / Settings
 *   /video/scripts/:id/:shotId   → Scripts / {script title} / {shot title}
 *   /video/videos            → All Videos
 *   /video/videos/pinned     → Pinned Videos
 *   /video/templates         → Video Templates
 *
 * Each segment is a clickable link except the last (current page).
 * The bar truncates on overflow; the rightmost segment is always visible via
 * `min-w-0 shrink` on earlier segments and `shrink-0` on the last.
 *
 * Returns null on the Home route (no breadcrumbs on /).
 */

import { Link, useLocation, useParams } from "react-router-dom";
import { getMessage } from "@/music/lib/storage/storageService";
import { getScript } from "@/video/lib/storage/storageService";

interface Segment {
  label: string;
  href?: string;
}

function useSegments(): Segment[] {
  const { pathname } = useLocation();
  const { id, shotId } = useParams<{ id?: string; shotId?: string }>();

  // ── Video routes ────────────────────────────────────────────────────────

  // /video/scripts/:id/templates
  if (pathname.match(/^\/video\/scripts\/[^/]+\/templates$/)) {
    const script = id ? getScript(id) : null;
    const title = script?.title ?? id ?? "…";
    return [
      { label: "Scripts", href: "/video/scripts" },
      { label: title, href: `/video/scripts/${id}` },
      { label: "Templates" },
    ];
  }

  // /video/scripts/:id/settings
  if (pathname.match(/^\/video\/scripts\/[^/]+\/settings$/)) {
    const script = id ? getScript(id) : null;
    const title = script?.title ?? id ?? "…";
    return [
      { label: "Scripts", href: "/video/scripts" },
      { label: title, href: `/video/scripts/${id}` },
      { label: "Settings" },
    ];
  }

  // /video/scripts/:id/:shotId — shot detail view
  if (pathname.match(/^\/video\/scripts\/[^/]+\/[^/]+$/) && shotId) {
    const script = id ? getScript(id) : null;
    const scriptTitle = script?.title ?? id ?? "…";
    const shot = script?.shots.find((s) => s.id === shotId);
    const shotTitle = shot?.title ?? shotId ?? "…";
    return [
      { label: "Scripts", href: "/video/scripts" },
      { label: scriptTitle, href: `/video/scripts/${id}` },
      { label: shotTitle },
    ];
  }

  // /video/scripts/:id — fetch title from video storage
  if (pathname.match(/^\/video\/scripts\/[^/]+$/)) {
    const script = id ? getScript(id) : null;
    const title = script?.title ?? id ?? "…";
    return [
      { label: "Scripts", href: "/video/scripts" },
      { label: title },
    ];
  }

  // /video/scripts (list)
  if (pathname === "/video/scripts") {
    return [{ label: "Scripts" }];
  }

  // /video/videos/pinned (must be before /video/videos)
  if (pathname === "/video/videos/pinned") {
    return [{ label: "Pinned Videos" }];
  }

  // /video/videos
  if (pathname === "/video/videos") {
    return [{ label: "All Videos" }];
  }

  // /video/templates
  if (pathname === "/video/templates") {
    return [{ label: "Video Templates" }];
  }

  // ── Music routes ────────────────────────────────────────────────────────

  // /music/lyrics/:messageId/songs
  if (pathname.match(/^\/music\/lyrics\/[^/]+\/songs/)) {
    const msg = id ? getMessage(id) : null;
    const title = msg?.title ?? id ?? "…";
    return [
      { label: "Lyrics", href: "/music/lyrics" },
      { label: title, href: `/music/lyrics/${id}` },
      { label: "Songs" },
    ];
  }

  // /music/lyrics/:messageId  (but not /music/lyrics/new — treat as generic Lyrics Generator)
  if (pathname.match(/^\/music\/lyrics\/[^/]+$/) && id && id !== "new") {
    const msg = getMessage(id);
    const title = msg?.title ?? id;
    return [
      { label: "Lyrics", href: "/music/lyrics" },
      { label: title },
    ];
  }

  // /music/lyrics (list) or /music/lyrics/new
  if (pathname === "/music/lyrics" || pathname === "/music/lyrics/new") {
    return [{ label: "Lyrics" }];
  }

  // /music/pinned
  if (pathname === "/music/pinned") {
    return [{ label: "Pinned Songs" }];
  }

  // /settings (or legacy /music/settings — redirect handles the latter)
  if (pathname === "/settings" || pathname === "/music/settings") {
    return [{ label: "Settings" }];
  }

  // /music/songs (legacy route)
  if (pathname === "/music/songs") {
    return [{ label: "Songs" }];
  }

  return [];
}

export function Breadcrumb() {
  const segments = useSegments();

  if (segments.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden"
      data-testid="breadcrumb"
    >
      {segments.map((seg, idx) => {
        const isLast = idx === segments.length - 1;

        return (
          <span key={idx} className="flex items-center gap-1 min-w-0">
            {idx > 0 && (
              <span className="shrink-0 select-none" aria-hidden="true">
                ›
              </span>
            )}
            {isLast ? (
              <span
                className="font-medium text-foreground truncate max-w-[160px] sm:max-w-none shrink-0"
                aria-current="page"
                title={seg.label}
                data-testid={`breadcrumb-segment-${idx}`}
              >
                {seg.label}
              </span>
            ) : (
              <Link
                to={seg.href!}
                className="truncate hover:text-foreground transition-colors min-w-0 shrink"
                title={seg.label}
                data-testid={`breadcrumb-segment-${idx}`}
              >
                {seg.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
