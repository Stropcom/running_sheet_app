// Part of the Intelligence page (client/src/pages/Intelligence.tsx): labels, colours, small derivations and the date-filter helpers.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { User, Car, MapPin, Building2, HelpCircle } from "lucide-react";
import { formatIntelAddress, tidyRepeatedPlaceName } from "@/lib/addressFormat";
import type { EntityType, Occurrence, Entity, DatePreset } from "./types";

// A place name for display: tidied, and shown once when the label repeats it
// ("Terminal 4, Terminal 4" → "Terminal 4").
export const placeLabel = (shortForm: string) =>
  tidyRepeatedPlaceName(formatIntelAddress(shortForm));

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const TYPE_LABELS: Record<EntityType, string> = {
  person: "Person",
  vehicle: "Vehicle",
  address: "Location",
  business: "Location",
  unknown: "Other",
};

export const TYPE_ICONS: Record<EntityType, React.ReactNode> = {
  person: <User className="w-3.5 h-3.5" />,
  vehicle: <Car className="w-3.5 h-3.5" />,
  address: <MapPin className="w-3.5 h-3.5" />,
  business: <Building2 className="w-3.5 h-3.5" />,
  unknown: <HelpCircle className="w-3.5 h-3.5" />,
};

// A registered target (rose) is told apart from other people mined from
// observation text (navy) — see TYPE_COLORS.person.
export const TARGET_COLOR =
  "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400";

export const TYPE_COLORS: Record<EntityType, string> = {
  person:
    "bg-blue-900/10 text-blue-900 border-blue-900/30 dark:bg-blue-400/10 dark:text-blue-300 dark:border-blue-400/30",
  vehicle:
    "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  address:
    "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  business:
    "bg-purple-500/10 text-purple-600 border-purple-500/30 dark:text-purple-400",
  unknown: "bg-muted text-muted-foreground border-border",
};

function formatTime(minutes: number | null): string {
  if (minutes === null) return "";
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function uniqueSheets(occurrences: Occurrence[]) {
  const seen = new Set<number>();
  return occurrences.filter(o => {
    if (seen.has(o.sheetId)) return false;
    seen.add(o.sheetId);
    return true;
  });
}

// ─── Derived sort keys (Vehicle "Make" / Location "Suburb") ───────────────────
// Vehicles and locations aren't registry tables of their own — there's no
// structured "make" or "suburb" field to sort by — so these are parsed
// deterministically off the entity's already-normalised display text
// instead, matching composeVehicle/composeAddress's own field order
// (shared/lib/addressFormat.ts) rather than guessing at free-form text.

const VEHICLE_MAKE_SKIP_COLOURS = new Set([
  "white",
  "black",
  "silver",
  "grey",
  "gray",
  "blue",
  "red",
  "green",
  "yellow",
  "gold",
  "brown",
  "maroon",
  "orange",
  "purple",
  "tan",
  "beige",
  "cream",
  "navy",
  "khaki",
  "pink",
  "bronze",
  "charcoal",
]);

// entity.shortForm for a vehicle is already normalised into "REGO colour
// make model type" order by formatIntelVehicle (shared/addressFormat.ts) —
// regardless of whether the vehicle came from a registered V1/extra-vehicle
// field or a free-text observation mention. Strip the leading rego token,
// then an optional colour word, and whatever's left is the make.
export function deriveVehicleMake(entity: Entity): string {
  const words = entity.shortForm.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  let idx = 0;
  if (/[A-Za-z]/.test(words[0]) && /\d/.test(words[0])) idx = 1;
  if (words[idx] && VEHICLE_MAKE_SKIP_COLOURS.has(words[idx].toLowerCase()))
    idx++;
  return words[idx] ?? "";
}

const SUBURB_STATE_RE =
  /,\s*([A-Za-z][\w\s]*?)\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\b/;

// An address entity's shortForm deliberately drops the suburb (the
// "subsequent mention" convention — see isAddressAlreadyMentioned in
// server/db.ts), so the suburb has to come from an occurrence's
// fullDescription instead, which composeAddress always writes as
// "<street>, <SUBURB> <STATE> (<short>)". Different occurrences of the same
// address can carry different free-text wording, so this checks each one
// until it finds a match rather than assuming the first occurrence has it.
export function deriveSuburb(entity: Entity): string {
  for (const occ of entity.occurrences) {
    const match = occ.fullDescription.match(SUBURB_STATE_RE);
    if (match) return match[1].trim();
  }
  return "";
}

// The alphabetically-earliest real operation name (excluding the
// operationId=0 "(Registry)" pseudo-operation) among this entity's
// occurrences — used for "Sort by Operation". A target/associate linked to
// several operations sorts by whichever of those names comes first, same
// tie-break a human alphabetising a list by hand would use.
export function getPrimaryOperationName(entity: Entity): string {
  let best: string | null = null;
  for (const occ of entity.occurrences) {
    if (occ.operationId === 0 || occ.operationName === "(Registry)") continue;
    if (best === null || occ.operationName.localeCompare(best) < 0)
      best = occ.operationName;
  }
  return best ?? "";
}

// The entity count on an operation row/tile: a button that opens the
// operation's entity list.
export const entityPillClass = (open: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
    open
      ? "border-primary bg-primary/10 text-foreground"
      : "border-border bg-background text-foreground hover:bg-muted/60"
  }`;

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "1w", label: "1 week" },
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "custom", label: "Custom range" },
];

export function presetToRange(
  preset: DatePreset,
  customFrom: string,
  customTo: string
): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (preset === "all") return { from: null, to: null };
  if (preset === "1w") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { from: d, to: now };
  }
  if (preset === "1m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return { from: d, to: now };
  }
  if (preset === "3m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 3);
    return { from: d, to: now };
  }
  if (preset === "6m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 6);
    return { from: d, to: now };
  }
  if (preset === "custom") {
    return {
      from: customFrom ? new Date(customFrom) : null,
      to: customTo ? new Date(customTo + "T23:59:59") : null,
    };
  }
  return { from: null, to: null };
}
