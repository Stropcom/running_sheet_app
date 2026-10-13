/**
 * The number on a map marker: how many distinct people and vehicles the
 * marker's popup lists. It follows the popup (entityBlocksHtml in
 * IntelligenceMapping.tsx) exactly, so the badge and what you see when you
 * tap the pin always agree:
 *
 *  - the people REGISTERED at the address (target home address, other
 *    residents, associates), each with every vehicle on their registry
 *    record;
 *  - then what running sheets OBSERVED there: the targets and people seen,
 *    and the vehicles seen — only those, not every vehicle those people own;
 *  - a pin that absorbed other addresses within 20 m (secondaryLocs) counts
 *    all of them.
 *
 * Each person and each vehicle counts once, however many times it appears.
 */
import { addressMatchKey } from "./addressMatchKey";
import { formatIntelVehicle, shortPersonDisplayName } from "./addressFormat";

export interface CountPerson {
  name: string;
  vehicles: string[];
}
export interface CountRegistered extends CountPerson {
  role: "target" | "resident" | "associate";
}
export interface CountRegistry {
  byName: Map<string, CountPerson>;
  byAddress: Map<string, CountRegistered[]>;
}
export interface CountLocation {
  label: string;
  type: "target_address" | "associate_address" | "observation";
  linkedTargets: Array<{
    name: string;
    v1f?: string | null;
    v2f?: string | null;
    addressLabel?: string | null;
  }>;
  assocPersons: string[];
  assocVehicles: string[];
  observedTargets?: string[];
  observedPersons?: string[];
  observedVehicles?: string[];
  secondaryLocs?: CountLocation[];
}

/** A vehicle's identity: its registration when the line leads with one
 * ("1NAV48 charcoal Mazda …"), else the whole line. */
export function vehicleDedupeKey(v: string): string {
  const shown = formatIntelVehicle(v).trim();
  const first = shown.split(/\s+/)[0] ?? "";
  return /\d/.test(first) && /^[A-Za-z0-9-]{3,8}$/.test(first)
    ? first.toUpperCase()
    : shown.toLowerCase();
}

function collect(
  loc: CountLocation,
  registry: CountRegistry | undefined,
  people: Set<string>,
  vehicles: Set<string>
) {
  const addVehicle = (v?: string | null) => {
    if (v && v.trim()) vehicles.add(vehicleDedupeKey(v));
  };
  const personKey = (raw: string) => shortPersonDisplayName(raw).toLowerCase();
  // A registered person: counted once, with every vehicle on their registry
  // record (the fallback is used when the registry hasn't loaded).
  const addRegistered = (raw: string, fallbackVehicles: string[]) => {
    const key = personKey(raw);
    if (!key) return;
    people.add(key);
    (registry?.byName.get(key)?.vehicles ?? fallbackVehicles).forEach(
      addVehicle
    );
  };
  // Someone only seen here: counted, but their other vehicles are not.
  const addSeen = (raw: string) => {
    const key = personKey(raw);
    if (key) people.add(key);
  };

  const registered = registry?.byAddress.get(addressMatchKey(loc.label)) ?? [];
  if (registered.length > 0) {
    for (const p of registered) addRegistered(p.name, p.vehicles);
  } else if (loc.type === "target_address") {
    for (const t of loc.linkedTargets)
      if (!t.addressLabel)
        addRegistered(t.name, [t.v1f ?? "", t.v2f ?? ""].filter(Boolean));
  } else if (loc.type === "associate_address") {
    for (const n of loc.assocPersons) addRegistered(n, []);
  }
  // A target's additional (non-home) registered address.
  for (const t of loc.linkedTargets)
    if (t.addressLabel)
      addRegistered(t.name, [t.v1f ?? "", t.v2f ?? ""].filter(Boolean));

  // What running sheets recorded here. (An older server's observation pin has
  // no separate observed lists — its own lists are its observations.)
  const legacy = loc.type === "observation";
  (
    loc.observedTargets ?? (legacy ? loc.linkedTargets.map(t => t.name) : [])
  ).forEach(addSeen);
  (loc.observedPersons ?? (legacy ? loc.assocPersons : [])).forEach(addSeen);
  (loc.observedVehicles ?? (legacy ? loc.assocVehicles : [])).forEach(
    addVehicle
  );
}

export function markerEntityCount(
  loc: CountLocation,
  registry: CountRegistry | undefined
): number {
  const people = new Set<string>();
  const vehicles = new Set<string>();
  collect(loc, registry, people, vehicles);
  for (const sec of loc.secondaryLocs ?? [])
    collect(sec, registry, people, vehicles);
  return people.size + vehicles.size;
}
