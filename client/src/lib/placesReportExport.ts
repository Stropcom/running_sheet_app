import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import {
  WEEKDAY_SHORT,
  formatClock,
  formatDwell,
  placeKindLabel,
  type PlaceSummary,
} from "@shared/placesReport";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

  const usual = (p: PlaceSummary) =>
    [
      p.usualDays.map(d => WEEKDAY_SHORT[d]).join(" · "),
      p.usualMinutes !== null ? `about ${formatClock(p.usualMinutes)}` : "",
    ]
      .filter(Boolean)
      .join(", ");

  const rows = places
    .map(
      p => `<tr>
  <td><b>${esc(p.name)}</b>${p.registeredAs && p.registeredAs !== placeKindLabel(p.kind) ? `<br><span class="muted">Registered as ${esc(p.registeredAs)}</span>` : ""}</td>
  <td>${esc(placeKindLabel(p.kind))}</td>
  <td class="num">${p.visits.length}</td>
  <td class="num">${p.timedVisits ? esc(formatDwell(p.totalMinutes)) : "—"}</td>
  <td class="num">${p.averageMinutes !== null ? esc(formatDwell(p.averageMinutes)) : "—"}</td>
  <td>${esc(usual(p)) || "—"}</td>
</tr>`
    )
    .join("");

  const details = places
    .map(
      p => `<div class="place">
  <div class="place-h">${esc(p.name)} <span class="muted">— ${esc(placeKindLabel(p.kind))}</span></div>
  <table class="visits"><thead><tr><th>Date</th><th>Arrived</th><th>Left</th><th>Time there</th><th>Running sheet</th></tr></thead><tbody>
  ${p.visits
    .map(
      v =>
        `<tr><td>${esc(v.dateISO)}</td><td>${v.startMinutes !== null ? formatClock(v.startMinutes) : "—"}</td><td>${
          v.endMinutes !== null
            ? formatClock(v.endMinutes) +
              (v.endDayOffset > 0 ? ` +${v.endDayOffset}` : "")
            : "no departure logged"
        }</td><td>${v.dwellMinutes !== null ? esc(formatDwell(v.dwellMinutes)) : "—"}</td><td>${esc(v.sheetTitle)}</td></tr>`
    )
    .join("")}
  </tbody></table>
</div>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RunLog — Places Report: ${esc(targetName)}</title>
<style>* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; } body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.5; color:#1e293b; background:#fff; }
@page { margin:14mm 12mm; @top-center { content:'PROTECTED'; font-family:sans-serif; font-size:12px; font-weight:700; color:#dc2626; letter-spacing:0.08em } }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:26px 32px 20px; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID} !important; margin-bottom:12px; }
.entity-name { font-size:22px; font-weight:700; } .gen-time { font-size:9px; opacity:0.7; margin-top:10px; }
.content { padding:18px 32px 70px; }
.section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin:14px 0 8px; }
table { border-collapse:collapse; width:100%; }
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
  <div class="section-title">Places</div>
  <table><thead><tr><th>Place</th><th>Kind</th><th class="num">Visits</th><th class="num">Time recorded</th><th class="num">Average stay</th><th>Usually</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="note">Built from running sheet rows, certified or not. Time at a place is arrival to a logged departure; a visit with no departure logged is counted but has no time. A place nothing recognises is shown as Other.</div>
  <div class="section-title">Visits</div>
  ${details}
  <div class="footer"><span>RunLog — Places Report</span><span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span></div>
</div>
${buildExportPreviewCloseBar()}
</body></html>`;
}
