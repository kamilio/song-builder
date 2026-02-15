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
 * Each segment is a clickable link except the last (current page).
 * The bar truncates on overflow; the rightmost segment is always visible via
 * `min-w-0 shrink` on earlier segments and `shrink-0` on the last.
 *
 * Returns null on the Home route (no breadcrumbs on /).
 */

import { Link, useLocation, useParams } from "react-router-dom";
import { getMessage } from "@/music/lib/storage/storageService";

interface Segment {
  label: string;
  href?: string;
}

function useSegments(): Segment[] {
  const { pathname } = useLocation();
  const { id: messageId } = useParams<{ id?: string }>();

  // /music/lyrics/:messageId/songs
  if (pathname.match(/^\/music\/lyrics\/[^/]+\/songs/)) {
    const msg = messageId ? getMessage(messageId) : null;
    const title = msg?.title ?? messageId ?? "…";
    return [
      { label: "Lyrics", href: "/music/lyrics" },
      { label: title, href: `/music/lyrics/${messageId}` },
      { label: "Songs" },
    ];
  }

  // /music/lyrics/:messageId  (but not /music/lyrics/new — treat as generic Lyrics Generator)
  if (pathname.match(/^\/music\/lyrics\/[^/]+$/) && messageId && messageId !== "new") {
    const msg = getMessage(messageId);
    const title = msg?.title ?? messageId;
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

  // /music/settings
  if (pathname === "/music/settings") {
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
    >
      {segments.map((seg, idx) => {
        const isLast = idx === segments.length - 1;

        return (
          <span key={idx} className="flex items-center gap-1 min-w-0">
            {idx > 0 && (
              <span className="shrink-0 select-none" aria-hidden="true">
                /
              </span>
            )}
            {isLast ? (
              <span
                className="font-medium text-foreground truncate max-w-[160px] sm:max-w-none shrink-0"
                aria-current="page"
                title={seg.label}
              >
                {seg.label}
              </span>
            ) : (
              <Link
                to={seg.href!}
                className="truncate hover:text-foreground transition-colors min-w-0 shrink"
                title={seg.label}
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
