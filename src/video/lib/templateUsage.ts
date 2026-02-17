/**
 * computeTemplateUsage — cross-script usage analysis for global template variables.
 *
 * Scans all shot prompts in the provided scripts for `{{templateName}}` occurrences
 * and returns a structured summary of where each template is used.
 *
 * Used by the global Templates page (/video/templates) to display "Used in" metadata
 * on each template card, so users can understand the blast radius before editing or
 * deleting a template.
 */

import type { Script } from "./storage/types";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Usage of a template within a single script.
 *
 * `shotIndices` contains the 1-based shot indices that reference the template.
 * When every shot in the script uses the template, `allShots` is true.
 */
export interface ScriptTemplateUsage {
  scriptId: string;
  scriptTitle: string;
  /** 1-based shot indices that reference the template. */
  shotIndices: number[];
  /** True when every shot in the script references the template. */
  allShots: boolean;
}

/**
 * Full cross-script usage summary for one template variable.
 *
 * `usages` is empty when no script references the template.
 */
export interface TemplateUsage {
  templateName: string;
  usages: ScriptTemplateUsage[];
}

// ─── computeTemplateUsage ─────────────────────────────────────────────────────

/**
 * Scans all shot prompts across the given scripts for `{{templateName}}`
 * occurrences and returns the structured usage summary.
 *
 * The regex matches the exact placeholder `{{name}}` (no partial matches).
 * Leading/trailing whitespace around the name is NOT tolerated — the match
 * must be `{{name}}` exactly, consistent with how the editor inserts chips.
 *
 * @param templateName - The variable name to look up (without `{{` / `}}`).
 * @param scripts      - All scripts to scan.
 * @returns            - A TemplateUsage describing where the template is used.
 */
export function computeTemplateUsage(
  templateName: string,
  scripts: Script[]
): TemplateUsage {
  // Build a literal regex for the exact placeholder `{{name}}`.
  // Escape the name in case it contains regex-special characters
  // (names are restricted to [a-zA-Z0-9_] but defensive escaping is safer).
  const escaped = templateName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const placeholder = new RegExp(`\\{\\{${escaped}\\}\\}`, "g");

  const usages: ScriptTemplateUsage[] = [];

  for (const script of scripts) {
    if (script.shots.length === 0) continue;

    const matchingIndices: number[] = [];

    for (let i = 0; i < script.shots.length; i++) {
      const shot = script.shots[i];
      if (placeholder.test(shot.prompt)) {
        // 1-based index for display
        matchingIndices.push(i + 1);
      }
      // Reset lastIndex after each test() call (global regex is stateful)
      placeholder.lastIndex = 0;
    }

    if (matchingIndices.length > 0) {
      usages.push({
        scriptId: script.id,
        scriptTitle: script.title,
        shotIndices: matchingIndices,
        allShots: matchingIndices.length === script.shots.length,
      });
    }
  }

  return { templateName, usages };
}

// ─── formatTemplateUsage ──────────────────────────────────────────────────────

/**
 * Formats a TemplateUsage result into a human-readable string array (one entry
 * per script), suitable for rendering as separate lines or joined with ' · '.
 *
 * Rules:
 *   - No usages  → ["Not used in any script"]
 *   - All shots  → "Used in: {title} (All)"
 *   - Partial    → "Used in: {title} (Shots N, M, …)"
 */
export function formatTemplateUsage(usage: TemplateUsage): string[] {
  if (usage.usages.length === 0) {
    return ["Not used in any script"];
  }

  return usage.usages.map((u) => {
    const shots = u.allShots
      ? "All"
      : `Shots ${u.shotIndices.join(", ")}`;
    return `Used in: ${u.scriptTitle} (${shots})`;
  });
}
