import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import { KIND_PRINT, kindIconSvg } from "@/lib/placeKindPrint";
import {
  PLACE_SOURCE_TEXT,
  WEEKDAY_SHORT,
  formatClock,
  formatDwell,
  placeKindLabel,
  type PlaceSummary,
} from "@shared/placesReport";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PL_CSS = `<style>
.pl-card, .pl-card * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.pl-card { border:1px solid #cbd5e1; border-radius:8px; margin:0 0 9px; break-inside:avoid; background:#fff; }
.pl-top { display:flex; gap:10px; padding:9px 10px; }
.pl-tile { flex:none; width:36px; height:36px; border-radius:9px; border:1.5px solid; display:flex; align-items:center; justify-content:center; }
.pl-main { flex:1; min-width:0; }
.pl-name { font-weight:700; font-size:11.5px; color:#0f172a; }
.pl-pills { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
.pl-pill { display:inline-block; border:1px solid #cbd5e1; border-radius:999px; padding:0 7px; font-size:9px; font-weight:600; line-height:16px; color:#475569; background:#fff; }
.pl-stats { flex:none; display:flex; gap:16px; text-align:right; }
.pl-stat b { display:block; font-size:13px; font-variant-numeric:tabular-nums; color:#0f172a; }
.pl-stat span { font-size:9px; color:#64748b; }
.pl-week { display:flex; gap:3px; align-items:flex-end; margin-top:7px; }
.pl-day { width:19px; text-align:center; font-size:8.5px; color:#64748b; }
.pl-bar { display:flex; height:26px; align-items:flex-end; }
.pl-bar i { display:block; width:100%; border-radius:2px 2px 0 0; }
.pl-usual { margin-top:5px; font-size:10px; color:#64748b; }
.pl-usual b { color:#0f172a; font-weight:600; }
.pl-visits { width:calc(100% - 20px); margin:0 10px 9px; border-collapse:collapse; border-top:1px solid #e2e8f0; }
.pl-visits th { font-size:8.5px; text-transform:uppercase; letter-spacing:0.04em; color:#475569; text-align:left; padding:5px 6px 3px; border:0; }
.pl-visits td { font-size:10px; padding:3px 6px; border-bottom:1px solid #f1f5f9; }
.pl-h { font-size:10px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:#475569; margin:12px 0 6px; }
.pl-sum { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:0 0 12px; }
.pl-tilebox { border:1px solid #cbd5e1; border-radius:8px; padding:7px 9px; background:#fff; min-width:0; }
.pl-tilebox p { font-size:9px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:#475569; }
.pl-tilebox b { display:block; font-size:16px; font-variant-numeric:tabular-nums; color:#0f172a; }
.pl-tilebox span { display:block; font-size:9px; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
</style>`;

function weekBars(week: number[]): string {
  const peak = Math.max(1, ...week);
  return `<div class="pl-week" aria-label="Visits by day">${week
    .map((n, i) => {
      const h = n ? Math.max(4, Math.round((n / peak) * 24)) : 3;
      return `<div class="pl-day"><span class="pl-bar"><i style="height:${h}px;background:${n ? "#166534" : "#e2e8f0"}"></i></span>${WEEKDAY_SHORT[i][0]}</div>`;
    })
    .join("")}</div>`;
}

function placeCard(p: PlaceSummary): string {
  const k = KIND_PRINT[p.kind];
  const kindLabel = placeKindLabel(p.kind);
  const usualDays = p.usualDays.map(d => WEEKDAY_SHORT[d]).join(" · ");
  const pills = [
    `<span class="pl-pill" style="border-color:${k.border};background:${k.bg};color:${k.fg}">${esc(kindLabel)}</span>`,
    p.registeredAs && p.registeredAs !== kindLabel
      ? `<span class="pl-pill" style="color:#1e293b">Registered as ${esc(p.registeredAs)}</span>`
      : "",
    `<span class="pl-pill">${esc(PLACE_SOURCE_TEXT[p.source])}</span>`,
    p.isNew
      ? `<span class="pl-pill" style="border-color:#166534;background:#dcfce7;color:#166534">New this week</span>`
      : "",
    p.noDeparture > 0
      ? `<span class="pl-pill" style="border-color:#fbbf24;background:#fffbeb;color:#78350f">${p.noDeparture} with no departure</span>`
      : "",
  ].join("");
  const visits = p.visits
    .map(
      v =>
        `<tr><td>${esc(v.dateISO)}</td><td>${v.startMinutes !== null ? formatClock(v.startMinutes) : "—"}</td><td>${
          v.endMinutes !== null
            ? formatClock(v.endMinutes) +
              (v.endDayOffset > 0 ? ` +${v.endDayOffset}` : "")
            : "no departure logged"
        }</td><td>${v.dwellMinutes !== null ? esc(formatDwell(v.dwellMinutes)) : "—"}</td></tr>`
    )
    .join("");
  return `<div class="pl-card">
  <div class="pl-top">
    <div class="pl-tile" style="border-color:${k.border};background:${k.bg}">${kindIconSvg(p.kind)}</div>
    <div class="pl-main">
      <div class="pl-name">${esc(p.name)}</div>
      <div class="pl-pills">${pills}</div>
      ${weekBars(p.week)}
      ${p.usualMinutes !== null ? `<div class="pl-usual">Usually <b>${esc(usualDays)}</b> around <b>${formatClock(p.usualMinutes)}</b></div>` : ""}
    </div>
    <div class="pl-stats">
      <div class="pl-stat"><b>${p.visits.length}</b><span>visits</span></div>
      <div class="pl-stat"><b>${p.timedVisits ? esc(formatDwell(p.totalMinutes)) : "—"}</b><span>recorded</span></div>
      <div class="pl-stat"><b>${p.averageMinutes !== null ? esc(formatDwell(p.averageMinutes)) : "—"}</b><span>average stay</span></div>
    </div>
  </div>
  <table class="pl-visits"><thead><tr><th>Date</th><th>Arrived</th><th>Left</th><th>Time there</th></tr></thead><tbody>${visits}</tbody></table>
</div>`;
}

/** The places as cards — the same look as the Places page (kind icon and
 * colour, kind and source labels, visits by weekday, usual day and time, and
 * visits / time recorded / average stay), each with its visits listed under it,
 * as print-ready HTML. Shared by the Places Report's own export and the
 * Intelligence Package, which embeds one of these per included target. It
 * carries its own styles, so it looks the same in either. Places nothing
 * recognises come last under their own heading, as on the page. Running sheets
 * are left out on purpose — the links to them live on the Places page. */
export function buildPlacesBodyHtml(places: PlaceSummary[]): string {
  const recognised = places.filter(p => p.source !== "none");
  const unrecognised = places.filter(p => p.source === "none");
  return `${PL_CSS}
  ${recognised.map(placeCard).join("")}
  ${unrecognised.length ? `<div class="pl-h">Not recognised — label a place to group it</div>${unrecognised.map(placeCard).join("")}` : ""}
  <div class="note">Built from running sheet rows, certified or not. Time at a place is arrival to a logged departure; a visit with no departure logged is counted but has no time. A place nothing recognises is shown as Other.</div>`;
}

/** The four summary tiles at the top of the Places page. */
function summaryTiles(places: PlaceSummary[], periodLabel: string): string {
  const visits = places.reduce((s, p) => s + p.visits.length, 0);
  const time = places.reduce((s, p) => s + p.totalMinutes, 0);
  const most = [...places].sort((a, b) => b.visits.length - a.visits.length)[0];
  const longest = [...places].sort(
    (a, b) => b.totalMinutes - a.totalMinutes
  )[0];
  const fresh = places.filter(p => p.isNew);
  const tile = (label: string, value: string | number, sub: string) =>
    `<div class="pl-tilebox"><p>${esc(label)}</p><b>${esc(String(value))}</b><span>${esc(sub) || "&nbsp;"}</span></div>`;
  return `<div class="pl-sum">${tile("Places", places.length, most ? `Most visited: ${most.name}` : "")}${tile("Visits", visits, periodLabel)}${tile("Time recorded", time ? formatDwell(time) : "—", longest && longest.totalMinutes ? `Longest: ${longest.name}` : "only visits with a departure logged")}${tile("New this week", fresh.length, fresh.map(p => p.name).join(", ") || "none")}</div>`;
}

/** The Places Report as a printable page — same shell as the other Intelligence
 * report exports (navy cover band, PROTECTED header, close / print bar). One
 * table of places, then each place's visits. */
export function buildPlacesReportHtml(params: {
  targetName: string;
  operationName: string;
  periodLabel: string;
  places: PlaceSummary[];
}): string {
  const { targetName, operationName, periodLabel, places } = params;
  const BLUE_DARK = "#1e3a8a";
  const BLUE_MID = "#93c5fd";
  const BLUE_LIGHT = "#dbeafe";
  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const visits = places.reduce((s, p) => s + p.visits.length, 0);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RunLog — Places Report: ${esc(targetName)}</title>
<style>* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; } body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.5; color:#1e293b; background:#fff; }
@page { margin:14mm 12mm; @top-center { content:'PROTECTED'; font-family:sans-serif; font-size:12px; font-weight:700; color:#dc2626; letter-spacing:0.08em } }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:26px 32px 20px; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID} !important; margin-bottom:12px; }
.entity-name { font-size:22px; font-weight:700; } .gen-time { font-size:9px; opacity:0.7; margin-top:10px; }
.content { padding:18px 0 70px; }
.section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin:14px 0 8px; }
table, .data-table { border-collapse:collapse; width:100%; }
.visits-h { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK}; margin:16px 0 6px; }
th { text-align:left; font-size:9.5px; text-transform:uppercase; letter-spacing:0.04em; color:${BLUE_DARK}; padding:5px 6px; border-bottom:2px solid ${BLUE_DARK}; }
td { padding:5px 6px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.muted { color:#64748b; font-size:10px; }
.place { break-inside:avoid; margin-bottom:12px; } .place-h { font-weight:700; margin:8px 0 4px; }
.visits td, .visits th { font-size:10px; }
.note { margin-top:14px; font-size:9.5px; color:#64748b; }
.footer { margin-top:24px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
</style></head><body>
<div class="cover-header">
  <div class="brand-label">RunLog Intelligence — Places Report</div>
  <div class="entity-name">${esc(targetName)}</div>
  <div style="font-size:12px;opacity:0.8;margin-top:4px">${esc(operationName)} &middot; ${esc(periodLabel)}</div>
  <div class="gen-time">Generated: ${generatedAt} &middot; ${places.length} place${places.length === 1 ? "" : "s"}, ${visits} visit${visits === 1 ? "" : "s"}</div>
</div>
<div class="content">
  ${summaryTiles(places, periodLabel)}
  <div class="section-title">Places</div>
  ${buildPlacesBodyHtml(places)}
  <div class="footer"><span>RunLog — Places Report</span><span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span></div>
</div>
${buildExportPreviewCloseBar()}
</body></html>`;
}
