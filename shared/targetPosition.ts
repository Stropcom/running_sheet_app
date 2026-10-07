// Where the target is, as one place and a state, for marking on the map and on
// the sheet's address chips. This reads the same pending lists the continuity
// cards are built from, with the same rules (see vehicleOccupants), so the
// marker and the tracker never disagree. Deterministic: no lookups.
import {
  splitPeopleNames,
  surnameTokens,
  vehicleOccupants,
} from "./walkEventPatterns";

export type TargetState = "inside" | "vehicle" | "walking" | "moving" | "oos";

export interface TargetPosition {
  /** The place as the sheet wrote it, or null when it can't be told (a
   * vehicle that left with no origin logged). */
  place: string | null;
  state: TargetState;
  /** Short wording for a flag, e.g. "inside", "in 1ORB419". */
  label: string;
  /** Everyone with the target in that state — the vehicle's occupants, or
   * those inside / walking with him — the target first. */
  people: string[];
  rowId: number;
  rego?: string;
}

export interface TargetPositionInput {
  /** Surname token, e.g. "BAIG". */
  token: string;
  /** `names` is the occupant description with role words already stripped. */
  arrivals: {
    rego: string;
    names: string;
    address: string;
    rowId: number;
    outOfSight?: boolean;
  }[];
  departures: {
    rego: string;
    names: string;
    fromAddress?: string | null;
    rowId: number;
  }[];
  walkIns: { names: string; location: string; rowId: number }[];
  headingTo: {
    names: string;
    destination: string;
    from: string;
    rowId: number;
  }[];
  placements: { name: string; rego: string; rowId: number }[];
}

export const TARGET_EMOJI: Record<TargetState, string> = {
  inside: "🧍",
  vehicle: "🚗",
  walking: "🚶",
  moving: "🚗",
  oos: "❔",
};

const targetFirst = (people: string[], token: string) => [
  ...people.filter(p => has(p, token)),
  ...people.filter(p => !has(p, token)),
];

const has = (names: string, token: string) =>
  surnameTokens(names).includes(token.toUpperCase());

export function locateTarget(
  input: TargetPositionInput
): TargetPosition | null {
  const t = input.token.toUpperCase();
  const onFoot = [
    ...input.walkIns.map(w => w.names),
    ...input.headingTo.map(h => h.names),
  ];
  const all = [
    ...input.arrivals.map(a => ({
      rego: a.rego,
      rowId: a.rowId,
      names: a.names,
    })),
    ...input.departures.map(d => ({
      rego: d.rego,
      rowId: d.rowId,
      names: d.names,
    })),
  ];
  const occupantsOf = (v: { rego: string; rowId: number; names: string }) =>
    vehicleOccupants(v, onFoot, input.placements, all);

  const found: TargetPosition[] = [];

  for (const w of input.walkIns) {
    if (has(w.names, t)) {
      found.push({
        place: w.location,
        state: "inside",
        label: "inside",
        people: targetFirst(splitPeopleNames(w.names), t),
        rowId: w.rowId,
      });
    }
  }
  for (const h of input.headingTo) {
    if (!has(h.names, t)) continue;
    // Walking from a vehicle: the place is where that vehicle is parked.
    const fromVehicle =
      !h.from || /^the vehicle$/i.test(h.from)
        ? input.arrivals.find(a => has(a.names, t))?.address
        : h.from;
    found.push({
      place: fromVehicle ?? null,
      state: "walking",
      label: "walking",
      people: targetFirst(splitPeopleNames(h.names), t),
      rowId: h.rowId,
    });
  }
  for (const a of input.arrivals) {
    const people = occupantsOf(a);
    if (!people.some(p => has(p, t))) continue;
    const placedAfter = input.placements.some(
      p =>
        p.rowId > a.rowId &&
        has(p.name, t) &&
        p.rego.toUpperCase() !== a.rego.toUpperCase()
    );
    const oos = !!a.outOfSight && !placedAfter;
    const joinedRow = Math.max(
      a.rowId,
      ...input.placements
        .filter(
          p => has(p.name, t) && p.rego.toUpperCase() === a.rego.toUpperCase()
        )
        .map(p => p.rowId)
    );
    found.push({
      place: a.address || null,
      state: oos ? "oos" : "vehicle",
      label: oos ? "out of sight" : `in ${a.rego}`,
      people: targetFirst(people, t),
      rowId: joinedRow,
      rego: a.rego,
    });
  }
  for (const d of input.departures) {
    const people = occupantsOf(d);
    if (!people.some(p => has(p, t))) continue;
    const joinedRow = Math.max(
      d.rowId,
      ...input.placements
        .filter(
          p => has(p.name, t) && p.rego.toUpperCase() === d.rego.toUpperCase()
        )
        .map(p => p.rowId)
    );
    found.push({
      place: d.fromAddress || null,
      state: "moving",
      label: `departed in ${d.rego}`,
      people: targetFirst(people, t),
      rowId: joinedRow,
      rego: d.rego,
    });
  }

  if (found.length === 0) return null;
  // The newest row wins. Ties keep the order above, which prefers being
  // somewhere specific (inside, walking) over being in a vehicle.
  return found.reduce((a, b) => (b.rowId > a.rowId ? b : a));
}

/** Whether two ways of writing a place are the same one: the same text, or
 * one contained in the other once case and punctuation are ignored. */
export function samePlace(a: string, b: string): boolean {
  const n = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const x = n(a);
  const y = n(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** `locateTarget` over the pending lists as the server returns them, where
 * occupants are still written as the officer wrote them. `extractNames` strips
 * the role words (the client's extractOccupantNames). */
export function locateTargetFromPending(args: {
  token: string | null | undefined;
  arrivals: {
    rego: string;
    occupantDesc: string;
    address: string;
    rowId: number;
    outOfSight?: boolean;
  }[];
  departures: {
    rego: string;
    occupantDesc: string;
    fromAddress?: string | null;
    rowId: number;
  }[];
  walkIns: TargetPositionInput["walkIns"];
  headingTo: TargetPositionInput["headingTo"];
  placements: TargetPositionInput["placements"];
  extractNames: (desc: string) => string;
}): TargetPosition | null {
  if (!args.token) return null;
  return locateTarget({
    token: args.token,
    arrivals: args.arrivals.map(a => ({
      rego: a.rego,
      names: args.extractNames(a.occupantDesc),
      address: a.address,
      rowId: a.rowId,
      outOfSight: a.outOfSight,
    })),
    departures: args.departures.map(d => ({
      rego: d.rego,
      names: args.extractNames(d.occupantDesc),
      fromAddress: d.fromAddress,
      rowId: d.rowId,
    })),
    walkIns: args.walkIns,
    headingTo: args.headingTo,
    placements: args.placements,
  });
}
