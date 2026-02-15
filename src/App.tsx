import { ReactNode, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Music, List, Pin, Settings as SettingsIcon, Bug } from "lucide-react";
import { Link } from "react-router-dom";
import { Breadcrumb } from "@/music/components/Breadcrumb";
import { NavMenu } from "@/shared/components/NavMenu";
import type { MenuItem } from "@/shared/components/NavMenu";
import SharedHome from "@/shared/components/SharedHome";
import Home from "@/music/pages/Home";
import ImageHome from "@/image/pages/Home";
import ImageSessionView from "@/image/pages/SessionView";
import ImagePinnedImages from "@/image/pages/PinnedImages";
import LyricsList from "@/music/pages/LyricsList";
import LyricsGenerator from "@/music/pages/LyricsGenerator";
import SongGenerator from "@/music/pages/SongGenerator";
import PinnedSongs from "@/music/pages/PinnedSongs";
import Settings from "@/music/pages/Settings";
import { log, getAll } from "@/music/lib/actionLog";

/**
 * Logs every route change to the in-memory action log.
 * Must be rendered inside BrowserRouter so useLocation is available.
 */
function RouteLogger() {
  const location = useLocation();
  useEffect(() => {
    log({
      category: "navigation",
      action: "navigate",
      data: { path: location.pathname, search: location.search },
    });
  }, [location.pathname, location.search]);
  return null;
}

const MUSIC_NAV_ITEMS: MenuItem[] = [
  {
    label: "All Lyrics",
    href: "/music/lyrics",
    icon: List,
    "data-testid": "nav-menu-lyrics",
  },
  {
    label: "Pinned Songs",
    href: "/music/pinned",
    icon: Pin,
    "data-testid": "nav-menu-pinned",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: SettingsIcon,
    "data-testid": "nav-menu-settings",
  },
  {
    label: "Report Bug",
    icon: Bug,
    isReportBug: true,
    "data-testid": "nav-menu-report-bug",
  },
];

async function handleMusicReportBug() {
  log({
    category: "user:action",
    action: "report:bug",
    data: {},
  });
  const entries = getAll();
  await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
}

/**
 * Top bar shown on every page except Home.
 *
 * Left:  branding link back to /
 * Center: breadcrumb segments
 * Right: circular NavMenu button
 */
function TopBar() {
  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b bg-background/95 backdrop-blur-sm gap-4"
      data-testid="top-bar"
    >
      {/* Branding */}
      <Link
        to="/music"
        className="flex items-center gap-2 shrink-0 hover:opacity-75 transition-opacity"
        aria-label="Song Builder home"
      >
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
          <Music className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm hidden sm:inline">Song Builder</span>
      </Link>

      {/* Breadcrumbs — takes remaining space, truncates gracefully */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <Breadcrumb />
      </div>

      {/* Navigation menu */}
      <NavMenu items={MUSIC_NAV_ITEMS} onReportBug={handleMusicReportBug} />
    </header>
  );
}

/**
 * Layout wrapper used by all non-Home pages.
 * Renders the TopBar above the page content.
 */
function PageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteLogger />
      <Routes>
        {/* Root — shared landing with Music/Image tab switcher */}
        <Route path="/" element={<SharedHome />} />

        {/* Music — Home has no top bar */}
        <Route path="/music" element={<Home />} />

        {/* Image — Home has no top bar */}
        <Route path="/image" element={<ImageHome />} />

        {/* Image — Session view */}
        <Route path="/image/sessions/:id" element={<ImageSessionView />} />

        {/* Image — Pinned images page */}
        <Route path="/image/pinned" element={<ImagePinnedImages />} />

        {/* All other music pages — wrapped in PageLayout with TopBar */}
        <Route
          path="/music/lyrics"
          element={
            <PageLayout>
              <LyricsList />
            </PageLayout>
          }
        />
        <Route
          path="/music/lyrics/new"
          element={
            <PageLayout>
              <LyricsGenerator />
            </PageLayout>
          }
        />
        <Route
          path="/music/lyrics/:id"
          element={
            <PageLayout>
              <LyricsGenerator />
            </PageLayout>
          }
        />
        <Route
          path="/music/lyrics/:id/songs"
          element={
            <PageLayout>
              <SongGenerator />
            </PageLayout>
          }
        />
        <Route
          path="/music/songs"
          element={
            <PageLayout>
              <SongGenerator />
            </PageLayout>
          }
        />
        <Route
          path="/music/pinned"
          element={
            <PageLayout>
              <PinnedSongs />
            </PageLayout>
          }
        />
        <Route
          path="/settings"
          element={
            <PageLayout>
              <Settings />
            </PageLayout>
          }
        />
        <Route path="/music/settings" element={<Navigate to="/settings" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
