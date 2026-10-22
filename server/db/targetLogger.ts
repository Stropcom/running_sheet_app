import { VEHICLE_MAKES_PATTERN } from "@shared/vehicleModel";

import { and, eq, inArray, or } from "drizzle-orm";

import { findVehicleChains, joinVehicleLists } from "../../shared/vehicleList";

import {
  VEHICLE_DEPART_PATTERN,
  occupantsWhoEntered,
  VEHICLE_ARRIVE_PATTERN,
  matchVehicleArrival,
  matchVehicleSighting,
  extractArrivalAddress,
} from "@shared/vehicleEventPatterns";

import {
  scanWalkEvents,
  extractDepartureAddress,
  isUnseenOccupants,
  splitPeopleNames,
} from "@shared/walkEventPatterns";

import { cleanOccupantDesc, extractOccupantNames } from "@shared/occupantNames";

import { isHandover, surveillancePlace } from "@shared/surveillanceHandover";

import {
  surveillanceSignal,
  surveillanceState,
} from "@shared/surveillanceState";

import { resolveTrackedTarget, trackedTargetCode } from "@shared/trackedTarget";

import { locateTargetFromPending, samePlace } from "@shared/targetPosition";

import { shortAddressLabel } from "@shared/markerLink";

import { expandRowSegments } from "@shared/rowSegments";

import {
  attachVehicleMarkers,
  type VehicleMarkerRef,
} from "@shared/vehicleMarker";

import {
  rowMembers,
  entityAliases,
  entityDedupDecisions,
} from "../../drizzle/schema";

import { compareVehicleDescriptions } from "../entityDedup";

import { getDb } from "./core";
import { getTargetById } from "./targets";
import {
  getRowsBySheetId,
  getRowsWithDays,
  getRunningSheetById,
  getRunningSheetsByOperation,
} from "./operations";
import { getCustomMarkers } from "./mapping";
import { extractEntitiesFromText, normOnly } from "./intelligence";

// ─── Observation Punctuation Normalization ─────────────────────────────────
// Officers write vehicle mentions and depart/arrive rows via several
// paths — the QE popup's autocomplete, the "Vehicle arriving"/"Vehicle
// departing" chips, and free typing — and only the chips are guaranteed to
// produce consistent punctuation. Two gaps matter enough to auto-correct
// at save time, applied here rather than per-client-callsite so it's
// enforced once regardless of how the text reached the server:
//
//   1. A comma should always follow a "(Vehicle REGO)" bracket. Cosmetic
//      on its own, but the NEXT bracketed entity in the same sentence is
//      found by scanning forward from here (see extractEntitiesFromText's
//      fullDescription capture), so a missing separator can let an
//      unrelated earlier clause bleed into that next entity's
//      classification.
//   2. A comma must precede "departed"/"arrived" following a "Vehicle
//      REGO" mention — this one is load-bearing, not cosmetic:
//      VEHICLE_DEPART_PATTERN / VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN
//      below require that exact comma to match at all, and
//      getPendingVehicleDepartures/getPendingVehicleArrivals silently miss
//      the row without it — the QE "Vehicle arriving"/"Vehicle departing"
//      chip just never appears.
//
// Deliberately structural, not phrase-based: it doesn't try to recognise
// "driver"/"passenger"/"unseen occupant/s"/etc — it only looks for the
// fixed "Vehicle REGO ... departed/arrived" shape the parsing patterns
// below already use, so any occupant phrasing (present or future) is
// covered without a maintained word list. Only ever applied when a row is
// created or edited (see createSheetRow/updateSheetRow) — never
// retroactively rewritten, and the row.update procedure already refuses a
// locked row before this can run.
export function normalizeObservationPunctuation(text: string): string {
  if (!text) return text;
  // Vehicles listed one after another get "and" / commas between them
  // (shared/vehicleList.ts — also done live as the officer types; idempotent,
  // so this only catches text that reached the server some other way).
  let result = joinVehicleLists(text);
  // A vehicle list's final "and" ("A, B and C") takes no comma before it, so
  // Rule 1 below must not add one to the bracket in front of it.
  const vehicleAndLinks = new Set<number>();
  for (const chain of findVehicleChains(result)) {
    for (const l of chain.links) {
      if (/^\s+and\s+$/i.test(result.slice(l.sepStart, l.sepEnd)))
        vehicleAndLinks.add(l.sepStart);
    }
  }

  // Rule 1: comma right after a "(Vehicle REGO)" bracket, unless the next
  // non-space character already closes the clause (,.;:)\n) or the
  // bracket is the last thing in the text.
  result = result.replace(
    /\(Vehicle\s+[A-Za-z0-9]{2,8}\)/gi,
    (bracket: string, offset: number, str: string) => {
      const rest = str.slice(offset + bracket.length);
      const peek = rest.match(/^(\s*)(\S)?/);
      const ws = peek?.[1] ?? "";
      const nextChar = peek?.[2];
      if (nextChar === undefined) return bracket; // end of text — leave alone
      if (vehicleAndLinks.has(offset + bracket.length)) return bracket; // "A and B"
      if (ws.includes("\n")) return bracket; // paragraph break already separates it
      if (/[,.;:)]/.test(nextChar)) return bracket; // already closed
      // ws (if any) is NOT part of the regex match, so it's left untouched
      // in the source string right after whatever we return here — only
      // add a space ourselves when there's no existing whitespace to rely
      // on, otherwise we'd double it up.
      return ws.length > 0 ? `${bracket},` : `${bracket}, `;
    }
  );

  // Rule 2: for a "Vehicle REGO ... departed/arrived" narrative, make sure
  // there's a comma right after the rego and right before the keyword.
  // Mirrors VEHICLE_DEPART_PATTERN/VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN's
  // own single-line-only reach (no dotAll flag) so this never "fixes" a
  // pairing those patterns wouldn't actually recognise as one event. The
  // "(?<!\()" guard skips a "Vehicle REGO" mention that's actually the
  // CONTENT of a "(Vehicle REGO)" bracket (Rule 1's job, above) — without
  // it, "Vehicle 1ABC123 (Vehicle 1ABC123) ... departed" would wrongly
  // treat the bracket's own closing ")" as part of this narrative.
  result = result.replace(
    /(?<!\()\bVehicle\s+([A-Za-z0-9]{5,8})(,?)(\s*)(.+?)(,?)(\s*)(departed|arrived)\b/gi,
    (
      _match: string,
      rego: string,
      commaAfterRego: string,
      wsAfterRego: string,
      middle: string,
      commaBeforeKeyword: string,
      wsBeforeKeyword: string,
      keyword: string
    ) =>
      `Vehicle ${rego}${commaAfterRego || ","}${wsAfterRego}${middle}${commaBeforeKeyword || ","}${wsBeforeKeyword}${keyword}`
  );

  // Rule 3: the mirror of Rule 2, for a "(Vehicle REGO) ... departed/arrived"
  // narrative where the rego is written in bracket-shorthand form rather
  // than bare — common when a vehicle is recorded for the first time AS it
  // arrives/departs (full description + bracket code in the same sentence,
  // e.g. "...bearing WA registration 1IUP467 (Vehicle 1IUP467), unseen
  // occupant/s arrived at 115 Bateman Road", or a vehicle sitting unseen in
  // a garage that's only ever recorded on departure the same way), so
  // there's no earlier bare mention for Rule 2 to have already fixed. Rule
  // 1 above already guarantees the comma right after the closing bracket;
  // this only adds the second one, right before the keyword — mirroring
  // Rule 2's own fix but anchored on the bracket instead of a bare mention.
  // Deliberately a SEPARATE rule from Rule 2 (not just dropping its
  // "(?<!\()" guard) — that guard exists to stop Rule 2 from misreading a
  // LATER bracket back-reference to an already-bare-mentioned vehicle as
  // part of that bare mention's own narrative (see Rule 2's comment); this
  // rule only ever anchors on the bracket itself, so the two can't
  // conflict. The occupant-description group requires at least one real
  // character (`+?`, not `*?`) — without that, a bracket sitting directly
  // next to a keyword with nothing in between (e.g. "(Vehicle 1ABC123),
  // parked and unattended in the driveway." — no arrival was actually
  // witnessed) would spuriously match with an empty "occupants" and insert
  // a redundant second comma; requiring real content between them forces
  // this rule to leave that case alone, matching the keyword set
  // VEHICLE_DEPART_PATTERN/VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN and their
  // variants actually recognise (shared/vehicleEventPatterns.ts) — wider
  // than Rule 2's own "departed|arrived" pair, which only predates
  // "reversed"/"exited"/"parked"/"stopped" being added to those patterns
  // and hasn't been revisited since, a separate pre-existing gap left
  // alone here rather than folded into this fix.
  //
  // The middle group's first character must be non-whitespace (`\S`) —
  // without that, a bracket sitting directly against a keyword with only
  // WHITESPACE between them (e.g. "(Vehicle 1ABC123), parked...", no real
  // occupant text at all) could still satisfy "one or more characters" by
  // letting the group's OWN leading `\s*` back off and hand the single
  // space character to the middle group instead — verified against a real
  // failing test before landing on this fix, not assumed correct by
  // inspection alone.
  result = result.replace(
    /(\(Vehicle\s+[A-Za-z0-9]{2,8}\),\s*)((?:(?!\(Vehicle\s)\S)(?:(?!\(Vehicle\s).)*?)(,?)(\s*)(departed|reversed|exited|arrived|parked|stopped)\b/gi,
    (
      _match: string,
      bracketPrefix: string,
      middle: string,
      existingComma: string,
      ws: string,
      keyword: string
    ) => `${bracketPrefix}${middle}${existingComma || ","}${ws}${keyword}`
  );

  return result;
}

// ─── Vehicle Depart → Arrive Continuity ────────────────────────────────────
// Officers write vehicle departures in a fixed narrative pattern —
// "Vehicle 1FAD531 HOGAN driver, Denise HOLLY (HOLLY) front passenger,
// departed 34 Duke Street and continued via:" or "Vehicle 1FAD531 HOGAN
// driver and sole occupant, departed 34 Duke Street and continued via:" —
// then, sometime later (possibly on a different sheet/day), the same
// vehicle arrives somewhere and the officer re-types the same occupant
// description by hand. This mines the operation's own rows for the most
// recent departure per rego that hasn't since been matched by an arrival
// for that rego, so the RS Quick Entry popup can offer it back as a chip.

// VEHICLE_DEPART_PATTERN / VEHICLE_ARRIVE_PATTERN / VEHICLE_ARRIVE_WITH_OCCUPANTS_PATTERN
// live in shared/vehicleEventPatterns.ts (imported above), reused by
// normalizeObservationPunctuation above so both stay in lockstep.

export interface PendingVehicleDeparture {
  rego: string;
  /** Occupant description as originally written, e.g. "HOGAN driver and sole occupant". */
  occupantDesc: string;
  sheetId: number;
  rowId: number;
  /** The place the departure row says it left, when one is written. */
  fromAddress: string | null;
  /** Where a later row saw it travelling ("Leach Highway, FREMANTLE") — set
   * when a row identified who is in it (see matchVehicleSighting). */
  via?: string | null;
  /** The row that saw it travelling (newer than rowId). */
  viaRowId?: number | null;
}

// Returns the most recent still-pending (not yet arrived) departure per
// vehicle rego on THIS sheet, ordered most-recent first. Deliberately
// scoped to a single sheet, not the whole operation — a running sheet is a
// per-day/per-shift log, and a vehicle depart/arrive pair is a one-shift
// convenience, not something that should carry over into the next sheet.
// "Pending" means no later row on this sheet mentions that same rego
// arriving. This is only ever offered back as a suggestion the officer
// confirms before it's inserted, not written directly into the record.
export async function getPendingVehicleDepartures(
  sheetId: number
): Promise<PendingVehicleDeparture[]> {
  return computePendingVehicleDepartures(await getRowsForLogger(sheetId));
}

/** The pure part of getPendingVehicleDepartures — over any list of rows, so a
 * draft being typed can be read as the newest row. Each line of a row is its
 * own event (see expandRowSegments). */
export function computePendingVehicleDepartures(
  allRows: { id: number; sheetId: number; observation: string | null }[]
): PendingVehicleDeparture[] {
  const rows = expandRowSegments(allRows);

  const lastDepartByRego = new Map<
    string,
    {
      occupantDesc: string;
      sheetId: number;
      rowId: number;
      fromAddress: string | null;
      via?: string | null;
      viaRowId?: number | null;
      orderIdx: number;
    }
  >();
  const arrivedRegos = new Set<string>();

  rows.forEach((row, idx) => {
    if (!row.observation) return;
    const departMatch = row.observation.match(VEHICLE_DEPART_PATTERN);
    if (departMatch) {
      const rego = departMatch[1].toUpperCase();
      lastDepartByRego.set(rego, {
        occupantDesc:
          cleanOccupantDesc(departMatch[2]) ||
          occupantsWhoEntered(row.observation),
        sheetId: row.sheetId,
        rowId: row.id,
        fromAddress: extractDepartureAddress(row.observation),
        orderIdx: idx,
      });
      arrivedRegos.delete(rego);
      return;
    }
    // Seen on the move after it left: if the row names who is in it, the
    // departure's unseen occupants are now known (and where it is).
    const sighting = matchVehicleSighting(row.observation);
    if (sighting) {
      const dep = lastDepartByRego.get(sighting.rego);
      if (dep && !arrivedRegos.has(sighting.rego)) {
        const named = extractOccupantNames(sighting.occupantDesc);
        const known = splitPeopleNames(named).some(p => !isUnseenOccupants(p));
        if (known) dep.occupantDesc = sighting.occupantDesc;
        dep.via = sighting.route;
        dep.viaRowId = row.id;
      }
      return;
    }
    const arriveMatch = row.observation.match(VEHICLE_ARRIVE_PATTERN);
    if (arriveMatch) {
      arrivedRegos.add(arriveMatch[1].toUpperCase());
    }
  });

  const pending: (PendingVehicleDeparture & { orderIdx: number })[] = [];
  for (const rego of Array.from(lastDepartByRego.keys())) {
    if (arrivedRegos.has(rego)) continue;
    const d = lastDepartByRego.get(rego)!;
    pending.push({ rego, ...d });
  }
  // Most recently departed first.
  return pending
    .sort((a, b) => b.orderIdx - a.orderIdx)
    .map(({ orderIdx, ...rest }) => rest);
}

export interface PendingVehicleArrival {
  rego: string;
  /** Occupant description as originally written, e.g. "HOGAN driver and sole occupant". */
  occupantDesc: string;
  /** The address this vehicle is known to have arrived at (short form). */
  address: string;
  sheetId: number;
  rowId: number;
  /** The arrival row says they "continued out of sight" — so nobody can say
   * whether anyone is still in the vehicle until someone is seen again. */
  outOfSight: boolean;
}

// Returns the most recent still-"here" (not yet re-departed) arrival per
// vehicle rego on THIS sheet, ordered most-recent first — the mirror of
// getPendingVehicleDepartures, used by the "Vehicle departing" chip to
// reuse the occupant description (and address) from a vehicle's last
// logged arrival rather than making the officer retype it. Scoped to a
// single sheet for the same reason as getPendingVehicleDepartures.
export async function getPendingVehicleArrivals(
  sheetId: number
): Promise<PendingVehicleArrival[]> {
  return computePendingVehicleArrivals(await getRowsForLogger(sheetId));
}

/** The pure part of getPendingVehicleArrivals — see
 * computePendingVehicleDepartures. */
export function computePendingVehicleArrivals(
  allRows: { id: number; sheetId: number; observation: string | null }[]
): PendingVehicleArrival[] {
  const rows = expandRowSegments(allRows);

  const lastArrivalByRego = new Map<
    string,
    {
      occupantDesc: string;
      address: string;
      sheetId: number;
      rowId: number;
      outOfSight: boolean;
      orderIdx: number;
    }
  >();
  const departedRegos = new Set<string>();

  rows.forEach((row, idx) => {
    if (!row.observation) return;
    const arriveMatch = matchVehicleArrival(row.observation);
    if (arriveMatch) {
      lastArrivalByRego.set(arriveMatch.rego, {
        occupantDesc: arriveMatch.occupantDesc,
        address: extractArrivalAddress(row.observation) ?? "",
        sheetId: row.sheetId,
        rowId: row.id,
        outOfSight: /\bout of sight\b/i.test(row.observation),
        orderIdx: idx,
      });
      departedRegos.delete(arriveMatch.rego);
      return;
    }
    const departMatch = row.observation.match(VEHICLE_DEPART_PATTERN);
    if (departMatch) {
      departedRegos.add(departMatch[1].toUpperCase());
    }
  });

  const pending: (PendingVehicleArrival & { orderIdx: number })[] = [];
  for (const rego of Array.from(lastArrivalByRego.keys())) {
    if (departedRegos.has(rego)) continue;
    const a = lastArrivalByRego.get(rego)!;
    pending.push({ rego, ...a });
  }
  // Most recently arrived first.
  return pending
    .sort((a, b) => b.orderIdx - a.orderIdx)
    .map(({ orderIdx, ...rest }) => rest);
}

// ─── Walk-In → Walk-Out Continuity ─────────────────────────────────────────
// The on-foot mirror of the vehicle depart/arrive continuity above: officers
// leave a parked vehicle, walk to a location on foot ("... exited the
// vehicle, walked through the car park, entered Sapore Espresso Bar and
// continued out of sight."), then later walk back to that same vehicle
// ("... exited Sapore Espresso Bar and walked through the car park towards
// Vehicle 1MGR73."). This mines the sheet's own rows for the most recent walk-in
// per location that hasn't since been matched by a walk-out from that same
// location, so the RS Quick Entry popup can offer the captured route AND
// names back as a "Walked out" chip — the officer doesn't have to retype
// either, mirroring how the vehicle chips reuse occupantDesc. Reusing the
// walk-in's own names for the walk-out (rather than the vehicle's
// occupants) is deliberate: it's whoever is written as having walked IN
// that's presumed to walk back OUT, which is usually but not always the
// same as who the vehicle's occupants were.

export interface PendingWalkIn {
  /** Names as originally written in the walk-in row, e.g. "KENNEDY and JOHNS". */
  names: string;
  /** Location as originally written in the walk-in row, e.g. "Sapore Espresso Bar". */
  location: string;
  /** Route clause as originally written, e.g. "through the car park". */
  route: string;
  sheetId: number;
  rowId: number;
}

// Returns the most recent still-pending (not yet walked back out) walk-in
// per location on THIS sheet, ordered most-recent first — same single-sheet
// scoping as getPendingVehicleDepartures, for the same reason (a one-shift
// convenience, not something that should carry into the next sheet).
export async function getPendingWalkIns(
  sheetId: number
): Promise<PendingWalkIn[]> {
  const rows = await getRowsForLogger(sheetId);
  return scanWalkEvents(rows).walkIns;
}

// A row's real time in minutes (Perth), from the sheet's date and the day the
// row falls on. Null when the row has no time.
function rowAbsoluteMinutes(
  sheet: { sheetDate: string | null; createdAt: Date },
  day: { dayOffsetMap: Map<number, number>; minRowDate: string | null },
  row: { id: number; timeMinutes: number | null }
): number | null {
  if (row.timeMinutes == null) return null;
  const dateStr =
    day.minRowDate ??
    sheet.sheetDate ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Perth",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(sheet.createdAt);
  const base = Date.parse(`${dateStr}T00:00:00+08:00`) / 60000;
  if (Number.isNaN(base)) return null;
  return base + (day.dayOffsetMap.get(row.id) ?? 0) * 1440 + row.timeMinutes;
}

// The surveillance state of one sheet, from its own saved rows and team.
async function surveillanceStateOfSheet(
  sheet: { id: number; sheetCins: string | null },
  rows: { id: number; observation: string | null; time: string | null }[]
) {
  const db = await getDb();
  const ids = rows.map(r => r.id);
  const members =
    db && ids.length
      ? await db
          .select({ rowId: rowMembers.rowId, cin: rowMembers.memberName })
          .from(rowMembers)
          .where(inArray(rowMembers.rowId, ids))
      : [];
  const byRow = new Map<number, string[]>();
  for (const m of members)
    byRow.set(m.rowId, [...(byRow.get(m.rowId) ?? []), m.cin]);
  let roster: string[] = [];
  try {
    const raw = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : [];
    roster = Array.isArray(raw)
      ? raw.map((e: any) => String(e?.cin ?? "")).filter(Boolean)
      : [];
  } catch {
    roster = [];
  }
  return surveillanceState(
    rows.map(r => ({
      id: r.id,
      observation: r.observation,
      time: r.time,
      members: byRow.get(r.id) ?? [],
    })),
    roster
  );
}

// What a sheet tracks, as one comparable key: a person's surname, a vehicle's
// rego, or a location by its target record. Null when nothing can be said.
async function targetKeyOfSheet(sheet: {
  title: string;
  targetId: number | null;
}): Promise<string | null> {
  const target = sheet.targetId
    ? await getTargetById(sheet.targetId)
    : undefined;
  const tracked = resolveTrackedTarget({ title: sheet.title, target });
  if (!tracked) return null;
  if (tracked.kind === "location")
    return sheet.targetId ? `location:${sheet.targetId}` : null;
  const code = trackedTargetCode(tracked);
  return code ? `${tracked.kind}:${code}` : null;
}

export interface HandoverSource {
  sheetId: number;
  title: string;
  /** The time written on the row that ended the first sheet. */
  endedAtTime: string | null;
}

const handoverCache = new Map<
  string,
  { at: number; value: HandoverSource | null }
>();

const HANDOVER_CACHE_MS = 5000;

/**
 * The sheet this one took over from, if any. One team ceases and the next
 * team commences on a separate sheet; the second sheet's Target Logger then
 * continues from the first (shared/surveillanceHandover.ts). ALL must match:
 * the same operation, the same target, the same place (where the second sheet
 * commences is where the first ceased, or where the target was last logged),
 * and the same time (the commencement is at the minute the first ended or one
 * minute either side). The first sheet must have ended (every member ceased).
 * Sheets already followed in this chain (`exclude`) are skipped so two sheets
 * can't hand over to each other.
 */
export async function findHandoverSource(
  sheetId: number,
  exclude: Set<number> = new Set()
): Promise<HandoverSource | null> {
  const cacheKey = `${sheetId}|${Array.from(exclude).sort().join(",")}`;
  const hit = handoverCache.get(cacheKey);
  if (hit && Date.now() - hit.at < HANDOVER_CACHE_MS) return hit.value;
  const value = await computeHandoverSource(sheetId, exclude);
  handoverCache.set(cacheKey, { at: Date.now(), value });
  if (handoverCache.size > 200) handoverCache.clear();
  return value;
}

async function computeHandoverSource(
  sheetId: number,
  exclude: Set<number>
): Promise<HandoverSource | null> {
  const sheet = await getRunningSheetById(sheetId);
  if (!sheet || sheet.deletedAt) return null;
  const own = await getRowsWithDays(sheetId);
  // Its first "Surveillance commenced" row, with the place it names.
  const commenced = own.rows.find(
    r => surveillanceSignal(r.observation) === "commenced"
  );
  const commencedPlace = commenced
    ? surveillancePlace(commenced.observation, "commenced")
    : null;
  if (!commenced || !commencedPlace) return null;
  const commencedAt = rowAbsoluteMinutes(sheet, own, commenced);
  if (commencedAt == null) return null;
  const myKey = await targetKeyOfSheet(sheet);
  if (!myKey) return null;

  const placesMatch = (a: string, b: string) =>
    samePlace(a, b) || samePlace(shortAddressLabel(a), shortAddressLabel(b));
  const others = (await getRunningSheetsByOperation(sheet.operationId)).filter(
    o => o.id !== sheetId && !exclude.has(o.id)
  );
  let best: { src: HandoverSource; gap: number } | null = null;
  for (const o of others) {
    if ((await targetKeyOfSheet(o)) !== myKey) continue;
    const day = await getRowsWithDays(o.id);
    const state = await surveillanceStateOfSheet(o, day.rows);
    if (!state.ended || state.endedByRowId == null) continue;
    const endedRow = day.rows.find(r => r.id === state.endedByRowId);
    if (!endedRow) continue;
    const endedAt = rowAbsoluteMinutes(o, day, endedRow);
    if (endedAt == null || Math.abs(endedAt - commencedAt) > 1) continue;
    // Where it ended: the ceased rows' places, and where he was last logged.
    const places: string[] = day.rows
      .filter(r => surveillanceSignal(r.observation) === "ceased")
      .map(r => surveillancePlace(r.observation, "ceased") ?? "");
    // His last-known place on that sheet, from its own rows only.
    const walk = scanWalkEvents(day.rows);
    const cont = {
      arrivals: computePendingVehicleArrivals(day.rows),
      departures: computePendingVehicleDepartures(day.rows),
      walkIns: walk.walkIns,
      headingTo: walk.headingTo,
      placements: walk.placements,
    };
    const pos = locateTargetFromPending({
      subject: resolveTrackedTarget({
        title: o.title,
        target: o.targetId ? await getTargetById(o.targetId) : undefined,
      }),
      arrivals: cont.arrivals,
      departures: cont.departures,
      walkIns: cont.walkIns,
      headingTo: cont.headingTo,
      placements: cont.placements,
      extractNames: extractOccupantNames,
    });
    if (pos?.place) places.push(pos.place);
    if (
      !isHandover(
        {
          endedAtMinutes: endedAt,
          endedPlaces: places,
          commencedAtMinutes: commencedAt,
          commencedPlace,
        },
        placesMatch
      )
    )
      continue;
    const gap = Math.abs(endedAt - commencedAt);
    if (!best || gap < best.gap)
      best = {
        src: { sheetId: o.id, title: o.title, endedAtTime: endedRow.time },
        gap,
      };
  }
  return best?.src ?? null;
}

// The rows the Target Logger reads for a sheet: its own, preceded by the rows
// of the sheet it took over from (and that sheet's own predecessors). The
// carried rows get ids below every real row id so they always sort — and
// compare — as older than this sheet's own rows.
export async function getRowsForLogger(
  sheetId: number,
  exclude: Set<number> = new Set()
): Promise<Awaited<ReturnType<typeof getRowsBySheetId>>> {
  const own = await getRowsBySheetId(sheetId);
  if (exclude.size >= 5) return own;
  const seen = new Set(exclude).add(sheetId);
  const src = await findHandoverSource(sheetId, seen);
  if (!src) return own;
  const carried = await getRowsForLogger(src.sheetId, seen);
  const base = -(carried.length + 1);
  return [...carried.map((r, i) => ({ ...r, id: base + i, sheetId })), ...own];
}

// Whether the surveillance on a sheet has ended — every member of the team has
// ceased and nobody has commenced since (shared/surveillanceState.ts) — and, if
// it took over from another sheet, which one. Read from the saved rows only;
// the Target Logger and the target flag both follow it.
export async function getSurveillanceState(sheetId: number) {
  const rows = await getRowsBySheetId(sheetId);
  const sheet = await getRunningSheetById(sheetId);
  const state = await surveillanceStateOfSheet(
    { id: sheetId, sheetCins: sheet?.sheetCins ?? null },
    rows
  );
  const handover = sheet ? await findHandoverSource(sheetId) : null;
  return { ...state, handover };
}

export interface PendingHeadingTo {
  names: string;
  destination: string;
  from: string;
  fromVessel?: string;
  fromTransit?: string;
  sheetId: number;
  rowId: number;
}

// People who left a location saying where they were going ("exited 193b
// Stock Road and walked towards 13 Denford Street") and haven't yet been
// logged entering it — the "Entered" chip's source. Same single-sheet
// scoping as getPendingWalkIns.
export async function getPendingHeadingTo(
  sheetId: number
): Promise<PendingHeadingTo[]> {
  const rows = await getRowsForLogger(sheetId);
  return scanWalkEvents(rows).headingTo;
}

// Placements in a vehicle, with that vehicle's map marker when it has one — a
// vehicle with a marker is where its marker is (see shared/vehicleMarker).
async function withVehicleMarkers<P extends { rego: string }>(
  sheetId: number,
  placements: P[]
): Promise<(P & { vehicleMarker?: VehicleMarkerRef })[]> {
  if (!placements.some(p => p.rego)) return placements;
  const sheet = await getRunningSheetById(sheetId);
  const markers = await getCustomMarkers();
  return attachVehicleMarkers(placements, markers, sheet?.operationId ?? null);
}

// The latest place each person was put by a row (in a vehicle, inside a
// place, on foot) — see scanWalkEvents.
export async function getPendingPlacements(sheetId: number) {
  const rows = await getRowsForLogger(sheetId);
  return withVehicleMarkers(sheetId, scanWalkEvents(rows).placements);
}

/**
 * All four pending lists (vehicles that left with no arrival, vehicles parked,
 * people inside, people walking) with `draft` — text still being typed and not
 * saved — read as the newest row. This is what lets the continuity cards move
 * on as each sentence is written: once "BAIG exited A and walked towards
 * Vehicle X." is in the box, the next options already treat him as back in the
 * vehicle. `excludeRowId` leaves out the saved version of a row whose edit is
 * the draft, so it isn't counted twice.
 */
export async function getPendingContinuityWithDraft(
  sheetId: number,
  draft: string,
  excludeRowId?: number | null
) {
  const saved = (await getRowsForLogger(sheetId)).filter(
    r => excludeRowId == null || r.id !== excludeRowId
  );
  const rows = draft.trim()
    ? [
        ...saved,
        // A stand-in row id that sorts after every real one, so anything the
        // draft produces is also the newest for dismissal purposes.
        {
          id: Number.MAX_SAFE_INTEGER,
          sheetId,
          observation: draft,
        } as (typeof saved)[number],
      ]
    : saved;
  const walk = scanWalkEvents(rows);
  return {
    departures: computePendingVehicleDepartures(rows),
    arrivals: computePendingVehicleArrivals(rows),
    walkIns: walk.walkIns,
    headingTo: walk.headingTo,
    placements: await withVehicleMarkers(sheetId, walk.placements),
  };
}

// ─── Missing Location Prompt (Vehicle Presence Rows) ───────────────────────
// Officers often write a "vehicles present at the address" row at the start
// of the day (or whenever they re-check an address) without repeating the
// location — relying on an earlier "Surveillance commenced ... (LOCATION)"
// row to carry the context for a human reading the sheet top-to-bottom.
// That's a real gap for getAllIntelligenceEntities() though: it links
// vehicles to a location per-ROW (see registerOccurrence), so a row with
// vehicle brackets and no location mention of its own never gets linked on
// the map/Intelligence folder for THAT row, even though the location is
// "obviously" the one established earlier. This detects that specific
// shape — vehicle(s) described as present/parked, no movement verb, no
// location entity anywhere in the row's own text — and offers back the
// most recent established location (prioritising a "Surveillance
// commenced" row) so the officer can add it with one tap. Entirely
// rule-based: a fixed phrase/keyword check plus a reuse of
// extractEntitiesFromText, no different in kind from the punctuation
// normalization above.
//
// Deliberately narrow (matches only this specific "static presence, no
// movement verb" shape) rather than firing on every vehicle-mentioning row
// with no location — a row already describing an arrival/departure is
// covered by its own "arrived at X"/"departed X" convention and doesn't
// need this prompt.
const STATIC_PRESENCE_PATTERN = /\b(parked|unattended|stationary)\b/i;

const VEHICLE_MOVEMENT_PATTERN =
  /\b(arrived|departed|driving|drove|drives|reversed|reversing|reverses|pulled up|pulled away|pulling up|pulling away|left)\b/i;

const VEHICLE_MENTION_PATTERN = /\bVehicle\s+[A-Za-z0-9]{2,8}\b/i;

// Word-boundary substring test for a bare (bracket-free) mention of a
// known short form — the same matching approach getAllIntelligenceEntities'
// "Pass B" uses to pick up a re-mention like "returned to 54 Terrace Road"
// with no bracket of its own. Factored out here so
// looksLikeUnlocatedVehiclePresenceRow can apply the identical rule rather
// than a stricter one-off check.
function hasBareMention(observation: string, term: string): boolean {
  const trimmed = term.trim();
  if (!trimmed) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordBoundary = /^[A-Za-z]/.test(trimmed)
    ? `\\b${escaped}\\b`
    : `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`;
  return new RegExp(wordBoundary, "i").test(observation);
}

// `knownLocationShortForms` lets a caller (see pickMissingLocationSuggestion)
// pass in every address/business short form already bracket-introduced
// elsewhere in this sheet — a bare mention of any of those on THIS row
// counts as already located too, mirroring getAllIntelligenceEntities'
// "Pass B" bare-re-mention handling (the same convention the
// vehicle-arriving chip's subsequent-mention, no-bracket insertion relies
// on). Without this, a row using that exact same bracket-free convention
// would look permanently "unlocated" to this check alone, even though the
// rest of the app already recognises it as located.
export function looksLikeUnlocatedVehiclePresenceRow(
  observation: string,
  knownLocationShortForms: string[] = []
): boolean {
  if (!VEHICLE_MENTION_PATTERN.test(observation)) return false;
  if (!STATIC_PRESENCE_PATTERN.test(observation)) return false;
  if (VEHICLE_MOVEMENT_PATTERN.test(observation)) return false;
  const entities = extractEntitiesFromText(observation);
  if (entities.some(e => e.type === "address" || e.type === "business"))
    return false;
  return !knownLocationShortForms.some(sf => hasBareMention(observation, sf));
}

// The app-wide subsequent-mention convention (see isAddressAlreadyMentioned
// below) drops the suburb — an already-introduced address is referred back
// to by its street portion alone ("21 Allora Avenue", not "21 Allora
// Avenue, SUBIACO"). A plain business-name entity (no address attached)
// has no suburb to strip in the first place, so this is a no-op for those.
export function toSubsequentMentionForm(shortForm: string): string {
  const commaIdx = shortForm.indexOf(",");
  return commaIdx === -1 ? shortForm : shortForm.slice(0, commaIdx).trim();
}

export interface MissingLocationSuggestion {
  location: string;
  source: string;
}

// Pure decision logic over an already-fetched row list — kept separate
// from findMissingLocationSuggestion's DB fetch below so it can be unit
// tested directly, the same way extractEntitiesFromText and
// normalizeObservationPunctuation are (no DB dependency, deterministic).
//
// Rolling location, not "always the commencement address": a team moves
// over the course of a sheet (depart 67 Cleaver Street → arrive 28
// Carnarvon Crescent), so "the location this row is obviously at" is
// whichever address/business was most recently established BEFORE this
// row — walking backward through the sheet — not necessarily wherever
// surveillance first commenced. Only falls back to the commencement row
// when nothing more recent has been mentioned yet (e.g. this is the very
// first vehicle-presence row of the day, right after commencement).
export function pickMissingLocationSuggestion(
  observation: string,
  otherRows: Array<{ observation: string | null }>
): MissingLocationSuggestion | null {
  const rows = otherRows.filter(
    (r): r is { observation: string } => !!r.observation
  );

  // Every address/business short form already bracket-introduced anywhere
  // else in this sheet — see looksLikeUnlocatedVehiclePresenceRow's
  // knownLocationShortForms param for why this row's own bare mention of
  // any of these should count as already located.
  const knownShortForms: string[] = [];
  for (const r of rows) {
    for (const e of extractEntitiesFromText(r.observation)) {
      if (e.type === "address" || e.type === "business") {
        knownShortForms.push(e.shortForm);
        if (e.rawShortForm !== e.shortForm)
          knownShortForms.push(e.rawShortForm);
      }
    }
  }

  if (!looksLikeUnlocatedVehiclePresenceRow(observation, knownShortForms))
    return null;

  for (let i = rows.length - 1; i >= 0; i--) {
    const entities = extractEntitiesFromText(rows[i].observation);
    const loc = entities.find(
      e => e.type === "address" || e.type === "business"
    );
    if (loc) {
      const isCommencementRow = /surveillance commenced/i.test(
        rows[i].observation
      );
      return {
        location: toSubsequentMentionForm(loc.shortForm),
        source: isCommencementRow
          ? "the Surveillance commencement row"
          : "an earlier row on this sheet",
      };
    }
  }

  return null;
}

// Scoped to a single sheet for the same reason as the vehicle depart/arrive
// continuity helpers above — a running sheet is a per-day/per-shift log,
// and "the location established earlier today" shouldn't reach into a
// different day's sheet. excludeRowId lets an edit of an existing row skip
// re-matching itself as its own "earlier row".
export async function findMissingLocationSuggestion(
  sheetId: number,
  observation: string,
  excludeRowId?: number
): Promise<MissingLocationSuggestion | null> {
  if (!looksLikeUnlocatedVehiclePresenceRow(observation)) return null;
  const rows = await getRowsBySheetId(sheetId);
  return pickMissingLocationSuggestion(
    observation,
    rows.filter(r => r.id !== excludeRowId)
  );
}

// ─── Vague Vehicle Match (No-Rego Sighting → Later Full Description) ──────
// A vehicle is often first sighted without its registration visible —
// "a white Hyundai Santa Fe, registration unable to be observed (Vehicle
// White Hyundai)" — and only fully identified later in the same sheet once
// the rego is actually seen. Bracketed like that, the vague sighting is
// already a real, trackable vehicle entity (extractEntitiesFromText
// classifies it as type "vehicle" fine, since classification only needs a
// make/body keyword nearby) — but it keys on whatever descriptive text was
// typed, so a later full sighting with the real rego becomes a SEPARATE,
// unlinked entity even though it's the same car. This detects that
// specific shape and offers the officer a merge, reusing the exact
// mechanism the "Merge Entities" tool and the general duplicate-prompt
// already use (entityAliases via mergeEntities) — see the SCOPE note on
// compareVehicleDescriptions in entityDedup.ts for why this needs a
// dedicated word-overlap comparison rather than the existing
// character-similarity vehicle comparator (compareVehicles): a vague
// bracket and a real rego share almost no characters in common even when
// they're the same car.

// Two independent signals that a vehicle mention is vague (no real rego
// known yet), combined with OR rather than AND so either one alone is
// enough — an officer might bracket the vague sighting with just a
// make/model ("Vehicle White Hyundai") without writing an explicit "rego
// not seen" phrase, or vice versa:
//   1. The bracket itself contains a vehicle make (VEHICLE_MAKES_PATTERN)
//      — a real rego never does.
//   2. The surrounding text uses one of the common ways officers phrase
//      "the registration wasn't visible" — kept fuzzy/pattern-based
//      (unseen/unobserved/unable to see or observe/not visible) rather
//      than a fixed phrase list, so wording variants are still caught.
const NO_REGO_OBSERVED_PATTERN =
  /\b(registration|rego|reg|plate)\b[^.]{0,40}\b(unseen|unobserved|not\s+(?:seen|observed|obtained|visible)|unable\s+to\s+(?:be\s+)?(?:see|seen|observe|observed|obtain|obtained)|no(?:t)?\s+visible)\b/i;

function isVagueVehicleMention(
  shortForm: string,
  fullDescription: string
): boolean {
  const hasRealRego = /\b\d[A-Za-z]{2,3}\d{3}\b/.test(shortForm);
  if (hasRealRego) return false;
  return (
    VEHICLE_MAKES_PATTERN.test(shortForm) ||
    NO_REGO_OBSERVED_PATTERN.test(fullDescription)
  );
}

export interface VagueVehicleMatch {
  /** The vague sighting's bracket text — becomes entityAliases' loserLabel on confirm. */
  loserLabel: string;
  /** The new, real-rego vehicle just entered — becomes entityAliases' winnerLabel. */
  winnerLabel: string;
  reason: string;
}

// Pure decision logic over an already-extracted row list — kept separate
// from findVagueVehicleMatch's DB fetch/alias-dedup checks below so it can
// be unit tested directly, the same pattern as
// pickMissingLocationSuggestion. Returns every candidate match (best first
// by score), not just one — the DB-aware wrapper below filters out any
// already-decided pair and takes the first survivor.
export function pickVagueVehicleMatches(
  observation: string,
  otherRows: Array<{ observation: string | null }>
): VagueVehicleMatch[] {
  const newVehicles = extractEntitiesFromText(observation).filter(
    e => e.type === "vehicle" && /\b\d[A-Za-z]{2,3}\d{3}\b/.test(e.shortForm)
  );
  if (newVehicles.length === 0) return [];

  const rows = otherRows.filter(
    (r): r is { observation: string } => !!r.observation
  );

  const candidates: Array<VagueVehicleMatch & { score: number }> = [];
  for (const newVehicle of newVehicles) {
    const winnerKey = normOnly("vehicle", newVehicle.shortForm);
    const newDescText = `${newVehicle.fullDescription} ${newVehicle.shortForm}`;

    for (const row of rows) {
      const earlierEntities = extractEntitiesFromText(row.observation);
      for (const earlier of earlierEntities) {
        if (earlier.type !== "vehicle") continue;
        if (!isVagueVehicleMention(earlier.shortForm, earlier.fullDescription))
          continue;

        const loserKey = normOnly("vehicle", earlier.shortForm);
        if (loserKey === winnerKey) continue;

        const match = compareVehicleDescriptions(
          newDescText,
          `${earlier.fullDescription} ${earlier.shortForm}`
        );
        if (!match) continue;

        candidates.push({
          loserLabel: earlier.shortForm,
          winnerLabel: newVehicle.shortForm,
          reason: match.reason,
          score: match.score,
        });
      }
    }
  }
  return candidates
    .sort((a, b) => b.score - a.score)
    .map(({ score: _score, ...rest }) => rest);
}

// Scoped to a single sheet, same reasoning as the other same-day continuity
// helpers above (vehicle depart/arrive, missing location). excludeRowId
// lets an edit of an existing row skip matching against itself.
export async function findVagueVehicleMatch(
  sheetId: number,
  observation: string,
  excludeRowId?: number
): Promise<VagueVehicleMatch | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await getRowsBySheetId(sheetId);
  const candidates = pickVagueVehicleMatches(
    observation,
    rows.filter(r => r.id !== excludeRowId)
  );

  for (const candidate of candidates) {
    const loserKey = normOnly("vehicle", candidate.loserLabel);
    const winnerKey = normOnly("vehicle", candidate.winnerLabel);

    // Already linked (either direction) or already dismissed as "not the
    // same vehicle" — don't ask again, same as the generic duplicate-prompt
    // pipeline.
    const [existingAlias, existingDecision] = await Promise.all([
      db
        .select()
        .from(entityAliases)
        .where(
          and(
            eq(entityAliases.type, "vehicle"),
            or(
              and(
                eq(entityAliases.loserKey, loserKey),
                eq(entityAliases.winnerKey, winnerKey)
              ),
              and(
                eq(entityAliases.loserKey, winnerKey),
                eq(entityAliases.winnerKey, loserKey)
              )
            )
          )
        )
        .limit(1),
      db
        .select()
        .from(entityDedupDecisions)
        .where(
          and(
            eq(entityDedupDecisions.type, "vehicle"),
            or(
              and(
                eq(entityDedupDecisions.keyA, loserKey),
                eq(entityDedupDecisions.keyB, winnerKey)
              ),
              and(
                eq(entityDedupDecisions.keyA, winnerKey),
                eq(entityDedupDecisions.keyB, loserKey)
              )
            )
          )
        )
        .limit(1),
    ]);
    if (existingAlias.length > 0 || existingDecision.length > 0) continue;

    return candidate;
  }
  return null;
}

// App-wide convention: the first time an address is mentioned in a running
// sheet it's written in full with its bracketed short-form ("5 Davidson
// Road, ATTADALE WA (5 Davidson Road)") — that bracket is what
// extractEntitiesFromText relies on to register the location as an
// Intelligence entity and place it on the map. Every subsequent mention in
// the same sheet just uses the short form on its own ("5 Davidson Road").
// This lets the vehicle-arriving chip decide which form to insert, without
// touching how any other chip/field on the sheet composes an address.
export async function isAddressAlreadyMentioned(
  sheetId: number,
  shortAddress: string
): Promise<boolean> {
  const trimmed = shortAddress.trim();
  if (!trimmed) return false;
  const rows = await getRowsBySheetId(sheetId);
  const needle = `(${trimmed})`.toLowerCase();
  return rows.some(
    r => r.observation && r.observation.toLowerCase().includes(needle)
  );
}
