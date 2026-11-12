// Part of the Intelligence entity builder (server/db/intelEntities.ts). The builder used to be
// one 1,500-line function; each step is now its own function that takes what the earlier
// steps made and hands on what the later steps use. The steps run in this order:
// registry → targetCards → associateCards → occurrences → registeredMentions → sheetPass → finish.
// Same code in the same order as before; see docs/features/dev-and-ops.md (Big-file plan, 4c).

import { formatIntelAddress, formatIntelVehicle } from "@shared/addressFormat";
import {
  IntelligenceEntity,
  addressBracketKey,
  vehicleRegoKey,
} from "../intelligence";
import type { RegistryState } from "./registry";

export function addTargetCards(
  s: Pick<
    RegistryState,
    | "preferVehicleShortForm"
    | "targetRows"
    | "targetSheetMap"
    | "entityMap"
    | "subjectTargetByKey"
  >
) {
  const {
    preferVehicleShortForm,
    targetRows,
    targetSheetMap,
    entityMap,
    subjectTargetByKey,
  } = s;

  // ── 2. Add formal target cards as person entities (isTarget = true) ────────
  for (const t of targetRows) {
    const linkedSheets = targetSheetMap.get(t.targetId) ?? [];
    const sheetEntries =
      linkedSheets.length > 0
        ? linkedSheets
        : [{ sheetId: 0, sheetTitle: "(no sheet linked)" }];

    // Target entity — keyed by full name, carries tgtAlias. type follows
    // targetType: "person" (the only option before targetType existed) for
    // a Person target, or "vehicle"/"address" when a Vehicle or Location
    // stands in as the subject itself — see the Golden Rule/CLAUDE.md's
    // Target Type note. "location" maps to "address" here since that's
    // IntelligenceEntity's own type name for the same concept.
    const entityType: IntelligenceEntity["type"] =
      t.targetType === "vehicle"
        ? "vehicle"
        : t.targetType === "location"
          ? "address"
          : "person";
    const nameKey = `target::${t.targetName}`;
    if (!entityMap.has(nameKey)) {
      entityMap.set(nameKey, {
        shortForm: t.targetName,
        type: entityType,
        isTarget: true,
        tgtAlias: t.tgt?.trim() || null,
        targetId: t.targetId,
        surname: t.surname,
        occurrences: [],
      });
    }
    for (const sheet of sheetEntries) {
      entityMap.get(nameKey)!.occurrences.push({
        sheetId: sheet.sheetId,
        sheetTitle: sheet.sheetTitle,
        operationId: t.operationId ?? 0,
        operationName: t.operationName ?? "(Registry)",
        rowId: 0,
        observationSnippet: `Target card — ${t.targetName}${t.tgt ? ` (TGT: ${t.tgt})` : ""}`,
        timeMinutes: null,
        fullDescription: `Target: ${t.targetName}${t.tgt ? `, TGT: ${t.tgt}` : ""} (operation: ${t.operationName ?? "Registry"})`,
      });
    }

    // Location fields from target card: HBF/HB (address), V1F/V1/V2F/V2 (vehicle)
    // For each full/abbreviated pair, only register the full version if it is set;
    // the abbreviated version is only used as a fallback when the full field is empty.
    // This prevents HBF + HB (or V1F + V1) from appearing as two separate entities.
    // HBF is skipped entirely for a Location target and V1F for a Vehicle
    // target — for those, the field IS the primary card entity keyed above
    // (target::${t.targetName}), not a secondary attribute of it, so
    // registering it again here under its own vehicle::/address:: key would
    // just duplicate the same card as a second, identical-looking entity.
    const locationFields: Array<{
      label: string;
      value: string | null;
      type: IntelligenceEntity["type"];
    }> = [
      ...(t.targetType === "location"
        ? []
        : [
            {
              label: "HBF",
              value: t.hbf?.trim() || t.hb?.trim() || null,
              type: "address" as const,
            },
          ]),
      ...(t.targetType === "vehicle"
        ? []
        : [
            {
              label: "V1F",
              value: t.v1f?.trim() || t.v1?.trim() || null,
              type: "vehicle" as const,
            },
          ]),
      {
        label: "V2F",
        value: t.v2f?.trim() || t.v2?.trim() || null,
        type: "vehicle",
      },
    ];
    // Also include extra vehicles (V2, V3, V4 ...) stored as JSON array {full, short}
    if (t.extraVehicles) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          t.extraVehicles
        );
        extras.forEach((ev, idx) => {
          const vehicleLabel = `V${idx + 2}F`; // V2F, V3F, V4F ...
          const vehicleValue = ev.full?.trim() || ev.short?.trim() || null;
          if (vehicleValue) {
            locationFields.push({
              label: vehicleLabel,
              value: vehicleValue,
              type: "vehicle",
            });
          }
        });
      } catch {
        /* malformed JSON — skip */
      }
    }
    // Also include extra addresses beyond HBF, stored as JSON array
    // {full, short, label?, businessName?, ...structured parts} — same
    // treatment as the associate block below (assocLocationFields).
    if (t.extraAddresses) {
      try {
        const extras: Array<{ full?: string; short?: string }> = JSON.parse(
          t.extraAddresses
        );
        extras.forEach((ea, idx) => {
          const addrValue = ea.full?.trim() || ea.short?.trim() || null;
          if (addrValue) {
            locationFields.push({
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
    for (const field of locationFields) {
      if (!field.value || field.value.trim() === "") continue;
      let shortForm = field.value.trim();
      // For vehicles: strip the RS bracket suffix "(Vehicle REGO)" or "(REGO)" appended
      // by the HBF autocomplete / addressFormat so the entity key matches the observation-
      // derived key (which never includes the bracket code in the shortForm).
      if (field.type === "vehicle") {
        shortForm = shortForm.replace(/\s*\([^)]{1,40}\)\s*$/, "").trim();
        // Registry vehicle fields are stored exactly as typed — often
        // "<description>, bearing WA registration <REGO>", never reordered
        // into the Intelligence "REGO description" display form the way an
        // RS-mined mention already is (see the type==="vehicle" branch in
        // extractEntitiesFromText). Left unformatted, this raw text's own
        // unstripped "bearing WA registration" boilerplate inflated its
        // apparent descriptive length enough to always win the "prefer
        // longer" merge below against a properly-formatted RS mention of
        // the same rego, overwriting a clean "1CWY970 silver Hyundai Getz"
        // with the raw "silver Hyundai Getz, bearing WA registration
        // 1CWY970". Reformat first so both candidates are compared, and
        // ultimately displayed, on the same footing.
        shortForm = formatIntelVehicle(shortForm);
      }
      if (!shortForm) continue;
      // Normalise whitespace so minor spacing differences don't create duplicate keys.
      // Vehicles key on registration alone (see vehicleRegoKey above); addresses
      // key on the HBF's own trailing bracket short form (see addressBracketKey
      // above) so a registry HBF and a text-mined mention of the same address
      // collapse into one entity instead of two.
      const normKey =
        field.type === "vehicle"
          ? vehicleRegoKey(shortForm)
          : field.type === "address"
            ? addressBracketKey(shortForm)
            : shortForm.toLowerCase().replace(/\s+/g, " ").trim();
      const fieldKey = `${field.type}::${normKey}`;
      // A registry vehicle/address that is itself a Vehicle/Location target
      // is that target's own entity, not a second one.
      const subjectTarget = subjectTargetByKey.get(fieldKey);
      const folded = !!subjectTarget && entityMap.has(subjectTarget);
      const key = folded ? subjectTarget! : fieldKey;
      // Same problem the vehicle branch above solves, now for addresses: a
      // registry address field is stored exactly as typed, still carrying its
      // state suffix and its own trailing bracket code. Unformatted it is
      // always the longest candidate, so it won the "prefer longer" merge
      // below and became the display label everywhere — Home Presence read
      // "101 Eric Street, COTTESLOE WA (101 Eric Street)", bracket and all,
      // while every text-mined address rendered cleanly.
      //
      // Deliberately applied AFTER normKey is computed above: addresses key
      // on the raw value's trailing bracket, so formatting first would change
      // the key and re-partition existing entities. Display only.
      if (field.type === "address") shortForm = formatIntelAddress(shortForm);
      if (folded) {
        // The target keeps its own name; only the occurrence is added below.
      } else if (!entityMap.has(key)) {
        entityMap.set(key, { shortForm, type: field.type, occurrences: [] });
      } else {
        // Prefer the longer / richer shortForm
        const existing = entityMap.get(key)!;
        const shouldUpgrade =
          field.type === "vehicle"
            ? preferVehicleShortForm(existing.shortForm, shortForm, normKey)
            : shortForm.length > existing.shortForm.length;
        if (shouldUpgrade) existing.shortForm = shortForm;
      }
      for (const sheet of sheetEntries) {
        // Deduplicate occurrences by sheetId+rowId (rowId=0 for target card entries)
        const occKey = `${sheet.sheetId}::0::${field.label}`;
        const alreadyAdded = entityMap
          .get(key)!
          .occurrences.some(
            o =>
              o.sheetId === sheet.sheetId &&
              o.rowId === 0 &&
              o.observationSnippet ===
                `Target card — ${t.targetName} [${field.label}]`
          );
        if (!alreadyAdded) {
          entityMap.get(key)!.occurrences.push({
            sheetId: sheet.sheetId,
            sheetTitle: sheet.sheetTitle,
            operationId: t.operationId ?? 0,
            operationName: t.operationName ?? "(Registry)",
            rowId: 0,
            observationSnippet: `Target card — ${t.targetName} [${field.label}]`,
            timeMinutes: null,
            fullDescription: `${field.label}: ${shortForm} (from target: ${t.targetName}, operation: ${t.operationName ?? "Registry"})`,
          });
        }
        void occKey; // suppress unused variable warning
      }
    }
  }
}
