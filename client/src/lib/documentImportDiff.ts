import type { DocumentImportPrefill } from "@/components/ImportTargetDocumentDialog";
import {
  composeAddress,
  composeVehicle,
  composeAssociateName,
  type StructuredVehicleParts,
} from "@/lib/addressFormat";
import { reflowNarrativeText } from "@/lib/textFormat";

// Field-by-field comparison between one imported-document snapshot and the
// version immediately before it — backs the "what changed" highlighting on
// an ImportedDocumentCard. Purely a display concern: it never touches the
// stored snapshots themselves, just annotates each already-composed line
// with whether it's new, gone, or different since the previous version.
export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface DiffLine {
  text: string;
  status: DiffStatus;
  /** For a "changed" line only — the previous version's own composed text. */
  wasText?: string;
}

export interface SnapshotDiff {
  addresses: DiffLine[];
  vehicles: DiffLine[];
  associates: DiffLine[];
  /** Added/unchanged only — a paragraph dropped from the narrative isn't
   * surfaced as "removed" text here, just absent, since re-showing a whole
   * stale paragraph inline reads as noise rather than a useful signal. */
  backgroundParagraphs: DiffLine[];
}

// Matches purely by composed text — an edited address/associate name has no
// stable key across versions the way a vehicle has its registration, so an
// edit shows as one "removed" (the old text) plus one "added" (the new
// text) rather than a "changed" line. Current items keep the document's own
// order; anything only in the previous version is appended at the end.
function diffByText(current: string[], previous: string[]): DiffLine[] {
  const previousSet = new Set(previous.map(t => t.trim().toLowerCase()));
  const currentSet = new Set(current.map(t => t.trim().toLowerCase()));
  const lines: DiffLine[] = current.map(text => ({
    text,
    status: previousSet.has(text.trim().toLowerCase()) ? "unchanged" : "added",
  }));
  for (const text of previous) {
    if (!currentSet.has(text.trim().toLowerCase())) {
      lines.push({ text, status: "removed" });
    }
  }
  return lines;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Associates are stored per-version as only the ones staged "create as new"
// at that import — NOT every associate the parser recognised in the text —
// because an associate who already existed gets routed straight to
// associate.update instead of being staged (see AddTargetDialog's
// saveStagedAssociates). Matched by tgt (surname, or business name for a
// company associate — the same stable key composeAssociateName always
// derives) rather than the full composed text, the same way diffVehicles
// matches on registration: lets an edit (e.g. a DOB added, a spelling
// correction) show as one "changed" line instead of an unrelated
// remove+add pair. A previously-staged associate who drops out of the
// current "create as new" list only shows as "removed" if their name is
// no longer mentioned anywhere in this version's own Background text
// either — otherwise they're just not staged again this time (routed to
// associate.update instead) and are left exactly as they were.
function diffAssociates(
  current: { name: string; tgt: string }[],
  previous: { name: string; tgt: string }[],
  currentBackground: string
): DiffLine[] {
  const keyOf = (a: { name: string; tgt: string }) =>
    (a.tgt || a.name).trim().toLowerCase();
  const previousByKey = new Map(previous.map(a => [keyOf(a), a]));
  const matchedKeys = new Set<string>();
  const lines: DiffLine[] = [];
  for (const a of current) {
    const k = keyOf(a);
    const prev = previousByKey.get(k);
    if (!prev) {
      lines.push({ text: a.name, status: "added" });
      continue;
    }
    matchedKeys.add(k);
    lines.push(
      prev.name.trim().toLowerCase() === a.name.trim().toLowerCase()
        ? { text: a.name, status: "unchanged" }
        : { text: a.name, status: "changed", wasText: prev.name }
    );
  }
  const backgroundLower = currentBackground.toLowerCase();
  for (const a of previous) {
    const k = keyOf(a);
    if (matchedKeys.has(k)) continue;
    const tgt = a.tgt.trim().toLowerCase();
    const stillMentioned =
      tgt.length > 0 &&
      new RegExp(`\\b${escapeRegExp(tgt)}\\b`).test(backgroundLower);
    lines.push({
      text: a.name,
      status: stillMentioned ? "unchanged" : "removed",
    });
  }
  return lines;
}

// Vehicles DO have a stable key — registration — so a re-import that fixes
// or updates a vehicle's colour/make/model shows as one "changed" line
// (with the old description kept as `wasText`) instead of an unrelated
// remove+add pair.
function diffVehicles(
  current: (StructuredVehicleParts & { vehicleType?: string })[],
  previous: (StructuredVehicleParts & { vehicleType?: string })[]
): DiffLine[] {
  const regOf = (v: StructuredVehicleParts) =>
    v.registration.trim().toUpperCase();
  const previousByReg = new Map(
    previous.filter(v => regOf(v)).map(v => [regOf(v), v])
  );
  const matchedRegs = new Set<string>();
  const lines: DiffLine[] = [];
  for (const v of current) {
    const full = composeVehicle(v).full;
    if (!full) continue;
    const reg = regOf(v);
    const prevV = reg ? previousByReg.get(reg) : undefined;
    if (!prevV) {
      lines.push({ text: full, status: "added" });
      continue;
    }
    matchedRegs.add(reg);
    const prevFull = composeVehicle(prevV).full;
    lines.push(
      prevFull === full
        ? { text: full, status: "unchanged" }
        : { text: full, status: "changed", wasText: prevFull }
    );
  }
  for (const v of previous) {
    const reg = regOf(v);
    if (!reg || matchedRegs.has(reg)) continue;
    const full = composeVehicle(v).full;
    if (full) lines.push({ text: full, status: "removed" });
  }
  return lines;
}

/** Null when there's no previous version to compare against (this is
 * Version 1, or the caller doesn't have one) — callers render plain,
 * undecorated fields in that case. */
export function diffDocumentSnapshots(
  current: DocumentImportPrefill,
  previous: DocumentImportPrefill | null
): SnapshotDiff | null {
  if (!previous) return null;

  const currentAddresses = [current.address, ...current.extraAddresses]
    .map(a => composeAddress(a).full)
    .filter(Boolean);
  const previousAddresses = [previous.address, ...previous.extraAddresses]
    .map(a => composeAddress(a).full)
    .filter(Boolean);

  const currentAssociates = current.associates
    .map(a => composeAssociateName(a.identity, a.address.businessName))
    .filter(a => a.name);
  const previousAssociates = previous.associates
    .map(a => composeAssociateName(a.identity, a.address.businessName))
    .filter(a => a.name);

  // Diffed at the same paragraph granularity the card actually displays
  // (after reflowNarrativeText), so "added" lines up exactly with what the
  // officer sees rather than an internal line-break shape they never see.
  const paragraphsOf = (text: string) =>
    reflowNarrativeText(text.trim())
      .split("\n\n")
      .map(p => p.trim())
      .filter(Boolean);
  const currentParagraphs = paragraphsOf(current.background);
  const previousParagraphSet = new Set(
    paragraphsOf(previous.background).map(p => p.toLowerCase())
  );
  const backgroundParagraphs: DiffLine[] = currentParagraphs.map(text => ({
    text,
    status: previousParagraphSet.has(text.toLowerCase())
      ? "unchanged"
      : "added",
  }));

  return {
    addresses: diffByText(currentAddresses, previousAddresses),
    vehicles: diffVehicles(
      [current.vehicle, ...current.extraVehicles],
      [previous.vehicle, ...previous.extraVehicles]
    ),
    associates: diffAssociates(
      currentAssociates,
      previousAssociates,
      current.background
    ),
    backgroundParagraphs,
  };
}

export function countChanges(diff: SnapshotDiff | null): number {
  if (!diff) return 0;
  return (
    diff.addresses.filter(l => l.status !== "unchanged").length +
    diff.vehicles.filter(l => l.status !== "unchanged").length +
    diff.associates.filter(l => l.status !== "unchanged").length +
    diff.backgroundParagraphs.filter(l => l.status !== "unchanged").length
  );
}
