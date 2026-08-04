import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import {
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Users,
  Sparkles,
  MapPin,
  CheckSquare,
} from "lucide-react";

// ─── Week helpers (Monday-start, UTC-anchored — same convention as the Op
// Manager weekly tasking board) ─────────────────────────────────────────────
function getMondayOfWeek(date: Date): string {
  const utc = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc.toISOString().slice(0, 10);
}
function addWeeks(weekStart: string, n: number): string {
  const d = new Date(weekStart + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}
function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00Z");
  const end = new Date(weekStart + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(d)} – ${fmt(end)}`;
}

// ─── PDF export ─────────────────────────────────────────────────────────────
// Same visual language as the Running Sheet Summary / Intelligence Profile
// exports: dark-blue cover-header banner, light-blue section headers,
// PROTECTED page marking — see SheetSummary.tsx's exportSummaryToPDF for the
// shared convention this mirrors.
function exportWeeklyActivityToPDF(params: {
  weekLabel: string;
  operations: {
    operationName: string;
    sheetsCount: number;
    rowsCount: number;
    officers: string[];
  }[];
  newIntelligence: {
    operationName: string;
    newImages: number;
    newLocations: string[];
    newVehicles: string[];
  }[];
  targetActivity: {
    targetName: string;
    operationName: string;
    locations: { label: string; count: number }[];
  }[];
  governanceCompleted: number;
}): boolean {
  const {
    weekLabel,
    operations,
    newIntelligence,
    targetActivity,
    governanceCompleted,
  } = params;
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

  const section = (title: string, bodyHtml: string) =>
    bodyHtml
      ? `<div class="section"><div class="section-title">${esc(title)}</div><div class="section-body">${bodyHtml}</div></div>`
      : "";

  const operationsHtml = operations.length
    ? `<table class="summary-table">
        <thead><tr><th>Operation</th><th style="width:70px">Sheets</th><th style="width:70px">Rows</th><th>Officers</th></tr></thead>
        <tbody>${operations
          .map(
            o =>
              `<tr><td>${esc(o.operationName)}</td><td>${o.sheetsCount}</td><td>${o.rowsCount}</td><td>${esc(o.officers.join(", ") || "—")}</td></tr>`
          )
          .join("")}</tbody>
      </table>`
    : `<p class="muted-note">No operational activity recorded this week.</p>`;

  const intelHtml = newIntelligence.length
    ? newIntelligence
        .map(
          i => `<div class="intel-op">
            <p class="intel-op-title">${esc(i.operationName)}</p>
            <div class="detail-grid">
              ${i.newImages ? `<div class="detail-label">New images</div><div class="detail-value">${i.newImages}</div>` : ""}
              ${i.newLocations.length ? `<div class="detail-label">New locations</div><div class="detail-value">${esc(i.newLocations.join(", "))}</div>` : ""}
              ${i.newVehicles.length ? `<div class="detail-label">New vehicles</div><div class="detail-value">${esc(i.newVehicles.join(", "))}</div>` : ""}
            </div>
          </div>`
        )
        .join("")
    : `<p class="muted-note">No newly-identified intelligence this week.</p>`;

  const targetHtml = targetActivity.length
    ? targetActivity
        .map(
          t => `<div class="intel-op">
            <p class="intel-op-title">${esc(t.targetName)} <span class="muted-note">— ${esc(t.operationName)}</span></p>
            <table class="summary-table">
              <thead><tr><th>Location</th><th style="width:90px">Visits</th></tr></thead>
              <tbody>${t.locations.map(l => `<tr><td>${esc(l.label)}</td><td>${l.count}</td></tr>`).join("")}</tbody>
            </table>
          </div>`
        )
        .join("")
    : `<p class="muted-note">No observed target activity this week.</p>`;

  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>RunLog Weekly Activity Report — ${esc(weekLabel)}</title>
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
.page-frame { width:100%; border-collapse:collapse; }
.page-frame td { padding:0; border:none; }
tfoot { display:table-footer-group; }
.content { padding:20px 32px 8px; }
.section { margin-bottom:14px; border:1px solid ${GREY_BORDER}; border-radius:8px; overflow:hidden; break-inside:avoid; page-break-inside:avoid; }
.section-title { font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:7px 14px; background:${BLUE_LIGHT} !important; border-bottom:1px solid ${GREY_BORDER}; }
.section-body { padding:12px 14px; }
.intel-op { margin-bottom:12px; break-inside:avoid; }
.intel-op:last-child { margin-bottom:0; }
.intel-op-title { font-size:11px; font-weight:700; margin-bottom:6px; }
.detail-grid { display:grid; grid-template-columns:130px 1fr; gap:0; font-size:10.5px; }
.detail-grid > div { padding:4px 6px; }
.detail-grid > div:nth-child(4n+1), .detail-grid > div:nth-child(4n+2) { background:#f8fafc; }
.detail-label { color:#64748b; font-weight:600; }
.detail-value { color:${GREY_TEXT}; }
.muted-note { font-size:10px; color:#94a3b8; font-style:italic; }
.summary-table { width:100%; border-collapse:collapse; border:1px solid ${GREY_BORDER}; margin-top:4px; }
.summary-table th { background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; font-weight:700; font-size:9.5px; text-transform:uppercase; letter-spacing:0.04em; text-align:left; padding:5px 8px; border-bottom:2px solid ${BLUE_DARK}; }
.summary-table td { vertical-align:top; font-size:10.5px; padding:5px 8px; border-bottom:1px solid ${GREY_BORDER}; }
.summary-table tbody tr:last-child td { border-bottom:none; }
.footer-note { margin:14px 32px 0; padding:12px 0; border-top:1px solid ${GREY_BORDER}; font-size:9px; color:#94a3b8; }
.footer-band { background:${BLUE_DARK} !important; color:#fff !important; padding:8px 32px; display:grid; grid-template-columns:1fr 1fr 1fr; align-items:center; font-size:9px; font-weight:700; letter-spacing:0.04em; }
.footer-band span:first-child { text-align:left; }
.footer-band span:last-child { text-align:right; color:rgba(255,255,255,0.85); text-transform:uppercase; }
.footer-protected { text-align:center; font-weight:800; letter-spacing:0.14em; color:#f87171; text-transform:uppercase; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .section-title { background:${BLUE_LIGHT} !important; } .summary-table th { background:${BLUE_LIGHT} !important; } .footer-band { background:${BLUE_DARK} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-row"><div class="brand-dot"></div><span class="brand-label">RunLog</span></div>
  <div class="main-title">Weekly Activity Report</div>
  <div class="op-date-line">${esc(weekLabel)}</div>
</div>
<table class="page-frame">
<tfoot><tr><td>
  <div class="footer-band">
    <span></span>
    <span class="footer-protected">Protected</span>
    <span>RunLog</span>
  </div>
</td></tr></tfoot>
<tbody><tr><td>
<div class="content">
  ${section("Operations & Coverage", operationsHtml)}
  ${section("New Intelligence Gathered", intelHtml)}
  ${section("Target Activity — Locations Observed", targetHtml)}
  ${section(
    "Governance",
    `<div class="detail-grid"><div class="detail-label">Sheets completed</div><div class="detail-value">${governanceCompleted}</div></div>`
  )}
  <div class="footer-note">
    <span>Generated: ${generatedAt}</span>
  </div>
</div>
</td></tr></tbody>
</table>
${buildExportPreviewCloseBar()}
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function WeeklyActivityReportPage() {
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()));
  const weekLabel = useMemo(() => formatWeekLabel(weekStart), [weekStart]);

  const { data, isLoading } = trpc.reports.weeklyActivity.useQuery({
    weekStart,
  });

  const handleExport = () => {
    if (!data) return;
    const ok = exportWeeklyActivityToPDF({
      weekLabel,
      operations: data.operations,
      newIntelligence: data.newIntelligence,
      targetActivity: data.targetActivity,
      governanceCompleted: data.governanceCompleted,
    });
    if (!ok) {
      // Popup blocked — same failure mode/messaging as every other export in the app.
      alert("Pop-up blocked. Please allow pop-ups and try again.");
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-slate-400" />
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Weekly Activity Report
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                What the unit did this week
              </p>
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={!data || isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Export PDF
          </button>
        </div>

        {/* Week nav */}
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-card/60 border border-border/60">
          <button
            onClick={() => setWeekStart(w => addWeeks(w, -1))}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground flex-1 text-center">
            {weekLabel}
          </span>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekStart(getMondayOfWeek(new Date()))}
            className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent transition-colors"
          >
            This Week
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            Loading report…
          </div>
        )}

        {!isLoading && data && (
          <div className="flex flex-col gap-6">
            {/* Operations & Coverage */}
            <section className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
                <FileText className="h-4 w-4 text-blue-700" />
                <h2 className="text-sm font-semibold text-foreground">
                  Operations & Coverage
                </h2>
              </div>
              <div className="p-4">
                {data.operations.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No operational activity recorded this week.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.operations.map(op => (
                      <div
                        key={op.operationId}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background/50 border border-border/50"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {op.operationName}
                          </p>
                          {op.officers.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="text-xs text-muted-foreground truncate">
                                {op.officers.join(", ")}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-4 shrink-0">
                          <div className="text-center">
                            <p className="text-sm font-bold text-foreground">
                              {op.sheetsCount}
                            </p>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">
                              sheets
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-foreground">
                              {op.rowsCount}
                            </p>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">
                              rows
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* New Intelligence Gathered */}
            <section className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
                <Sparkles className="h-4 w-4 text-violet-400" />
                <h2 className="text-sm font-semibold text-foreground">
                  New Intelligence Gathered
                </h2>
              </div>
              <div className="p-4">
                {data.newIntelligence.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No newly-identified intelligence this week.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {data.newIntelligence.map(intel => (
                      <div
                        key={intel.operationId}
                        className="px-3 py-2.5 rounded-lg bg-background/50 border border-border/50"
                      >
                        <p className="text-sm font-medium text-foreground mb-1.5">
                          {intel.operationName}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {intel.newImages > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 font-medium">
                              {intel.newImages} new image
                              {intel.newImages !== 1 ? "s" : ""}
                            </span>
                          )}
                          {intel.newLocations.map(l => (
                            <span
                              key={l}
                              className="text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium"
                            >
                              {l}
                            </span>
                          ))}
                          {intel.newVehicles.map(v => (
                            <span
                              key={v}
                              className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 font-medium"
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Target Activity */}
            <section className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
                <MapPin className="h-4 w-4 text-red-400" />
                <h2 className="text-sm font-semibold text-foreground">
                  Target Activity — Locations Observed
                </h2>
              </div>
              <div className="p-4">
                {data.targetActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No observed target activity this week.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {data.targetActivity.map(t => (
                      <div
                        key={t.targetId}
                        className="px-3 py-2.5 rounded-lg bg-background/50 border border-border/50"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {t.targetName}
                          <span className="text-xs text-muted-foreground font-normal">
                            {" "}
                            — {t.operationName}
                          </span>
                        </p>
                        <div className="flex flex-col gap-1 mt-1.5">
                          {t.locations.map(l => (
                            <div
                              key={l.label}
                              className="flex items-center justify-between text-xs"
                            >
                              <span className="text-muted-foreground truncate">
                                {l.label}
                              </span>
                              <span className="font-bold text-foreground tabular-nums shrink-0 ml-2">
                                {l.count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Governance */}
            <section className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card/60 border border-border/60">
              <CheckSquare className="h-4 w-4 text-green-400" />
              <span className="text-sm font-semibold text-foreground">
                {data.governanceCompleted}
              </span>
              <span className="text-xs text-muted-foreground">
                running sheet{data.governanceCompleted !== 1 ? "s" : ""}{" "}
                completed governance this week
              </span>
            </section>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
