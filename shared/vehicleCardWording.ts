// ─── Wording on the Target Logger's vehicle card ────────────────────────────
// The buttons on a parked vehicle's card, and the occupants a "depart" sentence
// names. Pure rules (no screen, no database) so the running sheet's Target
// Logger and the Map's Quick Entry card read them the same way.
//
//   "Tgt to 1EMB303"   the target walks to the vehicle (anyone else:
//                      "Walked to 1EMB303")
//   "1EMB303 Depart"   the vehicle leaves
//
// A depart pressed when nobody is logged as in the vehicle (the driver went
// inside the address and "Walked to vehicle" was not pressed first) used to say
// "unseen occupant/s". It now carries on from how the vehicle arrived —
// "SANTOS driver and sole occupant", or the driver and passenger as they were
// worded — minus anyone a later row has put somewhere else.
import type { TrackedTarget } from "./trackedTarget";
import { extractOccupantNames } from "./occupantNames";
import { seatedOccupantWording, type SeatPlacement } from "./vehicleSeats";
import {
  nameWords,
  occupantWording,
  surnameTokens,
  vehicleOccupants,
  type VehicleOccupantSource,
} from "./walkEventPatterns";

/** Whether the person target of the sheet is one of `people` ("SANTOS", or
 * "SANTOS and JONES"). Only a person target walks to a vehicle: a vehicle or
 * location target, or no target, is never "Tgt". */
export function namesTheTarget(
  people: string,
  target: TrackedTarget | null | undefined
): boolean {
  if (!target || target.kind !== "person") return false;
  return nameWords(people).includes(target.token.toUpperCase());
}

/** The button for someone walking out to a parked vehicle: "Tgt to 1EMB303"
 * when the target is among them, else "Walked to 1EMB303". */
export function walkedToVehicleLabel(
  rego: string,
  people: string,
  target: TrackedTarget | null | undefined
): string {
  return namesTheTarget(people, target)
    ? `Tgt to ${rego}`
    : `Walked to ${rego}`;
}

/** The button for the vehicle leaving: "1EMB303 Depart". */
export function vehicleDepartLabel(rego: string): string {
  return `${rego} Depart`;
}

/** The placeholder for a departure nobody is known to be in. */
export const UNSEEN_OCCUPANTS = "unseen occupant/s";

/**
 * The occupants a departure names when nobody is logged as in the vehicle now:
 * the arrival's own wording, cut down to those not since put anywhere else.
 *  - `onFootElsewhere`: everyone logged inside ANOTHER address or heading
 *    somewhere. People inside THIS address are deliberately not in the list —
 *    the driver who went inside and is driving off is exactly the case here;
 *  - `insideThisAddress`: those people, so the row that put them inside is not
 *    mistaken for "put somewhere else" (a person inside a place is stored as a
 *    placement with no vehicle);
 *  - someone a later row put in another vehicle (`placements`) is left out;
 *  - the whole arrival wording when nobody has gone elsewhere (so "SANTOS driver
 *    and sole occupant" and "SANTOS driver, JONES front passenger" read as they
 *    were written); the remaining parts when someone has;
 *  - "unseen occupant/s" when the arrival named nobody, or nobody is left.
 */
export function continuedOccupantWording(input: {
  rego: string;
  arrivalDesc: string;
  arrivalRowId: number;
  onFootElsewhere: string[];
  insideThisAddress: string[];
  placements: SeatPlacement[];
  allVehicleRows: VehicleOccupantSource[];
}): string {
  const names = extractOccupantNames(input.arrivalDesc);
  if (!names.trim()) return UNSEEN_OCCUPANTS;
  const inside = new Set(
    input.insideThisAddress.flatMap(n => surnameTokens(n))
  );
  const placements = input.placements.filter(
    p => !(p.rego === "" && surnameTokens(p.name).some(t => inside.has(t)))
  );
  const occupants = vehicleOccupants(
    { rego: input.rego, rowId: input.arrivalRowId, names },
    input.onFootElsewhere,
    placements,
    input.allVehicleRows
  );
  if (occupants.length === 0) return UNSEEN_OCCUPANTS;
  return (
    occupantWording(input.arrivalDesc, occupants) ??
    seatedOccupantWording({
      desc: input.arrivalDesc,
      descRowId: input.arrivalRowId,
      rego: input.rego,
      occupants,
      placements,
    }) ??
    occupants.join(" and ")
  );
}

/**
 * The "Left address" sentence: who left, and from where, stopping after "walked "
 * so the officer types the rest (the route and where to) straight on — no
 * "[route] towards [location]" placeholders to delete first. The one trailing
 * space is deliberate: the cursor lands after it, ready to type. Read the same
 * as the placeholder version by the Target Logger (they have left the address,
 * heading somewhere not yet said).
 */
export function leftAddressSentence(names: string, location: string): string {
  return `${names} exited ${location} and walked `;
}
