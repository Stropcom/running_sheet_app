import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  Briefcase,
  ChevronDown,
  ChevronUp,
  Coffee,
  Dumbbell,
  FileDown,
  Home,
  Landmark,
  MapPin,
  Plane,
  RefreshCw,
  MoonStar,
  Stethoscope,
  ShoppingBag,
  Trees,
  BookMarked,
  type LucideIcon,
} from "lucide-react";
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
  SECTION_BAND,
  SECTION_CARD,
  SECTION_COUNT,
  SECTION_TITLE,
} from "@/lib/pageKit";
import { buildPlacesReportHtml } from "@/lib/placesReportExport";
import {
  LABELLABLE_KINDS,
  PLACE_KINDS,
  WEEKDAY_SHORT,
  addDaysISO,
  formatClock,
  formatDwell,
  placeKindLabel,
  sortPlaces,
  summarisePlaces,
  type PlaceKind,
  type PlaceKindSource,
  type PlaceRecord,
  type PlaceSort,
  type PlaceSummary,
} from "@shared/placesReport";

// Written out in full — Tailwind's scanner can't see a class built from a name.
const KIND_STYLE: Record<
  PlaceKind,
  { Icon: LucideIcon; tile: string; pill: string; dot: string }
> = {
  home: {
    Icon: Home,
    tile: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300",
    pill: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300",
    dot: "bg-emerald-600 dark:bg-emerald-400",
  },
  work: {
    Icon: Briefcase,
    tile: "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300",
    pill: "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300",
    dot: "bg-indigo-600 dark:bg-indigo-400",
  },
  gym: {
    Icon: Dumbbell,
    tile: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-400/40 dark:bg-orange-400/10 dark:text-orange-300",
    pill: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-400/40 dark:bg-orange-400/10 dark:text-orange-300",
    dot: "bg-orange-600 dark:bg-orange-400",
  },
  food: {
    Icon: Coffee,
    tile: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300",
    pill: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300",
    dot: "bg-amber-600 dark:bg-amber-400",
  },
  shop: {
    Icon: ShoppingBag,
    tile: "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-400/40 dark:bg-cyan-400/10 dark:text-cyan-300",
    pill: "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-400/40 dark:bg-cyan-400/10 dark:text-cyan-300",
    dot: "bg-cyan-600 dark:bg-cyan-400",
  },
  travel: {
    Icon: Plane,
    tile: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-300",
    pill: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-300",
    dot: "bg-blue-600 dark:bg-blue-400",
  },
  leisure: {
    Icon: Trees,
    tile: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-400/40 dark:bg-purple-400/10 dark:text-purple-300",
    pill: "border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-400/40 dark:bg-purple-400/10 dark:text-purple-300",
    dot: "bg-purple-600 dark:bg-purple-400",
  },
  services: {
    Icon: Landmark,
    tile: "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-400/40 dark:bg-teal-400/10 dark:text-teal-300",
    pill: "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-400/40 dark:bg-teal-400/10 dark:text-teal-300",
    dot: "bg-teal-600 dark:bg-teal-400",
  },
  worship: {
    Icon: MoonStar,
    tile: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300",
    pill: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300",
    dot: "bg-emerald-600 dark:bg-emerald-400",
  },
  health: {
    Icon: Stethoscope,
    tile: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-300",
    pill: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-300",
    dot: "bg-rose-600 dark:bg-rose-400",
  },
  registered: {
    Icon: BookMarked,
    tile: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-400/40 dark:bg-violet-400/10 dark:text-violet-300",
    pill: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-400/40 dark:bg-violet-400/10 dark:text-violet-300",
    dot: "bg-violet-600 dark:bg-violet-400",
  },
  other: {
    Icon: MapPin,
    tile: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-300",
    pill: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-300",
    dot: "bg-slate-500 dark:bg-slate-400",
  },
};

const SOURCE_TEXT: Record<PlaceKindSource, string> = {
  "registry-home": "Registered home address",
  "registry-label": "Registered address, labelled in the registry",
  "registry-generic": "Registered address, no label",
  sign: "Recognised from its name or saved sign",
  officer: "Labelled on this report",
  none: "Name not recognised",
};

const PERIODS: Array<{ days: number | null; label: string }> = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: null, label: "All" },
];

const SORTS: Array<{ id: PlaceSort; label: string }> = [
  { id: "visits", label: "Most visits" },
  { id: "time", label: "Longest time" },
  { id: "recent", label: "Seen most recently" },
  { id: "first", label: "First seen" },
];

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-right max-md:text-left">
      <b className="block text-base font-bold leading-tight tabular-nums text-foreground max-md:text-sm">
        {value}
      </b>
      <span className="text-xs text-foreground/70">{label}</span>
    </div>
  );
}

function SummaryTile({
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
        {sub || " "}
      </p>
    </div>
  );
}

function WeekBars({ week }: { week: number[] }) {
  const peak = Math.max(1, ...week);
  return (
    <div
      className="mt-2.5 grid w-fit grid-cols-7 items-end gap-1"
      role="img"
      aria-label={`Visits by day: ${week
        .map((n, i) => `${WEEKDAY_SHORT[i]} ${n}`)
        .join(", ")}`}
    >
      {week.map((n, i) => (
        <div
          key={i}
          className="w-[22px] text-center text-[11px] text-foreground/70"
        >
          <span className="flex h-7 items-end">
            <i
              className={`block w-full rounded-t-[3px] ${
                n ? "bg-primary" : "bg-muted"
              }`}
              style={{
                height: n ? Math.max(4, Math.round((n / peak) * 28)) : 3,
              }}
              title={`${WEEKDAY_SHORT[i]}: ${n} visit${n === 1 ? "" : "s"}`}
            />
          </span>
          {WEEKDAY_SHORT[i][0]}
        </div>
      ))}
    </div>
  );
}

function PlaceRow({
  place,
  open,
  onToggle,
  officerKind,
  onLabel,
  labelling,
}: {
  place: PlaceSummary;
  open: boolean;
  onToggle: () => void;
  officerKind: PlaceKind | null;
  onLabel: (kind: PlaceKind | null) => void;
  labelling: boolean;
}) {
  const style = KIND_STYLE[place.kind];
  const Icon = style.Icon;
  const kindLabel = placeKindLabel(place.kind);
  const usualDays = place.usualDays.map(d => WEEKDAY_SHORT[d]).join(" · ");
  return (
    <article
      className="rounded-lg border border-border bg-background"
      data-testid="place-row"
    >
      <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-3 p-3 max-md:grid-cols-[44px_minmax(0,1fr)]">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-[10px] border-[1.5px] ${style.tile}`}
        >
          <Icon className="h-[22px] w-[22px]" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-foreground">
            {place.name}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span
              className={`inline-flex items-center rounded-full border px-2 text-xs font-semibold ${style.pill}`}
            >
              {kindLabel}
            </span>
            {place.registeredAs && place.registeredAs !== kindLabel && (
              <span className="inline-flex items-center rounded-full border border-border bg-card px-2 text-xs font-semibold text-foreground/80">
                Registered as {place.registeredAs}
              </span>
            )}
            <span className="inline-flex items-center rounded-full border border-border bg-card px-2 text-xs font-medium text-foreground/70">
              {SOURCE_TEXT[place.source]}
            </span>
            {place.isNew && (
              <span className="inline-flex items-center rounded-full border border-primary bg-primary/10 px-2 text-xs font-semibold text-primary">
                New this week
              </span>
            )}
            {place.noDeparture > 0 && (
              <span className="inline-flex items-center rounded-full border border-amber-400 bg-amber-50 px-2 text-xs font-semibold text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300">
                {place.noDeparture} with no departure
              </span>
            )}
          </div>
          <WeekBars week={place.week} />
          {place.usualMinutes !== null && (
            <p className="mt-2 text-[12.5px] text-foreground/70">
              Usually{" "}
              <b className="font-semibold text-foreground">{usualDays}</b>{" "}
              around{" "}
              <b className="font-semibold text-foreground">
                {formatClock(place.usualMinutes)}
              </b>
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-x-5 gap-y-1 max-md:col-span-full max-md:border-t max-md:border-border max-md:pt-2">
          <Stat value={String(place.visits.length)} label="visits" />
          <Stat
            value={place.timedVisits ? formatDwell(place.totalMinutes) : "—"}
            label="recorded"
          />
          <Stat
            value={
              place.averageMinutes !== null
                ? formatDwell(place.averageMinutes)
                : "—"
            }
            label="average stay"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 py-1.5 text-[13px] font-semibold text-primary"
        >
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          {open ? "Hide" : "Show"} the {place.visits.length} visit
          {place.visits.length === 1 ? "" : "s"} and their sheets
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-foreground/70 max-md:ml-0 max-md:w-full">
          Label as
          <select
            aria-label={`Label ${place.name} as`}
            value={officerKind ?? "auto"}
            disabled={labelling}
            onChange={e =>
              onLabel(
                e.target.value === "auto" ? null : (e.target.value as PlaceKind)
              )
            }
            className="h-8 rounded-md border border-input bg-card px-2 text-[13px] text-foreground"
          >
            <option value="auto">Automatic</option>
            {LABELLABLE_KINDS.map(k => (
              <option key={k} value={k}>
                {placeKindLabel(k)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {open && (
        <div className="overflow-x-auto border-t border-border bg-muted/40 px-3 pb-3 pt-2">
          <table className="w-full min-w-[520px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-foreground/70">
                <th className="border-b border-border px-2 py-1">Date</th>
                <th className="border-b border-border px-2 py-1">Arrived</th>
                <th className="border-b border-border px-2 py-1">Left</th>
                <th className="border-b border-border px-2 py-1">Time there</th>
                <th className="border-b border-border px-2 py-1">
                  Running sheet
                </th>
              </tr>
            </thead>
            <tbody>
              {[...place.visits].reverse().map((v, i) => (
                <tr
                  key={`${v.sheetId}-${v.rowId}-${i}`}
                  className="tabular-nums"
                >
                  <td className="border-b border-border px-2 py-1.5">
                    {v.dateISO}
                  </td>
                  <td className="border-b border-border px-2 py-1.5">
                    {v.startMinutes !== null
                      ? formatClock(v.startMinutes)
                      : "—"}
                  </td>
                  <td className="border-b border-border px-2 py-1.5">
                    {v.endMinutes !== null ? (
                      <>
                        {formatClock(v.endMinutes)}
                        {v.endDayOffset > 0 && ` +${v.endDayOffset}`}
                      </>
                    ) : (
                      <span className="inline-flex rounded-full border border-amber-400 bg-amber-50 px-2 text-xs font-semibold text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300">
                        no departure logged
                      </span>
                    )}
                  </td>
                  <td className="border-b border-border px-2 py-1.5">
                    {v.dwellMinutes !== null
                      ? formatDwell(v.dwellMinutes)
                      : "—"}
                  </td>
                  <td className="border-b border-border px-2 py-1.5">
                    <Link
                      href={`/sheet/${v.sheetId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {v.sheetTitle}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export default function IntelligencePlaces() {
  const utils = trpc.useUtils();
  const [operationId, setOperationId] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [periodDays, setPeriodDays] = useState<number | null>(30);
  const [sort, setSort] = useState<PlaceSort>("visits");
  const [hiddenKinds, setHiddenKinds] = useState<Set<PlaceKind>>(new Set());
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  const { data: operations } = trpc.operation.list.useQuery();
  const { data: targets } = trpc.target.list.useQuery(
    { operationId: operationId! },
    { enabled: operationId != null }
  );
  useEffect(() => {
    setTargetId(null);
  }, [operationId]);

  const query = trpc.intelligence.getTargetPlaces.useQuery(
    { operationId: operationId!, targetId: targetId! },
    { enabled: operationId != null && targetId != null }
  );
  const data = query.data;

  const setLabel = trpc.intelligence.setPlaceLabel.useMutation({
    onSuccess: () => {
      void utils.intelligence.getTargetPlaces.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const sinceISO =
    data && periodDays ? addDaysISO(data.todayISO, -(periodDays - 1)) : null;
  const periodLabel =
    periodDays == null ? "all recorded days" : `last ${periodDays} days`;

  const all = useMemo(
    () =>
      data
        ? summarisePlaces(data.places as PlaceRecord[], {
            sinceISO,
            todayISO: data.todayISO,
          })
        : [],
    [data, sinceISO]
  );
  const counts = useMemo(() => {
    const c = new Map<PlaceKind, number>();
    for (const p of all) c.set(p.kind, (c.get(p.kind) ?? 0) + 1);
    return c;
  }, [all]);
  const shown = useMemo(
    () =>
      sortPlaces(
        all.filter(p => !hiddenKinds.has(p.kind)),
        sort
      ),
    [all, hiddenKinds, sort]
  );
  const recognised = shown.filter(p => p.source !== "none");
  const unrecognised = shown.filter(p => p.source === "none");
  const officerKindOf = (key: string): PlaceKind | null =>
    (data?.places.find(p => p.placeKey === key)?.officerKind ??
      null) as PlaceKind | null;

  const visitCount = shown.reduce((s, p) => s + p.visits.length, 0);
  const timeTotal = shown.reduce((s, p) => s + p.totalMinutes, 0);
  const mostVisited = [...shown].sort(
    (a, b) => b.visits.length - a.visits.length
  )[0];
  const longest = [...shown].sort((a, b) => b.totalMinutes - a.totalMinutes)[0];
  const newPlaces = shown.filter(p => p.isNew);

  function toggleKind(k: PlaceKind) {
    setHiddenKinds(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }
  function toggleOpen(key: string) {
    setOpenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function exportPdf() {
    if (!data) return;
    const html = buildPlacesReportHtml({
      targetName: data.targetName,
      operationName: data.operationName,
      periodLabel,
      places: shown,
    });
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  const row = (p: PlaceSummary) => (
    <PlaceRow
      key={p.placeKey}
      place={p}
      open={openKeys.has(p.placeKey)}
      onToggle={() => toggleOpen(p.placeKey)}
      officerKind={officerKindOf(p.placeKey)}
      labelling={setLabel.isPending}
      onLabel={kind =>
        operationId != null &&
        targetId != null &&
        setLabel.mutate(
          {
            operationId,
            targetId,
            placeKey: p.placeKey,
            placeName: p.name,
            kind,
          },
          {
            onSuccess: () =>
              toast.success(
                kind
                  ? `Labelled as ${placeKindLabel(kind)}. Everyone who can see this target sees it.`
                  : "Back to the automatic label."
              ),
          }
        )
      }
    />
  );

  return (
    <div className="flex flex-col gap-3 px-1">
      <section className={SECTION_CARD}>
        <div className={SECTION_BAND}>
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <h2 className={SECTION_TITLE}>Places Report</h2>
          {data && (
            <span className={SECTION_COUNT}>
              {shown.length} place{shown.length === 1 ? "" : "s"}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportPdf}
              disabled={!data || shown.length === 0}
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
            ? `Where ${data.targetName} goes — ${data.operationName}, from running sheet rows (certified or not).`
            : "Where a target goes — home, work, gym, cafe… — from running sheet rows, certified or not."}
        </p>

        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
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
            <span className={FORM_LABEL}>Period</span>
            <div
              className="grid h-9 grid-cols-5 overflow-hidden rounded-md border border-input"
              role="group"
              aria-label="Period"
            >
              {PERIODS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={periodDays === p.days}
                  onClick={() => setPeriodDays(p.days)}
                  className={`border-r border-input text-xs font-semibold last:border-r-0 sm:text-[13px] ${
                    periodDays === p.days
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <span className={FORM_LABEL}>Sort by</span>
            <Select value={sort} onValueChange={v => setSort(v as PlaceSort)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {data && all.length > 0 && (
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="group"
            aria-label="Kinds of place"
          >
            {PLACE_KINDS.filter(k => (counts.get(k.id) ?? 0) > 0).map(k => {
              const on = !hiddenKinds.has(k.id);
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleKind(k.id)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors ${
                    on
                      ? "border-foreground/30 bg-card text-foreground"
                      : "border-border bg-muted/40 text-foreground/50"
                  }`}
                >
                  <i
                    className={`h-2.5 w-2.5 rounded-full ${KIND_STYLE[k.id].dot}`}
                  />
                  {k.label}
                  <span className="font-medium text-foreground/60">
                    {counts.get(k.id)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {operationId == null || targetId == null ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Select an operation and a target to see the places they go.
          </p>
        </div>
      ) : query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        data && (
          <>
            <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
              <SummaryTile
                label="Places"
                value={shown.length}
                sub={mostVisited ? `Most visited: ${mostVisited.name}` : ""}
              />
              <SummaryTile
                label="Visits"
                value={visitCount}
                sub={periodLabel}
              />
              <SummaryTile
                label="Time recorded"
                value={timeTotal ? formatDwell(timeTotal) : "—"}
                sub={
                  longest && longest.totalMinutes
                    ? `Longest: ${longest.name}`
                    : "only visits with a departure logged"
                }
              />
              <SummaryTile
                label="New this week"
                value={newPlaces.length}
                sub={newPlaces.map(p => p.name).join(", ") || "none"}
              />
            </div>

            <section className={SECTION_CARD}>
              <div className={SECTION_BAND}>
                <h2 className={SECTION_TITLE}>Places</h2>
                <span className={SECTION_COUNT}>{shown.length}</span>
              </div>
              {shown.length === 0 ? (
                <p className="py-8 text-center text-sm text-foreground/70">
                  {data.places.length === 0
                    ? "No places recorded for this target yet. A place appears once a running sheet row puts them there."
                    : "No places match these filters."}
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {recognised.map(row)}
                  {unrecognised.length > 0 && (
                    <>
                      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-foreground/70">
                        Not recognised — label a place to group it
                      </p>
                      {unrecognised.map(row)}
                    </>
                  )}
                </div>
              )}
            </section>

            <section className={SECTION_CARD}>
              <div className={SECTION_BAND}>
                <h2 className={SECTION_TITLE}>How this is worked out</h2>
              </div>
              <ul className="grid max-w-[78ch] list-disc gap-1.5 pl-5 text-sm text-foreground/80">
                <li>
                  <b>Rows count whether or not they are certified yet.</b> A
                  place appears because a row puts the target there.
                </li>
                <li>
                  <b>Time at a place</b> is arrival to a departure a row logs.
                  With no departure logged the visit is counted but its time is
                  left out.
                </li>
                <li>
                  <b>The kind of place</b> comes from the target's registered
                  addresses first (home, and any address with a label such as
                  Work), then the place's name or the sign saved for it, then an
                  officer's label here. A registered address still called
                  "Address 3" gives way to a name the place has, such as Gym.
                  Anything nothing recognises stays Other.
                </li>
                <li>
                  <b>Work is never guessed.</b> It shows only for a registered
                  address labelled Work, or a place an officer labels as Work.
                </li>
                <li>
                  A quiet place may only mean nobody was watching that day.
                </li>
              </ul>
            </section>
          </>
        )
      )}
    </div>
  );
}
