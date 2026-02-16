import { log, getAll } from "@/music/lib/actionLog";

/**
 * Shared hook that returns a handleReportBug async function.
 *
 * Behaviour: logs the report:bug action, collects all in-memory action log
 * entries, and copies them to the clipboard as JSON. The NavMenu component
 * then shows a success/failure toast based on whether the clipboard write
 * succeeds.
 *
 * Used by: App.tsx (TopBar), AllSessions, SessionView, Home (image), Home (music),
 * and PinnedImages so the copy-pasted implementation is defined exactly once.
 */
export function useReportBug() {
  async function handleReportBug() {
    log({
      category: "user:action",
      action: "report:bug",
      data: {},
    });
    const entries = getAll();
    await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
  }

  return { handleReportBug };
}
