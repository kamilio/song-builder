import { ReactNode, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Music, List, Pin, Plus, Settings as SettingsIcon, Bug, Film, LayoutList, Video, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Breadcrumb } from "@/music/components/Breadcrumb";
import { NavMenu } from "@/shared/components/NavMenu";
import type { MenuItem } from "@/shared/components/NavMenu";
import SharedHome from "@/shared/components/SharedHome";
import Home from "@/music/pages/Home";
import ImageHome from "@/image/pages/Home";
import ImageAllSessions from "@/image/pages/AllSessions";
import ImageSessionView from "@/image/pages/SessionView";
import ImagePinnedImages from "@/image/pages/PinnedImages";
import LyricsList from "@/music/pages/LyricsList";
import LyricsGenerator from "@/music/pages/LyricsGenerator";
import SongGenerator from "@/music/pages/SongGenerator";
import PinnedSongs from "@/music/pages/PinnedSongs";
import Settings from "@/music/pages/Settings";
import VideoHome from "@/video/pages/VideoHome";
import VideoScripts from "@/video/pages/VideoScripts";
import VideoScriptView from "@/video/pages/VideoScriptView";
import VideoShotView from "@/video/pages/VideoShotView";
import VideoScriptSettings from "@/video/pages/VideoScriptSettings";
import VideoVideos from "@/video/pages/VideoVideos";
import VideoPinnedVideos from "@/video/pages/VideoPinnedVideos";
import VideoTemplates from "@/video/pages/VideoTemplates";
import { log } from "@/music/lib/actionLog";
import { useReportBug } from "@/shared/hooks/useReportBug";
import { Toast } from "@/shared/components/Toast";
import { useStorageQuotaToast } from "@/shared/hooks/useStorageQuotaToast";
import { PoeBalanceProvider, usePoeBalanceContext } from "@/shared/context/PoeBalanceContext";

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

export const VIDEO_NAV_ITEMS: MenuItem[] = [
  {
    label: "Scripts",
    href: "/video/scripts",
    icon: LayoutList,
    "data-testid": "nav-menu-video-scripts",
  },
  {
    label: "All Videos",
    href: "/video/videos",
    icon: Video,
    "data-testid": "nav-menu-video-all-videos",
  },
  {
    label: "Pinned Videos",
    href: "/video/videos/pinned",
    icon: Pin,
    "data-testid": "nav-menu-video-pinned",
  },
  {
    label: "Templates",
    href: "/video/templates",
    icon: Film,
    "data-testid": "nav-menu-video-templates",
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

interface TopBarProps {
  /** Icon displayed in the branding area. */
  BrandIcon: LucideIcon;
  /** Nav items passed to the NavMenu. */
  navItems: MenuItem[];
  /** When true, shows the 'New Lyrics' shortcut button (music pages only). */
  showNewLyrics?: boolean;
}

/**
 * Top bar shown on every page except Home.
 *
 * Left:  branding link back to /
 * Center: breadcrumb segments
 * Right: balance badge + optional New Lyrics shortcut + circular NavMenu button
 *
 * Parameterised via props so music, video, and future features share one component.
 */
function TopBar({ BrandIcon, navItems, showNewLyrics = false }: TopBarProps) {
  const { handleReportBug } = useReportBug();
  const { balance } = usePoeBalanceContext();
  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b bg-background/95 backdrop-blur-sm gap-4"
      data-testid="top-bar"
    >
      {/* Branding */}
      <Link
        to="/"
        className="flex items-center gap-2 shrink-0 hover:opacity-75 transition-opacity"
        aria-label="Studio home"
      >
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
          <BrandIcon className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm hidden sm:inline">Studio</span>
      </Link>

      {/* Breadcrumbs — takes remaining space, truncates gracefully */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <Breadcrumb />
      </div>

      {/* Balance badge + optional New Lyrics shortcut + Navigation menu */}
      <div className="flex items-center gap-2 shrink-0">
        {balance !== null && (
          <span
            className="text-xs text-muted-foreground tabular-nums"
            data-testid="poe-balance"
            aria-label={`POE balance: ${balance}`}
          >
            {balance}
          </span>
        )}
        {showNewLyrics && (
          <Link
            to="/music/lyrics/new"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-border bg-background hover:bg-accent transition-colors"
            data-testid="new-lyrics-btn"
            aria-label="New lyrics"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">New Lyrics</span>
          </Link>
        )}
        <NavMenu items={navItems} onReportBug={handleReportBug} />
      </div>
    </header>
  );
}

/**
 * Layout wrapper for /music/* and /settings pages.
 * Uses Music icon in branding and shows the 'New Lyrics' shortcut button.
 */
function PageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar BrandIcon={Music} navItems={MUSIC_NAV_ITEMS} showNewLyrics />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

/**
 * Layout wrapper for /video/* pages.
 * Uses Film icon in branding; does NOT show the music-specific 'New Lyrics' button.
 */
function VideoPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar BrandIcon={Film} navItems={VIDEO_NAV_ITEMS} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

/**
 * Renders a global toast when localStorage quota is exceeded.
 * Must be inside BrowserRouter so React hooks work; lives at the root so it
 * covers every page.
 */
function StorageQuotaToast() {
  const [toast, showToast] = useStorageQuotaToast();
  return <Toast toast={toast} onDismiss={() => showToast(null)} />;
}

export default function App() {
  return (
    <PoeBalanceProvider>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <RouteLogger />
      <StorageQuotaToast />
      <Routes>
        {/* Root — shared landing with Music/Image tab switcher */}
        <Route path="/" element={<SharedHome />} />

        {/* Music — Home has no top bar */}
        <Route path="/music" element={<Home />} />

        {/* Image — Home has no top bar */}
        <Route path="/image" element={<ImageHome />} />

        {/* Image — All sessions list (must be before :id route) */}
        <Route path="/image/sessions" element={<ImageAllSessions />} />

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

        {/* Video — Home has no TopBar */}
        <Route path="/video" element={<VideoHome />} />

        {/* Video — All Scripts list */}
        <Route
          path="/video/scripts"
          element={
            <VideoPageLayout>
              <VideoScripts />
            </VideoPageLayout>
          }
        />

        {/* Video — Script editor (must be after /video/scripts) */}
        <Route
          path="/video/scripts/:id"
          element={
            <VideoPageLayout>
              <VideoScriptView />
            </VideoPageLayout>
          }
        />

        {/* Video — Script templates sub-route (must be before /:shotId) */}
        <Route
          path="/video/scripts/:id/templates"
          element={
            <VideoPageLayout>
              <VideoScriptView />
            </VideoPageLayout>
          }
        />

        {/* Video — Script settings sub-route (must be before /:shotId) */}
        <Route
          path="/video/scripts/:id/settings"
          element={
            <VideoPageLayout>
              <VideoScriptSettings />
            </VideoPageLayout>
          }
        />

        {/* Video — Shot detail sub-route (after /templates and /settings) */}
        <Route
          path="/video/scripts/:id/:shotId"
          element={
            <VideoPageLayout>
              <VideoShotView />
            </VideoPageLayout>
          }
        />

        {/* Video — All Videos (must be before /video/videos/pinned) */}
        <Route
          path="/video/videos"
          element={
            <VideoPageLayout>
              <VideoVideos />
            </VideoPageLayout>
          }
        />

        {/* Video — Pinned Videos */}
        <Route
          path="/video/videos/pinned"
          element={
            <VideoPageLayout>
              <VideoPinnedVideos />
            </VideoPageLayout>
          }
        />

        {/* Video — Global Templates */}
        <Route
          path="/video/templates"
          element={
            <VideoPageLayout>
              <VideoTemplates />
            </VideoPageLayout>
          }
        />
      </Routes>
    </BrowserRouter>
    </PoeBalanceProvider>
  );
}
