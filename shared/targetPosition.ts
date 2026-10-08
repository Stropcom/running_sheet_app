// Where the target is, as one place and a state, for marking on the map and on
// the sheet's address chips. This reads the same pending lists the continuity
// cards are built from, with the same rules (see vehicleOccupants), so the
// marker and the tracker never disagree. Deterministic: no lookups.
import { shortAddressLabel } from "./markerLink";
import {
  nameWords,
  occupantsToVehicle,
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
  /** The vehicle's own marker on the map, when it has one and the target is
   * in it: a vehicle with a marker is where its marker is, so the flag goes
   * on the marker rather than on an address written in a row. */
  marker?: { lat: number; lng: number };
  /** The place is a best guess (where he was last logged), because nothing
   * logged says where the vehicle is. */
  placeIsEstimate?: boolean;
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
  placements: {
    name: string;
    rego: string;
    rowId: number;
    inside?: boolean;
    /** Where they were last logged before getting into the vehicle. */
    at?: string;
    /** The vehicle's own marker on the map, when it has one. */
    vehicleMarker?: {
      lat: number;
      lng: number;
      address: string | null;
    };
  }[];
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
  nameWords(names).includes(token.toUpperCase());

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
  // The marker standing for a vehicle, from anyone placed in it.
  const markerOf = (rego: string) => {
    const m = input.placements.find(
      p => p.rego.toUpperCase() === rego.toUpperCase() && p.vehicleMarker
    )?.vehicleMarker;
    return m ? { marker: { lat: m.lat, lng: m.lng } } : {};
  };

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
      label: "departed on foot",
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
      label: oos
        ? "out of sight"
        : occupantsToVehicle(a, people, input.placements).some(p => has(p, t))
          ? `to ${a.rego}`
          : `in ${a.rego}`,
      people: targetFirst(people, t),
      rowId: joinedRow,
      rego: a.rego,
      ...(oos ? {} : markerOf(a.rego)),
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

  // Got into a vehicle that has no arrival or departure row of its own (only
  // "entered a gold BMW ... (Vehicle 1FAB888)"): taken to be where they were
  // last logged.
  const loggedRegos = new Set(
    [...input.arrivals, ...input.departures].map(v => v.rego.toUpperCase())
  );
  const inVehicle = input.placements.filter(
    p => p.rego && p.inside !== false && !loggedRegos.has(p.rego.toUpperCase())
  );
  for (const mine of inVehicle.filter(p => has(p.name, t))) {
    const rego = mine.rego.toUpperCase();
    const m =
      mine.vehicleMarker ??
      inVehicle.find(p => p.rego.toUpperCase() === rego && p.vehicleMarker)
        ?.vehicleMarker;
    // Where the vehicle is: its marker's address when it has one, else where
    // he was last logged.
    const markerPlace = m?.address ? shortAddressLabel(m.address) : "";
    found.push({
      place: markerPlace || (mine.at ?? null),
      placeIsEstimate: !markerPlace,
      ...(m ? { marker: { lat: m.lat, lng: m.lng } } : {}),
      state: "vehicle",
      label: `in ${rego}`,
      people: targetFirst(
        inVehicle.filter(p => p.rego.toUpperCase() === rego).map(p => p.name),
        t
      ),
      rowId: mine.rowId,
      rego,
    });
  }

  if (found.length === 0) return null;
  // The newest row wins. Ties keep the order above, which prefers being
  // somewhere specific (inside, walking) over being in a vehicle.
  return found.reduce((a, b) => (b.rowId > a.rowId ? b : a));
}

// Street types written short or long are the same word: "29A Robert St" and
// "29A Robert Street, COMO WA" are the same place.
const STREET_TYPE_WORDS: Record<string, string> = {
  st: "street",
  rd: "road",
  ave: "avenue",
  av: "avenue",
  dr: "drive",
  hwy: "highway",
  ct: "court",
  pl: "place",
  cres: "crescent",
  blvd: "boulevard",
  tce: "terrace",
  pde: "parade",
  ln: "lane",
  cl: "close",
  cct: "circuit",
  fwy: "freeway",
  gr: "grove",
  esp: "esplanade",
  pwy: "parkway",
};

/** Whether two ways of writing a place are the same one. Case, accents and
 * punctuation are ignored, and one counts as the other when every word of the
 * shorter appears in the longer ("Dôme Café - Deep Water Point" in the full
 * "Dôme Café - Deep Water Point, 100 The Esplanade, MOUNT PLEASANT (...)",
 * even with a slip like "dome Dôme Café ..."). Street numbers are words too,
 * so "21 Leach Avenue" never matches "15 Leach Ave". */
export function samePlace(a: string, b: string): boolean {
  const words = (s: string) =>
    new Set(
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map(w => STREET_TYPE_WORDS[w] ?? w)
    );
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return false;
  const within = (small: Set<string>, big: Set<string>) =>
    Array.from(small).every(w => big.has(w));
  return x.size <= y.size ? within(x, y) : within(y, x);
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

/**
 * The parked vehicles people on foot could plausibly walk to. A vehicle left
 * behind at an earlier address is not an option once those people have moved
 * on by vehicle: the vehicles that count are the ones at the address where
 * their latest vehicle journey ended — the newest arrival that names them (or
 * a vehicle they were logged walking to / getting into). With no vehicle
 * history at all, only vehicles at the place they are at ( `fallbackPlace` )
 * count. Vehicles with no address written are always kept.
 */
export function vehiclesPeopleCanReach<
  T extends { rego: string; address: string; rowId: number },
>(args: {
  /** The people on foot, as written. */
  people: string;
  /** Parked vehicles with their occupants already stripped to names. */
  arrivals: (T & { names: string })[];
  placements: { name: string; rego: string; rowId: number }[];
  fallbackPlace?: string | null;
}): T[] {
  const tokens = new Set(surnameTokens(args.people));
  const hit = (s: string) => surnameTokens(s).some(t => tokens.has(t));
  const events: { rowId: number; address: string }[] = [];
  for (const a of args.arrivals) {
    if (hit(a.names)) events.push({ rowId: a.rowId, address: a.address });
  }
  for (const p of args.placements) {
    if (!p.rego || !hit(p.name)) continue;
    const v = args.arrivals.find(
      a => a.rego.toUpperCase() === p.rego.toUpperCase()
    );
    if (v)
      events.push({ rowId: Math.max(p.rowId, v.rowId), address: v.address });
  }
  const anchor = events.length
    ? events.reduce((a, b) => (b.rowId > a.rowId ? b : a)).address
    : (args.fallbackPlace ?? null);
  if (!anchor) return args.arrivals;
  return args.arrivals.filter(a => !a.address || samePlace(a.address, anchor));
}

/** For display on the cards and the map flag: "unidentified male (UM1)" is
 * shown as its short bracketed name, "UM1" (likewise UF2, UC1 ...). Only a
 * display change — the sentences the cards insert keep the officer's wording
 * (and the app-wide first-mention-full rule). */
export function shortUnidentified(text: string): string {
  return text.replace(
    /\bunidentified\s+(?:male|female|child|person|adult|juvenile|youth)\b[^()\n]*\(\s*([A-Za-z]{1,3}\d+)\s*\)/gi,
    (_m, code: string) => code.toUpperCase()
  );
}
