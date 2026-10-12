/**
 * The step rules for the Add Target to Registry dialog — pure functions, no
 * React, so they can be unit-tested (server/addTargetSteps.test.ts).
 *
 * The dialog has four tabs (Target, Residents, Associates, Background). A tab
 * is done when every section on it is either FILLED IN or has its "nothing to
 * add" box ticked ("No known address", "No known vehicles", "No other
 * residents", "No associates", "No background to add"). Tabs open in order:
 * you can only enter a tab once every earlier one is done, and Save only
 * works when all four are.
 */

import {
  composeAddress,
  composeAssociateName,
  composeLocationTargetName,
  composeTargetName,
  composeVehicle,
  composeVehicleTargetName,
  type StructuredAddressParts,
  type StructuredNameParts,
  type StructuredVehicleParts,
} from "@/lib/addressFormat";
import type { TargetType } from "@shared/types";

export type StepKey = "target" | "residents" | "associates" | "background";
export const STEP_ORDER: readonly StepKey[] = [
  "target",
  "residents",
  "associates",
  "background",
];
export const STEP_LABEL: Record<StepKey, string> = {
  target: "Target",
  residents: "Residents",
  associates: "Associates",
  background: "Background",
};

/** done = filled in, none = "nothing to add" ticked, todo = needs doing. */
export type SectionStatus = "done" | "none" | "todo";

type Addr = StructuredAddressParts;
type Veh = StructuredVehicleParts & { vehicleType?: string };

// ─── Blank checks ───────────────────────────────────────────────────────────

/** Any street detail typed (business/place name alone doesn't count: for an
 * associate it can stand in for the person's name). */
export function addressHasDetail(a: Addr): boolean {
  return !!(
    a.unitNo.trim() ||
    a.houseNo.trim() ||
    a.streetName.trim() ||
    a.streetType.trim() ||
    a.suburb.trim()
  );
}

/** Nothing at all typed in this address (so "No known address" may be ticked). */
export function addressIsBlank(a: Addr): boolean {
  return !addressHasDetail(a) && !(a.businessName ?? "").trim();
}

export function vehicleIsBlank(v: Veh): boolean {
  return !(
    v.registration.trim() ||
    v.colour.trim() ||
    v.make.trim() ||
    v.model.trim() ||
    (v.vehicleType ?? "").trim()
  );
}

export function addressIsComplete(a: Addr): boolean {
  return !!composeAddress(a).full;
}

export function vehicleIsComplete(v: Veh): boolean {
  return !!composeVehicle(v).full;
}

// ─── Address / vehicle lists (primary first, then the extras) ──────────────

const ADDRESS_NEEDS = "a house number, street name, street type and suburb";
const VEHICLE_NEEDS = "a registration, colour, make and model";

/** What is wrong with a list of addresses, or null when it is fine. `none` is
 * the "No known address" tick; `who` reads "the target’s", "this person’s". */
export function addressListProblem(
  list: Addr[],
  none: boolean,
  who: string
): string | null {
  if (none) {
    return list.some(a => addressHasDetail(a))
      ? "Clear the address to tick “No known address”."
      : null;
  }
  if (list.length === 1 && addressIsBlank(list[0])) {
    return `Fill in ${who} address, or tick “No known address”, to continue.`;
  }
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (addressIsComplete(a)) continue;
    const name = i === 0 ? "The first address" : `Address ${i + 1}`;
    return addressIsBlank(a)
      ? `${name} is empty. Fill it in or remove it.`
      : `${name} is incomplete: it needs ${ADDRESS_NEEDS}.`;
  }
  return null;
}

export function vehicleListProblem(
  list: Veh[],
  none: boolean,
  who: string
): string | null {
  if (none) {
    return list.some(v => !vehicleIsBlank(v))
      ? "Clear the vehicle to tick “No known vehicles”."
      : null;
  }
  if (list.length === 1 && vehicleIsBlank(list[0])) {
    return `Fill in ${who} vehicle, or tick “No known vehicles”, to continue.`;
  }
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (vehicleIsComplete(v)) continue;
    const name = `Vehicle ${i + 1}`;
    return vehicleIsBlank(v)
      ? `${name} is empty. Fill it in or remove it.`
      : `${name} is incomplete: it needs ${VEHICLE_NEEDS}.`;
  }
  return null;
}

export function sectionStatus(
  problem: string | null,
  none: boolean
): SectionStatus {
  return problem ? "todo" : none ? "none" : "done";
}

// ─── A staged resident / associate ─────────────────────────────────────────

export interface PersonLike {
  identity: StructuredNameParts;
  address: Addr;
  vehicle: Veh;
  extraAddresses?: Addr[];
  extraVehicles?: Veh[];
  /** Residents: lives at the target's address, so nothing to fill in here. */
  addressFollowsTarget?: boolean;
  noAddress?: boolean;
  noVehicle?: boolean;
}

export function personAddresses(p: PersonLike): Addr[] {
  return [p.address, ...(p.extraAddresses ?? [])];
}
export function personVehicles(p: PersonLike): Veh[] {
  return [p.vehicle, ...(p.extraVehicles ?? [])];
}

/** Nothing typed anywhere on this person (so the section's "none" box may be
 * ticked, and the person may be dropped without losing anything). */
export function personIsBlank(p: PersonLike): boolean {
  const id = p.identity;
  return (
    !(id.firstNames.trim() || id.surname.trim() || id.bornDate.trim()) &&
    personAddresses(p).every(addressIsBlank) &&
    personVehicles(p).every(vehicleIsBlank)
  );
}

export function personAddressProblem(p: PersonLike): string | null {
  if (p.addressFollowsTarget) return null;
  return addressListProblem(personAddresses(p), !!p.noAddress, "this person’s");
}

export function personVehicleProblem(p: PersonLike): string | null {
  return vehicleListProblem(personVehicles(p), !!p.noVehicle, "this person’s");
}

/** The first thing missing on a person, as a short phrase (no full stop), or
 * null when the person is done. */
export function personProblem(p: PersonLike): string | null {
  const first = p.identity.firstNames.trim();
  const sur = p.identity.surname.trim();
  if (!composeAssociateName(p.identity, p.address.businessName).name) {
    return !first && !sur
      ? "Add a first name and a surname"
      : !first
        ? "Add a first name"
        : "Add a surname";
  }
  const addr = personAddressProblem(p);
  if (addr) return addr.replace(/,? to continue\.$/, "").replace(/\.$/, "");
  const veh = personVehicleProblem(p);
  if (veh) return veh.replace(/,? to continue\.$/, "").replace(/\.$/, "");
  return null;
}

export function personIsDone(p: PersonLike): boolean {
  return personProblem(p) === null;
}

/** What is wrong with a Residents / Associates list, or null when it is fine. */
export function peopleProblem(
  list: PersonLike[],
  none: boolean,
  kind: "resident" | "associate",
  label: (p: PersonLike, i: number) => string
): string | null {
  if (none) {
    return list.every(personIsBlank)
      ? null
      : `Clear the ${kind}s to tick “${kind === "resident" ? "No other residents" : "No associates"}”.`;
  }
  if (list.length === 0 || (list.length === 1 && personIsBlank(list[0]))) {
    return kind === "resident"
      ? "Fill in the resident’s details, or tick “No other residents”, to continue."
      : "Fill in the associate’s details, or tick “No associates”, to continue.";
  }
  for (let i = 0; i < list.length; i++) {
    const problem = personProblem(list[i]);
    if (problem) {
      const text = problem.charAt(0).toLowerCase() + problem.slice(1);
      return `${label(list[i], i)}: ${text}.`;
    }
  }
  return null;
}

// ─── The whole dialog ──────────────────────────────────────────────────────

export interface StepsInput {
  targetType: TargetType;
  hasOperation: boolean;
  identity: StructuredNameParts;
  /** MDL answered (a Person target must pick Active, None or Suspended). */
  mdlChosen: boolean;
  address: Addr;
  extraAddresses: Addr[];
  noAddress: boolean;
  vehicle: Veh;
  extraVehicles: Veh[];
  noVehicle: boolean;
  residents: PersonLike[];
  noResidents: boolean;
  associates: PersonLike[];
  noAssociates: boolean;
  background: string;
  noBackground: boolean;
  /** Names a person for messages ("Paul HOGAN", or "New associate"). */
  personLabel: (p: PersonLike, kind: "resident" | "associate") => string;
}

/** The target's own address(es). For a Location target the first one IS the
 * target (required, no "none"); otherwise it is an optional detail with the
 * "No known address" tick. */
export function targetAddressProblem(i: StepsInput): string | null {
  const list = [i.address, ...i.extraAddresses];
  if (i.targetType === "location") {
    if (!composeLocationTargetName(i.address).name) {
      return "Add the location’s house number, street name, street type and suburb to continue.";
    }
    return addressListProblem(list, false, "the location’s");
  }
  return addressListProblem(
    list,
    i.noAddress,
    i.targetType === "vehicle" ? "the vehicle’s registered" : "the target’s"
  );
}

export function targetVehicleProblem(i: StepsInput): string | null {
  const list = [i.vehicle, ...i.extraVehicles];
  if (i.targetType === "vehicle") {
    if (!composeVehicleTargetName(i.vehicle).name) {
      return "Add the vehicle’s registration, colour, make and model to continue.";
    }
    return vehicleListProblem(list, false, "the target’s");
  }
  return vehicleListProblem(list, i.noVehicle, "the target’s");
}

export function targetIdentityProblem(i: StepsInput): string | null {
  if (!i.hasOperation) return "Choose an operation to continue.";
  if (i.targetType === "person") {
    if (!composeTargetName(i.identity).name) {
      return "Add the target’s first name and surname to continue.";
    }
    if (!i.mdlChosen) return "Pick the MDL status to continue.";
  }
  return null;
}

/** The first thing stopping the Target tab being done, or null. Checked in
 * the order the sections appear on screen: a Vehicle target shows its vehicle
 * first, everything else its address first. */
export function targetStepProblem(i: StepsInput): string | null {
  const identity = targetIdentityProblem(i);
  if (identity) return identity;
  return i.targetType === "vehicle"
    ? (targetVehicleProblem(i) ?? targetAddressProblem(i))
    : (targetAddressProblem(i) ?? targetVehicleProblem(i));
}

export function backgroundProblem(text: string, none: boolean): string | null {
  if (none)
    return text.trim()
      ? "Clear the background to tick “No background to add”."
      : null;
  return text.trim()
    ? null
    : "Add a background, or tick “No background to add”, to save.";
}

/** The first thing stopping `step` being done, or null when it is done. */
export function stepProblem(i: StepsInput, step: StepKey): string | null {
  switch (step) {
    case "target":
      return targetStepProblem(i);
    case "residents":
      return peopleProblem(i.residents, i.noResidents, "resident", p =>
        i.personLabel(p, "resident")
      );
    case "associates":
      return peopleProblem(i.associates, i.noAssociates, "associate", p =>
        i.personLabel(p, "associate")
      );
    case "background":
      return backgroundProblem(i.background, i.noBackground);
  }
}

export function stepStatus(i: StepsInput, step: StepKey): SectionStatus {
  const problem = stepProblem(i, step);
  if (problem) return "todo";
  if (step === "residents" && i.noResidents) return "none";
  if (step === "associates" && i.noAssociates) return "none";
  if (step === "background" && i.noBackground) return "none";
  return "done";
}

/** The first tab that isn't done yet, or null when every tab is. */
export function firstOpenStep(i: StepsInput): StepKey | null {
  for (const s of STEP_ORDER) if (stepProblem(i, s)) return s;
  return null;
}

/** Tabs open in order: a step can be entered once every step before it is done. */
export function canEnterStep(i: StepsInput, step: StepKey): boolean {
  const open = firstOpenStep(i);
  if (!open) return true;
  return STEP_ORDER.indexOf(step) <= STEP_ORDER.indexOf(open);
}
