/**
 * Video Home page.
 *
 * Route: /video (no TopBar)
 *
 * Landing page for the Video feature (US-038).
 *
 * - Shows a prompt textarea + Generate Script button.
 * - Generate Script calls LLM (Claude Sonnet), parses YAML response,
 *   creates a script in storage, then navigates to /video/scripts/:id.
 * - isMounted ref prevents navigation if the component unmounts mid-generation.
 * - refreshBalance is called after generation completes.
 * - Displays the 4 most recently updated scripts.
 * - Each script card has an Edit button and ⋯ overflow menu (Rename / Delete).
 */

import { useRef, useEffect, useState, FormEvent, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Film, MoreHorizontal, Pencil, Trash2, Check, X } from "lucide-react";
import { Textarea } from "@/shared/components/ui/textarea";
import { Button } from "@/shared/components/ui/button";
import { NavMenu } from "@/shared/components/NavMenu";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { VIDEO_NAV_ITEMS } from "@/App";
import { videoStorageService } from "@/video/lib/storage/storageService";
import type { Script } from "@/video/lib/storage/types";
import { createLLMClient } from "@/shared/lib/llm/factory";
import { getSettings } from "@/music/lib/storage";
import { usePoeBalanceContext } from "@/shared/context/PoeBalanceContext";
import { useReportBug } from "@/shared/hooks/useReportBug";
import { useApiKeyGuard } from "@/shared/hooks/useApiKeyGuard";
import { ApiKeyMissingModal } from "@/shared/components/ApiKeyMissingModal";
import { load as yamlLoad } from "js-yaml";

// ─── YAML parsing ─────────────────────────────────────────────────────────────

interface YamlShot {
  title?: string;
  prompt?: string;
  narration?: {
    enabled?: boolean;
    text?: string;
  };
}

interface YamlScript {
  title?: string;
  settings?: {
    subtitles?: boolean;
    default_audio?: string;
  };
  shots?: YamlShot[];
}

/**
 * Parse a YAML string returned by the LLM into a Script-compatible structure.
 * Strips any markdown code fences before parsing.
 * Returns null if parsing fails.
 */
function parseScriptYaml(raw: string): YamlScript | null {
  try {
    // Strip markdown code fences (```yaml ... ``` or ``` ... ```)
    const stripped = raw.replace(/^```(?:yaml)?\s*/im, "").replace(/```\s*$/im, "").trim();
    const parsed = yamlLoad(stripped);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as YamlScript;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ─── Script Card ──────────────────────────────────────────────────────────────

interface ScriptCardProps {
  script: Script;
  onDeleted: () => void;
  onRenamed: (id: string, newTitle: string) => void;
}

function ScriptCard({ script, onDeleted, onRenamed }: ScriptCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(script.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const shotCount = script.shots.length;
  const durationS = shotCount * 8;

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  function handleRename() {
    setMenuOpen(false);
    setRenameValue(script.title);
    setIsRenaming(true);
  }

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== script.title) {
      videoStorageService.updateScript(script.id, { title: trimmed });
      onRenamed(script.id, trimmed);
    }
    setIsRenaming(false);
  }

  function cancelRename() {
    setRenameValue(script.title);
    setIsRenaming(false);
  }

  function handleDelete() {
    setMenuOpen(false);
    setConfirmDelete(true);
  }

  function confirmDeleteAction() {
    videoStorageService.deleteScript(script.id);
    setConfirmDelete(false);
    onDeleted();
  }

  return (
    <>
      <div
        className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2 hover:shadow-md hover:border-foreground/20 transition-all"
        data-testid={`script-card-${script.id}`}
      >
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          {isRenaming ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") cancelRename();
                }}
                className="flex-1 min-w-0 text-sm font-medium bg-background border border-border rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-primary"
                aria-label="Rename script"
              />
              <button
                type="button"
                onClick={commitRename}
                className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Save rename"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={cancelRename}
                className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Cancel rename"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <p className="text-sm font-medium text-foreground leading-tight truncate flex-1 min-w-0">
              {script.title}
            </p>
          )}

          {/* Overflow menu */}
          {!isRenaming && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="More options"
                data-testid={`script-card-menu-${script.id}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 w-32 rounded-md border border-border bg-background shadow-md py-1">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left"
                    onClick={handleRename}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left text-destructive"
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span>{shotCount} {shotCount === 1 ? "shot" : "shots"}</span>
          <span aria-hidden="true">·</span>
          <span>~{durationS}s</span>
          <span aria-hidden="true">·</span>
          <span>{relativeTime(script.updatedAt)}</span>
        </div>

        {/* Edit button */}
        <div className="flex justify-end mt-1">
          <Button
            asChild
            variant="outline"
            size="sm"
            data-testid={`script-card-edit-${script.id}`}
          >
            <Link to={`/video/scripts/${script.id}`}>Edit</Link>
          </Button>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete script?"
          description="This will permanently delete the script and all its shots. This cannot be undone."
          onConfirm={confirmDeleteAction}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

// ─── VideoHome ────────────────────────────────────────────────────────────────

export default function VideoHome() {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [scripts, setScripts] = useState<Script[]>(() =>
    videoStorageService.listScripts().slice(0, 4)
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMounted = useRef(true);
  const navigate = useNavigate();
  const { refreshBalance } = usePoeBalanceContext();
  const { balance } = usePoeBalanceContext();
  const { handleReportBug } = useReportBug();
  const { isModalOpen, guardAction, closeModal, proceedWithPendingAction } = useApiKeyGuard();

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // isMounted guard for async ops
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  function reloadScripts() {
    setScripts(videoStorageService.listScripts().slice(0, 4));
  }

  const handleGenerateCore = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating) return;

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const settings = getSettings();
      const client = createLLMClient(settings?.poeApiKey ?? undefined);

      // Build the LLM request. Mention "video script" so the mock returns YAML.
      const responseText = await client.chat(
        [
          {
            role: "system",
            content:
              "You are a professional video scriptwriter. When given a prompt, respond with a YAML video script. " +
              "The YAML must have: title, settings (subtitles, default_audio), and shots array. " +
              "Each shot must have: title, prompt, narration (enabled, text). " +
              "Respond with ONLY the YAML — no explanations, no markdown fences.",
          },
          {
            role: "user",
            content: `Write a video script for: ${trimmed}`,
          },
        ],
        "claude-sonnet-4-5-20250929",
      );

      // Refresh balance after generation (fire-and-forget)
      refreshBalance(settings?.poeApiKey);

      if (!isMounted.current) return;

      // Parse YAML response
      const parsed = parseScriptYaml(responseText);
      const yamlTitle = (parsed?.title as string | undefined) ?? trimmed.slice(0, 60);

      // Build shots from parsed YAML
      const shots = (parsed?.shots ?? []).map((s: YamlShot) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: String(s.title ?? "Untitled Shot"),
        prompt: String(s.prompt ?? ""),
        narration: {
          enabled: Boolean(s.narration?.enabled ?? false),
          text: String(s.narration?.text ?? ""),
          audioSource: "video" as const,
        },
        video: {
          selectedUrl: null,
          history: [],
        },
      }));

      // Persist to storage
      const script = videoStorageService.createScript(yamlTitle);
      if (shots.length > 0) {
        videoStorageService.updateScript(script.id, { shots });
      }

      if (!isMounted.current) return;

      navigate(`/video/scripts/${script.id}`);
    } catch (err) {
      if (!isMounted.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      setGenerateError(`Generation failed: ${msg}`);
      setIsGenerating(false);
    }
  }, [prompt, isGenerating, navigate, refreshBalance]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    guardAction(() => void handleGenerateCore());
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-6 pt-20 pb-16 bg-gradient-to-b from-background to-secondary/30">
      {/* Top-right: balance + nav menu */}
      <div
        className="fixed top-4 right-4 z-40 flex items-center gap-2"
        data-testid="video-home-nav-menu"
      >
        {balance !== null && (
          <span
            className="text-xs text-muted-foreground tabular-nums"
            data-testid="poe-balance"
            aria-label={`POE balance: ${balance}`}
          >
            {balance}
          </span>
        )}
        <NavMenu items={VIDEO_NAV_ITEMS} onReportBug={handleReportBug} />
      </div>

      {/* Hero icon + title */}
      <div className="mb-10 flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <Film className="w-8 h-8 text-primary-foreground" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Studio</h1>
          <p className="mt-1.5 text-muted-foreground text-base">
            Create a script, generate shots, export video.
          </p>
        </div>
      </div>

      {/* Prompt form */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl flex flex-col gap-3"
        aria-label="New video script prompt"
      >
        <Textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your video — include desired length, tone, characters, and style"
          className="resize-none min-h-[120px] text-base shadow-sm"
          aria-label="Video script prompt"
          data-testid="video-home-prompt"
          disabled={isGenerating}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
        />
        {generateError && (
          <p className="text-sm text-destructive" role="alert">
            {generateError}
          </p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">⌘ + Enter to generate</span>
          <Button
            type="submit"
            disabled={!prompt.trim() || isGenerating}
            data-testid="video-home-generate-btn"
          >
            {isGenerating ? "Generating…" : "Generate Script →"}
          </Button>
        </div>
      </form>

      {/* Recent Scripts */}
      {scripts.length > 0 && (
        <div className="mt-10 w-full max-w-xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Recent Scripts
            </p>
            <Link
              to="/video/scripts"
              className="text-xs text-primary hover:underline underline-offset-2 transition-colors"
            >
              View all scripts →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {scripts.map((script) => (
              <ScriptCard
                key={script.id}
                script={script}
                onDeleted={reloadScripts}
                onRenamed={reloadScripts}
              />
            ))}
          </div>
        </div>
      )}

      {/* API key missing modal */}
      {isModalOpen && (
        <ApiKeyMissingModal onClose={closeModal} onProceed={proceedWithPendingAction} />
      )}
    </div>
  );
}
