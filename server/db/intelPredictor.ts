import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { holdsPriority, isSearchLive } from "@shared/teamSearch";
import { parseExtraAddresses } from "@shared/extraAddresses";
import {
  classifyPlace,
  LABELLABLE_KINDS,
  type PlaceKind,
} from "@shared/placesReport";
import {
  buildStops,
  type PredictorPlace,
  type PredictorStop,
} from "@shared/targetPredictor";
import {
  runningSheets,
  targetPlaceLabels,
  predictorLastSeen,
} from "../../drizzle/schema";
import { getDb } from "./core";
import { normalizeEntityLabel } from "./attachments";
import { getTargetById } from "./targets";
import { resolveLatLng } from "./geocoding";
import { getAllIntelligenceEntities } from "./intelEntities";
import { getIntelTargetPlaces, registeredRefOf } from "./intelPlaces";
import { perthTodayISO } from "./reportHelpers";

export interface IntelTargetPredictorResponse {
  targetName: string;
  operationName: string;
  todayISO: string;
  places: (PredictorPlace & {
    kind: PlaceKind;
    /** One of the target's registered addresses (Home, Address 2…). */
    registered: boolean;
    /** Visits on record (0 for a registered address he has not been seen at). */
    visits: number;
  })[];
  stops: PredictorStop[];
  /** The latest visit on the chosen sheet: where, when, and whether a row
   * says he was leaving. Null when the sheet has none. */
  lastSeen: {
    placeKey: string;
    dateISO: string;
    minutes: number;
    leaving: boolean;
  } | null;
}

export interface SharedSeen {
  /** "sheet" = no position of its own: the running sheet's, with this area. */
  kind: "place" | "point" | "none" | "sheet";
  placeKey: string | null;
  lat: number | null;
  lng: number | null;
  /** Minutes after midnight, Perth time. */
  seenMinutes: number | null;
  area: "freeway" | "main" | "built" | "back" | null;
  /** Search: the minute the ring was paused at, or null while it grows. */
  pausedAtMinutes: number | null;
  /** The same moments to the second (epoch ms), or null on a row written
   * before they existed — the minutes above are then used. */
  seenAtMs: number | null;
  pausedAtMs: number | null;
  updatedByCIN: string | null;
  updatedAtMs: number;
  /** When this search began (the row is new for every start), so a screen can
   * tell a fresh search from one it has already dealt with or dismissed. */
  startedAtMs: number;
}

/** What the team set by hand as "last seen" for this sheet today, shared with
 * everyone who has it open. Null when nothing is set (or it is from an earlier
 * day). A light query: the predictor polls it every few seconds. */
export async function getSharedSeen(
  sheetId: number
): Promise<SharedSeen | null> {
  const db = await getDb();
  if (!db) return null;
  const todayISO = perthTodayISO();
  const [row] = await db
    .select()
    .from(predictorLastSeen)
    .where(eq(predictorLastSeen.sheetId, sheetId))
    .limit(1);
  // Only today's counts: yesterday's "last seen" says nothing about now.
  if (!row || row.dateISO !== todayISO) return null;
  return {
    kind: row.kind as SharedSeen["kind"],
    placeKey: row.placeKey,
    lat: row.lat,
    lng: row.lng,
    seenMinutes: row.seenMinutes,
    area: row.area as SharedSeen["area"],
    pausedAtMinutes: row.pausedAtMinutes,
    seenAtMs: row.seenAtMs,
    pausedAtMs: row.pausedAtMs,
    updatedByCIN: row.updatedByCIN,
    updatedAtMs: row.updatedAt.getTime(),
    startedAtMs: row.createdAt.getTime(),
  };
}

/** Sets (replacing any earlier one) where the team says he was last seen. */
export async function setPredictorLastSeen(params: {
  sheetId: number;
  targetId: number;
  kind: SharedSeen["kind"];
  placeKey: string | null;
  lat: number | null;
  lng: number | null;
  seenMinutes: number | null;
  area: SharedSeen["area"];
  pausedAtMinutes: number | null;
  seenAtMs?: number | null;
  pausedAtMs?: number | null;
  cin: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const values = {
    sheetId: params.sheetId,
    targetId: params.targetId,
    dateISO: perthTodayISO(),
    kind: params.kind,
    placeKey: params.kind === "place" ? params.placeKey : null,
    lat: params.kind === "point" ? params.lat : null,
    lng: params.kind === "point" ? params.lng : null,
    seenMinutes:
      params.kind === "none" || params.kind === "sheet"
        ? null
        : params.seenMinutes,
    area: params.area,
    pausedAtMinutes: params.kind === "point" ? params.pausedAtMinutes : null,
    seenAtMs: params.kind === "point" ? (params.seenAtMs ?? null) : null,
    pausedAtMs: params.kind === "point" ? (params.pausedAtMs ?? null) : null,
    updatedByCIN: params.cin,
  };
  // A row from an earlier day is thrown away first, so today's search is a new
  // row (and a new start time) rather than yesterday's, brought back to life.
  await db
    .delete(predictorLastSeen)
    .where(
      and(
        eq(predictorLastSeen.sheetId, params.sheetId),
        ne(predictorLastSeen.dateISO, values.dateISO)
      )
    );
  await db
    .insert(predictorLastSeen)
    .values(values)
    .onDuplicateKeyUpdate({ set: values });
}

/** Starts Search on this sheet. The search is shown to everybody who has this
 * operation selected, so there is only one at a time per operation:
 *  - one already running on this sheet is left as it is (nothing is wiped);
 *  - one running on ANOTHER sheet of the same operation that has been touched in
 *    the last hour holds the operation — the first search has priority — and
 *    nothing new is started (`holdingSheetId` says which);
 *  - older ones on the operation are over: they are removed and this one starts
 *    blank. */
export async function startPredictorSearch(params: {
  sheetId: number;
  targetId: number;
  cin: string | null;
}): Promise<{ existing: boolean; holdingSheetId: number | null }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const today = perthTodayISO();
  const now = Date.now();

  const [sheet] = await db
    .select({ operationId: runningSheets.operationId })
    .from(runningSheets)
    .where(eq(runningSheets.id, params.sheetId))
    .limit(1);
  if (sheet) {
    const others = await db
      .select({
        sheetId: predictorLastSeen.sheetId,
        updatedAt: predictorLastSeen.updatedAt,
        dateISO: predictorLastSeen.dateISO,
      })
      .from(predictorLastSeen)
      .innerJoin(runningSheets, eq(runningSheets.id, predictorLastSeen.sheetId))
      .where(
        and(
          eq(runningSheets.operationId, sheet.operationId),
          ne(predictorLastSeen.sheetId, params.sheetId)
        )
      );
    const holding = others.find(
      o => o.dateISO === today && holdsPriority(o.updatedAt.getTime(), now)
    );
    if (holding) return { existing: true, holdingSheetId: holding.sheetId };
    // The rest are over: a start takes the operation.
    const stale = others.map(o => o.sheetId);
    if (stale.length)
      await db
        .delete(predictorLastSeen)
        .where(inArray(predictorLastSeen.sheetId, stale));
  }

  const [row] = await db
    .select({
      dateISO: predictorLastSeen.dateISO,
      updatedAt: predictorLastSeen.updatedAt,
    })
    .from(predictorLastSeen)
    .where(eq(predictorLastSeen.sheetId, params.sheetId))
    .limit(1);
  if (
    row &&
    row.dateISO === today &&
    isSearchLive(row.updatedAt.getTime(), now)
  )
    return { existing: true, holdingSheetId: null };
  if (row)
    await db
      .delete(predictorLastSeen)
      .where(eq(predictorLastSeen.sheetId, params.sheetId));
  await db.insert(predictorLastSeen).values({
    sheetId: params.sheetId,
    targetId: params.targetId,
    dateISO: today,
    kind: "sheet",
    updatedByCIN: params.cin,
  });
  return { existing: false, holdingSheetId: null };
}

export interface TodaysSearchRow {
  seen: SharedSeen;
  sheetId: number;
  operationId: number;
  targetId: number;
  /** The sheet's CIN roster, as stored (JSON). */
  sheetCins: string | null;
}

/** Every search running today, with the sheet it belongs to. The router keeps
 * only the ones the caller is on the team of and may reach. */
export async function getTodaysSearches(): Promise<TodaysSearchRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      row: predictorLastSeen,
      operationId: runningSheets.operationId,
      sheetCins: runningSheets.sheetCins,
    })
    .from(predictorLastSeen)
    .innerJoin(runningSheets, eq(runningSheets.id, predictorLastSeen.sheetId))
    .where(
      and(
        eq(predictorLastSeen.dateISO, perthTodayISO()),
        isNull(runningSheets.deletedAt)
      )
    );
  return rows.map(r => ({
    seen: {
      kind: r.row.kind as SharedSeen["kind"],
      placeKey: r.row.placeKey,
      lat: r.row.lat,
      lng: r.row.lng,
      seenMinutes: r.row.seenMinutes,
      area: r.row.area as SharedSeen["area"],
      pausedAtMinutes: r.row.pausedAtMinutes,
      seenAtMs: r.row.seenAtMs,
      pausedAtMs: r.row.pausedAtMs,
      updatedByCIN: r.row.updatedByCIN,
      updatedAtMs: r.row.updatedAt.getTime(),
      startedAtMs: r.row.createdAt.getTime(),
    },
    sheetId: r.row.sheetId,
    operationId: r.operationId,
    targetId: r.row.targetId,
    sheetCins: r.sheetCins,
  }));
}

/** Back to what the running sheet says. */
export async function clearPredictorLastSeen(sheetId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(predictorLastSeen)
    .where(eq(predictorLastSeen.sheetId, sheetId));
}

export async function getIntelTargetPredictor(
  operationId: number,
  targetId: number,
  sheetId: number | null
): Promise<IntelTargetPredictorResponse | null> {
  const report = await getIntelTargetPlaces(operationId, targetId);
  if (!report) return null;
  // Locations of interest: every place he has been seen at, plus his registered
  // addresses even if he has never been seen there — so the predictor has
  // something to offer inside the "how far could he have got" ring on day one.
  const target = await getTargetById(targetId);
  const have = new Set(report.places.map(p => p.placeKey));
  const registeredOnly: {
    placeKey: string;
    name: string;
    kind: PlaceKind;
  }[] = [];
  if (target) {
    const extras = parseExtraAddresses(target.extraAddresses);
    for (const entity of await getAllIntelligenceEntities()) {
      if (entity.type !== "address" && entity.type !== "business") continue;
      const ref = registeredRefOf(entity.occurrences, target.name, extras);
      if (!ref) continue;
      const placeKey = normalizeEntityLabel(entity.shortForm);
      if (have.has(placeKey)) continue;
      have.add(placeKey);
      registeredOnly.push({
        placeKey,
        name: entity.shortForm,
        kind: classifyPlace({
          name: entity.shortForm,
          registered: ref,
        }).kind,
      });
    }
  }
  const places = await Promise.all(
    [
      ...report.places.map(p => ({
        placeKey: p.placeKey,
        name: p.name,
        kind: p.kind,
        visits: p.visits.length,
        registered: p.registeredAs !== null,
      })),
      ...registeredOnly.map(p => ({ ...p, visits: 0, registered: true })),
    ].map(async p => {
      const at = await resolveLatLng(p.placeKey, p.name);
      return {
        ...p,
        lat: at?.lat ?? null,
        lng: at?.lng ?? null,
      };
    })
  );
  const visits = report.places.flatMap(p => p.visits);
  let lastSeen: IntelTargetPredictorResponse["lastSeen"] = null;
  let lastKey = -1;
  if (sheetId != null) {
    for (const v of visits) {
      if (v.sheetId !== sheetId) continue;
      const minutes = v.endMinutes ?? v.startMinutes;
      if (minutes === null) continue;
      const key = Math.floor(Date.parse(v.dateISO) / 60_000) + minutes;
      if (key <= lastKey) continue;
      lastKey = key;
      lastSeen = {
        placeKey: v.placeKey,
        dateISO: v.dateISO,
        minutes,
        leaving: v.endMinutes !== null,
      };
    }
  }
  return {
    targetName: report.targetName,
    operationName: report.operationName,
    todayISO: report.todayISO,
    places,
    stops: buildStops(visits),
    lastSeen,
  };
}

/** Sets (or, with kind = null, clears) an officer's label on a place for a
 * target. */
export async function setTargetPlaceLabel(params: {
  targetId: number;
  placeKey: string;
  kind: PlaceKind | null;
  cin: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { targetId, placeKey, kind, cin } = params;
  if (kind === null) {
    await db
      .delete(targetPlaceLabels)
      .where(
        and(
          eq(targetPlaceLabels.targetId, targetId),
          eq(targetPlaceLabels.placeKey, placeKey)
        )
      );
    return;
  }
  if (!(LABELLABLE_KINDS as readonly string[]).includes(kind))
    throw new Error("That kind of place cannot be set by hand.");
  await db
    .insert(targetPlaceLabels)
    .values({ targetId, placeKey, kind, updatedByCIN: cin })
    .onDuplicateKeyUpdate({ set: { kind, updatedByCIN: cin } });
}

// ─── Weekly Activity Report ─────────────────────────────────────────────────
// "What the unit did this week" — operations coverage, newly-gathered
// intelligence, target visit activity, and governance completed, all for a
// given Monday-start week. Reuses the same entity pipeline and observed-
// visit logic as the Heat Map (see getIntelligenceHeatMapLocations above)
// rather than re-deriving anything.
