import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, FileDown, Info } from "lucide-react";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";

interface PatternOfLifeLocationRow {
  entityKey: string;
  label: string;
  counts: number[];
  total: number;
}
interface PeakCell {
  entityKey: string;
  label: string;
  bucketIndex: number;
  count: number;
}
interface HomePresencePercent {
  home: number;
  away: number;
  unknown: number;
}
interface PatternOfLifeData {
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
  peakCell: PeakCell | null;
  homeAddressKnown: boolean;
  homeAddressGeocoded: boolean;
  homeAddressMentioned: boolean;
  homeAddressLabel: string | null;
  homePresence: HomePresencePercent[] | null;
  homeLikelyRanges: Array<{ startBucket: number; endBucket: number }> | null;
  homeAwayRanges: Array<{ startBucket: number; endBucket: number }> | null;
  departureHistogram: number[] | null;
  arrivalHistogram: number[] | null;
  peakDepartureBucket: number | null;
  peakArrivalBucket: number | null;
}

// ── Colour + formatting helpers ─────────────────────────────────────────────

function cellFillStyle(count: number, max: number): React.CSSProperties {
  if (count === 0) return { backgroundColor: "rgba(148,163,184,0.10)" };
  const alpha = 0.14 + (count / Math.max(1, max)) * 0.76;
  return { backgroundColor: `rgba(37,99,235,${alpha.toFixed(2)})` };
}
function cellTextClass(count: number, max: number): string {
  const alpha = 0.14 + (count / Math.max(1, max)) * 0.76;
  return count > 0 && alpha > 0.55 ? "text-white" : "text-blue-900";
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

const CONFIDENCE_LABEL: Record<string, string> = {
  low: "Low confidence — based on very few observations",
  moderate: "Moderate confidence — improves as more observations are certified",
  high: "High confidence",
};

// ── PDF export ───────────────────────────────────────────────────────────────

function buildPatternOfLifeHtml(data: PatternOfLifeData): string {
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
  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

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
    `<tr><td style="font-size:9px;font-weight:700;color:#64748b">${esc(leadColLabel)}</td>${data.timeBuckets
      .map(
        l =>
          `<td style="font-size:9px;font-weight:700;color:#64748b;text-align:center;text-transform:uppercase">${l}</td>`
      )
      .join(
        "<td style='width:4px'></td>"
      )}${trailColLabel ? `<td style="font-size:9px;font-weight:700;color:#64748b;text-align:right">${esc(trailColLabel)}</td>` : ""}</tr>`;
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
      return `<tr><td style="font-size:10px;color:${GREY_TEXT};padding-right:6px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(row.label)}</td>${cells}<td style="font-size:10px;font-weight:700;text-align:right;padding-left:6px">${row.total}</td></tr>`;
    })
    .join("");

  let homeSectionBody: string;
  if (!data.homeAddressKnown) {
    homeSectionBody = "";
  } else if (!data.homePresence) {
    const reason = !data.homeAddressMentioned
      ? "This address hasn't been narrated as a visit in any certified observation yet — it only appears on the target's registry card so far."
      : !data.homeAddressGeocoded
        ? "Mentioned in observations, but the address couldn't be geocoded yet."
        : `Mentioned in observations, but none of them use clear arrival/departure language yet (e.g. "arrived at", "departed") — this fills in as more are certified.`;
    homeSectionBody = `<div style="margin-bottom:16px">
      <div class="section-title">Home Presence</div>
      <p style="font-size:10px;color:#64748b;margin-bottom:6px">${esc(data.homeAddressLabel)} (registered home address)</p>
      <p style="font-size:10px;color:#64748b;background:#f8fafc;border:1px solid ${GREY_BORDER};border-radius:6px;padding:8px 10px">${esc(reason)}</p>
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
    homeSectionBody = `<div style="margin-bottom:16px">
      <div class="section-title">Home Presence</div>
      <p style="font-size:10px;color:#64748b;margin-bottom:8px">${esc(data.homeAddressLabel)} (registered home address)</p>
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
  const homeSection = homeSectionBody;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RunLog — Pattern of Life: ${esc(data.targetName)}</title>
<style>* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; } body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:28px 32px 22px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID} !important; margin-bottom:14px; }
.entity-name { font-size:22px; font-weight:700; } .gen-time { font-size:9px; opacity:0.6; margin-top:12px; }
.content { padding:20px 32px; } .section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin-bottom:10px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.footer { margin-top:32px; padding-top:12px; border-top:1px solid ${GREY_BORDER}; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
table { border-collapse:collapse; width:100%; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-label">RunLog Intelligence — Pattern of Life</div>
  <div class="entity-name">${esc(data.targetName)}</div>
  <div style="font-size:12px;opacity:0.75;margin-top:4px">${esc(data.operationName)}</div>
  <div class="gen-time">Generated: ${generatedAt} &middot; ${data.observationCount} observations analyzed (${data.geocodedObservationCount} geocoded)</div>
</div>
<div class="content">
  <div style="margin-bottom:16px">
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
  ${homeSection}
  <div class="footer"><span>RunLog — Pattern of Life Report</span><span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span></div>
</div>
${buildExportPreviewCloseBar()}
</body></html>`;
}

// ── Main component ──────────────────────────────────────────────────────────

export default function IntelligencePatternOfLife() {
  const [operationId, setOperationId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);

  const { data: operations } = trpc.operation.list.useQuery();
  const { data: targets } = trpc.target.list.useQuery(
    { operationId: operationId! },
    { enabled: operationId != null }
  );

  useEffect(() => {
    setTargetId(null);
  }, [operationId]);

  const {
    data: rawData,
    isLoading,
    isFetching,
  } = trpc.intelligence.getPatternOfLife.useQuery(
    { operationId: operationId!, targetId: targetId! },
    { enabled: operationId != null && targetId != null }
  );
  const data = rawData as PatternOfLifeData | undefined;

  const dayTimeMax = useMemo(
    () => Math.max(1, ...(data?.dayTimeGrid.flat() ?? [0])),
    [data]
  );
  const locMax = useMemo(
    () =>
      Math.max(1, ...(data?.locationTimeGrid.flatMap(r => r.counts) ?? [0])),
    [data]
  );
  const depMax = useMemo(
    () => Math.max(1, ...(data?.departureHistogram ?? [0])),
    [data]
  );
  const arrMax = useMemo(
    () => Math.max(1, ...(data?.arrivalHistogram ?? [0])),
    [data]
  );

  function exportPdf() {
    if (!data) return;
    const html = buildPatternOfLifeHtml(data);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  const likelyHome = data ? formatRanges(data.homeLikelyRanges, 12) : null;
  const likelyAway = data ? formatRanges(data.homeAwayRanges, 12) : null;

  return (
    <div className="flex flex-col">
      {/* ── Header: who this report is about, and the export action,
          combined into one banner ── */}
      <div className="rounded-lg bg-gradient-to-r from-blue-900 to-blue-800 flex items-start justify-between gap-3 px-4 py-3.5 mb-4 mx-1">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200 mb-1">
            Pattern of Life
          </p>
          <h1 className="text-xl font-bold text-white truncate">
            {data ? data.targetName : "Select a target"}
          </h1>
          {data && (
            <p className="text-xs text-blue-200 mt-0.5 truncate">
              {data.operationName}
            </p>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={exportPdf}
          disabled={!data}
          className="shrink-0 border-blue-300/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        >
          <FileDown className="w-4 h-4 mr-1.5" /> Export PDF
        </Button>
      </div>

      {/* ── Selector ── */}
      <div className="flex flex-wrap items-center gap-3 px-1 mb-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Operation
          </span>
          <Select
            value={operationId != null ? String(operationId) : undefined}
            onValueChange={v => setOperationId(Number(v))}
          >
            <SelectTrigger className="w-48 h-9 text-xs">
              <SelectValue placeholder="Select an operation…" />
            </SelectTrigger>
            <SelectContent>
              {(operations ?? []).map(op => (
                <SelectItem key={op.id} value={String(op.id)}>
                  {op.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Target
          </span>
          <Select
            value={targetId != null ? String(targetId) : undefined}
            onValueChange={v => setTargetId(Number(v))}
            disabled={operationId == null}
          >
            <SelectTrigger className="w-48 h-9 text-xs">
              <SelectValue placeholder="Select a target…" />
            </SelectTrigger>
            <SelectContent>
              {(targets ?? []).map(t => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {operationId == null || targetId == null ? (
        <div className="flex-1 flex items-center justify-center py-16 text-center">
          <div>
            <Activity className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Select an operation and a target to see their pattern of life.
            </p>
          </div>
        </div>
      ) : isLoading || isFetching ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : !data || !data.sufficientData ? (
        <div className="flex-1 flex items-center justify-center py-16 text-center">
          <div>
            <Activity className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Not enough certified observations yet
              {data ? ` (${data.observationCount} so far)` : ""} — a meaningful
              pattern needs at least a handful of sightings. This improves
              automatically as more running sheets are certified.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4 px-1">
            <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              {data.geocodedObservationCount} of {data.observationCount}{" "}
              observations geocoded
            </span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded border ${
                data.confidence === "high"
                  ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                  : data.confidence === "moderate"
                    ? "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                    : "text-muted-foreground bg-muted/40 border-border/50"
              }`}
            >
              <Info className="w-3 h-3" />
              {CONFIDENCE_LABEL[data.confidence]}
            </span>
          </div>

          {/* Section A — general activity */}
          <div className="rounded-xl border border-border/60 bg-card p-4 mb-4 mx-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Activity by day &amp; time
            </p>
            <p className="text-[11px] text-muted-foreground mb-3">
              Every observation of the target in a running sheet
            </p>
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                <div className="flex items-center gap-0.5 mb-1.5">
                  <div className="w-8 shrink-0" />
                  {data.timeBuckets.map(label => (
                    <div
                      key={label}
                      className="flex-1 text-center text-[7.5px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {label}
                    </div>
                  ))}
                </div>
                {data.dayLabels.map((day, dayIdx) => (
                  <div key={day} className="flex items-center gap-0.5 mb-1">
                    <div className="w-8 shrink-0 text-[10px] font-bold text-muted-foreground">
                      {day}
                    </div>
                    {data.dayTimeGrid[dayIdx].map((count, bucketIdx) => (
                      <div key={bucketIdx} className="flex-1">
                        <div
                          className={`h-6 rounded flex items-center justify-center text-[9px] font-bold ${cellTextClass(count, dayTimeMax)}`}
                          style={cellFillStyle(count, dayTimeMax)}
                        >
                          {count > 0 ? count : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[9px] text-muted-foreground">Fewer</span>
              <div
                className="w-28 h-2 rounded"
                style={{
                  background:
                    "linear-gradient(to right, rgba(37,99,235,0.10), rgba(37,99,235,0.9))",
                }}
              />
              <span className="text-[9px] text-muted-foreground">More</span>
            </div>
          </div>

          {/* Section B — where & when */}
          <div className="rounded-xl border border-border/60 bg-card p-4 mb-4 mx-1">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Where &amp; when
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground">Fewer</span>
                <div
                  className="w-20 h-[7px] rounded"
                  style={{
                    background:
                      "linear-gradient(to right, rgba(37,99,235,0.14), rgba(37,99,235,0.9))",
                  }}
                />
                <span className="text-[9px] text-muted-foreground">More</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Specifically where and when the target is recorded in a running
              sheet present at a location
            </p>
            {data.locationTimeGrid.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No geocoded locations recognised in this target's observations
                yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                  <div className="flex items-center gap-0.5 mb-1.5">
                    <div className="w-36 shrink-0" />
                    {data.timeBuckets.map(label => (
                      <div
                        key={label}
                        className="flex-1 text-center text-[7.5px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {label}
                      </div>
                    ))}
                    <div className="w-8 shrink-0" />
                  </div>
                  {data.locationTimeGrid.map(row => (
                    <div
                      key={row.entityKey}
                      className="flex items-center gap-0.5 mb-1"
                    >
                      <div
                        className="w-36 shrink-0 text-[11px] text-foreground truncate pr-2"
                        title={row.label}
                      >
                        {row.label}
                      </div>
                      {row.counts.map((count, bucketIdx) => {
                        const isPeak =
                          data.peakCell?.entityKey === row.entityKey &&
                          data.peakCell.bucketIndex === bucketIdx;
                        return (
                          <div key={bucketIdx} className="flex-1 relative">
                            <div
                              className={`h-6 rounded flex items-center justify-center text-[9px] font-bold ${cellTextClass(count, locMax)} ${isPeak ? "ring-2 ring-blue-700 ring-offset-1 ring-offset-background" : ""}`}
                              style={cellFillStyle(count, locMax)}
                            >
                              {count > 0 ? count : ""}
                            </div>
                            {isPeak && (
                              <span className="absolute -top-1.5 -right-1.5 text-blue-600 text-[10px]">
                                ★
                              </span>
                            )}
                          </div>
                        );
                      })}
                      <div className="w-8 shrink-0 text-right text-[11px] font-bold text-foreground">
                        {row.total}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section C — home presence */}
          {data.homeAddressKnown && (
            <div className="rounded-xl border border-border/60 bg-card p-4 mb-4 mx-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Home presence
              </p>
              <p className="text-[11px] text-muted-foreground mb-3">
                {data.homeAddressLabel} (registered home address)
              </p>

              {!data.homePresence ? (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-muted/20 border border-border/40">
                  <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    {!data.homeAddressMentioned
                      ? "This address hasn't been narrated as a visit in any certified observation yet — it only appears on the target's registry card so far."
                      : !data.homeAddressGeocoded
                        ? "Mentioned in observations, but the address couldn't be geocoded yet."
                        : `Mentioned in observations, but none of them use clear arrival/departure language yet (e.g. "arrived at", "departed") — this fills in as more are certified.`}
                  </p>
                </div>
              ) : (
                <>
                  {(likelyHome || likelyAway) && (
                    <div className="rounded-lg bg-muted/10 border border-border/40 px-3 py-2.5 mb-3">
                      <p className="text-xs text-foreground">
                        {likelyHome && (
                          <>
                            <span className="font-bold text-blue-700 dark:text-blue-400">
                              Likely home
                            </span>{" "}
                            {likelyHome}
                          </>
                        )}
                        {likelyHome && likelyAway && (
                          <span className="text-muted-foreground"> · </span>
                        )}
                        {likelyAway && (
                          <>
                            <span className="font-bold text-slate-500">
                              likely away
                            </span>{" "}
                            {likelyAway}
                          </>
                        )}
                      </p>
                    </div>
                  )}

                  {(data.departureHistogram || data.arrivalHistogram) && (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                        Typical departure &amp; return times
                      </p>
                      <div className="flex flex-col gap-4">
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-2">
                            Departs home
                            {data.peakDepartureBucket != null && (
                              <span className="font-bold text-blue-700 dark:text-blue-400">
                                {" "}
                                — usually{" "}
                                {data.timeBuckets[data.peakDepartureBucket]}
                              </span>
                            )}
                          </p>
                          <div className="flex items-end gap-0.5 h-16">
                            {(data.departureHistogram ?? []).map((v, i) => (
                              <div
                                key={i}
                                className="flex flex-col items-center flex-1 gap-1"
                              >
                                <span className="text-[7px] font-bold text-foreground h-2.5">
                                  {v > 0 ? v : ""}
                                </span>
                                <div
                                  className={`w-full rounded-t ${i === data.peakDepartureBucket ? "ring-2 ring-blue-700" : ""}`}
                                  style={{
                                    height: `${v === 0 ? 2 : Math.round((v / depMax) * 32) + 5}px`,
                                    backgroundColor:
                                      i === data.peakDepartureBucket
                                        ? "#2563eb"
                                        : "#93c5fd",
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-0.5 mt-1">
                            {data.timeBuckets.map(l => (
                              <span
                                key={l}
                                className="text-[6px] text-muted-foreground flex-1 text-center"
                              >
                                {l}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-2">
                            Returns home
                            {data.peakArrivalBucket != null && (
                              <span
                                className="font-bold"
                                style={{ color: "#0d9488" }}
                              >
                                {" "}
                                — usually{" "}
                                {data.timeBuckets[data.peakArrivalBucket]}
                              </span>
                            )}
                          </p>
                          <div className="flex items-end gap-0.5 h-16">
                            {(data.arrivalHistogram ?? []).map((v, i) => (
                              <div
                                key={i}
                                className="flex flex-col items-center flex-1 gap-1"
                              >
                                <span className="text-[7px] font-bold text-foreground h-2.5">
                                  {v > 0 ? v : ""}
                                </span>
                                <div
                                  className={`w-full rounded-t ${i === data.peakArrivalBucket ? "ring-2" : ""}`}
                                  style={{
                                    height: `${v === 0 ? 2 : Math.round((v / arrMax) * 32) + 5}px`,
                                    backgroundColor:
                                      i === data.peakArrivalBucket
                                        ? "#0d9488"
                                        : "#5eead4",
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-0.5 mt-1">
                            {data.timeBuckets.map(l => (
                              <span
                                key={l}
                                className="text-[6px] text-muted-foreground flex-1 text-center"
                              >
                                {l}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-muted/20 border border-border/40 mx-1 mb-4">
            <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground">
              Based on {data.observationCount} certified observations (
              {data.geocodedObservationCount} geocoded) for this target within{" "}
              {data.operationName}. Home presence is inferred between
              consecutive departed/arrived observations, not directly observed
              every hour; hours with no bracketing observation on the same day
              are marked Unknown. A matching departed/arrived pair at the same
              address counts as a single visit. Reliability grows with the
              number of certified observations.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
