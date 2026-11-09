import {
  highlightSegments,
  intelByCategory,
  type SheetIntelLine,
} from "@shared/sheetIntel";

/** What the New Intelligence section of the Supervisor Summary PDF needs — the
 * same data the screen shows (summary.getIntel). */
export interface SheetIntelPdfData {
  lines: SheetIntelLine[];
  newThisShift: { persons: string[]; vehicles: string[]; locations: string[] };
  leftOut: unknown[];
}

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PILL =
  "display:inline-block;border-radius:999px;padding:1px 8px;font-size:9px;font-weight:700;white-space:nowrap;";

/**
 * The body of the "New Intelligence" section of the Supervisor Summary PDF.
 * Only ticked lines are written (hand-added lines are always in). Each line is
 * the heading, then the officer's own sentence with the matched words picked
 * out, the time, and the straight count where the same item appears more than
 * once on the sheet. Returns "" when there is nothing to show.
 */
export function sheetIntelPdfBody(data: SheetIntelPdfData | null): string {
  if (!data) return "";
  const lines = data.lines.filter(l => l.included);
  const nw = data.newThisShift;
  const newCount = nw.persons.length + nw.vehicles.length + nw.locations.length;
  if (lines.length === 0 && newCount === 0) return "";

  const chip = (label: string, colour: string, bg: string) =>
    `<span style="display:inline-block;margin:0 6px 5px 0;padding:3px 9px;border-radius:6px;border:1px solid ${colour};background:${bg};color:${colour};font-size:10px;font-weight:700;">${esc(label)}</span>`;
  const group = (
    title: string,
    labels: string[],
    colour: string,
    bg: string
  ) =>
    labels.length
      ? `<div class="intel-group"><div class="intel-group-label">${esc(title)} <span>${labels.length}</span></div><div>${labels.map(l => chip(l, colour, bg)).join("")}</div></div>`
      : "";

  const newHtml =
    newCount > 0
      ? `<div class="intel-sub">New this shift &mdash; first time recorded</div>${group("Persons", nw.persons, "#1e3a8a", "#e4e9f7")}${group("Vehicles", nw.vehicles, "#b45309", "#fdf0dc")}${group("Locations", nw.locations, "#047857", "#dcf4ea")}`
      : "";

  const groups = intelByCategory(lines);
  const linesHtml = groups
    .map(
      g => `<div class="intel-cat">
  <div class="intel-cat-head">${esc(g.label)}<span>${g.lines.length}</span></div>
  ${g.lines
    .map(l => {
      const text = highlightSegments(l.sentence, l.matched)
        .map(s =>
          s.hit
            ? `<mark style="background:#fff4d6;color:inherit;padding:0 1px;">${esc(s.text)}</mark>`
            : esc(s.text)
        )
        .join("");
      const pills = [
        l.doubtful
          ? `<span style="${PILL}background:#fff4d6;color:#92400e;border:1px solid #92400e;">${esc(l.doubtWord ?? "May have")}</span>`
          : "",
        l.source === "manual"
          ? `<span style="${PILL}background:#f1f5f9;color:#334155;border:1px solid #94a3b8;">Added by ${esc(l.addedByCIN)}</span>`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<div class="intel-line">
    <div class="intel-time">${esc(l.time ?? "—")}</div>
    <div class="intel-main"><div class="intel-heading">${esc(l.heading)}</div><div class="intel-src">${text}</div></div>
    <div class="intel-pills">${pills}</div>
  </div>`;
    })
    .join("")}
</div>`
    )
    .join("");

  const leftOut = data.leftOut.length;
  const note = leftOut
    ? `<p class="muted-note">${leftOut} sentence${leftOut === 1 ? "" : "s"} on the running sheet ${leftOut === 1 ? "was" : "were"} left out on purpose (said not to have happened, or quoted speech).</p>`
    : "";

  return `${newHtml}${linesHtml}${note}`;
}

/** Extra CSS for the section, added to the Supervisor Summary PDF stylesheet. */
export const SHEET_INTEL_PDF_CSS = `
.intel-sub { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#475569; margin:2px 0 6px; }
.intel-group { margin:0 0 6px; }
.intel-group-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; margin:0 0 3px; }
.intel-group-label span { font-weight:600; color:#94a3b8; }
.intel-cat { border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; margin:0 0 10px; break-inside:avoid; }
.intel-cat-head { display:flex; justify-content:space-between; background:#f1f5f9 !important; padding:5px 10px; font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#1e293b; border-bottom:1px solid #cbd5e1; }
.intel-line { display:grid; grid-template-columns:62px minmax(0,1fr) auto; gap:10px; padding:7px 10px; border-top:1px solid #e2e8f0; }
.intel-cat-head + .intel-line { border-top:none; }
.intel-time { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:10px; color:#64748b; padding-top:1px; }
.intel-heading { font-size:11px; font-weight:700; color:#1e293b; }
.intel-src { font-size:10.5px; color:#475569; margin-top:2px; border-left:2px solid #cbd5e1; padding-left:7px; overflow-wrap:anywhere; }
.intel-pills { display:flex; flex-direction:column; align-items:flex-end; gap:3px; }
`;
