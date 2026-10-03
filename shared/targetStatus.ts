// Person-target status fields — Motor Drivers Licence (MDL) and bail. Shared
// by the server zod schema's allowed values and every client surface that
// shows or edits them, so labels never drift apart.

export const MDL_STATUSES = ["active", "none", "suspended"] as const;
export type MdlStatus = (typeof MDL_STATUSES)[number];
export const MDL_LABELS: Record<MdlStatus, string> = {
  active: "Active",
  none: "None",
  suspended: "Suspended",
};

export const YES_NO = ["yes", "no"] as const;
export type YesNo = (typeof YES_NO)[number];
export const YES_NO_LABELS: Record<YesNo, string> = { yes: "Yes", no: "No" };

export function mdlLabel(value: string | null | undefined): string {
  return value && value in MDL_LABELS ? MDL_LABELS[value as MdlStatus] : "";
}

/** One-line bail summary for read-only display, or "" when never set. */
export function formatBail(t: {
  bailStatus?: string | null;
  bailConditions?: string | null;
  bailConditionsText?: string | null;
}): string {
  if (t.bailStatus === "no") return "No";
  if (t.bailStatus !== "yes") return "";
  if (t.bailConditions === "no") return "Yes — no conditions";
  if (t.bailConditions === "yes") {
    const text = t.bailConditionsText?.trim();
    return text ? `Yes — conditions: ${text}` : "Yes — conditions";
  }
  return "Yes";
}

// ─── Special projects (TI / LBS / SEEK / CAD) ───────────────────────────────
// Stored as the same JSON array the Sheet Summary uses for its own Special
// Projects — [{ key, detail }] — so the two stay interchangeable. A target
// only ever carries these four; the Summary also offers Tracker/LD/Coyotes/
// Other, which are per-deployment and never come from the registry.

export const TARGET_SPECIAL_PROJECTS = ["TI", "LBS", "SEEK", "CAD"] as const;
export type TargetSpecialProject = (typeof TARGET_SPECIAL_PROJECTS)[number];

export interface SpecialProjectEntry {
  key: string;
  detail: string;
}

export function parseSpecialProjects(
  raw: string | null | undefined
): SpecialProjectEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(p => p && typeof p.key === "string")
      .map(p => ({
        key: p.key,
        detail: typeof p.detail === "string" ? p.detail : "",
      }));
  } catch {
    return [];
  }
}

/** Keeps only the four registry projects (each once, in TI/LBS/SEEK/CAD
 * order) and returns the JSON to store, or null when none are ticked. */
export function sanitizeTargetSpecialProjects(
  raw: string | null | undefined
): string | null {
  const entries = parseSpecialProjects(raw);
  const kept = TARGET_SPECIAL_PROJECTS.flatMap(key => {
    const e = entries.find(x => x.key === key);
    return e ? [{ key, detail: e.detail.trim() }] : [];
  });
  return kept.length ? JSON.stringify(kept) : null;
}

/** "TI (AFP), LBS (WAPOL), SEEK" for read-only display, or "" when none. */
export function formatSpecialProjects(raw: string | null | undefined): string {
  return parseSpecialProjects(raw)
    .map(p => (p.detail ? `${p.key} (${p.detail})` : p.key))
    .join(", ");
}

/** Adds the target's projects to a summary's own list without disturbing it:
 * a project the summary already has keeps its entry (its detail is only
 * filled in when it was blank); one it lacks is appended. Returns JSON, or
 * null when the result is empty. */
export function mergeSpecialProjects(
  summaryRaw: string | null | undefined,
  targetRaw: string | null | undefined
): string | null {
  const merged = parseSpecialProjects(summaryRaw);
  for (const t of parseSpecialProjects(targetRaw)) {
    const existing = merged.find(m => m.key === t.key);
    if (!existing) merged.push({ key: t.key, detail: t.detail });
    else if (!existing.detail && t.detail) existing.detail = t.detail;
  }
  return merged.length ? JSON.stringify(merged) : null;
}

/** Makes a summary's TI/LBS/SEEK/CAD entries exactly match the target's, in
 * both directions of the registry↔summary sync: a project the target lacks
 * is removed from the summary, one it has is added (or has its detail
 * updated), and every other entry the summary holds (Tracker, LD, Coyotes,
 * Other) is left alone. Returns JSON, or null when the result is empty. */
export function applyTargetProjectsToSummary(
  summaryRaw: string | null | undefined,
  targetRaw: string | null | undefined
): string | null {
  const target = parseSpecialProjects(targetRaw);
  const isTargetKey = (k: string) =>
    (TARGET_SPECIAL_PROJECTS as readonly string[]).includes(k);
  const next: SpecialProjectEntry[] = [];
  for (const entry of parseSpecialProjects(summaryRaw)) {
    if (!isTargetKey(entry.key)) {
      next.push(entry);
      continue;
    }
    const t = target.find(x => x.key === entry.key);
    if (t) next.push({ key: entry.key, detail: t.detail });
  }
  for (const t of target) {
    if (!next.some(n => n.key === t.key)) next.push({ ...t });
  }
  return next.length ? JSON.stringify(next) : null;
}
