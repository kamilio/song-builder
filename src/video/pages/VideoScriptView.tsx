/**
 * Script editor page.
 *
 * Route: /video/scripts/:id (TopBar via VideoPageLayout in App.tsx)
 *
 * US-041: Script editor shell — layout, mode toggle, chat panel.
 * US-042: Script editor — Write mode shot cards.
 * US-043: Drag-and-drop shot reordering in Write mode.
 * US-044: Script editor — Shot mode.
 *
 * Layout:
 *   - Desktop: split-pane (left script panel, right chat panel)
 *   - Mobile (< 768px): tab bar toggling Script / Chat panels
 *
 * Left panel header:
 *   - Write/Tmpl mode: 'SCRIPT' label + mode toggle + '+ Shot'
 *   - Shot mode: 'SHOT N OF M' label + mode toggle + '+ Shot'
 *
 * Right panel: 'CHAT' label + scrollable message history + message input
 *
 * Bottom bar: Subtitles toggle, shot count + duration, ▶ Preview All (disabled), ⬇ Export Video
 *   - Shot mode: also has prev/next shot navigation buttons
 *
 * Write mode shot cards (US-042):
 *   - Full shot card per shot: drag handle, header, prompt textarea, template chips,
 *     narration section, selected video pill, → Shot view link
 *   - All interactive elements carry data-testid attributes
 *
 * Drag-and-drop reordering (US-043):
 *   - DndContext + SortableContext wrap the shots list in Write mode.
 *   - Each ShotCard uses useSortable; drag handle activates via the GripVertical icon.
 *   - onDragEnd reorders the shots array and persists to storage.
 *   - Shot number labels are index-based; they update immediately after drop.
 *   - Keyboard drag: Space to pick up, arrow keys to move, Space/Enter to drop.
 *
 * Shot mode (US-044):
 *   - Zooms into a single shot for focused editing.
 *   - Header shows 'SHOT N OF M'; navigation row with prev/next.
 *   - Tiptap editor renders prompt with {{variable}} as styled inline chip nodes.
 *   - Template chips row (local templates only); autocomplete on '{{' input.
 *   - Narration section with enable toggle, textarea, audio source radio.
 *   - Generate section: count selector [1][2][3], Generate button.
 *   - Video history grid with inline <video>, version label, timestamp, actions.
 *   - Bottom bar includes prev/next navigation equivalent to header row.
 *
 * Safety:
 *   - Redirects to /video/scripts when script ID is not found.
 *   - Wrapped in ErrorBoundary in the render path.
 *   - isMounted ref guards all async setState calls.
 *   - refreshBalance called after each Claude response.
 */

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  FormEvent,
  KeyboardEvent,
  type MutableRefObject,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Node as TiptapNode,
  mergeAttributes,
  type NodeViewRendererProps,
} from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import {
  Plus,
  MessageSquare,
  FileText,
  Play,
  Download,
  Loader2,
  Send,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
  GripVertical,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Pin,
  Clock,
} from "lucide-react";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { getSettings } from "@/music/lib/storage";
import { videoStorageService } from "@/video/lib/storage/storageService";
import type {
  Script,
  Shot,
  AudioSource,
  VideoHistoryEntry,
} from "@/video/lib/storage/types";
import { createLLMClient } from "@/shared/lib/llm/factory";
import { usePoeBalanceContext } from "@/shared/context/PoeBalanceContext";
import { dump as yamlDump } from "js-yaml";

// ─── Types ────────────────────────────────────────────────────────────────────

type EditorMode = "write" | "shot" | "tmpl";
type MobileTab = "script" | "chat";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sanitiseFilename(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "script"
  );
}

/**
 * Extract the filename from a URL (for the selected video pill).
 * Falls back to a shortened URL if no filename is extractable.
 */
function extractFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split("/");
    const last = parts[parts.length - 1];
    if (last) return decodeURIComponent(last);
  } catch {
    // not a valid URL — fall through
  }
  // Fall back to last path segment of raw string
  const parts = url.split("/");
  return parts[parts.length - 1] || url.slice(0, 24);
}

/**
 * Format a relative timestamp (e.g. "2m ago", "just now").
 */
function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

// ─── Tiptap TemplateChip node ─────────────────────────────────────────────────

/**
 * Inline node that renders {{variable_name}} as a styled chip.
 * Atomic: backspace deletes the whole node.
 */
const TemplateChipNode = TiptapNode.create({
  name: "templateChip",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      name: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-template-chip]',
        getAttrs: (element) => ({
          name: (element as HTMLElement).getAttribute("data-template-name"),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-template-chip": "",
        "data-template-name": HTMLAttributes.name,
        class:
          "inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0 text-xs font-medium text-primary mx-0.5 select-none",
      }),
      `{{${HTMLAttributes.name as string}}}`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TemplateChipNodeView);
  },
});

function TemplateChipNodeView({ node }: NodeViewRendererProps) {
  const name = node.attrs.name as string;
  return (
    <NodeViewWrapper
      as="span"
      className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0 text-xs font-medium text-primary mx-0.5 select-none cursor-default"
      data-template-chip=""
      data-template-name={name}
    >
      {`{{${name}}}`}
    </NodeViewWrapper>
  );
}

// ─── Helper: prompt string → tiptap content JSON ──────────────────────────────

/**
 * Parse a prompt string (with {{name}} occurrences) into a tiptap doc JSON
 * where each {{name}} becomes a templateChip node.
 */
function promptToTiptapContent(prompt: string): object {
  const parts: object[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(prompt)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        text: prompt.slice(lastIndex, match.index),
      });
    }
    parts.push({
      type: "templateChip",
      attrs: { name: match[1] },
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < prompt.length) {
    parts.push({ type: "text", text: prompt.slice(lastIndex) });
  }
  if (parts.length === 0) {
    parts.push({ type: "text", text: "" });
  }

  return {
    type: "doc",
    content: [{ type: "paragraph", content: parts }],
  };
}

/**
 * Convert tiptap doc JSON back to a plain prompt string.
 * templateChip nodes become {{name}}.
 */
function tiptapContentToPrompt(content: { type: string; content?: object[] }): string {
  if (!content || !content.content) return "";
  function traverse(nodes: object[]): string {
    return nodes
      .map((node: object) => {
        const n = node as { type: string; text?: string; attrs?: { name?: string }; content?: object[] };
        if (n.type === "text") return n.text ?? "";
        if (n.type === "templateChip") return `{{${n.attrs?.name ?? ""}}}`;
        if (n.content) return traverse(n.content);
        return "";
      })
      .join("");
  }
  return traverse(content.content as object[]);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ModeToggleProps {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const modes: { key: EditorMode; label: string }[] = [
    { key: "write", label: "Write" },
    { key: "shot", label: "Shot" },
    { key: "tmpl", label: "Tmpl" },
  ];

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-border bg-muted p-0.5"
      role="tablist"
      aria-label="Editor mode"
    >
      {modes.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={mode === key}
          onClick={() => onChange(key)}
          className={[
            "px-2.5 py-1 text-xs font-medium rounded transition-colors",
            mode === key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
          data-testid={`mode-toggle-${key}`}
        >
          {label}
          {mode === key ? "●" : "○"}
        </button>
      ))}
    </div>
  );
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm bg-primary text-primary-foreground"
          data-testid={`chat-message-user-${message.id}`}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm bg-muted text-foreground border border-border"
        data-testid={`chat-message-assistant-${message.id}`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

// ─── ShotCard ─────────────────────────────────────────────────────────────────

interface ShotCardProps {
  shot: Shot;
  index: number;
  script: Script;
  onUpdate: (updatedScript: Script) => void;
  onDelete: (shotId: string) => void;
  onSwitchToShotMode: (shotIndex: number) => void;
}

function ShotCard({
  shot,
  index,
  script,
  onUpdate,
  onDelete,
  onSwitchToShotMode,
}: ShotCardProps) {
  // ── Sortable DnD ────────────────────────────────────────────────────────────
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shot.id });
  // ── Rename state ────────────────────────────────────────────────────────────
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(shot.title);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ── Overflow menu state ─────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Confirm delete state ────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Prompt local state (synced on blur) ────────────────────────────────────
  const [promptValue, setPromptValue] = useState(shot.prompt);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // ── Narration local state ──────────────────────────────────────────────────
  const [narrationText, setNarrationText] = useState(shot.narration.text);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  // Close overflow menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  // ── Rename handlers ─────────────────────────────────────────────────────────

  function commitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameValue(shot.title);
      setIsRenaming(false);
      return;
    }
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id ? { ...s, title: trimmed } : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated) {
      onUpdate(updated);
    }
    setIsRenaming(false);
  }

  function cancelRename() {
    setRenameValue(shot.title);
    setIsRenaming(false);
  }

  function handleRenameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      cancelRename();
    }
  }

  // ── Delete handler ──────────────────────────────────────────────────────────

  function confirmDeleteShot() {
    setConfirmDelete(false);
    onDelete(shot.id);
  }

  // ── Prompt blur handler ─────────────────────────────────────────────────────

  function handlePromptBlur() {
    if (promptValue === shot.prompt) return;
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id ? { ...s, prompt: promptValue } : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated) {
      onUpdate(updated);
    }
  }

  // ── Narration toggle ────────────────────────────────────────────────────────

  function handleNarrationToggle() {
    const newEnabled = !shot.narration.enabled;
    const newAudioSource: AudioSource =
      newEnabled && !shot.narration.audioSource
        ? script.settings.defaultAudio
        : shot.narration.audioSource || script.settings.defaultAudio;

    const updatedShots = script.shots.map((s) =>
      s.id === shot.id
        ? {
            ...s,
            narration: {
              ...s.narration,
              enabled: newEnabled,
              audioSource: newAudioSource,
            },
          }
        : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated) {
      onUpdate(updated);
    }
  }

  // ── Narration text blur ─────────────────────────────────────────────────────

  function handleNarrationTextBlur() {
    if (narrationText === shot.narration.text) return;
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id
        ? { ...s, narration: { ...s.narration, text: narrationText } }
        : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated) {
      onUpdate(updated);
    }
  }

  // ── Audio source change ─────────────────────────────────────────────────────

  function handleAudioSourceChange(source: AudioSource) {
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id
        ? { ...s, narration: { ...s.narration, audioSource: source } }
        : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated) {
      onUpdate(updated);
    }
  }

  // ── Template chip insert ────────────────────────────────────────────────────

  function insertTemplateAtCursor(name: string) {
    const textarea = promptRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? promptValue.length;
    const end = textarea.selectionEnd ?? promptValue.length;
    const insertion = `{{${name}}}`;
    const newValue =
      promptValue.slice(0, start) + insertion + promptValue.slice(end);
    setPromptValue(newValue);
    // Persist immediately (no need to wait for blur)
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id ? { ...s, prompt: newValue } : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated) {
      onUpdate(updated);
    }
    // Restore focus and cursor after chip insertion
    setTimeout(() => {
      if (!textarea) return;
      textarea.focus();
      const newPos = start + insertion.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  }

  // ── Compute local template chips (ONLY local templates referenced in prompt) ─

  const localTemplateChips = Object.values(script.templates).filter(
    (tmpl) => !tmpl.global && promptValue.includes(`{{${tmpl.name}}}`)
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={sortableStyle}
        className="rounded-lg border border-border bg-card"
        data-testid={`shot-card-${shot.id}`}
      >
        {/* ── Card header ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          {/* Drag handle — activates DnD (pointer + keyboard) */}
          <span
            className="text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 touch-none"
            data-testid={`shot-drag-handle-${shot.id}`}
            aria-label={`Drag handle for shot ${index + 1}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </span>

          {/* Title / rename */}
          {isRenaming ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={commitRename}
                className="flex-1 min-w-0 text-sm font-medium bg-background border border-border rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid={`shot-rename-input-${shot.id}`}
                aria-label="Shot title"
              />
              <button
                type="button"
                onClick={commitRename}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Save title"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={cancelRename}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Cancel rename"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <span className="flex-1 min-w-0 text-sm font-medium truncate">
              Shot {index + 1} · {shot.title}
            </span>
          )}

          {/* Overflow menu */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Shot options"
              aria-expanded={menuOpen}
              data-testid={`shot-menu-${shot.id}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
              <span aria-hidden="true">▾</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 w-32 rounded-md border border-border bg-background shadow-md py-1">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setRenameValue(shot.title);
                    setIsRenaming(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
                  data-testid={`shot-rename-${shot.id}`}
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors"
                  data-testid={`shot-delete-${shot.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Card body ───────────────────────────────────────────────────── */}
        <div className="px-3 py-3 space-y-3">
          {/* Prompt textarea */}
          <div>
            <label
              htmlFor={`shot-prompt-${shot.id}`}
              className="block text-xs font-medium text-muted-foreground mb-1"
            >
              Video prompt
            </label>
            <Textarea
              id={`shot-prompt-${shot.id}`}
              ref={promptRef}
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onBlur={handlePromptBlur}
              placeholder="Describe this shot…"
              rows={3}
              className="resize-none text-sm"
              data-testid={`shot-prompt-${shot.id}`}
              aria-label={`Video prompt for shot ${index + 1}`}
            />
          </div>

          {/* Template chips row — always show '+add'; local chips only when present */}
          {(
            <div className="flex flex-wrap gap-1.5 items-center">
              {localTemplateChips.map((tmpl) => (
                <button
                  key={tmpl.name}
                  type="button"
                  onClick={() => insertTemplateAtCursor(tmpl.name)}
                  className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  data-testid={`template-chip-${shot.id}-${tmpl.name}`}
                  title={`Insert {{${tmpl.name}}}`}
                >
                  {`{{${tmpl.name}}}`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  // Switches to Templates mode — handled via callback in parent
                  // We call onSwitchToShotMode with a special sentinel but
                  // the parent provides an onSwitchToTemplates prop for this.
                  // For now dispatch a custom event the parent can listen to.
                  const event = new CustomEvent("switch-to-templates");
                  document.dispatchEvent(event);
                }}
                className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                data-testid={`template-add-chip-${shot.id}`}
              >
                +add
              </button>
            </div>
          )}

          {/* Narration section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={shot.narration.enabled}
                onClick={handleNarrationToggle}
                className={[
                  "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                  shot.narration.enabled ? "bg-primary" : "bg-input",
                ].join(" ")}
                data-testid={`narration-toggle-${shot.id}`}
                aria-label="Toggle narration"
              >
                <span
                  className={[
                    "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                    shot.narration.enabled ? "translate-x-3" : "translate-x-0",
                  ].join(" ")}
                />
              </button>
              <span className="text-xs font-medium text-muted-foreground">
                Narration
              </span>
            </div>

            {shot.narration.enabled && (
              <div className="space-y-2 pl-0">
                {/* Narration textarea */}
                <Textarea
                  value={narrationText}
                  onChange={(e) => setNarrationText(e.target.value)}
                  onBlur={handleNarrationTextBlur}
                  placeholder="Enter narration text…"
                  rows={2}
                  className="resize-none text-sm"
                  data-testid={`narration-text-${shot.id}`}
                  aria-label={`Narration text for shot ${index + 1}`}
                />

                {/* Audio source radio */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground shrink-0">
                    Audio:
                  </span>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name={`audio-source-${shot.id}`}
                      value="video"
                      checked={shot.narration.audioSource === "video"}
                      onChange={() => handleAudioSourceChange("video")}
                      className="h-3 w-3"
                      data-testid={`audio-source-video-${shot.id}`}
                    />
                    Video
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name={`audio-source-${shot.id}`}
                      value="elevenlabs"
                      checked={shot.narration.audioSource === "elevenlabs"}
                      onChange={() => handleAudioSourceChange("elevenlabs")}
                      className="h-3 w-3"
                      data-testid={`audio-source-elevenlabs-${shot.id}`}
                    />
                    ElevenLabs
                  </label>

                  {/* Generate Audio button — only when ElevenLabs selected */}
                  {shot.narration.audioSource === "elevenlabs" && (
                    <button
                      type="button"
                      className="ml-auto flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-border bg-background hover:bg-accent transition-colors"
                      data-testid={`generate-audio-btn-${shot.id}`}
                      aria-label={`Generate audio for shot ${index + 1}`}
                    >
                      Generate Audio
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Selected video pill */}
          {shot.video.selectedUrl && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground max-w-[200px]"
                data-testid={`selected-video-pill-${shot.id}`}
                title={shot.video.selectedUrl}
              >
                <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                <span className="truncate">
                  {extractFilename(shot.video.selectedUrl)}
                </span>
              </span>
            </div>
          )}

          {/* → Shot view link */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onSwitchToShotMode(index)}
              className="text-xs text-primary hover:underline transition-colors"
              data-testid={`shot-view-link-${shot.id}`}
              aria-label={`Switch to shot view for shot ${index + 1}`}
            >
              → Shot view
            </button>
          </div>
        </div>
      </div>

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete shot?"
          description={`This will permanently delete "${shot.title}" and all its history. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteShot}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

// ─── ShotModeView ─────────────────────────────────────────────────────────────

interface ShotModeViewProps {
  shot: Shot;
  shotIndex: number;
  script: Script;
  onUpdate: (updatedScript: Script) => void;
  onNavigate: (newIndex: number) => void;
  isMountedRef: MutableRefObject<boolean>;
}

/**
 * Detailed editor for a single shot (US-044).
 *
 * Sections:
 *   1. Tiptap prompt editor with {{variable}} chip nodes + autocomplete
 *   2. Template chips row (local templates only)
 *   3. NARRATION section
 *   4. GENERATE section (count selector + Generate button)
 *   5. VIDEO HISTORY grid
 */
function ShotModeView({
  shot,
  shotIndex,
  script,
  onUpdate,
  onNavigate,
  isMountedRef,
}: ShotModeViewProps) {
  const totalShots = script.shots.length;

  // ── Narration local state ──────────────────────────────────────────────────
  const [narrationText, setNarrationText] = useState(shot.narration.text);
  const [generateCount, setGenerateCount] = useState(1);

  // ── Confirm delete for history entries ────────────────────────────────────
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);

  // ── Autocomplete state ────────────────────────────────────────────────────
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Sync narrationText when shot changes (navigating shots)
  useEffect(() => {
    setNarrationText(shot.narration.text);
  }, [shot.id, shot.narration.text]);

  // ── Tiptap editor ──────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable block nodes we don't need
        blockquote: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        hardBreak: false,
      }),
      TemplateChipNode,
    ],
    content: promptToTiptapContent(shot.prompt),
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON();
      const text = tiptapContentToPrompt(json as { type: string; content?: object[] });

      // Detect '{{' typed to open autocomplete
      const currentText = ed.getText();
      const selection = ed.state.selection;
      const textBefore = currentText.slice(0, selection.anchor - 1);
      const lastDoubleOpen = textBefore.lastIndexOf("{{");
      if (lastDoubleOpen !== -1) {
        const query = textBefore.slice(lastDoubleOpen + 2);
        if (!query.includes("}")) {
          setAutocompleteOpen(true);
          setAutocompleteQuery(query);
        } else {
          setAutocompleteOpen(false);
        }
      } else {
        setAutocompleteOpen(false);
      }

      // Persist on change (debounced by blur in production; here we persist immediately)
      // We persist on every change for the tiptap editor to keep storage in sync
      void persistPrompt(text);
    },
    editorProps: {
      attributes: {
        class:
          "min-h-[80px] px-3 py-2 text-sm focus:outline-none prose prose-sm max-w-none",
        "data-testid": "shot-prompt-tiptap",
      },
    },
  });

  // Persist function (not debounced — called on each tiptap change)
  const persistPrompt = useCallback(
    (newPrompt: string) => {
      if (!isMountedRef.current) return;
      if (newPrompt === shot.prompt) return;
      const updatedShots = script.shots.map((s) =>
        s.id === shot.id ? { ...s, prompt: newPrompt } : s
      );
      const updated = videoStorageService.updateScript(script.id, {
        shots: updatedShots,
      });
      if (updated && isMountedRef.current) {
        onUpdate(updated);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [script.id, shot.id, shot.prompt]
  );

  // Re-initialise editor content when navigating to a different shot
  useEffect(() => {
    if (!editor) return;
    const newContent = promptToTiptapContent(shot.prompt);
    // Only reset if shot changed (avoid resetting while user is typing)
    editor.commands.setContent(newContent as Parameters<typeof editor.commands.setContent>[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id]);

  // Close autocomplete on outside click
  useEffect(() => {
    if (!autocompleteOpen) return;
    function handleOutside(e: MouseEvent) {
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(e.target as Node)
      ) {
        setAutocompleteOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [autocompleteOpen]);

  // Handle Escape key to close autocomplete
  useEffect(() => {
    if (!autocompleteOpen) return;
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        setAutocompleteOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [autocompleteOpen]);

  // ── Insert template via autocomplete ──────────────────────────────────────

  function insertTemplateFromAutocomplete(name: string) {
    if (!editor) return;
    setAutocompleteOpen(false);

    // Delete the '{{...' text typed so far, then insert the chip
    const json = editor.getJSON();
    const text = tiptapContentToPrompt(json as { type: string; content?: object[] });
    const selection = editor.state.selection;
    const textBefore = text.slice(0, selection.anchor - 1);
    const lastDoubleOpen = textBefore.lastIndexOf("{{");
    if (lastDoubleOpen !== -1) {
      // Delete from '{{' to cursor
      const deleteFrom = lastDoubleOpen + 1; // position in tiptap doc (1-indexed)
      editor
        .chain()
        .focus()
        .deleteRange({ from: deleteFrom, to: selection.anchor })
        .insertContent({
          type: "templateChip",
          attrs: { name },
        })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "templateChip",
          attrs: { name },
        })
        .run();
    }
  }

  // ── Template chip click (chips row) ──────────────────────────────────────

  function insertTemplateChip(name: string) {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "templateChip",
        attrs: { name },
      })
      .run();
  }

  // ── Local template chips (all local templates, not just referenced ones) ──
  const localTemplates = Object.values(script.templates).filter(
    (tmpl) => !tmpl.global
  );

  // ── Global templates ──────────────────────────────────────────────────────
  const [globalTemplates, setGlobalTemplates] = useState(() =>
    videoStorageService.listGlobalTemplates()
  );

  // Refresh global templates when the component mounts or shot changes
  useEffect(() => {
    setGlobalTemplates(videoStorageService.listGlobalTemplates());
  }, [shot.id]);

  // ── Filtered autocomplete items ──────────────────────────────────────────

  const filteredLocalTemplates = localTemplates.filter((t) =>
    t.name.toLowerCase().startsWith(autocompleteQuery.toLowerCase())
  );
  const filteredGlobalTemplates = globalTemplates.filter((t) =>
    t.name.toLowerCase().startsWith(autocompleteQuery.toLowerCase())
  );

  // ── Narration handlers ────────────────────────────────────────────────────

  function handleNarrationToggle() {
    const newEnabled = !shot.narration.enabled;
    const newAudioSource: AudioSource =
      newEnabled && !shot.narration.audioSource
        ? script.settings.defaultAudio
        : shot.narration.audioSource || script.settings.defaultAudio;

    const updatedShots = script.shots.map((s) =>
      s.id === shot.id
        ? {
            ...s,
            narration: {
              ...s.narration,
              enabled: newEnabled,
              audioSource: newAudioSource,
            },
          }
        : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated && isMountedRef.current) {
      onUpdate(updated);
    }
  }

  function handleNarrationTextBlur() {
    if (narrationText === shot.narration.text) return;
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id
        ? { ...s, narration: { ...s.narration, text: narrationText } }
        : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated && isMountedRef.current) {
      onUpdate(updated);
    }
  }

  function handleAudioSourceChange(source: AudioSource) {
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id
        ? { ...s, narration: { ...s.narration, audioSource: source } }
        : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated && isMountedRef.current) {
      onUpdate(updated);
    }
  }

  // ── Video history actions ─────────────────────────────────────────────────

  function handleSelectVideo(url: string) {
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id
        ? { ...s, video: { ...s.video, selectedUrl: url } }
        : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated && isMountedRef.current) {
      onUpdate(updated);
    }
  }

  function handlePinVideo(index: number) {
    const entry = shot.video.history[index];
    if (!entry) return;
    const isPinned = entry.pinned;
    const updatedHistory: VideoHistoryEntry[] = shot.video.history.map((e, i) =>
      i === index
        ? {
            ...e,
            pinned: !isPinned,
            pinnedAt: !isPinned ? new Date().toISOString() : undefined,
          }
        : e
    );
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id
        ? { ...s, video: { ...s.video, history: updatedHistory } }
        : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated && isMountedRef.current) {
      onUpdate(updated);
    }
  }

  function handleDownloadVideo(url: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = extractFilename(url);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleDeleteVideo(index: number) {
    const entry = shot.video.history[index];
    if (!entry) return;
    const updatedHistory = shot.video.history.filter((_, i) => i !== index);
    const newSelectedUrl =
      shot.video.selectedUrl === entry.url ? null : shot.video.selectedUrl;
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id
        ? {
            ...s,
            video: {
              selectedUrl: newSelectedUrl,
              history: updatedHistory,
            },
          }
        : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated && isMountedRef.current) {
      onUpdate(updated);
      setConfirmDeleteIndex(null);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" data-testid="shot-mode-content">

      {/* ── Navigation row ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        {/* Prev shot */}
        {shotIndex > 0 ? (
          <button
            type="button"
            onClick={() => onNavigate(shotIndex - 1)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="shot-prev-btn"
            aria-label={`Go to shot ${shotIndex}`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Shot {shotIndex} · {script.shots[shotIndex - 1]?.title ?? ""}
          </button>
        ) : (
          <div />
        )}
        {/* Next shot */}
        {shotIndex < totalShots - 1 ? (
          <button
            type="button"
            onClick={() => onNavigate(shotIndex + 1)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="shot-next-btn"
            aria-label={`Go to shot ${shotIndex + 2}`}
          >
            Shot {shotIndex + 2} · {script.shots[shotIndex + 1]?.title ?? ""}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div />
        )}
      </div>

      {/* ── Prompt section ───────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-muted-foreground">
          Video prompt
        </label>

        {/* Tiptap editor wrapper */}
        <div className="relative rounded-md border border-border focus-within:ring-1 focus-within:ring-ring bg-background">
          <EditorContent editor={editor} />

          {/* Autocomplete dropdown */}
          {autocompleteOpen &&
            (filteredLocalTemplates.length > 0 ||
              filteredGlobalTemplates.length > 0) && (
              <div
                ref={autocompleteRef}
                className="absolute left-0 top-full mt-1 z-50 min-w-[200px] max-w-[320px] rounded-md border border-border bg-background shadow-lg py-1"
                data-testid="template-autocomplete"
              >
                {/* Script templates section */}
                {filteredLocalTemplates.length > 0 && (
                  <>
                    <div className="px-3 py-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                      Script Templates
                    </div>
                    {filteredLocalTemplates.map((tmpl) => (
                      <button
                        key={tmpl.name}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertTemplateFromAutocomplete(tmpl.name);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
                        data-testid={`autocomplete-local-${tmpl.name}`}
                      >
                        <span className="font-mono text-primary text-xs">{`{{${tmpl.name}}}`}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {tmpl.value.slice(0, 40)}
                        </span>
                      </button>
                    ))}
                    {filteredGlobalTemplates.length > 0 && (
                      <div className="my-1 border-t border-border" />
                    )}
                  </>
                )}

                {/* Global templates section */}
                {filteredGlobalTemplates.length > 0 && (
                  <>
                    <div className="px-3 py-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                      Global Templates
                    </div>
                    {filteredGlobalTemplates.map((tmpl) => (
                      <button
                        key={tmpl.name}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertTemplateFromAutocomplete(tmpl.name);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
                        data-testid={`autocomplete-global-${tmpl.name}`}
                      >
                        <span className="font-mono text-primary text-xs">{`{{${tmpl.name}}}`}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {tmpl.value.slice(0, 40)}
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
        </div>

        {/* Template chips row — local templates only */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {localTemplates.map((tmpl) => (
            <button
              key={tmpl.name}
              type="button"
              onClick={() => insertTemplateChip(tmpl.name)}
              className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              data-testid={`shot-mode-template-chip-${tmpl.name}`}
              title={`Insert {{${tmpl.name}}}`}
            >
              {`{{${tmpl.name}}}`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const event = new CustomEvent("switch-to-templates");
              document.dispatchEvent(event);
            }}
            className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            data-testid="shot-mode-template-add-chip"
          >
            +add
          </button>
        </div>
      </div>

      {/* ── NARRATION section ─────────────────────────────────────────────────── */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Narration
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={shot.narration.enabled}
            onClick={handleNarrationToggle}
            className={[
              "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
              shot.narration.enabled ? "bg-primary" : "bg-input",
            ].join(" ")}
            data-testid={`shot-mode-narration-toggle`}
            aria-label="Toggle narration"
          >
            <span
              className={[
                "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                shot.narration.enabled ? "translate-x-3" : "translate-x-0",
              ].join(" ")}
            />
          </button>
        </div>

        {shot.narration.enabled && (
          <div className="space-y-2">
            <Textarea
              value={narrationText}
              onChange={(e) => setNarrationText(e.target.value)}
              onBlur={handleNarrationTextBlur}
              placeholder="Enter narration text…"
              rows={2}
              className="resize-none text-sm"
              data-testid="shot-mode-narration-text"
              aria-label="Narration text"
            />

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground shrink-0">
                Audio:
              </span>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="shot-mode-audio-source"
                  value="video"
                  checked={shot.narration.audioSource === "video"}
                  onChange={() => handleAudioSourceChange("video")}
                  className="h-3 w-3"
                  data-testid="shot-mode-audio-video"
                />
                Video
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="shot-mode-audio-source"
                  value="elevenlabs"
                  checked={shot.narration.audioSource === "elevenlabs"}
                  onChange={() => handleAudioSourceChange("elevenlabs")}
                  className="h-3 w-3"
                  data-testid="shot-mode-audio-elevenlabs"
                />
                ElevenLabs
              </label>

              {shot.narration.audioSource === "elevenlabs" && (
                <button
                  type="button"
                  className="ml-auto flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-border bg-background hover:bg-accent transition-colors"
                  data-testid="shot-mode-generate-audio-btn"
                  aria-label="Generate narration audio"
                >
                  Generate Audio
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── GENERATE section ──────────────────────────────────────────────────── */}
      <div className="space-y-2 pt-1">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Generate
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Count selector button group */}
          <div
            className="flex items-center rounded-md border border-border overflow-hidden"
            role="group"
            aria-label="Number of videos to generate"
          >
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setGenerateCount(n)}
                className={[
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  n > 1 ? "border-l border-border" : "",
                  generateCount === n
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground hover:bg-accent",
                ].join(" ")}
                data-testid={`generate-count-${n}`}
                aria-pressed={generateCount === n}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Generate button */}
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            data-testid="generate-btn"
            aria-label={`Generate ${generateCount} video${generateCount > 1 ? "s" : ""}`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate
          </button>
        </div>
      </div>

      {/* ── VIDEO HISTORY section ─────────────────────────────────────────────── */}
      <div className="space-y-2 pt-1">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Video History
        </span>

        {shot.video.history.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No videos generated yet. Click Generate to create your first clip.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shot.video.history.map((entry, idx) => {
              const isSelected = shot.video.selectedUrl === entry.url;
              return (
                <div
                  key={entry.url}
                  className={[
                    "relative rounded-lg border overflow-hidden",
                    isSelected
                      ? "border-primary ring-1 ring-primary"
                      : "border-border",
                  ].join(" ")}
                  data-testid={`video-history-card-${idx}`}
                >
                  {/* Video thumbnail */}
                  <div className="relative aspect-video bg-muted">
                    <video
                      src={entry.url}
                      preload="metadata"
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                      onMouseEnter={(e) => void (e.currentTarget as HTMLVideoElement).play()}
                      onMouseLeave={(e) => {
                        const v = e.currentTarget as HTMLVideoElement;
                        v.pause();
                        v.currentTime = 0;
                      }}
                    />
                    {/* Pin overlay */}
                    {entry.pinned && (
                      <div className="absolute top-1.5 left-1.5 flex items-center justify-center rounded-full bg-background/80 p-1">
                        <Pin className="h-3 w-3 text-foreground" />
                      </div>
                    )}
                    {/* Version label */}
                    <div className="absolute top-1.5 right-1.5 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                      v{idx + 1}
                    </div>
                  </div>

                  {/* Card footer */}
                  <div className="px-2 py-1.5 space-y-1.5 bg-background">
                    {/* Timestamp */}
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(entry.generatedAt)}
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {/* Select / Selected */}
                      <button
                        type="button"
                        onClick={() =>
                          isSelected ? undefined : handleSelectVideo(entry.url)
                        }
                        className={[
                          "flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium border transition-colors",
                          isSelected
                            ? "border-primary bg-primary/10 text-primary cursor-default"
                            : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent",
                        ].join(" ")}
                        data-testid={`video-select-btn-${idx}`}
                        aria-label={
                          isSelected ? "Selected video" : `Select video v${idx + 1}`
                        }
                        aria-pressed={isSelected}
                      >
                        {isSelected ? (
                          <>
                            <Check className="h-3 w-3" />
                            Selected
                          </>
                        ) : (
                          "Select"
                        )}
                      </button>

                      {/* Pin button */}
                      <button
                        type="button"
                        onClick={() => handlePinVideo(idx)}
                        className={[
                          "flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] border transition-colors",
                          entry.pinned
                            ? "border-amber-400 bg-amber-50 text-amber-600 hover:bg-amber-100"
                            : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent",
                        ].join(" ")}
                        data-testid={`video-pin-btn-${idx}`}
                        aria-label={entry.pinned ? "Unpin video" : "Pin video"}
                        aria-pressed={entry.pinned}
                      >
                        📌
                      </button>

                      {/* Download button */}
                      <button
                        type="button"
                        onClick={() => handleDownloadVideo(entry.url)}
                        className="flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        data-testid={`video-download-btn-${idx}`}
                        aria-label={`Download video v${idx + 1}`}
                      >
                        ⬇
                      </button>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteIndex(idx)}
                        className="flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] border border-border bg-background text-muted-foreground hover:text-destructive hover:border-destructive/50 hover:bg-destructive/10 transition-colors"
                        data-testid={`video-delete-btn-${idx}`}
                        aria-label={`Delete video v${idx + 1}`}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm delete dialog for video history */}
      {confirmDeleteIndex !== null && (
        <ConfirmDialog
          title="Delete video?"
          description="This will permanently remove this video from the history. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => handleDeleteVideo(confirmDeleteIndex)}
          onCancel={() => setConfirmDeleteIndex(null)}
        />
      )}
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

function VideoScriptViewInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refreshBalance } = usePoeBalanceContext();

  // ─── Script state ──────────────────────────────────────────────────────────
  const [script, setScript] = useState<Script | null>(null);
  const [notFound, setNotFound] = useState(false);

  // ─── Editor state ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<EditorMode>("write");
  const [activeShotIndex, setActiveShotIndex] = useState(0);
  const [mobileTab, setMobileTab] = useState<MobileTab>("script");

  // ─── Chat state ───────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ─── Scroll-to-new-shot ref ────────────────────────────────────────────────
  const shotListEndRef = useRef<HTMLDivElement>(null);

  // ─── Async safety ─────────────────────────────────────────────────────────
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // ─── Load script ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) {
      setNotFound(true);
      return;
    }
    const found = videoStorageService.getScript(id);
    if (!found) {
      setNotFound(true);
      return;
    }
    setScript(found);
  }, [id]);

  // ─── Redirect if not found ────────────────────────────────────────────────
  useEffect(() => {
    if (notFound) {
      navigate("/video/scripts", { replace: true });
    }
  }, [notFound, navigate]);

  // ─── Scroll chat to bottom on new messages ────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ─── Listen for switch-to-templates custom event ──────────────────────────
  useEffect(() => {
    function handleSwitchToTemplates() {
      if (isMounted.current) {
        setMode("tmpl");
      }
    }
    document.addEventListener("switch-to-templates", handleSwitchToTemplates);
    return () =>
      document.removeEventListener(
        "switch-to-templates",
        handleSwitchToTemplates
      );
  }, []);

  // ─── Add a new blank shot ─────────────────────────────────────────────────
  const handleAddShot = useCallback(() => {
    if (!script) return;
    const newShot: Shot = {
      id: generateId(),
      title: `Shot ${script.shots.length + 1}`,
      prompt: "",
      narration: {
        enabled: false,
        text: "",
        audioSource: script.settings.defaultAudio,
      },
      video: {
        selectedUrl: null,
        history: [],
      },
    };
    const updatedShots = [...script.shots, newShot];
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated && isMounted.current) {
      setScript(updated);
      // Scroll to new shot after render
      setTimeout(() => {
        shotListEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  }, [script]);

  // ─── Delete a shot ────────────────────────────────────────────────────────
  const handleDeleteShot = useCallback(
    (shotId: string) => {
      if (!script) return;
      const updatedShots = script.shots.filter((s) => s.id !== shotId);
      const updated = videoStorageService.updateScript(script.id, {
        shots: updatedShots,
      });
      if (updated && isMounted.current) {
        setScript(updated);
        // Adjust active shot index if needed
        if (mode === "shot") {
          const deletedIndex = script.shots.findIndex((s) => s.id === shotId);
          if (deletedIndex !== -1 && activeShotIndex >= deletedIndex) {
            setActiveShotIndex(Math.max(0, activeShotIndex - 1));
          }
        }
      }
    },
    [script, mode, activeShotIndex]
  );

  // ─── Handle script update from shot card ─────────────────────────────────
  const handleShotUpdate = useCallback((updatedScript: Script) => {
    if (isMounted.current) {
      setScript(updatedScript);
    }
  }, []);

  // ─── Switch to Shot mode at a given index ─────────────────────────────────
  const handleSwitchToShotMode = useCallback(
    (shotIndex: number) => {
      if (isMounted.current) {
        setActiveShotIndex(shotIndex);
        setMode("shot");
      }
    },
    []
  );

  // ─── Navigate within Shot mode ────────────────────────────────────────────
  const handleShotNavigate = useCallback(
    (newIndex: number) => {
      if (!script) return;
      if (newIndex < 0 || newIndex >= script.shots.length) return;
      if (isMounted.current) {
        setActiveShotIndex(newIndex);
      }
    },
    [script]
  );

  // ─── Mode change ──────────────────────────────────────────────────────────
  const handleModeChange = useCallback(
    (newMode: EditorMode) => {
      if (isMounted.current) {
        setMode(newMode);
        // When switching to Shot mode, clamp index to valid range
        if (newMode === "shot" && script) {
          setActiveShotIndex((prev) =>
            Math.min(prev, Math.max(0, script.shots.length - 1))
          );
        }
      }
    },
    [script]
  );

  // ─── Drag-and-drop sensors (US-043) ──────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // ─── Handle drag end: reorder shots array and persist ─────────────────────
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !script) return;

      const oldIndex = script.shots.findIndex((s) => s.id === active.id);
      const newIndex = script.shots.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reorderedShots = arrayMove(script.shots, oldIndex, newIndex);
      const updated = videoStorageService.updateScript(script.id, {
        shots: reorderedShots,
      });
      if (updated && isMounted.current) {
        setScript(updated);
      }
    },
    [script]
  );

  // ─── Subtitles toggle ─────────────────────────────────────────────────────
  const handleSubtitlesToggle = useCallback(() => {
    if (!script) return;
    const updated = videoStorageService.updateScript(script.id, {
      settings: {
        ...script.settings,
        subtitles: !script.settings.subtitles,
      },
    });
    if (updated && isMounted.current) {
      setScript(updated);
    }
  }, [script]);

  // ─── Export Video (YAML download) ────────────────────────────────────────
  const handleExportVideo = useCallback(() => {
    if (!script) return;

    const yamlData = {
      title: script.title,
      created_at: script.createdAt,
      settings: {
        subtitles: script.settings.subtitles,
        default_audio: script.settings.defaultAudio,
      },
      templates: Object.fromEntries(
        Object.entries(script.templates).map(([name, tmpl]) => [
          name,
          { category: tmpl.category, value: tmpl.value, global: false },
        ])
      ),
      shots: script.shots.map((shot) => ({
        title: shot.title,
        prompt: shot.prompt,
        narration: {
          enabled: shot.narration.enabled,
          text: shot.narration.text,
          ...(shot.narration.audioSource
            ? { audio: shot.narration.audioSource }
            : {}),
          ...(shot.narration.audioUrl
            ? { audio_url: shot.narration.audioUrl }
            : {}),
        },
        video: {
          selected_url: shot.video.selectedUrl,
          history: shot.video.history.map((entry) => ({
            url: entry.url,
            generated_at: entry.generatedAt,
            pinned: entry.pinned,
          })),
        },
      })),
    };

    const yamlString = yamlDump(yamlData, { lineWidth: 120 });
    const blob = new Blob([yamlString], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitiseFilename(script.title)}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [script]);

  // ─── Send chat message ────────────────────────────────────────────────────
  const handleChatSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const trimmed = chatInput.trim();
      if (!trimmed || chatLoading) return;

      const userMsg: ChatMessage = {
        id: generateId(),
        role: "user",
        content: trimmed,
      };

      if (isMounted.current) {
        setChatMessages((prev) => [...prev, userMsg]);
        setChatInput("");
        setChatLoading(true);
      }

      try {
        const settings = getSettings();
        const apiKey = settings?.poeApiKey;
        const client = createLLMClient(apiKey ?? undefined);

        // Build context: include script info as system context
        const systemContext = script
          ? `You are a creative assistant helping the user develop a video script. The current script is titled "${script.title}" and has ${script.shots.length} shot(s).`
          : "You are a creative assistant helping the user develop a video script.";

        const response = await client.chat(
          [
            { role: "system" as const, content: systemContext },
            ...chatMessages.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
            { role: "user" as const, content: trimmed },
          ],
          "claude-sonnet-4-5-20250929"
        );

        if (isMounted.current) {
          const assistantMsg: ChatMessage = {
            id: generateId(),
            role: "assistant",
            content: response,
          };
          setChatMessages((prev) => [...prev, assistantMsg]);
          refreshBalance(apiKey);
        }
      } catch (err) {
        if (isMounted.current) {
          const errMsg: ChatMessage = {
            id: generateId(),
            role: "assistant",
            content: `Error: ${err instanceof Error ? err.message : "Failed to get response. Please try again."}`,
          };
          setChatMessages((prev) => [...prev, errMsg]);
        }
      } finally {
        if (isMounted.current) {
          setChatLoading(false);
        }
      }
    },
    [chatInput, chatLoading, chatMessages, script, refreshBalance]
  );

  const handleChatKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleChatSubmit();
      }
    },
    [handleChatSubmit]
  );

  // ─── Loading / redirect state ─────────────────────────────────────────────
  if (notFound || !script) {
    // Redirect is handled by useEffect above; show nothing while redirecting
    return null;
  }

  const shotCount = script.shots.length;
  const durationS = shotCount * 8;

  // Safe active shot (clamp to valid range)
  const safeActiveShotIndex = Math.min(
    activeShotIndex,
    Math.max(0, shotCount - 1)
  );
  const activeShot =
    mode === "shot" ? script.shots[safeActiveShotIndex] : null;

  // Panel header label
  const headerLabel =
    mode === "shot" && shotCount > 0
      ? `Shot ${safeActiveShotIndex + 1} of ${shotCount}`
      : "Script";

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]" data-testid="script-editor">
      {/* ── Mobile tab bar ─────────────────────────────────────────────────── */}
      <div
        className="flex md:hidden border-b border-border bg-background"
        role="tablist"
        aria-label="Script editor panels"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "script"}
          onClick={() => setMobileTab("script")}
          className={[
            "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-b-2 transition-colors",
            mobileTab === "script"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          ].join(" ")}
          data-testid="mobile-tab-script"
        >
          <FileText className="h-4 w-4" />
          Script
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "chat"}
          onClick={() => setMobileTab("chat")}
          className={[
            "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-b-2 transition-colors",
            mobileTab === "chat"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          ].join(" ")}
          data-testid="mobile-tab-chat"
        >
          <MessageSquare className="h-4 w-4" />
          Chat
        </button>
      </div>

      {/* ── Main split-pane area ──────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left: Script panel ─────────────────────────────────────────── */}
        <div
          className={[
            "flex flex-col border-r border-border",
            // Desktop: always visible as left pane (60%)
            // Mobile: visible only when Script tab is active
            "md:flex md:w-3/5",
            mobileTab === "script" ? "flex flex-col w-full" : "hidden",
          ].join(" ")}
          data-testid="script-panel"
        >
          {/* Panel header */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-background shrink-0"
            data-testid="shot-mode-header"
          >
            <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              {headerLabel}
            </span>
            <div className="flex items-center gap-2">
              <ModeToggle mode={mode} onChange={handleModeChange} />
              <button
                type="button"
                onClick={handleAddShot}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium border border-border bg-background hover:bg-accent transition-colors"
                data-testid="add-shot-btn"
                aria-label="Add a new shot"
              >
                <Plus className="h-3.5 w-3.5" />
                Shot
              </button>
            </div>
          </div>

          {/* Script content area */}
          <div className="flex-1 overflow-y-auto p-4">
            {mode === "write" && (
              <div className="space-y-3" data-testid="write-mode-content">
                {script.shots.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
                    <p className="text-sm text-muted-foreground">
                      No shots yet. Click <strong>+ Shot</strong> to add the first one.
                    </p>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={script.shots.map((s) => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {script.shots.map((shot, idx) => (
                        <ShotCard
                          key={shot.id}
                          shot={shot}
                          index={idx}
                          script={script}
                          onUpdate={handleShotUpdate}
                          onDelete={handleDeleteShot}
                          onSwitchToShotMode={handleSwitchToShotMode}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
                {/* Sentinel element for scroll-to-new-shot */}
                <div ref={shotListEndRef} />

                {/* + Add Shot button at bottom of list */}
                {script.shots.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAddShot}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-accent/50 transition-colors"
                    data-testid="add-shot-bottom-btn"
                    aria-label="Add a new shot"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Shot
                  </button>
                )}
              </div>
            )}
            {mode === "shot" && (
              <>
                {shotCount === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
                    <p className="text-sm text-muted-foreground">
                      No shots yet. Click <strong>+ Shot</strong> to add the first one.
                    </p>
                  </div>
                ) : activeShot ? (
                  <ShotModeView
                    key={activeShot.id}
                    shot={activeShot}
                    shotIndex={safeActiveShotIndex}
                    script={script}
                    onUpdate={handleShotUpdate}
                    onNavigate={handleShotNavigate}
                    isMountedRef={isMounted}
                  />
                ) : null}
              </>
            )}
            {mode === "tmpl" && (
              <div
                className="flex flex-col items-center justify-center h-32 gap-2 text-center"
                data-testid="tmpl-mode-content"
              >
                <p className="text-sm text-muted-foreground">
                  Templates mode — coming in the next story (US-046).
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Chat panel ──────────────────────────────────────────── */}
        <div
          className={[
            "flex flex-col",
            // Desktop: always visible as right pane (40%)
            // Mobile: visible only when Chat tab is active
            "md:flex md:flex-1",
            mobileTab === "chat" ? "flex flex-col w-full" : "hidden",
          ].join(" ")}
          data-testid="chat-panel"
        >
          {/* Panel header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background shrink-0">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Chat
            </span>
          </div>

          {/* Message history */}
          <div
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
            data-testid="chat-message-list"
            aria-live="polite"
            aria-label="Chat messages"
          >
            {chatMessages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Ask Claude anything about your script.
              </p>
            )}
            {chatMessages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}
            {chatLoading && (
              <div className="flex justify-start" data-testid="chat-loading">
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm bg-muted border border-border text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Thinking…</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Message input */}
          <form
            onSubmit={(e) => void handleChatSubmit(e)}
            className="px-4 pb-4 pt-2 border-t border-border bg-background shrink-0"
            data-testid="chat-input-form"
          >
            <div className="flex items-end gap-2">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Ask Claude about your script… (Enter to send, Shift+Enter for newline)"
                disabled={chatLoading}
                rows={2}
                className="resize-none text-sm"
                data-testid="chat-input"
                aria-label="Chat message input"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!chatInput.trim() || chatLoading}
                aria-label="Send message"
                data-testid="chat-send-btn"
              >
                {chatLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Bottom bar ────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border bg-background shrink-0 flex-wrap gap-y-2"
        data-testid="editor-bottom-bar"
      >
        {/* Left: Subtitles toggle + shot info + shot mode prev/next */}
        <div className="flex items-center gap-3 text-sm flex-wrap">
          {/* Subtitles toggle */}
          <button
            type="button"
            onClick={handleSubtitlesToggle}
            className={[
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border transition-colors",
              script.settings.subtitles
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent",
            ].join(" ")}
            aria-pressed={script.settings.subtitles}
            data-testid="subtitles-toggle"
            aria-label={`Subtitles ${script.settings.subtitles ? "on" : "off"}`}
          >
            <span
              className={[
                "w-3 h-3 rounded-full border",
                script.settings.subtitles
                  ? "bg-primary border-primary"
                  : "border-current",
              ].join(" ")}
              aria-hidden="true"
            />
            Subtitles
          </button>

          {/* Shot count + duration */}
          <span className="text-xs text-muted-foreground" data-testid="shot-duration-label">
            {shotCount} {shotCount === 1 ? "shot" : "shots"} · ~{durationS}s
          </span>

          {/* Shot mode prev/next navigation in bottom bar */}
          {mode === "shot" && shotCount > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleShotNavigate(safeActiveShotIndex - 1)}
                disabled={safeActiveShotIndex === 0}
                className="flex items-center justify-center rounded-md px-2 py-1 text-xs border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="shot-prev-btn-bottom"
                aria-label="Previous shot"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {safeActiveShotIndex + 1}/{shotCount}
              </span>
              <button
                type="button"
                onClick={() => handleShotNavigate(safeActiveShotIndex + 1)}
                disabled={safeActiveShotIndex === shotCount - 1}
                className="flex items-center justify-center rounded-md px-2 py-1 text-xs border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="shot-next-btn-bottom"
                aria-label="Next shot"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Preview All (disabled) + Export Video */}
        <div className="flex items-center gap-2">
          <div className="relative group">
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-border bg-background text-muted-foreground opacity-50 cursor-not-allowed"
              data-testid="preview-all-btn"
              aria-label="Preview all (unavailable)"
              aria-disabled="true"
            >
              <Play className="h-3.5 w-3.5" />
              Preview All
            </button>
            {/* Tooltip */}
            <div
              className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50"
              role="tooltip"
            >
              <div className="rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background whitespace-nowrap shadow-md max-w-xs text-center">
                Final preview requires the export + Python script
              </div>
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportVideo}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-border bg-background hover:bg-accent transition-colors"
            data-testid="export-video-btn"
            aria-label="Export video script as YAML"
          >
            <Download className="h-3.5 w-3.5" />
            Export Video
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Exported page (wrapped in ErrorBoundary) ─────────────────────────────────

export default function VideoScriptView() {
  return (
    <ErrorBoundary>
      <VideoScriptViewInner />
    </ErrorBoundary>
  );
}
