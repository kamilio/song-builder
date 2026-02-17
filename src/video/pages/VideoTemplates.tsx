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

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { videoStorageService } from "@/video/lib/storage/storageService";
import type { GlobalTemplate, Script, TemplateCategory } from "@/video/lib/storage/types";
import { log } from "@/music/lib/actionLog";
import { computeTemplateUsage, formatTemplateUsage } from "@/video/lib/templateUsage";
import { TemplateDialog } from "@/video/components/TemplateDialog";

// ─── Constants ────────────────────────────────────────────────────────────────

type Tab = "character" | "style" | "scenery";

const TABS: { id: Tab; label: string; addLabel: string; testId: string }[] = [
  { id: "character", label: "Characters", addLabel: "+ Add Character", testId: "templates-tab-characters" },
  { id: "style",     label: "Style",      addLabel: "+ Add Style",     testId: "templates-tab-style"      },
  { id: "scenery",   label: "Scenery",    addLabel: "+ Add Scenery",   testId: "templates-tab-scenery"    },
];


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
              data-testid={tab.testId}
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
        <TemplateDialog
          initial={formState.initial}
          initialCategory={formState.initialCategory}
          testIdPrefix="global-template"
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
