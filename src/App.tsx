import { ReactNode, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Music } from "lucide-react";
import { Link } from "react-router-dom";
import { Breadcrumb } from "@/music/components/Breadcrumb";
import { NavMenu } from "@/music/components/NavMenu";
import Home from "@/music/pages/Home";
import LyricsList from "@/music/pages/LyricsList";
import LyricsGenerator from "@/music/pages/LyricsGenerator";
import SongGenerator from "@/music/pages/SongGenerator";
import PinnedSongs from "@/music/pages/PinnedSongs";
import Settings from "@/music/pages/Settings";
import { log } from "@/music/lib/actionLog";

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
      <NavMenu />
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
        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/music" replace />} />

        {/* Music — Home has no top bar */}
        <Route path="/music" element={<Home />} />

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
          path="/music/settings"
          element={
            <PageLayout>
              <Settings />
            </PageLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
