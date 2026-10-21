import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";
import {
  extraAddressHeading,
  parseExtraAddresses,
} from "@shared/extraAddresses";

/** One registered address or vehicle, ready to show in its own panel. */
export interface RegisteredDetailEntry {
  /** "hbf" / "v1f" for the two registry fields that keep a change history. */
  id: string;
  label: string;
  value: string;
  /** Which sub-heading it sits under in Registered Details. */
  kind: "address" | "vehicle";
}

const parseExtras = (json: string | null | undefined): string[] => {
  if (!json) return [];
  try {
    const list: Array<{ full?: string; short?: string }> = JSON.parse(json);
    return list.map(x => x.full?.trim() || x.short?.trim() || "");
  } catch {
    return [];
  }
};

/** Every address and vehicle on a target's registry record, in the order it
 * is shown: Home Address, Address 2…, Vehicle 1, Vehicle 2, then further
 * vehicles. */
export function targetDetailEntries(t: {
  hbf?: string | null;
  v1f?: string | null;
  v2f?: string | null;
  extraAddresses?: string | null;
  extraVehicles?: string | null;
}): RegisteredDetailEntry[] {
  const out: RegisteredDetailEntry[] = [];
  if (t.hbf)
    out.push({
      id: "hbf",
      kind: "address",
      label: "Home Address",
      value: formatIntelAddress(t.hbf),
    });
  parseExtraAddresses(t.extraAddresses).forEach((a, i) => {
    if (a.value)
      out.push({
        id: `addr${i}`,
        kind: "address",
        label: extraAddressHeading(a.label, i + 2),
        value: formatIntelAddress(a.value),
      });
  });
  if (t.v1f)
    out.push({
      id: "v1f",
      kind: "vehicle",
      label: "Vehicle 1",
      value: formatIntelVehicle(t.v1f),
    });
  if (t.v2f)
    out.push({
      id: "v2f",
      kind: "vehicle",
      label: "Vehicle 2",
      value: formatIntelVehicle(t.v2f),
    });
  parseExtras(t.extraVehicles).forEach((v, i) => {
    if (v)
      out.push({
        id: `veh${i}`,
        kind: "vehicle",
        label: `Vehicle ${i + 2}`,
        value: formatIntelVehicle(v),
      });
  });
  return out;
}

/** The two sub-headings of Registered Details, in order, with the entries
 * under each. A group with nothing in it is left out. */
export function groupDetailEntries(
  entries: RegisteredDetailEntry[]
): {
  kind: RegisteredDetailEntry["kind"];
  title: string;
  items: RegisteredDetailEntry[];
}[] {
  return [
    { kind: "address" as const, title: "Addresses" },
    { kind: "vehicle" as const, title: "Vehicles" },
  ]
    .map(g => ({ ...g, items: entries.filter(e => e.kind === g.kind) }))
    .filter(g => g.items.length > 0);
}
