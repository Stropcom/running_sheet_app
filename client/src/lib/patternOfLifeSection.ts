// Shared Pattern of Life grid rendering — the three chart groups (Activity by
// Day & Time, Where & When, Home Presence) as print-ready HTML. Used by both
// the standalone Pattern of Life page's own PDF export and the Intelligence
// Package builder, which embeds one of these per included target the same
// way it already does for Ego Network diagrams.

export interface PatternOfLifeLocationRow {
  entityKey: string;
  label: string;
  counts: number[];
  total: number;
}
export interface PatternOfLifePeakCell {
  entityKey: string;
  label: string;
  bucketIndex: number;
  count: number;
}
export interface PatternOfLifeSectionData {
  targetName: string;
  operationName: string;
  observationCount: number;
  geocodedObservationCount: number;
  sufficientData: boolean;
  confidence: "low" | "moderate" | "high";
  timeBuckets: string[];
  dayLabels: string[];
  dayTimeGrid: number[][];
  mostActiveDayIndices: number[];
  locationTimeGrid: PatternOfLifeLocationRow[];
  peakCell: PatternOfLifePeakCell | null;
  homeAddressKnown: boolean;
  homeAddressGeocoded: boolean;
  homeAddressMentioned: boolean;
  homeAddressLabel: string | null;
  homePresence: { home: number; away: number; unknown: number }[] | null;
  homeLikelyRanges: Array<{ startBucket: number; endBucket: number }> | null;
  homeAwayRanges: Array<{ startBucket: number; endBucket: number }> | null;
  departureHistogram: number[] | null;
  arrivalHistogram: number[] | null;
  peakDepartureBucket: number | null;
  peakArrivalBucket: number | null;
}

function escHtml(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Bucket index -> its start hour, given the bucket count (e.g. bucket 9 of
 * 12 two-hour buckets starts at 18:00). */
function bucketStartHour(bucketIndex: number, bucketCount: number): number {
  return Math.round((bucketIndex * 24) / bucketCount);
}
function formatRanges(
  ranges: Array<{ startBucket: number; endBucket: number }> | null,
  bucketCount: number
): string | null {
  if (!ranges || ranges.length === 0) return null;
  return ranges
    .map(r => {
      const start = bucketStartHour(r.startBucket, bucketCount);
      const end = bucketStartHour(r.endBucket, bucketCount);
      return `${String(start).padStart(2, "0")}:00–${String(end).padStart(2, "0")}:00`;
    })
    .join(" · ");
}

const BLUE_DARK = "#1e3a8a";
const GREY_TEXT = "#1e293b";
const GREY_BORDER = "#e2e8f0";

/**
 * Renders the Activity by Day & Time, Where & When, and Home Presence chart
 * groups as self-contained (inline-styled) HTML. Callers embed this inside
 * whatever page-level chrome they use — it doesn't assume a particular
 * document shell, only that a `.section-title` class is available (both the
 * standalone Pattern of Life export and the Intelligence Package stylesheet
 * define one).
 */
export function buildPatternOfLifeGridsHtml(
  data: PatternOfLifeSectionData
): string {
  const peak = data.peakCell;

  const cellHtml = (count: number, max: number, ring: boolean) => {
    const alpha = count === 0 ? 0 : 0.14 + (count / max) * 0.76;
    const bg =
      count === 0
        ? "rgba(148,163,184,0.10)"
        : `rgba(37,99,235,${alpha.toFixed(2)})`;
    const color = alpha > 0.55 ? "#fff" : BLUE_DARK;
    const border = ring ? `border:2px solid ${BLUE_DARK};` : "";
    return `<td style="background:${bg};color:${color};text-align:center;font-size:10px;font-weight:700;padding:6px 4px;border-radius:4px;${border}">${count || ""}${ring ? " ★" : ""}</td>`;
  };
  const timeHeaderRow = (leadColLabel: string, trailColLabel?: string) =>
    `<tr><td style="font-size:9px;font-weight:700;color:#64748b">${escHtml(leadColLabel)}</td>${data.timeBuckets
      .map(
        l =>
          `<td style="font-size:9px;font-weight:700;color:#64748b;text-align:center;text-transform:uppercase">${l}</td>`
      )
      .join(
        "<td style='width:4px'></td>"
      )}${trailColLabel ? `<td style="font-size:9px;font-weight:700;color:#64748b;text-align:right">${escHtml(trailColLabel)}</td>` : ""}</tr>`;
  const legendHtml = `<div style="display:flex;align-items:center;gap:6px;margin-top:6px">
    <span style="font-size:9px;color:#64748b">Fewer</span>
    <div style="width:100px;height:7px;border-radius:4px;background:linear-gradient(to right, rgba(37,99,235,0.14), rgba(37,99,235,0.9))"></div>
    <span style="font-size:9px;color:#64748b">More</span>
  </div>`;
  const tealCellHtml = (count: number, max: number, ring: boolean) => {
    const alpha = count === 0 ? 0 : 0.14 + (count / max) * 0.76;
    const bg =
      count === 0
        ? "rgba(148,163,184,0.10)"
        : `rgba(13,148,136,${alpha.toFixed(2)})`;
    const color = alpha > 0.55 ? "#fff" : "#0f766e";
    const border = ring ? "border:2px solid #0d9488;" : "";
    return `<td style="background:${bg};color:${color};text-align:center;font-size:10px;font-weight:700;padding:6px 4px;border-radius:4px;${border}">${count || ""}</td>`;
  };
  const tealLegendHtml = `<div style="display:flex;align-items:center;gap:6px;margin-top:6px">
    <span style="font-size:9px;color:#64748b">Fewer</span>
    <div style="width:100px;height:7px;border-radius:4px;background:linear-gradient(to right, rgba(13,148,136,0.14), rgba(13,148,136,0.9))"></div>
    <span style="font-size:9px;color:#64748b">More</span>
  </div>`;

  const dayTimeMax = Math.max(1, ...data.dayTimeGrid.flat());
  const dayTimeRows = data.dayLabels
    .map((day, dayIdx) => {
      const cells = data.dayTimeGrid[dayIdx]
        .map(count => cellHtml(count, dayTimeMax, false))
        .join("<td style='width:4px'></td>");
      return `<tr><td style="font-size:9px;font-weight:700;color:#64748b;padding-right:6px">${day}</td>${cells}</tr>`;
    })
    .join("");

  const locMax = Math.max(1, ...data.locationTimeGrid.flatMap(r => r.counts));
  const locRows = data.locationTimeGrid
    .map(row => {
      const cells = row.counts
        .map((count, bucketIdx) =>
          cellHtml(
            count,
            locMax,
            peak?.entityKey === row.entityKey && peak.bucketIndex === bucketIdx
          )
        )
        .join("<td style='width:4px'></td>");
      return `<tr><td style="font-size:10px;color:${GREY_TEXT};padding-right:6px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(row.label)}</td>${cells}<td style="font-size:10px;font-weight:700;text-align:right;padding-left:6px">${row.total}</td></tr>`;
    })
    .join("");

  let homeSection: string;
  if (!data.homeAddressKnown) {
    homeSection = "";
  } else if (!data.homePresence) {
    const reason = !data.homeAddressMentioned
      ? "This address hasn't been narrated as a visit in any certified observation yet — it only appears on the target's registry card so far."
      : !data.homeAddressGeocoded
        ? "Mentioned in observations, but the address couldn't be geocoded yet."
        : `Mentioned in observations, but none of them use clear arrival/departure language yet (e.g. "arrived at", "departed") — this fills in as more are certified.`;
    homeSection = `<div style="margin-bottom:16px">
      <div class="section-title">Home Presence</div>
      <p style="font-size:10px;color:#64748b;margin-bottom:6px">${escHtml(data.homeAddressLabel)} (registered home address)</p>
      <p style="font-size:10px;color:#64748b;background:#f8fafc;border:1px solid ${GREY_BORDER};border-radius:6px;padding:8px 10px">${escHtml(reason)}</p>
    </div>`;
  } else {
    const depMax = Math.max(1, ...(data.departureHistogram ?? []));
    const arrMax = Math.max(1, ...(data.arrivalHistogram ?? []));
    const departCells = (data.departureHistogram ?? [])
      .map((count, i) =>
        cellHtml(count, depMax, i === data.peakDepartureBucket)
      )
      .join("<td style='width:4px'></td>");
    const arriveCells = (data.arrivalHistogram ?? [])
      .map((count, i) =>
        tealCellHtml(count, arrMax, i === data.peakArrivalBucket)
      )
      .join("<td style='width:4px'></td>");
    homeSection = `<div style="margin-bottom:16px">
      <div class="section-title">Home Presence</div>
      <p style="font-size:10px;color:#64748b;margin-bottom:8px">${escHtml(data.homeAddressLabel)} (registered home address)</p>
      <p style="font-size:11px;margin-bottom:12px">
        ${formatRanges(data.homeLikelyRanges, 12) ? `<strong style="color:${BLUE_DARK}">Likely home</strong> ${formatRanges(data.homeLikelyRanges, 12)}` : ""}
        ${formatRanges(data.homeAwayRanges, 12) ? ` &middot; <strong style="color:#64748b">likely away</strong> ${formatRanges(data.homeAwayRanges, 12)}` : ""}
      </p>
      <p style="font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:4px">Departs home</p>
      <p style="font-size:10px;color:${GREY_TEXT};margin-bottom:6px">${data.peakDepartureBucket != null ? `<strong>Usually ${data.timeBuckets[data.peakDepartureBucket]}</strong>` : "Not yet clear"}</p>
      <table>${timeHeaderRow("")}<tr><td></td>${departCells}</tr></table>
      ${legendHtml}
      <p style="font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin:12px 0 4px">Returns home</p>
      <p style="font-size:10px;color:${GREY_TEXT};margin-bottom:6px">${data.peakArrivalBucket != null ? `<strong>Usually ${data.timeBuckets[data.peakArrivalBucket]}</strong>` : "Not yet clear"}</p>
      <table>${timeHeaderRow("")}<tr><td></td>${arriveCells}</tr></table>
      ${tealLegendHtml}
    </div>`;
  }

  return `<div style="margin-bottom:16px">
    <div class="section-title">Activity by Day &amp; Time</div>
    <p style="font-size:10px;color:#64748b;margin-bottom:6px">Every observation of the target in a running sheet</p>
    <table>${timeHeaderRow("")}${dayTimeRows}</table>
    ${legendHtml}
  </div>
  <div style="margin-bottom:16px">
    <div class="section-title">Where &amp; When</div>
    <p style="font-size:10px;color:#64748b;margin-bottom:6px">Specifically where and when the target is recorded in a running sheet present at a location (★ = peak)</p>
    <table>${timeHeaderRow("", "Total")}${locRows}</table>
    ${legendHtml}
  </div>
  ${homeSection}`;
}
