/**
 * Global Templates page.
 *
 * Route: /video/templates (TopBar)
 *
 * Manages global template variables available across all scripts.
 * Shows all templates in a flat list. Each template card shows the variable
 * name as '{{name}}', the value text, Edit / Delete buttons, and "Used in"
 * cross-script metadata.
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
import type { GlobalTemplate, Script } from "@/video/lib/storage/types";
import { log } from "@/music/lib/actionLog";
import { computeTemplateUsage, formatTemplateUsage } from "@/video/lib/templateUsage";
import { TemplateDialog } from "@/video/components/TemplateDialog";

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
  const [templates, setTemplates] = useState<GlobalTemplate[]>(() =>
    videoStorageService.listGlobalTemplates()
  );
  // All scripts — loaded on every render to keep usage metadata fresh (US-060).
  const [scripts, setScripts] = useState<Script[]>(() =>
    videoStorageService.listScripts()
  );

  // Form state: null = closed, { mode, initial }
  const [formState, setFormState] = useState<{
    mode: "create" | "edit";
    initial?: GlobalTemplate;
  } | null>(null);

  // Pending delete name — when set, ConfirmDialog is shown
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(null);

  function reloadTemplates() {
    setTemplates(videoStorageService.listGlobalTemplates());
    // Reload scripts too so usage metadata is always up-to-date
    setScripts(videoStorageService.listScripts());
  }

  // ── Form handlers ────────────────────────────────────────────────────────

  function openCreateForm() {
    setFormState({ mode: "create" });
  }

  function openEditForm(template: GlobalTemplate) {
    setFormState({ mode: "edit", initial: template });
  }

  function handleFormSave(data: { name: string; value: string }) {
    if (formState?.mode === "edit" && formState.initial) {
      videoStorageService.updateGlobalTemplate(formState.initial.name, {
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
        value: data.value,
      });
      log({
        category: "user:action",
        action: "video:template:global:create",
        data: { name: data.name },
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
          onClick={openCreateForm}
          data-testid="new-variable-btn"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          New Variable
        </Button>
      </div>

      {/* Template list */}
      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            No global templates yet.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={openCreateForm}
          >
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
            Add Variable
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
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
      )}

      {/* Add/Edit form modal — no scope toggle on global page */}
      {formState !== null && (
        <TemplateDialog
          initial={formState.initial}
          initialScope="global"
          showScopeToggle={false}
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
