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

export function ImportedDocumentCard({
  row,
  version,
  isCurrent,
  subject,
}: {
  row: DocumentImportRow;
  version: number;
  isCurrent: boolean;
  // Overrides the default "Imported for {name}" subject — the Operation
  // profile (grouped by target) leaves this unset to show the parsed
  // name/target name; the Target profile (grouped by operation) passes the
  // operation's name instead, since the target itself is already known.
  subject?: string;
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

  const { firstNames, surname } = snapshot.identity;
  const name =
    firstNames.trim() && surname.trim()
      ? `${firstNames.trim()} ${surname.trim().toUpperCase()}`
      : "";
  const address = composeAddress(snapshot.address).full;
  const vehicle = composeVehicle(snapshot.vehicle).full;
  const extraAddresses = snapshot.extraAddresses
    .map(a => composeAddress(a).full)
    .filter(Boolean);
  const extraVehicles = snapshot.extraVehicles
    .map(v => composeVehicle(v).full)
    .filter(Boolean);
  const associateNames = snapshot.associates
    .map(a => composeAssociateName(a.identity, a.address.businessName).name)
    .filter(Boolean);
  const background = snapshot.background.trim();

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
          {(address || extraAddresses.length > 0) && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Address{extraAddresses.length > 0 ? "es" : ""}
              </p>
              <div className="space-y-0.5">
                {address && (
                  <p className="font-mono text-foreground">
                    {formatIntelAddress(address)}
                  </p>
                )}
                {extraAddresses.map((a, i) => (
                  <p key={i} className="font-mono text-foreground">
                    {formatIntelAddress(a)}
                  </p>
                ))}
              </div>
            </div>
          )}
          {(vehicle || extraVehicles.length > 0) && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Vehicle{extraVehicles.length > 0 ? "s" : ""}
              </p>
              <div className="space-y-0.5">
                {vehicle && (
                  <p className="font-mono text-foreground">
                    {formatIntelVehicle(vehicle)}
                  </p>
                )}
                {extraVehicles.map((v, i) => (
                  <p key={i} className="font-mono text-foreground">
                    {formatIntelVehicle(v)}
                  </p>
                ))}
              </div>
            </div>
          )}
          {associateNames.length > 0 && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Associates mentioned
              </p>
              <div className="flex flex-wrap gap-1.5">
                {associateNames.map((n, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-foreground"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
          {background && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Background
              </p>
              <p className="whitespace-pre-wrap text-foreground">
                {background}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
