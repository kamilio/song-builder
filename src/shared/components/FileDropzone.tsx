/**
 * FileDropzone — reusable drag-and-drop file upload component (US-029).
 *
 * Renders an inline dropzone that:
 *   - Activates visually when a file is dragged over it
 *   - Supports click-to-browse as a fallback
 *   - Shows the selected file name inline with a remove button
 *   - Calls onFileChange(file) when a file is selected or null when cleared
 *
 * Designed to be embedded inside an input area, not as a separate panel.
 *
 * Usage:
 *   const [file, setFile] = useState<File | null>(null);
 *
 *   <FileDropzone
 *     file={file}
 *     onFileChange={setFile}
 *     accept="image/jpeg,image/png"
 *     label="Reference image"
 *   />
 */

import { useCallback, useRef, useState } from "react";
import type React from "react";
import { Paperclip, X } from "lucide-react";

export interface FileDropzoneProps {
  /** The currently attached file, or null if none. */
  file: File | null;
  /** Called with the new File when selected, or null when cleared. */
  onFileChange: (file: File | null) => void;
  /**
   * MIME type filter string passed to the file input's accept attribute.
   * Example: "image/jpeg,image/png"
   */
  accept?: string;
  /**
   * Short label shown inside the dropzone when no file is selected.
   * Defaults to "Attach file".
   */
  label?: string;
  /** data-testid prefix; dropzone gets "{testId}", remove button gets "{testId}-remove" */
  testId?: string;
  /** Whether the dropzone is disabled (no interaction). */
  disabled?: boolean;
}

export function FileDropzone({
  file,
  onFileChange,
  accept,
  label = "Attach file",
  testId = "file-dropzone",
  disabled = false,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleClick = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        inputRef.current?.click();
      }
    },
    [disabled]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0] ?? null;
      onFileChange(picked);
      // Reset so the same file can be re-selected after removal.
      e.target.value = "";
    },
    [onFileChange]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      setIsDraggingOver(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only clear when leaving the dropzone entirely (not entering a child).
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (disabled) return;
      const dropped = e.dataTransfer.files?.[0] ?? null;
      if (!dropped) return;
      onFileChange(dropped);
    },
    [disabled, onFileChange]
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFileChange(null);
    },
    [onFileChange]
  );

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={file ? `Attached: ${file.name}. Press to change.` : label}
      aria-disabled={disabled}
      data-testid={testId}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={[
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-all cursor-pointer select-none",
        isDraggingOver
          ? "border-primary bg-primary/10 text-primary shadow-sm"
          : file
          ? "border-border bg-muted/50 text-foreground hover:bg-muted"
          : "border-dashed border-muted-foreground/40 text-muted-foreground hover:border-muted-foreground/70 hover:text-foreground",
        disabled ? "opacity-50 pointer-events-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Hidden native file input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid={`${testId}-input`}
      />

      <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" />

      {file ? (
        <>
          <span
            className="truncate max-w-[160px]"
            data-testid={`${testId}-filename`}
          >
            {file.name}
          </span>
          {/* Remove attachment button */}
          <button
            type="button"
            aria-label="Remove attachment"
            data-testid={`${testId}-remove`}
            onClick={handleRemove}
            className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
          >
            <X className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
        </>
      ) : (
        <span>{label}</span>
      )}
    </div>
  );
}
