/**
 * Script settings page — full implementation for US-068.
 *
 * Route: /video/scripts/:id/settings
 *
 * Sections:
 *   1. Narration  — global toggle (on / off / mixed state across shots)
 *   2. Subtitles  — global toggle (on / off / mixed state across shots)
 *   3. Global Prompt — textarea persisted to script.settings.globalPrompt;
 *      supports {{variable}} chips via TemplateAutocomplete.
 *   4. Variables  — inline list of local script templates with create/edit/delete.
 *
 * Auto-save:
 *   - Toggles save immediately on click.
 *   - Global prompt saves on blur.
 *
 * Safety:
 *   - Redirects to /video/scripts when script ID is not found.
 *   - Wrapped in ErrorBoundary.
 */

import {
  useRef,
  useState,
  useEffect,
  ChangeEvent,
  KeyboardEvent,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Tags,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { Button } from "@/shared/components/ui/button";
import { videoStorageService } from "@/video/lib/storage/storageService";
import { log } from "@/music/lib/actionLog";
import type {
  Script,
  Shot,
  LocalTemplate,
  TemplateCategory,
} from "@/video/lib/storage/types";
import type { GlobalTemplate } from "@/video/lib/storage/types";
import TemplateAutocomplete from "@/video/components/TemplateAutocomplete";
import { TemplateDialog } from "@/video/components/TemplateDialog";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Three-state derived from all shots: on / off / mixed */
type ToggleState = "on" | "off" | "mixed";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeNarrationState(shots: Shot[]): ToggleState {
  if (shots.length === 0) return "off";
  const allOn = shots.every((s) => s.narration.enabled);
  const allOff = shots.every((s) => !s.narration.enabled);
  if (allOn) return "on";
  if (allOff) return "off";
  return "mixed";
}

function computeSubtitlesState(shots: Shot[]): ToggleState {
  if (shots.length === 0) return "off";
  const allOn = shots.every((s) => s.subtitles);
  const allOff = shots.every((s) => !s.subtitles);
  if (allOn) return "on";
  if (allOff) return "off";
  return "mixed";
}

// ─── MixedToggle ──────────────────────────────────────────────────────────────

interface MixedToggleProps {
  state: ToggleState;
  onClick: () => void;
  "data-testid": string;
  "aria-label": string;
}

/**
 * Toggle switch with three visual states: on, off, mixed.
 *
 * Visual:
 *   on    → filled blue, dot at right
 *   off   → grey, dot at left
 *   mixed → primary/50, dot centred (indeterminate)
 */
function MixedToggle({ state, onClick, "data-testid": testId, "aria-label": ariaLabel }: MixedToggleProps) {
  const isOn = state === "on";
  const isMixed = state === "mixed";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn ? true : isMixed ? "mixed" : false}
      onClick={onClick}
      className={[
        "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
        isOn ? "bg-primary" : isMixed ? "bg-primary/50" : "bg-input",
      ].join(" ")}
      data-testid={testId}
      aria-label={ariaLabel}
    >
      <span
        className={[
          "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
          isOn ? "translate-x-3" : isMixed ? "translate-x-1.5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}


// ─── LocalTemplateCard ────────────────────────────────────────────────────────

interface LocalTemplateCardProps {
  template: LocalTemplate;
  onEdit: (template: LocalTemplate) => void;
  onDelete: (name: string) => void;
}

function LocalTemplateCard({ template, onEdit, onDelete }: LocalTemplateCardProps) {
  const categoryLabel =
    template.category === "character"
      ? "Characters"
      : template.category === "style"
      ? "Style"
      : "Scenery";

  return (
    <div
      className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2 hover:shadow-sm hover:border-foreground/20 transition-all"
      data-testid={`settings-template-card-${template.name}`}
    >
      {/* Variable name chip + category */}
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-primary/10 text-primary border border-primary/20">
          {`{{${template.name}}}`}
        </span>
        <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
          {categoryLabel}
        </span>
      </div>

      {/* Value text */}
      <p className="text-xs text-muted-foreground leading-snug line-clamp-3">
        {template.value}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(template)}
          data-testid={`settings-template-edit-${template.name}`}
          aria-label={`Edit ${template.name}`}
        >
          <Pencil className="h-3 w-3 mr-1" aria-hidden="true" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(template.name)}
          data-testid={`settings-template-delete-${template.name}`}
          aria-label={`Delete ${template.name}`}
        >
          <Trash2 className="h-3 w-3 mr-1" aria-hidden="true" />
          Delete
        </Button>
      </div>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

function VideoScriptSettingsInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // ── Script state ───────────────────────────────────────────────────────────

  const [script, setScript] = useState<Script | null>(
    id ? videoStorageService.getScript(id) : null
  );

  useEffect(() => {
    if (!id || !script) {
      navigate("/video/scripts", { replace: true });
    }
  }, [id, script, navigate]);

  // ── Global prompt state (controlled with auto-save on blur) ───────────────

  const [globalPrompt, setGlobalPrompt] = useState<string>(
    script?.settings.globalPrompt ?? ""
  );

  // ── Template autocomplete state ───────────────────────────────────────────

  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const [globalTemplates] = useState<GlobalTemplate[]>(() =>
    videoStorageService.listGlobalTemplates()
  );
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Variables (local templates) form state ────────────────────────────────

  const [formState, setFormState] = useState<{
    mode: "create" | "edit";
    initial?: LocalTemplate;
  } | null>(null);

  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function persistAndSetScript(updated: Script | null) {
    if (updated) setScript(updated);
  }

  // ── Narration toggle ──────────────────────────────────────────────────────

  function handleNarrationToggle() {
    if (!script) return;
    const state = computeNarrationState(script.shots);
    // off → set all on; on → set all off; mixed → set all on
    const newEnabled = state !== "on";
    const updatedShots = script.shots.map((s) => ({
      ...s,
      narration: { ...s.narration, enabled: newEnabled },
    }));
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
      settings: { ...script.settings, narrationEnabled: newEnabled },
    });
    persistAndSetScript(updated);
    log({
      category: "user:action",
      action: "video:settings:narration:global",
      data: { scriptId: script.id, newEnabled },
    });
  }

  // ── Subtitles toggle ──────────────────────────────────────────────────────

  function handleSubtitlesToggle() {
    if (!script) return;
    const state = computeSubtitlesState(script.shots);
    // off → set all on; on → set all off; mixed → set all on
    const newEnabled = state !== "on";
    const updatedShots = script.shots.map((s) => ({
      ...s,
      subtitles: newEnabled,
    }));
    const updated = videoStorageService.updateScript(script.id, {
      shots: updatedShots,
      settings: { ...script.settings, subtitles: newEnabled },
    });
    persistAndSetScript(updated);
    log({
      category: "user:action",
      action: "video:settings:subtitles:global",
      data: { scriptId: script.id, newEnabled },
    });
  }

  // ── Global prompt handlers ────────────────────────────────────────────────

  function handleGlobalPromptChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setGlobalPrompt(val);

    // Detect {{ for autocomplete
    const cursorPos = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursorPos);
    const match = textBefore.match(/\{\{([a-zA-Z0-9_]*)$/);
    if (match) {
      setAutocompleteQuery(match[1]);
      setAutocompleteOpen(true);
    } else {
      setAutocompleteOpen(false);
      setAutocompleteQuery("");
    }
  }

  function handleGlobalPromptKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      setAutocompleteOpen(false);
    }
  }

  function handleGlobalPromptBlur() {
    // Close autocomplete on blur (unless clicking inside it)
    setTimeout(() => {
      if (!autocompleteRef.current?.contains(document.activeElement)) {
        setAutocompleteOpen(false);
      }
    }, 100);

    // Auto-save on blur
    if (!script) return;
    if (globalPrompt === script.settings.globalPrompt) return;
    const updated = videoStorageService.updateScript(script.id, {
      settings: { ...script.settings, globalPrompt },
    });
    persistAndSetScript(updated);
    log({
      category: "user:action",
      action: "video:settings:globalPrompt",
      data: { scriptId: script.id },
    });
  }

  function handleAutocompleteSelect(name: string) {
    if (!promptTextareaRef.current) {
      setAutocompleteOpen(false);
      return;
    }
    const textarea = promptTextareaRef.current;
    const cursorPos = textarea.selectionStart ?? globalPrompt.length;
    const textBefore = globalPrompt.slice(0, cursorPos);
    const textAfter = globalPrompt.slice(cursorPos);

    // Replace the partial `{{prefix` with `{{name}}`
    const replaced = textBefore.replace(/\{\{([a-zA-Z0-9_]*)$/, `{{${name}}}`);
    const newPrompt = replaced + textAfter;

    setGlobalPrompt(newPrompt);
    setAutocompleteOpen(false);
    setAutocompleteQuery("");

    // Restore focus and position cursor after the inserted chip
    setTimeout(() => {
      const newCursor = replaced.length;
      textarea.focus();
      textarea.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  // ── Variables CRUD ────────────────────────────────────────────────────────

  function openCreateForm() {
    setFormState({ mode: "create" });
  }

  function openEditForm(template: LocalTemplate) {
    setFormState({ mode: "edit", initial: template });
  }

  function handleFormSave(data: { name: string; category: TemplateCategory; value: string }) {
    if (!script) return;
    const isEdit = formState?.mode === "edit";
    const newTemplate: LocalTemplate = {
      name: data.name,
      category: data.category,
      value: data.value,
      global: false,
    };
    const updatedTemplates: Record<string, LocalTemplate> = {
      ...script.templates,
      [data.name]: newTemplate,
    };
    const updated = videoStorageService.updateScript(script.id, {
      templates: updatedTemplates,
    });
    persistAndSetScript(updated);
    log({
      category: "user:action",
      action: isEdit ? "video:template:local:edit" : "video:template:local:create",
      data: { scriptId: script.id, name: data.name },
    });
    setFormState(null);
  }

  function handleFormCancel() {
    setFormState(null);
  }

  function handleDeleteRequest(name: string) {
    setPendingDeleteName(name);
  }

  function confirmDelete() {
    if (!script || !pendingDeleteName) return;
    const updatedTemplates = { ...script.templates };
    delete updatedTemplates[pendingDeleteName];
    const updated = videoStorageService.updateScript(script.id, {
      templates: updatedTemplates,
    });
    persistAndSetScript(updated);
    log({
      category: "user:action",
      action: "video:template:local:delete",
      data: { scriptId: script.id, name: pendingDeleteName },
    });
    setPendingDeleteName(null);
  }

  function cancelDelete() {
    setPendingDeleteName(null);
  }

  // ── Early exit ────────────────────────────────────────────────────────────

  if (!id || !script) {
    return null;
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const narrationState = computeNarrationState(script.shots);
  const subtitlesState = computeSubtitlesState(script.shots);
  const localTemplates = Object.values(script.templates);

  const narrationLabel =
    narrationState === "on"
      ? "Narration: On"
      : narrationState === "mixed"
      ? "Narration: Mixed"
      : "Narration: Off";

  const subtitlesLabel =
    subtitlesState === "on"
      ? "Subtitles: On"
      : subtitlesState === "mixed"
      ? "Subtitles: Mixed"
      : "Subtitles: Off";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto p-6"
      data-testid="script-settings"
    >
      <div className="max-w-2xl mx-auto w-full space-y-8">
        {/* Page title */}
        <h1 className="text-lg font-semibold">Settings</h1>

        {/* ── 1. Narration ─────────────────────────────────────────────────── */}
        <section aria-labelledby="settings-narration-heading" data-testid="settings-narration-section">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2
                id="settings-narration-heading"
                className="text-sm font-semibold"
              >
                Narration
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enable or disable narration for all shots at once.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums" data-testid="narration-state-label">
                {narrationState === "mixed" ? "Mixed" : narrationState === "on" ? "On" : "Off"}
              </span>
              <MixedToggle
                state={narrationState}
                onClick={handleNarrationToggle}
                data-testid="narration-global-toggle"
                aria-label={narrationLabel}
              />
            </div>
          </div>
          {script.shots.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              No shots yet — add shots to control narration.
            </p>
          )}
        </section>

        <div className="border-t border-border" />

        {/* ── 2. Subtitles ─────────────────────────────────────────────────── */}
        <section aria-labelledby="settings-subtitles-heading" data-testid="settings-subtitles-section">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2
                id="settings-subtitles-heading"
                className="text-sm font-semibold"
              >
                Subtitles
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Burn subtitles into all shots at once.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums" data-testid="subtitles-state-label">
                {subtitlesState === "mixed" ? "Mixed" : subtitlesState === "on" ? "On" : "Off"}
              </span>
              <MixedToggle
                state={subtitlesState}
                onClick={handleSubtitlesToggle}
                data-testid="subtitles-global-toggle"
                aria-label={subtitlesLabel}
              />
            </div>
          </div>
          {script.shots.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              No shots yet — add shots to control subtitles.
            </p>
          )}
        </section>

        <div className="border-t border-border" />

        {/* ── 3. Global Prompt ─────────────────────────────────────────────── */}
        <section aria-labelledby="settings-global-prompt-heading" data-testid="settings-global-prompt-section">
          <h2
            id="settings-global-prompt-heading"
            className="text-sm font-semibold mb-1"
          >
            Global Prompt
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            Text prepended to every shot prompt during generation. Supports{" "}
            <span className="font-mono text-primary text-[10px]">{"{{variable}}"}</span> chips.
          </p>
          <div className="relative">
            <textarea
              ref={promptTextareaRef}
              value={globalPrompt}
              onChange={handleGlobalPromptChange}
              onBlur={handleGlobalPromptBlur}
              onKeyDown={handleGlobalPromptKeyDown}
              placeholder="Text prepended to every shot prompt during generation…"
              rows={4}
              className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-ring resize-none transition-colors"
              data-testid="settings-global-prompt-textarea"
              aria-label="Global prompt"
            />
            {/* Autocomplete dropdown */}
            <TemplateAutocomplete
              ref={autocompleteRef}
              open={autocompleteOpen}
              query={autocompleteQuery}
              localTemplates={localTemplates}
              globalTemplates={globalTemplates}
              onSelect={handleAutocompleteSelect}
            />
          </div>
        </section>

        <div className="border-t border-border" />

        {/* ── 4. Variables ─────────────────────────────────────────────────── */}
        <section aria-labelledby="settings-variables-heading" data-testid="settings-variables-section">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <h2
                id="settings-variables-heading"
                className="text-sm font-semibold"
              >
                Variables
              </h2>
              <Tags className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={openCreateForm}
              data-testid="settings-variable-add-btn"
              aria-label="Add variable"
            >
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              + Variable
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            Local variables scoped to this script.
          </p>

          {/* Template list */}
          {localTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <p className="text-sm text-muted-foreground">
                No local template variables yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={openCreateForm}
                data-testid="settings-variable-add-empty-btn"
              >
                <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Add Variable
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {localTemplates.map((template) => (
                <LocalTemplateCard
                  key={template.name}
                  template={template}
                  onEdit={openEditForm}
                  onDelete={handleDeleteRequest}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Delete confirmation dialog */}
      {pendingDeleteName !== null && (
        <ConfirmDialog
          title="Delete variable?"
          description={`Delete "{{${pendingDeleteName}}}"? Shot prompts that reference this variable will keep the {{${pendingDeleteName}}} placeholder, but it will no longer appear as a chip.`}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}

      {/* Template create/edit modal dialog */}
      {formState !== null && (
        <TemplateDialog
          initial={formState.initial}
          testIdPrefix="settings-template"
          onSave={handleFormSave}
          onCancel={handleFormCancel}
        />
      )}
    </div>
  );
}

export default function VideoScriptSettings() {
  return (
    <ErrorBoundary>
      <VideoScriptSettingsInner />
    </ErrorBoundary>
  );
}
