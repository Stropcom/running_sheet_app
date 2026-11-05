import {
  formatShiftText,
  timelineSpan,
  weekDays,
  weekSummary,
  type DayCell,
} from "@shared/taskingView";
import { isBlendDay, isBlendTeam } from "@shared/taskingBlend";
import { mixHex, readableOn, tintOf } from "@shared/teamColours";
import { TASKING_VIEWS, type TaskingViewId } from "@/lib/taskingViewPref";

/**
 * The CTO Weekly Tasking calendar layouts as printable HTML, one for each
 * on-screen layout (banded columns, schedule tables, day tiles, timeline), for
 * the Export PDF (ctoTaskingExport.ts). Plain paper colours: the on-screen
 * versions follow the app's theme and cannot be used in the export window.
 */
const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface PrintTeam {
  id: string;
  label: string;
  ab: string;
  /** #rrggbb */
  colour: string;
}

export interface PrintWeek {
  weekStart: string;
  teams: PrintTeam[];
  week: Record<string, DayCell[]>;
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}
/** The team colour mixed toward white (a light fill) or toward black (text). */
function mix(hex: string, towards: 0 | 255, amount: number): string {
  const [r, g, b] = rgb(hex);
  const f = (v: number) => Math.round(v + (towards - v) * amount);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
const teamVars = (t: PrintTeam) =>
  `--tc:${t.colour};--tint:${mix(t.colour, 255, 0.86)};--edge:${mix(t.colour, 255, 0.55)};--ink:${mix(t.colour, 0, 0.42)}`;

export const VIEWS_PRINT_CSS = `
.tp { margin-bottom:10px; }
.tp-card { border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; margin-bottom:8px; break-inside:avoid; background:#fff; }
.tp-title { display:flex; align-items:center; gap:8px; padding:5px 10px; background:var(--tint) !important; border-bottom:1px solid #cbd5e1; }
.tp-title i { width:4px; height:14px; background:var(--tc) !important; border-radius:2px; }
.tp-title b { color:var(--ink) !important; font-size:11px; letter-spacing:.02em; }
.tp-shift { display:inline-block; font-family:ui-monospace,Menlo,monospace; font-weight:700; font-size:9.5px; color:var(--ink) !important; background:var(--tint) !important; border:1px solid var(--edge); border-radius:4px; padding:1px 6px; }
.tp-shift.off { color:#64748b !important; background:transparent !important; border:1px dashed #cbd5e1; font-family:inherit; letter-spacing:.04em; }
.tp-none { color:#94a3b8; }
.tp-tag { display:inline-grid; place-items:center; width:13px; height:13px; border-radius:3px; background:var(--ink) !important; color:#fff !important; font-style:normal; font-size:8.5px; font-weight:700; margin-right:5px; }
.tp-tag.s { background:transparent !important; color:#64748b !important; border:1px solid #cbd5e1; }
.wk { background:#f1f5f9 !important; }
.tp-btag { display:inline-flex; border-radius:3px; overflow:hidden; font-size:8px; font-weight:800; line-height:1; margin-left:5px; vertical-align:middle; }
.tp-btag i { font-style:normal; padding:2px 4px; }
.tp-btag i:first-child { background:var(--b1) !important; color:var(--b1t) !important; }
.tp-btag i:last-child { background:var(--b2) !important; color:var(--b2t) !important; }
.tp-col.bl > div { background:var(--bflat) !important; }
.tp-col.bl .tp-day { border-bottom:3px solid; border-image:linear-gradient(90deg,var(--b1) 50%,var(--b2) 50%) 1; }
.tp-table tr.bl td { background:var(--bflat) !important; }
.tp-table tr.bl td.d { box-shadow:inset 4px 0 0 var(--b1), inset 8px 0 0 var(--b2); }
.tp-tl.merged { min-height:84px; }
.tp-tl.merged > i { background:linear-gradient(180deg,var(--b1) 50%,var(--b2) 50%) !important; }
.tp-tl.merged .tp-tl-b { background:var(--bflat) !important; }
.tp-tl.merged .tp-tl-team { color:#1e3a8a !important; }
.tp-bar.merged { background:linear-gradient(180deg,var(--b1tint) 50%,var(--b2tint) 50%) !important; border:1px solid #cbd5e1; border-left-width:1px; flex-direction:column; align-items:flex-start; justify-content:center; padding-left:10px; gap:0; line-height:1.15; }
.tp-bar.merged::before { content:""; position:absolute; left:0; top:0; bottom:0; width:5px; background:linear-gradient(180deg,var(--b1) 50%,var(--b2) 50%) !important; }
.tp-bar.merged .ab { color:#1e3a8a !important; }

.tp-pa { display:grid; grid-template-columns:repeat(7,1fr); }
.tp-col { border-right:1px solid #cbd5e1; }
.tp-col:last-child { border-right:0; }
.tp-day { display:flex; justify-content:space-between; padding:3px 7px; border-bottom:1px solid #cbd5e1; font-weight:700; font-size:9.5px; }
.tp-day small { color:#64748b; font-weight:600; }
.tp-cell { padding:4px 7px; border-bottom:1px solid #e2e8f0; font-size:9.5px; min-height:22px; }
.tp-cell:last-child { border-bottom:0; }
.tp-cell.sec { color:#64748b; }
.tp-cell.hide { visibility:hidden; }

.tp-pb { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.tp-pb .tp-card { margin-bottom:0; }
.tp-table { width:100%; border-collapse:collapse; font-size:9.5px; }
.tp-table th { text-align:left; font-size:8.5px; letter-spacing:.06em; text-transform:uppercase; color:#475569 !important; background:#f1f5f9 !important; padding:3px 8px; border-bottom:1px solid #cbd5e1; }
.tp-table td { padding:3px 8px; border-bottom:1px solid #e2e8f0; height:22px; }
.tp-table tr:last-child td { border-bottom:0; }
.tp-table td.d { width:58px; font-weight:700; white-space:nowrap; }
.tp-table td.d small { color:#64748b; font-weight:600; margin-left:3px; }
.tp-table td.s { color:#64748b; }
.tp-table .offc { color:#64748b; font-style:italic; }

.tp-ta { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
.tp-tile { border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; break-inside:avoid; background:#fff; }
.tp-tile-h { display:flex; align-items:baseline; gap:6px; padding:4px 8px; background:#f1f5f9 !important; border-bottom:1px solid #cbd5e1; }
.tp-tile-h .n { font-size:15px; font-weight:800; line-height:1; }
.tp-tile-h .w { font-weight:700; font-size:10px; }
.tp-tile-h .m { margin-left:auto; font-size:9px; color:#64748b; font-weight:600; }
.tp-tl { display:grid; grid-template-columns:5px 1fr; border-bottom:1px solid #e2e8f0; }
.tp-tl:last-child { border-bottom:0; }
.tp-tl > i { background:var(--tc) !important; }
.tp-tl-b { padding:3px 7px; font-size:9.5px; min-height:30px; }
.tp-tl-team { font-size:8.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--ink) !important; }
.tp-tl-time { font-family:ui-monospace,Menlo,monospace; font-weight:700; margin-right:6px; }
.tp-tl-sec { color:#64748b; font-size:9px; }
.tp-tl.off { background:#f1f5f9 !important; }
.tp-sum .stat { display:flex; justify-content:space-between; padding:5px 8px; border-bottom:1px solid #e2e8f0; font-size:9.5px; }
.tp-sum .stat b { font-size:13px; }
.tp-sum .ops { padding:5px 8px; font-size:9.5px; display:grid; gap:3px; }
.tp-sum .ops div { display:flex; justify-content:space-between; }

.tp-cb { display:grid; grid-template-columns:62px 1fr; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; background:#fff; }
.tp-cb-axis { position:relative; height:20px; border-bottom:1px solid #cbd5e1; background:#f1f5f9 !important; }
.tp-cb-axis span { position:absolute; top:5px; font-size:8.5px; font-weight:600; color:#475569; }
.tp-cb-corner { border-bottom:1px solid #cbd5e1; border-right:1px solid #cbd5e1; background:#f1f5f9 !important; }
.tp-cb-day { padding:4px 8px; border-bottom:1px solid #e2e8f0; border-right:1px solid #cbd5e1; font-weight:700; font-size:9.5px; display:flex; flex-direction:column; justify-content:center; height:62px; break-inside:avoid; }
.tp-cb-day small { color:#64748b; font-weight:600; font-size:8.5px; }
.tp-cb-lane { position:relative; border-bottom:1px solid #e2e8f0; height:62px; }
.tp-cb-grid i { position:absolute; top:0; bottom:0; width:1px; background:#e2e8f0; }
.tp-bar { position:absolute; height:13px; border-radius:4px; background:var(--tint) !important; border:1px solid var(--tc); border-left-width:3px; display:flex; align-items:center; padding:0 5px; font-size:8.5px; font-weight:700; white-space:nowrap; overflow:hidden; }
.tp-bar .ab { font-size:7.5px; color:var(--ink) !important; margin-right:5px; }
.tp-bar .t { font-family:ui-monospace,Menlo,monospace; font-weight:600; color:#64748b; margin-left:6px; font-size:8px; }
.tp-offtag { position:absolute; left:6px; font-size:8.5px; color:#64748b; font-weight:600; }
.tp-key { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:8.5px; color:#475569; margin:0 0 6px; }
.tp-key span { display:inline-flex; align-items:center; gap:5px; }
.tp-key i { width:9px; height:9px; border-radius:2px; background:var(--tc) !important; display:inline-block; }
`;

const blendTag = `<span class="tp-btag"><i>T1</i><i>T2</i></span>`;
/** This team's day is a blended T1 + T2 day. */
const blendedFor = (w: PrintWeek, teamId: string, i: number) =>
  isBlendTeam(teamId) && isBlendDay(w.week, i);

const none = `<span class="tp-none">—</span>`;
const shiftHtml = (c: DayCell) =>
  c.shift
    ? `<span class="tp-shift${c.off ? " off" : ""}">${esc(formatShiftText(c.shift))}</span>`
    : none;

function bandedHtml(w: PrintWeek): string {
  const days = weekDays(w.weekStart);
  return w.teams
    .map(
      t =>
        `<div class="tp-card" style="${teamVars(t)}"><div class="tp-title"><i></i><b>${esc(t.label)}</b></div><div class="tp-pa">${days
          .map((d, i) => {
            const c = w.week[t.id][i];
            const bl = blendedFor(w, t.id, i);
            return `<div class="tp-col${i > 4 ? " wk" : ""}${bl ? " bl" : ""}"><div class="tp-day">${d.name}<small>${String(d.day).padStart(2, "0")} ${d.month}</small></div><div class="tp-cell">${shiftHtml(c)}${bl && !c.off ? blendTag : ""}</div><div class="tp-cell${c.off ? " hide" : ""}"><i class="tp-tag">P</i>${c.primary ? esc(c.primary) : none}</div><div class="tp-cell sec${c.off ? " hide" : ""}"><i class="tp-tag s">S</i>${c.secondary ? esc(c.secondary) : none}</div></div>`;
          })
          .join("")}</div></div>`
    )
    .join("");
}

function tablesHtml(w: PrintWeek): string {
  const days = weekDays(w.weekStart);
  return `<div class="tp-pb">${w.teams
    .map(
      t =>
        `<div class="tp-card" style="${teamVars(t)}"><div class="tp-title"><i></i><b>${esc(t.label)}</b></div><table class="tp-table"><thead><tr><th>Day</th><th>Shift</th><th>Primary</th><th>Secondary</th></tr></thead><tbody>${days
          .map((d, i) => {
            const c = w.week[t.id][i];
            const bl = blendedFor(w, t.id, i);
            return `<tr class="${i > 4 ? "wk" : ""}${bl ? " bl" : ""}"><td class="d">${d.name}<small>${String(d.day).padStart(2, "0")}</small></td>${
              c.off
                ? `<td colspan="3" class="offc">Rostered day off</td>`
                : `<td>${shiftHtml(c)}${bl ? blendTag : ""}</td><td>${c.primary ? `<b>${esc(c.primary)}</b>` : none}</td><td class="s">${c.secondary ? esc(c.secondary) : none}</td>`
            }</tr>`;
          })
          .join("")}</tbody></table></div>`
    )
    .join("")}</div>`;
}

function tilesHtml(w: PrintWeek): string {
  const days = weekDays(w.weekStart);
  const sum = weekSummary(w.week);
  const tiles = days.map((d, i) => {
    const rows = w.teams
      .map(t => {
        const c = w.week[t.id][i];
        const bl = blendedFor(w, t.id, i);
        // Blended: Team 1 and Team 2 are one lane, drawn once on Team 1's place.
        if (bl && t.id === "surv2") return "";
        const body = c.off
          ? `<span style="color:#64748b;font-weight:600">RDO</span>`
          : !c.shift && !c.primary
            ? none
            : `<span class="tp-tl-time">${esc(formatShiftText(c.shift))}</span><b>${esc(c.primary)}</b>${c.secondary ? `<div class="tp-tl-sec">+ ${esc(c.secondary)}</div>` : ""}`;
        return `<div class="tp-tl${c.off ? " off" : ""}${bl ? " merged" : ""}"${bl ? "" : ` style="${teamVars(t)}"`}><i></i><div class="tp-tl-b"><div class="tp-tl-team">${bl ? "T1 + T2 combined" : esc(t.label)}</div>${body}</div></div>`;
      })
      .join("");
    return `<div class="tp-tile"><div class="tp-tile-h"><span class="n">${String(d.day).padStart(2, "0")}</span><span class="w">${d.name}</span><span class="m">${d.month}</span></div>${rows}</div>`;
  });
  const ops = Object.keys(sum.primaryByOp);
  tiles.push(
    `<div class="tp-tile tp-sum"><div class="tp-tile-h"><span class="w">Week summary</span><span class="m">${days[0].day} ${days[0].month} – ${days[6].day} ${days[6].month}</span></div><div class="stat"><span>Shifts worked</span><b>${sum.shifts}</b></div><div class="stat"><span>Rostered days off</span><b>${sum.rdo}</b></div><div class="ops">${ops.map(o => `<div><span>${esc(o)}</span><b>${sum.primaryByOp[o]} primary</b></div>`).join("")}</div></div>`
  );
  return `<div class="tp-ta">${tiles.join("")}</div>`;
}

function timelineHtml(w: PrintWeek): string {
  const days = weekDays(w.weekStart);
  const [lo, hi] = timelineSpan(w.week);
  const pct = (m: number) => ((m - lo) / (hi - lo)) * 100;
  const ticks: number[] = [];
  for (let m = lo; m <= hi; m += 120) ticks.push(m);
  const axis = ticks
    .map((m, k) => {
      const tx =
        k === 0
          ? "none"
          : k === ticks.length - 1
            ? "translateX(-100%)"
            : "translateX(-50%)";
      return `<span style="left:${pct(m)}%;transform:${tx}">${String(Math.floor(m / 60) % 24).padStart(2, "0")}:00</span>`;
    })
    .join("");
  const grid = ticks.map(m => `<i style="left:${pct(m)}%"></i>`).join("");
  const rows = days
    .map((d, i) => {
      const lane = w.teams
        .map((t, li) => {
          const c = w.week[t.id][i];
          const top = 4 + li * 14;
          const bl = blendedFor(w, t.id, i) && !!c.range;
          // Blended: one tall bar across the Team 1 and Team 2 lanes.
          if (bl && t.id === "surv2") return "";
          if (c.off)
            return `<div class="tp-offtag" style="top:${top}px">${esc(t.ab)} · RDO</div>`;
          if (!c.range) {
            return c.shift || c.primary
              ? `<div class="tp-offtag" style="top:${top}px">${esc(t.ab)} · ${esc(c.shift)} ${esc(c.primary)}</div>`
              : "";
          }
          const label = `${esc(c.primary)}${c.secondary ? " + " + esc(c.secondary) : ""}`;
          if (bl)
            return `<div class="tp-bar merged" style="left:${pct(c.range![0])}%;width:${pct(c.range![1]) - pct(c.range![0])}%;top:${top}px;height:27px"><span><span class="ab">T1 + T2</span>${label}</span><span class="t" style="margin-left:0">${esc(formatShiftText(c.shift))}</span></div>`;
          return `<div class="tp-bar" style="${teamVars(t)};left:${pct(c.range[0])}%;width:${pct(c.range[1]) - pct(c.range[0])}%;top:${top}px"><span class="ab">${esc(t.ab)}</span>${label}<span class="t">${esc(formatShiftText(c.shift))}</span></div>`;
        })
        .join("");
      return `<div class="tp-cb-day${i > 4 ? " wk" : ""}">${d.name}<small>${String(d.day).padStart(2, "0")} ${d.month}</small></div><div class="tp-cb-lane${i > 4 ? " wk" : ""}"><div class="tp-cb-grid">${grid}</div>${lane}</div>`;
    })
    .join("");
  return `<div class="tp-cb"><div class="tp-cb-corner"></div><div class="tp-cb-axis">${axis}</div>${rows}</div>`;
}

/** One calendar layout as a printable section, with a heading and the team key. */
export function printViewHtml(
  view: TaskingViewId,
  w: PrintWeek,
  weekLabel = ""
): string {
  const label = TASKING_VIEWS.find(v => v.id === view)?.label ?? "";
  const body =
    view === "panel-banded"
      ? bandedHtml(w)
      : view === "panel-tables"
        ? tablesHtml(w)
        : view === "tile-days"
          ? tilesHtml(w)
          : timelineHtml(w);
  const key = w.teams
    .map(t => `<span style="${teamVars(t)}"><i></i>${esc(t.label)}</span>`)
    .join("");
  // The pink-and-blue of a blended day are Team 1's and Team 2's own colours.
  const b1 = w.teams.find(t => t.id === "surv1")?.colour ?? "#ec4899";
  const b2 = w.teams.find(t => t.id === "surv2")?.colour ?? "#1976d2";
  const blendVars = `--b1:${b1};--b2:${b2};--b1t:${readableOn(b1)};--b2t:${readableOn(b2)};--bflat:${tintOf(mixHex(b1, b2), 0.9)};--b1tint:${tintOf(b1, 0.9)};--b2tint:${tintOf(b2, 0.9)}`;
  return `<div class="section tp" style="${blendVars}"><div class="section-title">Weekly Tasking Calendar · ${esc(label)}${weekLabel ? ` · ${esc(weekLabel)}` : ""}</div><div class="tp-key">${key}<span>P = primary task, S = secondary task, RDO = rostered day off</span></div>${body}</div>`;
}
