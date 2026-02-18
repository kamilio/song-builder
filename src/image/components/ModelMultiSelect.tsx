/**
 * ModelMultiSelect — a shadcn-compatible multi-select dropdown (US-028).
 *
 * Renders a button that opens a dropdown listing all available models.
 * The user can toggle individual models on/off. At least one model must
 * always be selected — deselecting the last model is a no-op.
 *
 * Design follows shadcn/ui patterns: plain Tailwind classes, keyboard
 * accessible (Escape closes), click-outside closes.
 *
 * Generic over any model type that has at least { id, label }.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export interface ModelOption {
  id: string;
  label: string;
}

interface ModelMultiSelectProps<T extends ModelOption = ModelOption> {
  models: T[];
  selected: T[];
  onChange: (selected: T[]) => void;
  className?: string;
}

/**
 * Builds a compact label for the button trigger.
 * - 0 selected: "Select models…" (should never happen in practice)
 * - 1 selected: the model label
 * - 2+ selected: "N models"
 */
function triggerLabel(selected: ModelOption[]): string {
  if (selected.length === 0) return "Select models…";
  if (selected.length === 1) return selected[0].label;
  return `${selected.length} models`;
}

export function ModelMultiSelect<T extends ModelOption>({ models, selected, onChange, className }: ModelMultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const toggleModel = useCallback((model: T) => {
    const isSelected = selected.some((m) => m.id === model.id);
    if (isSelected) {
      // Never deselect the last model
      if (selected.length === 1) return;
      onChange(selected.filter((m) => m.id !== model.id));
    } else {
      onChange([...selected, model]);
    }
  }, [selected, onChange]);

  const selectedIds = new Set(selected.map((m) => m.id));

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-block", className)}
      data-testid="model-multi-select"
    >
      {/* Trigger button */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select models"
        data-testid="model-multi-select-trigger"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
      >
        <span className="max-w-[140px] truncate">{triggerLabel(selected)}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label="Models"
          data-testid="model-multi-select-dropdown"
          className="absolute bottom-full mb-1 left-0 z-50 min-w-[160px] rounded-md border bg-popover shadow-md"
        >
          <div className="p-1 flex flex-col gap-0.5">
            {models.map((model) => {
              const isSelected = selectedIds.has(model.id);
              const isOnlySelected = isSelected && selected.length === 1;
              return (
                <button
                  key={model.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-testid={`model-option-${model.id}`}
                  onClick={() => toggleModel(model)}
                  disabled={isOnlySelected}
                  className={cn(
                    "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-xs text-left transition-colors",
                    isSelected
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent hover:text-accent-foreground",
                    isOnlySelected && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <span
                    className={cn(
                      "h-3.5 w-3.5 flex items-center justify-center rounded-sm border shrink-0",
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input"
                    )}
                    aria-hidden="true"
                  >
                    {isSelected && <Check className="h-2.5 w-2.5" />}
                  </span>
                  {model.label}
                  {isOnlySelected && (
                    <span className="ml-auto">
                      <X className="h-2.5 w-2.5 text-muted-foreground" aria-hidden="true" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
