import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { List, Pin, Settings, Bug } from "lucide-react";
import { Textarea } from "@/shared/components/ui/textarea";
import { Button } from "@/shared/components/ui/button";
import { LyricsItemCard } from "@/music/components/LyricsItemCard";
import { storageService } from "@/music/lib/storage";
import { NavMenu } from "@/shared/components/NavMenu";
import type { MenuItem } from "@/shared/components/NavMenu";
import { log, getAll } from "@/music/lib/actionLog";

const HOME_NAV_ITEMS: MenuItem[] = [
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
    href: "/music/settings",
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

async function handleHomeReportBug() {
  log({
    category: "user:action",
    action: "report:bug",
    data: {},
  });
  const entries = getAll();
  await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
}

const EXAMPLE_PROMPTS = [
  "A melancholy indie folk song about missing someone on a rainy day",
  "An upbeat pop anthem about chasing your dreams in a new city",
  "A slow blues song about fixing an old car in the summer heat",
  "An acoustic love song written from the perspective of a lighthouse keeper",
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const navigate = useNavigate();

  // Load the 2 most recent assistant lyrics for returning users.
  const recentLyrics = storageService
    .getMessages()
    .filter((m) => m.role === "assistant" && !m.deleted)
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .slice(0, 2);

  const hasHistory = recentLyrics.length > 0;
  const visibleExamples = hasHistory ? EXAMPLE_PROMPTS.slice(0, 2) : EXAMPLE_PROMPTS;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const message = storageService.createMessage({
      role: "user",
      content: trimmed,
      parentId: null,
    });

    navigate(`/music/lyrics/${message.id}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-6 pt-20 pb-16 bg-gradient-to-b from-background to-secondary/30">
      <div className="fixed top-4 right-4 z-40">
        <NavMenu items={HOME_NAV_ITEMS} onReportBug={handleHomeReportBug} />
      </div>
      {/* Logo + wordmark */}
      <div className="mb-10 flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8 text-primary-foreground"
            aria-hidden="true"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Song Builder</h1>
          <p className="mt-1.5 text-muted-foreground text-base">
            Describe the song you want. Claude writes the lyrics, ElevenLabs makes it real.
          </p>
        </div>
      </div>

      {/* Prompt form */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl flex flex-col gap-3"
        aria-label="New song prompt"
      >
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What song do you want to make?"
          className="resize-none min-h-[120px] text-base shadow-sm"
          aria-label="Song prompt"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            ⌘ + Enter to start
          </span>
          <Button type="submit" disabled={!prompt.trim()}>
            Start writing →
          </Button>
        </div>
      </form>

      {/* Recent lyrics — only shown when the user has previous work */}
      {hasHistory && (
        <div className="mt-10 w-full max-w-xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Recent lyrics
            </p>
            <Link
              to="/music/lyrics"
              className="text-xs text-primary hover:underline underline-offset-2 transition-colors"
            >
              See all lyrics →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentLyrics.map((msg) => (
              <LyricsItemCard key={msg.id} message={msg} />
            ))}
          </div>
        </div>
      )}

      {/* Example prompts */}
      <div className="mt-10 w-full max-w-xl">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Try an example
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibleExamples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="text-left text-sm px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-secondary/60 text-foreground transition-colors leading-snug"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
