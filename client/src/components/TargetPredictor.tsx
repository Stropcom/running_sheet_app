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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Crosshair } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { DivIconOverlay } from "@/lib/divIconOverlay";
import { metresPerPixel } from "@shared/heatMapLayout";
import {
  DIRECTION_WINDOW_MIN,
  FORWARD_HALF_DEG,
  WHY_NO_DIRECTION,
  compassName,
  travelDirection,
  type TravelDirection,
} from "@shared/travelDirection";
import {
  AREAS,
  DEFAULT_AREA,
  LIKELY_REACH_SHARE,
  MIN_SAMPLES,
  USE_ALL_HISTORY,
  NEAR_KEY,
  TIER_LABEL,
  areaFromSpeedLimit,
  areaFromStreetName,
  describePrediction,
  formatKm,
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
  thin: "#8a3b12",
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

/** Search: the one tapped point, when he was last seen there and, if the team
 * has paused the ring, the minute it was held at (Perth minutes after
 * midnight). */
interface SeenForm {
  point: { lat: number; lng: number } | null;
  minutes: number | null;
  pausedAt: number | null;
}

const NO_SEEN: SeenForm = { point: null, minutes: null, pausedAt: null };

/** The "seen how long ago" buttons — Search only ever looks back this far. */
export const SEEN_AGO_MINUTES = [0, 1, 2, 3, 5] as const;

/** One state for the section, the banner and the overlay. */
export function useTargetPredictor({
  opId,
  sheetId,
  targetId,
}: TargetPredictorArgs) {
  const [on, setOnState] = useState<boolean>(readOn);
  const [mode, setMode] = useState<PredictorMode>("next");
  const [clock, setClock] = useState(() => perthClock(new Date()));
  // Where next: the officer chose where he is instead of the sheet.
  const [override, setOverride] = useState(false);
  const [pickPlaceKey, setPickPlaceKey] = useState<string | null>(null);
  // Search: the tapped "last seen" point. Edits are saved and shared with the
  // team (see persist below); what the team has saved flows back into it.
  const [seen, setSeen] = useState<SeenForm>(NO_SEEN);
  const [tapRoute, setTapRoute] = useState<string | null>(null);
  const [showShade, setShowShade] = useState(true);
  const [showReach, setShowReach] = useState(true);
  const [directionOn, setDirectionOn] = useState(true);
  // "Move pin": the next tap on the map moves where he was last seen. With no
  // pin yet the map takes the first tap on its own (see `tapping`).
  const [tapArmed, setTapArmed] = useState(false);
  // An edit that has not been saved yet.
  const [dirty, setDirty] = useState(false);

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
    setTapArmed(false);
    setOverride(false);
    setPickPlaceKey(null);
    setSeen(NO_SEEN);
    setTapRoute(null);
    setDirty(false);
    appliedRef.current = null;
  }, [opId, sheetId, targetId]);

  const ready = on && opId != null && targetId != null;
  // Why nothing can be shown, in words — the banner and the pane say it rather
  // than staying blank.
  const blocked: string | null = !on
    ? null
    : sheetId == null
      ? "Select a running sheet in Map Settings."
      : opId == null
        ? "The selected running sheet's operation could not be found."
        : targetId == null
          ? "The selected running sheet has no target linked to it."
          : null;
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

  // What the team has set as "last seen" — polled so everyone with the sheet
  // open sees the same position.
  const sharedQuery = trpc.intelligence.getPredictorLastSeen.useQuery(
    { operationId: opId ?? 0, sheetId: sheetId ?? 0 },
    {
      enabled: ready && sheetId != null,
      refetchInterval: 10_000,
      retry: false,
    }
  );
  const shared = sharedQuery.data ?? null;

  const utils = trpc.useUtils();
  const saveMut = trpc.intelligence.setPredictorLastSeen.useMutation({
    onSuccess: () => utils.intelligence.getPredictorLastSeen.invalidate(),
    onError: e => toast.error(e.message),
  });
  const clearMut = trpc.intelligence.clearPredictorLastSeen.useMutation({
    onSuccess: () => utils.intelligence.getPredictorLastSeen.invalidate(),
    onError: e => toast.error(e.message),
  });

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

  // What the team saved flows into the form — unless this officer has an edit
  // waiting to be saved or one in flight, which must not be overwritten.
  const appliedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!shared || dirty || saveMut.isPending) return;
    if (appliedRef.current === shared.updatedAtMs) return;
    appliedRef.current = shared.updatedAtMs;
    setTapRoute(null);
    // Only a tapped point counts. An older entry (a place, "not seen yet", the
    // sheet's own position) has no point on the map, so Search starts blank.
    if (shared.kind !== "point" || shared.lat === null || shared.lng === null) {
      setSeen(NO_SEEN);
      return;
    }
    setSeen({
      point: { lat: shared.lat, lng: shared.lng },
      minutes: shared.seenMinutes,
      pausedAt: shared.pausedAtMinutes ?? null,
    });
  }, [shared, dirty, saveMut.isPending]);

  // Someone else started the search again: the shared position is gone, so it
  // goes from this screen too (unless this officer has an edit on the way).
  useEffect(() => {
    if (shared || dirty || saveMut.isPending || !sharedQuery.isSuccess) return;
    if (appliedRef.current === null) return;
    appliedRef.current = null;
    setSeen(NO_SEEN);
    setTapRoute(null);
  }, [shared, dirty, saveMut.isPending, sharedQuery.isSuccess]);

  // What the sheet says: only today's entry counts — an old sheet's last row
  // says nothing about where he is now.
  const sheetStart = useMemo(() => {
    const ls = data?.lastSeen;
    if (!ls || !data || ls.dateISO !== data.todayISO) return null;
    if (!placeByKey.has(ls.placeKey)) return null;
    return { ...ls, minutes: Math.min(ls.minutes, clock.minutes) };
  }, [data, placeByKey, clock.minutes]);
  // Where next starts from what the sheet says. Search never does — it starts
  // from the point tapped on the map.
  const usingSheet = mode === "next" && !!sheetStart && !override;

  const firstPlaceKey = data?.places[0]?.placeKey ?? null;
  const seenAt = Math.min(seen.minutes ?? clock.minutes, clock.minutes);
  // A paused ring is held at the minute it was paused, not the clock.
  const pausedAt =
    seen.point && seen.pausedAt != null
      ? Math.max(seenAt, Math.min(seen.pausedAt, clock.minutes))
      : null;
  const paused = mode === "now" && pausedAt !== null;
  const nowMinutes = paused ? pausedAt : clock.minutes;

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
    return seen.point
      ? {
          kind: "point",
          lat: seen.point.lat,
          lng: seen.point.lng,
          minutes: seenAt,
        }
      : null;
  }, [
    data,
    usingSheet,
    sheetStart,
    mode,
    pickPlaceKey,
    firstPlaceKey,
    clock.minutes,
    seen.point,
    seenAt,
  ]);

  // The posted speed limit of the road he was last seen on (Main Roads WA
  // data held by the app), looked up from the tapped point. Where it is known
  // it picks the kind of area and sets the travel speed; where it is not (no
  // limit on record) the street name does, else a built-up area is assumed.
  const limitPoint =
    mode === "now" && from?.kind === "point"
      ? { lat: from.lat, lng: from.lng }
      : null;
  const limitQuery = trpc.intelligence.getRoadSpeed.useQuery(
    { lat: limitPoint?.lat ?? 0, lng: limitPoint?.lng ?? 0 },
    {
      enabled: ready && !!limitPoint,
      staleTime: 60 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const limit: {
    kph: number;
    source: "posted" | "default" | "google";
    road: string | null;
    dataDate: string | null;
  } | null =
    limitPoint && limitQuery.data?.ok
      ? {
          kph: limitQuery.data.kph,
          source: limitQuery.data.source,
          road: limitQuery.data.road ?? null,
          dataDate: limitQuery.data.dataDate ?? null,
        }
      : null;
  const limitDetail =
    limitQuery.data && !limitQuery.data.ok
      ? (limitQuery.data.detail ?? null)
      : null;
  const limitRoad =
    limitQuery.data && !limitQuery.data.ok
      ? (limitQuery.data.road ?? null)
      : null;
  const limitWhy:
    | "loading"
    | "no-road"
    | "no-limit"
    | "refused"
    | "unavailable"
    | "no-data"
    | "default-unknown"
    | null = !limitPoint
    ? null
    : limitQuery.isLoading
      ? "loading"
      : limitQuery.data && !limitQuery.data.ok
        ? limitQuery.data.why
        : limitQuery.isError
          ? "unavailable"
          : null;

  // The kind of area he was last seen in: the posted speed limit, else read
  // from the street name when it is unmistakable, else the stated default.
  const autoArea: AreaClass | null = useMemo(() => {
    if (mode !== "now" || from?.kind !== "point") return null;
    if (limit) return areaFromSpeedLimit(limit.kph);
    return areaFromStreetName(tapRoute);
  }, [mode, from, tapRoute, limit]);
  const area: AreaClass = autoArea ?? DEFAULT_AREA;
  const areaSource: "posted" | "street" | "assumed" = limit
    ? "posted"
    : autoArea
      ? "street"
      : "assumed";
  // The travel speed is the posted limit itself.
  const limitKmh = limit ? limit.kph : null;

  // Save the position (after a short pause, so a few quick changes are one
  // save) and share it with the team.
  useEffect(() => {
    if (!dirty || opId == null || sheetId == null || targetId == null) return;
    const id = window.setTimeout(() => {
      if (!seen.point) return;
      saveMut.mutate({
        operationId: opId,
        sheetId,
        targetId,
        kind: "point",
        placeKey: null,
        lat: seen.point.lat,
        lng: seen.point.lng,
        seenMinutes: seenAt,
        area: null,
        pausedAtMinutes: pausedAt,
      });
      setDirty(false);
    }, 700);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, seen, seenAt, pausedAt]);

  /** A tap on the map or a drag of the pin: that is where he was last seen.
   * The first one also starts the clock ("just now"); moving it later keeps
   * the time and the pause. */
  const placeTap = useCallback(
    (point: { lat: number; lng: number }) => {
      setTapRoute(null);
      setTapArmed(false);
      toast.success(
        seen.point
          ? "Last seen moved."
          : "Last seen set. Drag the pin to adjust."
      );
      const now = perthClock(new Date()).minutes;
      setSeen(s =>
        s.point ? { ...s, point } : { point, minutes: now, pausedAt: null }
      );
      setDirty(true);
    },
    [seen.point]
  );

  /** "Seen how long ago?": 0 = just now. Changing the time restarts the ring
   * from that moment, so it is no longer paused. */
  const setSeenAgo = useCallback((minutesAgo: number) => {
    const now = perthClock(new Date()).minutes;
    setClock(perthClock(new Date()));
    setSeen(s => ({
      ...s,
      minutes: Math.max(0, now - minutesAgo),
      pausedAt: null,
    }));
    setDirty(true);
  }, []);

  /** Hold the ring where it is: the team thinks he is still in the area. */
  const pauseRing = useCallback(() => {
    const now = perthClock(new Date());
    setClock(now);
    setSeen(s => ({ ...s, pausedAt: now.minutes }));
    setDirty(true);
  }, []);
  /** Let the ring grow again — straight back to the real time since last seen. */
  const resumeRing = useCallback(() => {
    setSeen(s => ({ ...s, pausedAt: null }));
    setDirty(true);
  }, []);

  /** Throw the pin away (for everyone) and wait for a new first tap. */
  const startAgain = useCallback(() => {
    setSeen(NO_SEEN);
    setTapRoute(null);
    setTapArmed(false);
    setDirty(false);
    appliedRef.current = shared?.updatedAtMs ?? null;
    if (shared && opId != null && sheetId != null)
      clearMut.mutate({ operationId: opId, sheetId });
  }, [shared, opId, sheetId, clearMut]);

  /** Where next: "Change" takes what the sheet says as the starting point. */
  const changeFromSheet = useCallback(() => {
    setOverride(true);
    if (sheetStart) setPickPlaceKey(sheetStart.placeKey);
  }, [sheetStart]);

  /** Where next: "Use the running sheet" again. */
  const useSheet = useCallback(() => setOverride(false), []);

  // The way the team was travelling in the minutes before the last sighting
  // (Search, from the tapped point): from the GPS trail officers
  // share on the operation. No trail, too little movement or officers going
  // different ways = no direction, and the predictor says why.
  const seenMs =
    data && from
      ? Date.parse(`${data.todayISO}T00:00:00+08:00`) +
        Math.round(from.minutes) * 60_000
      : null;
  const wantDirection =
    ready && mode === "now" && directionOn && seenMs !== null;
  const trailQuery = trpc.intelligence.getPredictorTrail.useQuery(
    {
      operationId: opId ?? 0,
      fromMs: (seenMs ?? 0) - DIRECTION_WINDOW_MIN * 60_000,
      toMs: seenMs ?? 0,
    },
    { enabled: wantDirection, staleTime: 60_000, retry: false }
  );
  const direction: TravelDirection | null = useMemo(() => {
    if (!wantDirection || seenMs === null || !trailQuery.data) return null;
    return travelDirection(
      trailQuery.data,
      seenMs - DIRECTION_WINDOW_MIN * 60_000,
      seenMs
    );
  }, [wantDirection, seenMs, trailQuery.data]);
  const heading = direction?.ok ? direction.bearing : null;

  const input: PredictorInput | null = useMemo(() => {
    if (!data || !from) return null;
    return {
      mode,
      stops: data.stops,
      places: data.places,
      from,
      nowWeekday: clock.weekday,
      nowMinutes,
      area,
      heading,
      limitKmh,
    };
  }, [data, from, mode, clock.weekday, nowMinutes, area, heading, limitKmh]);
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
    blocked,
    override,
    pickPlaceKey,
    setPickPlaceKey,
    seenPoint: seen.point,
    seenAt,
    /** Whole minutes since he was last seen (to the paused minute, if held). */
    agoMinutes: Math.max(0, nowMinutes - seenAt),
    pausedAt,
    paused,
    setSeenAgo,
    pauseRing,
    resumeRing,
    startAgain,
    tapRoute,
    setTapRoute,
    area,
    areaSource,
    limit,
    limitWhy,
    limitDetail,
    limitRoad,
    showShade,
    setShowShade,
    showReach,
    setShowReach,
    directionOn,
    setDirectionOn,
    tapArmed,
    setTapArmed,
    placeTap,
    direction,
    sheetStart,
    usingSheet,
    /** What the team has set as "last seen" today, or null. */
    shared,
    changeFromSheet,
    useSheet,
    from,
    input,
    prediction,
    headline,
    nameOf,
    labelOf,
    placeByKey,
    /** Search is waiting for a tap on the map: the first one, or the one
     * after "Move pin". Once a pin is down the map stops taking taps. */
    tapping: ready && mode === "now" && (tapArmed || !seen.point),
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
  const reasonNone = p.blocked
    ? p.blocked
    : p.query.isError
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
                    {m === "next" ? "Where next?" : "Search"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {p.mode === "next"
                  ? "Where he is likely to go from where he is now."
                  : "For when the team has lost him — tap the map where he was last seen."}{" "}
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
                  {p.mode === "now"
                    ? "No known places for this target on this operation yet. How far he could have got still works from the point you tap."
                    : "No places on record for this target on this operation yet, so there is nothing to predict from."}
                </p>
              )}

              {p.data && p.mode === "next" && places.length > 0 && (
                <PositionControls p={p} />
              )}
              {p.data && p.mode === "now" && <SearchControls p={p} />}
              {p.data && p.mode === "now" && p.seenPoint && <SpeedNote p={p} />}

              {p.data && (places.length > 0 || p.mode === "now") && (
                <div className="space-y-1 pt-0.5">
                  <label className="flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={p.showShade}
                      onChange={e => p.setShowShade(e.target.checked)}
                    />
                    Show how likely each place is, on its marker
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
                  {p.mode === "now" && (
                    <label className="flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={p.directionOn}
                        onChange={e => p.setDirectionOn(e.target.checked)}
                      />
                      Favour the way the team was travelling
                    </label>
                  )}
                </div>
              )}
              {p.data && p.mode === "now" && p.seenPoint && p.directionOn && (
                <DirectionNote p={p} />
              )}

              {/* Where now is two separate answers that work together: how
                  far he could have got (needs no history) and the locations
                  of interest inside that reach. */}
              {pr && p.mode === "now" && <ReachCard p={p} pr={pr} />}
              {pr && p.mode === "now" && pr.seenLocated && (
                <InterestList p={p} pr={pr} />
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

/** Where next: where he is now — the running sheet's last entry, or picked. */
function PositionControls({ p }: { p: TargetPredictorState }) {
  const places = p.data?.places ?? [];
  const label =
    "text-[11px] font-semibold text-muted-foreground uppercase tracking-wide";
  const link = "text-[11px] font-semibold text-violet-500 hover:underline";

  if (p.usingSheet && p.sheetStart) {
    const name = p.labelOf(p.sheetStart.placeKey);
    const verb = p.sheetStart.leaving ? "Left" : "Now at";
    return (
      <div className="rounded-xl border-2 border-border bg-card px-3 py-2 space-y-0.5">
        <p className="text-xs text-foreground">
          {verb} <span className="font-semibold">{name}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          {hhmm(p.sheetStart.minutes)}, from the running sheet ·{" "}
          <button className={link} onClick={p.changeFromSheet}>
            Change
          </button>
        </p>
      </div>
    );
  }

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
      <p className="text-[11px] text-muted-foreground">
        {p.sheetStart ? (
          <button className={link} onClick={p.useSheet}>
            Use the running sheet
          </button>
        ) : (
          "Nothing logged for him today on the running sheet yet."
        )}
      </p>
    </div>
  );
}

// Big, equal buttons: Search is used on a phone, often from a moving vehicle.
const ACTION =
  "min-w-0 min-h-[44px] px-1 py-2 text-xs font-semibold rounded-lg border-2 transition-colors";
const ACTION_ON = "border-violet-500/50 bg-violet-500/10 text-violet-500";
const ACTION_OFF = "border-border bg-card text-foreground hover:bg-accent/40";

/** Search: one tap puts the pin down; after that the map stops taking taps.
 * The pin is dragged to move it; the buttons set how long ago he was seen,
 * hold the ring, or throw the pin away and start again. */
function SearchControls({ p }: { p: TargetPredictorState }) {
  const label =
    "text-[11px] font-semibold text-muted-foreground uppercase tracking-wide";
  if (!p.seenPoint)
    return (
      <div className="rounded-xl border-2 border-violet-500/50 bg-violet-500/10 px-3 py-2">
        <p className="text-xs font-semibold text-violet-500">
          Tap the map where he was last seen
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          One tap — the cross goes away after it, so a stray touch can&apos;t
          move it. Then drag the pin to adjust it.
        </p>
      </div>
    );
  const setBy = p.shared?.updatedByCIN
    ? `Shared with the team, set by ${p.shared.updatedByCIN}. `
    : "";
  const ago = Math.round(p.agoMinutes);
  return (
    <div className="space-y-2">
      <div className="rounded-xl border-2 border-border bg-card px-3 py-2 space-y-0.5">
        <p className="text-xs text-foreground">
          Last seen <span className="font-semibold">{hhmm(p.seenAt)}</span> —{" "}
          {ago < 1 ? "just now" : `${ago} min ago`}
          {p.paused ? " (ring paused)" : ""}
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {setBy}Drag the pin on the map to move it.
        </p>
      </div>
      <div className="space-y-1">
        <span className={label}>Seen how long ago?</span>
        <div
          className="grid grid-cols-5 gap-1.5"
          role="group"
          aria-label="Seen how long ago"
        >
          {SEEN_AGO_MINUTES.map(n => (
            <button
              key={n}
              onClick={() => p.setSeenAgo(n)}
              aria-pressed={Math.round(p.clock.minutes - p.seenAt) === n}
              className={`${ACTION} ${
                Math.round(p.clock.minutes - p.seenAt) === n
                  ? ACTION_ON
                  : ACTION_OFF
              }`}
            >
              {n === 0 ? "Now" : `${n} min`}
            </button>
          ))}
        </div>
      </div>
      <div
        className="grid grid-cols-3 gap-1.5"
        role="group"
        aria-label="Search actions"
      >
        <button
          onClick={() => p.setTapArmed(!p.tapArmed)}
          aria-pressed={p.tapArmed}
          className={`${ACTION} ${p.tapArmed ? ACTION_ON : ACTION_OFF}`}
        >
          {p.tapArmed ? "Tap map…" : "Move pin"}
        </button>
        <button
          onClick={p.paused ? p.resumeRing : p.pauseRing}
          aria-pressed={p.paused}
          className={`${ACTION} ${p.paused ? ACTION_ON : ACTION_OFF}`}
        >
          {p.paused ? "Resume ring" : "Pause ring"}
        </button>
        <button onClick={p.startAgain} className={`${ACTION} ${ACTION_OFF}`}>
          Start again
        </button>
      </div>
      {p.tapArmed && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Tap the map where he was last seen. Tap Move pin again to cancel.
        </p>
      )}
    </div>
  );
}

/** Search: how fast he is taken to travel, and where that came from. */
function SpeedNote({ p }: { p: TargetPredictorState }) {
  const rule = AREAS[p.area];
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] leading-snug text-muted-foreground">
        Travelling at about{" "}
        <span className="font-semibold text-foreground">
          {p.areaSource === "posted" && p.limit ? p.limit.kph : rule.kmh} km/h
        </span>{" "}
        {p.areaSource === "posted" && p.limit
          ? p.limit.source === "default"
            ? `— the legal default on ${p.limit.road ?? "the nearest road"} (no sign on record; 50 km/h in built-up areas).`
            : `— the posted limit on ${p.limit.road ?? "the nearest road"}${p.limit.source === "google" ? " (Google Roads)" : ""}.`
          : p.areaSource === "street"
            ? `— ${rule.label.toLowerCase()}, read from the street name.`
            : `— ${rule.label.toLowerCase()}, assumed (the road's limit isn't on record).`}
      </p>
      {p.limitWhy && p.limitWhy !== "loading" && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {p.limitWhy === "default-unknown"
            ? `No sign on record for ${p.limitRoad ?? "that road"} — the legal default is 50 km/h in built-up areas or 110 km/h outside them, and the data can't say which, so a built-up speed is assumed.`
            : p.limitWhy === "no-data"
              ? "Speed-zone data isn't loaded on this server, so an assumed speed is used."
              : p.limitWhy === "no-limit"
                ? "No posted limit on record for this road, so an assumed speed is used."
                : p.limitWhy === "no-road"
                  ? "No road was found within 40 m of that point, so an assumed speed is used."
                  : p.limitWhy === "refused"
                    ? "Google refused the speed-limit lookup for this key, so an assumed speed is used."
                    : "The speed-limit lookup could not be reached, so an assumed speed is used."}
        </p>
      )}
      {p.limit && p.limit.source !== "google" && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Speed limits: Main Roads Western Australia, Legal Speed Limits (CC BY
          4.0)
          {p.limit.dataDate ? `, copy made ${p.limit.dataDate}` : ""}.
        </p>
      )}
      {p.limitDetail &&
        (p.limitWhy === "refused" || p.limitWhy === "unavailable") && (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Google said: “{p.limitDetail}”
          </p>
        )}
      {p.limitWhy === "loading" && (
        <p className="text-[11px] text-muted-foreground">
          Looking up the posted limit…
        </p>
      )}
    </div>
  );
}

function ReachCard({ p, pr }: { p: TargetPredictorState; pr: Prediction }) {
  if (!pr.seenLocated)
    return (
      <div className="rounded-xl border-2 border-border bg-card px-3 py-2">
        <p className="text-xs font-semibold text-foreground">
          How far he could have got
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          Needs a last-seen position on the map — tap the map where he was last
          seen.
        </p>
      </div>
    );
  return (
    <div className="rounded-xl border-2 border-border bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
        <span>How far he could have got</span>
        <span className="tabular-nums flex-shrink-0">
          {pr.elapsedMinutes > 0
            ? `up to ${formatKm(pr.reachKm)}`
            : "just seen"}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {Math.round(pr.elapsedMinutes)} min at about {pr.kmh} km/h (
        {AREAS[pr.area].label.toLowerCase()}) — the dashed ring on the map.{" "}
        {p.paused
          ? `Paused at ${hhmm(p.pausedAt ?? p.clock.minutes)}: it is held here. Resume ring and it goes straight back to the real time since he was last seen.`
          : "It grows every minute and does not depend on his history."}
      </p>
      {pr.elapsedMinutes > 0 && (
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border pt-1.5 text-xs font-semibold text-foreground">
          <span>Most likely by now</span>
          <span className="tabular-nums flex-shrink-0">
            about {formatKm(pr.likelyKm)}
          </span>
        </div>
      )}
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        The solid ring: {Math.round(LIKELY_REACH_SHARE * 100)}% of the most he
        could have got, to allow for lights, traffic and roads that aren&apos;t
        straight. A set figure, not measured. Places inside it are the first to
        check.
      </p>
    </div>
  );
}

function InterestList({ p, pr }: { p: TargetPredictorState; pr: Prediction }) {
  const shown = pr.inReach.slice(0, 8);
  return (
    <div className="rounded-xl border-2 border-border bg-card px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
        <span>Locations of interest in reach</span>
        <span className="tabular-nums flex-shrink-0">{pr.inReach.length}</span>
      </div>
      {shown.length === 0 ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          None of his known places or registered addresses are inside that
          reach.
        </p>
      ) : (
        <ul className="mt-1 space-y-1">
          {shown.map(r => (
            <li
              key={r.placeKey}
              className="flex items-start justify-between gap-2 text-[11px] leading-snug"
            >
              <span className="min-w-0 text-foreground">
                <span className="font-semibold">{p.labelOf(r.placeKey)}</span>
                <span className="block text-muted-foreground">
                  {r.visits > 0
                    ? `${r.visits} visit${r.visits === 1 ? "" : "s"} on record`
                    : "registered address — no visits on record"}
                  {r.likely ? " · inside the most-likely ring" : ""}
                </span>
              </span>
              <span className="flex-shrink-0 tabular-nums text-muted-foreground">
                {formatKm(r.km)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {pr.inReach.length > shown.length && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          …and {pr.inReach.length - shown.length} more, further out.
        </p>
      )}
    </div>
  );
}

function DirectionNote({ p }: { p: TargetPredictorState }) {
  const d = p.direction;
  if (!d)
    return (
      <p className="text-[11px] leading-snug text-muted-foreground">
        Reading the team&apos;s trail…
      </p>
    );
  if (!d.ok)
    return (
      <p className="text-[11px] leading-snug text-muted-foreground">
        {WHY_NO_DIRECTION[d.why]}
      </p>
    );
  return (
    <p className="text-[11px] leading-snug text-muted-foreground">
      Team heading{" "}
      <span className="font-semibold text-foreground">
        {compassName(d.bearing)}
      </span>{" "}
      for about {(d.metres / 1000).toFixed(1)} km in the {DIRECTION_WINDOW_MIN}{" "}
      minutes before he was last seen ({d.officers}{" "}
      {d.officers === 1 ? "officer" : "officers"}). Places ahead are favoured.
      This is the team&apos;s direction — it stands in for his only while the
      team is following him.
    </p>
  );
}

function Candidates({ p, pr }: { p: TargetPredictorState; pr: Prediction }) {
  const colour = TIER_COLOUR[pr.tier];
  if (pr.tier === "none" || pr.candidates.length === 0)
    return (
      <p className="text-[11px] leading-snug text-muted-foreground">
        No similar visit on record for this target on this operation, so there
        is nothing to count yet. It improves as more is recorded.
      </p>
    );
  return (
    <div className="space-y-1.5">
      {p.mode === "now" && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Most likely, from his history
        </p>
      )}
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
  const all = inp.allHistory ?? USE_ALL_HISTORY;
  const scope = all
    ? "any day"
    : pr.scope === "day"
      ? "the same weekday"
      : pr.scope === "group"
        ? inp.nowWeekday <= 4
          ? "all weekdays"
          : "all weekend days"
        : pr.scope === "anyday"
          ? "any day of the week"
          : "any day and any time of day";
  const f = inp.from;
  const how =
    f.kind === "none" || f.kind === "point"
      ? pr.scope === "anytime"
        ? "every place he has been, the most visited first (nothing was on record at this time of day)"
        : `where he usually is at ${hhmm(inp.nowMinutes)}`
      : pr.scope === "anytime"
        ? `every visit to ${p.nameOf(f.placeKey)} that was followed by another place, then where each went next`
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
              ? ". No similar visit on record."
              : pr.tier === "thin"
                ? `. Only ${pr.total} similar visit${pr.total === 1 ? "" : "s"} — treat this as a lead, not a pattern. ${MIN_SAMPLES} or more are needed before it counts as low confidence.`
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
          {p.mode === "now" && p.direction?.ok && (
            <p>
              <span className="font-semibold text-foreground">Direction:</span>{" "}
              the team was heading {compassName(p.direction.bearing)} in the{" "}
              {DIRECTION_WINDOW_MIN} minutes before he was last seen. A place
              within {FORWARD_HALF_DEG}° either side of that heading keeps its
              full weight; a place behind it keeps a quarter — never none,
              because targets double back. An assumption, not his history.
            </p>
          )}
          {p.mode === "now" && pr.elapsedMinutes > 0 && (
            <p>
              <span className="font-semibold text-foreground">How far:</span>{" "}
              {Math.round(pr.elapsedMinutes)} min at about {pr.kmh} km/h, so up
              to {pr.reachKm.toFixed(1)} km from where he was seen — the dashed
              ring, which grows every minute.
            </p>
          )}
          {p.mode === "now" && pr.elapsedMinutes > 0 && (
            <p>
              <span className="font-semibold text-foreground">
                Most likely:
              </span>{" "}
              the solid ring, {Math.round(LIKELY_REACH_SHARE * 100)}% of that (
              {pr.likelyKm.toFixed(1)} km). Roads are not straight and there are
              lights and traffic, so he is unlikely to have got the full
              distance. The 60% is a set figure, not measured.
            </p>
          )}
          {all && (
            <p>
              For now every visit on record is counted, whatever the day of the
              week or the time of day, because histories are short.
            </p>
          )}
          {!all && pr.scope !== "day" && (
            <p>
              Fewer than {MIN_SAMPLES} similar visits on that exact weekday at
              this time, so the search was widened to {scope}.
            </p>
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
  if (!p.on) return null;
  const tier = p.prediction?.tier ?? "none";
  const colour = TIER_COLOUR[tier];
  let main = p.headline?.main;
  let sub = p.headline?.sub;
  if (p.mode === "now" && p.tapping) {
    main = p.seenPoint
      ? "Tap the map to move the pin"
      : "Tap the map where he was last seen";
    sub = p.seenPoint
      ? "Or drag the pin itself. Tap Move pin in Map Settings to cancel."
      : "One tap — then drag the pin to adjust it.";
  } else if (!p.prediction) {
    if (p.blocked) {
      main = "Target predictor";
      sub = p.blocked;
    } else if (p.query.isError) {
      main = "No prediction available";
      sub = "The predictor could not read this target's history.";
    } else if (p.query.isLoading) {
      main = "Target predictor";
      sub = "Reading his history…";
    } else if (p.mode === "now" && !p.from) {
      main = "Tap the map where he was last seen";
      sub = "That shows how far he could have got — it needs no history.";
    } else if (p.data && p.data.places.length === 0) {
      main = "No prediction yet";
      sub = "No places on record for this target on this operation.";
    } else {
      main = "Target predictor";
      sub = "Working out a prediction…";
    }
  }
  if (p.mode === "now" && p.paused && p.seenPoint)
    sub = `Ring paused at ${hhmm(p.pausedAt ?? p.clock.minutes)} — it is not growing. ${sub ?? ""}`;
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
        {tier === "none" &&
        p.prediction?.mode === "now" &&
        p.prediction.seenLocated
          ? "Reach only — no history"
          : TIER_LABEL[tier]}
        {tier !== "none" && p.prediction ? ` · ${p.prediction.total}` : ""}
      </span>
    </div>
  );
}

// ── The shading on the map ───────────────────────────────────────────────────

export function TargetPredictorOverlay({
  p,
  map,
}: {
  p: TargetPredictorState;
  map: google.maps.Map | null;
}) {
  const pr = p.prediction;
  const input = p.input;

  // The street name is how the kind of area is read when the limit isn't on
  // record (a freeway or highway says so); if the lookup fails the speed is
  // simply assumed.
  const setTapRoute = p.setTapRoute;
  const readRoadName = useCallback(
    (ll: google.maps.LatLng) => {
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
        /* no lookup: the speed stays as assumed */
      }
    },
    [setTapRoute]
  );

  // Tap the map to say where he was last seen — the first tap, or the one
  // after "Move pin". The crosshair is only there while the map is waiting.
  const { tapping, placeTap } = p;
  useEffect(() => {
    if (!map || !tapping || !window.google?.maps) return;
    map.setOptions({ draggableCursor: "crosshair" });
    const l = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      const ll = e.latLng;
      if (!ll) return;
      placeTap({ lat: ll.lat(), lng: ll.lng() });
      readRoadName(ll);
    });
    return () => {
      l.remove();
      map.setOptions({ draggableCursor: undefined });
    };
  }, [map, tapping, placeTap, readRoadName]);

  // The last-seen pin. Drag it to move it — the map itself ignores taps once
  // the pin is down, so a stray touch can't shift it.
  const pin = p.on && p.mode === "now" ? p.seenPoint : null;
  const pinLabel = pin
    ? `Last seen ${hhmm(p.seenAt)}${p.paused ? " · ring paused" : ""}`
    : "";
  const onPinMoved = useRef<(pt: { lat: number; lng: number }) => void>(
    () => {}
  );
  onPinMoved.current = pt => {
    placeTap(pt);
    readRoadName(new google.maps.LatLng(pt.lat, pt.lng));
  };
  useEffect(() => {
    if (!map || !window.google?.maps || !pin) return;
    const el = document.createElement("div");
    // A roomy, finger-sized grab area with the diamond at its centre.
    el.style.cssText =
      "position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;cursor:grab;touch-action:none";
    el.innerHTML = `<div style="width:18px;height:18px;transform:rotate(45deg);background:#dc2626;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`;
    const tag = document.createElement("div");
    tag.textContent = pinLabel;
    tag.style.cssText =
      "position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:-8px;white-space:nowrap;font:600 11px system-ui,sans-serif;background:#fff;color:#14181d;border-radius:999px;padding:1px 8px;box-shadow:0 1px 4px rgba(0,0,0,.3)";
    el.appendChild(tag);
    const overlay = new DivIconOverlay({
      map,
      position: { lat: pin.lat, lng: pin.lng },
      content: el,
      zIndex: 60,
      title: "Drag to move where he was last seen",
    });
    overlay.gmpDraggable = true;
    const l = overlay.addListener("dragend", () =>
      onPinMoved.current(overlay.position)
    );
    return () => {
      l.remove();
      overlay.map = null;
    };
  }, [map, pin?.lat, pin?.lng, pinLabel]);

  const model = useMemo(() => {
    // Even with nothing to predict from, the last-seen marker and the "how far"
    // ring are drawn, so a tap visibly lands.
    if (!p.on || !pr || !input) return null;
    const colour = TIER_COLOUR[pr.tier];
    const seen =
      input.from.kind === "point"
        ? { lat: input.from.lat, lng: input.from.lng }
        : null;
    // The map keeps its own markers; a small badge on each one says how likely
    // it is (nothing is shaded over the map). A registered address he has
    // never been seen at gets a grey "no visits" badge.
    const badges: { lat: number; lng: number; text: string; grey: boolean }[] =
      [];
    if (p.showShade) {
      const ranked = new Set<string>();
      for (const c of pr.candidates.slice(0, 6)) {
        if (c.placeKey === NEAR_KEY) continue;
        const pl = p.placeByKey.get(c.placeKey);
        if (!pl || pl.lat === null || pl.lng === null) continue;
        ranked.add(c.placeKey);
        badges.push({
          lat: pl.lat,
          lng: pl.lng,
          text: `${Math.round(c.p * 100)}%`,
          grey: false,
        });
      }
      if (p.mode === "now") {
        for (const r of pr.inReach) {
          if (ranked.has(r.placeKey) || r.visits > 0) continue;
          const pl = p.placeByKey.get(r.placeKey);
          if (!pl || pl.lat === null || pl.lng === null) continue;
          badges.push({
            lat: pl.lat,
            lng: pl.lng,
            text: "no visits",
            grey: true,
          });
        }
      }
    }
    const arrow =
      seen && p.mode === "now" && p.direction?.ok && pr.directionApplied
        ? { ...seen, bearing: p.direction.bearing }
        : null;
    // Two rings and nothing shaded: the most he could have got (dashed while
    // it grows, solid once paused) and, inside it, where he most likely is.
    const ring =
      p.showReach && p.mode === "now" && seen && pr.elapsedMinutes > 0
        ? {
            ...seen,
            radiusM: Math.max(60, pr.reachKm * 1000),
            likelyM: Math.max(36, pr.likelyKm * 1000),
            outerLabel: `Could have got: up to ${formatKm(pr.reachKm)}`,
            likelyLabel: `Most likely: ${formatKm(pr.likelyKm)}`,
            paused: p.paused,
          }
        : null;
    return { colour, badges, ring, arrow };
  }, [
    p.on,
    pr,
    input,
    p.showShade,
    p.showReach,
    p.mode,
    p.placeByKey,
    p.paused,
    p.direction,
  ]);

  useEffect(() => {
    if (!map || !window.google?.maps || !model) return;
    const { colour, badges, ring, arrow } = model;

    class PredictorOverlay extends google.maps.OverlayView {
      private root: HTMLDivElement | null = null;
      private badgeRoot: HTMLDivElement | null = null;
      private badgeEls: HTMLDivElement[] = [];
      private ringEl: HTMLDivElement | null = null;
      private likelyEl: HTMLDivElement | null = null;
      private outerTag: HTMLDivElement | null = null;
      private likelyTag: HTMLDivElement | null = null;
      private arrowEl: HTMLDivElement | null = null;

      onAdd() {
        const tag = (text: string) => {
          const el = document.createElement("div");
          el.textContent = text;
          el.style.cssText =
            "position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font:600 11px system-ui,sans-serif;background:#fff;color:#14181d;border:1px solid #cbd2da;border-radius:999px;padding:1px 8px;box-shadow:0 1px 3px rgba(0,0,0,.25);pointer-events:none";
          return el;
        };
        const root = document.createElement("div");
        root.style.cssText =
          "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none";
        if (ring) {
          // No fill: only the rings, so the map underneath stays readable.
          const outer = document.createElement("div");
          outer.style.cssText = `position:absolute;box-sizing:border-box;border-radius:50%;border:2px ${ring.paused ? "solid" : "dashed"} ${colour};background:transparent;pointer-events:none`;
          root.appendChild(outer);
          this.ringEl = outer;
          const likely = document.createElement("div");
          likely.style.cssText = `position:absolute;box-sizing:border-box;border-radius:50%;border:3px solid ${colour};background:transparent;pointer-events:none`;
          root.appendChild(likely);
          this.likelyEl = likely;
          this.outerTag = tag(ring.outerLabel);
          this.likelyTag = tag(ring.likelyLabel);
          root.appendChild(this.outerTag);
          root.appendChild(this.likelyTag);
        }
        if (arrow) {
          const el = document.createElement("div");
          el.style.cssText =
            "position:absolute;width:96px;height:96px;transform:translate(-50%,-50%);pointer-events:none";
          el.innerHTML = `<svg width="96" height="96" viewBox="-48 -48 96 96"><g transform="rotate(${arrow.bearing.toFixed(1)})" fill="none" stroke="${colour}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M0 -14 L0 -42 M-9 -32 L0 -42 L9 -32"/></g></svg>`;
          root.appendChild(el);
          this.arrowEl = el;
        }
        this.getPanes()?.overlayLayer.appendChild(root);
        this.root = root;

        // The badges sit above the map's own markers (same layer as them).
        const badgeRoot = document.createElement("div");
        badgeRoot.style.cssText =
          "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none";
        this.badgeEls = badges.map(b => {
          const el = document.createElement("div");
          el.textContent = b.text;
          el.style.cssText = `position:absolute;white-space:nowrap;font:700 10.5px system-ui,sans-serif;line-height:13px;height:17px;padding:2px 7px;border-radius:9px;box-sizing:border-box;color:#fff;background:${b.grey ? "#6b7686" : "#14181d"};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);pointer-events:none;z-index:70`;
          badgeRoot.appendChild(el);
          return el;
        });
        this.getPanes()?.overlayMouseTarget.appendChild(badgeRoot);
        this.badgeRoot = badgeRoot;
      }

      draw() {
        const proj = this.getProjection();
        const zoom = map?.getZoom();
        if (!proj || zoom == null) return;
        const at = (pt: { lat: number; lng: number }) =>
          proj.fromLatLngToDivPixel(new google.maps.LatLng(pt.lat, pt.lng));
        // The top-right corner of the marker standing on the place.
        badges.forEach((b, i) => {
          const pt = at(b),
            el = this.badgeEls[i];
          if (!pt || !el) return;
          el.style.left = `${pt.x + 8}px`;
          el.style.top = `${pt.y - 31}px`;
        });
        if (ring && this.ringEl && this.likelyEl) {
          const pt = at(ring);
          if (pt) {
            const mpp = metresPerPixel(ring.lat, zoom);
            const place = (
              el: HTMLDivElement,
              tagEl: HTMLDivElement | null,
              metres: number,
              minPx: number
            ) => {
              const r = Math.max(minPx, metres / mpp);
              el.style.width = `${2 * r}px`;
              el.style.height = `${2 * r}px`;
              el.style.left = `${pt.x - r}px`;
              el.style.top = `${pt.y - r}px`;
              if (tagEl) {
                tagEl.style.left = `${pt.x}px`;
                tagEl.style.top = `${pt.y - r}px`;
                // A label on a ring too small to carry it only adds clutter.
                tagEl.style.display = r < 48 ? "none" : "block";
              }
            };
            place(this.ringEl, this.outerTag, ring.radiusM, 6);
            place(this.likelyEl, this.likelyTag, ring.likelyM, 4);
          }
        }
        if (arrow && this.arrowEl) {
          const pt = at(arrow);
          if (pt) {
            this.arrowEl.style.left = `${pt.x}px`;
            this.arrowEl.style.top = `${pt.y}px`;
          }
        }
      }

      onRemove() {
        this.root?.remove();
        this.badgeRoot?.remove();
        this.root = null;
        this.badgeRoot = null;
        this.badgeEls = [];
        this.ringEl = null;
        this.likelyEl = null;
        this.outerTag = null;
        this.likelyTag = null;
        this.arrowEl = null;
      }
    }

    const overlay = new PredictorOverlay();
    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map, model]);

  return null;
}
