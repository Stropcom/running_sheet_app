/**
 * Shared "is this a possible duplicate?" check-queue builder for the Target
 * Registry's create flows (AddTargetDialog, AssociateCard). Reuses the same
 * server-side fuzzy matching already backing the row-save duplicate prompt
 * (checkPossibleDuplicates) and the target-vs-target check
 * (findPossibleDuplicateTarget) — no new server logic, just composes the
 * results into one ordered queue the caller can walk one warning at a time.
 */

import { trpc } from "@/lib/trpc";
import type {
  DuplicateWarning,
  DuplicateWarningKind,
} from "@/components/PossibleDuplicateAlert";

export type DuplicateCheckItem =
  | { kind: "target"; label: string }
  | { kind: Exclude<DuplicateWarningKind, "target">; label: string };

export async function runDuplicateChecks(
  utils: ReturnType<typeof trpc.useUtils>,
  items: DuplicateCheckItem[]
): Promise<DuplicateWarning[]> {
  const warnings: DuplicateWarning[] = [];
  for (const item of items) {
    const label = item.label.trim();
    if (!label) continue;
    if (item.kind === "target") {
      const match = await utils.target.registry.findPossibleDuplicate.fetch({
        name: label,
      });
      if (match) {
        warnings.push({
          kind: "target",
          candidateLabel: label,
          existingLabel: match.name,
          reason: match.reason,
        });
      }
      continue;
    }
    const matches = await utils.intelligence.checkPossibleDuplicates.fetch({
      type: item.kind,
      label,
    });
    if (matches.length > 0) {
      warnings.push({
        kind: item.kind,
        candidateLabel: label,
        existingLabel: matches[0].label,
        reason: matches[0].reason,
      });
    }
  }
  return warnings;
}
