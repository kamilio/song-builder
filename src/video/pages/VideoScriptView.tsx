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
  ChangeEvent,
  type MutableRefObject,
} from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
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
  Tags,
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
import { VIDEO_DURATIONS } from "@/video/lib/config";
import { log } from "@/music/lib/actionLog";
import type {
  Script,
  Shot,
  AudioSource,
  VideoHistoryEntry,
  LocalTemplate,
  GlobalTemplate,
  TemplateCategory,
} from "@/video/lib/storage/types";
import { createLLMClient } from "@/shared/lib/llm/factory";
import { usePoeBalanceContext } from "@/shared/context/PoeBalanceContext";
import { dump as yamlDump } from "js-yaml";
import TemplateAutocomplete from "@/video/components/TemplateAutocomplete";

// ─── Types ────────────────────────────────────────────────────────────────────

type EditorMode = "write" | "shot" | "tmpl";
type MobileTab = "script" | "chat";

/** Three-state derived from all shots: on / off / mixed */
type ToggleState = "on" | "off" | "mixed";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/**
 * Represents a single in-flight or failed generation slot in the VIDEO HISTORY
 * grid. On success, the slot is removed from this list and the real entry
 * appears in shot.video.history.
 */
type GenerationSlotState =
  | { status: "pending"; slotId: string }
  | { status: "error"; slotId: string; errorMessage: string; prompt: string };

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Default video clip duration in seconds (matches the veo-3.1 generation
 * setting duration: '8'). Used as the reference duration when validating
 * generated narration audio length.
 */
const VIDEO_DURATION = 8;

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

/**
 * Measure the duration of an audio URL by loading it into an HTMLAudioElement
 * and waiting for the 'loadedmetadata' event.
 * Resolves with the duration in seconds, or rejects on error.
 */
function measureAudioDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audioEl = new Audio();
    audioEl.src = url;
    audioEl.addEventListener("loadedmetadata", () => {
      resolve(audioEl.duration);
    });
    audioEl.addEventListener("error", () => {
      reject(new Error("Failed to load audio metadata."));
    });
  });
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

// ─── AudioPlayer ──────────────────────────────────────────────────────────────

interface AudioPlayerProps {
  url: string;
  onDelete: () => void;
  dataTestIdPrefix: string;
}

/**
 * Inline audio player showing filename, duration, and play/delete controls.
 * Duration is measured via HTMLAudioElement loadedmetadata event.
 */
function AudioPlayer({ url, onDelete, dataTestIdPrefix }: AudioPlayerProps) {
  const [duration, setDuration] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audioEl = new Audio();
    audioEl.src = url;
    audioRef.current = audioEl;
    const handleLoaded = () => {
      setDuration(audioEl.duration);
    };
    audioEl.addEventListener("loadedmetadata", handleLoaded);
    return () => {
      audioEl.removeEventListener("loadedmetadata", handleLoaded);
      audioRef.current = null;
    };
  }, [url]);

  function handlePlay() {
    if (audioRef.current) {
      if (audioRef.current.paused) {
        void audioRef.current.play();
      } else {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }

  const filename = extractFilename(url);
  const durationLabel =
    duration !== null
      ? `${Math.round(duration * 10) / 10}s`
      : "…";

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs"
      data-testid={`${dataTestIdPrefix}-player`}
    >
      <button
        type="button"
        onClick={handlePlay}
        className="shrink-0 flex items-center justify-center rounded-full h-5 w-5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        data-testid={`${dataTestIdPrefix}-play-btn`}
        aria-label="Play audio"
      >
        <Play className="h-2.5 w-2.5 fill-current" />
      </button>
      <span className="flex-1 truncate font-medium text-foreground" title={url}>
        {filename}
      </span>
      <span className="shrink-0 text-muted-foreground" data-testid={`${dataTestIdPrefix}-duration`}>
        {durationLabel}
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
        data-testid={`${dataTestIdPrefix}-delete-btn`}
        aria-label="Delete audio"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Subtitles state helpers ──────────────────────────────────────────────────

function computeSubtitlesState(shots: Shot[]): ToggleState {
  if (shots.length === 0) return "off";
  const allOn = shots.every((s) => s.subtitles);
  const allOff = shots.every((s) => !s.subtitles);
  if (allOn) return "on";
  if (allOff) return "off";
  return "mixed";
}

// ─── MixedToggle ──────────────────────────────────────────────────────────────

interface MixedToggleProps {
  state: ToggleState;
  onClick: () => void;
  "data-testid": string;
  "aria-label": string;
}

/**
 * Toggle switch with three visual states: on, off, mixed.
 *
 * Visual:
 *   on    → filled blue, dot at right
 *   off   → grey, dot at left
 *   mixed → primary/50, dot centred (indeterminate)
 */
function MixedToggle({
  state,
  onClick,
  "data-testid": testId,
  "aria-label": ariaLabel,
}: MixedToggleProps) {
  const isOn = state === "on";
  const isMixed = state === "mixed";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn ? true : isMixed ? "mixed" : false}
      onClick={onClick}
      className={[
        "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
        isOn ? "bg-primary" : isMixed ? "bg-primary/50" : "bg-input",
      ].join(" ")}
      data-testid={testId}
      aria-label={ariaLabel}
    >
      <span
        className={[
          "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
          isOn ? "translate-x-3" : isMixed ? "translate-x-1.5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
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

  // ── Autocomplete state (US-059) ─────────────────────────────────────────────
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // ── Global templates for autocomplete (US-059) ──────────────────────────────
  const [globalTemplates, setGlobalTemplates] = useState<GlobalTemplate[]>(() =>
    videoStorageService.listGlobalTemplates()
  );

  // ── Poe balance ─────────────────────────────────────────────────────────────
  const { refreshBalance } = usePoeBalanceContext();

  // ── Narration local state ──────────────────────────────────────────────────
  const [narrationText, setNarrationText] = useState(shot.narration.text);

  // ── Audio generation state ─────────────────────────────────────────────────
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  // Close autocomplete on outside click (US-059)
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

  // Close autocomplete on Escape (US-059)
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

  // ── Rename handlers ─────────────────────────────────────────────────────────

  function commitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameValue(shot.title);
      setIsRenaming(false);
      return;
    }
    const oldTitle = shot.title;
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id ? { ...s, title: trimmed } : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated) {
      if (trimmed !== oldTitle) {
        log({
          category: "user:action",
          action: "video:shot:rename",
          data: { scriptId: script.id, shotId: shot.id, oldTitle, newTitle: trimmed },
        });
      }
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
      log({
        category: "user:action",
        action: "video:shot:prompt:edit",
        data: { scriptId: script.id, shotId: shot.id, length: promptValue.length },
      });
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
      log({
        category: "user:action",
        action: "video:shot:narration:toggle",
        data: { scriptId: script.id, shotId: shot.id, enabled: newEnabled },
      });
      onUpdate(updated);
    }
  }

  // ── Subtitles toggle (Write mode card) ─────────────────────────────────────

  function handleShotSubtitlesToggle() {
    const newSubtitles = !shot.subtitles;
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id ? { ...s, subtitles: newSubtitles } : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated) {
      log({
        category: "user:action",
        action: "video:shot:subtitles:toggle",
        data: { scriptId: script.id, shotId: shot.id, subtitles: newSubtitles },
      });
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
      log({
        category: "user:action",
        action: "video:shot:narration:edit",
        data: { scriptId: script.id, shotId: shot.id, length: narrationText.length },
      });
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
      log({
        category: "user:action",
        action: "video:shot:audio:source",
        data: { scriptId: script.id, shotId: shot.id, source },
      });
      onUpdate(updated);
    }
  }

  // ── Audio generation ────────────────────────────────────────────────────────

  async function handleGenerateAudio() {
    if (isGeneratingAudio) return;

    const settings = getSettings();
    const apiKey = settings?.poeApiKey;
    let client;
    try {
      client = createLLMClient(apiKey ?? undefined);
    } catch (err) {
      if (isMountedRef.current) {
        setAudioError(
          err instanceof Error ? err.message : "Failed to create LLM client."
        );
      }
      return;
    }

    if (isMountedRef.current) {
      setIsGeneratingAudio(true);
      setAudioError(null);
      log({
        category: "user:action",
        action: "video:audio:generate:start",
        data: { scriptId: script.id, shotId: shot.id },
      });
    }

    try {
      const audioUrl = await client.generateAudio(shot.narration.text);
      if (!isMountedRef.current) return;

      let durationS: number;
      try {
        durationS = await measureAudioDuration(audioUrl);
      } catch {
        if (isMountedRef.current) {
          setAudioError("Failed to measure audio duration.");
          setIsGeneratingAudio(false);
          log({
            category: "user:action",
            action: "video:audio:generate:error",
            data: { scriptId: script.id, shotId: shot.id, error: "Failed to measure audio duration." },
          });
          refreshBalance(apiKey);
        }
        return;
      }

      if (!isMountedRef.current) return;

      if (durationS > VIDEO_DURATION) {
        const roundedS = Math.round(durationS * 10) / 10;
        const errorMsg = `Audio is too long (${roundedS}s). Shorten the narration text and regenerate.`;
        setAudioError(errorMsg);
        setIsGeneratingAudio(false);
        log({
          category: "user:action",
          action: "video:audio:generate:error",
          data: { scriptId: script.id, shotId: shot.id, error: errorMsg },
        });
        refreshBalance(apiKey);
        return;
      }

      const updatedShots = script.shots.map((s) =>
        s.id === shot.id
          ? { ...s, narration: { ...s.narration, audioUrl } }
          : s
      );
      const updated = videoStorageService.updateScript(script.id, {
        shots: updatedShots,
      });
      if (updated && isMountedRef.current) {
        log({
          category: "user:action",
          action: "video:audio:generate:complete",
          data: { scriptId: script.id, shotId: shot.id, durationS },
        });
        onUpdate(updated);
      }

      if (isMountedRef.current) {
        setIsGeneratingAudio(false);
        refreshBalance(apiKey);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const errorMsg = err instanceof Error ? err.message : "Audio generation failed.";
      setAudioError(errorMsg);
      setIsGeneratingAudio(false);
      log({
        category: "user:action",
        action: "video:audio:generate:error",
        data: { scriptId: script.id, shotId: shot.id, error: errorMsg },
      });
      refreshBalance(apiKey);
    }
  }

  function handleDeleteAudio() {
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id
        ? { ...s, narration: { ...s.narration, audioUrl: undefined } }
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

  // ── Autocomplete detection in textarea onChange (US-059) ───────────────────

  function handlePromptChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value;
    setPromptValue(newValue);

    // Detect '{{' typed to open autocomplete
    const cursorPos = e.target.selectionStart ?? newValue.length;
    const textBefore = newValue.slice(0, cursorPos);
    const lastDoubleOpen = textBefore.lastIndexOf("{{");
    if (lastDoubleOpen !== -1) {
      const query = textBefore.slice(lastDoubleOpen + 2);
      if (!query.includes("}")) {
        // Refresh global templates on first open
        if (!autocompleteOpen) {
          setGlobalTemplates(videoStorageService.listGlobalTemplates());
        }
        setAutocompleteOpen(true);
        setAutocompleteQuery(query);
      } else {
        setAutocompleteOpen(false);
      }
    } else {
      setAutocompleteOpen(false);
    }
  }

  // ── Insert from autocomplete in Write mode textarea (US-059) ───────────────

  function insertTemplateFromAutocomplete(name: string) {
    const textarea = promptRef.current;
    if (!textarea) return;
    setAutocompleteOpen(false);

    // Delete '{{' + query, then insert {{name}}
    const cursorPos = textarea.selectionStart ?? promptValue.length;
    const textBefore = promptValue.slice(0, cursorPos);
    const lastDoubleOpen = textBefore.lastIndexOf("{{");
    const insertion = `{{${name}}}`;

    let newValue: string;
    let newCursorPos: number;
    if (lastDoubleOpen !== -1) {
      // Replace from '{{' to cursor with {{name}}
      newValue =
        promptValue.slice(0, lastDoubleOpen) +
        insertion +
        promptValue.slice(cursorPos);
      newCursorPos = lastDoubleOpen + insertion.length;
    } else {
      newValue =
        promptValue.slice(0, cursorPos) + insertion + promptValue.slice(cursorPos);
      newCursorPos = cursorPos + insertion.length;
    }

    setPromptValue(newValue);
    // Persist immediately
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id ? { ...s, prompt: newValue } : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated) {
      onUpdate(updated);
    }
    // Restore focus and cursor
    setTimeout(() => {
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }

  // ── Local templates (all local, not just referenced) for autocomplete ───────

  const allLocalTemplates = Object.values(script.templates).filter(
    (tmpl) => !tmpl.global
  );

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
          {/* Prompt textarea with autocomplete (US-059) */}
          <div>
            <label
              htmlFor={`shot-prompt-${shot.id}`}
              className="block text-xs font-medium text-muted-foreground mb-1"
            >
              Video prompt
            </label>
            <div className="relative">
              <Textarea
                id={`shot-prompt-${shot.id}`}
                ref={promptRef}
                value={promptValue}
                onChange={handlePromptChange}
                onBlur={handlePromptBlur}
                placeholder="Describe this shot…"
                rows={3}
                className="resize-none text-sm"
                data-testid={`shot-prompt-${shot.id}`}
                aria-label={`Video prompt for shot ${index + 1}`}
              />
              {/* Autocomplete dropdown */}
              <TemplateAutocomplete
                ref={autocompleteRef}
                open={autocompleteOpen}
                query={autocompleteQuery}
                localTemplates={allLocalTemplates}
                globalTemplates={globalTemplates}
                onSelect={insertTemplateFromAutocomplete}
              />
            </div>
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
                      onClick={() => void handleGenerateAudio()}
                      disabled={isGeneratingAudio || !shot.narration.text.trim()}
                      className={[
                        "ml-auto flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-border transition-colors",
                        isGeneratingAudio || !shot.narration.text.trim()
                          ? "bg-background opacity-50 cursor-not-allowed"
                          : "bg-background hover:bg-accent",
                      ].join(" ")}
                      data-testid={`generate-audio-btn-${shot.id}`}
                      aria-label={`Generate audio for shot ${index + 1}`}
                      aria-busy={isGeneratingAudio}
                    >
                      {isGeneratingAudio ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Generating…
                        </>
                      ) : (
                        "Generate Audio"
                      )}
                    </button>
                  )}
                </div>

                {/* Audio error message */}
                {audioError && (
                  <div
                    className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                    data-testid={`audio-error-${shot.id}`}
                    role="alert"
                  >
                    <span className="flex-1">{audioError}</span>
                    {shot.narration.audioSource === "elevenlabs" && (
                      <button
                        type="button"
                        onClick={() => void handleGenerateAudio()}
                        disabled={isGeneratingAudio || !shot.narration.text.trim()}
                        className="shrink-0 font-medium underline hover:no-underline disabled:opacity-50"
                        data-testid={`audio-regenerate-btn-${shot.id}`}
                      >
                        Regenerate
                      </button>
                    )}
                  </div>
                )}

                {/* Stored audio URL display */}
                {!audioError && shot.narration.audioUrl && (
                  <AudioPlayer
                    url={shot.narration.audioUrl}
                    onDelete={handleDeleteAudio}
                    dataTestIdPrefix={`audio-${shot.id}`}
                  />
                )}
              </div>
            )}
          </div>

          {/* Subtitles toggle (Write mode card indicator) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={shot.subtitles}
              onClick={handleShotSubtitlesToggle}
              className={[
                "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                shot.subtitles ? "bg-primary" : "bg-input",
              ].join(" ")}
              data-testid={`shot-subtitles-toggle-${shot.id}`}
              aria-label="Toggle subtitles"
            >
              <span
                className={[
                  "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                  shot.subtitles ? "translate-x-3" : "translate-x-0",
                ].join(" ")}
              />
            </button>
            <span className="text-xs font-medium text-muted-foreground">
              Subtitles
            </span>
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

// ─── TemplatesModeView ────────────────────────────────────────────────────────

const TEMPLATE_CATEGORY_TABS: { id: TemplateCategory; label: string; addLabel: string }[] = [
  { id: "character", label: "Characters", addLabel: "+ Add Character" },
  { id: "style",     label: "Style",      addLabel: "+ Add Style"     },
  { id: "scenery",   label: "Scenery",    addLabel: "+ Add Scenery"   },
];

interface LocalTemplateFormProps {
  /** If provided, the form is in edit mode. */
  initial?: LocalTemplate;
  /** Pre-selected category (can be undefined). */
  initialCategory?: TemplateCategory;
  onSave: (data: { name: string; category: TemplateCategory; value: string }) => void;
  onCancel: () => void;
}

function LocalTemplateForm({ initial, initialCategory, onSave, onCancel }: LocalTemplateFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<TemplateCategory>(
    initial?.category ?? initialCategory ?? "character"
  );
  const [value, setValue] = useState(initial?.value ?? "");
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedValue = value.trim();

    if (!trimmedName) {
      setError("Variable name is required.");
      nameInputRef.current?.focus();
      return;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedName)) {
      setError("Name must start with a letter or underscore and contain only letters, digits, or underscores.");
      nameInputRef.current?.focus();
      return;
    }
    if (!trimmedValue) {
      setError("Value is required.");
      return;
    }

    setError(null);
    onSave({ name: trimmedName, category, value: trimmedValue });
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          {initial ? "Edit Variable" : "New Variable"}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {/* Name */}
        <div className="space-y-1">
          <label htmlFor="local-template-name" className="text-xs font-medium">
            Variable name
          </label>
          <input
            id="local-template-name"
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. maya_character"
            className="w-full text-sm bg-background border border-border rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary"
            aria-required="true"
            aria-describedby={error ? "local-template-form-error" : undefined}
            readOnly={!!initial}
            aria-readonly={!!initial}
            data-testid="local-template-name-input"
          />
        </div>

        {/* Category */}
        <div className="space-y-1">
          <label className="text-xs font-medium">Category</label>
          <div className="flex gap-2">
            {TEMPLATE_CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategory(tab.id)}
                className={`flex-1 py-1 text-xs rounded border transition-colors ${
                  category === tab.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
                aria-pressed={category === tab.id}
                data-testid={`local-template-category-${tab.id}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Value */}
        <div className="space-y-1">
          <label htmlFor="local-template-value" className="text-xs font-medium">
            Value
          </label>
          <textarea
            id="local-template-value"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder="Describe this template variable in detail…"
            rows={3}
            className="w-full text-sm bg-background border border-border rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary resize-none"
            aria-required="true"
            aria-describedby={error ? "local-template-form-error" : undefined}
            data-testid="local-template-value-input"
          />
        </div>

        {error && (
          <p id="local-template-form-error" className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" data-testid="local-template-save-btn">
            {initial ? "Save Changes" : "Add Variable"}
          </Button>
        </div>
      </form>
    </div>
  );
}

interface LocalTemplateCardProps {
  template: LocalTemplate;
  onEdit: (template: LocalTemplate) => void;
  onDelete: (name: string) => void;
}

function LocalTemplateCard({ template, onEdit, onDelete }: LocalTemplateCardProps) {
  const categoryLabel =
    template.category === "character"
      ? "Characters"
      : template.category === "style"
      ? "Style"
      : "Scenery";

  return (
    <div
      className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2 hover:shadow-sm hover:border-foreground/20 transition-all"
      data-testid={`local-template-card-${template.name}`}
    >
      {/* Variable name chip + category */}
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-primary/10 text-primary border border-primary/20">
          {`{{${template.name}}}`}
        </span>
        <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
          {categoryLabel}
        </span>
      </div>

      {/* Value text */}
      <p className="text-xs text-muted-foreground leading-snug line-clamp-3">
        {template.value}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(template)}
          data-testid={`local-template-edit-${template.name}`}
          aria-label={`Edit ${template.name}`}
        >
          <Pencil className="h-3 w-3 mr-1" aria-hidden="true" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(template.name)}
          className="text-destructive hover:text-destructive border-destructive/20 hover:border-destructive/40 hover:bg-destructive/5"
          data-testid={`local-template-delete-${template.name}`}
          aria-label={`Delete ${template.name}`}
        >
          <Trash2 className="h-3 w-3 mr-1" aria-hidden="true" />
          Delete
        </Button>
      </div>
    </div>
  );
}

interface TemplatesModeViewProps {
  script: Script;
  onUpdate: (updatedScript: Script) => void;
}

/**
 * Templates mode for the script editor (US-046).
 *
 * Shows local (per-script) template variables with create/edit/delete actions.
 * Mirrors the layout of the global Templates page but scoped to the current
 * script. Saving writes with global: false.
 */
function TemplatesModeView({ script, onUpdate }: TemplatesModeViewProps) {
  // Form state: null = closed, { mode, initial, initialCategory }
  const [formState, setFormState] = useState<{
    mode: "create" | "edit";
    initial?: LocalTemplate;
    initialCategory?: TemplateCategory;
  } | null>(null);

  // Pending delete name
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);

  // All local templates as an array
  const localTemplates = Object.values(script.templates);

  // ── Form handlers ────────────────────────────────────────────────────────

  function openCreateForm() {
    setFormState({ mode: "create" });
  }

  function openEditForm(template: LocalTemplate) {
    setFormState({ mode: "edit", initial: template });
  }

  function handleFormSave(data: { name: string; category: TemplateCategory; value: string }) {
    const isEdit = formState?.mode === "edit";
    const newTemplate: LocalTemplate = {
      name: data.name,
      category: data.category,
      value: data.value,
      global: false,
    };

    const updatedTemplates: Record<string, LocalTemplate> = {
      ...script.templates,
      [data.name]: newTemplate,
    };

    const updated = videoStorageService.updateScript(script.id, {
      templates: updatedTemplates,
    });
    if (updated) {
      onUpdate(updated);
    }
    log({
      category: "user:action",
      action: isEdit ? "video:template:local:edit" : "video:template:local:create",
      data: isEdit
        ? { scriptId: script.id, name: data.name }
        : { scriptId: script.id, name: data.name, category: data.category },
    });
    setFormState(null);
  }

  function handleFormCancel() {
    setFormState(null);
  }

  // ── Delete handlers ──────────────────────────────────────────────────────

  function handleDeleteRequest(name: string) {
    setPendingDeleteName(name);
  }

  function confirmDelete() {
    if (!pendingDeleteName) return;
    const updatedTemplates = { ...script.templates };
    delete updatedTemplates[pendingDeleteName];
    const updated = videoStorageService.updateScript(script.id, {
      templates: updatedTemplates,
    });
    if (updated) {
      onUpdate(updated);
    }
    log({
      category: "user:action",
      action: "video:template:local:delete",
      data: { scriptId: script.id, name: pendingDeleteName },
    });
    setPendingDeleteName(null);
  }

  function cancelDelete() {
    setPendingDeleteName(null);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4" data-testid="tmpl-mode-content">
      {/* Section header + add button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Tags className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">
            Local variables scoped to this script.
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={openCreateForm}
          data-testid="local-template-add-btn"
          aria-label="Add variable"
        >
          <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          Add Variable
        </Button>
      </div>

      {/* Inline form (shown above the list when creating) */}
      {formState !== null && (
        <LocalTemplateForm
          initial={formState.initial}
          initialCategory={formState.initialCategory}
          onSave={handleFormSave}
          onCancel={handleFormCancel}
        />
      )}

      {/* Template list */}
      {localTemplates.length === 0 && formState === null ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            No local template variables yet.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={openCreateForm}
            data-testid="local-template-add-empty-btn"
          >
            <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Add Variable
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {localTemplates.map((template) => (
            <LocalTemplateCard
              key={template.name}
              template={template}
              onEdit={openEditForm}
              onDelete={handleDeleteRequest}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {pendingDeleteName !== null && (
        <ConfirmDialog
          title="Delete template?"
          description={`Delete "{{${pendingDeleteName}}}"? Shot prompts that reference this variable will keep the {{${pendingDeleteName}}} placeholder, but it will no longer appear as a chip.`}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </div>
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
  const { refreshBalance } = usePoeBalanceContext();

  // ── Narration local state ──────────────────────────────────────────────────
  const [narrationText, setNarrationText] = useState(shot.narration.text);
  const [generateCount, setGenerateCount] = useState(1);

  // ── Audio generation state ─────────────────────────────────────────────────
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  // ── Generation state ───────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSlots, setGenerationSlots] = useState<GenerationSlotState[]>([]);

  // ── Confirm delete for history entries ────────────────────────────────────
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);

  // ── Autocomplete state ────────────────────────────────────────────────────
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Sync narrationText and clear audio error when shot changes (navigating shots)
  useEffect(() => {
    setNarrationText(shot.narration.text);
    setAudioError(null);
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
    onBlur: ({ editor: ed }) => {
      const json = ed.getJSON();
      const text = tiptapContentToPrompt(json as { type: string; content?: object[] });
      log({
        category: "user:action",
        action: "video:shot:prompt:edit",
        data: { scriptId: script.id, shotId: shot.id, length: text.length },
      });
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
      log({
        category: "user:action",
        action: "video:shot:narration:toggle",
        data: { scriptId: script.id, shotId: shot.id, enabled: newEnabled },
      });
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
      log({
        category: "user:action",
        action: "video:shot:narration:edit",
        data: { scriptId: script.id, shotId: shot.id, length: narrationText.length },
      });
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
      log({
        category: "user:action",
        action: "video:shot:audio:source",
        data: { scriptId: script.id, shotId: shot.id, source },
      });
      onUpdate(updated);
    }
  }

  // ── Audio generation ──────────────────────────────────────────────────────

  /**
   * Generate ElevenLabs narration audio for this shot.
   * - Calls LLMClient.generateAudio(narrationText)
   * - Measures the audio duration using HTMLAudioElement
   * - If duration > VIDEO_DURATION, rejects (does not store) and shows an error
   * - On success, stores the audioUrl in shot.narration.audioUrl
   * - refreshBalance is called after completion (success or rejection)
   * - isMounted ref guards all setState calls after await
   */
  const handleGenerateAudio = useCallback(async () => {
    if (isGeneratingAudio) return;

    const settings = getSettings();
    const apiKey = settings?.poeApiKey;
    let client;
    try {
      client = createLLMClient(apiKey ?? undefined);
    } catch (err) {
      if (isMountedRef.current) {
        setAudioError(
          err instanceof Error ? err.message : "Failed to create LLM client."
        );
      }
      return;
    }

    if (isMountedRef.current) {
      setIsGeneratingAudio(true);
      setAudioError(null);
      log({
        category: "user:action",
        action: "video:audio:generate:start",
        data: { scriptId: script.id, shotId: shot.id },
      });
    }

    try {
      const audioUrl = await client.generateAudio(shot.narration.text);
      if (!isMountedRef.current) return;

      // Measure duration using HTMLAudioElement
      let durationS: number;
      try {
        durationS = await measureAudioDuration(audioUrl);
      } catch {
        if (isMountedRef.current) {
          setAudioError("Failed to measure audio duration.");
          setIsGeneratingAudio(false);
          log({
            category: "user:action",
            action: "video:audio:generate:error",
            data: { scriptId: script.id, shotId: shot.id, error: "Failed to measure audio duration." },
          });
          refreshBalance(apiKey);
        }
        return;
      }

      if (!isMountedRef.current) return;

      // Reject if audio is longer than the clip duration
      if (durationS > VIDEO_DURATION) {
        const roundedS = Math.round(durationS * 10) / 10;
        const errorMsg = `Audio is too long (${roundedS}s). Shorten the narration text and regenerate.`;
        setAudioError(errorMsg);
        setIsGeneratingAudio(false);
        log({
          category: "user:action",
          action: "video:audio:generate:error",
          data: { scriptId: script.id, shotId: shot.id, error: errorMsg },
        });
        refreshBalance(apiKey);
        return;
      }

      // Store the audio URL
      const updatedShots = script.shots.map((s) =>
        s.id === shot.id
          ? { ...s, narration: { ...s.narration, audioUrl } }
          : s
      );
      const updated = videoStorageService.updateScript(script.id, {
        shots: updatedShots,
      });
      if (updated && isMountedRef.current) {
        log({
          category: "user:action",
          action: "video:audio:generate:complete",
          data: { scriptId: script.id, shotId: shot.id, durationS },
        });
        onUpdate(updated);
      }

      if (isMountedRef.current) {
        setIsGeneratingAudio(false);
        refreshBalance(apiKey);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const errorMsg = err instanceof Error ? err.message : "Audio generation failed.";
      setAudioError(errorMsg);
      setIsGeneratingAudio(false);
      log({
        category: "user:action",
        action: "video:audio:generate:error",
        data: { scriptId: script.id, shotId: shot.id, error: errorMsg },
      });
      refreshBalance(apiKey);
    }
  }, [
    isGeneratingAudio,
    shot.id,
    shot.narration.text,
    script.id,
    script.shots,
    isMountedRef,
    onUpdate,
    refreshBalance,
  ]);

  /**
   * Delete the stored audio URL for this shot.
   */
  function handleDeleteAudio() {
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id
        ? { ...s, narration: { ...s.narration, audioUrl: undefined } }
        : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated && isMountedRef.current) {
      onUpdate(updated);
    }
  }

  // ── Subtitles toggle (per-shot) ────────────────────────────────────────────

  function handleShotSubtitlesToggle() {
    const newSubtitles = !shot.subtitles;
    const updatedShots = script.shots.map((s) =>
      s.id === shot.id ? { ...s, subtitles: newSubtitles } : s
    );
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated && isMountedRef.current) {
      log({
        category: "user:action",
        action: "video:shot:subtitles:toggle",
        data: { scriptId: script.id, shotId: shot.id, subtitles: newSubtitles },
      });
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
      log({
        category: "user:action",
        action: "video:take:select",
        data: { scriptId: script.id, shotId: shot.id, url },
      });
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
      log({
        category: "user:action",
        action: isPinned ? "video:take:unpin" : "video:take:pin",
        data: { scriptId: script.id, shotId: shot.id, url: entry.url },
      });
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
    log({
      category: "user:action",
      action: "video:take:download",
      data: { scriptId: script.id, shotId: shot.id, url },
    });
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
      log({
        category: "user:action",
        action: "video:take:delete",
        data: { scriptId: script.id, shotId: shot.id, url: entry.url },
      });
      onUpdate(updated);
      setConfirmDeleteIndex(null);
    }
  }

  // ── Video generation ──────────────────────────────────────────────────────

  /**
   * Fire generateVideo() N times in parallel (N = generateCount).
   * Each call is tracked as a slot. On completion (success or error) the
   * slot is resolved independently so partial results appear immediately.
   * refreshBalance is called once after all slots settle.
   */
  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;

    const settings = getSettings();
    const apiKey = settings?.poeApiKey;
    let client;
    try {
      client = createLLMClient(apiKey ?? undefined);
    } catch (err) {
      // No API key and not in mock mode — surface as an error slot
      const slotId = generateId();
      if (isMountedRef.current) {
        setGenerationSlots([
          {
            status: "error",
            slotId,
            errorMessage: err instanceof Error ? err.message : "Failed to create LLM client.",
            prompt: shot.prompt,
          },
        ]);
      }
      return;
    }

    // Build initial pending slots
    const initialSlots: GenerationSlotState[] = Array.from(
      { length: generateCount },
      () => ({ status: "pending" as const, slotId: generateId() })
    );

    if (isMountedRef.current) {
      setIsGenerating(true);
      setGenerationSlots(initialSlots);
      log({
        category: "user:action",
        action: "video:generate:start",
        data: { scriptId: script.id, shotId: shot.id, count: generateCount },
      });
    }

    const promptText = shot.prompt;
    let successCount = 0;

    // Run all slots in parallel
    const slotPromises = initialSlots.map(async (slot) => {
      try {
        const url = await client.generateVideo(promptText);
        if (!isMountedRef.current) return;

        // Append to storage history
        const latestScript = videoStorageService.getScript(script.id);
        if (!latestScript) return;
        const latestShot = latestScript.shots.find((s) => s.id === shot.id);
        if (!latestShot) return;

        const newEntry: VideoHistoryEntry = {
          url,
          generatedAt: new Date().toISOString(),
          pinned: false,
        };
        const updatedHistory = [...latestShot.video.history, newEntry];
        const updatedShots = latestScript.shots.map((s) =>
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
        successCount++;

        // Remove this slot from pending slots on success
        if (isMountedRef.current) {
          setGenerationSlots((prev) =>
            prev.filter((sl) => sl.slotId !== slot.slotId)
          );
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        const errorMsg = err instanceof Error ? err.message : "Generation failed.";
        log({
          category: "user:action",
          action: "video:generate:error",
          data: { scriptId: script.id, shotId: shot.id, error: errorMsg },
        });
        // Replace pending slot with error slot
        setGenerationSlots((prev) =>
          prev.map((sl) =>
            sl.slotId === slot.slotId
              ? {
                  status: "error" as const,
                  slotId: sl.slotId,
                  errorMessage: errorMsg,
                  prompt: promptText,
                }
              : sl
          )
        );
      }
    });

    // Wait for all slots to settle, then refresh balance and clear loading state
    await Promise.allSettled(slotPromises);

    if (isMountedRef.current) {
      log({
        category: "user:action",
        action: "video:generate:complete",
        data: { scriptId: script.id, shotId: shot.id, count: generateCount, successCount },
      });
      setIsGenerating(false);
      refreshBalance(apiKey);
    }
  }, [
    isGenerating,
    generateCount,
    shot.id,
    shot.prompt,
    script.id,
    isMountedRef,
    onUpdate,
    refreshBalance,
  ]);

  /**
   * Retry a single failed slot.
   */
  const handleRetrySlot = useCallback(
    async (slotId: string, prompt: string) => {
      const settings = getSettings();
      const apiKey = settings?.poeApiKey;
      let client;
      try {
        client = createLLMClient(apiKey ?? undefined);
      } catch (err) {
        if (isMountedRef.current) {
          setGenerationSlots((prev) =>
            prev.map((sl) =>
              sl.slotId === slotId
                ? {
                    status: "error" as const,
                    slotId,
                    errorMessage:
                      err instanceof Error ? err.message : "Failed to create LLM client.",
                    prompt,
                  }
                : sl
            )
          );
        }
        return;
      }

      // Mark slot as pending again
      if (isMountedRef.current) {
        setGenerationSlots((prev) =>
          prev.map((sl) =>
            sl.slotId === slotId
              ? { status: "pending" as const, slotId }
              : sl
          )
        );
        setIsGenerating(true);
      }

      try {
        const url = await client.generateVideo(prompt);
        if (!isMountedRef.current) return;

        const latestScript = videoStorageService.getScript(script.id);
        if (!latestScript) return;
        const latestShot = latestScript.shots.find((s) => s.id === shot.id);
        if (!latestShot) return;

        const newEntry: VideoHistoryEntry = {
          url,
          generatedAt: new Date().toISOString(),
          pinned: false,
        };
        const updatedHistory = [...latestShot.video.history, newEntry];
        const updatedShots = latestScript.shots.map((s) =>
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

        if (isMountedRef.current) {
          setGenerationSlots((prev) =>
            prev.filter((sl) => sl.slotId !== slotId)
          );
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        setGenerationSlots((prev) =>
          prev.map((sl) =>
            sl.slotId === slotId
              ? {
                  status: "error" as const,
                  slotId,
                  errorMessage:
                    err instanceof Error ? err.message : "Generation failed.",
                  prompt,
                }
              : sl
          )
        );
      } finally {
        // Clear loading state and refresh balance after retry settles
        if (isMountedRef.current) {
          setIsGenerating(false);
          refreshBalance(apiKey);
        }
      }
    },
    [script.id, shot.id, isMountedRef, onUpdate, refreshBalance]
  );

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

          {/* Autocomplete dropdown (US-059) */}
          <TemplateAutocomplete
            ref={autocompleteRef}
            open={autocompleteOpen}
            query={autocompleteQuery}
            localTemplates={localTemplates}
            globalTemplates={globalTemplates}
            onSelect={insertTemplateFromAutocomplete}
          />
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
                  onClick={() => void handleGenerateAudio()}
                  disabled={isGeneratingAudio || !shot.narration.text.trim()}
                  className={[
                    "ml-auto flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-border transition-colors",
                    isGeneratingAudio || !shot.narration.text.trim()
                      ? "bg-background opacity-50 cursor-not-allowed"
                      : "bg-background hover:bg-accent",
                  ].join(" ")}
                  data-testid="shot-mode-generate-audio-btn"
                  aria-label="Generate narration audio"
                  aria-busy={isGeneratingAudio}
                >
                  {isGeneratingAudio ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    "Generate Audio"
                  )}
                </button>
              )}
            </div>

            {/* Audio error message */}
            {audioError && (
              <div
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                data-testid="shot-mode-audio-error"
                role="alert"
              >
                <span className="flex-1">{audioError}</span>
                {shot.narration.audioSource === "elevenlabs" && (
                  <button
                    type="button"
                    onClick={() => void handleGenerateAudio()}
                    disabled={isGeneratingAudio || !shot.narration.text.trim()}
                    className="shrink-0 font-medium underline hover:no-underline disabled:opacity-50"
                    data-testid="shot-mode-audio-regenerate-btn"
                  >
                    Regenerate
                  </button>
                )}
              </div>
            )}

            {/* Stored audio URL display */}
            {!audioError && shot.narration.audioUrl && (
              <AudioPlayer
                url={shot.narration.audioUrl}
                onDelete={handleDeleteAudio}
                dataTestIdPrefix="shot-mode-audio"
              />
            )}
          </div>
        )}
      </div>

      {/* ── SUBTITLES section ─────────────────────────────────────────────────── */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Subtitles
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={shot.subtitles}
            onClick={handleShotSubtitlesToggle}
            className={[
              "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
              shot.subtitles ? "bg-primary" : "bg-input",
            ].join(" ")}
            data-testid={`shot-subtitles-toggle-${shot.id}`}
            aria-label="Toggle subtitles for this shot"
          >
            <span
              className={[
                "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                shot.subtitles ? "translate-x-3" : "translate-x-0",
              ].join(" ")}
            />
          </button>
        </div>
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
                disabled={isGenerating}
                className={[
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  n > 1 ? "border-l border-border" : "",
                  isGenerating ? "opacity-50 cursor-not-allowed" : "",
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
            onClick={() => void handleGenerate()}
            disabled={isGenerating}
            className={[
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              isGenerating
                ? "bg-primary/60 text-primary-foreground cursor-not-allowed opacity-70"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            ].join(" ")}
            data-testid="generate-btn"
            aria-label={`Generate ${generateCount} video${generateCount > 1 ? "s" : ""}`}
            aria-busy={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {isGenerating ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      {/* ── VIDEO HISTORY section ─────────────────────────────────────────────── */}
      <div className="space-y-2 pt-1">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Video History
        </span>

        {shot.video.history.length === 0 && generationSlots.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No videos generated yet. Click Generate to create your first clip.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Existing history cards */}
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

            {/* In-flight generation slots (pending skeleton or error) */}
            {generationSlots.map((slot, slotIdx) => {
              const versionLabel = `v${shot.video.history.length + slotIdx + 1}`;
              if (slot.status === "pending") {
                return (
                  <div
                    key={slot.slotId}
                    className="relative rounded-lg border border-border overflow-hidden animate-pulse"
                    data-testid={`video-generation-skeleton-${slotIdx}`}
                    aria-label={`Generating video ${versionLabel}`}
                  >
                    {/* Skeleton thumbnail area */}
                    <div className="relative aspect-video bg-muted flex items-center justify-center">
                      <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                      {/* Version label */}
                      <div className="absolute top-1.5 right-1.5 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                        {versionLabel}
                      </div>
                    </div>
                    {/* Skeleton footer */}
                    <div className="px-2 py-1.5 bg-background space-y-1.5">
                      <div className="h-3 w-20 rounded bg-muted" />
                      <div className="flex gap-1">
                        <div className="h-5 w-14 rounded bg-muted" />
                        <div className="h-5 w-7 rounded bg-muted" />
                        <div className="h-5 w-7 rounded bg-muted" />
                        <div className="h-5 w-7 rounded bg-muted" />
                      </div>
                    </div>
                  </div>
                );
              }
              // Error slot
              return (
                <div
                  key={slot.slotId}
                  className="relative rounded-lg border border-destructive/50 overflow-hidden"
                  data-testid={`video-generation-error-${slotIdx}`}
                >
                  {/* Error thumbnail area */}
                  <div className="relative aspect-video bg-destructive/10 flex flex-col items-center justify-center gap-2 p-3">
                    <div className="absolute top-1.5 right-1.5 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                      {versionLabel}
                    </div>
                    <p className="text-xs text-destructive text-center line-clamp-3">
                      {slot.errorMessage}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleRetrySlot(slot.slotId, slot.prompt)}
                      className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-destructive/50 bg-background text-destructive hover:bg-destructive/10 transition-colors"
                      data-testid={`video-retry-btn-${slotIdx}`}
                      aria-label={`Retry generation for ${versionLabel}`}
                    >
                      Retry
                    </button>
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
  const { id, shotId } = useParams<{ id: string; shotId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshBalance } = usePoeBalanceContext();

  /**
   * React Router state passed by the Pinned Videos page (and potentially other
   * pages) to pre-activate Shot mode at a specific shot index.
   * Shape: { targetShotIndex?: number }
   */
  const locationState = location.state as { targetShotIndex?: number } | null;

  // Detect which sub-route we are on from the pathname.
  // - /video/scripts/:id            → write mode (index)
  // - /video/scripts/:id/templates  → tmpl mode
  // - /video/scripts/:id/:shotId    → shot mode (shotId is defined)
  const isTemplatesRoute = location.pathname.endsWith("/templates");
  const isShotRoute = Boolean(shotId);

  // ─── Script state ──────────────────────────────────────────────────────────
  const [script, setScript] = useState<Script | null>(null);
  const [notFound, setNotFound] = useState(false);

  // ─── Editor state ──────────────────────────────────────────────────────────
  // Mode is derived directly from the URL so it stays reactive to navigation.
  // All mode changes are performed by navigating to the correct sub-route, so
  // no local setState for mode is needed.
  const mode: EditorMode = (() => {
    if (isShotRoute) return "shot";
    if (isTemplatesRoute) return "tmpl";
    if (typeof locationState?.targetShotIndex === "number") return "shot";
    return "write";
  })();
  const [activeShotIndex, setActiveShotIndex] = useState<number>(() =>
    typeof locationState?.targetShotIndex === "number"
      ? locationState.targetShotIndex
      : 0
  );
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

    // When on the /:id/:shotId route, resolve the shot index from the shotId.
    // If the shotId is not found, redirect back to /:id.
    if (isShotRoute && shotId) {
      const idx = found.shots.findIndex((s) => s.id === shotId);
      if (idx === -1) {
        navigate(`/video/scripts/${id}`, { replace: true });
        return;
      }
      setActiveShotIndex(idx);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, shotId]);

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
  // Navigates to the /templates sub-route (URL-based routing for US-067).
  useEffect(() => {
    function handleSwitchToTemplates() {
      if (isMounted.current && id) {
        navigate(`/video/scripts/${id}/templates`);
      }
    }
    document.addEventListener("switch-to-templates", handleSwitchToTemplates);
    return () =>
      document.removeEventListener(
        "switch-to-templates",
        handleSwitchToTemplates
      );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ─── Add a new blank shot ─────────────────────────────────────────────────
  const handleAddShot = useCallback(() => {
    if (!script) return;
    const newShot: Shot = {
      id: generateId(),
      title: `Shot ${script.shots.length + 1}`,
      prompt: "",
      narration: {
        enabled: script.settings.narrationEnabled,
        text: "",
        audioSource: script.settings.defaultAudio,
      },
      video: {
        selectedUrl: null,
        history: [],
      },
      subtitles: script.settings.subtitles,
      duration: VIDEO_DURATIONS[0],
    };
    const newIndex = script.shots.length;
    const updatedShots = [...script.shots, newShot];
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
    });
    if (updated && isMounted.current) {
      setScript(updated);
      log({
        category: "user:action",
        action: "video:shot:add",
        data: { scriptId: script.id, newShotId: newShot.id, newIndex },
      });
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
      const deletedIndex = script.shots.findIndex((s) => s.id === shotId);
      const updatedShots = script.shots.filter((s) => s.id !== shotId);
      const updated = videoStorageService.updateScript(script.id, {
        shots: updatedShots,
      });
      if (updated && isMounted.current) {
        setScript(updated);
        log({
          category: "user:action",
          action: "video:shot:delete",
          data: { scriptId: script.id, shotId, index: deletedIndex },
        });
        // Adjust active shot index if needed
        if (mode === "shot") {
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
  // Navigates to /video/scripts/:id/:shotId (URL-based routing for US-067).
  const handleSwitchToShotMode = useCallback(
    (shotIndex: number) => {
      if (!script) return;
      const shot = script.shots[shotIndex];
      if (!shot) return;
      log({
        category: "user:action",
        action: "video:mode:change",
        data: { scriptId: script.id, from: mode, to: "shot" },
      });
      navigate(`/video/scripts/${script.id}/${shot.id}`);
    },
    [script, mode, navigate]
  );

  // ─── Navigate within Shot mode ────────────────────────────────────────────
  // When on the /:id/:shotId route, push a new route for the next/prev shot.
  // When in in-page shot mode (legacy state from location.state), update state.
  const handleShotNavigate = useCallback(
    (newIndex: number) => {
      if (!script) return;
      if (newIndex < 0 || newIndex >= script.shots.length) return;
      const fromIndex = activeShotIndex;
      log({
        category: "user:action",
        action: "video:shot:navigate",
        data: { scriptId: script.id, fromIndex, toIndex: newIndex },
      });
      if (isShotRoute) {
        // URL-based: navigate to the next shot's route
        const nextShot = script.shots[newIndex];
        if (nextShot) {
          navigate(`/video/scripts/${script.id}/${nextShot.id}`);
        }
      } else if (isMounted.current) {
        setActiveShotIndex(newIndex);
      }
    },
    [script, activeShotIndex, isShotRoute, navigate]
  );

  // ─── Mode change ──────────────────────────────────────────────────────────
  const handleModeChange = useCallback(
    (newMode: EditorMode) => {
      if (!script) return;
      if (isMounted.current) {
        if (newMode !== mode) {
          log({
            category: "user:action",
            action: "video:mode:change",
            data: { scriptId: script.id, from: mode, to: newMode },
          });
        }
        if (newMode === "shot") {
          // Navigate to shot URL instead of toggling state
          const clampedIndex = Math.min(
            activeShotIndex,
            Math.max(0, script.shots.length - 1)
          );
          const shot = script.shots[clampedIndex];
          if (shot) {
            navigate(`/video/scripts/${script.id}/${shot.id}`);
          }
        } else if (newMode === "tmpl") {
          navigate(`/video/scripts/${script.id}/templates`);
        } else {
          // write mode — navigate back to script index
          navigate(`/video/scripts/${script.id}`);
        }
      }
    },
    [script, mode, activeShotIndex, navigate]
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

      const shotId = active.id as string;
      const reorderedShots = arrayMove(script.shots, oldIndex, newIndex);
      const updated = videoStorageService.updateScript(script.id, {
        shots: reorderedShots,
      });
      if (updated && isMounted.current) {
        setScript(updated);
        log({
          category: "user:action",
          action: "video:shot:reorder",
          data: { scriptId: script.id, shotId, fromIndex: oldIndex, toIndex: newIndex },
        });
      }
    },
    [script]
  );

  // ─── Subtitles toggle (global — mixed-state logic) ────────────────────────
  // off → set all on; on → set all off; mixed → set all on
  const handleSubtitlesToggle = useCallback(() => {
    if (!script) return;
    const state = computeSubtitlesState(script.shots);
    const newEnabled = state !== "on";
    const updatedShots = script.shots.map((s) => ({
      ...s,
      subtitles: newEnabled,
    }));
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
      settings: { ...script.settings, subtitles: newEnabled },
    });
    if (updated && isMounted.current) {
      log({
        category: "user:action",
        action: "video:script:subtitles:global",
        data: { scriptId: script.id, newEnabled },
      });
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
        subtitles: shot.subtitles,
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
    log({
      category: "user:action",
      action: "video:script:export",
      data: { scriptId: script.id, shotCount: script.shots.length },
    });
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

  // Subtitles mixed-state for global toggle
  const subtitlesState = computeSubtitlesState(script.shots);
  const subtitlesLabel =
    subtitlesState === "mixed"
      ? "Subtitles (mixed)"
      : subtitlesState === "on"
      ? "Subtitles on"
      : "Subtitles off";

  // Panel header label
  const headerLabel =
    mode === "shot" && shotCount > 0
      ? `Shot ${safeActiveShotIndex + 1} of ${shotCount}`
      : mode === "tmpl"
      ? "Script Templates"
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
              <TemplatesModeView
                script={script}
                onUpdate={handleShotUpdate}
              />
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
          {/* Subtitles toggle — global MixedToggle */}
          <div className="flex items-center gap-1.5">
            <MixedToggle
              state={subtitlesState}
              onClick={handleSubtitlesToggle}
              data-testid="subtitles-toggle"
              aria-label={subtitlesLabel}
            />
            <span className="text-xs font-medium text-muted-foreground">
              Subtitles
            </span>
          </div>

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
                Final preview requires exporting the YAML and running the Python generation script
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
