import React, { useState, useRef } from "react";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { saveSettings, getSettings } from "@/music/lib/storage/storageService";

interface ApiKeyMissingModalProps {
  /** Called when the user dismisses the modal without providing a key. */
  onClose: () => void;
  /**
   * Called after the user enters a valid key and it has been saved to settings.
   * The original generation action should be re-triggered here.
   */
  onProceed?: () => void;
}

type VerifyState =
  | { status: "idle" }
  | { status: "verifying" }
  | { status: "error"; message: string };

/**
 * Blocking modal shown when a user triggers generation without a valid Poe API key.
 *
 * US-023: The modal now includes an inline API key input that verifies the key
 * against GET https://api.poe.com/usage/current_balance before saving. Inline
 * errors (not toasts) are shown for invalid keys and network failures. On a valid
 * key the modal saves it to settings and calls onProceed so the original action
 * proceeds without requiring the user to re-click.
 */
export function ApiKeyMissingModal({ onClose, onProceed }: ApiKeyMissingModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [verifyState, setVerifyState] = useState<VerifyState>({ status: "idle" });
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isVerifying = verifyState.status === "verifying";

  async function handleSave() {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setVerifyState({ status: "error", message: "Please enter an API key." });
      inputRef.current?.focus();
      return;
    }

    setVerifyState({ status: "verifying" });

    try {
      const res = await fetch("https://api.poe.com/usage/current_balance", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${trimmed}`,
        },
      });

      if (!res.ok) {
        // 401 or 403 → invalid key; other statuses → unexpected server error.
        if (res.status === 401 || res.status === 403) {
          setVerifyState({ status: "error", message: "Invalid API key. Please check and try again." });
        } else {
          setVerifyState({ status: "error", message: `Verification failed (HTTP ${res.status}). Please try again.` });
        }
        return;
      }

      // Key is valid — save it to settings and proceed.
      const current = getSettings();
      saveSettings({
        numSongs: 3,
        ...current,
        poeApiKey: trimmed,
      });

      setVerifyState({ status: "idle" });
      onProceed?.();
      onClose();
    } catch (err) {
      const networkMessage =
        err instanceof TypeError
          ? "Network error — check your connection and try again."
          : `Verification error: ${err instanceof Error ? err.message : String(err)}`;
      setVerifyState({ status: "error", message: networkMessage });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSave();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
      data-testid="api-key-missing-modal"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative z-10 bg-background border rounded-lg shadow-lg p-6 w-full max-w-md mx-4">
        <h2
          id="api-key-modal-title"
          className="text-lg font-semibold mb-2"
        >
          Poe API Key Required
        </h2>
        <p className="text-muted-foreground mb-4">
          A Poe API key is required to generate content. Enter your key below
          to continue. Get your key at{" "}
          <a
            href="https://poe.com/api/keys"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            poe.com/api/keys
          </a>.
        </p>

        <div className="mb-4">
          <label
            htmlFor="api-key-input"
            className="block text-sm font-medium mb-1"
          >
            Poe API Key
          </label>
          <Textarea
            id="api-key-input"
            ref={inputRef}
            data-testid="api-key-input"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              if (verifyState.status === "error") {
                setVerifyState({ status: "idle" });
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Paste your Poe API key here"
            rows={2}
            disabled={isVerifying}
            aria-describedby={
              verifyState.status === "error" ? "api-key-error" : undefined
            }
            aria-invalid={verifyState.status === "error"}
            className="resize-none font-mono text-sm"
          />
          {verifyState.status === "error" && (
            <p
              id="api-key-error"
              role="alert"
              data-testid="api-key-error"
              className="mt-1 text-sm text-destructive"
            >
              {verifyState.message}
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isVerifying}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={isVerifying || !apiKey.trim()}
            data-testid="api-key-save-btn"
          >
            {isVerifying ? "Verifying…" : "Save & Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
