/**
 * The "ceased" row — the mirror of the first row.
 *
 * A sheet nearly always ends with "Surveillance ceased in the vicinity of
 * [address]" with everyone who is still on on it. One tap on Cease writes that
 * row: the opening, the place where the target was last logged (only when he is
 * at a place — never while he is moving, where a place would be a guess), and
 * every CIN that has not already ceased (shared/surveillanceState.ts). Pure
 * rules; the server's row.cease applies them (server/routers/row.ts).
 */
import { rosterCins } from "./firstRow";
import { fullStreetTypes } from "./streetTypes";
import type { TargetPosition } from "./targetPosition";

export const CEASE_OPENING = "Surveillance ceased in the vicinity of ";

/** The place to write on the ceased row, from where the target was last
 * logged — or null to leave it for the officer. Only a place the sheet really
 * says: inside somewhere, or in a vehicle at an address. Not a best guess
 * (`placeIsEstimate`), and not while he is walking, in transit, on a vessel or
 * on the move. */
export function ceasePlaceOf(pos: TargetPosition | null): string | null {
  if (!pos || !pos.place || pos.placeIsEstimate) return null;
  if (pos.state !== "inside" && pos.state !== "vehicle") return null;
  const place = pos.place.trim();
  return place.length >= 3 ? place : null;
}

/** The row's text. With a place it is a whole sentence (ending in a full stop,
 * street types in full); without one it is the opening, left for the officer
 * to finish. */
export function ceaseRowText(place: string | null | undefined): {
  observation: string;
  complete: boolean;
} {
  const p = (place ?? "")
    .trim()
    .replace(/[.\s]+$/, "")
    .trim();
  if (p.length < 3) return { observation: CEASE_OPENING, complete: false };
  return {
    observation: `${CEASE_OPENING}${fullStreetTypes(p)}.`,
    complete: true,
  };
}

/** Who goes on the row: every CIN still on, in the order the sheet shows its
 * team (leader first, then by CIN number); anyone on a row who is not on the
 * roster follows, by name. */
export function ceaseMembers(
  stillOn: readonly string[],
  sheetCins: string | null | undefined
): string[] {
  const on = new Set(stillOn.map(c => c.trim().toUpperCase()).filter(Boolean));
  const ordered = rosterCins(sheetCins).filter(c => on.has(c));
  const seen = new Set(ordered);
  const rest = Array.from(on)
    .filter(c => !seen.has(c) && c !== "__SPACE__")
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return [...ordered, ...rest];
}
