/**
 * Global Templates page.
 *
 * Route: /video/templates (TopBar)
 *
 * Manages global template variables available across all scripts.
 * Templates are organized by category (Characters, Style, Scenery) with a
 * tab bar. Each template card shows the variable name as '{{name}}', the
 * value text, Edit / Delete buttons, and "Used in" cross-script metadata.
 *
 * A '+ New Variable' button (top-right) opens a form without a pre-selected
 * category. Each category tab also has a contextual add button that opens the
 * same form with that tab's category pre-selected.
 *
 * The "Used in" metadata is computed on every render of this page by scanning
 * all script shot prompts via computeTemplateUsage().
 *
 * Implements US-040 (core template management) and US-060 ('Used in' metadata).
 */

import { useState, useRef, useEffect, type FormEvent } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { videoStorageService } from "@/video/lib/storage/storageService";
import type { GlobalTemplate, Script, TemplateCategory } from "@/video/lib/storage/types";
import { log } from "@/music/lib/actionLog";
import { computeTemplateUsage, formatTemplateUsage } from "@/video/lib/templateUsage";

// ─── Constants ────────────────────────────────────────────────────────────────

type Tab = "character" | "style" | "scenery";

const TABS: { id: Tab; label: string; addLabel: string }[] = [
  { id: "character", label: "Characters", addLabel: "+ Add Character" },
  { id: "style",     label: "Style",      addLabel: "+ Add Style"     },
  { id: "scenery",   label: "Scenery",    addLabel: "+ Add Scenery"   },
];

// ─── TemplateForm ─────────────────────────────────────────────────────────────

interface TemplateFormProps {
  /** If provided, the form is in edit mode and pre-fills with these values. */
  initial?: GlobalTemplate;
  /** Pre-selected category (can be undefined when opened via '+ New Variable'). */
  initialCategory?: TemplateCategory;
  /** Called when the user saves the form. */
  onSave: (data: { name: string; category: TemplateCategory; value: string }) => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

function TemplateForm({ initial, initialCategory, onSave, onCancel }: TemplateFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<TemplateCategory>(
    initial?.category ?? initialCategory ?? "character"
  );
  const [value, setValue] = useState(initial?.value ?? "");
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedValue = value.trim();

    if (!trimmedName) {
      setError("Variable name is required.");
      nameInputRef.current?.focus();
      return;
    }
    // Variable names should be valid identifiers (letters, digits, underscores).
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedName)) {
      setError("Name must start with a letter or underscore and contain only letters, digits, or underscores.");
      nameInputRef.current?.focus();
      return;
    }
    if (!trimmedValue) {
      setError("Value is required.");
      return;
    }

    setError(null);
    onSave({ name: trimmedName, category, value: trimmedValue });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit template variable" : "New template variable"}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={onCancel}
      />

      {/* Modal panel */}
      <div className="relative z-10 bg-background border rounded-lg shadow-lg p-6 w-full max-w-md mx-4 space-y-4">
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

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Name */}
          <div className="space-y-1">
            <label htmlFor="template-name" className="text-sm font-medium">
              Variable name
            </label>
            <input
              id="template-name"
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
              aria-describedby={error ? "template-form-error" : undefined}
              // Prevent editing the name when in edit mode (name is the key)
              readOnly={!!initial}
              aria-readonly={!!initial}
            />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Category</label>
            <div className="flex gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategory(tab.id as TemplateCategory)}
                  className={`flex-1 py-1.5 text-sm rounded border transition-colors ${
                    category === tab.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                  aria-pressed={category === tab.id}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Value */}
          <div className="space-y-1">
            <label htmlFor="template-value" className="text-sm font-medium">
              Value
            </label>
            <textarea
              id="template-value"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="Describe this template variable in detail…"
              rows={4}
              className="w-full text-sm bg-background border border-border rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary resize-none"
              aria-required="true"
              aria-describedby={error ? "template-form-error" : undefined}
            />
          </div>

          {error && (
            <p id="template-form-error" className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">
              {initial ? "Save Changes" : "Add Variable"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── TemplateCard ─────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: GlobalTemplate;
  /** Pre-computed usage lines for this template (from formatTemplateUsage). */
  usageLines: string[];
  onEdit: (template: GlobalTemplate) => void;
  onDelete: (name: string) => void;
}

function TemplateCard({ template, usageLines, onEdit, onDelete }: TemplateCardProps) {
  const isUnused = usageLines.length === 1 && usageLines[0] === "Not used in any script";

  return (
    <div
      className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2 hover:shadow-sm hover:border-foreground/20 transition-all"
      data-testid={`template-card-${template.name}`}
    >
      {/* Variable name chip */}
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-primary/10 text-primary border border-primary/20">
          {`{{${template.name}}}`}
        </span>
      </div>

      {/* Value text */}
      <p className="text-sm text-muted-foreground leading-snug line-clamp-3">
        {template.value}
      </p>

      {/* 'Used in' cross-script metadata (US-060) */}
      <div
        className="mt-1"
        data-testid={`template-usage-${template.name}`}
        aria-label={`Usage of ${template.name}`}
      >
        {isUnused ? (
          <p className="text-xs text-muted-foreground/60 italic">
            Not used in any script
          </p>
        ) : (
          <ul className="space-y-0.5">
            {usageLines.map((line, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(template)}
          data-testid={`template-edit-${template.name}`}
          aria-label={`Edit ${template.name}`}
        >
          <Pencil className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(template.name)}
          className="text-destructive hover:text-destructive border-destructive/20 hover:border-destructive/40 hover:bg-destructive/5"
          data-testid={`template-delete-${template.name}`}
          aria-label={`Delete ${template.name}`}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          Delete
        </Button>
      </div>
    </div>
  );
}

// ─── VideoTemplates ───────────────────────────────────────────────────────────

export default function VideoTemplates() {
  const [activeTab, setActiveTab] = useState<Tab>("character");
  const [templates, setTemplates] = useState<GlobalTemplate[]>(() =>
    videoStorageService.listGlobalTemplates()
  );
  // All scripts — loaded on every render to keep usage metadata fresh (US-060).
  const [scripts, setScripts] = useState<Script[]>(() =>
    videoStorageService.listScripts()
  );

  // Form state: null = closed, { mode, initial, initialCategory }
  const [formState, setFormState] = useState<{
    mode: "create" | "edit";
    initial?: GlobalTemplate;
    initialCategory?: TemplateCategory;
  } | null>(null);

  // Pending delete name — when set, ConfirmDialog is shown
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);

  function reloadTemplates() {
    setTemplates(videoStorageService.listGlobalTemplates());
    // Reload scripts too so usage metadata is always up-to-date
    setScripts(videoStorageService.listScripts());
  }

  // ── Form handlers ────────────────────────────────────────────────────────

  function openCreateForm(initialCategory?: TemplateCategory) {
    setFormState({ mode: "create", initialCategory });
  }

  function openEditForm(template: GlobalTemplate) {
    setFormState({ mode: "edit", initial: template });
  }

  function handleFormSave(data: { name: string; category: TemplateCategory; value: string }) {
    if (formState?.mode === "edit" && formState.initial) {
      // Update existing — name is the key, only category and value can change
      videoStorageService.updateGlobalTemplate(formState.initial.name, {
        category: data.category,
        value: data.value,
      });
      log({
        category: "user:action",
        action: "video:template:global:edit",
        data: { name: formState.initial.name },
      });
    } else {
      videoStorageService.createGlobalTemplate({
        name: data.name,
        category: data.category,
        value: data.value,
      });
      log({
        category: "user:action",
        action: "video:template:global:create",
        data: { name: data.name, category: data.category },
      });
    }
    reloadTemplates();
    setFormState(null);
  }

  function handleFormCancel() {
    setFormState(null);
  }

  // ── Delete handlers ──────────────────────────────────────────────────────

  function handleDeleteRequest(name: string) {
    setPendingDeleteName(name);
  }

  function confirmDelete() {
    if (pendingDeleteName) {
      videoStorageService.deleteGlobalTemplate(pendingDeleteName);
      log({
        category: "user:action",
        action: "video:template:global:delete",
        data: { name: pendingDeleteName },
      });
      reloadTemplates();
    }
    setPendingDeleteName(null);
  }

  function cancelDelete() {
    setPendingDeleteName(null);
  }

  // ── Filtered templates for active tab ───────────────────────────────────

  const filteredTemplates = templates.filter((t) => t.category === activeTab);
  const activeTabInfo = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Video Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Global template variables available across all scripts.
          </p>
        </div>
        <Button
          onClick={() => openCreateForm(undefined)}
          data-testid="new-variable-btn"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          New Variable
        </Button>
      </div>

      {/* Category tabs */}
      <div
        className="flex gap-1 border-b border-border mb-6"
        role="tablist"
        aria-label="Template categories"
      >
        {TABS.map((tab) => {
          const count = templates.filter((t) => t.category === tab.id).length;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tab-panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
              data-testid={`templates-tab-${tab.id}`}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                  ({count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab panel */}
      <div
        id={`tab-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
      >
        {filteredTemplates.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <p className="text-sm text-muted-foreground">
              No {activeTabInfo.label.toLowerCase()} templates yet.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openCreateForm(activeTab as TemplateCategory)}
            >
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
              {activeTabInfo.addLabel}
            </Button>
          </div>
        ) : (
          <>
            {/* Contextual add button */}
            <div className="flex justify-end mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openCreateForm(activeTab as TemplateCategory)}
              >
                <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                {activeTabInfo.addLabel}
              </Button>
            </div>

            {/* Template cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.name}
                  template={template}
                  usageLines={formatTemplateUsage(
                    computeTemplateUsage(template.name, scripts)
                  )}
                  onEdit={openEditForm}
                  onDelete={handleDeleteRequest}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add/Edit form modal */}
      {formState !== null && (
        <TemplateForm
          initial={formState.initial}
          initialCategory={formState.initialCategory}
          onSave={handleFormSave}
          onCancel={handleFormCancel}
        />
      )}

      {/* Delete confirmation dialog */}
      {pendingDeleteName !== null && (
        <ConfirmDialog
          title="Delete template?"
          description={`Delete "{{${pendingDeleteName}}}"? Scripts that reference this variable will keep the {{${pendingDeleteName}}} placeholder in their prompts, but it will no longer be resolved.`}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </div>
  );
}
