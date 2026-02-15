/**
 * Session-scoped in-memory action log (US-011).
 *
 * Singleton module that accumulates log entries for the lifetime of the browser
 * session. The log is bounded to MAX_ENTRIES (500) — oldest entries are dropped
 * when the cap is reached so memory is predictable.
 *
 * Log categories:
 *   navigation   — route changes
 *   user:action  — explicit user gestures (chat submit, pin, delete, download, inline edit, generate)
 *   llm:request  — LLM call started (chat or generateSong)
 *   llm:response — LLM call completed or errored
 *   storage      — storage mutations (future use)
 *   error        — caught errors
 *
 * Usage:
 *   import { log, getAll } from "@/music/lib/actionLog";
 *   log({ category: "navigation", action: "navigate", data: { path: "/lyrics" } });
 *   const entries = getAll();
 */

export type LogCategory =
  | "navigation"
  | "user:action"
  | "llm:request"
  | "llm:response"
  | "storage"
  | "error";

export interface LogEntry {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Category bucket for filtering */
  category: LogCategory;
  /** Short action label (e.g. "navigate", "chat:submit", "llm:chat:start") */
  action: string;
  /** Arbitrary structured data relevant to the entry */
  data?: Record<string, unknown>;
}

const MAX_ENTRIES = 500;

/** In-memory log store — module-scoped singleton */
const _entries: LogEntry[] = [];

/**
 * Append a new entry to the log.
 * If the log has reached MAX_ENTRIES, the oldest entry is dropped first.
 */
export function log(
  entry: Omit<LogEntry, "timestamp"> & { timestamp?: string }
): void {
  const full: LogEntry = {
    timestamp: entry.timestamp ?? new Date().toISOString(),
    category: entry.category,
    action: entry.action,
    ...(entry.data !== undefined ? { data: entry.data } : {}),
  };
  if (_entries.length >= MAX_ENTRIES) {
    _entries.shift();
  }
  _entries.push(full);
}

/**
 * Return a shallow copy of all log entries in insertion order (oldest first).
 */
export function getAll(): LogEntry[] {
  return _entries.slice();
}

/**
 * Clear all log entries (used in tests; not exposed to production UI).
 * @internal
 */
export function _clear(): void {
  _entries.length = 0;
}
