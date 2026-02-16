/**
 * SharedHome — root landing page at /.
 *
 * Shows Music and Image tabs. Active tab is determined by the current URL prefix.
 * Clicking a tab navigates to /music or /image.
 *
 * Acceptance criteria (US-009):
 *   - Music tab links to /music
 *   - Image tab links to /image
 *   - Active tab visually highlighted based on current URL prefix
 */

import { Link, useLocation } from "react-router-dom";
import { Music, ImageIcon } from "lucide-react";

export default function SharedHome() {
  const { pathname } = useLocation();

  const musicActive = pathname.startsWith("/music") || pathname === "/";
  const imageActive = pathname.startsWith("/image");

  const tabBase =
    "flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-full border transition-colors";
  const activeTab =
    "bg-primary text-primary-foreground border-primary shadow-sm";
  const inactiveTab =
    "bg-background text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 bg-gradient-to-b from-background to-secondary/30"
      data-testid="shared-home"
    >
      {/* Branding */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <Music className="w-8 h-8 text-primary-foreground" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Studio</h1>
          <p className="mt-1.5 text-muted-foreground text-base">
            Create music and images with AI.
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <nav
        aria-label="Feature tabs"
        className="flex items-center gap-3"
        data-testid="feature-tabs"
      >
        <Link
          to="/music"
          data-testid="tab-music"
          className={`${tabBase} ${musicActive && !imageActive ? activeTab : inactiveTab}`}
          aria-current={musicActive && !imageActive ? "page" : undefined}
        >
          <Music className="h-4 w-4 shrink-0" aria-hidden="true" />
          Music
        </Link>

        <Link
          to="/image"
          data-testid="tab-image"
          className={`${tabBase} ${imageActive ? activeTab : inactiveTab}`}
          aria-current={imageActive ? "page" : undefined}
        >
          <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          Image
        </Link>
      </nav>
    </div>
  );
}
