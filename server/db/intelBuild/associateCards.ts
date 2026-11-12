// Part of the Intelligence entity builder (server/db/intelEntities.ts). The builder used to be
// one 1,500-line function; each step is now its own function that takes what the earlier
// steps made and hands on what the later steps use. The steps run in this order:
// registry → targetCards → associateCards → occurrences → registeredMentions → sheetPass → finish.
// Same code in the same order as before; see docs/features/dev-and-ops.md (Big-file plan, 4c).

import { isNull } from "drizzle-orm";
import { formatIntelAddress, formatIntelVehicle } from "@shared/addressFormat";
import { associates } from "../../../drizzle/schema";
import {
  IntelligenceEntity,
  addressBracketKey,
  vehicleRegoKey,
} from "../intelligence";
import type { RegistryState } from "./registry";
import type { BuildDb } from "./types";

export async function addAssociateCards(
  s: { db: BuildDb } & Pick<
    RegistryState,
    | "preferVehicleShortForm"
    | "targetRows"
    | "targetSheetMap"
    | "associateAliasToKey"
    | "noteRegisteredName"
    | "entityMap"
    | "subjectTargetByKey"
  >
) {
  const {
    db,
    preferVehicleShortForm,
    targetRows,
    targetSheetMap,
    associateAliasToKey,
    noteRegisteredName,
    entityMap,
    subjectTargetByKey,
  } = s;

  // ── 2b. Add registry associates as person entities (isAssociate = true) ────
  // Mirrors the target-card block above: an associate recorded on a target in
  // the Target Registry is a confirmed intelligence entity in its own right —
  // it must show up in the Associates tab (and its address/vehicle in
  // Locations/Vehicles) even if it has never been mentioned in observation
  // text yet, same as a target card.
  const targetRowsByTargetId = new Map<number, typeof targetRows>();
  for (const t of targetRows) {
    if (!targetRowsByTargetId.has(t.targetId))
      targetRowsByTargetId.set(t.targetId, []);
    targetRowsByTargetId.get(t.targetId)!.push(t);
  }

  const associateRows = await db
    .select({
      id: associates.id,
      targetId: associates.targetId,
      name: associates.name,
      surname: associates.surname,
      tgt: associates.tgt,
      hbf: associates.hbf,
      hb: associates.hb,
      v1f: associates.v1f,
      v1: associates.v1,
      extraVehicles: associates.extraVehicles,
      extraAddresses: associates.extraAddresses,
    })
    .from(associates)
    .where(isNull(associates.deletedAt));

  for (const a of associateRows) {
    const parentRows = targetRowsByTargetId.get(a.targetId) ?? [];
    // An associate whose parent target no longer exists (e.g. the target
    // was purged but this associate row wasn't cascade-deleted with it —
    // see deleteTarget()) is orphaned data, not a live intelligence entity.
    // Skip it entirely rather than synthesizing a phantom "(Registry)"
    // occurrence for its address/vehicle fields below, which used to leave
    // permanent zombie INDICES-badged entities behind after a full delete.
    if (parentRows.length === 0) continue;
    const parentName = parentRows[0]?.targetName ?? null;
    const assocKey = `associate::${a.id}`;

    if (a.tgt && a.tgt.trim()) {
      associateAliasToKey.set(a.tgt.trim().toUpperCase(), assocKey);
    }
    noteRegisteredName(a.tgt, a.name);

    if (!entityMap.has(assocKey)) {
      entityMap.set(assocKey, {
        shortForm: a.name,
        type: "person",
        isAssociate: true,
        associateId: a.id,
        associateOfTargetId: a.targetId,
        associateOfTargetName: parentName,
        surname: a.surname,
        occurrences: [],
      });
    }

    // Occurrences piggyback on the parent target's linked sheets (or a
    // "(no sheet linked)" placeholder), same pattern as the target card.
    for (const t of parentRows) {
      const linkedSheets = targetSheetMap.get(t.targetId) ?? [];
      const sheetEntries =
        linkedSheets.length > 0
          ? linkedSheets
          : [{ sheetId: 0, sheetTitle: "(no sheet linked)" }];
      for (const sheet of sheetEntries) {
        entityMap.get(assocKey)!.occurrences.push({
          sheetId: sheet.sheetId,
          sheetTitle: sheet.sheetTitle,
          operationId: t.operationId ?? 0,
          operationName: t.operationName ?? "(Registry)",
          rowId: 0,
          observationSnippet: `Associate card — ${a.name} (associate of ${parentName ?? "target"})`,
          timeMinutes: null,
          fullDescription: `Associate: ${a.name}${a.tgt ? `, TGT: ${a.tgt}` : ""} (of target: ${parentName ?? "unknown"}, operation: ${t.operationName ?? "Registry"})`,
        });
      }
    }

    // Address/vehicle fields, same field-registration logic as target cards.
    const assocLocationFields: Array<{
      label: string;
      value: string | null;
      type: IntelligenceEntity["type"];
    }> = [
      {
        label: "HBF",
        value: a.hbf?.trim() || a.hb?.trim() || null,
        type: "address",
      },
      {
        label: "V1F",
        value: a.v1f?.trim() || a.v1?.trim() || null,
        type: "vehicle",
      },
    ];
    if (a.extraVehicles) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          a.extraVehicles
        );
        extras.forEach((ev, idx) => {
          const vehicleValue = ev.full?.trim() || ev.short?.trim() || null;
          if (vehicleValue) {
            assocLocationFields.push({
              label: `V${idx + 2}F`,
              value: vehicleValue,
              type: "vehicle",
            });
          }
        });
      } catch {
        /* malformed JSON — skip */
      }
    }
    if (a.extraAddresses) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          a.extraAddresses
        );
        extras.forEach((ea, idx) => {
          const addrValue = ea.full?.trim() || ea.short?.trim() || null;
          if (addrValue) {
            assocLocationFields.push({
              label: `Address ${idx + 2}`,
              value: addrValue,
              type: "address",
            });
          }
        });
      } catch {
        /* malformed JSON — skip */
      }
    }

    for (const field of assocLocationFields) {
      if (!field.value || field.value.trim() === "") continue;
      let shortForm = field.value.trim();
      if (field.type === "vehicle") {
        shortForm = shortForm.replace(/\s*\([^)]{1,40}\)\s*$/, "").trim();
        // See the matching comment on the target locationFields loop above —
        // reformat to "REGO description" before this competes in the
        // "prefer longer" merge, or its own unstripped boilerplate can beat
        // and overwrite a clean RS-mined mention of the same vehicle.
        shortForm = formatIntelVehicle(shortForm);
      }
      if (!shortForm) continue;
      const normKey =
        field.type === "vehicle"
          ? vehicleRegoKey(shortForm)
          : field.type === "address"
            ? addressBracketKey(shortForm)
            : shortForm.toLowerCase().replace(/\s+/g, " ").trim();
      const fieldKey = `${field.type}::${normKey}`;
      // See the matching comment on the target locationFields loop above — a
      // registry vehicle/address that is a Vehicle/Location target is that
      // target's own entity.
      const subjectTarget = subjectTargetByKey.get(fieldKey);
      const folded = !!subjectTarget && entityMap.has(subjectTarget);
      const key = folded ? subjectTarget! : fieldKey;
      // See the matching comment on the target locationFields loop above —
      // tidy the registry address for display, after the key is computed
      // from the raw value so entity keying is unaffected.
      if (field.type === "address") shortForm = formatIntelAddress(shortForm);
      if (folded) {
        // The target keeps its own name; only the occurrence is added below.
      } else if (!entityMap.has(key)) {
        entityMap.set(key, { shortForm, type: field.type, occurrences: [] });
      } else {
        const existing = entityMap.get(key)!;
        const shouldUpgrade =
          field.type === "vehicle"
            ? preferVehicleShortForm(existing.shortForm, shortForm, normKey)
            : shortForm.length > existing.shortForm.length;
        if (shouldUpgrade) existing.shortForm = shortForm;
      }
      for (const t of parentRows) {
        const linkedSheets = targetSheetMap.get(t.targetId) ?? [];
        const sheetEntries =
          linkedSheets.length > 0
            ? linkedSheets
            : [{ sheetId: 0, sheetTitle: "(no sheet linked)" }];
        for (const sheet of sheetEntries) {
          const alreadyAdded = entityMap
            .get(key)!
            .occurrences.some(
              o =>
                o.sheetId === sheet.sheetId &&
                o.rowId === 0 &&
                o.observationSnippet ===
                  `Associate card — ${a.name} [${field.label}]`
            );
          if (!alreadyAdded) {
            entityMap.get(key)!.occurrences.push({
              sheetId: sheet.sheetId,
              sheetTitle: sheet.sheetTitle,
              operationId: t.operationId ?? 0,
              operationName: t.operationName ?? "(Registry)",
              rowId: 0,
              observationSnippet: `Associate card — ${a.name} [${field.label}]`,
              timeMinutes: null,
              fullDescription: `${field.label}: ${shortForm} (from associate: ${a.name}, of target: ${parentName ?? "unknown"})`,
            });
          }
        }
      }
    }
  }
}
