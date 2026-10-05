import type { ReactNode } from "react";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";

/** One registered address or vehicle, ready to show in its own panel. */
export interface RegisteredDetailEntry {
  /** "hbf" / "v1f" for the two registry fields that keep a change history. */
  id: string;
  label: string;
  value: string;
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
      label: "Home Address",
      value: formatIntelAddress(t.hbf),
    });
  parseExtras(t.extraAddresses).forEach((v, i) => {
    if (v)
      out.push({
        id: `addr${i}`,
        label: `Address ${i + 2}`,
        value: formatIntelAddress(v),
      });
  });
  if (t.v1f)
    out.push({
      id: "v1f",
      label: "Vehicle 1",
      value: formatIntelVehicle(t.v1f),
    });
  if (t.v2f)
    out.push({
      id: "v2f",
      label: "Vehicle 2",
      value: formatIntelVehicle(t.v2f),
    });
  parseExtras(t.extraVehicles).forEach((v, i) => {
    if (v)
      out.push({
        id: `veh${i}`,
        label: `Vehicle ${i + 2}`,
        value: formatIntelVehicle(v),
      });
  });
  return out;
}

/** The Registered Details rows as individual panels — a small capitalised
 * label above the value — the same look as an associate's profile. */
export function RegisteredDetailPanels({
  entries,
  after,
}: {
  entries: RegisteredDetailEntry[];
  /** Extra content under one entry's value (e.g. its change history). */
  after?: (entry: RegisteredDetailEntry) => ReactNode;
}) {
  return (
    <div className="space-y-2">
      {entries.map(e => (
        <div
          key={e.id}
          className="px-3 py-2 rounded-lg border border-border/60 bg-muted/20"
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
            {e.label}
          </p>
          <p className="text-sm text-foreground break-words">{e.value}</p>
          {after?.(e)}
        </div>
      ))}
    </div>
  );
}
