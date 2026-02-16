/**
 * Hook that manages the POE account balance display.
 *
 * US-024: Balance is fetched after every LLM request (text, lyrics, image).
 * The last known value is persisted to localStorage so it survives page
 * navigations. While a fetch is in-flight the stale value remains visible.
 * No spinner is ever shown for the balance.
 *
 * Balance is formatted compactly: 1234 → "1K", 7500 → "8K", 1_000_000 → "1M".
 *
 * Usage:
 *   const { balance, refreshBalance } = usePoeBalance();
 *   // After an LLM call completes, call:
 *   refreshBalance(apiKey);
 */

import { useCallback, useState } from "react";

const STORAGE_KEY = "song-builder:poe-balance";

/** Format a numeric balance into a compact string (e.g. 7234 → "7K"). */
export function formatBalance(value: number): string {
  if (value >= 1_000_000) {
    return `${Math.round(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}K`;
  }
  return String(value);
}

/** Read the persisted balance string from localStorage (or null if absent). */
function readStoredBalance(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persist the balance string to localStorage (best-effort; ignores errors). */
function writeStoredBalance(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Ignore quota errors — the in-memory state still reflects the latest value.
  }
}

interface UsePoeBalanceResult {
  /** Last known formatted balance (e.g. "7K"), or null if never fetched. */
  balance: string | null;
  /**
   * Trigger a non-blocking balance refresh.
   * Call this after every LLM request completes.
   * If apiKey is falsy, the call is a no-op.
   */
  refreshBalance: (apiKey: string | undefined | null) => void;
}

export function usePoeBalance(): UsePoeBalanceResult {
  const [balance, setBalance] = useState<string | null>(() => readStoredBalance());

  const refreshBalance = useCallback((apiKey: string | undefined | null) => {
    if (!apiKey) return;

    // Fire-and-forget: never await this in the caller.
    void (async () => {
      try {
        const res = await fetch("https://api.poe.com/usage/current_balance", {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as unknown;
        // Expected shape: { balance: number }
        if (
          json !== null &&
          typeof json === "object" &&
          "balance" in json &&
          typeof (json as Record<string, unknown>).balance === "number"
        ) {
          const formatted = formatBalance((json as { balance: number }).balance);
          setBalance(formatted);
          writeStoredBalance(formatted);
        }
      } catch {
        // Network errors are silently swallowed; the stale balance remains.
      }
    })();
  }, []);

  return { balance, refreshBalance };
}
