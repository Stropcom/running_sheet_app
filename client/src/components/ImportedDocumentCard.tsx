import { useState } from "react";
import {
  FileText,
  ChevronDown,
  Target,
  Home,
  Car,
  Users,
  FolderOpen,
  Eye,
} from "lucide-react";
import { DocumentViewerModal } from "@/components/DocumentViewerModal";
import {
  formatIntelAddress,
  formatIntelVehicle,
  composeAddress,
  composeVehicle,
  composeAssociateName,
} from "@/lib/addressFormat";
import type { DocumentImportPrefill } from "@/components/ImportTargetDocumentDialog";
import { groupNarrativeIntoSections } from "@/lib/textFormat";
import { VEHICLES_HEADING_RE, LOCATION_HEADING_RE } from "@shared/textSections";
import {
  diffDocumentSnapshots,
  countChanges,
  type DiffLine,
  type DiffSection,
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
  /** Storage URL for the original uploaded file's bytes, if this import
   * captured them (see server/routers.ts's target.registry.create) — lets
   * the officer re-view the actual PDF/DOCX, not just its parsed fields.
   * Null for imports made before this existed. */
  sourceFileUrl?: string | null;
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
  const [viewerOpen, setViewerOpen] = useState(false);

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
        ...diff.backgroundSections.flatMap(s => s.paragraphs),
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
  // A section whose heading is the document's own "VEHICLES" or "LOCATION
  // OF INTEREST"/"ADDRESSES" label is the exact same content already shown
  // above in the structured Vehicle(s)/Address(es) list — the raw document
  // text just repeats it under its own original heading. Dropping it here
  // avoids showing the officer the same vehicles/addresses twice.
  const backgroundSections: DiffSection[] = (
    diff?.backgroundSections ??
    groupNarrativeIntoSections(background).map(section => ({
      heading: section.heading,
      paragraphs: section.paragraphs.map(text => ({
        text,
        status: "unchanged" as const,
      })),
    }))
  ).filter(
    s =>
      s.paragraphs.length > 0 &&
      !(
        s.heading &&
        (VEHICLES_HEADING_RE.test(s.heading) ||
          LOCATION_HEADING_RE.test(s.heading))
      )
  );

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
          {row.sourceFileUrl && (
            <div className="rounded-lg border border-l-4 border-slate-500/30 border-l-slate-500 bg-slate-500/5 p-3">
              <p className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <FolderOpen className="w-3 h-3" />
                Original document
              </p>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-500/30 bg-card shrink-0">
                  <FileText className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">
                    {row.sourceFileName || "Document"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {/\.pdf$/i.test(row.sourceFileName || "")
                      ? "PDF document"
                      : "Word document"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewerOpen(true)}
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-500/30 bg-card hover:bg-slate-500/10 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View document
                </button>
              </div>
            </div>
          )}
          <div className="rounded-lg border border-l-4 border-sky-500/30 border-l-sky-500 bg-sky-500/5 p-3">
            <p className="font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wide flex items-center gap-1.5 mb-1">
              <Target className="w-3 h-3" />
              Name
            </p>
            <p className="text-foreground">{name || "—"}</p>
          </div>
          {addressLines.length > 0 && (
            <div className="rounded-lg border border-l-4 border-emerald-500/30 border-l-emerald-500 bg-emerald-500/5 p-3">
              <p className="font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                <Home className="w-3 h-3" />
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
            <div className="rounded-lg border border-l-4 border-amber-500/30 border-l-amber-500 bg-amber-500/5 p-3">
              <p className="font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                <Car className="w-3 h-3" />
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
            <div className="rounded-lg border border-l-4 border-violet-500/30 border-l-violet-500 bg-violet-500/5 p-3">
              <p className="font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                <Users className="w-3 h-3" />
                Associates mentioned
              </p>
              <div className="flex flex-wrap gap-1.5">
                {associateLines.map((line, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                      line.status === "unchanged"
                        ? "bg-background text-foreground"
                        : diffLineClasses(line.status)
                    }`}
                  >
                    <DiffMarker status={line.status} />
                    {line.text}
                    {line.status === "changed" && line.wasText && (
                      <span className="font-sans text-[10px] text-muted-foreground line-through">
                        was {line.wasText}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {backgroundSections.length > 0 && (
            <div className="rounded-lg border border-l-4 border-slate-500/30 border-l-slate-500 bg-slate-500/5 p-3">
              <p className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center gap-1.5 mb-1">
                <FileText className="w-3 h-3" />
                Background
              </p>
              <div className="space-y-2">
                {backgroundSections.map((section, si) => (
                  <div key={si}>
                    {section.heading && (
                      <div className="flex items-center gap-1.5 bg-slate-500/10 border border-slate-500/20 rounded-t-md px-2 py-1">
                        <span className="w-0.5 h-3 rounded-full bg-slate-500 shrink-0" />
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          {section.heading}
                        </span>
                      </div>
                    )}
                    <div
                      className={`space-y-1.5 ${
                        section.heading
                          ? "border border-t-0 border-slate-500/20 rounded-b-md p-2"
                          : ""
                      }`}
                    >
                      {section.paragraphs.map((line, pi) => (
                        <p
                          key={pi}
                          className={`whitespace-pre-wrap text-foreground flex items-baseline gap-1.5 px-1.5 -mx-1.5 rounded ${line.status === "added" ? diffLineClasses("added") : ""}`}
                        >
                          <DiffMarker status={line.status} />
                          <span>{line.text}</span>
                        </p>
                      ))}
                    </div>
                  </div>
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
      {viewerOpen && row.sourceFileUrl && (
        <DocumentViewerModal
          url={row.sourceFileUrl}
          fileName={row.sourceFileName || "Document"}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
