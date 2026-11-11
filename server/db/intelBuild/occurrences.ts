// Part of the Intelligence entity builder (server/db/intelEntities.ts). The builder used to be
// one 1,500-line function; each step is now its own function that takes what the earlier
// steps made and hands on what the later steps use. The steps run in this order:
// registry → targetCards → associateCards → occurrences → registeredMentions → sheetPass → finish.
// Same code in the same order as before; see docs/features/dev-and-ops.md (Big-file plan, 4c).

import { eq } from "drizzle-orm";
import {
  aliasMentionCompatible,
  mentionIsOtherRegisteredPerson,
  pickRegisteredForAlias,
} from "../../personAliasMatch";
import { operations, runningSheets, sheetRows } from "../../../drizzle/schema";
import { normalizeEntityLabel } from "../attachments";
import { vehicleRegoKey } from "../intelligence";
import type { RegistryState } from "./registry";
import type { BuildDb } from "./types";

export async function prepareOccurrences(
  s: { db: BuildDb } & Pick<
    RegistryState,
    | "locationKeyType"
    | "entityAliasMap"
    | "preferVehicleShortForm"
    | "tgtAliasToFullName"
    | "tgtAliasCandidates"
    | "associateAliasToKey"
    | "registeredNamesByAlias"
    | "entityMap"
    | "personTargetByKey"
    | "subjectTargetByKey"
  >
) {
  const {
    db,
    locationKeyType,
    entityAliasMap,
    preferVehicleShortForm,
    tgtAliasToFullName,
    tgtAliasCandidates,
    associateAliasToKey,
    registeredNamesByAlias,
    entityMap,
    personTargetByKey,
    subjectTargetByKey,
  } = s;

  // ── 3. Extract from observation rows ──────────────────────────────────────
  //
  // Two-pass approach:
  //   Pass A: for each sheet, scan all rows in time order and collect every
  //           bracketed introduction "FullForm (ShortForm)" into a per-sheet
  //           entity dictionary.  This is the "first mention" that establishes
  //           the entity's type and canonical full description.
  //   Pass B: re-scan every row in the sheet and, for each known short form
  //           that appears as a standalone token (unbracketed), emit an
  //           occurrence using the registered full description and type.
  //           This handles all subsequent mentions that omit the brackets.
  //
  const rows = await db
    .select({
      rowId: sheetRows.id,
      observation: sheetRows.observation,
      timeMinutes: sheetRows.timeMinutes,
      sheetId: sheetRows.sheetId,
      sheetTitle: runningSheets.title,
      operationId: runningSheets.operationId,
      operationName: operations.name,
    })
    .from(sheetRows)
    .innerJoin(runningSheets, eq(sheetRows.sheetId, runningSheets.id))
    .innerJoin(operations, eq(runningSheets.operationId, operations.id))
    .orderBy(sheetRows.sheetId, sheetRows.timeMinutes);

  // Group rows by sheetId so we can do the two-pass per sheet
  const rowsBySheet = new Map<number, typeof rows>();
  for (const row of rows) {
    if (!rowsBySheet.has(row.sheetId)) rowsBySheet.set(row.sheetId, []);
    rowsBySheet.get(row.sheetId)!.push(row);
  }

  // A person entity mined from observation text has its own raw, unbracketed
  // shortForm ("Timothy HOLMES") used as a literal search/matching key all
  // through the two-pass scan below and extractEntitiesFromText's many other
  // callers — changing that key's shape is out of scope here and risks
  // degrading bare-re-mention matching in later rows. This instead only
  // dresses up the DISPLAY shortForm actually stored on the final
  // IntelligenceEntity (what LinkAttachmentDialog hands the photo linker as
  // entityLabel), so a mined associate matches the same "Name SURNAME
  // (SURNAME)" convention a registry Target/Associate card gets from
  // composeTargetName/composeAssociateName — which is what LinkedEntityPills'
  // Profile pill actually keys off. No-ops (idempotent) when it's not a
  // person, already ends in a bracket, or the last word isn't a clean
  // all-caps surname to begin with.
  function withSurnameBracket(shortForm: string, type: string): string {
    if (type !== "person") return shortForm;
    if (/\([^()]+\)\s*$/.test(shortForm)) return shortForm;
    const words = shortForm.trim().split(/\s+/);
    const last = words[words.length - 1] ?? "";
    return /^[A-Z][A-Z'-]{1,40}$/.test(last)
      ? `${shortForm} (${last})`
      : shortForm;
  }

  // Helper: register or merge an entity occurrence into entityMap
  function registerOccurrence(
    e: {
      shortForm: string;
      rawShortForm?: string;
      fullDescription: string;
      type: "person" | "vehicle" | "address" | "business" | "unknown";
      confidence?: "high" | "medium" | "low";
    },
    row: {
      sheetId: number;
      sheetTitle: string;
      operationId: number;
      operationName: string;
      rowId: number;
      observation: string | null;
      timeMinutes: number | null;
    }
  ) {
    if (!row.observation) return;
    // If this person shortForm (or its raw bracketed token) is a known TGT alias,
    // merge into the canonical target entity.
    // We must check BOTH because name-recovery may expand "HOTA" → "G HOTA",
    // but the tgtAliasToFullName map is keyed by the raw alias ("HOTA").
    if (e.type === "person") {
      // A bracket alias is only a SURNAME — "Lawrence TAN (TAN)" must not be
      // folded into the registered "Grace Olivia TAN (TAN)" just because the
      // surname matches. The redirect below only happens when the mention's
      // given names don't contradict the registered person's (a bare alias,
      // an initial, or a shortened name all still match).
      const aliasUsedForTarget = tgtAliasToFullName.has(
        e.shortForm.toUpperCase()
      )
        ? e.shortForm
        : (e.rawShortForm ?? e.shortForm);
      let canonicalName =
        tgtAliasToFullName.get(e.shortForm.toUpperCase()) ??
        (e.rawShortForm
          ? tgtAliasToFullName.get(e.rawShortForm.toUpperCase())
          : undefined);
      if (
        canonicalName &&
        !aliasMentionCompatible(e.shortForm, aliasUsedForTarget, canonicalName)
      ) {
        canonicalName = undefined;
      }
      // An alias shared by more than one registered person ("TAN" for both
      // Grace and Greg) is never resolved by whichever was loaded last: the
      // mention must fit exactly one of them a bare "TAN" fits none.
      if (canonicalName) {
        const aliasKey = aliasUsedForTarget.toUpperCase();
        canonicalName = pickRegisteredForAlias(
          e.shortForm,
          aliasUsedForTarget,
          tgtAliasCandidates.get(aliasKey) ?? [canonicalName],
          registeredNamesByAlias.get(aliasKey) ?? []
        );
      }
      // "Hana PARK" is a different registered person from the target
      // "Soo-Min Hana PARK" even though the given name fits — see
      // mentionIsOtherRegisteredPerson.
      if (
        canonicalName &&
        mentionIsOtherRegisteredPerson(
          e.shortForm,
          aliasUsedForTarget,
          canonicalName,
          (
            registeredNamesByAlias.get(aliasUsedForTarget.toUpperCase()) ?? []
          ).filter(n => n !== canonicalName)
        )
      ) {
        canonicalName = undefined;
      }
      if (canonicalName) {
        const targetKey = `target::${canonicalName}`;
        if (entityMap.has(targetKey)) {
          const snippet =
            row.observation.slice(0, 80) +
            (row.observation.length > 80 ? "…" : "");
          entityMap.get(targetKey)!.occurrences.push({
            sheetId: row.sheetId,
            sheetTitle: row.sheetTitle,
            operationId: row.operationId,
            operationName: row.operationName,
            rowId: row.rowId,
            observationSnippet: snippet,
            timeMinutes: row.timeMinutes ?? null,
            fullDescription: e.fullDescription,
          });
          return; // skip adding as a separate entity
        }
      }
      // Same idea, but for a registry associate's bracket surname (e.g. "P.HILL").
      const aliasUsedForAssoc = associateAliasToKey.has(
        e.shortForm.toUpperCase()
      )
        ? e.shortForm
        : (e.rawShortForm ?? e.shortForm);
      const canonicalAssocKey =
        associateAliasToKey.get(e.shortForm.toUpperCase()) ??
        (e.rawShortForm
          ? associateAliasToKey.get(e.rawShortForm.toUpperCase())
          : undefined);
      if (
        canonicalAssocKey &&
        entityMap.has(canonicalAssocKey) &&
        pickRegisteredForAlias(
          e.shortForm,
          aliasUsedForAssoc,
          [entityMap.get(canonicalAssocKey)!.shortForm],
          registeredNamesByAlias.get(aliasUsedForAssoc.toUpperCase()) ?? []
        ) !== undefined
      ) {
        const snippet =
          row.observation.slice(0, 80) +
          (row.observation.length > 80 ? "…" : "");
        entityMap.get(canonicalAssocKey)!.occurrences.push({
          sheetId: row.sheetId,
          sheetTitle: row.sheetTitle,
          operationId: row.operationId,
          operationName: row.operationName,
          rowId: row.rowId,
          observationSnippet: snippet,
          timeMinutes: row.timeMinutes ?? null,
          fullDescription: e.fullDescription,
        });
        return; // skip adding as a separate entity
      }
    }
    // Vehicles key on registration alone (see vehicleRegoKey above) so a bare
    // rego, a chip-inserted "Vehicle REGO", and a fully-described sighting of
    // the same car all collapse into one entity instead of three.
    const normShortForm =
      e.type === "vehicle"
        ? vehicleRegoKey(e.shortForm)
        : e.shortForm.toLowerCase().replace(/\s+/g, " ").trim();
    let key = `${locationKeyType(e.type)}::${normShortForm}`;

    // Confirmed entity-alias merge (fuzzy-duplicate prompt "Yes", or the
    // manual Merge Entities tool) — redirect this occurrence to the winner
    // entity instead of creating/growing a separate one under the loser key.
    let displayShortForm = e.shortForm;
    const resolved = e.type !== "unknown" ? entityAliasMap.get(key) : undefined;
    if (resolved) {
      key = resolved.key;
      displayShortForm = resolved.label;
    }

    // A person redirected onto a Target's own name (a confirmed merge) IS that
    // Target — fold into the target entity, remembering the spelling used.
    const personTarget = personTargetByKey.get(key);
    if (personTarget && entityMap.has(personTarget)) {
      const targetEntity = entityMap.get(personTarget)!;
      if (
        normalizeEntityLabel(e.shortForm) !==
        normalizeEntityLabel(targetEntity.shortForm)
      ) {
        targetEntity.aliasLabels = targetEntity.aliasLabels ?? [];
        if (!targetEntity.aliasLabels.includes(e.shortForm))
          targetEntity.aliasLabels.push(e.shortForm);
      }
      targetEntity.occurrences.push({
        sheetId: row.sheetId,
        sheetTitle: row.sheetTitle,
        operationId: row.operationId,
        operationName: row.operationName,
        rowId: row.rowId,
        observationSnippet:
          row.observation.slice(0, 80) +
          (row.observation.length > 80 ? "…" : ""),
        timeMinutes: row.timeMinutes ?? null,
        fullDescription: e.fullDescription,
      });
      return;
    }

    // A sighting of a Vehicle/Location target belongs to that target, not to
    // a second ordinary entity for the same vehicle/place.
    const subjectTarget = subjectTargetByKey.get(key);
    if (subjectTarget && entityMap.has(subjectTarget)) {
      entityMap.get(subjectTarget)!.occurrences.push({
        sheetId: row.sheetId,
        sheetTitle: row.sheetTitle,
        operationId: row.operationId,
        operationName: row.operationName,
        rowId: row.rowId,
        observationSnippet:
          row.observation.slice(0, 80) +
          (row.observation.length > 80 ? "…" : ""),
        timeMinutes: row.timeMinutes ?? null,
        fullDescription: e.fullDescription,
      });
      return;
    }

    if (!entityMap.has(key)) {
      entityMap.set(key, {
        shortForm: withSurnameBracket(displayShortForm, e.type),
        type: e.type,
        isTarget: false,
        occurrences: [],
      });
    } else if (!resolved) {
      // Upgrade to longer / richer shortForm if available — skipped when this
      // occurrence was redirected via an alias, since the winner's label is
      // the confirmed canonical display form and shouldn't be overwritten by
      // whatever the loser's raw text happened to say.
      const existing = entityMap.get(key)!;
      // Prefer "address" over "business" once a mention with real street
      // detail shows up — address is strictly more informative and this is
      // the same real-world place (see locationKeyType above).
      if (existing.type === "business" && e.type === "address") {
        existing.type = "address";
      }
      // Compared/assigned bracketed, not raw — existing.shortForm was
      // already bracketed at creation above, so comparing raw e.shortForm's
      // length against it here would unfairly favour existing every time.
      const candidateShortForm = withSurnameBracket(e.shortForm, e.type);
      const shouldUpgrade =
        e.type === "vehicle"
          ? preferVehicleShortForm(
              existing.shortForm,
              e.shortForm,
              normShortForm
            )
          : candidateShortForm.length > existing.shortForm.length;
      if (shouldUpgrade) existing.shortForm = candidateShortForm;
    }
    if (
      resolved &&
      e.shortForm.toLowerCase().trim() !== displayShortForm.toLowerCase().trim()
    ) {
      const winner = entityMap.get(key)!;
      winner.aliasLabels = winner.aliasLabels ?? [];
      if (!winner.aliasLabels.includes(e.shortForm))
        winner.aliasLabels.push(e.shortForm);
    }
    // Flag entity as low-confidence if this occurrence was uncertain
    if (e.confidence === "low" || e.type === "unknown") {
      entityMap.get(key)!.lowConfidence = true;
    }
    const snippet =
      row.observation.slice(0, 80) + (row.observation.length > 80 ? "…" : "");
    entityMap.get(key)!.occurrences.push({
      sheetId: row.sheetId,
      sheetTitle: row.sheetTitle,
      operationId: row.operationId,
      operationName: row.operationName,
      rowId: row.rowId,
      observationSnippet: snippet,
      timeMinutes: row.timeMinutes ?? null,
      fullDescription: e.fullDescription,
    });
  }

  return { rowsBySheet, registerOccurrence };
}

export type OccurrencesState = Awaited<ReturnType<typeof prepareOccurrences>>;
