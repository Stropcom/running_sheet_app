// ─── Visual RS ──────────────────────────────────────────────────────────────
// The running sheet in time order with a picture at every flag change. This
// file works out, after each row, where the Target Logger would put the flag
// (the same rules as the Map page, read row by row), where that place is on the
// map, and whether the vehicle has a marker; shared/visualRs.ts turns that into
// frames and text entries. Deterministic: no AI, no guessing — a vehicle is only
// placed where it has a marker, and a place that cannot be located gets no
// picture rather than a made-up one.
import { inArray } from "drizzle-orm";
import { rowMembers } from "../../drizzle/schema";
import { findVehicleMarker } from "@shared/vehicleMarker";
import { markerKind } from "@shared/flagMarker";
import { extractOccupantNames } from "@shared/occupantNames";
import { surveillanceState } from "@shared/surveillanceState";
import {
  commencedPosition,
  locateTargetFromPending,
  samePlace,
} from "@shared/targetPosition";
import {
  resolveTrackedTarget,
  trackedTargetCode,
  type TrackedTarget,
} from "@shared/trackedTarget";
import { scanWalkEvents } from "@shared/walkEventPatterns";
import {
  buildVisualRs,
  ceasedFlag,
  flagOfPosition,
  type VisualRsFlag,
  type VisualRsReport,
  type VisualRsRow,
} from "@shared/visualRs";
import { getDb } from "./core";
import { getCustomMarkers } from "./mapping";
import { geocodeSummaryAddresses } from "./geocoding";
import { getOperationById, getRunningSheetById } from "./operations";
import { getTargetById } from "./targets";
import {
  computePendingVehicleArrivals,
  computePendingVehicleDepartures,
  getRowsForLogger,
} from "./targetLogger";

interface LoggerRow {
  id: number;
  sheetId: number;
  observation: string | null;
  time: string | null;
  rowNumber?: number | null;
}

/** The flag after each row from index `firstOwn` on (earlier rows are carried
 * over from a sheet this one took over from: they place the target but are not
 * part of this report). `own(row)` says which rows are this sheet's own — the
 * surveillance state reads those only, as the Target Logger does. */
export function computeRowFlags(args: {
  rows: LoggerRow[];
  firstOwn: number;
  own: (row: LoggerRow) => boolean;
  membersByRow: Map<number, string[]>;
  roster: string[];
  subject: TrackedTarget | null;
}): (VisualRsFlag | null)[] {
  const { rows, firstOwn, own, membersByRow, roster, subject } = args;
  const out: (VisualRsFlag | null)[] = [];
  // Nothing to place for a location target (it does not move) or no target.
  const who = subject ? trackedTargetCode(subject) : null;
  if (!subject || subject.kind === "location" || !who) {
    for (let i = firstOwn; i < rows.length; i++) out.push(null);
    return out;
  }
  let lastPlace: string | null = null;
  for (let i = firstOwn; i < rows.length; i++) {
    const prefix = rows.slice(0, i + 1);
    const walk = scanWalkEvents(prefix);
    const position = locateTargetFromPending({
      subject,
      arrivals: computePendingVehicleArrivals(prefix),
      departures: computePendingVehicleDepartures(prefix),
      walkIns: walk.walkIns,
      headingTo: walk.headingTo,
      placements: walk.placements,
      extractNames: extractOccupantNames,
    });
    const state = surveillanceState(
      prefix.filter(own).map(r => ({
        id: r.id,
        observation: r.observation,
        time: r.time,
        members: membersByRow.get(r.id) ?? [],
      })),
      roster
    );
    if (position?.place) lastPlace = position.place;
    if (state.ended) {
      out.push(ceasedFlag(who, state.endedAtTime, lastPlace));
      continue;
    }
    const shown = position ?? commencedPosition(null, state);
    out.push(shown ? flagOfPosition(shown, who) : null);
  }
  return out;
}

/** The report for one running sheet; null when the sheet is missing. */
export async function getVisualRs(
  sheetId: number
): Promise<VisualRsReport | null> {
  const sheet = await getRunningSheetById(sheetId);
  if (!sheet || sheet.deletedAt) return null;
  const operation = await getOperationById(sheet.operationId);
  const target = sheet.targetId
    ? await getTargetById(sheet.targetId)
    : undefined;
  const subject = resolveTrackedTarget({ title: sheet.title, target });
  const rows = (await getRowsForLogger(sheetId)) as LoggerRow[];
  // Rows carried over from a sheet this one took over from come first (their
  // ids are negative); the report is this sheet's own rows, which follow.
  const firstOwnIndex = rows.findIndex(r => r.id > 0);
  const firstOwn = firstOwnIndex < 0 ? rows.length : firstOwnIndex;
  const ownRows = rows.slice(firstOwn);

  const db = await getDb();
  const membersByRow = new Map<number, string[]>();
  if (db && ownRows.length) {
    const members = await db
      .select({ rowId: rowMembers.rowId, cin: rowMembers.memberName })
      .from(rowMembers)
      .where(
        inArray(
          rowMembers.rowId,
          ownRows.map(r => r.id)
        )
      );
    for (const m of members)
      membersByRow.set(m.rowId, [...(membersByRow.get(m.rowId) ?? []), m.cin]);
  }
  let roster: string[] = [];
  try {
    const raw = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : [];
    roster = Array.isArray(raw)
      ? raw.map((e: any) => String(e?.cin ?? "")).filter(Boolean)
      : [];
  } catch {
    roster = [];
  }

  const flags = computeRowFlags({
    rows,
    firstOwn,
    own: r => r.id > 0,
    membersByRow,
    roster,
    subject,
  });
  const reportRows: VisualRsRow[] = ownRows.map((r, i) => ({
    rowId: r.id,
    rowNumber: r.rowNumber ?? i + 1,
    time: r.time,
    observation: r.observation ?? "",
    flag: flags[i] ?? null,
  }));
  const items = buildVisualRs(reportRows);

  // Where each frame's place is: a marker carrying the place first (the flag
  // goes on the most specific marker), else the geocoder, as the Supervisor
  // Summary map does. A vehicle only where it has its own marker.
  const markers = (await getCustomMarkers()).filter(
    m => m.operationId == null || m.operationId === sheet.operationId
  );
  const places = Array.from(
    new Set(
      items.flatMap(i =>
        i.kind === "frame" && i.flag.place ? [i.flag.place] : []
      )
    )
  );
  const atPlace = new Map<string, { lat: number; lng: number }>();
  const needGeocode: string[] = [];
  for (const place of places) {
    const hit = markers.find(
      m =>
        markerKind(m.markerIcon ?? null, m.label ?? null) !== "vehicle" &&
        [m.address, m.linkedIntelLabel].some(
          n => !!n && samePlace(String(n), place)
        )
    );
    if (hit) atPlace.set(place, { lat: hit.lat, lng: hit.lng });
    else needGeocode.push(place);
  }
  if (needGeocode.length) {
    for (const g of await geocodeSummaryAddresses(sheetId, needGeocode))
      atPlace.set(g.address, { lat: g.lat, lng: g.lng });
  }

  return {
    sheet: {
      id: sheet.id,
      title: sheet.title,
      sheetDate: sheet.sheetDate ?? null,
      operationId: sheet.operationId,
      operationName: operation?.name ?? "",
    },
    target: {
      kind: subject?.kind ?? null,
      code: subject ? trackedTargetCode(subject) : null,
    },
    items: items.map(item => {
      if (item.kind !== "frame") return item;
      const at = item.flag.place
        ? (atPlace.get(item.flag.place) ?? null)
        : null;
      const veh = item.flag.rego
        ? findVehicleMarker(markers, item.flag.rego, sheet.operationId)
        : null;
      return {
        ...item,
        at,
        vehicle: veh
          ? { lat: veh.lat, lng: veh.lng, rego: item.flag.rego! }
          : null,
      };
    }),
  };
}
