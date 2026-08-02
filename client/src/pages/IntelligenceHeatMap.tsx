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
import { Flame, MapPin } from "lucide-react";

// Cool → hot, six stops — used for both the map's heat gradient and the
// Top Locations intensity dots, so the two stay visually consistent.
const HEAT_RAMP = [
  "#2f6fed",
  "#1fb6c9",
  "#7bc142",
  "#f2c230",
  "#f0862c",
  "#dd3a3a",
];

type WhenMode = "sheet" | "last7" | "last30" | "custom";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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
  const colourFor = (count: number) => {
    const idx = Math.min(
      HEAT_RAMP.length - 1,
      Math.floor((count / maxCount) * (HEAT_RAMP.length - 1))
    );
    return HEAT_RAMP[idx];
  };

  const mapRef = useRef<google.maps.Map | null>(null);
  const heatmapRef = useRef<google.maps.visualization.HeatmapLayer | null>(
    null
  );

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps?.visualization) return;
    heatmapRef.current?.setMap(null);
    if (!locations || locations.length === 0) return;

    const points = locations.map(l => ({
      location: new google.maps.LatLng(l.lat, l.lng),
      weight: l.count,
    }));
    heatmapRef.current = new google.maps.visualization.HeatmapLayer({
      data: points,
      map: mapRef.current,
      radius: 40,
      gradient: [
        "rgba(47,111,237,0)",
        "rgba(47,111,237,1)",
        "rgba(31,182,201,1)",
        "rgba(123,193,66,1)",
        "rgba(242,194,48,1)",
        "rgba(240,134,44,1)",
        "rgba(221,58,58,1)",
      ],
    });

    const bounds = new google.maps.LatLngBounds();
    points.forEach(p => bounds.extend(p.location));
    mapRef.current.fitBounds(bounds, 48);
  }, [locations]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3 px-1 pb-3">
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
                { value: "sheet", label: "Running Sheet" },
                { value: "last7", label: "Last 7 Days" },
                { value: "last30", label: "Last 30 Days" },
                { value: "custom", label: "Custom…" },
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
