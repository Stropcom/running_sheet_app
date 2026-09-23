import { useState } from "react";
import { FileText, ChevronDown } from "lucide-react";
import {
  formatIntelAddress,
  formatIntelVehicle,
  composeAddress,
  composeVehicle,
  composeAssociateName,
} from "@/lib/addressFormat";
import type { DocumentImportPrefill } from "@/components/ImportTargetDocumentDialog";
import { reflowNarrativeText } from "@/lib/textFormat";
import {
  diffDocumentSnapshots,
  countChanges,
  type DiffLine,
  type DiffStatus,
} from "@/lib/documentImportDiff";

// One row per document uploaded via "Import Target" that was actually saved
// — shown exactly as parsed and confirmed by the officer, never re-derived
// from the target's live (possibly since-edited) fields. Shared by the
// Operation profile's "Imported Documents" panel (grouped by target) and
// the Target profile's equivalent panel (grouped by operation) so both read
// identically — see targetDocumentImports in drizzle/schema.ts.
export interface DocumentImportRow {
  id: number;
  targetId: number;
  targetName?: string | null;
  operationId?: number;
  uploadedByCIN: string | null;
  uploadedAt: string | Date;
  sourceFileName: string | null;
  snapshotJson: string;
}

export function formatImportDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Shared line/pill decoration for a diffed field — added/removed/changed
// since the previous version get a coloured left border + tint (matching
// the border-l-4 + /5 background convention AddTargetDialog's own field
// group boxes already use), "unchanged" renders exactly as before.
function diffLineClasses(status: DiffStatus): string {
  switch (status) {
    case "added":
      return "border-l-2 border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
    case "removed":
      return "border-l-2 border-red-500 bg-red-500/10 text-red-700 dark:text-red-400 line-through decoration-2";
    case "changed":
      return "border-l-2 border-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    default:
      return "";
  }
}

const DIFF_MARKER_BG: Record<Exclude<DiffStatus, "unchanged">, string> = {
  added: "bg-emerald-500",
  removed: "bg-red-500",
  changed: "bg-amber-500",
};
const DIFF_MARKER_SYMBOL: Record<Exclude<DiffStatus, "unchanged">, string> = {
  added: "+",
  removed: "−",
  changed: "~",
};

function DiffMarker({ status }: { status: DiffStatus }) {
  if (status === "unchanged") return null;
  return (
    <span
      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded text-[9px] font-bold text-white shrink-0 ${DIFF_MARKER_BG[status]}`}
    >
      {DIFF_MARKER_SYMBOL[status]}
    </span>
  );
}

export function ImportedDocumentCard({
  row,
  version,
  isCurrent,
  subject,
  previous,
}: {
  row: DocumentImportRow;
  version: number;
  isCurrent: boolean;
  // Overrides the default "Imported for {name}" subject, which otherwise
  // falls back to the parsed snapshot name or row.targetName (only
  // populated when the caller's own query joins it). Both the Operation
  // profile (grouped by target) and the Target profile (grouped by
  // operation) always show the TARGET's name here — the target profile
  // passes it explicitly since its own query doesn't join targetName —
  // so a card always reads as "who does this document relate to",
  // consistently, on either page.
  subject?: string;
  /** The import immediately before this one (by upload order), if any —
   * when given, fields that are new/gone/different since that version are
   * highlighted inline instead of this version's fields rendering plain.
   * Omitted (or null) for Version 1, which has nothing to compare against. */
  previous?: DocumentImportRow | null;
}) {
  // Collapsed by default even when there's only one — an officer shouldn't
  // be greeted with a wall of imported-document text before they've even
  // looked at the rest of the profile.
  const [open, setOpen] = useState(false);

  let snapshot: DocumentImportPrefill | null = null;
  try {
    snapshot = JSON.parse(row.snapshotJson);
  } catch {
    snapshot = null;
  }
  if (!snapshot) return null;

  let previousSnapshot: DocumentImportPrefill | null = null;
  if (previous) {
    try {
      previousSnapshot = JSON.parse(previous.snapshotJson);
    } catch {
      previousSnapshot = null;
    }
  }
  const diff = diffDocumentSnapshots(snapshot, previousSnapshot);
  const changeCount = countChanges(diff);
  const allDiffLines = diff
    ? [
        ...diff.addresses,
        ...diff.vehicles,
        ...diff.associates,
        ...diff.backgroundParagraphs,
      ]
    : [];
  const hasAdded = allDiffLines.some(l => l.status === "added");
  const hasRemoved = allDiffLines.some(l => l.status === "removed");
  const hasChanged = allDiffLines.some(l => l.status === "changed");

  const { firstNames, surname } = snapshot.identity;
  const name =
    firstNames.trim() && surname.trim()
      ? `${firstNames.trim()} ${surname.trim().toUpperCase()}`
      : "";
  const background = snapshot.background.trim();

  // Plain (undecorated) fallbacks for when there's nothing to diff against
  // — same lines diff.addresses/vehicles/associates would otherwise carry,
  // just all "unchanged" so they render with no highlight at all.
  const addressLines: DiffLine[] =
    diff?.addresses ??
    [snapshot.address, ...snapshot.extraAddresses]
      .map(a => composeAddress(a).full)
      .filter(Boolean)
      .map(text => ({ text, status: "unchanged" as const }));
  const vehicleLines: DiffLine[] =
    diff?.vehicles ??
    [snapshot.vehicle, ...snapshot.extraVehicles]
      .map(v => composeVehicle(v).full)
      .filter(Boolean)
      .map(text => ({ text, status: "unchanged" as const }));
  const associateLines: DiffLine[] =
    diff?.associates ??
    snapshot.associates
      .map(a => composeAssociateName(a.identity, a.address.businessName).name)
      .filter(Boolean)
      .map(text => ({ text, status: "unchanged" as const }));
  const backgroundParagraphLines: DiffLine[] =
    diff?.backgroundParagraphs ??
    reflowNarrativeText(background)
      .split("\n\n")
      .map(p => p.trim())
      .filter(Boolean)
      .map(text => ({ text, status: "unchanged" as const }));

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/10 transition-colors"
      >
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30 shrink-0">
          <FileText className="w-3.5 h-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground truncate min-w-0">
              Imported for{" "}
              {subject || name || row.targetName || "Unknown target"}
            </p>
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 ${
                isCurrent
                  ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              Version {version}
              {isCurrent ? " · Current" : ""}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            Uploaded {formatImportDate(row.uploadedAt)}
            {row.uploadedByCIN ? ` · CIN ${row.uploadedByCIN}` : ""}
            {row.sourceFileName ? ` · ${row.sourceFileName}` : ""}
            {changeCount > 0 && (
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                {" "}
                · {changeCount} change{changeCount !== 1 ? "s" : ""} since V
                {version - 1}
              </span>
            )}
          </p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-3 text-xs">
          <p className="text-[10.5px] text-muted-foreground italic">
            Shown exactly as parsed from the uploaded document — not the
            target's current live details, which may have been edited since.
          </p>
          <div>
            <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Name
            </p>
            <p className="text-foreground">{name || "—"}</p>
          </div>
          {addressLines.length > 0 && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Address{addressLines.length > 1 ? "es" : ""}
              </p>
              <div className="space-y-0.5">
                {addressLines.map((line, i) => (
                  <p
                    key={i}
                    className={`font-mono text-foreground flex items-baseline gap-1.5 px-1.5 -mx-1.5 rounded ${diffLineClasses(line.status)}`}
                  >
                    <DiffMarker status={line.status} />
                    <span>{formatIntelAddress(line.text)}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
          {vehicleLines.length > 0 && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Vehicle{vehicleLines.length > 1 ? "s" : ""}
              </p>
              <div className="space-y-0.5">
                {vehicleLines.map((line, i) => (
                  <p
                    key={i}
                    className={`font-mono text-foreground flex items-baseline gap-1.5 px-1.5 -mx-1.5 rounded ${diffLineClasses(line.status)}`}
                  >
                    <DiffMarker status={line.status} />
                    <span>{formatIntelVehicle(line.text)}</span>
                    {line.status === "changed" && line.wasText && (
                      <span className="font-sans text-[10px] text-muted-foreground line-through">
                        was {formatIntelVehicle(line.wasText)}
                      </span>
                    )}
                  </p>
                ))}
              </div>
            </div>
          )}
          {associateLines.length > 0 && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Associates mentioned
              </p>
              <div className="flex flex-wrap gap-1.5">
                {associateLines.map((line, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                      line.status === "unchanged"
                        ? "bg-muted text-foreground"
                        : diffLineClasses(line.status)
                    }`}
                  >
                    <DiffMarker status={line.status} />
                    {line.text}
                    {line.note && (
                      <span className="italic text-muted-foreground/70 text-[10px]">
                        {line.note}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {backgroundParagraphLines.length > 0 && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Background
              </p>
              <div className="space-y-1.5">
                {backgroundParagraphLines.map((line, i) => (
                  <p
                    key={i}
                    className={`whitespace-pre-wrap text-foreground flex items-baseline gap-1.5 px-1.5 -mx-1.5 rounded ${line.status === "added" ? diffLineClasses("added") : ""}`}
                  >
                    <DiffMarker status={line.status} />
                    <span>{line.text}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
          {changeCount > 0 && (
            <div className="flex flex-wrap gap-3 text-[10.5px] text-muted-foreground pt-2 mt-1 border-t border-border/30">
              {hasAdded && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />
                  Added since Version {version - 1}
                </span>
              )}
              {hasRemoved && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />
                  Removed since Version {version - 1}
                </span>
              )}
              {hasChanged && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-amber-500 inline-block" />
                  Changed since Version {version - 1}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
