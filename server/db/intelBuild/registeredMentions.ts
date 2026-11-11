// Part of the Intelligence entity builder (server/db/intelEntities.ts). The builder used to be
// one 1,500-line function; each step is now its own function that takes what the earlier
// steps made and hands on what the later steps use. The steps run in this order:
// registry → targetCards → associateCards → occurrences → registeredMentions → sheetPass → finish.
// Same code in the same order as before; see docs/features/dev-and-ops.md (Big-file plan, 4c).

import { registeredSuburb } from "@shared/registeredMentions";
import { IntelligenceEntity } from "../intelligence";
import type { RegistryState } from "./registry";

export function findRegisteredMentions(
  s: Pick<RegistryState, "entityAliasMap" | "entityMap" | "subjectTargetByKey">
) {
  const { entityAliasMap, entityMap, subjectTargetByKey } = s;

  // ── Registered vehicles and addresses that rows may name in plain text ──────
  // (shared/registeredMentions.ts.) The target / associate cards put these in
  // entityMap as card-only entities; a row only counted for one when its own
  // sheet bracketed it. Rows written by the TGT chip and the Target Logger name
  // the plate or street plainly, so the sheet loop below also credits those —
  // exact plate or exact number-led street only.
  const registeredPlateLabel = new Map<string, string>();
  const registeredStreets: Array<{
    street: string;
    suburb: string | null;
    key: string;
  }> = [];
  {
    const fromCard = (e: IntelligenceEntity) =>
      e.occurrences.some(
        o =>
          o.rowId === 0 &&
          /^(Target|Associate) card — /.test(o.observationSnippet)
      );
    for (const [key, ent] of Array.from(entityMap.entries())) {
      if (key.startsWith("vehicle::") && fromCard(ent))
        registeredPlateLabel.set(key.slice("vehicle::".length), ent.shortForm);
      else if (key.startsWith("address::") && fromCard(ent))
        registeredStreets.push({
          street: key.slice("address::".length),
          suburb: registeredSuburb(ent.shortForm),
          key,
        });
    }
    for (const key of Array.from(subjectTargetByKey.keys())) {
      if (key.startsWith("vehicle::"))
        registeredPlateLabel.set(
          key.slice("vehicle::".length),
          key.slice("vehicle::".length)
        );
      else if (key.startsWith("address::"))
        registeredStreets.push({
          street: key.slice("address::".length),
          suburb: null,
          key,
        });
    }
  }
  const registeredPlateSet = new Set(registeredPlateLabel.keys());
  const creditedInRow = (key: string, rowId: number) =>
    [key, subjectTargetByKey.get(key), entityAliasMap.get(key)?.key].some(
      k => !!k && !!entityMap.get(k)?.occurrences.some(o => o.rowId === rowId)
    );

  return {
    registeredPlateLabel,
    registeredStreets,
    registeredPlateSet,
    creditedInRow,
  };
}

export type RegisteredMentionsState = ReturnType<typeof findRegisteredMentions>;
