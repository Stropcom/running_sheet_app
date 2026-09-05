import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import { LinkedEntityPills } from "@/components/LinkedEntityPills";
import {
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  Users,
  Clock,
  Phone,
  Briefcase,
  ListChecks,
  AlertTriangle,
  Target,
  Sparkles,
  MapPin,
  Image as ImageIcon,
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
/** "2026-09-02" -> "Wed 2 Sept" — for the day chips under Deployment. */
function formatDayChip(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt
    .toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    })
    .replace(",", "");
}

// ─── Types mirroring server/db.ts's WeeklyActivityReport ──────────────────
interface TargetBlock {
  targetId: number | null;
  targetName: string | null;
  officers: string[];
  teamLabel: string | null;
  days: string[];
  coverageHours: number | null;
  investigator: string | null;
  intelSupport: string | null;
  contacted: string | null;
  specialProjects: { key: string; detail: string | null }[];
  objectives: string[];
  criticalDecisions: { date: string | null; text: string }[];
  issues: { date: string | null; text: string }[];
  targetActivity: { label: string; count: number }[];
  newIntel: {
    persons: string[];
    vehicles: string[];
    locations: string[];
    images: {
      attachmentId: number;
      url: string;
      createdAt: string | Date;
      linkedEntities: { category: string; label: string }[];
    }[];
  };
}
interface OperationBlock {
  operationId: number;
  operationName: string;
  sheetsCount: number;
  rowsCount: number;
  targets: TargetBlock[];
}

// ─── PDF export ─────────────────────────────────────────────────────────────
// Same visual language as the Running Sheet Summary / Intelligence Profile
// exports: dark-blue cover-header banner, light-blue section headers,
// PROTECTED page marking — see SheetSummary.tsx's exportSummaryToPDF for the
// shared convention this mirrors.
function exportWeeklyActivityToPDF(params: {
  weekLabel: string;
  operations: OperationBlock[];
}): boolean {
  const { weekLabel, operations } = params;
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

  const targetBlockHtml = (t: TargetBlock): string => {
    const deployHtml = `
      ${t.officers.length ? `<div class="detail-label">Officers</div><div class="detail-value">${esc(t.officers.join(", "))}</div>` : ""}
      <div class="team-row">
        ${t.teamLabel ? `<span class="team-pill">${esc(t.teamLabel)}</span>` : ""}
        ${t.days.map(d => `<span class="day-chip">${esc(formatDayChip(d))}</span>`).join("")}
        ${t.coverageHours ? `<span class="coverage-total">~${t.coverageHours}h coverage</span>` : ""}
      </div>`;

    const liaisonParts = [
      t.investigator
        ? `<div class="liaison-item"><span>Investigator</span>${esc(t.investigator)}</div>`
        : "",
      t.intelSupport
        ? `<div class="liaison-item"><span>Intel support</span>${esc(t.intelSupport)}</div>`
        : "",
      t.contacted
        ? `<div class="liaison-item"><span>Contacted</span>${esc(t.contacted)}</div>`
        : "",
    ].filter(Boolean);
    const liaisonHtml = liaisonParts.length
      ? `<div class="liaison-row">${liaisonParts.join("")}</div>`
      : `<p class="muted-note">None recorded.</p>`;

    const projectsHtml = t.specialProjects.length
      ? `<div class="chip-row">${t.specialProjects.map(p => `<span class="chip chip-project"><strong>${esc(p.key)}</strong>${p.detail ? ` — ${esc(p.detail)}` : ""}</span>`).join("")}</div>`
      : `<p class="muted-note">None recorded.</p>`;

    const objectivesHtml = t.objectives.length
      ? `<ol class="numbered-list">${t.objectives.map(o => `<li>${esc(o)}</li>`).join("")}</ol>`
      : `<p class="muted-note">None recorded.</p>`;

    const decisionsHtml = t.criticalDecisions.length
      ? `<ol class="numbered-list">${t.criticalDecisions.map(d => `<li>${d.date ? `<strong>${esc(formatDayChip(d.date))}</strong> — ` : ""}${esc(d.text)}</li>`).join("")}</ol>`
      : `<p class="muted-note">None recorded.</p>`;

    const issuesHtml = t.issues.length
      ? t.issues
          .map(
            i =>
              `<div class="issue-line">${i.date ? `<span class="issue-date">${esc(formatDayChip(i.date))}</span>` : ""}<span>${esc(i.text)}</span></div>`
          )
          .join("")
      : `<p class="muted-note">None recorded.</p>`;

    const targetActivityHtml = t.targetActivity.length
      ? `<table class="summary-table"><thead><tr><th>Location</th><th style="width:90px">Visits</th></tr></thead><tbody>${t.targetActivity.map(l => `<tr><td>${esc(l.label)}</td><td>${l.count}</td></tr>`).join("")}</tbody></table>`
      : `<p class="muted-note">No observed target activity this week.</p>`;

    const hasIntel =
      t.newIntel.persons.length ||
      t.newIntel.vehicles.length ||
      t.newIntel.locations.length ||
      t.newIntel.images.length;
    const intelHtml = hasIntel
      ? `
        ${t.newIntel.persons.length ? `<div class="intel-sub-label">Persons</div><div class="chip-row">${t.newIntel.persons.map(p => `<span class="chip chip-person">${esc(p)}</span>`).join("")}</div>` : ""}
        ${t.newIntel.vehicles.length ? `<div class="intel-sub-label">Vehicles</div><div class="chip-row">${t.newIntel.vehicles.map(v => `<span class="chip chip-vehicle">${esc(v)}</span>`).join("")}</div>` : ""}
        ${t.newIntel.locations.length ? `<div class="intel-sub-label">Locations</div><div class="chip-row">${t.newIntel.locations.map(l => `<span class="chip chip-location">${esc(l)}</span>`).join("")}</div>` : ""}
        ${
          t.newIntel.images.length
            ? `<div class="intel-sub-label">Images</div><div class="image-grid">${t.newIntel.images
                .map(
                  img => `<div class="image-card">
                    <img class="image-thumb" src="${esc(img.url)}" />
                    ${
                      img.linkedEntities.length
                        ? `<div class="entity-pills">${img.linkedEntities.map(e => `<span class="entity-pill">${esc(e.label)}</span>`).join("")}</div>`
                        : ""
                    }
                  </div>`
                )
                .join("")}</div>`
            : ""
        }`
      : `<p class="muted-note">No newly-identified intelligence this week.</p>`;

    const targetHeaderHtml = t.targetName
      ? `<div class="target-subhead"><span class="tgt-label">Target</span><span class="tgt-name">${esc(t.targetName)}</span></div>`
      : "";

    return `<div class="target-block">
      ${targetHeaderHtml}
      ${section("Deployment", deployHtml)}
      ${section("Investigator & Liaison", liaisonHtml)}
      ${section("Special Projects", projectsHtml)}
      ${section("Objectives This Week", objectivesHtml)}
      ${section("Critical Decisions", decisionsHtml)}
      ${section("Issues Raised", issuesHtml)}
      ${section("Target Activity — Locations Observed", targetActivityHtml)}
      ${section("New Intelligence Gathered", intelHtml)}
    </div>`;
  };

  const opsHtml = operations.length
    ? operations
        .map(
          op => `<div class="op-card">
            <div class="op-head">
              <div class="op-name">${esc(op.operationName)}</div>
              <div class="op-stats">
                <div class="op-stat"><b>${op.sheetsCount}</b><span>Sheets</span></div>
                <div class="op-stat"><b>${op.rowsCount}</b><span>Rows</span></div>
              </div>
            </div>
            ${op.targets.length ? op.targets.map(targetBlockHtml).join("") : `<div class="target-block"><p class="muted-note" style="padding:14px 24px">No activity recorded this week.</p></div>`}
          </div>`
        )
        .join("")
    : `<p class="muted-note">No operational activity recorded this week.</p>`;

  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>RunLog Weekly Surveillance Report — ${esc(weekLabel)}</title>
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
.op-card { margin-bottom:16px; border:1px solid ${GREY_BORDER}; border-radius:8px; overflow:hidden; }
.op-card:not(:first-child) { break-before:page; page-break-before:always; }
.op-head { display:flex; align-items:baseline; justify-content:space-between; padding:10px 16px; background:#f8fafc; border-bottom:1px solid ${GREY_BORDER}; }
.op-name { font-size:13px; font-weight:800; letter-spacing:0.03em; color:${BLUE_DARK} !important; }
.op-stats { display:flex; gap:14px; }
.op-stat { text-align:center; }
.op-stat b { display:block; font-size:12px; font-weight:800; color:${GREY_TEXT}; }
.op-stat span { font-size:8px; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; }
.target-block { border-bottom:4px solid #f1f5f9; }
.target-block:last-child { border-bottom:none; }
.target-subhead { display:flex; align-items:center; gap:8px; padding:7px 16px; background:#eef2ff !important; border-bottom:1px solid #e0e7ff; }
.tgt-label { font-size:7.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#4338ca !important; background:#e0e7ff !important; border-radius:4px; padding:1px 5px; }
.tgt-name { font-size:11px; font-weight:700; color:#312e81 !important; }
.section { margin:0; padding:8px 16px; border-bottom:1px solid ${GREY_BORDER}; break-inside:avoid; }
.target-block:last-child .section:last-child { border-bottom:none; }
.section-title { font-size:8.5px; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:${BLUE_DARK} !important; margin-bottom:5px; }
.section-body { }
.detail-label { color:#64748b; font-weight:600; font-size:9px; text-transform:uppercase; letter-spacing:0.03em; }
.detail-value { color:${GREY_TEXT}; font-size:10.5px; margin-top:1px; margin-bottom:6px; }
.team-row { display:flex; flex-wrap:wrap; align-items:center; gap:5px; margin-top:4px; }
.team-pill { font-size:9.5px; font-weight:700; padding:2px 8px; border-radius:999px; background:#eef2ff !important; color:#4338ca !important; border:1px solid #c7d2fe; }
.day-chip { font-size:9.5px; font-weight:600; padding:2px 8px; border-radius:999px; background:#f1f5f9 !important; color:#64748b !important; border:1px solid ${GREY_BORDER}; }
.coverage-total { font-size:9.5px; font-weight:700; padding:2px 8px; border-radius:999px; background:#f0fdf4 !important; color:#15803d !important; border:1px solid #bbf7d0; margin-left:auto; }
.liaison-row { display:flex; gap:16px; flex-wrap:wrap; }
.liaison-item { font-size:10.5px; }
.liaison-item span { display:block; font-size:8.5px; text-transform:uppercase; color:#94a3b8; }
.chip-row { display:flex; flex-wrap:wrap; gap:5px; }
.chip { font-size:9.5px; font-weight:600; padding:3px 8px; border-radius:999px; border:1px solid; }
.chip-project { color:#0369a1 !important; background:#e0f2fe !important; border-color:#7dd3fc; }
.chip-person { color:#a21caf !important; background:#fae8ff !important; border-color:#f0abfc; }
.chip-vehicle { color:#b45309 !important; background:#fef3c7 !important; border-color:#fcd34d; }
.chip-location { color:#047857 !important; background:#d1fae5 !important; border-color:#6ee7b7; }
.numbered-list { margin:0; padding-left:16px; font-size:10.5px; }
.numbered-list li { margin-bottom:3px; }
.issue-line { display:flex; gap:6px; font-size:10.5px; padding:5px 8px; background:#fef2f2 !important; border:1px solid #fecaca; border-radius:6px; color:#7f1d1d !important; margin-bottom:4px; }
.issue-line:last-child { margin-bottom:0; }
.issue-date { font-weight:700; color:#b91c1c !important; white-space:nowrap; }
.intel-sub-label { font-size:8.5px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em; margin:7px 0 3px; }
.intel-sub-label:first-child { margin-top:0; }
.image-grid { display:flex; flex-wrap:wrap; gap:8px; }
.image-card { width:84px; }
.image-thumb { width:84px; height:84px; object-fit:cover; border-radius:6px 6px 0 0; border:1px solid ${GREY_BORDER}; display:block; }
.entity-pills { display:flex; flex-direction:column; gap:2px; padding:4px; background:#f1f5f9 !important; border:1px solid ${GREY_BORDER}; border-top:none; border-radius:0 0 6px 6px; }
.entity-pill { font-size:7.5px; font-weight:700; padding:1px 6px; border-radius:999px; background:#059669 !important; color:#fff !important; text-align:center; }
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
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .footer-band { background:${BLUE_DARK} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-row"><div class="brand-dot"></div><span class="brand-label">RunLog</span></div>
  <div class="main-title">Weekly Surveillance Report</div>
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
  ${opsHtml}
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

// ─── Shared bits for the on-screen render ──────────────────────────────────
function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "project" | "person" | "vehicle" | "location";
}) {
  const toneClass = {
    project: "border-sky-500/30 bg-sky-500/10 text-sky-400",
    person: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400",
    vehicle: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    location: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  }[tone];
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${toneClass}`}
    >
      {label ? `${label}: ` : ""}
      {value}
    </span>
  );
}

function SectionRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 border-b border-border/50 last:border-b-0">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3 w-3 text-blue-700" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function TargetBlockView({ t }: { t: TargetBlock }) {
  const hasIntel =
    t.newIntel.persons.length ||
    t.newIntel.vehicles.length ||
    t.newIntel.locations.length ||
    t.newIntel.images.length;

  return (
    <div className="border-b-4 border-muted/40 last:border-b-0">
      {t.targetName && (
        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border-b border-indigo-500/20">
          <Target className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-wide text-indigo-400/80">
            Target
          </span>
          <span className="text-sm font-semibold text-foreground truncate">
            {t.targetName}
          </span>
        </div>
      )}

      <SectionRow icon={Clock} label="Deployment">
        {t.officers.length > 0 && (
          <p className="text-xs text-muted-foreground mb-2">
            <span className="font-semibold text-foreground">Officers: </span>
            {t.officers.join(", ")}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {t.teamLabel && (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
              {t.teamLabel}
            </span>
          )}
          {t.days.map(d => (
            <span
              key={d}
              className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border"
            >
              {formatDayChip(d)}
            </span>
          ))}
          {t.coverageHours !== null && (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/30 ml-auto">
              ~{t.coverageHours}h coverage
            </span>
          )}
        </div>
      </SectionRow>

      <SectionRow icon={Phone} label="Investigator & Liaison">
        {t.investigator || t.intelSupport || t.contacted ? (
          <div className="flex flex-wrap gap-4 text-xs">
            {t.investigator && (
              <div>
                <p className="text-[9px] uppercase text-muted-foreground">
                  Investigator
                </p>
                <p className="text-foreground">{t.investigator}</p>
              </div>
            )}
            {t.intelSupport && (
              <div>
                <p className="text-[9px] uppercase text-muted-foreground">
                  Intel support
                </p>
                <p className="text-foreground">{t.intelSupport}</p>
              </div>
            )}
            {t.contacted && (
              <div>
                <p className="text-[9px] uppercase text-muted-foreground">
                  Contacted
                </p>
                <p className="text-foreground">{t.contacted}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">None recorded.</p>
        )}
      </SectionRow>

      <SectionRow icon={Briefcase} label="Special Projects">
        {t.specialProjects.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {t.specialProjects.map((p, i) => (
              <span
                key={`${p.key}-${i}`}
                className="text-[10px] px-2 py-0.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 font-medium"
              >
                <b>{p.key}</b>
                {p.detail ? ` — ${p.detail}` : ""}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">None recorded.</p>
        )}
      </SectionRow>

      <SectionRow icon={ListChecks} label="Objectives This Week">
        {t.objectives.length > 0 ? (
          <ol className="list-decimal list-inside flex flex-col gap-1 text-xs text-foreground">
            {t.objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-muted-foreground italic">None recorded.</p>
        )}
      </SectionRow>

      <SectionRow icon={AlertTriangle} label="Critical Decisions">
        {t.criticalDecisions.length > 0 ? (
          <ol className="list-decimal list-inside flex flex-col gap-1 text-xs text-foreground">
            {t.criticalDecisions.map((d, i) => (
              <li key={i}>
                {d.date && (
                  <span className="font-semibold">
                    {formatDayChip(d.date)} —{" "}
                  </span>
                )}
                {d.text}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-muted-foreground italic">None recorded.</p>
        )}
      </SectionRow>

      <SectionRow icon={AlertTriangle} label="Issues Raised">
        {t.issues.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {t.issues.map((iss, i) => (
              <div
                key={i}
                className="flex gap-2 items-start text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400"
              >
                {iss.date && (
                  <span className="font-bold shrink-0">
                    {formatDayChip(iss.date)}
                  </span>
                )}
                <span>{iss.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">None recorded.</p>
        )}
      </SectionRow>

      <SectionRow icon={MapPin} label="Target Activity — Locations Observed">
        {t.targetActivity.length > 0 ? (
          <div className="flex flex-col gap-1">
            {t.targetActivity.map(l => (
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
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No observed target activity this week.
          </p>
        )}
      </SectionRow>

      <SectionRow icon={Sparkles} label="New Intelligence Gathered">
        {hasIntel ? (
          <div className="flex flex-col gap-2.5">
            {t.newIntel.persons.length > 0 && (
              <div>
                <p className="text-[9px] uppercase text-muted-foreground mb-1">
                  Persons
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {t.newIntel.persons.map(p => (
                    <StatPill key={p} label="" value={p} tone="person" />
                  ))}
                </div>
              </div>
            )}
            {t.newIntel.vehicles.length > 0 && (
              <div>
                <p className="text-[9px] uppercase text-muted-foreground mb-1">
                  Vehicles
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {t.newIntel.vehicles.map(v => (
                    <StatPill key={v} label="" value={v} tone="vehicle" />
                  ))}
                </div>
              </div>
            )}
            {t.newIntel.locations.length > 0 && (
              <div>
                <p className="text-[9px] uppercase text-muted-foreground mb-1">
                  Locations
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {t.newIntel.locations.map(l => (
                    <StatPill key={l} label="" value={l} tone="location" />
                  ))}
                </div>
              </div>
            )}
            {t.newIntel.images.length > 0 && (
              <div>
                <p className="text-[9px] uppercase text-muted-foreground mb-1 flex items-center gap-1">
                  <ImageIcon className="h-2.5 w-2.5" /> Images
                </p>
                <div className="flex flex-wrap gap-2">
                  {t.newIntel.images.map(img => (
                    <div
                      key={img.attachmentId}
                      className="w-[92px] rounded-lg overflow-hidden border border-border"
                    >
                      <img
                        src={img.url}
                        alt=""
                        className="w-full h-[92px] object-cover"
                      />
                      <LinkedEntityPills entities={img.linkedEntities} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No newly-identified intelligence this week.
          </p>
        )}
      </SectionRow>
    </div>
  );
}

// Closed by default — an officer opens the operation(s) they actually want
// to read on screen. This only affects the on-screen accordion state; the
// PDF export builds its own HTML straight from the query data (see
// exportWeeklyActivityToPDF above), so every operation is always fully
// expanded there regardless of what's collapsed on screen.
function OperationCard({ op }: { op: OperationBlock }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors text-left ${expanded ? "border-b border-border/60" : ""}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <h2 className="text-sm font-bold text-foreground truncate">
            {op.operationName}
          </h2>
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
            <p className="text-sm font-bold text-foreground">{op.rowsCount}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">
              rows
            </p>
          </div>
        </div>
      </button>
      {expanded &&
        (op.targets.length > 0 ? (
          op.targets.map((t, i) => (
            <TargetBlockView key={t.targetId ?? `none-${i}`} t={t} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No activity recorded this week.
          </p>
        ))}
    </section>
  );
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
                Weekly Surveillance Report
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
          <div className="flex flex-col gap-4">
            {data.operations.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-card/60 p-8 text-center">
                <Users className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No operational activity recorded this week.
                </p>
              </div>
            ) : (
              data.operations.map(op => (
                <OperationCard key={op.operationId} op={op} />
              ))
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
