// Visual RS — the running sheet in time order, with a picture of where the
// target is at every flag change, and every other observation kept as a plain
// text entry between the pictures. Pure rules (no screen, no database): the
// server reads the sheet and works out the flag after each row with the same
// Target Logger rules as the Map page; this turns that into frames and entries.
//
//   - a FRAME is a row after which the flag differs from before it (a new state,
//     a new place, a different vehicle) — the first row that places the target
//     is one too;
//   - an ENTRY is any other row: it keeps its place in the report, with no
//     picture.
// The wording is the row's own observation, never reworded. Nothing is guessed:
// no flag is made for a row that does not place the target.
import {
  samePlace,
  shortUnidentified,
  type TargetPosition,
} from "./targetPosition";

/** The flag after a row: what the Map page would show on the target. */
export interface VisualRsFlag {
  /** The position's state, or "ceased" once every member has ceased. */
  kind: TargetPosition["state"] | "ceased";
  /** Short wording, e.g. "inside", "in 1EMB303", "Commenced 08:39 AM". */
  label: string;
  /** The pill's text as the Map page writes it: "SANTOS · inside". */
  text: string;
  /** The place the flag is on, as the sheet wrote it. */
  place: string | null;
  /** The vehicle he is in or left from, when there is one. */
  rego: string | null;
  /** Dashed edge: out of sight, or the surveillance has ended. */
  unsure: boolean;
  /** Surveillance has ended (grey flag). */
  ended: boolean;
}

/** The flag for a position, worded like the Map page's flag. */
export function flagOfPosition(
  position: TargetPosition,
  who: string
): VisualRsFlag {
  const name = position.people.length ? position.people.join(", ") : who;
  return {
    kind: position.state,
    label: position.label,
    text: shortUnidentified(`${name} · ${position.label}`),
    place: position.place,
    rego: position.rego ?? null,
    unsure: position.state === "oos",
    ended: false,
  };
}

/** The grey flag once everyone has ceased: "SANTOS · ceased at 11:00 AM",
 * left on the last place he was logged. */
export function ceasedFlag(
  who: string,
  time: string | null,
  place: string | null
): VisualRsFlag {
  const label = time ? `ceased at ${time}` : "ceased";
  return {
    kind: "ceased",
    label,
    text: `${who} · ${label}`,
    place,
    rego: null,
    unsure: true,
    ended: true,
  };
}

/** Whether the flag changed from `prev` to `next`: a different state or
 * wording (another vehicle), or a different place. */
export function flagChanged(
  prev: VisualRsFlag | null,
  next: VisualRsFlag | null
): boolean {
  if (!next) return false;
  if (!prev) return true;
  if (prev.kind !== next.kind || prev.label !== next.label) return true;
  if (!prev.place || !next.place) return prev.place !== next.place;
  return !samePlace(prev.place, next.place);
}

/** "08:39 AM" → minutes after midnight, or null. */
export function clockMinutes(time: string | null | undefined): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*$/i.exec(time ?? "");
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) {
    const pm = m[3].toUpperCase() === "PM";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export interface VisualRsRow {
  rowId: number;
  /** The row's number on the sheet, as shown to officers. */
  rowNumber: number | null;
  time: string | null;
  observation: string;
  /** The flag after this row; null while nothing places the target. */
  flag: VisualRsFlag | null;
}

export interface VisualRsFrame {
  kind: "frame";
  row: VisualRsRow;
  flag: VisualRsFlag;
  /** What changed from the previous frame ("Place: A → B", "Flag: Inside → …"). */
  placeFrom: string | null;
  flagFrom: string | null;
  /** Minutes until the next frame (null for the last). */
  dwellMinutes: number | null;
  /** Why this row made a frame, in words. */
  why: string;
}

export interface VisualRsEntry {
  kind: "entry";
  row: VisualRsRow;
  /** The flag still standing at this row, when there is one. */
  flag: VisualRsFlag | null;
  why: string;
}

export type VisualRsItem = VisualRsFrame | VisualRsEntry;

/** Rows in order → frames and entries. */
export function buildVisualRs(rows: VisualRsRow[]): VisualRsItem[] {
  const items: VisualRsItem[] = [];
  let prev: VisualRsFlag | null = null;
  const frames: VisualRsFrame[] = [];
  for (const row of rows) {
    const flag = row.flag;
    if (flag && flagChanged(prev, flag)) {
      const placeChanged =
        !!prev &&
        !!prev.place &&
        !!flag.place &&
        !samePlace(prev.place, flag.place);
      const stateChanged =
        !!prev && (prev.kind !== flag.kind || prev.label !== flag.label);
      const frame: VisualRsFrame = {
        kind: "frame",
        row,
        flag,
        placeFrom: placeChanged ? prev!.place : null,
        flagFrom: stateChanged ? prev!.label : null,
        dwellMinutes: null,
        why: !prev
          ? "This is the first row that places the target."
          : [
              placeChanged
                ? `The place changed (${prev.place} → ${flag.place}).`
                : "",
              stateChanged
                ? `The flag changed (${prev.label} → ${flag.label}).`
                : "",
            ]
              .filter(Boolean)
              .join(" "),
      };
      items.push(frame);
      frames.push(frame);
      prev = flag;
    } else {
      items.push({
        kind: "entry",
        row,
        flag: flag ?? prev,
        why: flag
          ? `Nothing about the flag changed: it stays "${flag.label}"${flag.place ? ` at ${flag.place}` : ""}.`
          : "No row yet places the target, so there is no flag to draw.",
      });
      if (flag) prev = flag;
    }
  }
  frames.forEach((f, i) => {
    const next = frames[i + 1];
    const a = clockMinutes(f.row.time);
    const b = next ? clockMinutes(next.row.time) : null;
    if (a == null || b == null) return;
    f.dwellMinutes = b >= a ? b - a : b + 1440 - a;
  });
  return items;
}

/** A frame with where it is on the map, as the server sends it. */
export interface VisualRsPlacedFrame extends VisualRsFrame {
  /** The place on the map, or null when it could not be located (no picture). */
  at: { lat: number; lng: number } | null;
  /** The vehicle's own marker, only when it has one — never guessed. */
  vehicle: { lat: number; lng: number; rego: string } | null;
}

export type VisualRsPlacedItem = VisualRsPlacedFrame | VisualRsEntry;

export interface VisualRsReport {
  sheet: {
    id: number;
    title: string;
    sheetDate: string | null;
    operationId: number;
    operationName: string;
  };
  /** What the sheet tracks; null kind when nothing can be placed. */
  target: {
    kind: "person" | "vehicle" | "location" | null;
    code: string | null;
  };
  items: VisualRsPlacedItem[];
}
