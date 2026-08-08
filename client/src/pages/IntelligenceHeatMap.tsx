import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Flame, MapPin, Download } from "lucide-react";
import { toast } from "sonner";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import {
  HEAT_RAMP,
  heatColourFor,
  buildHeatMapImageHtml,
  buildHeatMapLocationsTableHtml,
  fetchHeatMapStaticImage,
} from "@/lib/heatMapSection";

type WhenMode = "sheet" | "last7" | "last30" | "custom";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── PDF export ─────────────────────────────────────────────────────────────
// Same visual language as the Running Sheet Summary / Intelligence Profile
// exports: dark-blue cover-header banner, light-blue section headers,
// PROTECTED page marking — see SheetSummary.tsx's exportSummaryToPDF for the
// shared convention this mirrors.
function exportHeatMapToPDF(params: {
  operationName: string;
  targetName: string | null;
  whenLabel: string;
  locations: { label: string; count: number; colour: string }[];
  mapImageDataUrl: string | null;
}): boolean {
  const { operationName, targetName, whenLabel, locations, mapImageDataUrl } =
    params;
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

  const mapHtml = buildHeatMapImageHtml(mapImageDataUrl);
  const locationsHtml = buildHeatMapLocationsTableHtml(locations);

  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>RunLog Intelligence Heat Map — ${esc(operationName)}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
@page{ size:A4 landscape; margin:14mm 16mm; @top-center{content:'PROTECTED';font-family:'Roboto',sans-serif;font-size:12px;font-weight:700;color:#dc2626;letter-spacing:0.08em} @bottom-center{content:"Page " counter(page) " of " counter(pages);font-family:'Roboto',sans-serif;font-size:11px;font-weight:700;color:${BLUE_DARK};letter-spacing:0.04em} }
body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:16px 28px 14px; text-align:center; }
.brand-row { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:8px; opacity:0.85; }
.brand-dot { width:9px; height:9px; border-radius:50%; background:${BLUE_MID}; }
.brand-label { font-size:9.5px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID}; }
.main-title { font-size:20px; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; line-height:1.2; }
.op-date-line { font-size:13px; font-weight:600; margin-top:5px; }
.sheet-name { font-size:10.5px; opacity:0.65; margin-top:4px; }
.page-frame { width:100%; border-collapse:collapse; }
.page-frame td { padding:0; border:none; }
tfoot { display:table-footer-group; }
.content { padding:16px 28px 6px; }
.two-col { display:grid; grid-template-columns:1.55fr 1fr; gap:16px; align-items:stretch; }
.two-col .section { margin-bottom:0; display:flex; flex-direction:column; }
.two-col .section-body { flex:1; display:flex; flex-direction:column; }
.section { margin-bottom:14px; border:1px solid ${GREY_BORDER}; border-radius:8px; overflow:hidden; break-inside:avoid; page-break-inside:avoid; }
.section-title { font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:7px 14px; background:${BLUE_LIGHT} !important; border-bottom:1px solid ${GREY_BORDER}; }
.section-body { padding:10px 12px; }
.muted-note { font-size:10px; color:#94a3b8; font-style:italic; }
.summary-table { width:100%; border-collapse:collapse; border:1px solid ${GREY_BORDER}; }
.summary-table th { background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; font-weight:700; font-size:9.5px; text-transform:uppercase; letter-spacing:0.04em; text-align:left; padding:5px 8px; border-bottom:2px solid ${BLUE_DARK}; }
.summary-table td { vertical-align:middle; font-size:10.5px; padding:5px 8px; border-bottom:1px solid ${GREY_BORDER}; }
.summary-table tbody tr:last-child td { border-bottom:none; }
.footer-note { margin:12px 28px 0; padding:10px 0; border-top:1px solid ${GREY_BORDER}; font-size:9px; color:#94a3b8; }
.footer-band { background:${BLUE_DARK} !important; color:#fff !important; padding:7px 28px; display:grid; grid-template-columns:1fr 1fr 1fr; align-items:center; font-size:9px; font-weight:700; letter-spacing:0.04em; }
.footer-band span:first-child { text-align:left; }
.footer-band span:last-child { text-align:right; color:rgba(255,255,255,0.85); text-transform:uppercase; }
.footer-protected { text-align:center; font-weight:800; letter-spacing:0.14em; color:#f87171; text-transform:uppercase; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .section-title { background:${BLUE_LIGHT} !important; } .summary-table th { background:${BLUE_LIGHT} !important; } .footer-band { background:${BLUE_DARK} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-row"><div class="brand-dot"></div><span class="brand-label">RunLog</span></div>
  <div class="main-title">Intelligence Heat Map</div>
  <div class="op-date-line">${esc(operationName)}</div>
  <div class="sheet-name">${targetName ? `${esc(`Target: ${targetName}`)} &middot; ` : ""}${esc(whenLabel)}</div>
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
  <div class="two-col">
    ${section("Map", mapHtml)}
    ${section("Top Locations", locationsHtml)}
  </div>
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

export default function IntelligenceHeatMap() {
  const [operationId, setOperationId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [whenMode, setWhenMode] = useState<WhenMode>("last30");
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());

  const { data: operations } = trpc.operation.list.useQuery();
  const { data: targets } = trpc.target.list.useQuery(
    { operationId: operationId! },
    { enabled: operationId != null }
  );
  const { data: sheets } = trpc.sheet.listByOperation.useQuery(
    { operationId: operationId! },
    { enabled: operationId != null }
  );

  // Reset dependent selections when the operation changes, since a target
  // or running sheet from a different operation is meaningless here.
  useEffect(() => {
    setTargetId(null);
    setSheetId(null);
  }, [operationId]);

  const when = useMemo(() => {
    if (whenMode === "sheet") {
      if (sheetId == null) return null;
      return { mode: "sheet" as const, sheetId };
    }
    if (whenMode === "custom") {
      if (!customFrom || !customTo) return null;
      return {
        mode: "custom" as const,
        startDate: customFrom,
        endDate: customTo,
      };
    }
    return { mode: whenMode };
  }, [whenMode, sheetId, customFrom, customTo]);

  const { data: locations, isLoading } =
    trpc.intelligence.getHeatMapLocations.useQuery(
      { operationId: operationId!, targetId, when: when! },
      { enabled: operationId != null && when != null }
    );

  const maxCount = useMemo(
    () => Math.max(1, ...(locations ?? []).map(l => l.count)),
    [locations]
  );
  const colourFor = (count: number) => heatColourFor(count, maxCount);

  const mapRef = useRef<google.maps.Map | null>(null);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const dotsRef = useRef<google.maps.Marker[]>([]);

  // Google removed the visualization library's HeatmapLayer from the Maps
  // JavaScript API (gone as of v3.65, with deck.gl as their suggested
  // replacement) — this app doesn't pull in third-party map libraries, so
  // density is instead approximated with overlapping, weighted, semi-
  // transparent circles: same HEAT_RAMP colour, radius scaled by count. A
  // small fixed-size dot marks the exact geocoded point at the centre of
  // each circle, since the circle's own radius grows with count and would
  // otherwise obscure exactly where the address sits.
  useEffect(() => {
    circlesRef.current.forEach(c => c.setMap(null));
    circlesRef.current = [];
    dotsRef.current.forEach(d => d.setMap(null));
    dotsRef.current = [];
    if (!mapRef.current || !window.google?.maps) return;
    if (!locations || locations.length === 0) return;

    const RADIUS_MIN_M = 120;
    const RADIUS_MAX_M = 550;
    const bounds = new google.maps.LatLngBounds();
    for (const l of locations) {
      const color = colourFor(l.count);
      const radius =
        RADIUS_MIN_M + (l.count / maxCount) * (RADIUS_MAX_M - RADIUS_MIN_M);
      const circle = new google.maps.Circle({
        center: { lat: l.lat, lng: l.lng },
        radius,
        map: mapRef.current,
        fillColor: color,
        fillOpacity: 0.45,
        strokeColor: color,
        strokeOpacity: 0.85,
        strokeWeight: 1,
        clickable: false,
      });
      circlesRef.current.push(circle);

      const dot = new google.maps.Marker({
        position: { lat: l.lat, lng: l.lng },
        map: mapRef.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 4,
          fillColor: "#ffffff",
          fillOpacity: 1,
          strokeColor: color,
          strokeWeight: 2,
        },
        clickable: false,
        zIndex: 999,
      });
      dotsRef.current.push(dot);

      bounds.extend({ lat: l.lat, lng: l.lng });
    }
    mapRef.current.fitBounds(bounds, 48);
  }, [locations, maxCount]);

  const [exporting, setExporting] = useState(false);

  const handleExportPdf = async () => {
    if (operationId == null) return;
    setExporting(true);
    try {
      let mapImageDataUrl: string | null = null;
      if (locations && locations.length > 0) {
        toast.info("Capturing map…");
        mapImageDataUrl = await fetchHeatMapStaticImage(locations, maxCount);
        if (!mapImageDataUrl) {
          // A failed map snapshot shouldn't block exporting the Top
          // Locations table — the document falls back to a muted note in
          // the Map section instead of erroring out entirely.
          toast.error("Couldn't capture the map image — exporting without it.");
        }
      }

      const operationName =
        (operations ?? []).find((op: any) => op.id === operationId)?.name ??
        "—";
      const targetName =
        targetId != null
          ? ((targets ?? []).find((t: any) => t.id === targetId)?.name ?? null)
          : null;
      const whenLabel =
        whenMode === "sheet"
          ? `Running Sheet — ${(sheets ?? []).find((s: any) => s.id === sheetId)?.title ?? ""}`
          : whenMode === "last7"
            ? "Last 7 Days"
            : whenMode === "last30"
              ? "Last 30 Days"
              : `${customFrom} to ${customTo}`;

      const ok = exportHeatMapToPDF({
        operationName,
        targetName,
        whenLabel,
        locations: (locations ?? []).map(l => ({
          label: l.label,
          count: l.count,
          colour: colourFor(l.count),
        })),
        mapImageDataUrl,
      });
      if (!ok) {
        toast.error("Pop-up blocked. Please allow pop-ups and try again.");
      }
    } catch {
      toast.error("Failed to export heat map.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Filters ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-1 pb-3">
        <div className="flex flex-wrap items-center gap-3">
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
                {(operations ?? []).map((op: any) => (
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
              value={targetId != null ? String(targetId) : "all"}
              onValueChange={v => setTargetId(v === "all" ? null : Number(v))}
              disabled={operationId == null}
            >
              <SelectTrigger className="w-48 h-9 text-xs">
                <SelectValue placeholder="All Targets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Targets</SelectItem>
                {(targets ?? []).map((t: any) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              When
            </span>
            <div className="flex gap-1.5 flex-wrap">
              {(
                [
                  { value: "last7", label: "Last 7 Days" },
                  { value: "last30", label: "Last 30 Days" },
                  { value: "custom", label: "Custom…" },
                  { value: "sheet", label: "Running Sheet" },
                ] as const
              ).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setWhenMode(opt.value)}
                  disabled={operationId == null}
                  className={`px-3 h-9 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 ${
                    whenMode === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted/70"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {whenMode === "sheet" && operationId != null && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sheet
              </span>
              <Select
                value={sheetId != null ? String(sheetId) : undefined}
                onValueChange={v => setSheetId(Number(v))}
              >
                <SelectTrigger className="w-48 h-9 text-xs">
                  <SelectValue placeholder="Select a sheet…" />
                </SelectTrigger>
                <SelectContent>
                  {(sheets ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {whenMode === "custom" && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date range
              </span>
              <div className="flex gap-2 items-center h-9">
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="border border-border/60 rounded-md px-2 h-9 text-xs bg-background text-foreground"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="border border-border/60 rounded-md px-2 h-9 text-xs bg-background text-foreground"
                />
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleExportPdf}
          disabled={operationId == null || exporting}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          {exporting ? "Exporting…" : "Export PDF"}
        </button>
      </div>

      {/* ── Map + Top Locations ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 px-1 pb-1">
        <div className="relative rounded-xl border border-border overflow-hidden bg-muted/20 min-h-[420px]">
          {operationId == null ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Flame className="w-8 h-8 opacity-30" />
              <p className="text-sm">
                Select an Operation to see its heat map.
              </p>
            </div>
          ) : (
            <>
              <MapView
                className="absolute inset-0"
                initialCenter={{ lat: -31.9523, lng: 115.8613 }}
                initialZoom={11}
                onMapReady={map => {
                  mapRef.current = map;
                }}
              />
              {!isLoading && (locations ?? []).length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-background/70 pointer-events-none">
                  <MapPin className="w-8 h-8 opacity-30" />
                  <p className="text-sm">
                    No locations found for this selection.
                  </p>
                </div>
              )}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70 pointer-events-none">
                  <p className="text-sm text-muted-foreground">
                    Loading heat map…
                  </p>
                </div>
              )}
              {!isLoading && (locations ?? []).length > 0 && (
                <div className="absolute left-3 bottom-3 bg-card border border-border rounded-lg px-3 py-2 shadow-sm w-44">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Observation density
                  </p>
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${HEAT_RAMP.join(",")})`,
                    }}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Fewer</span>
                    <span>More</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-3 overflow-y-auto">
          <h3 className="text-xs font-semibold mb-1">Top Locations</h3>
          <p className="text-[11px] text-muted-foreground mb-2">
            {(locations ?? []).length} location
            {(locations ?? []).length === 1 ? "" : "s"}
          </p>
          {(locations ?? []).map(loc => (
            <div
              key={loc.label}
              className="flex items-center gap-2.5 py-2 border-t border-border first:border-t-0"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: colourFor(loc.count) }}
              />
              <span className="flex-1 min-w-0 text-xs font-medium truncate">
                {loc.label}
              </span>
              <span className="text-xs font-bold tabular-nums shrink-0">
                {loc.count}
              </span>
            </div>
          ))}
          {!isLoading &&
            operationId != null &&
            (locations ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Nothing to show yet.
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
