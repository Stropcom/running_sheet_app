// Part of the Intelligence queries (server/db/intelligence.ts): marking entities that belong to a merged target's earlier history.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { VEHICLE_REGO_PATTERN } from "@shared/vehicleRego";
import { targetFieldHistory } from "../../../drizzle/schema";
import { getDb } from "../core";
import { IntelProfileEntity } from "./profileTypes";

// ─── "Previous" entity propagation (target-merge history) ─────────────────
// A vehicle/address superseded during a duplicate-target merge (see
// mergeTargetFieldDetails) should read as "Previous" everywhere it shows up
// as an associated-entity chip across Intelligence profiles, not just on
// the target's own Registered Details — otherwise the same real vehicle/
// address can appear both "current" and unmarked-stale elsewhere, which is
// exactly the confusion this is meant to prevent. Matching is by
// registration (vehicles) / normalized address core (locations) rather
// than exact string equality, since the free-text entity mined from an
// observation rarely matches the manually-typed V1F/HBF field byte-for-byte.

export function extractRegoUpper(text: string): string | null {
  const m = text.match(VEHICLE_REGO_PATTERN);
  return m ? m[0].toUpperCase() : null;
}

// Normalizes down to just the street segment (house number + street name),
// dropping suburb/state/postcode/bracket-code — so a manually-typed HBF value
// ("6 Shearman Street, ATTADALE WA (6 Shearman Street)") and a free-text
// entity mined from an observation ("6 Shearman Street, ATTADALE" or just
// "6 Shearman Street") reduce to the same comparable core regardless of which
// optional parts either side happens to include.
export function addressCoreLower(text: string): string {
  // Prefer the canonical bracket short-form when present (mirrors the
  // client's extractShortAddress) — it's just the street, no suburb/state.
  const bracketMatch = text.match(/\(([^)]{1,120})\)\s*$/);
  const base = bracketMatch ? bracketMatch[1] : text;
  return base
    .replace(/,?\s*(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\s*\d{0,4}\s*$/i, "")
    .replace(
      /^(?:unit|lot|apt|apartment|suite|ste)\s*\d+[a-z]?[,\s]*|^\d{1,4}[a-z]?\/(?=\d)/i,
      ""
    )
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function getPreviousEntityMatchers(): Promise<{
  vehicleRegos: Set<string>;
  addressCores: Set<string>;
}> {
  const db = await getDb();
  if (!db) return { vehicleRegos: new Set(), addressCores: new Set() };
  const rows = await db.select().from(targetFieldHistory);
  const vehicleRegos = new Set<string>();
  const addressCores = new Set<string>();
  for (const r of rows) {
    if (r.fieldName === "v1f" || r.fieldName === "v1") {
      const rego = extractRegoUpper(r.previousValue);
      if (rego) vehicleRegos.add(rego);
    } else if (r.fieldName === "hbf" || r.fieldName === "hb") {
      const core = addressCoreLower(r.previousValue);
      if (core) addressCores.add(core);
    }
  }
  return { vehicleRegos, addressCores };
}

/** Mutates matching vehicle/location entities in place, flagging isPrevious. */
export function markPreviousEntities(
  assocVehicles: IntelProfileEntity[],
  assocLocations: IntelProfileEntity[],
  matchers: { vehicleRegos: Set<string>; addressCores: Set<string> }
): void {
  for (const v of assocVehicles) {
    const rego = extractRegoUpper(v.label);
    if (rego && matchers.vehicleRegos.has(rego)) v.isPrevious = true;
  }
  for (const l of assocLocations) {
    const core = addressCoreLower(l.label);
    if (matchers.addressCores.has(core)) l.isPrevious = true;
  }
}
