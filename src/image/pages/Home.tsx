import { useRef, useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ImageIcon, Pin, Settings, Bug } from "lucide-react";
import { Textarea } from "@/shared/components/ui/textarea";
import { Button } from "@/shared/components/ui/button";
import { NavMenu } from "@/shared/components/NavMenu";
import type { MenuItem } from "@/shared/components/NavMenu";
import { imageStorageService } from "@/image/lib/storage";
import { log, getAll } from "@/music/lib/actionLog";

const IMAGE_NAV_ITEMS: MenuItem[] = [
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

async function handleImageReportBug() {
  log({
    category: "user:action",
    action: "report:bug",
    data: {},
  });
  const entries = getAll();
  await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
}

export default function ImageHome() {
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

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
        <NavMenu items={IMAGE_NAV_ITEMS} onReportBug={handleImageReportBug} />
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
    </div>
  );
}
