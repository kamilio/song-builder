import { ReactNode } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Music, List, Mic2, Pin, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import Home from "@/pages/Home";
import LyricsList from "@/pages/LyricsList";
import LyricsGenerator from "@/pages/LyricsGenerator";
import SongGenerator from "@/pages/SongGenerator";
import PinnedSongs from "@/pages/PinnedSongs";
import Settings from "@/pages/Settings";

const navItems = [
  { to: "/lyrics", icon: List, label: "Lyrics List" },
  { to: "/lyrics/new", icon: Music, label: "Lyrics Generator" },
  { to: "/songs", icon: Mic2, label: "Song Generator" },
  { to: "/pinned", icon: Pin, label: "Pinned Songs" },
  { to: "/settings", icon: SettingsIcon, label: "Settings" },
];

function Sidebar() {
  return (
    <nav className="flex flex-col w-56 min-h-screen border-r bg-background p-4 gap-1">
      <div className="flex items-center gap-2 mb-6 px-2">
        <Music className="h-5 w-5" />
        <span className="font-semibold text-sm">Song Builder</span>
      </div>
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/lyrics"
          element={
            <Layout>
              <LyricsList />
            </Layout>
          }
        />
        <Route
          path="/lyrics/:id"
          element={
            <Layout>
              <LyricsGenerator />
            </Layout>
          }
        />
        <Route
          path="/lyrics/new"
          element={
            <Layout>
              <LyricsGenerator />
            </Layout>
          }
        />
        <Route
          path="/songs"
          element={
            <Layout>
              <SongGenerator />
            </Layout>
          }
        />
        <Route
          path="/pinned"
          element={
            <Layout>
              <PinnedSongs />
            </Layout>
          }
        />
        <Route
          path="/settings"
          element={
            <Layout>
              <Settings />
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
