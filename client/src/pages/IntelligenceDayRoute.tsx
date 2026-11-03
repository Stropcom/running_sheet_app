import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { FileDown, MapPin, RefreshCw, Route as RouteIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORM_LABEL } from "@/lib/formKit";
import {
  ROW_ITEM,
  SECTION_BAND,
  SECTION_CARD,
  SECTION_COUNT,
  SECTION_TITLE,
} from "@/lib/pageKit";
import { buildDayRouteHtml, longDay } from "@/lib/dayRouteExport";
import {
  ROUTE_GAP,
  buildDayRoute,
  legText,
  routeDays,
  staticMapInput,
  stopTimes,
  type DayRoutePlace,
} from "@shared/dayRoute";
import { formatDwell, placeKindLabel } from "@shared/placesReport";

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums leading-snug text-foreground">
        {value}
      </p>
      <p className="truncate text-xs text-foreground/70" title={sub}>
        {sub || " "}
      </p>
    </div>
  );
}

/** "Tue 3 Nov 2026" for the day picker. */
function shortDay(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function IntelligenceDayRoute() {
  const [operationId, setOperationId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [dateISO, setDateISO] = useState<string | null>(null);

  const { data: operations } = trpc.operation.list.useQuery();
  const { data: targets } = trpc.target.list.useQuery(
    { operationId: operationId! },
    { enabled: operationId != null }
  );
  useEffect(() => {
    setTargetId(null);
  }, [operationId]);
  useEffect(() => {
    setDateISO(null);
  }, [operationId, targetId]);

  const query = trpc.intelligence.getTargetPlaces.useQuery(
    { operationId: operationId!, targetId: targetId! },
    { enabled: operationId != null && targetId != null }
  );
  const data = query.data;

  const places = useMemo<DayRoutePlace[]>(
    () => (data?.places ?? []) as DayRoutePlace[],
    [data]
  );
  const days = useMemo(() => routeDays(places), [places]);
  // The newest day with visits, until one is chosen.
  const day = dateISO ?? days[0]?.dateISO ?? null;
  const route = useMemo(
    () => (day ? buildDayRoute(places, day) : null),
    [places, day]
  );

  const placeKeys = useMemo(
    () => route?.places.map(p => p.placeKey) ?? [],
    [route]
  );
  const coordsQuery = trpc.intelligence.getPlaceCoords.useQuery(
    { operationId: operationId!, targetId: targetId!, placeKeys },
    {
      enabled: operationId != null && targetId != null && placeKeys.length > 0,
      staleTime: 5 * 60_000,
    }
  );
  const coordsOf = useMemo(() => {
    const m = new Map(
      (coordsQuery.data ?? []).map(c => [
        c.placeKey,
        { lat: c.lat, lng: c.lng },
      ])
    );
    return (k: string) => m.get(k) ?? null;
  }, [coordsQuery.data]);
  const mapInput = useMemo(
    () => (route && coordsQuery.data ? staticMapInput(route, coordsOf) : null),
    [route, coordsQuery.data, coordsOf]
  );
  const mapQuery = trpc.rsMapping.getStaticMapImage.useQuery(
    { ...mapInput!, size: "800x500" },
    { enabled: mapInput != null, staleTime: 5 * 60_000, retry: false }
  );
  const mapDataUrl = mapQuery.data?.dataUrl ?? null;
  const located = mapInput?.waypoints.length ?? 0;

  function exportPdf() {
    if (!data || !route) return;
    const html = buildDayRouteHtml({
      targetName: data.targetName,
      operationName: data.operationName,
      route,
      mapDataUrl,
    });
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 800);
  }

  const mapWaiting =
    route != null &&
    (coordsQuery.isLoading || (mapInput != null && mapQuery.isLoading));

  return (
    <div className="flex flex-col gap-3 px-1">
      <section className={SECTION_CARD}>
        <div className={`${SECTION_BAND} flex-wrap`}>
          <RouteIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className={`${SECTION_TITLE} whitespace-nowrap`}>Day Route</h2>
          {route && (
            <span className={`${SECTION_COUNT} whitespace-nowrap`}>
              {route.stats.stops} stop{route.stats.stops === 1 ? "" : "s"}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportPdf}
              disabled={!route || mapWaiting}
            >
              <FileDown className="mr-1.5 h-4 w-4" />
              Export PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void query.refetch()}
              disabled={!data || query.isFetching}
            >
              <RefreshCw
                className={`mr-1.5 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
        <p className="mb-3 text-sm text-foreground/70">
          {data
            ? `Where ${data.targetName} went on one day — ${data.operationName}, from running sheet rows (certified or not).`
            : "Where a target went on one day, in order, with the time at each place — from running sheet rows, certified or not."}
        </p>

        <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
          <div className="min-w-0">
            <span className={FORM_LABEL}>Operation</span>
            <Select
              value={operationId != null ? String(operationId) : undefined}
              onValueChange={v => setOperationId(Number(v))}
            >
              <SelectTrigger className="w-full">
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
          <div className="min-w-0">
            <span className={FORM_LABEL}>Target</span>
            <Select
              value={targetId != null ? String(targetId) : undefined}
              onValueChange={v => setTargetId(Number(v))}
              disabled={operationId == null}
            >
              <SelectTrigger className="w-full">
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
          <div className="min-w-0">
            <span className={FORM_LABEL}>Day</span>
            <Select
              value={day ?? undefined}
              onValueChange={setDateISO}
              disabled={days.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No days recorded" />
              </SelectTrigger>
              <SelectContent>
                {days.map(d => (
                  <SelectItem key={d.dateISO} value={d.dateISO}>
                    {shortDay(d.dateISO)} · {d.stops} stop
                    {d.stops === 1 ? "" : "s"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {operationId == null || targetId == null ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Select an operation and a target to see where they went on a day.
          </p>
        </div>
      ) : query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : !route ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No day recorded for this target yet. A day appears once a running
            sheet row puts them at a place.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
            <Tile
              label="Stops"
              value={route.stats.stops}
              sub={
                route.stats.returns
                  ? `${route.stats.returns} return visit${route.stats.returns === 1 ? "" : "s"}`
                  : longDay(route.dateISO)
              }
            />
            <Tile
              label="Different places"
              value={route.stats.places}
              sub={`${located} on the map`}
            />
            <Tile
              label="Time at places"
              value={
                route.stats.minutesAtPlaces
                  ? formatDwell(route.stats.minutesAtPlaces)
                  : "—"
              }
              sub="only stops with a departure logged"
            />
            <Tile
              label="Gaps with no rows"
              value={route.stats.gaps}
              sub="an hour or more"
            />
          </div>

          <div className="grid grid-cols-2 items-start gap-3 max-lg:grid-cols-1">
            <section className={SECTION_CARD}>
              <div className={SECTION_BAND}>
                <h2 className={SECTION_TITLE}>Route on the map</h2>
                <span className={SECTION_COUNT}>{longDay(route.dateISO)}</span>
              </div>
              {mapWaiting ? (
                <Skeleton className="aspect-[8/5] w-full rounded-lg" />
              ) : mapDataUrl ? (
                <>
                  <img
                    src={mapDataUrl}
                    alt={`Route on ${longDay(route.dateISO)}`}
                    className="aspect-[8/5] w-full rounded-lg border border-border object-cover"
                  />
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-foreground/70">
                    <span className="inline-flex items-center gap-1.5">
                      <i className="inline-block h-[3px] w-5 bg-rose-600" />
                      Between places, rows at both ends
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <i
                        className="inline-block h-[3px] w-5"
                        style={{ background: ROUTE_GAP }}
                      />
                      No rows for an hour or more, or no departure logged
                    </span>
                  </div>
                </>
              ) : (
                <p className="py-8 text-center text-sm text-foreground/70">
                  {located === 0
                    ? "None of these places could be located on the map. The stops are listed beside it."
                    : "The map picture could not be made just now. The stops are listed beside it; try Refresh."}
                </p>
              )}
            </section>

            <section className={SECTION_CARD}>
              <div className={SECTION_BAND}>
                <h2 className={SECTION_TITLE}>Stops in order</h2>
                <span className={SECTION_COUNT}>{route.stats.stops}</span>
              </div>
              <ol className="flex flex-col gap-1.5">
                {route.stops.map((s, i) => {
                  const leg = route.legs[i];
                  return (
                    <li
                      key={`${s.n}-${s.rowId}`}
                      className="flex flex-col gap-1.5"
                    >
                      <div
                        className={`${ROW_ITEM} grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2.5 px-3 py-2`}
                      >
                        <span className="mt-0.5 grid h-6 min-w-6 place-items-center rounded-full bg-rose-600 px-1 text-xs font-bold text-white">
                          {s.pin || s.n}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {s.name}
                            {s.visitNo > 1 && (
                              <span className="ml-2 rounded bg-rose-100 px-1.5 text-xs font-semibold text-rose-800">
                                Visit {s.visitNo}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-foreground/70">
                            {placeKindLabel(s.kind)} ·{" "}
                            <Link
                              href={`/sheet/${s.sheetId}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {s.sheetTitle}
                            </Link>
                          </p>
                        </div>
                        <div className="text-right text-xs tabular-nums text-foreground">
                          <p className="font-mono">{stopTimes(s)}</p>
                          <p className="text-foreground/70">
                            {s.dwellMinutes !== null
                              ? formatDwell(s.dwellMinutes)
                              : "no time logged"}
                          </p>
                        </div>
                      </div>
                      {leg && (
                        <p
                          className={
                            leg.kind === "travel"
                              ? "ml-[13px] border-l-2 border-rose-600 py-0.5 pl-4 text-xs text-foreground/70"
                              : "ml-[13px] rounded-r border-l-2 border-dashed border-amber-700 bg-amber-50 py-1 pl-4 pr-2 text-xs font-semibold text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"
                          }
                        >
                          {legText(leg)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>

          <section className={SECTION_CARD}>
            <div className={SECTION_BAND}>
              <h2 className={SECTION_TITLE}>How this is worked out</h2>
            </div>
            <ul className="grid max-w-[78ch] list-disc gap-1.5 pl-5 text-sm text-foreground/80">
              <li>
                <b>Stops are the same visits the Places Report counts.</b> A row
                that puts the target at a place starts a stop, in time order,
                across every running sheet that day. Rows count whether or not
                they are certified yet.
              </li>
              <li>
                <b>Time at a place</b> is arrival to a departure a row logs.
                With no departure logged the stop stands but its time is left
                out, and the time to the next stop is shown as not known.
              </li>
              <li>
                <b>A gap is shown as a gap.</b> When no row covers an hour or
                more between two places, the line is amber and nothing is filled
                in. A pin is drawn for each place, and a place that cannot be
                located on the map is listed but has no pin.
              </li>
              <li>
                A place is located by the address written for it on the sheet,
                the same as the Heat Map.
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
