import { ReactNode, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Music } from "lucide-react";
import { Link } from "react-router-dom";
import { Breadcrumb } from "@/components/Breadcrumb";
import { NavMenu } from "@/components/NavMenu";
import Home from "@/pages/Home";
import LyricsList from "@/pages/LyricsList";
import LyricsGenerator from "@/pages/LyricsGenerator";
import SongGenerator from "@/pages/SongGenerator";
import PinnedSongs from "@/pages/PinnedSongs";
import Settings from "@/pages/Settings";
import { log } from "@/lib/actionLog";

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
      className="sticky top-0 z-40 flex items-center justify-between h-12 px-4 border-b bg-background gap-4"
      data-testid="top-bar"
    >
      {/* Branding */}
      <Link
        to="/"
        className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
        aria-label="Song Builder home"
      >
        <Music className="h-4 w-4" />
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
        {/* Home — no top bar */}
        <Route path="/" element={<Home />} />

        {/* All other pages — wrapped in PageLayout with TopBar */}
        <Route
          path="/lyrics"
          element={
            <PageLayout>
              <LyricsList />
            </PageLayout>
          }
        />
        <Route
          path="/lyrics/new"
          element={
            <PageLayout>
              <LyricsGenerator />
            </PageLayout>
          }
        />
        <Route
          path="/lyrics/:id"
          element={
            <PageLayout>
              <LyricsGenerator />
            </PageLayout>
          }
        />
        <Route
          path="/lyrics/:id/songs"
          element={
            <PageLayout>
              <SongGenerator />
            </PageLayout>
          }
        />
        <Route
          path="/songs"
          element={
            <PageLayout>
              <SongGenerator />
            </PageLayout>
          }
        />
        <Route
          path="/pinned"
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
      </Routes>
    </BrowserRouter>
  );
}
