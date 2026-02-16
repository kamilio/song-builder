/**
 * Lightweight event bus for localStorage quota exceeded errors.
 *
 * Storage services call `emitQuotaExceeded()` when a write fails with
 * QuotaExceededError.  UI components subscribe via `onQuotaExceeded` /
 * `offQuotaExceeded` (or the `useStorageQuotaToast` hook) to show feedback.
 *
 * Why a module-level emitter instead of React context?
 * Storage functions are plain TS (not React), so they cannot use hooks.
 * A simple callback set avoids a dependency on React in the storage layer.
 */

type QuotaExceededListener = () => void;

const listeners = new Set<QuotaExceededListener>();

export function emitQuotaExceeded(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Never let a subscriber crash the emitter.
    }
  }
}

export function onQuotaExceeded(listener: QuotaExceededListener): void {
  listeners.add(listener);
}

export function offQuotaExceeded(listener: QuotaExceededListener): void {
  listeners.delete(listener);
}
