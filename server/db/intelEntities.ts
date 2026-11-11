import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  aliasMentionCompatible,
  aliasSearchFlags,
  bareAliasFollowsOtherGivenName,
  mentionIsOtherRegisteredPerson,
  pickRegisteredForAlias,
} from "../personAliasMatch";
import { scopeEntities } from "@shared/operationAccess";
import { intelScope } from "../intelScope";
import { bareAliasOwner } from "@shared/aliasSeeding";
import {
  registeredAddressIn,
  registeredPlatesIn,
  registeredSuburb,
} from "@shared/registeredMentions";
import {
  FingerprintCache,
  fingerprintSql,
  fingerprintFromRow,
  type Fingerprint,
} from "../intelCache";
import { formatIntelAddress, formatIntelVehicle } from "@shared/addressFormat";
import { insideCapsSuburb } from "@shared/suburbMention";
import {
  operations,
  runningSheets,
  sheetRows,
  targets,
  TargetType,
  associates,
  operationTargetLinks,
  entityAliases,
} from "../../drizzle/schema";
import { recordIntelBuild } from "../intelBuildWatch";
import { getDb } from "./core";
import { normalizeEntityLabel } from "./attachments";
import {
  IntelligenceEntity,
  addressBracketKey,
  extractEntitiesFromText,
  mergeContainedEntities,
  subjectTargetEntityKey,
  vehicleRegoKey,
} from "./intelligence";

// The unscoped entity set is remembered for a short while and reused only when
// the source tables haven't changed (server/intelCache.ts). Everyone gets a
// copy, and the per-request scope below is applied to that copy.
const intelEntityCache = new FingerprintCache<IntelligenceEntity[]>(v =>
  structuredClone(v)
);

/** Drop the remembered set after a write the change check can't see (an
 * in-place update of a link or alias row). */
export function invalidateIntelligenceCache() {
  intelEntityCache.invalidate();
}

async function loadAllIntelligenceEntities(): Promise<IntelligenceEntity[]> {
  let fp: Fingerprint | null = null;
  try {
    const db = await getDb();
    if (db) {
      const [rows] = (await db.execute(
        sql.raw(fingerprintSql())
      )) as unknown as [Record<string, unknown>[]];
      fp = fingerprintFromRow(rows?.[0]);
    }
  } catch {
    fp = null; // the check failed: build fresh, remember nothing
  }
  return intelEntityCache.get(fp, async () => {
    // Time each real rebuild (not a cache hit) so the log warns when it is
    // time to start the Intelligence redesign (server/intelBuildWatch.ts).
    const started = Date.now();
    const built = await buildAllIntelligenceEntities();
    recordIntelBuild(Date.now() - started, fp ? fp.rows : null, built.length);
    return built;
  });
}

export async function getAllIntelligenceEntities(opts?: {
  /** Skip the per-request Intelligence scope (Region Search only). */
  unscoped?: boolean;
}) {
  const all = await loadAllIntelligenceEntities();
  const scope = intelScope.getStore();
  if (!scope || opts?.unscoped) return all;
  // A registry target's occurrences carry operation 0 even when its running
  // sheet sits inside a hidden operation, so hide by the sheet as well.
  const hiddenIds = Array.from(scope.hiddenOperationIds);
  const db = hiddenIds.length > 0 ? await getDb() : null;
  const hiddenSheets = new Set<number>();
  if (db) {
    const rows = await db
      .select({ id: runningSheets.id })
      .from(runningSheets)
      .where(inArray(runningSheets.operationId, hiddenIds));
    for (const r of rows) hiddenSheets.add(r.id);
  }
  return scopeEntities(all, scope.hiddenOperationIds, hiddenSheets);
}

async function buildAllIntelligenceEntities(): Promise<IntelligenceEntity[]> {
  const db = await getDb();
  if (!db) return [];

  // "business" and "address" are the same category of location entity from
  // an officer's point of view — which one a given mention gets classified
  // as depends only on whether that particular sentence happened to spell
  // out the street address, not on what the place actually is (see the
  // type classification in extractEntitiesFromText above). Bucket both
  // under the same key prefix everywhere an entity type key gets built
  // below, so a location mentioned once with its street address and once
  // without ("The Reveley, 1 Barrack Street, PERTH WA (The Reveley)" vs
  // just "The Reveley (The Reveley)") merges into one entity instead of
  // forking into two separate profiles for the same real place.
  const locationKeyType = (t: string) => (t === "business" ? "address" : t);

  // Confirmed entity-alias merges (fuzzy-duplicate prompt "Yes", or the manual
  // Merge Entities tool) — fold the loser's occurrences into the winner the
  // same way TGT aliases fold into their canonical target below. loserLabel
  // is attached to the winner entity's aliasLabels ("also known as") the
  // first time an occurrence is redirected through it — see registerOccurrence.
  const aliasRows = await db.select().from(entityAliases);
  const entityAliasMap = new Map<string, { key: string; label: string }>();
  for (const a of aliasRows) {
    const aliasType = locationKeyType(a.type);
    entityAliasMap.set(`${aliasType}::${a.loserKey}`, {
      key: `${aliasType}::${a.winnerKey}`,
      label: a.winnerLabel,
    });
  }

  // When two mentions of the same vehicle merge, prefer whichever actually
  // carries more descriptive detail — not whichever happens to start with
  // the rego. That used to be the tie-break (favouring the "REGO
  // description" form observation text is built in, over a raw target-card
  // field where the rego sits mid-sentence, e.g. "silver Hyundai Santa Fe,
  // bearing WA registration 1ICW519") but it backfired badly: a bare
  // "Vehicle 1GHH000" text mention starts with the rego and so counted as
  // "canonical", letting it beat — and overwrite — a fully-detailed target
  // card ("grey Ford Ranger Utility, bearing WA registration 1GHH000") that
  // doesn't. Strip the rego out of both candidates first and compare what's
  // actually left describing the vehicle; whichever has more wins,
  // regardless of where the rego sits in the string.
  const escapeRegExp = (s: string): string =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const vehicleDescriptiveLength = (
    shortForm: string,
    regoKey: string
  ): number =>
    shortForm
      .toLowerCase()
      .replace(new RegExp(`\\b${escapeRegExp(regoKey)}\\b`, "i"), "")
      .replace(/[,;]/g, " ")
      .replace(/\s+/g, " ")
      .trim().length;
  const preferVehicleShortForm = (
    existing: string,
    candidate: string,
    regoKey: string
  ): boolean => {
    const existingLen = vehicleDescriptiveLength(existing, regoKey);
    const candidateLen = vehicleDescriptiveLength(candidate, regoKey);
    if (candidateLen !== existingLen) return candidateLen > existingLen;
    return candidate.length > existing.length;
  };

  // ── 1. Load formal target cards first ─────────────────────────────────────
  // Use leftJoin so registry targets with null operationId are included.
  // Also pull in linked operations via operation_target_links for registry targets.
  const directTargetRows = await db
    .select({
      targetId: targets.id,
      targetName: targets.name,
      targetType: targets.targetType,
      surname: targets.surname,
      tgt: targets.tgt,
      hb: targets.hb,
      v1: targets.v1,
      v2: targets.v2,
      hbf: targets.hbf,
      v1f: targets.v1f,
      v2f: targets.v2f,
      extraVehicles: targets.extraVehicles,
      extraAddresses: targets.extraAddresses,
      operationId: targets.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .leftJoin(operations, eq(targets.operationId!, operations.id))
    .where(isNull(targets.deletedAt));

  // Also load registry-linked targets (via operation_target_links)
  const linkedTargetRows = await db
    .select({
      targetId: targets.id,
      targetName: targets.name,
      targetType: targets.targetType,
      surname: targets.surname,
      tgt: targets.tgt,
      hb: targets.hb,
      v1: targets.v1,
      v2: targets.v2,
      hbf: targets.hbf,
      v1f: targets.v1f,
      v2f: targets.v2f,
      extraVehicles: targets.extraVehicles,
      extraAddresses: targets.extraAddresses,
      operationId: operationTargetLinks.operationId,
      operationName: operations.name,
    })
    .from(targets)
    .innerJoin(
      operationTargetLinks,
      eq(operationTargetLinks.targetId, targets.id)
    )
    .innerJoin(operations, eq(operationTargetLinks.operationId, operations.id))
    .where(isNull(targets.deletedAt));

  // Merge: for each target, prefer linked operation rows; fall back to direct row
  const seenTargetOpPairs = new Set<string>();
  const targetRows: Array<{
    targetId: number;
    targetName: string;
    targetType: TargetType;
    surname: string | null;
    tgt: string | null;
    hb: string | null;
    v1: string | null;
    v2: string | null;
    hbf: string | null;
    v1f: string | null;
    v2f: string | null;
    extraVehicles: string | null;
    extraAddresses: string | null;
    operationId: number | null;
    operationName: string | null;
  }> = [];

  for (const row of linkedTargetRows) {
    const pairKey = `${row.targetId}::${row.operationId}`;
    seenTargetOpPairs.add(pairKey);
    targetRows.push(row);
  }
  for (const row of directTargetRows) {
    const pairKey = `${row.targetId}::${row.operationId}`;
    if (!seenTargetOpPairs.has(pairKey)) {
      targetRows.push(row);
    }
  }

  // Find sheets linked to each target (exclude soft-deleted sheets)
  const sheetsByTarget = await db
    .select({
      targetId: runningSheets.targetId,
      sheetId: runningSheets.id,
      sheetTitle: runningSheets.title,
    })
    .from(runningSheets)
    .where(
      and(isNotNull(runningSheets.targetId), isNull(runningSheets.deletedAt))
    );

  const targetSheetMap = new Map<
    number,
    Array<{ sheetId: number; sheetTitle: string }>
  >();
  for (const s of sheetsByTarget) {
    if (s.targetId === null) continue;
    if (!targetSheetMap.has(s.targetId)) targetSheetMap.set(s.targetId, []);
    targetSheetMap
      .get(s.targetId)!
      .push({ sheetId: s.sheetId, sheetTitle: s.sheetTitle });
  }

  // The target each sheet was opened for (inverse of targetSheetMap).
  const sheetTargetIdBySheet = new Map<number, number>();
  for (const [tid, list] of Array.from(targetSheetMap.entries()))
    for (const sh of list) sheetTargetIdBySheet.set(sh.sheetId, tid);

  // Build a set of TGT aliases so we can suppress them from observation-derived persons
  // Maps tgtAlias (uppercased) -> canonical full name
  const tgtAliasToFullName = new Map<string, string>();
  // Every target that carries an alias (two targets can share a surname).
  const tgtAliasCandidates = new Map<string, string[]>();
  for (const t of targetRows) {
    if (t.tgt && t.tgt.trim()) {
      const k = t.tgt.trim().toUpperCase();
      tgtAliasToFullName.set(k, t.targetName);
      const list = tgtAliasCandidates.get(k) ?? [];
      if (!list.includes(t.targetName)) list.push(t.targetName);
      tgtAliasCandidates.set(k, list);
    }
  }
  // Same idea for registry associates: maps their bracket surname (e.g.
  // "P.HILL") to the associate's own entity key, so a bare mention of that
  // bracket elsewhere in observation text redirects into this associate's
  // entity instead of spawning a lookalike duplicate.
  const associateAliasToKey = new Map<string, string>();
  // Every registered person (targets and associates) under their surname
  // alias, so a mention that is exactly a *different* registered person with
  // the target's surname ("Hana PARK" vs the target "Soo-Min Hana PARK") is
  // never folded into the target.
  const registeredNamesByAlias = new Map<string, string[]>();
  const noteRegisteredName = (
    alias: string | null | undefined,
    name: string
  ) => {
    const k = (alias ?? "").trim().toUpperCase();
    if (!k || !name) return;
    const list = registeredNamesByAlias.get(k) ?? [];
    list.push(name);
    registeredNamesByAlias.set(k, list);
  };
  for (const t of targetRows) noteRegisteredName(t.tgt, t.targetName);

  const entityMap = new Map<string, IntelligenceEntity>();

  // A person Target's own name, as an ordinary person key, → its target entity.
  // A confirmed merge ("Yes, same person" on the duplicate prompt, or Merge
  // Entities) names the target's NAME as the winner, so mentions redirected
  // through it must land on the target entity itself — not on a second
  // person entity that happens to carry the same name. (The surname-alias
  // fold above can't do this on its own: it refuses a mention whose given
  // name differs, e.g. "Mikayla" vs "Mikala", which is exactly the case a
  // confirmed merge exists to settle.)
  const personTargetByKey = new Map<string, string>();
  for (const t of targetRows) {
    if (t.targetType && t.targetType !== "person") continue;
    personTargetByKey.set(
      `person::${normalizeEntityLabel(t.targetName)}`,
      `target::${t.targetName}`
    );
  }

  // A Vehicle/Location target stands in for the ordinary vehicle/address
  // entity its sightings would otherwise create (see subjectTargetEntityKey).
  // Mentions are folded into the target below, so every target entity has to
  // exist before any mention, registry field or text row is registered.
  const subjectTargetByKey = new Map<string, string>();
  for (const t of targetRows) {
    const subjectKey = subjectTargetEntityKey(t.targetType, t.targetName);
    if (!subjectKey) continue;
    subjectTargetByKey.set(subjectKey, `target::${t.targetName}`);
    const nameKey = `target::${t.targetName}`;
    if (!entityMap.has(nameKey)) {
      entityMap.set(nameKey, {
        shortForm: t.targetName,
        type: t.targetType === "vehicle" ? "vehicle" : "address",
        isTarget: true,
        tgtAlias: t.tgt?.trim() || null,
        targetId: t.targetId,
        surname: t.surname,
        occurrences: [],
      });
    }
  }

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
      // mention must fit exactly one of them, and a bare "TAN" fits none.
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

  for (const [, sheetRows_] of Array.from(rowsBySheet.entries())) {
    // ── Pass A: build per-sheet entity dictionary from bracketed introductions ──
    // Dictionary key: shortForm.toLowerCase() AND rawShortForm.toLowerCase() (both point to same entry)
    // This is critical: name-recovery may change "HOTA" → "G HOTA", so we must register
    // BOTH keys so that Pass B can find "HOTA" in subsequent rows even though the
    // display name is "G HOTA".
    type DictEntry = {
      shortForm: string;
      rawShortForm: string;
      fullDescription: string;
      type: "person" | "vehicle" | "address" | "business" | "unknown";
    };
    const sheetDict = new Map<string, DictEntry>();

    // Keys pre-seeded from the target registry (see below) → that target's
    // full name. A person introduced in this sheet's own text under the same
    // surname alias but with a different given name is someone else, and the
    // sheet's own introduction wins for bare mentions on this sheet.
    const preseededAliasName = new Map<string, string>();
    // The same registered name, looked up by the dictionary entry itself
    // (Pass B below needs it when it scans text for the alias).
    const preseededEntryName = new WeakMap<DictEntry, string>();
    // Surname aliases this sheet uses for TWO different people ("Grace TAN
    // (TAN)" and "Lawrence TAN (TAN)"). A bare "TAN" on such a sheet can't be
    // attributed to either, so Pass B doesn't search for the bare alias — each
    // person is still found by their full name — and Check Sheet flags it.
    const ambiguousAliasKeys = new Set<string>();
    const registerDictEntry = (key: string, entry: DictEntry) => {
      const preseedName = preseededAliasName.get(key);
      if (
        preseedName !== undefined &&
        entry.type === "person" &&
        !aliasMentionCompatible(
          entry.shortForm,
          entry.rawShortForm,
          preseedName
        )
      ) {
        sheetDict.set(key, entry);
        preseededAliasName.delete(key);
        return;
      }
      if (!sheetDict.has(key)) {
        sheetDict.set(key, entry);
      } else {
        const existing = sheetDict.get(key)!;
        // Same surname bracket, different given names → two different
        // people. Never fold one into the other (that would rewrite the
        // first person's entry as the second).
        if (
          entry.type === "person" &&
          existing.type === "person" &&
          existing !== entry &&
          key === entry.rawShortForm.toLowerCase() &&
          !aliasMentionCompatible(
            entry.shortForm,
            entry.rawShortForm,
            existing.shortForm
          )
        ) {
          ambiguousAliasKeys.add(key);
          return;
        }
        // Upgrade to longer shortForm if available
        if (entry.shortForm.length > existing.shortForm.length) {
          existing.shortForm = entry.shortForm;
          existing.fullDescription = entry.fullDescription;
        }
      }
    };

    // ── Pre-seed sheetDict with ALL target aliases from the target registry ──
    // Operators often write the target alias (e.g. "JAMES", "SMITH") from the very
    // first row without ever bracketing it, because the target card IS the introduction.
    // Without pre-seeding, Pass B would never find these tokens.
    // We register each alias under its lowercase key so Pass B can match it in any row.
    // The target this very sheet was opened for (shared/aliasSeeding.ts): its
    // own TGT alias is the word the team writes for them, so a surname shared
    // with someone else on the registry still means THIS sheet's target here.
    const ownTargetId = sheetTargetIdBySheet.get(sheetRows_[0]?.sheetId ?? -1);
    const ownTargetRow =
      ownTargetId !== undefined
        ? targetRows.find(
            t =>
              t.targetId === ownTargetId &&
              (!t.targetType || t.targetType === "person") &&
              !!t.tgt?.trim()
          )
        : undefined;
    const ownTarget = ownTargetRow
      ? { name: ownTargetRow.targetName, alias: ownTargetRow.tgt!.trim() }
      : null;
    for (const [alias, mappedName] of Array.from(
      tgtAliasToFullName.entries()
    )) {
      const aliasKey = alias.toLowerCase();
      const sharers = new Set(
        (registeredNamesByAlias.get(alias) ?? []).map(n => n.toUpperCase())
      );
      const canonicalName = bareAliasOwner({
        alias,
        sharedBy: sharers.size,
        mappedName,
        ownTarget,
      });
      if (canonicalName === null) continue;
      if (!sheetDict.has(aliasKey)) {
        const seeded: DictEntry = {
          shortForm: canonicalName, // display as full canonical name
          rawShortForm: alias, // raw alias is the search token
          fullDescription: `Target: ${canonicalName}`,
          type: "person",
        };
        sheetDict.set(aliasKey, seeded);
        preseededAliasName.set(aliasKey, canonicalName);
        preseededEntryName.set(seeded, canonicalName);
      }
    }

    for (const row of sheetRows_) {
      if (!row.observation) continue;
      const bracketed = extractEntitiesFromText(row.observation);
      for (const e of bracketed) {
        const entry: DictEntry = {
          shortForm: e.shortForm,
          rawShortForm: e.rawShortForm,
          fullDescription: e.fullDescription,
          type: e.type,
        };
        // Register by displayName key (e.g. "g hota")
        registerDictEntry(e.shortForm.toLowerCase(), entry);
        // Also register by raw bracketed token key (e.g. "hota") if different
        // This ensures Pass B can find "HOTA" in subsequent rows even though
        // the display name is "G HOTA".
        if (e.rawShortForm.toLowerCase() !== e.shortForm.toLowerCase()) {
          registerDictEntry(e.rawShortForm.toLowerCase(), entry);
        }
      }
    }

    // ── Pass B: scan every row for both bracketed AND unbracketed occurrences ──
    // Build a sorted list of known short forms (longest first to avoid partial matches)
    const knownEntries = Array.from(sheetDict.values()).sort(
      (a, b) => b.shortForm.length - a.shortForm.length
    );

    for (const row of sheetRows_) {
      if (!row.observation) continue;

      // First, register all bracketed entities in this row (as before)
      const bracketed = extractEntitiesFromText(row.observation);
      // Track both displayName and rawShortForm so we don't double-count
      // e.g. "G HOTA" (displayName) and "HOTA" (rawShortForm) are the same entity
      const bracketedShortForms = new Set<string>();
      for (const e of bracketed) {
        bracketedShortForms.add(e.shortForm.toLowerCase());
        bracketedShortForms.add(e.rawShortForm.toLowerCase());
      }
      for (const e of bracketed) {
        registerOccurrence(e, row);
      }

      // Then, scan for unbracketed occurrences of known short forms.
      //
      // Correct approach: work on the ORIGINAL observation text but track only
      // the paren content ranges "(ShortForm)" — i.e. the brackets themselves.
      // A short-form match is considered "inside a bracket" only if it falls
      // entirely within one of those paren ranges.  This correctly handles rows
      // like "Vehicle 1CZQ642 (1CZQ642) with G HOTA (HOTA) ..." where the same
      // token appears both unbracketed (the real entity) and inside parens
      // (the short-form label) — we want the unbracketed occurrence.
      //
      // Step 1: collect all paren-content ranges [start, end) in this row.
      //         We mark the entire "(ShortForm)" including the parens.
      const parenRanges: Array<[number, number]> = [];
      const parenPattern = /\([^()]{1,80}\)/g;
      let spanMatch: RegExpExecArray | null;
      while ((spanMatch = parenPattern.exec(row.observation)) !== null) {
        parenRanges.push([
          spanMatch.index,
          spanMatch.index + spanMatch[0].length,
        ]);
      }

      // Helper: returns true if the match at [start, end) is entirely inside a paren
      const isInsideParenContent = (start: number, end: number): boolean =>
        parenRanges.some(([s, e]) => start >= s && end <= e);

      // Deduplicate knownEntries so we don't emit two occurrences for the same entity
      // (sheetDict may have both "g hota" and "hota" pointing to the same DictEntry object)
      const seenEntryObjects = new Set<DictEntry>();

      for (const entry of knownEntries) {
        // Skip duplicates (same DictEntry registered under multiple keys)
        if (seenEntryObjects.has(entry)) continue;
        seenEntryObjects.add(entry);

        // Skip if this entity was already captured as a bracketed entity in this row
        // (check both displayName and rawShortForm)
        if (bracketedShortForms.has(entry.shortForm.toLowerCase())) continue;
        if (bracketedShortForms.has(entry.rawShortForm.toLowerCase())) continue;

        // For person, address, and business entities, search by BOTH the
        // enriched displayName ("G HOTA" / "54 Terrace Road, PERTH") AND the
        // raw bracketed token ("HOTA" / "54 Terrace Road") — subsequent rows
        // routinely use the short form (e.g. re-visits that don't repeat the
        // suburb every time: "returned to 54 Terrace Road"), and searching
        // only the full enriched form would miss those, undercounting visits.
        const searchTerms: string[] = [entry.shortForm];
        const aliasIsAmbiguous =
          entry.type === "person" &&
          ambiguousAliasKeys.has(entry.rawShortForm.toLowerCase());
        if (
          !aliasIsAmbiguous &&
          (entry.type === "person" ||
            entry.type === "address" ||
            entry.type === "business" ||
            entry.type === "vehicle") &&
          entry.rawShortForm !== entry.shortForm
        ) {
          searchTerms.push(entry.rawShortForm);
        }
        // A vehicle is identified by its registration, and later rows refer
        // back to it however the officer typed it that day — "Vehicle
        // 1FAD093", "in 1FAD093", or the bare plate. Searching the plate
        // itself catches all of those. Without it the only term searched is
        // the enriched display form ("1FAD093 red Mercedes SUV"), which this
        // pipeline assembles and which therefore never appears verbatim in a
        // later row — so every bare vehicle re-mention went uncounted, and a
        // vehicle never co-occurred with the target driving it.
        if (entry.type === "vehicle") {
          const rego = vehicleRegoKey(entry.shortForm);
          const alreadySearched = searchTerms.some(
            t => t.toLowerCase() === rego
          );
          if (
            rego &&
            rego !== entry.shortForm.toLowerCase() &&
            !alreadySearched
          ) {
            searchTerms.push(rego);
          }
        }

        let found = false;
        for (const term of searchTerms) {
          if (found) break;
          // Build a word-boundary regex for the search term.
          // For vehicle registrations (e.g. "1CZQ642") use lookahead/lookbehind for
          // non-alphanumeric boundaries; for alphabetic terms use \b.
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const wordBoundary = /^[A-Za-z]/.test(term)
            ? `\\b${escaped}\\b`
            : `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`;
          // An all-caps surname alias ("PARK") only counts when written in
          // capitals — see aliasSearchFlags.
          const re = new RegExp(
            wordBoundary,
            entry.type === "person" ? aliasSearchFlags(term) : "gi"
          );

          let tokenMatch: RegExpExecArray | null;
          while ((tokenMatch = re.exec(row.observation)) !== null) {
            const mStart = tokenMatch.index;
            const mEnd = mStart + tokenMatch[0].length;
            // A capital word that is part of a suburb ("MAIDA VALE WA") is the
            // place, not a person of that surname — see shared/suburbMention.ts.
            if (
              entry.type === "person" &&
              insideCapsSuburb(row.observation, mStart, mEnd)
            )
              continue;
            // Only count this occurrence if it is NOT inside a paren
            if (!isInsideParenContent(mStart, mEnd)) {
              // A bare surname alias that follows a different given name
              // mid-sentence ("met Lawrence TAN") is someone else, not the
              // registered "Grace Olivia TAN". At the start of a sentence a
              // capitalised word is as likely to be ordinary text ("Then
              // TAN left"), so that case still counts as before.
              const registeredName = preseededEntryName.get(entry);
              if (
                registeredName &&
                term === entry.rawShortForm &&
                bareAliasFollowsOtherGivenName(
                  row.observation.slice(0, mStart),
                  term,
                  registeredName
                )
              ) {
                continue;
              }
              found = true;
              break;
            }
          }
        }

        if (found) {
          registerOccurrence(
            {
              shortForm: entry.shortForm,
              rawShortForm: entry.rawShortForm,
              fullDescription: entry.fullDescription,
              type: entry.type,
            },
            row
          );
        }
      }

      // Plain-text mentions of a REGISTERED plate or street address that the
      // sheet never bracketed (see registeredMentions above). Skipped for a row
      // the bracket path already credited, so nothing is counted twice.
      for (const plate of registeredPlatesIn(
        row.observation,
        registeredPlateSet
      )) {
        const key = `vehicle::${plate}`;
        if (creditedInRow(key, row.rowId)) continue;
        registerOccurrence(
          {
            shortForm: registeredPlateLabel.get(plate) ?? plate,
            fullDescription: `Registered vehicle ${plate.toUpperCase()} named in the row`,
            type: "vehicle",
          },
          row
        );
      }
      for (const reg of registeredStreets) {
        if (creditedInRow(reg.key, row.rowId)) continue;
        if (!registeredAddressIn(row.observation, reg.street, reg.suburb))
          continue;
        registerOccurrence(
          {
            shortForm: reg.street,
            fullDescription: `Registered address ${reg.street} named in the row`,
            type: "address",
          },
          row
        );
      }
    }
  }

  // ── 4. Post-process: merge address and vehicle entities where one shortForm is a
  //       strict prefix of another (e.g. "1 Smith Street" absorbed into
  //       "1 Smith Street, FREMANTLE WA", or "ABC 123" into "ABC 123 White Hilux").
  //       See mergeContainedEntities above for the algorithm itself.
  // ─────────────────────────────────────────────────────────────────────────────

  // Separate target entities (keyed as target::) from non-target entities
  const nonTargetEntities = Array.from(entityMap.entries())
    .filter(([key]) => !key.startsWith("target::"))
    .map(([, entity]) => entity);

  const targetEntities = Array.from(entityMap.entries())
    .filter(([key]) => key.startsWith("target::"))
    .map(([, entity]) => entity);

  // Group non-target entities by type
  const byType = new Map<string, IntelligenceEntity[]>();
  for (const entity of nonTargetEntities) {
    const t = entity.type;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(entity);
  }

  const mergedMap = new Map<string, IntelligenceEntity>();

  for (const [entityType, group] of Array.from(byType.entries())) {
    // Only apply prefix-merge to addresses and vehicles
    if (entityType !== "address" && entityType !== "vehicle") {
      // For all other types, just add them as-is
      for (const entity of group) {
        const k = `${entity.type}::${entity.shortForm.toLowerCase().trim()}`;
        mergedMap.set(k, entity);
      }
      continue;
    }

    for (const survivor of mergeContainedEntities(group, entityType)) {
      const mergeKey = `${survivor.type}::${survivor.shortForm.toLowerCase().trim()}`;
      mergedMap.set(mergeKey, survivor);
    }
  }

  // Add target entities back — they were never in byType
  for (const entity of targetEntities) {
    const k = `target::${entity.shortForm}`;
    mergedMap.set(k, entity);
  }

  // ── Person Identity Links: mirror intelligence across a linked pair ────────
  // A Target card and a Registry Associate card can be confirmed as the same
  // real person (targets.linkedAssociateId / associates.linkedTargetId — see
  // "Person Identity Links" above updateTarget). Both records intentionally
  // stay as separate profiles (a Target and an Associate are different
  // roles), but neither one should be missing intelligence the other has —
  // so union their occurrences onto both entities, and mark each with a
  // pointer to its identical twin so the UI can flag it.
  const linkedPairRows = await db
    .select({
      targetId: targets.id,
      targetName: targets.name,
      associateId: targets.linkedAssociateId,
    })
    .from(targets)
    .where(
      and(isNull(targets.deletedAt), isNotNull(targets.linkedAssociateId))
    );

  for (const pair of linkedPairRows) {
    if (!pair.associateId) continue;
    const targetEntity = mergedMap.get(`target::${pair.targetName}`);
    const associateEntity = Array.from(mergedMap.values()).find(
      e => e.isAssociate && e.associateId === pair.associateId
    );
    if (!targetEntity || !associateEntity) continue;

    const seen = new Set<string>();
    const combined: IntelligenceEntity["occurrences"] = [];
    for (const occ of [
      ...targetEntity.occurrences,
      ...associateEntity.occurrences,
    ]) {
      const dedupeKey = `${occ.sheetId}::${occ.rowId}::${occ.observationSnippet}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      combined.push(occ);
    }
    targetEntity.occurrences = combined;
    associateEntity.occurrences = combined.slice();

    targetEntity.identicalProfile = {
      type: "associate",
      id: associateEntity.associateId!,
      label: associateEntity.shortForm,
    };
    associateEntity.identicalProfile = {
      type: "target",
      id: targetEntity.targetId!,
      label: targetEntity.shortForm,
    };

    // A registry field (V1F/HBF/etc.) shared by this linked pair produces
    // its own "Target card" occurrence from the target's own record AND a
    // separate "Associate card" occurrence from the associate's own record
    // on whatever vehicle/address entity that field's value keys into —
    // even though both describe the exact same real-world fact for the
    // exact same person (see updateTarget's Person Identity Link sync).
    // When neither side has any real operation touchpoint of its own, that
    // duplication is harmless — it's still just one true Indices-only fact.
    // But once EITHER side carries a real operation (e.g. the associate's
    // parent target is tasked to an operation while the linked target
    // itself is a bare registry entry), the other side's "(Registry)"
    // fallback occurrence for that same synced field is a redundant
    // restatement, not a second independent cross-operation touchpoint —
    // left in place it inflated e.g. a vehicle's "linked operations" with a
    // phantom "(Registry)" badge alongside the real one. combined (just
    // assigned above) already carries the union of both sides' own PERSON
    // occurrences, so it's the right place to check for real exposure.
    const identityHasRealOp = combined.some(o => o.operationId !== 0);
    if (identityHasRealOp) {
      const targetCardPrefix = `Target card — ${targetEntity.shortForm} [`;
      const associateCardPrefix = `Associate card — ${associateEntity.shortForm} [`;
      for (const entity of Array.from(mergedMap.values())) {
        if (entity.type !== "vehicle" && entity.type !== "address") continue;
        entity.occurrences = entity.occurrences.filter(o => {
          if (o.rowId !== 0 || o.operationId !== 0) return true;
          return (
            !o.observationSnippet.startsWith(targetCardPrefix) &&
            !o.observationSnippet.startsWith(associateCardPrefix)
          );
        });
      }
    }
  }

  // "Indices" flag — computed last, once every occurrence (registry-injected
  // and text-mined alike) has been assembled and merged above.
  const finalEntities = Array.from(mergedMap.values());
  for (const entity of finalEntities) {
    entity.isIndicesOnly =
      entity.occurrences.length > 0 &&
      entity.occurrences.every(o => o.rowId === 0);
  }

  return finalEntities;
}

// ─── Reports ──────────────────────────────────────────────────────────────────
