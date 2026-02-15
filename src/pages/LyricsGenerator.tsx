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
import { useNavigate, useParams } from "react-router-dom";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiKeyMissingModal } from "@/components/ApiKeyMissingModal";
import { LyricsItemCard } from "@/components/LyricsItemCard";
import { Toast, useToast } from "@/components/Toast";
import { useApiKeyGuard } from "@/hooks/useApiKeyGuard";
import {
  createMessage,
  getMessage,
  getAncestors,
  getLatestLeaf,
  getSettings,
  updateMessage,
} from "@/lib/storage/storageService";
import type { Message } from "@/lib/storage/types";
import { createLLMClient } from "@/lib/llm/factory";
import type { ChatMessage as LLMChatMessage } from "@/lib/llm/types";
import { log } from "@/lib/actionLog";

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
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
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
  const { isModalOpen, guardAction, closeModal } = useApiKeyGuard();
  const isMobile = useIsMobile();

  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Refresh counter: incrementing it causes message to be re-read from storage.
  const [refreshCount, setRefreshCount] = useState(0);
  const [errorToast, showErrorToast] = useToast(5000);
  // Mobile tab state: "lyrics" | "chat"
  const [activeTab, setActiveTab] = useState<"lyrics" | "chat">("lyrics");
  const chatEndRef = useRef<HTMLDivElement>(null);

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
    if (id) {
      const leaf = getLatestLeaf(id);
      setLatestLeafId(leaf && leaf.id !== id ? leaf.id : null);
    } else {
      setLatestLeafId(null);
    }
  }, [id, refreshCount]);

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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = userInput.trim();
      if (!trimmed || isLoading) return;
      if (!guardAction()) return;

      setIsLoading(true);

      // Determine the parentId for the new user message.
      // If there is a current message, the user message is a child of it.
      // If this is /lyrics/new, start a new root message.
      const parentId = id && currentMessage ? id : null;

      // Create the user message first.
      const userMsg = createMessage({
        role: "user",
        content: trimmed,
        parentId,
      });

      log({
        category: "user:action",
        action: "chat:submit",
        data: { messageId: userMsg.id, parentId },
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
          { role: "user" as const, content: trimmed },
        ];

        const settings = getSettings();
        const client = createLLMClient(settings?.poeApiKey ?? undefined);

        log({
          category: "llm:request",
          action: "llm:chat:start",
          data: { userMessageId: userMsg.id, historyLength: history.length },
        });

        const responseText = await client.chat(history);

        const parsed = parseLyricsResponse(responseText);
        const assistantMsg = createMessage({
          role: "assistant",
          content: responseText,
          parentId: userMsg.id,
          ...(parsed ?? {}),
        });

        log({
          category: "llm:response",
          action: "llm:chat:complete",
          data: {
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
            parsed: parsed !== null,
          },
        });

        // Navigate to the new assistant message.
        navigate(`/lyrics/${assistantMsg.id}`, { replace: !id });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log({
          category: "llm:response",
          action: "llm:chat:error",
          data: {
            userMessageId: userMsg.id,
            error: errMsg,
          },
        });
        showErrorToast({
          message: `Generation failed: ${errMsg}. Please try again.`,
          variant: "error",
        });
        // On error, still navigate to the user message so the state is saved.
        navigate(`/lyrics/${userMsg.id}`, { replace: !id });
      } finally {
        setIsLoading(false);
        if (id) setRefreshCount((c) => c + 1);
      }
    },
    [userInput, id, currentMessage, ancestorPath, isLoading, guardAction, navigate, showErrorToast]
  );

  function handleGenerateSongs() {
    if (!id) return;
    log({
      category: "user:action",
      action: "song:generate:navigate",
      data: { messageId: id },
    });
    navigate(`/lyrics/${id}/songs`);
  }

  /** Left panel: frontmatter + lyrics body (all fields inline-editable). */
  const LyricsPanel = (
    <section
      className="flex flex-col overflow-auto p-6 flex-1 min-h-0"
      aria-label="Lyrics"
      data-testid="lyrics-panel"
    >
      <h2 className="text-lg font-semibold mb-4">Lyrics</h2>
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
      className="flex gap-2 items-end"
      data-testid="chat-form"
    >
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
      <Button type="submit" disabled={isLoading} data-testid="chat-submit">
        {isLoading ? "Sending…" : "Send"}
      </Button>
    </form>
  );

  /** Right panel: chat history + input. */
  const ChatPanel = (
    <section
      className="flex flex-col overflow-hidden p-6 flex-1 min-h-0"
      aria-label="Chat"
      data-testid="chat-panel"
    >
      <h2 className="text-lg font-semibold mb-4">Chat</h2>
      {ChatHistory}
      {ChatForm}
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
            className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            onClick={() => navigate(`/lyrics/${latestLeafId}`)}
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
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === "lyrics"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("lyrics")}
              data-testid="tab-lyrics"
            >
              Lyrics
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "chat"}
              aria-controls="chat-tab-panel"
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === "chat"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("chat")}
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
                <h2 className="text-lg font-semibold mb-4">Chat</h2>
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
      <div className="border-t p-4 flex justify-end shrink-0">
        <Button
          onClick={handleGenerateSongs}
          disabled={!id}
          data-testid="generate-songs-btn"
        >
          Generate Songs
        </Button>
      </div>

      {isModalOpen && <ApiKeyMissingModal onClose={closeModal} />}
      <Toast toast={errorToast} onDismiss={() => showErrorToast(null)} />
    </div>
  );
}
