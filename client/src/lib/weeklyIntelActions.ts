import {
  CUE_CATEGORY_LABELS,
  INTEL_CATEGORY_ORDER,
  weekDayBoxes,
  type WeeklyIntelItem,
} from "@shared/sheetIntel";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The Weekly Report's "Actions and items this week" for one target: each item
 * or action, one grey who / what line (the sentence's own wording), Monday to
 * Sunday day boxes and a straight "N times this week". Hand-added lines say who
 * added them. Returns "" when there are none. */
export function weeklyActionsHtml(
  items: WeeklyIntelItem[] | undefined
): string {
  if (!items || items.length === 0) return "";
  const groups = INTEL_CATEGORY_ORDER.map(c => ({
    c,
    items: items.filter(i => i.category === c),
  })).filter(g => g.items.length > 0);
  return `<div class="intel-sub-label">Actions and items this week</div>${groups
    .map(
      g =>
        `<div class="act-cat">${esc(CUE_CATEGORY_LABELS[g.c])}</div>${g.items
          .map(i => {
            const boxes = weekDayBoxes(i.dates)
              .map(
                b =>
                  `<span class="act-day${b.on ? " on" : ""}">${esc(b.letter)}</span>`
              )
              .join("");
            return `<div class="act-item">
  <div class="act-top"><span class="act-heading">${esc(i.heading)}</span><span class="act-times">${i.count} time${i.count === 1 ? "" : "s"} this week</span></div>
  <div class="act-line">${esc(i.line)}</div>
  <div class="act-foot"><span class="act-days">${boxes}</span>${i.addedByCIN ? `<span class="act-added">Added by ${esc(i.addedByCIN)}</span>` : ""}</div>
</div>`;
          })
          .join("")}`
    )
    .join("")}`;
}

/** CSS for the HTML above, added to the Weekly Report PDF stylesheet. */
export const WEEKLY_ACTIONS_CSS = `
.act-cat { font-size:9px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.05em; margin:8px 0 4px; }
.act-item { border:1px solid #cbd5e1; border-radius:6px; padding:6px 9px; margin:0 0 5px; break-inside:avoid; }
.act-top { display:flex; justify-content:space-between; gap:8px; align-items:baseline; }
.act-heading { font-size:10.5px; font-weight:700; color:#1e293b; }
.act-times { font-size:9px; font-weight:700; color:#0b6e8f; white-space:nowrap; font-variant-numeric:tabular-nums; }
.act-line { font-size:10px; color:#64748b; margin-top:2px; overflow-wrap:anywhere; }
.act-foot { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:4px; }
.act-days { display:inline-flex; gap:2px; }
.act-day { width:15px; height:15px; line-height:15px; text-align:center; font-size:8px; font-weight:700; border:1px solid #cbd5e1; border-radius:3px; color:#94a3b8; }
.act-day.on { background:#0b6e8f !important; border-color:#0b6e8f; color:#fff !important; }
.act-added { font-size:8.5px; font-weight:700; color:#334155; border:1px solid #94a3b8; border-radius:999px; padding:0 7px; }
`;
