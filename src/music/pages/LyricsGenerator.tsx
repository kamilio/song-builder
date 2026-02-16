/**
 * LyricsGenerator page (US-004 / US-005 / US-007 / US-009 / US-010).
 *
 * Route: /lyrics/:messageId
 *
 * On load: getAncestors(messageId) → render path top-down in the chat panel.
 * The left panel shows the latest assistant message's lyrics fields.
 * Submitting a message: createMessage (user, parentId = current messageId),
 * call llmClient.chat() with the ancestor path as history, createMessage
 * (assistant), navigate to /lyrics/:newAssistantId.
 *
 * US-005: Inline-editable fields in the left panel.
 * Each field (title, style, commentary, duration, lyricsBody) can be clicked
 * to activate an inline editor. Saves on blur or Enter (Shift+Enter for
 * multiline fields). Pencil icon visible on hover.
 *
 * US-007: Checkpoint navigation with "Viewing earlier version" banner.
 * When the current message has descendants, a banner is shown:
 *   "Viewing an earlier version · Return to latest"
 * "Return to latest" navigates to the most recent leaf via getLatestLeaf().
 * Sending from a checkpoint creates a new branch (parentId = checkpoint id).
 *
 * Layout:
 *   Desktop (≥ 768px): side-by-side split panels (lyrics left, chat right).
 *   Mobile (< 768px):  tab bar "Lyrics" | "Chat" replaces the side-by-side
 *                       panels; the chat input is fixed at the bottom when
 *                       the Chat tab is active.
 *
 * For `/lyrics/new` the page has no message yet; empty-state messages are shown.
 * For `/lyrics/:id` the message is read from localStorage.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Music, Pencil, Plus, Zap } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { ApiKeyMissingModal } from "@/shared/components/ApiKeyMissingModal";
import { LyricsItemCard } from "@/music/components/LyricsItemCard";
import { Toast, useToast } from "@/shared/components/Toast";
import { useApiKeyGuard } from "@/shared/hooks/useApiKeyGuard";
import { FileDropzone } from "@/shared/components/FileDropzone";
import {
  createMessage,
  getMessage,
  getAncestors,
  getLatestLeaf,
  getSettings,
  getSongsByMessage,
  updateMessage,
} from "@/music/lib/storage/storageService";
import type { Message } from "@/music/lib/storage/types";
import { createLLMClient } from "@/shared/lib/llm/factory";
import type { ChatMessage as LLMChatMessage } from "@/shared/lib/llm/types";
import { log } from "@/music/lib/actionLog";
import { usePoeBalanceContext } from "@/shared/context/PoeBalanceContext";

const LYRICS_SYSTEM_PROMPT = `You are a professional songwriter and lyricist. \
Help the user write and refine song lyrics.

When producing lyrics always respond in this exact format:

---
title: "Song Title"
style: "genre / mood / instrumentation"
commentary: "Brief note about the creative choices"
---
<lyrics body here>

Rules:
- No emoji of any kind
- The YAML frontmatter block is mandatory in every reply
- Keep language poetic and evocative`;

/**
 * Parse the frontmatter + body from an LLM response string.
 *
 * Expected format:
 *   ---
 *   title: "..."
 *   style: "..."
 *   commentary: "..."
 *   ---
 *   <lyrics body>
 *
 * Returns parsed fields if the header block is present; otherwise returns null
 * so the caller can fall back to leaving the entry unchanged.
 */
function parseLyricsResponse(text: string): {
  title: string;
  style: string;
  commentary: string;
  lyricsBody: string;
} | null {
  const match = text.match(/(?:^|\n)---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = match[1];
  const lyricsBody = match[2].trim();

  function extractField(name: string): string {
    const re = new RegExp(`^${name}:\\s*"?([^"\\n]+)"?`, "m");
    const m = frontmatter.match(re);
    return m ? m[1].trim() : "";
  }

  return {
    title: extractField("title"),
    style: extractField("style"),
    commentary: extractField("commentary"),
    lyricsBody,
  };
}

/** Format a duration in seconds as M:SS (e.g. 185 → "3:05"). */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * InlineField: displays a value with a pencil-icon-on-hover affordance.
 * Clicking activates an inline editor. Saves on blur or Enter (for single-line),
 * or blur only (for textarea). Calls onSave with the new string value.
 *
 * Props:
 *   value        — current display value (string)
 *   onSave       — called with the trimmed new value when saving
 *   renderDisplay — render the read-only display node
 *   multiline    — if true, renders a <textarea>; otherwise an <input>
 *   inputType    — HTML input type, defaults to "text"
 *   testId       — data-testid prefix; display gets "{testId}", input gets "{testId}-input"
 *   placeholder  — placeholder text for the editor
 *   ariaLabel    — accessible label for the editor
 */
interface InlineFieldProps {
  value: string;
  onSave: (newValue: string) => void;
  renderDisplay: () => React.ReactNode;
  multiline?: boolean;
  inputType?: string;
  testId: string;
  placeholder?: string;
  ariaLabel: string;
}

function InlineField({
  value,
  onSave,
  renderDisplay,
  multiline = false,
  inputType = "text",
  testId,
  placeholder,
  ariaLabel,
}: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  // draft is only used while editing; always initialized from `value` on startEdit.
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function startEdit() {
    setDraft(value);
    setEditing(true);
  }

  function commitSave() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed !== value) {
      onSave(trimmed);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commitSave();
    }
    if (e.key === "Escape") {
      setEditing(false);
      setDraft(value);
    }
  }

  // Focus the input when entering edit mode.
  useEffect(() => {
    if (editing) {
      const el = multiline ? textareaRef.current : inputRef.current;
      if (el) {
        el.focus();
        // setSelectionRange is not supported on number inputs; guard accordingly.
        try {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        } catch {
          // noop — input type doesn't support selection (e.g. type="number")
        }
      }
    }
  }, [editing, multiline]);

  const sharedEditProps = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: commitSave,
    onKeyDown: handleKeyDown,
    placeholder,
    "aria-label": ariaLabel,
    "data-testid": `${testId}-input`,
    className:
      "w-full bg-background border border-ring rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
  };

  if (editing) {
    return multiline ? (
      <textarea
        ref={textareaRef}
        {...(sharedEditProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        rows={4}
        className={`${sharedEditProps.className} resize-none`}
      />
    ) : (
      <input
        ref={inputRef}
        {...(sharedEditProps as React.InputHTMLAttributes<HTMLInputElement>)}
        type={inputType}
      />
    );
  }

  return (
    <span
      className="group relative inline-flex items-center gap-1 cursor-pointer rounded hover:bg-muted/60 px-1 -mx-1 transition-colors"
      onClick={startEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startEdit();
        }
      }}
      aria-label={`Edit ${ariaLabel}`}
      data-testid={`${testId}-editable`}
    >
      {renderDisplay()}
      <Pencil
        className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
        size={12}
        aria-hidden="true"
        data-testid={`${testId}-pencil`}
      />
    </span>
  );
}

/**
 * Returns true when window.innerWidth < 768px.
 * Re-evaluates on every resize so the layout switches live.
 */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export default function LyricsGenerator() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isModalOpen, guardAction, closeModal, proceedWithPendingAction } = useApiKeyGuard();
  const { refreshBalance } = usePoeBalanceContext();
  const isMobile = useIsMobile();

  const [userInput, setUserInput] = useState("");
  // US-029: File attachment for the chat input.
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Refresh counter: incrementing it causes message to be re-read from storage.
  const [refreshCount, setRefreshCount] = useState(0);
  const [errorToast, showErrorToast] = useToast(5000);
  // Mobile tab state: "lyrics" | "chat"
  const [activeTab, setActiveTab] = useState<"lyrics" | "chat">("lyrics");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Count of non-deleted songs for the current lyric (message id).
  const [songsCount, setSongsCount] = useState<number>(
    () => (id ? getSongsByMessage(id).filter((s) => !s.deleted).length : 0)
  );

  // Current assistant message (the one whose lyrics are shown in the left panel).
  const [currentMessage, setCurrentMessage] = useState<Message | null>(
    () => (id ? getMessage(id) : null)
  );

  // Full ancestor path for chat display.
  const [ancestorPath, setAncestorPath] = useState<Message[]>(
    () => (id ? getAncestors(id) : [])
  );

  // Latest leaf descendant of the current message (null if current is already the leaf).
  // When latestLeafId !== id, the "Viewing earlier version" banner is shown.
  const [latestLeafId, setLatestLeafId] = useState<string | null>(() => {
    if (!id) return null;
    const leaf = getLatestLeaf(id);
    return leaf && leaf.id !== id ? leaf.id : null;
  });

  useEffect(() => {
    const msg = id ? getMessage(id) : null;
    setCurrentMessage(msg);
    setAncestorPath(id ? getAncestors(id) : []);
    setSongsCount(id ? getSongsByMessage(id).filter((s) => !s.deleted).length : 0);
    if (id) {
      const leaf = getLatestLeaf(id);
      setLatestLeafId(leaf && leaf.id !== id ? leaf.id : null);
    } else {
      setLatestLeafId(null);
    }
  }, [id, refreshCount]);

  // Auto-send: when navigated here from Home with an initial user message that
  // has no assistant reply yet, fire the LLM automatically so the user doesn't
  // have to re-submit manually.
  const hasAutoSentRef = useRef(false);
  useEffect(() => {
    if (hasAutoSentRef.current || !id) return;

    const msg = getMessage(id);
    if (!msg || msg.role !== "user") return;

    // Only auto-send if this message has no descendants yet (no reply).
    const leaf = getLatestLeaf(id);
    if (leaf && leaf.id !== id) return;

    hasAutoSentRef.current = true;
    setIsLoading(true);

    const ancestors = getAncestors(id);

    const doAutoSend = async () => {
      setIsLoading(true);
      try {
        const history: LLMChatMessage[] = [
          { role: "system" as const, content: LYRICS_SYSTEM_PROMPT },
          ...ancestors.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];
        const settings = getSettings();
        const client = createLLMClient(settings?.poeApiKey ?? undefined);
        const responseText = await client.chat(history, settings?.chatModel);
        refreshBalance(settings?.poeApiKey);
        const parsed = parseLyricsResponse(responseText);
        const assistantMsg = createMessage({
          role: "assistant",
          content: responseText,
          parentId: id,
          ...(parsed ?? {}),
        });
        navigate(`/music/lyrics/${assistantMsg.id}`, { replace: true });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        showErrorToast({
          message: `Generation failed: ${errMsg}. Please try again.`,
          variant: "error",
        });
      } finally {
        setIsLoading(false);
      }
    };

    const hasKey = guardAction(() => void doAutoSend());
    if (!hasKey) {
      // No key: modal will show; clear the spinner that was set above
      setIsLoading(false);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll chat to bottom when ancestor path grows.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ancestorPath.length]);

  // Find the latest assistant message in the path for the left panel.
  const latestAssistant = [...ancestorPath].reverse().find(
    (m) => m.role === "assistant"
  ) ?? null;

  /**
   * Save an inline-edited field back to storage and refresh the left panel.
   * fieldKey is one of the editable Message keys; newValue is always a string
   * from the input. Duration is converted back to an integer number of seconds.
   */
  const handleFieldSave = useCallback(
    (
      fieldKey: "title" | "style" | "commentary" | "lyricsBody" | "duration"
    ) =>
      (newValue: string) => {
        if (!latestAssistant) return;
        const updateData: Partial<
          Pick<
            Message,
            "title" | "style" | "commentary" | "lyricsBody" | "duration"
          >
        > = {};
        if (fieldKey === "duration") {
          const parsed = parseInt(newValue, 10);
          updateData.duration = Number.isFinite(parsed) ? parsed : 0;
        } else {
          updateData[fieldKey] = newValue;
        }
        updateMessage(latestAssistant.id, updateData);
        log({
          category: "user:action",
          action: "inline:edit",
          data: { messageId: latestAssistant.id, field: fieldKey },
        });
        setRefreshCount((c) => c + 1);
      },
    [latestAssistant]
  );

  const handleSubmitCore = useCallback(
    async (trimmed: string, fileAttachment: File | null) => {
      setIsLoading(true);
      // Clear the attached file immediately after submission.
      setAttachedFile(null);

      // Determine the parentId for the new user message.
      // If there is a current message, the user message is a child of it.
      // If this is /lyrics/new, start a new root message.
      const parentId = id && currentMessage ? id : null;

      // US-029: If a file is attached, append a note to the message content
      // so the LLM has context about the attachment.
      const content =
        fileAttachment
          ? `${trimmed}\n\n[Attached file: ${fileAttachment.name}]`
          : trimmed;

      // Create the user message first.
      const userMsg = createMessage({
        role: "user",
        content,
        parentId,
      });

      log({
        category: "user:action",
        action: "chat:submit",
        data: { messageId: userMsg.id, parentId, content: trimmed },
      });

      setUserInput("");

      try {
        // Build LLM history from ancestors + new user message.
        const history: LLMChatMessage[] = [
          { role: "system" as const, content: LYRICS_SYSTEM_PROMPT },
          ...ancestorPath.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user" as const, content },
        ];

        const settings = getSettings();
        const client = createLLMClient(settings?.poeApiKey ?? undefined);

        const responseText = await client.chat(history, settings?.chatModel);
        refreshBalance(settings?.poeApiKey);

        const parsed = parseLyricsResponse(responseText);
        const assistantMsg = createMessage({
          role: "assistant",
          content: responseText,
          parentId: userMsg.id,
          ...(parsed ?? {}),
        });

        // Navigate to the new assistant message.
        navigate(`/music/lyrics/${assistantMsg.id}`, { replace: !id });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        showErrorToast({
          message: `Generation failed: ${errMsg}. Please try again.`,
          variant: "error",
        });
        // On error, still navigate to the user message so the state is saved.
        navigate(`/music/lyrics/${userMsg.id}`, { replace: !id });
      } finally {
        setIsLoading(false);
        if (id) setRefreshCount((c) => c + 1);
      }
    },
    [id, currentMessage, ancestorPath, navigate, showErrorToast, refreshBalance]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = userInput.trim();
      if (!trimmed || isLoading) return;
      // Capture trimmed and attachedFile so the deferred action uses the same values.
      const fileSnapshot = attachedFile;
      guardAction(() => void handleSubmitCore(trimmed, fileSnapshot));
    },
    [userInput, isLoading, attachedFile, guardAction, handleSubmitCore]
  );

  function handleGenerateSongs() {
    if (!id) return;
    log({
      category: "user:action",
      action: "song:generate:navigate",
      data: { messageId: id },
    });
    navigate(`/music/lyrics/${id}/songs?generate=true`);
  }

  /** Left panel: frontmatter + lyrics body (all fields inline-editable). */
  const LyricsPanel = (
    <section
      className="flex flex-col overflow-auto p-6 flex-1 min-h-0"
      aria-label="Lyrics"
      data-testid="lyrics-panel"
    >
      <div className="mb-5 pb-4 border-b">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lyrics</h2>
        {latestAssistant?.title && (
          <p className="text-xl font-bold mt-1 leading-tight" data-testid="lyrics-panel-title">
            {latestAssistant.title}
          </p>
        )}
      </div>
      {latestAssistant ? (
        <>
          {/* Frontmatter block */}
          <div
            className="mb-4 rounded-md bg-muted p-4 font-mono text-sm"
            data-testid="lyrics-frontmatter"
          >
            <p>
              <span className="text-muted-foreground">title:</span>{" "}
              <InlineField
                value={latestAssistant.title ?? ""}
                onSave={handleFieldSave("title")}
                testId="lyrics-title"
                ariaLabel="title"
                placeholder="Song title"
                renderDisplay={() => (
                  <span data-testid="lyrics-title">
                    {latestAssistant.title}
                  </span>
                )}
              />
            </p>
            <p>
              <span className="text-muted-foreground">style:</span>{" "}
              <InlineField
                value={latestAssistant.style ?? ""}
                onSave={handleFieldSave("style")}
                testId="lyrics-style"
                ariaLabel="style"
                placeholder="Genre / mood / instrumentation"
                renderDisplay={() => (
                  <span data-testid="lyrics-style">
                    {latestAssistant.style}
                  </span>
                )}
              />
            </p>
            <p>
              <span className="text-muted-foreground">commentary:</span>{" "}
              <InlineField
                value={latestAssistant.commentary ?? ""}
                onSave={handleFieldSave("commentary")}
                testId="lyrics-commentary"
                ariaLabel="commentary"
                placeholder="Brief note about the creative choices"
                multiline
                renderDisplay={() => (
                  <span data-testid="lyrics-commentary">
                    {latestAssistant.commentary}
                  </span>
                )}
              />
            </p>
            <p>
              <span className="text-muted-foreground">duration:</span>{" "}
              <InlineField
                value={
                  latestAssistant.duration !== undefined
                    ? String(latestAssistant.duration)
                    : ""
                }
                onSave={handleFieldSave("duration")}
                testId="lyrics-duration"
                ariaLabel="duration in seconds"
                placeholder="seconds"
                inputType="number"
                renderDisplay={() => (
                  <span data-testid="lyrics-duration">
                    {latestAssistant.duration !== undefined
                      ? formatDuration(latestAssistant.duration)
                      : "—"}
                  </span>
                )}
              />
            </p>
          </div>
          {/* Lyrics body — inline-editable textarea */}
          <InlineField
            value={latestAssistant.lyricsBody ?? ""}
            onSave={handleFieldSave("lyricsBody")}
            testId="lyrics-body"
            ariaLabel="lyrics body"
            placeholder="Lyrics…"
            multiline
            renderDisplay={() => (
              <pre
                className="font-mono text-sm whitespace-pre-wrap flex-1"
                data-testid="lyrics-body"
              >
                {latestAssistant.lyricsBody}
              </pre>
            )}
          />
        </>
      ) : (
        <p className="text-muted-foreground text-sm" data-testid="lyrics-empty">
          {id
            ? "Message not found."
            : "Select or create a lyrics entry to get started."}
        </p>
      )}
    </section>
  );

  /** Chat history list. */
  const ChatHistory = (
    <div
      className="flex-1 overflow-y-auto space-y-3 mb-4"
      data-testid="chat-history"
      aria-live="polite"
    >
      {ancestorPath.length === 0 ? (
        <p className="text-muted-foreground text-sm" data-testid="chat-empty">
          No messages yet. Ask Claude to write or refine your lyrics.
        </p>
      ) : (
        ancestorPath.map((msg) =>
          msg.role === "user" ? (
            <div
              key={msg.id}
              className="rounded-md px-3 py-2 text-sm max-w-[85%] ml-auto bg-primary text-primary-foreground"
              data-testid="chat-message-user"
            >
              {msg.content}
            </div>
          ) : (
            <div
              key={msg.id}
              className="max-w-[92%]"
              data-testid="chat-message-assistant"
            >
              <LyricsItemCard message={msg} />
            </div>
          )
        )
      )}
      {isLoading && (
        <div
          className="max-w-[92%] rounded-md border p-3 animate-pulse"
          data-testid="chat-loading"
          aria-label="Claude is thinking…"
          role="status"
        >
          {/* Skeleton mimicking the shape of a LyricsItemCard */}
          <div className="h-4 w-2/3 rounded bg-muted mb-2" />
          <div className="h-3 w-1/3 rounded bg-muted mb-2" />
          <div className="h-3 w-full rounded bg-muted mb-1" />
          <div className="h-3 w-full rounded bg-muted mb-1" />
          <div className="h-3 w-3/4 rounded bg-muted" />
        </div>
      )}
      <div ref={chatEndRef} />
    </div>
  );

  /** Chat input form. */
  const ChatForm = (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-1.5"
      data-testid="chat-form"
    >
      <div className="flex gap-2 items-end">
        <textarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          placeholder="Type a message… (Shift+Enter for newline)"
          aria-label="Chat message"
          disabled={isLoading}
          rows={3}
          className="flex-1 border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none"
          data-testid="chat-input"
        />
        <Button type="submit" disabled={isLoading} data-testid="chat-submit" className="min-h-[44px]">
          {isLoading ? "Sending…" : "Send"}
        </Button>
      </div>
      {/* US-029: File attachment dropzone rendered inline below the textarea */}
      <FileDropzone
        file={attachedFile}
        onFileChange={setAttachedFile}
        label="Attach file"
        testId="chat-file-dropzone"
        disabled={isLoading}
      />
    </form>
  );

  /** Right panel: chat history + input. */
  const ChatPanel = (
    <section
      className="flex flex-col overflow-hidden p-6 flex-1 min-h-0"
      aria-label="Chat"
      data-testid="chat-panel"
    >
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-5 pb-4 border-b">Chat</h2>
      {ChatHistory}
      <div className="sticky bottom-0 bg-background pt-2 shrink-0">
        {ChatForm}
      </div>
    </section>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── US-007: "Viewing earlier version" banner ─────────────────────── */}
      {latestLeafId && (
        <div
          className="flex items-center justify-center gap-2 bg-secondary/60 border-b border-border px-4 py-1.5 text-xs text-muted-foreground shrink-0"
          data-testid="checkpoint-banner"
          role="status"
          aria-live="polite"
        >
          <span>Viewing an earlier version</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded min-h-[44px] inline-flex items-center px-1"
            onClick={() => {
              log({ category: "user:action", action: "lyrics:return-to-latest", data: { from: id, to: latestLeafId } });
              navigate(`/music/lyrics/${latestLeafId}`);
            }}
            data-testid="return-to-latest-btn"
          >
            Return to latest
          </button>
        </div>
      )}

      {isMobile ? (
        <>
          {/* ── Mobile: tab bar + active tab panel ─────────────────────── */}
          <div
            className="flex border-b shrink-0"
            data-testid="mobile-tab-bar"
            role="tablist"
            aria-label="Editor panels"
          >
            <button
              role="tab"
              aria-selected={activeTab === "lyrics"}
              aria-controls="lyrics-tab-panel"
              className={`flex-1 py-3 min-h-[44px] text-sm font-medium transition-colors ${
                activeTab === "lyrics"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => { log({ category: "user:action", action: "lyrics:tab", data: { tab: "lyrics" } }); setActiveTab("lyrics"); }}
              data-testid="tab-lyrics"
            >
              Lyrics
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "chat"}
              aria-controls="chat-tab-panel"
              className={`flex-1 py-3 min-h-[44px] text-sm font-medium transition-colors ${
                activeTab === "chat"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => { log({ category: "user:action", action: "lyrics:tab", data: { tab: "chat" } }); setActiveTab("chat"); }}
              data-testid="tab-chat"
            >
              Chat
            </button>
          </div>

          {/* Active tab content */}
          <div
            id={activeTab === "lyrics" ? "lyrics-tab-panel" : "chat-tab-panel"}
            role="tabpanel"
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            {activeTab === "lyrics" ? (
              LyricsPanel
            ) : (
              <section
                className="flex flex-col overflow-hidden p-4 pb-0 flex-1 min-h-0"
                aria-label="Chat"
                data-testid="chat-panel"
              >
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 pb-3 border-b">Chat</h2>
                {ChatHistory}
                {/* Chat input pinned to bottom of viewport on mobile */}
                <div className="sticky bottom-0 bg-background pt-2 pb-4 shrink-0">
                  {ChatForm}
                </div>
              </section>
            )}
          </div>
        </>
      ) : (
        /* ── Desktop: side-by-side split panels ─────────────────────────── */
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left panel */}
          <div className="w-1/2 border-r flex flex-col overflow-hidden">
            {LyricsPanel}
          </div>
          {/* Right panel */}
          <div className="w-1/2 flex flex-col overflow-hidden">
            {ChatPanel}
          </div>
        </div>
      )}

      {/* ── Bottom bar ───────────────────────────────────────────────────── */}
      <div className="border-t bg-muted/30 px-4 py-3 flex justify-between items-center shrink-0">
        <Button
          variant="outline"
          onClick={() => { log({ category: "user:action", action: "lyrics:new", data: {} }); navigate("/music"); }}
          data-testid="new-lyrics-btn"
          className="min-h-[44px] gap-2"
        >
          <Plus size={14} aria-hidden="true" />
          New Lyrics
        </Button>
        {id && songsCount > 0 && (
          <Link
            to={`/music/lyrics/${id}/songs`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="songs-count-link"
            onClick={() => log({ category: "user:action", action: "lyrics:songs-count-link", data: { messageId: id, count: songsCount } })}
          >
            <Music size={14} aria-hidden="true" />
            {songsCount} {songsCount === 1 ? "song" : "songs"}
          </Link>
        )}
        <Button
          onClick={handleGenerateSongs}
          disabled={!id}
          data-testid="generate-songs-btn"
          className="min-h-[44px] gap-2"
        >
          <Zap size={14} aria-hidden="true" />
          Generate Songs
        </Button>
      </div>

      {isModalOpen && <ApiKeyMissingModal onClose={closeModal} onProceed={proceedWithPendingAction} />}
      <Toast toast={errorToast} onDismiss={() => showErrorToast(null)} />
    </div>
  );
}
