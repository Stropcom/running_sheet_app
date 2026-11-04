import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface CtoTaskingExportData {
  /** "02 Nov – 08 Nov 2026" */
  weekLabel: string;
  /** Monday, YYYY-MM-DD — for the dates over the calendar columns. */
  weekStart: string;
  onCall: { name: string; phone: string | null }[];
  /** CTO Inspector, PTT, Team 1, Team 2: name "" when nobody is set. */
  supervisors: { role: string; name: string; phone: string | null }[];
  priority: {
    category: string;
    operation: string;
    team: string;
    requestType: string;
  }[];
  /** One row per team: its label, colour and seven days (Mon first). */
  calendar: {
    label: string;
    colour: string;
    days: { shift: string; primary: string; secondary: string }[];
  }[];
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayHeading(weekStart: string, i: number): string {
  const d = new Date(weekStart + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + i);
  return `${DAY_NAMES[i]} ${String(d.getUTCDate()).padStart(2, "0")} ${d.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })}`;
}

/** The CTO Weekly Tasking as a printable page — the same shell as the other
 * report exports (navy cover band, PROTECTED header and footer, the shared
 * Close Preview / Print bar): supervisors and contacts, the priority board and
 * the weekly tasking calendar, in landscape so the seven days fit. */
export function buildCtoTaskingHtml(data: CtoTaskingExportData): string {
  const BLUE_DARK = "#1e3a8a";
  const BLUE_MID = "#93c5fd";
  const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT = "#1e293b";
  const GREY_BORDER = "#e2e8f0";
  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const person = (name: string, phone: string | null) =>
    `${name ? `<b>${esc(name)}</b>` : `<span class="dash">—</span>`}${phone ? ` <span class="phone">${esc(phone)}</span>` : ""}`;

  const onCallHtml = data.onCall.length
    ? data.onCall.map(o => `<div>${person(o.name, o.phone)}</div>`).join("")
    : `<span class="dash">Not set</span>`;
  const supHtml = (list: CtoTaskingExportData["supervisors"]) =>
    list
      .map(
        s =>
          `<div class="sup"><span class="sup-role">${esc(s.role)}</span>${person(s.name, s.phone)}</div>`
      )
      .join("");
  // The page shows CTO Inspector and PTT in the middle, Team 1 and Team 2 on
  // the right.
  const middleHtml = supHtml(data.supervisors.slice(0, 2));
  const rightHtml = supHtml(data.supervisors.slice(2));

  const priorityHtml = data.priority.length
    ? `<table class="grid"><thead><tr><th style="width:36px">#</th><th style="width:90px">Category</th><th>Operation</th><th style="width:120px">Team</th><th>Request type</th></tr></thead><tbody>${data.priority
        .map(
          (r, i) =>
            `<tr><td>${i + 1}</td><td>${esc(r.category)}</td><td><b>${esc(r.operation) || "—"}</b></td><td>${esc(r.team) || "—"}</td><td>${esc(r.requestType) || "—"}</td></tr>`
        )
        .join("")}</tbody></table>`
    : `<p class="note">No priorities set for this week.</p>`;

  const calendarHtml = `<table class="grid cal"><thead><tr><th style="width:84px"></th>${DAY_NAMES.map((_, i) => `<th class="day">${esc(dayHeading(data.weekStart, i))}</th>`).join("")}</tr></thead><tbody>${data.calendar
    .map(
      team =>
        `<tr><td class="team" style="color:${team.colour} !important;border-left:4px solid ${team.colour}">${esc(team.label)}</td>${team.days
          .map(
            d =>
              `<td class="cell${d.shift === "RDO" ? " rdo" : ""}">${d.shift ? `<div class="shift" style="color:${d.shift === "RDO" ? "#94a3b8" : team.colour} !important">${esc(d.shift)}</div>` : ""}${d.primary ? `<div class="primary">${esc(d.primary)}</div>` : ""}${d.secondary ? `<div class="secondary">${esc(d.secondary)}</div>` : ""}</td>`
          )
          .join("")}</tr>`
    )
    .join("")}</tbody></table>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RunLog CTO Weekly Tasking — ${esc(data.weekLabel)}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
@page { size:A4 landscape; margin:14mm 12mm; @top-center { content:'PROTECTED'; font-family:'Roboto',sans-serif; font-size:12px; font-weight:700; color:#dc2626; letter-spacing:0.08em } @bottom-center { content:"Page " counter(page) " of " counter(pages); font-family:'Roboto',sans-serif; font-size:11px; font-weight:700; color:${BLUE_DARK}; letter-spacing:0.04em } }
body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.5; color:${GREY_TEXT}; background:#fff; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:12px 28px 10px; text-align:center; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID} !important; margin-bottom:4px; }
.main-title { font-size:20px; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; line-height:1.2; }
.week-line { font-size:13px; font-weight:600; margin-top:3px; }
.content { padding:10px 0 4px; }
.section { margin-bottom:8px; }
tr { break-inside:avoid; }
.section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin-bottom:8px; }
.contacts { display:grid; grid-template-columns:1fr 1fr 1fr; border:1px solid ${GREY_BORDER}; border-radius:6px; }
.contacts > div { padding:8px 12px; }
.contacts > div + div { border-left:1px solid ${GREY_BORDER}; }
.label { font-size:9px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#64748b; margin-bottom:3px; }
.sup { display:flex; align-items:baseline; gap:8px; padding:2px 0; }
.sup-role { width:96px; flex:none; font-size:9px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:#64748b; }
.phone { color:#475569; margin-left:4px; }
.dash { color:#94a3b8; }
.note { font-size:10px; color:#64748b; font-style:italic; padding:6px 2px; }
.grid { width:100%; border-collapse:collapse; border:1px solid ${GREY_BORDER}; }
.grid th { background:#f8fafc !important; color:${BLUE_DARK} !important; font-size:9.5px; text-transform:uppercase; letter-spacing:0.04em; text-align:left; padding:5px 8px; border-bottom:2px solid ${BLUE_DARK}; }
.grid td { vertical-align:top; padding:4px 8px; border-bottom:1px solid ${GREY_BORDER}; font-size:10.5px; }
.cal { table-layout:fixed; }
.cal th.day { text-align:center; border-left:1px solid ${GREY_BORDER}; }
.cal td.cell { border-left:1px solid ${GREY_BORDER}; height:48px; }
.cal td.team { font-weight:800; font-size:11px; background:#f8fafc !important; }
.shift { font-weight:800; font-size:10.5px; }
.primary { margin-top:2px; font-weight:600; }
.secondary { color:#64748b; }
.rdo { opacity:0.55; }
.footer-note { margin-top:10px; padding-top:8px; border-top:1px solid ${GREY_BORDER}; font-size:9px; color:#94a3b8; }
</style></head><body>
<div class="cover-header">
  <div class="brand-label">RunLog</div>
  <div class="main-title">CTO Weekly Tasking</div>
  <div class="week-line">${esc(data.weekLabel)}</div>
</div>
<div class="content">
  <div class="section">
    <div class="section-title">Supervisors &amp; Contacts</div>
    <div class="contacts">
      <div><div class="label">On-Call</div>${onCallHtml}</div>
      <div><div class="label">Supervisors</div>${middleHtml}</div>
      <div><div class="label">&nbsp;</div>${rightHtml}</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Priority Board</div>
    ${priorityHtml}
  </div>
  <div class="section">
    <div class="section-title">Weekly Tasking Calendar</div>
    ${calendarHtml}
  </div>
  <div class="footer-note">Generated: ${esc(generatedAt)}</div>
</div>
${buildExportPreviewCloseBar()}
</body></html>`;
}
