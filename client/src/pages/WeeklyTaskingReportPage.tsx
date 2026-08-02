import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Download,
  ListOrdered,
  CalendarDays,
  ShieldAlert,
  AlertCircle,
} from "lucide-react";

// ─── Week helpers (Monday-start, UTC-anchored — same convention as the Op
// Manager weekly tasking board and the Weekly Activity Report) ──────────────
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
function addDaysUTC(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
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
function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

const DAY_ROW_LABEL: Record<string, string> = {
  surv1: "Team 1",
  surv2: "Team 2",
  ptt: "PTT",
  cap: "Capability",
};

// ─── PDF export ─────────────────────────────────────────────────────────────
// Same visual language as the Running Sheet Summary / Weekly Activity Report
// exports: dark-blue cover-header banner, light-blue section headers,
// PROTECTED page marking — see SheetSummary.tsx's exportSummaryToPDF for the
// shared convention this mirrors.
function exportWeeklyTaskingToPDF(params: {
  weekLabel: string;
  weekStart: string;
  priorityRows: {
    category: string;
    priority: number;
    operationName: string | null;
    team: string | null;
    requestType: string | null;
  }[];
  taskingCells: {
    dayIndex: number;
    teamRow: string;
    shiftTime: string | null;
    primaryTask: string | null;
    secondaryTask: string | null;
  }[];
  atRiskDays: { date: string; teams: string[] }[];
  outstandingTodos: { cin: string; name: string; totalCount: number }[];
}): boolean {
  const {
    weekLabel,
    weekStart,
    priorityRows,
    taskingCells,
    atRiskDays,
    outstandingTodos,
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

  const priorityHtml = priorityRows.length
    ? `<table class="summary-table">
        <thead><tr><th style="width:40px">#</th><th>Category</th><th>Operation</th><th>Team</th><th>Request</th></tr></thead>
        <tbody>${priorityRows
          .map(
            r =>
              `<tr><td>${r.priority}</td><td>${esc(r.category)}</td><td>${esc(r.operationName ?? "—")}</td><td>${esc(r.team ?? "—")}</td><td>${esc(r.requestType ?? "—")}</td></tr>`
          )
          .join("")}</tbody>
      </table>`
    : `<p class="muted-note">No priority tasking posted for this week.</p>`;

  const taskingByDay: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDaysUTC(weekStart, i);
    const dayCells = taskingCells.filter(c => c.dayIndex === i);
    if (!dayCells.length) continue;
    const rows = dayCells
      .map(
        c =>
          `<tr><td>${esc(DAY_ROW_LABEL[c.teamRow] ?? c.teamRow)}</td><td>${esc(c.shiftTime ?? "—")}</td><td>${esc(c.primaryTask ?? "—")}</td><td>${esc(c.secondaryTask ?? "—")}</td></tr>`
      )
      .join("");
    taskingByDay.push(
      `<div class="intel-op"><p class="intel-op-title">${esc(formatDayLabel(date))}</p><table class="summary-table"><thead><tr><th>Team</th><th style="width:80px">Shift</th><th>Primary Task</th><th>Secondary Task</th></tr></thead><tbody>${rows}</tbody></table></div>`
    );
  }
  const taskingHtml = taskingByDay.length
    ? taskingByDay.join("")
    : `<p class="muted-note">No tasking cells posted for this week.</p>`;

  const deployHtml = atRiskDays.length
    ? `<table class="summary-table">
        <thead><tr><th>Date</th><th>Below-minimum teams</th></tr></thead>
        <tbody>${atRiskDays
          .map(
            d =>
              `<tr><td>${esc(formatDayLabel(d.date))}</td><td>${esc(d.teams.join(", "))}</td></tr>`
          )
          .join("")}</tbody>
      </table>`
    : `<p class="muted-note">No days below minimum team coverage this week.</p>`;

  const todosHtml = outstandingTodos.length
    ? `<table class="summary-table">
        <thead><tr><th>CIN</th><th>Officer</th><th style="width:90px">Outstanding</th></tr></thead>
        <tbody>${outstandingTodos
          .map(
            u =>
              `<tr><td>${esc(u.cin)}</td><td>${esc(u.name)}</td><td>${u.totalCount}</td></tr>`
          )
          .join("")}</tbody>
      </table>`
    : `<p class="muted-note">No outstanding governance actions.</p>`;

  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>RunLog Weekly Tasking Report — ${esc(weekLabel)}</title>
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
  <div class="main-title">Weekly Tasking Report</div>
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
  ${section("Priority Tasking", priorityHtml)}
  ${section("Day-by-Day Tasking", taskingHtml)}
  ${section("Deployability Risk", deployHtml)}
  ${section("Outstanding Governance Actions", todosHtml)}
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
export default function WeeklyTaskingReportPage() {
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()));
  const weekLabel = useMemo(() => formatWeekLabel(weekStart), [weekStart]);

  const { data, isLoading } = trpc.reports.weeklyTasking.useQuery({
    weekStart,
  });

  const atRiskDays = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, string[]>();
    for (const d of data.deployability) {
      if (d.deployable) continue;
      if (!byDate.has(d.date)) byDate.set(d.date, []);
      byDate.get(d.date)!.push(d.teamName);
    }
    return Array.from(byDate.entries())
      .map(([date, teams]) => ({ date, teams }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    const ok = exportWeeklyTaskingToPDF({
      weekLabel,
      weekStart,
      priorityRows: data.priorityRows,
      taskingCells: data.taskingCells,
      atRiskDays,
      outstandingTodos: data.outstandingTodos,
    });
    if (!ok) {
      alert("Pop-up blocked. Please allow pop-ups and try again.");
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-5 w-5 text-slate-400" />
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Weekly Tasking Report
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                What the unit can do next week
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
            {/* Priority Tasking */}
            <section className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
                <ListOrdered className="h-4 w-4 text-blue-700" />
                <h2 className="text-sm font-semibold text-foreground">
                  Priority Tasking
                </h2>
              </div>
              <div className="p-4">
                {data.priorityRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No priority tasking posted for this week.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.priorityRows.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background/50 border border-border/50"
                      >
                        <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">
                          #{r.priority}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {r.operationName ?? "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.category}
                            {r.team ? ` · ${r.team}` : ""}
                            {r.requestType ? ` · ${r.requestType}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Day-by-Day Tasking */}
            <section className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
                <CalendarDays className="h-4 w-4 text-teal-400" />
                <h2 className="text-sm font-semibold text-foreground">
                  Day-by-Day Tasking
                </h2>
              </div>
              <div className="p-4">
                {data.taskingCells.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No tasking cells posted for this week.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const date = addDaysUTC(weekStart, i);
                      const dayCells = data.taskingCells.filter(
                        c => c.dayIndex === i
                      );
                      if (!dayCells.length) return null;
                      return (
                        <div key={i}>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                            {formatDayLabel(date)}
                          </p>
                          <div className="flex flex-col gap-1.5">
                            {dayCells.map((c, ci) => (
                              <div
                                key={ci}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-background/50 border border-border/50"
                              >
                                <span className="text-xs font-semibold text-foreground w-24 shrink-0">
                                  {DAY_ROW_LABEL[c.teamRow] ?? c.teamRow}
                                </span>
                                {c.shiftTime && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/60 text-muted-foreground shrink-0">
                                    {c.shiftTime}
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground truncate">
                                  {c.primaryTask ?? "—"}
                                  {c.secondaryTask
                                    ? ` · ${c.secondaryTask}`
                                    : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Deployability Risk */}
            <section className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
                <ShieldAlert className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-foreground">
                  Deployability Risk
                </h2>
              </div>
              <div className="p-4">
                {atRiskDays.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No days below minimum team coverage this week.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {atRiskDays.map(d => (
                      <div
                        key={d.date}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background/50 border border-red-500/30"
                      >
                        <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        <span className="text-sm font-medium text-foreground w-32 shrink-0">
                          {formatDayLabel(d.date)}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {d.teams.map(t => (
                            <span
                              key={t}
                              className="text-[10px] px-1.5 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 font-medium"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Outstanding Governance Actions */}
            <section className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <h2 className="text-sm font-semibold text-foreground">
                  Outstanding Governance Actions
                </h2>
              </div>
              <div className="p-4">
                {data.outstandingTodos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No outstanding governance actions.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.outstandingTodos.map(u => (
                      <div
                        key={u.cin}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background/50 border border-border/50"
                      >
                        <span className="text-sm font-medium text-foreground w-16 shrink-0">
                          {u.cin}
                        </span>
                        <span className="text-xs text-muted-foreground flex-1 truncate">
                          {u.name}
                        </span>
                        <span className="text-sm font-bold text-foreground tabular-nums shrink-0">
                          {u.totalCount}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
