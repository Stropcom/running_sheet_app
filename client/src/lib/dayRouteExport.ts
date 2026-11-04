import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import {
  ROUTE_GAP,
  ROUTE_RED,
  legText,
  stopTimes,
  type DayRoute,
} from "@shared/dayRoute";
import { tidyRepeatedPlaceName } from "@/lib/addressFormat";
import { formatDwell, placeKindLabel } from "@shared/placesReport";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "Tuesday 3 November 2026" from a YYYY-MM-DD day (no time zone involved). */
export function longDay(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const DR_CSS = `<style>
.dr-map { display:block; width:100%; max-height:420px; object-fit:contain; border:1px solid #cbd5e1; border-radius:6px; }
.dr-legend { display:flex; gap:18px; flex-wrap:wrap; margin-top:6px; font-size:9.5px; color:#475569; }
.dr-legend i { display:inline-block; width:22px; height:3px; vertical-align:middle; margin-right:6px; }
.dr-table { border-collapse:collapse; width:100%; margin-top:10px; }
.dr-table th { text-align:left; font-size:9.5px; text-transform:uppercase; letter-spacing:0.04em; color:#1e3a8a; padding:5px 6px; border-bottom:2px solid #1e3a8a; }
.dr-table td { padding:5px 6px; border-bottom:1px solid #e2e8f0; vertical-align:top; font-size:11px; }
.dr-table tr { break-inside:avoid; }
.dr-num { font-variant-numeric:tabular-nums; white-space:nowrap; }
.dr-pin { width:30px; }
.dr-dot { display:inline-block; min-width:20px; height:20px; line-height:20px; border-radius:10px; background:${ROUTE_RED} !important; color:#fff !important; text-align:center; font-weight:700; font-size:10px; padding:0 4px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.dr-tag { font-size:9px; font-weight:700; color:#9f1239; background:#ffe4e9 !important; padding:0 5px; border-radius:3px; }
.dr-muted { color:#64748b; font-size:10px; }
.dr-gap td { background:#fff4e0 !important; color:#8a4107; font-weight:600; font-size:10px; }
</style>`;

/**
 * The map picture and the stops of one day, as print-ready HTML with its own
 * styles. Used by the Day Route report's page and by the Supervisor Summary.
 *
 * `plain` is the Summary's version: it only says what the rows say — the place
 * and the times the rows give, in order. No stay lengths, no "no rows for…"
 * gap lines and no gap colour on the map; those are worked out, and the
 * Summary is the sheet's own account. The Day Route report shows them.
 */
export function buildDayRouteBodyHtml(params: {
  route: DayRoute;
  mapDataUrl: string | null;
  plain?: boolean;
}): string {
  const { route, mapDataUrl, plain = false } = params;
  const rows = route.stops
    .map((s, i) => {
      const leg = route.legs[i];
      const place = esc(tidyRepeatedPlaceName(s.name));
      const stop = plain
        ? `<tr>
  <td class="dr-pin"><span class="dr-dot">${esc(s.pin) || s.n}</span></td>
  <td class="dr-num">${esc(stopTimes(s))}</td>
  <td><b>${place}</b>${s.visitNo > 1 ? ` <span class="dr-tag">Visit ${s.visitNo}</span>` : ""}</td>
</tr>`
        : `<tr>
  <td class="dr-pin"><span class="dr-dot">${esc(s.pin) || s.n}</span></td>
  <td class="dr-num">${esc(stopTimes(s))}</td>
  <td><b>${place}</b>${s.visitNo > 1 ? ` <span class="dr-tag">Visit ${s.visitNo}</span>` : ""}<br><span class="dr-muted">${esc(placeKindLabel(s.kind))} &middot; ${esc(s.sheetTitle)}</span></td>
  <td class="dr-num">${s.dwellMinutes !== null ? esc(formatDwell(s.dwellMinutes)) : "&mdash;"}</td>
</tr>`;
      const between =
        !plain && leg && leg.kind !== "travel"
          ? `<tr class="dr-gap"><td></td><td colspan="3">${esc(legText(leg))}</td></tr>`
          : "";
      return stop + between;
    })
    .join("");
  const head = plain
    ? "<th></th><th>Time at place</th><th>Place</th>"
    : "<th></th><th>Time at place</th><th>Place</th><th>Stayed</th>";
  const map = mapDataUrl
    ? `<img class="dr-map" src="${mapDataUrl}" alt="Route on the map">${
        plain
          ? ""
          : `<div class="dr-legend"><span><i style="background:${ROUTE_RED}"></i>Between places, rows at both ends</span><span><i style="background:${ROUTE_GAP}"></i>No rows for an hour or more, or no departure logged</span></div>`
      }`
    : `<div class="note">No place on this day could be located on the map, so the map is left out.</div>`;
  return `${DR_CSS}${map}<table class="dr-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** The Day Route as a printable page — same shell as the other Intelligence
 * report exports (navy cover band, PROTECTED header, close / print bar): the
 * Google map picture with numbered pins, then the stops in time order with the
 * stretches no row covers marked. `mapDataUrl` is null when no place could be
 * located; the table still prints. */
export function buildDayRouteHtml(params: {
  targetName: string;
  operationName: string;
  route: DayRoute;
  mapDataUrl: string | null;
}): string {
  const { targetName, operationName, route, mapDataUrl } = params;
  const BLUE_DARK = "#1e3a8a";
  const BLUE_MID = "#93c5fd";
  const BLUE_LIGHT = "#dbeafe";
  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RunLog — Day Route: ${esc(targetName)}</title>
<style>* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; } body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.5; color:#1e293b; background:#fff; }
@page { margin:14mm 12mm; @top-center { content:'PROTECTED'; font-family:sans-serif; font-size:12px; font-weight:700; color:#dc2626; letter-spacing:0.08em } }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:26px 32px 20px; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID} !important; margin-bottom:12px; }
.entity-name { font-size:22px; font-weight:700; } .gen-time { font-size:9px; opacity:0.7; margin-top:10px; }
.content { padding:18px 0 70px; }
.section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin:14px 0 8px; }
.map { display:block; width:100%; max-height:420px; object-fit:contain; border:1px solid #cbd5e1; }
.legend { display:flex; gap:18px; flex-wrap:wrap; margin-top:6px; font-size:9.5px; color:#475569; }
.legend i { display:inline-block; width:22px; height:3px; vertical-align:middle; margin-right:6px; }
table { border-collapse:collapse; width:100%; }
th { text-align:left; font-size:9.5px; text-transform:uppercase; letter-spacing:0.04em; color:${BLUE_DARK}; padding:5px 6px; border-bottom:2px solid ${BLUE_DARK}; }
td { padding:5px 6px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
tr { break-inside:avoid; }
.num { font-variant-numeric:tabular-nums; white-space:nowrap; }
.pin { width:30px; } .dot { display:inline-block; min-width:20px; height:20px; line-height:20px; border-radius:10px; background:${ROUTE_RED} !important; color:#fff !important; text-align:center; font-weight:700; font-size:10px; padding:0 4px; }
.tag { font-size:9px; font-weight:700; color:#9f1239; background:#ffe4e9 !important; padding:0 5px; border-radius:3px; }
.muted { color:#64748b; font-size:10px; }
.gaprow td { background:#fff4e0 !important; color:#8a4107; font-weight:600; font-size:10px; }
.note { margin-top:14px; font-size:9.5px; color:#64748b; }
.footer { margin-top:24px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
</style></head><body>
<div class="cover-header">
  <div class="brand-label">RunLog Intelligence — Day Route</div>
  <div class="entity-name">${esc(targetName)}</div>
  <div style="font-size:12px;opacity:0.8;margin-top:4px">${esc(operationName)} &middot; ${esc(longDay(route.dateISO))}</div>
  <div class="gen-time">Generated: ${generatedAt} &middot; ${route.stats.stops} stop${route.stats.stops === 1 ? "" : "s"} at ${route.stats.places} place${route.stats.places === 1 ? "" : "s"}${route.stats.minutesAtPlaces ? ` &middot; ${esc(formatDwell(route.stats.minutesAtPlaces))} recorded at places` : ""}</div>
</div>
<div class="content">
  <div class="section-title">Route</div>
  ${buildDayRouteBodyHtml({ route, mapDataUrl })}
  <div class="note">Built from running sheet rows that put the target at a place, certified or not. Time at a place is arrival to a departure a row logs; with none logged the stop stands but has no time. Where no row covers a stretch it is marked as a gap and no path is drawn between the places as if it were known. A place is shown on the map by the address written for it on the sheet.</div>
  <div class="footer"><span>RunLog — Day Route</span><span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span></div>
</div>
${buildExportPreviewCloseBar()}
</body></html>`;
}
