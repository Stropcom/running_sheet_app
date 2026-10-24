/// <reference types="@types/google.maps" />
/**
 * Target Predictor on the Map page: a switch in the right-hand pane, a one-line
 * answer at the top of the map, and shaded areas on the map.
 *
 * Every rule (what counts as a similar visit, how the area of the last sighting
 * changes the answer, what the confidence levels mean) is in
 * shared/targetPredictor.ts and is plain counting over this target's own
 * history on the operation — no model, no randomness, nothing sent anywhere.
 * It is a pattern, never a certainty, and is never written to a running sheet.
 *
 * Three pieces, one state (useTargetPredictor):
 *   TargetPredictorSection — the switch and its controls, in the pane
 *   TargetPredictorBanner  — the answer and its confidence, at the top of the map
 *   TargetPredictorOverlay — the shading, the "how far" ring and the pins
 *
 * `google.maps.OverlayView` only exists once the Maps script has loaded, so the
 * overlay subclass is built inside its effect, never at module scope (same rule
 * as lib/divIconOverlay.ts and MapHeatOverlay).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Crosshair } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { trpc } from "@/lib/trpc";
import { metresPerPixel } from "@shared/heatMapLayout";
import {
  AREAS,
  AREA_CLASSES,
  DEFAULT_AREA,
  MIN_SAMPLES,
  NEAR_KEY,
  TIER_LABEL,
  areaFromStreetName,
  describePrediction,
  perthClock,
  predict,
  type AreaClass,
  type PredictorFrom,
  type PredictorInput,
  type PredictorMode,
  type Prediction,
  type Tier,
} from "@shared/targetPredictor";

const WEEKDAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const ON_KEY = "runlog_target_predictor_on";

const TIER_COLOUR: Record<Tier, string> = {
  high: "#0f7a55",
  mid: "#9a6200",
  low: "#8a3b12",
  none: "#566170",
};

function readOn(): boolean {
  try {
    return window.localStorage.getItem(ON_KEY) === "1";
  } catch {
    return false;
  }
}

function hhmm(m: number): string {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export interface TargetPredictorArgs {
  opId: number | null;
  sheetId: number | null;
  targetId: number | null;
}

type SeenKind = "place" | "tap" | "none";

/** One state for the section, the banner and the overlay. */
export function useTargetPredictor({
  opId,
  sheetId,
  targetId,
}: TargetPredictorArgs) {
  const [on, setOnState] = useState<boolean>(readOn);
  const [mode, setMode] = useState<PredictorMode>("next");
  const [clock, setClock] = useState(() => perthClock(new Date()));
  // By hand: the officer chose where he is / was last seen instead of the sheet.
  const [override, setOverride] = useState(false);
  const [pickPlaceKey, setPickPlaceKey] = useState<string | null>(null);
  const [seenKind, setSeenKind] = useState<SeenKind>("place");
  const [seenPlaceKey, setSeenPlaceKey] = useState<string | null>(null);
  const [seenPoint, setSeenPoint] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [seenMinutes, setSeenMinutes] = useState<number | null>(null);
  const [tapRoute, setTapRoute] = useState<string | null>(null);
  const [areaChoice, setAreaChoice] = useState<AreaClass | null>(null);
  const [showShade, setShowShade] = useState(true);
  const [showReach, setShowReach] = useState(true);

  const setOn = useCallback((v: boolean) => {
    setOnState(v);
    try {
      window.localStorage.setItem(ON_KEY, v ? "1" : "0");
    } catch {
      /* private window: fine, it just won't be remembered */
    }
  }, []);

  // The clock moves while it is on, so "how far he could have got" grows.
  useEffect(() => {
    if (!on) return;
    setClock(perthClock(new Date()));
    const id = window.setInterval(
      () => setClock(perthClock(new Date())),
      30_000
    );
    return () => window.clearInterval(id);
  }, [on]);

  // Another target or sheet means the by-hand choices no longer apply.
  useEffect(() => {
    setOverride(false);
    setPickPlaceKey(null);
    setSeenPlaceKey(null);
    setSeenPoint(null);
    setSeenMinutes(null);
    setTapRoute(null);
    setAreaChoice(null);
    setSeenKind("place");
  }, [opId, sheetId, targetId]);

  const ready = on && opId != null && targetId != null;
  const query = trpc.intelligence.getTargetPredictor.useQuery(
    { operationId: opId ?? 0, targetId: targetId ?? 0, sheetId },
    {
      enabled: ready,
      staleTime: 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const data = query.data ?? null;

  const placeByKey = useMemo(
    () => new Map((data?.places ?? []).map(p => [p.placeKey, p])),
    [data]
  );
  // For lists in the pane: "Home — 14 Marine Parade", so a labelled place still
  // says where it is.
  const labelOf = useCallback(
    (key: string) => {
      const p = placeByKey.get(key);
      if (!p) return key;
      return p.kind === "home" || p.kind === "work"
        ? `${p.kind === "home" ? "Home" : "Work"} — ${p.name}`
        : p.name;
    },
    [placeByKey]
  );
  const nameOf = useCallback(
    (key: string) => {
      const p = placeByKey.get(key);
      if (!p) return key;
      return p.kind === "home" ? "Home" : p.kind === "work" ? "Work" : p.name;
    },
    [placeByKey]
  );

  // What the sheet says: only today's entry counts — an old sheet's last row
  // says nothing about where he is now.
  const sheetStart = useMemo(() => {
    const ls = data?.lastSeen;
    if (!ls || !data || ls.dateISO !== data.todayISO) return null;
    if (!placeByKey.has(ls.placeKey)) return null;
    return { ...ls, minutes: Math.min(ls.minutes, clock.minutes) };
  }, [data, placeByKey, clock.minutes]);
  const usingSheet = !!sheetStart && !override;

  const firstPlaceKey = data?.places[0]?.placeKey ?? null;
  const seenAt = Math.min(seenMinutes ?? clock.minutes - 15, clock.minutes);

  const from: PredictorFrom | null = useMemo(() => {
    if (!data) return null;
    if (usingSheet && sheetStart)
      return {
        kind: "place",
        placeKey: sheetStart.placeKey,
        minutes: sheetStart.minutes,
        leaving: sheetStart.leaving,
      };
    if (mode === "next") {
      const key = pickPlaceKey ?? firstPlaceKey;
      return key
        ? {
            kind: "place",
            placeKey: key,
            minutes: clock.minutes,
            leaving: false,
          }
        : null;
    }
    if (seenKind === "none") return { kind: "none" };
    if (seenKind === "tap")
      return seenPoint
        ? {
            kind: "point",
            lat: seenPoint.lat,
            lng: seenPoint.lng,
            minutes: seenAt,
          }
        : null;
    const key = seenPlaceKey ?? firstPlaceKey;
    // Someone looking for him has lost him, so he is taken as having left.
    return key
      ? { kind: "place", placeKey: key, minutes: seenAt, leaving: true }
      : null;
  }, [
    data,
    usingSheet,
    sheetStart,
    mode,
    pickPlaceKey,
    firstPlaceKey,
    clock.minutes,
    seenKind,
    seenPoint,
    seenPlaceKey,
    seenAt,
  ]);

  // The kind of area he was last seen in: chosen by the officer, else read from
  // the street name when it is unmistakable, else the stated default.
  const autoArea: AreaClass | null = useMemo(() => {
    if (mode !== "now" || !from) return null;
    if (from.kind === "place")
      return areaFromStreetName(placeByKey.get(from.placeKey)?.name);
    if (from.kind === "point") return areaFromStreetName(tapRoute);
    return null;
  }, [mode, from, placeByKey, tapRoute]);
  const area: AreaClass = areaChoice ?? autoArea ?? DEFAULT_AREA;
  const areaSource: "chosen" | "street" | "assumed" = areaChoice
    ? "chosen"
    : autoArea
      ? "street"
      : "assumed";

  const input: PredictorInput | null = useMemo(() => {
    if (!data || !from) return null;
    return {
      mode,
      stops: data.stops,
      places: data.places,
      from,
      nowWeekday: clock.weekday,
      nowMinutes: clock.minutes,
      area,
    };
  }, [data, from, mode, clock.weekday, clock.minutes, area]);
  const prediction: Prediction | null = useMemo(
    () => (input ? predict(input) : null),
    [input]
  );
  const headline = useMemo(
    () =>
      prediction && input
        ? describePrediction(prediction, input, nameOf)
        : null,
    [prediction, input, nameOf]
  );

  return {
    on,
    setOn,
    mode,
    setMode,
    clock,
    query,
    data,
    ready,
    override,
    setOverride,
    pickPlaceKey,
    setPickPlaceKey,
    seenKind,
    setSeenKind,
    seenPlaceKey,
    setSeenPlaceKey,
    seenPoint,
    setSeenPoint,
    seenMinutes,
    setSeenMinutes,
    seenAt,
    tapRoute,
    setTapRoute,
    areaChoice,
    setAreaChoice,
    area,
    areaSource,
    showShade,
    setShowShade,
    showReach,
    setShowReach,
    sheetStart,
    usingSheet,
    from,
    input,
    prediction,
    headline,
    nameOf,
    labelOf,
    placeByKey,
    /** "Where now" with the position left for the officer to tap on the map. */
    tapping: on && mode === "now" && !usingSheet && seenKind === "tap",
  };
}
export type TargetPredictorState = ReturnType<typeof useTargetPredictor>;

// ── The pane ─────────────────────────────────────────────────────────────────

const SEG =
  "flex-1 min-w-0 px-2 py-1.5 text-xs font-semibold rounded-lg border-2 transition-colors";

export function TargetPredictorSection({
  p,
  targetName,
  operationName,
  sheetTitle,
}: {
  p: TargetPredictorState;
  targetName: string | null;
  operationName: string | null;
  sheetTitle: string | null;
}) {
  const places = p.data?.places ?? [];
  const pr = p.prediction;
  const reasonNone = p.query.isError
    ? "The predictor isn't available for this target."
    : !targetName
      ? "Select a running sheet that has a target, in the Active RS pane."
      : null;

  return (
    <div className="px-3 py-3 border-b border-border space-y-2">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
        Target Predictor
      </span>
      <button
        onClick={() => p.setOn(!p.on)}
        className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl border-2 active:scale-[0.98] transition-all min-w-0 ${
          p.on
            ? "border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20"
            : "border-border bg-card hover:bg-accent/40"
        }`}
        aria-pressed={p.on}
      >
        <Crosshair
          className={`h-3.5 w-3.5 flex-shrink-0 ${p.on ? "text-violet-500" : "text-muted-foreground"}`}
        />
        <span
          className={`text-xs font-semibold truncate flex-1 text-left ${p.on ? "text-violet-500" : "text-foreground"}`}
        >
          Target predictor
        </span>
        <span
          className={`text-[11px] font-bold uppercase tracking-wide flex-shrink-0 ${p.on ? "text-violet-500" : "text-muted-foreground"}`}
        >
          {p.on ? "On" : "Off"}
        </span>
      </button>

      {p.on && (
        <div className="space-y-2">
          {targetName ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground">
                {targetName}
              </span>
              {operationName ? ` · ${operationName}` : ""}
              {sheetTitle ? ` · ${sheetTitle}` : ""}
              <br />
              From the operation and running sheet selected above, using his
              whole history on this operation.
            </p>
          ) : null}
          {reasonNone && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              {reasonNone}
            </p>
          )}

          {targetName && (
            <>
              <div
                className="flex gap-1.5"
                role="group"
                aria-label="What to predict"
              >
                {(["next", "now"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => p.setMode(m)}
                    aria-pressed={p.mode === m}
                    className={`${SEG} ${
                      p.mode === m
                        ? "border-violet-500/50 bg-violet-500/10 text-violet-500"
                        : "border-border bg-card text-foreground hover:bg-accent/40"
                    }`}
                  >
                    {m === "next" ? "Where next?" : "Where now?"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {p.mode === "next"
                  ? "Where he is likely to go from where he is now."
                  : "Where he may be now — for when the team is looking for him."}{" "}
                Today is {WEEKDAY_LONG[p.clock.weekday]},{" "}
                {hhmm(p.clock.minutes)} Perth time.
              </p>

              {p.query.isLoading && (
                <p className="text-[11px] text-muted-foreground">
                  Reading his history…
                </p>
              )}

              {p.data && places.length === 0 && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  No places on record for this target on this operation yet, so
                  there is nothing to predict from.
                </p>
              )}

              {p.data && places.length > 0 && <PositionControls p={p} />}
              {p.data &&
                places.length > 0 &&
                p.mode === "now" &&
                p.from?.kind !== "none" && <AreaControls p={p} />}

              {p.data && places.length > 0 && (
                <div className="space-y-1 pt-0.5">
                  <label className="flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={p.showShade}
                      onChange={e => p.setShowShade(e.target.checked)}
                    />
                    Show likely areas on the map
                  </label>
                  {p.mode === "now" && (
                    <label className="flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={p.showReach}
                        onChange={e => p.setShowReach(e.target.checked)}
                      />
                      Show how far he could have got
                    </label>
                  )}
                </div>
              )}

              {pr && p.input && <Candidates p={p} pr={pr} />}
              {pr && p.input && <HowWorkedOut p={p} pr={pr} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PositionControls({ p }: { p: TargetPredictorState }) {
  const places = p.data?.places ?? [];
  const label =
    "text-[11px] font-semibold text-muted-foreground uppercase tracking-wide";
  const link = "text-[11px] font-semibold text-violet-500 hover:underline";

  if (p.usingSheet && p.sheetStart) {
    const name = p.labelOf(p.sheetStart.placeKey);
    const verb =
      p.mode === "next"
        ? p.sheetStart.leaving
          ? "Left"
          : "Now at"
        : p.sheetStart.leaving
          ? "Last seen leaving"
          : "Last seen at";
    return (
      <div className="rounded-xl border-2 border-border bg-card px-3 py-2 space-y-0.5">
        <p className="text-xs text-foreground">
          {verb} <span className="font-semibold">{name}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          {hhmm(p.sheetStart.minutes)}, from the running sheet ·{" "}
          <button className={link} onClick={() => p.setOverride(true)}>
            Change
          </button>
        </p>
      </div>
    );
  }

  const none = p.sheetStart ? (
    <button className={link} onClick={() => p.setOverride(false)}>
      Use the running sheet
    </button>
  ) : (
    <span>Nothing logged for him today on the running sheet yet.</span>
  );

  if (p.mode === "next") {
    return (
      <div className="space-y-1">
        <span className={label}>Now at</span>
        <Select
          value={p.pickPlaceKey ?? places[0].placeKey}
          onValueChange={v => p.setPickPlaceKey(v)}
        >
          <SelectTrigger className="w-full h-9 text-xs rounded-xl border-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {places.map(pl => (
              <SelectItem key={pl.placeKey} value={pl.placeKey}>
                {p.labelOf(pl.placeKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">{none}</p>
      </div>
    );
  }

  const value =
    p.seenKind === "none"
      ? "none"
      : p.seenKind === "tap"
        ? "tap"
        : `p:${p.seenPlaceKey ?? places[0].placeKey}`;
  const min = Math.max(0, p.clock.minutes - 180);
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <span className={label}>Last seen</span>
        <Select
          value={value}
          onValueChange={v => {
            if (v === "none") p.setSeenKind("none");
            else if (v === "tap") p.setSeenKind("tap");
            else {
              p.setSeenKind("place");
              p.setSeenPlaceKey(v.slice(2));
            }
          }}
        >
          <SelectTrigger className="w-full h-9 text-xs rounded-xl border-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              Not seen yet — we are starting out
            </SelectItem>
            {places.map(pl => (
              <SelectItem key={pl.placeKey} value={`p:${pl.placeKey}`}>
                {p.labelOf(pl.placeKey)}
              </SelectItem>
            ))}
            <SelectItem value="tap">
              Somewhere else — I will tap the map
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          {p.seenKind === "tap"
            ? p.seenPoint
              ? "Tap the map again to move it."
              : "Tap the map where he was last seen."
            : p.seenKind === "none"
              ? "He has not been seen yet, so this uses his routine for this day and time."
              : none}
        </p>
      </div>
      {p.seenKind !== "none" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className={label}>Last seen at</span>
            <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
              {hhmm(p.seenAt)}
            </span>
          </div>
          <Slider
            min={min}
            max={Math.max(min + 1, p.clock.minutes)}
            step={1}
            value={[Math.max(min, p.seenAt)]}
            onValueChange={v => p.setSeenMinutes(v[0] ?? p.seenAt)}
            aria-label="Time last seen"
          />
        </div>
      )}
    </div>
  );
}

function AreaControls({ p }: { p: TargetPredictorState }) {
  const rule = AREAS[p.area];
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
        Area he was last seen in
      </span>
      <div
        className="grid grid-cols-2 gap-1.5"
        role="group"
        aria-label="Area he was last seen in"
      >
        {AREA_CLASSES.map(a => (
          <button
            key={a}
            onClick={() => p.setAreaChoice(p.areaChoice === a ? null : a)}
            aria-pressed={p.area === a}
            className={`${SEG} ${
              p.area === a
                ? "border-violet-500/50 bg-violet-500/10 text-violet-500"
                : "border-border bg-card text-foreground hover:bg-accent/40"
            }`}
          >
            {AREAS[a].label}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        About{" "}
        <span className="font-semibold text-foreground">{rule.kmh} km/h</span>{" "}
        in this area.{" "}
        {p.areaSource === "chosen"
          ? "Chosen by you."
          : p.areaSource === "street"
            ? "Read from the street name — tap another to change it."
            : "Assumed — the street name doesn't say. Tap the right one."}
      </p>
    </div>
  );
}

function Candidates({ p, pr }: { p: TargetPredictorState; pr: Prediction }) {
  const colour = TIER_COLOUR[pr.tier];
  if (pr.tier === "none" || pr.candidates.length === 0)
    return (
      <p className="text-[11px] leading-snug text-muted-foreground">
        Not enough similar visits to say yet. It improves as more is recorded
        for this target on this operation.
      </p>
    );
  return (
    <div className="space-y-1.5">
      {pr.candidates.slice(0, 4).map(c => {
        const pct = Math.round(c.p * 100);
        const near = c.placeKey === NEAR_KEY;
        const meta = near
          ? `Not one of his usual places. A share set by the kind of area he was last seen in (${AREAS[pr.area].label.toLowerCase()}) — an assumption, not history.`
          : pr.adjusted
            ? `history ${Math.round(c.history * 100)}%${c.km !== null ? ` · ${c.km.toFixed(1)} km from where he was last seen` : ""}${c.arriveMinutes !== null ? ` · usually there about ${hhmm(c.arriveMinutes)}` : ""}`
            : `${c.n} of ${pr.total} similar visits${c.arriveMinutes !== null ? ` · usually there about ${hhmm(c.arriveMinutes)}` : ""}`;
        return (
          <div
            key={c.placeKey}
            className="rounded-xl border-2 border-border bg-card px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
              <span className="truncate">
                {near ? "Somewhere close by" : p.labelOf(c.placeKey)}
              </span>
              <span className="tabular-nums flex-shrink-0">{pct}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: colour }}
              />
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {meta}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function HowWorkedOut({ p, pr }: { p: TargetPredictorState; pr: Prediction }) {
  const [open, setOpen] = useState(false);
  const inp = p.input!;
  const scope =
    pr.scope === "day"
      ? `the same weekday`
      : inp.nowWeekday <= 4
        ? "all weekdays"
        : "all weekend days";
  const f = inp.from;
  const how =
    f.kind === "none" || f.kind === "point"
      ? `where he usually is at ${hhmm(inp.nowMinutes)}`
      : p.mode === "next" && !f.leaving
        ? `visits to ${p.nameOf(f.placeKey)} that were under way around ${hhmm(inp.nowMinutes)}, then where each went next`
        : `visits to ${p.nameOf(f.placeKey)} that ended within an hour of ${hhmm(f.minutes)}, then where each went next`;
  return (
    <div className="rounded-xl border-2 border-border bg-card px-3 py-2">
      <button
        className="flex w-full items-center justify-between text-xs font-semibold text-foreground"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        How this was worked out
        <span className="text-muted-foreground">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5 text-[11px] leading-snug text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">How:</span> {how} —
            on {scope}, across his whole history on this operation (
            {pr.historyStops} visits). Visits with nothing logged after them are
            left out.
          </p>
          <p>
            <span className="font-semibold text-foreground">Confidence:</span>{" "}
            {TIER_LABEL[pr.tier]}
            {pr.tier === "none"
              ? ` (fewer than ${MIN_SAMPLES} similar visits).`
              : `. ${pr.total} similar visits${pr.topHistoryShare !== null ? `, and ${Math.round(pr.topHistoryShare * 100)}% of them went the same way` : ""}. High needs 12 or more, with 70% or more the same.`}
          </p>
          {p.mode === "now" && pr.adjusted && (
            <p>
              <span className="font-semibold text-foreground">
                Where he was seen:
              </span>{" "}
              {AREAS[pr.area].label}. {AREAS[pr.area].note} The percentages are
              his history, nudged by this — that nudge is an assumption, not
              something he has done.
            </p>
          )}
          {p.mode === "now" && pr.elapsedMinutes > 0 && (
            <p>
              <span className="font-semibold text-foreground">How far:</span>{" "}
              {Math.round(pr.elapsedMinutes)} min at about {AREAS[pr.area].kmh}{" "}
              km/h, so up to {pr.reachKm.toFixed(1)} km from where he was seen —
              the dashed ring, which grows every minute.
            </p>
          )}
          {pr.scope === "group" && (
            <p>Too few on that exact weekday, so {scope} were used.</p>
          )}
          <p>
            A pattern, not a certainty. This is not written to the running
            sheet.
          </p>
        </div>
      )}
    </div>
  );
}

// ── The line at the top of the map ───────────────────────────────────────────

export function TargetPredictorBanner({
  p,
  compact,
}: {
  p: TargetPredictorState;
  compact: boolean;
}) {
  if (!p.on || !p.ready) return null;
  const tier = p.prediction?.tier ?? "none";
  const colour = TIER_COLOUR[tier];
  let main = p.headline?.main;
  let sub = p.headline?.sub;
  if (!p.prediction) {
    if (p.query.isLoading) {
      main = "Target predictor";
      sub = "Reading his history…";
    } else if (p.mode === "now" && p.seenKind === "tap" && !p.usingSheet) {
      main = "Tap the map where he was last seen";
      sub = "Then the predictor can say where he may be.";
    } else if (p.data && p.data.places.length === 0) {
      main = "No prediction yet";
      sub = "No places on record for this target on this operation.";
    } else {
      return null;
    }
  }
  return (
    <div
      className={`absolute z-20 pointer-events-none flex gap-2 rounded-xl border border-border bg-card px-3 py-1.5 shadow-md ${
        compact ? "flex-col items-start" : "items-center"
      }`}
      style={{
        top: compact ? 108 : 10,
        left: compact ? 10 : 280,
        right: compact ? 64 : 164,
        borderLeft: `4px solid ${colour}`,
      }}
      role="status"
      aria-live="polite"
      data-testid="predictor-banner"
    >
      <div className="min-w-0 w-full flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {main}
        </p>
        <p
          className={`text-xs text-muted-foreground ${compact ? "line-clamp-2" : "truncate"}`}
        >
          {sub}
        </p>
      </div>
      <span
        className="flex-shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold"
        style={{ color: colour, borderColor: colour }}
      >
        {TIER_LABEL[tier]}
        {tier !== "none" && p.prediction ? ` · ${p.prediction.total}` : ""}
      </span>
    </div>
  );
}

// ── The shading on the map ───────────────────────────────────────────────────

interface Blob {
  lat: number;
  lng: number;
  /** Pixels at any zoom — the fade keeps a readable size. */
  radiusPx: number;
  opacity: number;
}

function rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function TargetPredictorOverlay({
  p,
  map,
}: {
  p: TargetPredictorState;
  map: google.maps.Map | null;
}) {
  const pr = p.prediction;
  const input = p.input;

  // Tap the map to say where he was last seen.
  const { tapping, setSeenPoint, setTapRoute } = p;
  useEffect(() => {
    if (!map || !tapping || !window.google?.maps) return;
    const l = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      const ll = e.latLng;
      if (!ll) return;
      setSeenPoint({ lat: ll.lat(), lng: ll.lng() });
      setTapRoute(null);
      // The street name is how the kind of area is read (a freeway or highway
      // says so); if the lookup fails the officer just picks the area.
      try {
        new google.maps.Geocoder().geocode(
          { location: ll },
          (results, status) => {
            if (status !== "OK" || !results?.length) return;
            const route = results
              .flatMap(r => r.address_components)
              .find(c => c.types.includes("route"));
            setTapRoute(route?.long_name ?? null);
          }
        );
      } catch {
        /* no lookup: the area stays as chosen or assumed */
      }
    });
    return () => l.remove();
  }, [map, tapping, setSeenPoint, setTapRoute]);

  const model = useMemo(() => {
    if (!p.on || !pr || !input || pr.tier === "none") return null;
    const colour = TIER_COLOUR[pr.tier];
    const seen =
      input.from.kind === "point"
        ? { lat: input.from.lat, lng: input.from.lng }
        : input.from.kind === "place" && p.mode === "now"
          ? (() => {
              const pl = p.placeByKey.get(input.from.placeKey);
              return pl && pl.lat !== null && pl.lng !== null
                ? { lat: pl.lat, lng: pl.lng }
                : null;
            })()
          : null;
    const blobs: Blob[] = [];
    const lines: {
      from: { lat: number; lng: number };
      to: { lat: number; lng: number };
      opacity: number;
    }[] = [];
    if (p.showShade) {
      for (const c of pr.candidates) {
        if (c.placeKey === NEAR_KEY) {
          if (seen)
            blobs.push({
              ...seen,
              radiusPx: 50,
              opacity: Math.min(0.95, 0.18 + c.p * 0.8),
            });
          continue;
        }
        const pl = p.placeByKey.get(c.placeKey);
        if (!pl || pl.lat === null || pl.lng === null) continue;
        blobs.push({
          lat: pl.lat,
          lng: pl.lng,
          radiusPx: 34 + (1 - c.p) * 34,
          opacity: Math.min(0.95, 0.18 + c.p * 0.8),
        });
        if (c.state === "route" && seen)
          lines.push({
            from: seen,
            to: { lat: pl.lat, lng: pl.lng },
            opacity: 0.1 + c.p * 0.28,
          });
      }
    }
    const ring =
      p.showReach && p.mode === "now" && seen && pr.elapsedMinutes > 0
        ? { ...seen, radiusM: Math.max(60, pr.reachKm * 1000) }
        : null;
    const lastPoint =
      input.from.kind === "point"
        ? { ...seen!, label: `Last seen ${hhmm(input.from.minutes)}` }
        : null;
    return { colour, blobs, lines, ring, lastPoint };
  }, [p.on, pr, input, p.showShade, p.showReach, p.mode, p.placeByKey]);

  useEffect(() => {
    if (!map || !window.google?.maps || !model) return;
    const { colour, blobs, lines, ring, lastPoint } = model;

    class PredictorOverlay extends google.maps.OverlayView {
      private root: HTMLDivElement | null = null;
      private blobEls: HTMLDivElement[] = [];
      private lineEls: HTMLDivElement[] = [];
      private ringEl: HTMLDivElement | null = null;
      private pinEl: HTMLDivElement | null = null;

      onAdd() {
        const root = document.createElement("div");
        root.style.cssText =
          "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none";
        this.lineEls = lines.map(l => {
          const el = document.createElement("div");
          el.style.cssText = `position:absolute;height:26px;border-radius:13px;transform-origin:0 50%;background:${rgba(colour, l.opacity)};pointer-events:none`;
          root.appendChild(el);
          return el;
        });
        this.blobEls = blobs.map(b => {
          const el = document.createElement("div");
          el.style.cssText = "position:absolute;pointer-events:none";
          el.style.background = `radial-gradient(circle closest-side, ${rgba(colour, Math.min(1, b.opacity))} 0%, ${rgba(colour, b.opacity * 0.55)} 55%, ${rgba(colour, 0)} 100%)`;
          root.appendChild(el);
          return el;
        });
        if (ring) {
          const el = document.createElement("div");
          el.style.cssText = `position:absolute;box-sizing:border-box;border-radius:50%;border:2px dashed ${colour};background:${rgba(colour, 0.07)};pointer-events:none`;
          root.appendChild(el);
          this.ringEl = el;
        }
        if (lastPoint) {
          const el = document.createElement("div");
          el.style.cssText =
            "position:absolute;pointer-events:none;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center";
          el.innerHTML = `<div style="width:16px;height:16px;transform:rotate(45deg);background:#dc2626;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`;
          const tag = document.createElement("div");
          tag.textContent = lastPoint.label;
          tag.style.cssText =
            "margin-top:6px;white-space:nowrap;font:600 11px system-ui,sans-serif;background:#fff;color:#14181d;border-radius:999px;padding:1px 8px;box-shadow:0 1px 4px rgba(0,0,0,.3)";
          el.appendChild(tag);
          root.appendChild(el);
          this.pinEl = el;
        }
        this.getPanes()?.overlayLayer.appendChild(root);
        this.root = root;
      }

      draw() {
        const proj = this.getProjection();
        const zoom = map?.getZoom();
        if (!proj || zoom == null) return;
        const at = (pt: { lat: number; lng: number }) =>
          proj.fromLatLngToDivPixel(new google.maps.LatLng(pt.lat, pt.lng));
        blobs.forEach((b, i) => {
          const pt = at(b),
            el = this.blobEls[i];
          if (!pt || !el) return;
          const r = Math.max(b.radiusPx, 120 / metresPerPixel(b.lat, zoom));
          el.style.width = `${2 * r}px`;
          el.style.height = `${2 * r}px`;
          el.style.left = `${pt.x - r}px`;
          el.style.top = `${pt.y - r}px`;
        });
        lines.forEach((l, i) => {
          const a = at(l.from),
            b = at(l.to),
            el = this.lineEls[i];
          if (!a || !b || !el) return;
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          el.style.width = `${len}px`;
          el.style.left = `${a.x}px`;
          el.style.top = `${a.y - 13}px`;
          el.style.transform = `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`;
        });
        if (ring && this.ringEl) {
          const pt = at(ring);
          if (pt) {
            const r = Math.max(
              6,
              ring.radiusM / metresPerPixel(ring.lat, zoom)
            );
            this.ringEl.style.width = `${2 * r}px`;
            this.ringEl.style.height = `${2 * r}px`;
            this.ringEl.style.left = `${pt.x - r}px`;
            this.ringEl.style.top = `${pt.y - r}px`;
          }
        }
        if (lastPoint && this.pinEl) {
          const pt = at(lastPoint);
          if (pt) {
            this.pinEl.style.left = `${pt.x}px`;
            this.pinEl.style.top = `${pt.y}px`;
          }
        }
      }

      onRemove() {
        this.root?.remove();
        this.root = null;
        this.blobEls = [];
        this.lineEls = [];
        this.ringEl = null;
        this.pinEl = null;
      }
    }

    const overlay = new PredictorOverlay();
    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map, model]);

  return null;
}
