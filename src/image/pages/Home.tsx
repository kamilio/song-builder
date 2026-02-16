import { useRef, useEffect, useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ImageIcon, LayoutList, Pin, Settings, Bug } from "lucide-react";
import { Textarea } from "@/shared/components/ui/textarea";
import { Button } from "@/shared/components/ui/button";
import { NavMenu } from "@/shared/components/NavMenu";
import type { MenuItem } from "@/shared/components/NavMenu";
import { imageStorageService } from "@/image/lib/storage";
import { useReportBug } from "@/shared/hooks/useReportBug";

const IMAGE_NAV_ITEMS: MenuItem[] = [
  {
    label: "All Sessions",
    href: "/image/sessions",
    icon: LayoutList,
    "data-testid": "nav-menu-all-sessions",
  },
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

const EXAMPLE_PROMPTS = [
  "A serene mountain landscape at golden hour with misty valleys",
  "A futuristic cityscape at night with neon reflections on wet streets",
  "A cozy cabin interior with a fireplace and snow falling outside",
  "An underwater coral reef scene with tropical fish and sunlight rays",
];

export default function ImageHome() {
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const { handleReportBug } = useReportBug();

  // Load the 2 most recent sessions for returning users.
  const recentSessions = imageStorageService
    .listSessions()
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .slice(0, 2);

  const hasHistory = recentSessions.length > 0;
  const visibleExamples = hasHistory ? EXAMPLE_PROMPTS.slice(0, 2) : EXAMPLE_PROMPTS;

  // Auto-focus the textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const session = imageStorageService.createSession(trimmed);
    navigate(`/image/sessions/${session.id}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-6 pt-20 pb-16 bg-gradient-to-b from-background to-secondary/30">
      <div className="fixed top-4 right-4 z-40">
        <NavMenu items={IMAGE_NAV_ITEMS} onReportBug={handleReportBug} />
      </div>

      {/* Hero icon + title */}
      <div className="mb-10 flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <ImageIcon className="w-8 h-8 text-primary-foreground" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Image Generator</h1>
          <p className="mt-1.5 text-muted-foreground text-base">
            Describe the image you want. AI brings it to life.
          </p>
        </div>
      </div>

      {/* Prompt form */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl flex flex-col gap-3"
        aria-label="New image prompt"
      >
        <Textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image you want to generate…"
          className="resize-none min-h-[120px] text-base shadow-sm"
          aria-label="Image prompt"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">⌘ + Enter to generate</span>
          <Button type="submit" disabled={!prompt.trim()}>
            Generate →
          </Button>
        </div>
      </form>

      {/* Recent sessions — only shown when the user has previous work */}
      {hasHistory && (
        <div className="mt-10 w-full max-w-xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Recent sessions
            </p>
            <Link
              to="/image/sessions"
              className="text-xs text-primary hover:underline underline-offset-2 transition-colors"
            >
              View all sessions →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentSessions.map((session) => (
              <Link
                key={session.id}
                to={`/image/sessions/${session.id}`}
                className="rounded-lg border border-border bg-card px-4 py-3 hover:shadow-md hover:border-foreground/20 transition-all text-sm font-medium truncate text-foreground"
                data-testid="recent-session-card"
              >
                {session.title}
              </Link>
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
              data-testid="example-prompt-btn"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
