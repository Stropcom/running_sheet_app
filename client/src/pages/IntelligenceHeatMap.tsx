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
import { Button } from "@/components/ui/button";
import {
  ROW_ITEM,
  SECTION_BAND,
  SECTION_CARD,
  SECTION_COUNT,
  SECTION_TITLE,
} from "@/lib/pageKit";
import { FORM_LABEL } from "@/lib/formKit";
import {
  HEAT_NUMBER_DISC_PX,
  heatRadiusFor,
  heatRadiusMetres,
  nudgeApart,
} from "@shared/heatMapLayout";
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
  const trueDotsRef = useRef<google.maps.Marker[]>([]);
  const linesRef = useRef<google.maps.Polyline[]>([]);

  // The same number the Top Locations list shows for each place.
  const rankByLabel = useMemo(() => {
    const sorted = [...(locations ?? [])].sort((a, b) => b.count - a.count);
    return new Map(sorted.map((l, i) => [l.label, i + 1]));
  }, [locations]);

  // Google removed the visualization library's HeatmapLayer from the Maps
  // JavaScript API (gone as of v3.65, with deck.gl as their suggested
  // replacement) — this app doesn't pull in third-party map libraries, so
  // density is instead approximated with weighted circles: same HEAT_RAMP
  // colour, radius scaled by count.
  //
  // The circles are sized in metres, which made a one-visit place a few
  // pixels wide once the map zoomed out to fit a whole region. Each circle
  // now keeps a minimum on-screen size at every zoom (shared/heatMapLayout.ts)
  // and has a white outline so it stands out from roads and water. A numbered
  // disc at each place carries its rank (the number in the Top Locations
  // list); places that land on top of each other at a wide zoom have their
  // discs nudged apart, with a thin line back to the true spot.
  useEffect(() => {
    const clear = () => {
      circlesRef.current.forEach(c => c.setMap(null));
      circlesRef.current = [];
      dotsRef.current.forEach(d => d.setMap(null));
      dotsRef.current = [];
      trueDotsRef.current.forEach(d => d.setMap(null));
      trueDotsRef.current = [];
      linesRef.current.forEach(l => l.setMap(null));
      linesRef.current = [];
    };
    clear();
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    if (!locations || locations.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    locations.forEach(l => {
      const color = colourFor(l.count);
      const frac = l.count / maxCount;
      const center = { lat: l.lat, lng: l.lng };
      circlesRef.current.push(
        new google.maps.Circle({
          center,
          radius: heatRadiusMetres(l.count, maxCount),
          map,
          fillColor: color,
          fillOpacity: 0.72,
          strokeColor: "#ffffff",
          strokeOpacity: 0.95,
          strokeWeight: 3,
          // busier places sit underneath, so a small one is never hidden
          zIndex: 100 - Math.round(frac * 50),
          clickable: false,
        })
      );
      const rank = rankByLabel.get(l.label) ?? 0;
      dotsRef.current.push(
        new google.maps.Marker({
          position: center,
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: HEAT_NUMBER_DISC_PX - 2,
            fillColor: "#ffffff",
            fillOpacity: 1,
            strokeColor: color,
            strokeWeight: 2.5,
          },
          label: {
            text: String(rank),
            color: "#1b2333",
            fontSize: "12px",
            fontWeight: "700",
          },
          clickable: false,
          zIndex: 2000 - rank,
        })
      );
      trueDotsRef.current.push(
        new google.maps.Marker({
          position: center,
          map: null,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 3,
            fillColor: "#1b2333",
            fillOpacity: 1,
            strokeWeight: 0,
          },
          clickable: false,
          zIndex: 1500,
        })
      );
      linesRef.current.push(
        new google.maps.Polyline({
          path: [center, center],
          map: null,
          strokeColor: "#1b2333",
          strokeOpacity: 0.55,
          strokeWeight: 2,
          clickable: false,
          zIndex: 1400,
        })
      );
      bounds.extend(center);
    });

    // Sizes and positions that depend on the zoom: circle radius, and the
    // nudge that keeps neighbouring numbers apart.
    const layout = () => {
      const proj = map.getProjection();
      const zoom = map.getZoom();
      if (!proj || zoom == null) return;
      const scale = Math.pow(2, zoom);
      const centres = locations.map(l => {
        const w = proj.fromLatLngToPoint(new google.maps.LatLng(l.lat, l.lng))!;
        return { x: w.x * scale, y: w.y * scale };
      });
      const nudged = nudgeApart(centres);
      locations.forEach((l, i) => {
        circlesRef.current[i]?.setRadius(
          heatRadiusFor(l.count, maxCount, l.lat, zoom)
        );
        const moved =
          Math.hypot(nudged[i].x - centres[i].x, nudged[i].y - centres[i].y) >
          4;
        const at = moved
          ? (proj.fromPointToLatLng(
              new google.maps.Point(nudged[i].x / scale, nudged[i].y / scale)
            ) ?? new google.maps.LatLng(l.lat, l.lng))
          : new google.maps.LatLng(l.lat, l.lng);
        dotsRef.current[i]?.setPosition(at);
        trueDotsRef.current[i]?.setMap(moved ? map : null);
        const line = linesRef.current[i];
        if (line) {
          line.setPath([{ lat: l.lat, lng: l.lng }, at]);
          line.setMap(moved ? map : null);
        }
      });
    };
    const listeners = [
      map.addListener("zoom_changed", layout),
      map.addListener("projection_changed", layout),
      map.addListener("idle", layout),
    ];
    map.fitBounds(bounds, 48);
    layout();
    return () => {
      listeners.forEach(h => h.remove());
      clear();
    };
  }, [locations, maxCount, rankByLabel]);

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

  // Ranked busiest first — the number beside each location is its rank.
  const rows = [...(locations ?? [])].sort((a, b) => b.count - a.count);
  const totalSightings = rows.reduce((n, l) => n + l.count, 0);
  const WHEN_OPTIONS = [
    { value: "last7", label: "7 days" },
    { value: "last30", label: "30 days" },
    { value: "custom", label: "Custom" },
    { value: "sheet", label: "Sheet" },
  ] as const;

  return (
    <section className={SECTION_CARD} aria-labelledby="heat-map-title">
      {/* ── Title band: what this is, how much is shown, the one action ── */}
      <div className={`${SECTION_BAND} flex-wrap justify-between`}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="heat-map-title" className={SECTION_TITLE}>
            Heat Map
          </h2>
          {rows.length > 0 && (
            <span className={SECTION_COUNT}>
              {totalSightings} observation{totalSightings === 1 ? "" : "s"} ·{" "}
              {rows.length} location{rows.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          className="h-9 min-w-28 gap-1.5"
          onClick={handleExportPdf}
          disabled={operationId == null || exporting}
        >
          <Download className="h-4 w-4" />
          {exporting ? "Exporting…" : "Export PDF"}
        </Button>
      </div>

      {/* ── Filters: equal columns ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
        <div className="flex min-w-0 flex-col gap-1">
          <span className={FORM_LABEL}>Operation</span>
          <Select
            value={operationId != null ? String(operationId) : undefined}
            onValueChange={v => setOperationId(Number(v))}
          >
            <SelectTrigger className="h-10 w-full">
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

        <div className="flex min-w-0 flex-col gap-1">
          <span className={FORM_LABEL}>Target</span>
          <Select
            value={targetId != null ? String(targetId) : "all"}
            onValueChange={v => setTargetId(v === "all" ? null : Number(v))}
            disabled={operationId == null}
          >
            <SelectTrigger className="h-10 w-full">
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

        {/* When: four equal parts */}
        <div className="flex min-w-0 flex-col gap-1 sm:col-span-2 lg:col-span-1">
          <span className={FORM_LABEL} id="heat-when-label">
            When
          </span>
          <div
            role="group"
            aria-labelledby="heat-when-label"
            className="grid h-10 grid-cols-4 overflow-hidden rounded-md border border-input bg-background"
          >
            {WHEN_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={whenMode === opt.value}
                onClick={() => setWhenMode(opt.value)}
                disabled={operationId == null}
                className={`border-r border-input text-sm font-bold transition-colors last:border-r-0 disabled:cursor-not-allowed disabled:opacity-50 ${
                  whenMode === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted/60"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {whenMode === "sheet" && operationId != null && (
          <div className="flex min-w-0 flex-col gap-1 sm:col-span-2 lg:col-span-1 lg:col-start-3">
            <span className={FORM_LABEL}>Running sheet</span>
            <Select
              value={sheetId != null ? String(sheetId) : undefined}
              onValueChange={v => setSheetId(Number(v))}
            >
              <SelectTrigger className="h-10 w-full">
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
          <div className="flex min-w-0 flex-col gap-1 sm:col-span-2 lg:col-span-1 lg:col-start-3">
            <span className={FORM_LABEL}>Date range</span>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                aria-label="From"
                className="h-10 min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                aria-label="To"
                className="h-10 min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Map beside the ranked locations (stacked on phone / iPad) ──── */}
      <div className="-mx-4 -mb-4 grid grid-cols-1 overflow-hidden border-t border-border lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative h-[60vh] min-h-[420px] bg-muted/40">
          {operationId == null ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
              <Flame className="h-8 w-8 opacity-40" />
              <p className="text-sm font-medium">
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
              {!isLoading && rows.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-muted-foreground">
                  <MapPin className="h-8 w-8 opacity-40" />
                  <p className="text-sm font-medium">
                    No locations found for this selection.
                  </p>
                </div>
              )}
              {isLoading && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70">
                  <p className="text-sm text-muted-foreground">
                    Loading heat map…
                  </p>
                </div>
              )}
              {!isLoading && rows.length > 0 && (
                <div className="absolute bottom-3 left-3 w-48 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                    Observation density
                  </p>
                  <div
                    className="h-2 rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${HEAT_RAMP.join(",")})`,
                    }}
                  />
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>Fewer</span>
                    <span>More</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <aside
          aria-label="Top locations"
          className="flex flex-col border-t border-border lg:max-h-[60vh] lg:border-l lg:border-t-0"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/70 px-3.5 py-2.5">
            <span className="text-[13px] font-bold uppercase tracking-wide text-foreground">
              Top locations
            </span>
            <span className={SECTION_COUNT}>{rows.length}</span>
          </div>
          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2.5">
            {rows.map((loc, i) => (
              <div
                key={loc.label}
                className={`${ROW_ITEM} grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2.5 px-2.5 py-2.5`}
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded-full text-xs font-extrabold tabular-nums text-white"
                  style={{ background: colourFor(loc.count) }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block break-words text-[13px] font-semibold leading-snug text-foreground">
                    {loc.label}
                  </span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.round((loc.count / maxCount) * 100)}%`,
                        background: colourFor(loc.count),
                      }}
                    />
                  </span>
                </span>
                <span className="text-sm font-bold tabular-nums text-foreground">
                  {loc.count}
                </span>
              </div>
            ))}
            {!isLoading && operationId != null && rows.length === 0 && (
              <p className="px-1 py-4 text-center text-sm text-muted-foreground">
                Nothing to show yet.
              </p>
            )}
            {operationId == null && (
              <p className="px-1 py-2 text-sm text-muted-foreground">
                Pick an operation to rank its locations.
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
