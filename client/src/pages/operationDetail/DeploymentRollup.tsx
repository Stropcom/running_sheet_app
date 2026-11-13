// Part of the operation page (client/src/pages/OperationDetail.tsx): the Deployment Summaries tab (the roll-up of the operation's sheets, and its PDF).
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import {
  SUMMARY_DISCLAIMER,
  SUMMARY_DISCLAIMER_CSS,
} from "@shared/summaryDisclaimer";
import { issuesToShow } from "@shared/summaryIssues";
import { SheetIntelReadOnly } from "@/components/SheetIntelReadOnly";
import { SHEET_INTEL_PDF_CSS } from "@/lib/sheetIntelPdf";
import { trpc } from "@/lib/trpc";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import {
  buildRollupSheetBlocksHtml,
  parseRollupJsonArray,
  type RollupExportRow,
} from "@/lib/rollupSection";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewMode } from "@/contexts/ViewModeContext";
import { History, ArrowUpDown, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, type ReactNode } from "react";
import {} from "date-fns";
import { toast } from "sonner";
import { perthDateISO } from "@shared/runningSheetTitle";

// ── Deployment Rollup ────────────────────────────────────────────────────────
// A chronological (newest-first) read view over every running sheet's
// Supervisor Summary for this operation — lets a supervisor scan how a
// deployment has progressed across 20-50+ sheets without opening each one.

export function DeploymentRollupPanel({
  operationId,
  targets,
}: {
  operationId: number;
  targets?: { id: number; name: string }[];
}) {
  const { viewMode } = useViewMode();
  const [targetFilter, setTargetFilter] = useState<number | null>(null);
  // Server returns newest-first (same direction the Running Sheets tab
  // lists sheets in); this just reverses that array for a chronological,
  // oldest-first read — no extra round-trip needed.
  const [sortAsc, setSortAsc] = useState(false);
  // Accordion — opening a card closes whichever one was open before it, so
  // only one is expanded at a time while stepping through a deployment.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const toggleExpanded = (sheetId: number) => {
    setExpandedId(prev => (prev === sheetId ? null : sheetId));
  };

  const { data: rows, isLoading } = trpc.summary.listByOperation.useQuery({
    operationId,
    targetId: targetFilter,
  });
  const displayRows = sortAsc && rows ? [...rows].reverse() : rows;

  const showTargetFilter = (targets?.length ?? 0) > 1;

  return (
    <div className="flex flex-col gap-4">
      {showTargetFilter && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Target
          </label>
          <Select
            value={targetFilter ? String(targetFilter) : "all"}
            onValueChange={v => setTargetFilter(v === "all" ? null : Number(v))}
          >
            <SelectTrigger className="h-8 w-[220px] text-sm">
              <SelectValue placeholder="All targets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All targets</SelectItem>
              {targets?.map(t => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl">
          <History className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground max-w-sm">
            No Supervisor Summaries yet. Once a running sheet's Summary tab has
            been opened, it will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {rows.length} summar{rows.length !== 1 ? "ies" : "y"}
            </p>
            <button
              onClick={() => setSortAsc(v => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1 rounded-md border border-border hover:border-border bg-background hover:bg-muted/40"
            >
              <ArrowUpDown className="w-3 h-3" />
              {sortAsc ? "Oldest first" : "Newest first"}
            </button>
          </div>
          <div
            className={
              viewMode === "tile"
                ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
                : "flex flex-col gap-3"
            }
          >
            {(displayRows ?? []).map(r => (
              <DeploymentRollupCard
                key={r.sheetId}
                row={r}
                expanded={expandedId === r.sheetId}
                onToggle={() => toggleExpanded(r.sheetId)}
                gridSpan={viewMode === "tile" && expandedId === r.sheetId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Shape returned by summary.listByOperation — kept local since it's only
// consumed here.
type RollupRow = {
  sheetId: number;
  sheetDate: string | null;
  createdAt: Date | string;
  targetName: string | null;
  teamLabel: string | null;
  teamCins: string | null;
  startTime: string | null;
  finishTime: string | null;
  location: string | null;
  ioSupport: string | null;
  intelSupport: string | null;
  ioContactTiming: string | null;
  ioContactMethod: string | null;
  objectives: string | null;
  specialProjects: string | null;
  criticalDecisions: string | null;
  issues: string | null;
  completedAt: number | null;
};

// ── Rollup PDF export ────────────────────────────────────────────────────────
// Same dark-blue-banner / light-blue-section visual language as the
// Supervisor Summary export (SheetSummary.tsx's exportSummaryToPDF) — every
// row here is that same set of sections (Deployment/Vehicle/Investigator/
// Special Projects/Objectives/Critical Decisions/Issues/Summary/New Intelligence), just one
// block per sheet with a page break between sheets instead of one sheet at
// a time.
export function buildRollupExportPdf(params: {
  operationName: string;
  targetName: string | null;
  rows: RollupExportRow[];
}) {
  const { operationName, targetName, rows } = params;
  const esc = (s: string | null | undefined) =>
    (s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const BLUE_DARK = "#1e3a8a";
  const BLUE_MID = "#93c5fd";
  const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT = "#1e293b";
  const GREY_BORDER = "#e2e8f0";

  const sheetBlocks = buildRollupSheetBlocksHtml(rows);

  const scopeLine = targetName ? `Target: ${targetName}` : "All targets";
  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>RunLog Deployment Summaries — ${esc(operationName)}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
@page{ margin:20mm 15mm; @top-center{content:'PROTECTED';font-family:'Roboto',sans-serif;font-size:12px;font-weight:700;color:#dc2626;letter-spacing:0.08em} @bottom-center{content:"Page " counter(page) " of " counter(pages);font-family:'Roboto',sans-serif;font-size:11px;font-weight:700;color:${BLUE_DARK};letter-spacing:0.04em} }
body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:26px 32px 22px; text-align:center; }
.brand-row { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:14px; opacity:0.85; }
.brand-dot { width:10px; height:10px; border-radius:50%; background:${BLUE_MID}; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID}; }
.main-title { font-size:26px; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; line-height:1.2; }
.op-date-line { font-size:16px; font-weight:600; margin-top:8px; }
.sheet-name { font-size:11px; opacity:0.65; margin-top:6px; }
.sheet-block { border-top:6px solid ${BLUE_DARK}; }
.sheet-header { padding:16px 32px 10px; }
.sheet-header-main { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.sheet-date { font-size:15px; font-weight:700; color:${GREY_TEXT}; }
.sheet-chip { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; padding:3px 8px; border-radius:5px; background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; border:1px solid ${BLUE_MID}; }
.sheet-time { font-size:11px; color:#64748b; }
.sheet-target { font-size:11px; font-weight:700; color:${GREY_TEXT}; margin-top:4px; }
.status-pill{display:inline-flex;align-items:center;padding:3px 10px;border-radius:9999px;font-size:9px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;margin-left:auto}
.status-complete{background:#dcfce7 !important;color:#15803d !important;border:1px solid #86efac}
.status-open{background:#fef3c7 !important;color:#92400e !important;border:1px solid #fcd34d}
.content { padding:8px 32px 26px; }
.section { margin-bottom:14px; border:1px solid ${GREY_BORDER}; border-radius:8px; overflow:hidden; break-inside:avoid; page-break-inside:avoid; }
.section-title { font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:7px 14px; background:${BLUE_LIGHT} !important; border-bottom:1px solid ${GREY_BORDER}; }
.section-body { padding:12px 14px; }
.page-break { page-break-before:always; break-before:page; }
.detail-grid { display:grid; grid-template-columns:130px 1fr; gap:0; font-size:10.5px; }
.detail-grid > div { padding:4px 6px; }
.detail-grid > div:nth-child(4n+1), .detail-grid > div:nth-child(4n+2) { background:#f8fafc; }
.detail-label { color:#64748b; font-weight:600; }
.detail-value { color:${GREY_TEXT}; }
.chip-list { display:flex; flex-wrap:wrap; gap:6px; }
.chip { background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; border:1px solid ${BLUE_MID}; border-radius:6px; padding:4px 10px; font-size:10px; font-weight:600; }
.chip-detail { font-weight:400; color:#475569; }
.numbered-list { list-style:none; counter-reset:item; }
.numbered-list li { counter-increment:item; display:flex; align-items:flex-start; gap:8px; margin-bottom:7px; font-size:10.5px; }
.numbered-list li:last-child { margin-bottom:0; }
.numbered-list li::before { content:counter(item); flex-shrink:0; width:16px; height:16px; border-radius:50%; background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; font-size:9px; font-weight:700; display:flex; align-items:center; justify-content:center; margin-top:1px; }
.muted-note { font-size:10px; color:#94a3b8; font-style:italic; }
${SHEET_INTEL_PDF_CSS}
${SUMMARY_DISCLAIMER_CSS}
.summary-table { width:100%; border-collapse:collapse; border:1.5px solid ${BLUE_DARK}; }
.summary-table th { background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; font-weight:700; font-size:9.5px; text-transform:uppercase; letter-spacing:0.04em; text-align:left; padding:6px 8px; border-bottom:2px solid ${BLUE_DARK}; border-right:1px solid #c7d5ee; }
.summary-table th:last-child, .summary-table td:last-child { border-right:none; }
.summary-table td { vertical-align:top; font-size:10.5px; padding:6px 8px; border-bottom:1px solid ${GREY_BORDER}; border-right:1px solid ${GREY_BORDER}; }
.summary-table tbody tr:last-child td { border-bottom:none; }
.footer-band { background:${BLUE_DARK} !important; color:#fff !important; padding:8px 32px; display:grid; grid-template-columns:1fr 1fr 1fr; align-items:center; font-size:9px; font-weight:700; letter-spacing:0.04em; }
.footer-band span:first-child { text-align:left; }
.footer-band span:last-child { text-align:right; color:rgba(255,255,255,0.85); text-transform:uppercase; }
.footer-protected { text-align:center; font-weight:800; letter-spacing:0.14em; color:#f87171; text-transform:uppercase; }
.footer-note { margin:14px 32px 0; padding:12px 0 20px; border-top:1px solid ${GREY_BORDER}; font-size:9px; color:#94a3b8; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .section-title { background:${BLUE_LIGHT} !important; } .chip { background:${BLUE_LIGHT} !important; } .numbered-list li::before { background:${BLUE_LIGHT} !important; } .summary-table th { background:${BLUE_LIGHT} !important; } .footer-band { background:${BLUE_DARK} !important; } .sheet-chip { background:${BLUE_LIGHT} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-row"><div class="brand-dot"></div><span class="brand-label">RunLog</span></div>
  <div class="main-title">Deployment Summaries</div>
  <div class="op-date-line">${esc(operationName)}</div>
  <div class="sheet-name">${esc(scopeLine)} &middot; ${rows.length} summar${rows.length !== 1 ? "ies" : "y"}</div>
</div>
<div class="disclaimer">${esc(SUMMARY_DISCLAIMER)}</div>
${sheetBlocks}
<div class="footer-note">${esc(SUMMARY_DISCLAIMER)}<br>Generated: ${generatedAt}</div>
<div class="footer-band"><span></span><span class="footer-protected">Protected</span><span>RunLog</span></div>
${buildExportPreviewCloseBar()}
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Pop-up blocked. Please allow pop-ups and try again.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
}

function RollupDetailRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value || !value.trim()) return null;
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </>
  );
}

function RollupSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-1.5 bg-primary/5 border-b border-border">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">
          {title}
        </span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/**
 * "7 August 26" — card-only date format, distinct from formatRollupDate's
 * "07-08-2026" (still used by the PDF export and Intel Packages page).
 * sheetDate (when present) is a plain "yyyy-MM-dd" string with no time
 * component — parsed via Date.UTC rather than round-tripping through a
 * local-timezone-sensitive `new Date(ymd)` so the displayed day can't shift.
 */
function formatRollupCardDate(
  sheetDate: string | null,
  createdAt: Date | string
): string {
  const ymd = sheetDate ?? perthDateISO(new Date(createdAt));
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDate();
  const month = date.toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return `${day} ${month} ${String(y).slice(-2)}`;
}

function DeploymentRollupCard({
  row: r,
  expanded,
  onToggle,
  gridSpan = false,
}: {
  row: RollupRow;
  expanded: boolean;
  onToggle: () => void;
  /** Tile view only — expanded cards span the full grid width so the
   *  detailed content below isn't squeezed into a single narrow column. */
  gridSpan?: boolean;
}) {
  const objectives = parseRollupJsonArray<string>(r.objectives).filter(o =>
    o.trim()
  );
  const specialProjects = parseRollupJsonArray<{ key: string; detail: string }>(
    r.specialProjects
  );
  const criticalDecisions = parseRollupJsonArray<string>(
    r.criticalDecisions
  ).filter(c => c.trim());
  const issues = issuesToShow(r.issues);

  const { data: entries, isLoading: entriesLoading } =
    trpc.summary.getEntries.useQuery(
      { sheetId: r.sheetId },
      { enabled: expanded }
    );
  const { data: vehicles, isLoading: vehiclesLoading } =
    trpc.summary.getVehicles.useQuery(
      { sheetId: r.sheetId },
      { enabled: expanded }
    );
  const { data: intel, isLoading: intelLoading } =
    trpc.summary.getIntel.useQuery(
      { sheetId: r.sheetId },
      { enabled: expanded }
    );

  const communicationParts = [r.ioContactTiming, r.ioContactMethod].filter(
    (p): p is string => !!p && !!p.trim()
  );

  return (
    <div
      className={`rounded-xl border border-border bg-card overflow-hidden${gridSpan ? " sm:col-span-2 xl:col-span-3" : ""}`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 hover:bg-accent/20 transition-colors"
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
              />
              <span className="text-base font-semibold text-foreground">
                {formatRollupCardDate(r.sheetDate, r.createdAt)}
              </span>
            </div>
            {r.teamLabel && (
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                {r.teamLabel}
              </span>
            )}
          </div>
          {(r.targetName || r.startTime || r.finishTime) && (
            <div className="pl-6 flex flex-col gap-0.5">
              {r.targetName && (
                <p className="text-sm font-bold text-foreground">
                  {r.targetName}
                </p>
              )}
              {(r.startTime || r.finishTime) && (
                <span className="text-sm text-muted-foreground">
                  {r.startTime ?? "?"}–{r.finishTime ?? "?"}
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2.5 border-t border-border pt-3">
          <RollupSection title="Deployment">
            <div className="grid grid-cols-[130px_1fr] gap-y-1.5 text-xs">
              <RollupDetailRow label="Team" value={r.teamLabel} />
              <RollupDetailRow label="Team Members CIN" value={r.teamCins} />
              <RollupDetailRow label="Start time" value={r.startTime} />
              <RollupDetailRow label="Finish time" value={r.finishTime} />
              <RollupDetailRow label="Target (TGT)" value={r.targetName} />
              <RollupDetailRow label="Location" value={r.location} />
            </div>
          </RollupSection>

          <RollupSection title="Vehicle">
            {vehiclesLoading ? (
              <Skeleton className="h-5 w-40" />
            ) : vehicles && vehicles.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {vehicles.map(v => (
                  <span
                    key={v.key}
                    className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-medium"
                  >
                    {v.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No vehicles found in the Target Registry or running sheet text.
              </p>
            )}
          </RollupSection>

          <RollupSection title="Investigator">
            {r.ioSupport?.trim() ||
            r.intelSupport?.trim() ||
            communicationParts.length ? (
              <div className="grid grid-cols-[130px_1fr] gap-y-1.5 text-xs">
                <RollupDetailRow label="Investigator" value={r.ioSupport} />
                {communicationParts.length > 0 && (
                  <RollupDetailRow
                    label="Contacted"
                    value={communicationParts.join(" — ")}
                  />
                )}
                <RollupDetailRow label="Intel Support" value={r.intelSupport} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                None recorded.
              </p>
            )}
          </RollupSection>

          <RollupSection title="Special Projects">
            {specialProjects.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {specialProjects.map(p => (
                  <span
                    key={p.key}
                    className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20"
                  >
                    <strong>{p.key}</strong>
                    {p.detail?.trim() && (
                      <span className="font-normal"> — {p.detail}</span>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                None recorded.
              </p>
            )}
          </RollupSection>

          <RollupSection title="Objectives">
            {objectives.length > 0 ? (
              <ol className="list-decimal list-inside space-y-1 text-xs text-foreground">
                {objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                None recorded.
              </p>
            )}
          </RollupSection>

          <RollupSection title="Critical Decisions">
            {criticalDecisions.length > 0 ? (
              <ol className="list-decimal list-inside space-y-1 text-xs text-foreground">
                {criticalDecisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                None recorded.
              </p>
            )}
          </RollupSection>

          <RollupSection title="Issues">
            {issues.length > 0 ? (
              <ol className="list-decimal list-inside space-y-1 text-xs text-foreground">
                {issues.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                None recorded.
              </p>
            )}
          </RollupSection>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-primary mb-1.5 px-1">
              Summary
            </div>
            {entriesLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : entries && entries.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-primary/5 border-b border-border">
                      <th className="text-left font-bold uppercase tracking-wide text-xs text-primary px-2 py-1.5 w-[64px]">
                        Time
                      </th>
                      <th className="text-left font-bold uppercase tracking-wide text-xs text-primary px-2 py-1.5 w-[26%]">
                        Address
                      </th>
                      <th className="text-left font-bold uppercase tracking-wide text-xs text-primary px-2 py-1.5">
                        Observation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr
                        key={e.id}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="align-top px-2 py-1.5 text-muted-foreground">
                          {e.time || "—"}
                        </td>
                        <td className="align-top px-2 py-1.5 text-muted-foreground">
                          {e.location || ""}
                        </td>
                        <td className="align-top px-2 py-1.5 text-foreground">
                          {e.text}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic px-1">
                No running sheet rows yet.
              </p>
            )}
          </div>

          <RollupSection title="New Intelligence">
            {intelLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : intel ? (
              <SheetIntelReadOnly data={intel} />
            ) : (
              <p className="text-xs text-muted-foreground italic">
                None recorded.
              </p>
            )}
          </RollupSection>
        </div>
      )}
    </div>
  );
}
