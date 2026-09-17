// Running sheet titles are auto-generated, not free-typed — see CLAUDE.md
// for the format. Any piece not yet known at the time of generation is
// simply left out, so the title starts minimal and fills in as the sheet's
// date/author/target become known (re-run this after any of those change).

import type { TargetType } from "../drizzle/schema";

/** "2026-08-07" -> "20260807" */
function reverseDateISO(dateISO: string): string {
  return dateISO.replace(/-/g, "");
}

/** Perth-anchored (+08:00, no DST) YYYY-MM-DD for a JS Date — same anchoring
 * approach used elsewhere (db.ts's toPerthDateISO) so a sheet inserted just
 * after local midnight in Perth doesn't fall back to the wrong UTC day. */
export function perthDateISO(d: Date): string {
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The subset of a Target's own fields getTargetTitleBracket needs — a
 * plain structural shape (not the drizzle-inferred Target type) so this
 * file stays framework-agnostic and importable from the client bundle. The
 * full drizzle Target row satisfies this shape as-is. */
export interface TargetBracketFields {
  targetType: TargetType;
  surname?: string | null;
  vehRegistration?: string | null;
  vehColour?: string | null;
  vehMake?: string | null;
  vehModel?: string | null;
  vehType?: string | null;
  addrBusinessName?: string | null;
  addrHouseNo?: string | null;
  addrStreetName?: string | null;
  addrStreetType?: string | null;
}

/** The ALL-CAPS bracket suffix for a running sheet title, chosen from a
 * target's own structured fields according to its targetType: surname for
 * a person (unchanged from before targetType existed), "[rego] [colour]
 * [make] [model] [type]" for a vehicle — the same fields/order the
 * Intelligence folder already displays for any vehicle entity, see
 * composeVehicle's own comment in client/src/lib/addressFormat.ts — or the
 * business name (else the street short form) for a location, the same
 * bracket code composeAddress already computes. Null when the relevant
 * fields aren't filled in yet; buildRunningSheetTitle already omits a null
 * bracket rather than rendering empty parens. Shared so both the server
 * (recomputing a saved sheet's title) and the client (the New Sheet
 * dialog's live title preview) compute the exact same string. */
export function getTargetTitleBracket(
  target: TargetBracketFields | null
): string | null {
  if (!target) return null;
  if (target.targetType === "vehicle") {
    const desc = [
      target.vehColour,
      target.vehMake,
      target.vehModel,
      target.vehType,
    ]
      .filter(Boolean)
      .join(" ");
    const bracket = [target.vehRegistration, desc]
      .filter(Boolean)
      .join(" ")
      .trim();
    return bracket || null;
  }
  if (target.targetType === "location") {
    const streetShort =
      target.addrHouseNo && target.addrStreetName && target.addrStreetType
        ? `${target.addrHouseNo} ${target.addrStreetName} ${target.addrStreetType}`
        : null;
    const bracket = target.addrBusinessName?.trim() || streetShort;
    return bracket || null;
  }
  return target.surname ?? null;
}

export function buildRunningSheetTitle(params: {
  /** YYYY-MM-DD. Falls back to createdAt (Perth-anchored) for sheets predating sheetDate. */
  sheetDate: string | null;
  createdAt?: Date | null;
  authorCIN?: string | null;
  operationName: string;
  /** The bracket suffix, e.g. a Target's Surname for a person, or a
   * vehicle/address description for a Vehicle/Location-type Target — see
   * getTargetTitleBracket above for how callers choose this per
   * targetType. Always rendered upper-cased, regardless of source. */
  targetBracketLabel?: string | null;
}): string {
  const dateISO =
    params.sheetDate ??
    (params.createdAt ? perthDateISO(params.createdAt) : null);

  const parts: string[] = [];
  if (dateISO) parts.push(reverseDateISO(dateISO));
  if (params.authorCIN?.trim())
    parts.push(params.authorCIN.trim().toUpperCase());
  parts.push(params.operationName.trim());

  const base = parts.join(" - ");
  return params.targetBracketLabel?.trim()
    ? `${base} (${params.targetBracketLabel.trim().toUpperCase()})`
    : base;
}
