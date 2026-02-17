/**
 * Shared TemplateDialog modal — US-072.
 *
 * A modal dialog for creating and editing template variables.
 * Used by:
 *   - /video/scripts/:id/templates  (TemplatesModeView in VideoScriptView)
 *   - /video/scripts/:id/settings   (Variables section in VideoScriptSettings)
 *   - /video/templates              (global VideoTemplates page)
 *
 * Fields: Name, Value (textarea), and optionally a Local/Global scope toggle.
 * Edit mode: modal pre-fills existing values and makes Name read-only.
 * Cancel button and Escape close without saving.
 * Submit button label: "Save Template".
 */

import { useState, useRef, useEffect, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

// ─── Props ─────────────────────────────────────────────────────────────────────

export type TemplateScope = "local" | "global";

export interface TemplateDialogProps {
  /** If provided, the dialog is in edit mode and pre-fills with these values. */
  initial?: {
    name: string;
    value: string;
  };
  /** Initial scope selection (default: "local"). */
  initialScope?: TemplateScope;
  /** Whether to show the local/global scope toggle. Default: true. */
  showScopeToggle?: boolean;
  /**
   * Prefix for data-testid attributes.
   * e.g. "local-template" → testids: "local-template-name-input", etc.
   * Defaults to "template-dialog".
   */
  testIdPrefix?: string;
  /** Called when the user submits the form with valid data. */
  onSave: (data: { name: string; value: string; scope: TemplateScope }) => void;
  /** Called when the user cancels (Cancel button, Escape key, or backdrop click). */
  onCancel: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function TemplateDialog({
  initial,
  initialScope = "local",
  showScopeToggle = true,
  testIdPrefix = "template-dialog",
  onSave,
  onCancel,
}: TemplateDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [scope, setScope] = useState<TemplateScope>(initialScope);
  const [value, setValue] = useState(initial?.value ?? "");
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus the name input when the dialog opens
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

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
      setError(
        "Name must start with a letter or underscore and contain only letters, digits, or underscores."
      );
      nameInputRef.current?.focus();
      return;
    }
    if (!trimmedValue) {
      setError("Value is required.");
      return;
    }

    setError(null);
    onSave({ name: trimmedName, value: trimmedValue, scope });
  }

  const errorId = `${testIdPrefix}-error`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit template variable" : "New template variable"}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop — click to cancel */}
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={onCancel}
      />

      {/* Modal panel */}
      <div className="relative z-10 bg-background border rounded-lg shadow-lg p-6 w-full max-w-md mx-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {initial ? "Edit Variable" : "New Variable"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Name */}
          <div className="space-y-1">
            <label
              htmlFor={`${testIdPrefix}-name-input`}
              className="text-sm font-medium"
            >
              Variable name
            </label>
            <input
              id={`${testIdPrefix}-name-input`}
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
              aria-describedby={error ? errorId : undefined}
              readOnly={!!initial}
              aria-readonly={!!initial}
              data-testid={`${testIdPrefix}-name-input`}
            />
          </div>

          {/* Scope toggle */}
          {showScopeToggle && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Scope</label>
              <div className="flex gap-2">
                {(["local", "global"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`flex-1 py-1.5 text-sm rounded border transition-colors ${
                      scope === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    }`}
                    aria-pressed={scope === s}
                    data-testid={`${testIdPrefix}-scope-${s}`}
                  >
                    {s === "local" ? "Local" : "Global"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {scope === "local"
                  ? "Only available in this script."
                  : "Available across all scripts."}
              </p>
            </div>
          )}

          {/* Value */}
          <div className="space-y-1">
            <label
              htmlFor={`${testIdPrefix}-value-input`}
              className="text-sm font-medium"
            >
              Value
            </label>
            <textarea
              id={`${testIdPrefix}-value-input`}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="Describe this template variable in detail…"
              rows={4}
              className="w-full text-sm bg-background border border-border rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary resize-none"
              aria-required="true"
              aria-describedby={error ? errorId : undefined}
              data-testid={`${testIdPrefix}-value-input`}
            />
          </div>

          {error && (
            <p id={errorId} className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" data-testid={`${testIdPrefix}-save-btn`}>
              Save Template
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
