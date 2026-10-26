import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { formatIntelVehicle } from "@shared/addressFormat";
import { fullAddressForGeocode } from "@shared/geocodeQuery";

import {
  operations,
  runningSheets,
  sheetRows,
  targets,
  associates,
  operationTargetLinks,
} from "../../drizzle/schema";

import { attributedRowIds } from "../entityAttribution";

import {
  IntelAssociateProfile,
  IntelLocationProfile,
  IntelOperationProfile,
  IntelProfileEntity,
  IntelTargetProfile,
  IntelVehicleProfile,
  IntelligenceEntity,
  SharedEntityCrossLink,
  addressCoreLower,
  extractRegoUpper,
  getPreviousEntityMatchers,
  markPreviousEntities,
  targetCoreName,
  vehicleRegoKey,
} from "./intelligence";
import { getDb } from "./core";
import { normalizeEntityLabel } from "./attachments";
import { getAttachmentsForOperationEntities } from "./faces";
import {
  getAssociateById,
  getAssociatesForTarget,
  getLinkedOperationsForTarget,
  getTargetById,
} from "./targets";
import { getAllIntelligenceEntities } from "./reports";

// ─── Cross-operation links via shared registered vehicle/address ──────────
// Two independent target/associate records — possibly on two different
// operations — can register the same rego or the same address without ever
// sharing an observation row, so the "mentioned in another operation's
// text" check (mentionedSheets) can't see them. These helpers find that
// kind of link directly from registry fields instead.

/** Every rego this target/associate record has registered — v1/v1f, v2/v2f,
 * and each entry in extraVehicles — normalized via extractRegoUpper so
 * "1GHH884" and "...bearing WA registration 1GHH884..." compare equal. */
export function targetVehicleRegos(t: {
  v1f?: string | null;
  v1?: string | null;
  v2f?: string | null;
  v2?: string | null;
  extraVehicles?: string | null;
  /** The structured Registration/Model fields (V1) — when present they are
   * trusted over scanning the free text, which can mistake a model name
   * ("Lexus NX350h") for a plate. */
  vehRegistration?: string | null;
  vehModel?: string | null;
}): Set<string> {
  const regos = new Set<string>();
  const squash = (v: string) => v.replace(/\s+/g, "").toUpperCase();
  // Model names that happen to look like a plate (NX350H, CX5, D4D…) —
  // never a registration for this record.
  const models = new Set<string>();
  if (t.vehModel) models.add(squash(t.vehModel));
  let extras: Array<{
    full?: string;
    short?: string;
    registration?: string;
    model?: string;
  }> = [];
  try {
    extras = JSON.parse(t.extraVehicles ?? "[]");
  } catch {
    /* malformed JSON — skip */
  }
  for (const ev of extras) if (ev.model) models.add(squash(ev.model));
  const add = (v?: string | null) => {
    const r = v ? extractRegoUpper(v) : null;
    if (r && !models.has(r)) regos.add(r);
  };
  if (t.vehRegistration) regos.add(squash(t.vehRegistration));
  for (const ev of extras)
    if (ev.registration) regos.add(squash(ev.registration));
  add(t.v1f);
  add(t.v1);
  add(t.v2f);
  add(t.v2);
  for (const ev of extras) {
    add(ev.full);
    add(ev.short);
  }
  return regos;
}

/**
 * Every key a vehicle's text can be matched on, computed the same way on both
 * sides of a registry-to-vehicle link. The vehicle entity is keyed on the
 * rego of its Intelligence-format text (rego first — see formatIntelVehicle),
 * so a registry field is run through that same pipeline before comparing.
 * Reading the raw registry text for the first plate-shaped token instead
 * (what targetVehicleRegos does) picks up a model name that comes before the
 * rego ("blue Volvo XC90, bearing WA registration 1ABC123" → "XC90"), and
 * finds nothing at all for a hyphenated plate ("CW-1212"), so those vehicles
 * ended up with no registered target or associate on their profile.
 */
export function vehicleLinkKeys(text: string | null | undefined): Set<string> {
  const keys = new Set<string>();
  const raw = (text ?? "").trim();
  if (!raw) return keys;
  const stripped = raw.replace(/\s*\([^)]{1,40}\)\s*$/, "").trim();
  if (!stripped) return keys;
  const formatted = formatIntelVehicle(stripped) || stripped;
  keys.add(vehicleRegoKey(formatted).toUpperCase());
  // The plate as typed — covers hyphenated and other non-standard plates
  // that the rego pattern can't pick out. Needs a digit and a letter, so a
  // plain colour or make can never stand in for a plate.
  const first = formatted.split(/\s+/)[0] ?? "";
  if (/\d/.test(first) && /[A-Za-z]/.test(first))
    keys.add(first.replace(/[^A-Za-z0-9]/g, "").toUpperCase());
  return keys;
}

/** All keys a registry record's vehicles can match on: every vehicle field
 * (v1, v2 and each extra) via vehicleLinkKeys, plus targetVehicleRegos. */
export function registryVehicleLinkKeys(t: {
  v1f?: string | null;
  v1?: string | null;
  v2f?: string | null;
  v2?: string | null;
  extraVehicles?: string | null;
  vehRegistration?: string | null;
  vehModel?: string | null;
}): Set<string> {
  const keys = targetVehicleRegos(t);
  const add = (v?: string | null) =>
    vehicleLinkKeys(v).forEach(k => keys.add(k));
  add(t.v1f);
  add(t.v1);
  add(t.v2f);
  add(t.v2);
  try {
    const extras: Array<{ full?: string; short?: string }> = JSON.parse(
      t.extraVehicles ?? "[]"
    );
    for (const ev of extras) {
      add(ev.full);
      add(ev.short);
    }
  } catch {
    /* malformed JSON — skip */
  }
  return keys;
}

/** Every address this target/associate record has registered — hbf/hb,
 * dep, arr, and each entry in extraAddresses — normalized via
 * addressCoreLower so formatting differences don't stop a real match. */
export function targetAddressCores(t: {
  hbf?: string | null;
  hb?: string | null;
  dep?: string | null;
  arr?: string | null;
  extraAddresses?: string | null;
}): Set<string> {
  const cores = new Set<string>();
  const add = (v?: string | null) => {
    if (!v) return;
    const c = addressCoreLower(v);
    if (c) cores.add(c);
  };
  add(t.hbf);
  add(t.hb);
  add(t.dep);
  add(t.arr);
  try {
    const eas: Array<{ full?: string; short?: string }> = JSON.parse(
      t.extraAddresses ?? "[]"
    );
    eas.forEach(ea => {
      add(ea.full);
      add(ea.short);
    });
  } catch {
    /* malformed JSON — skip */
  }
  return cores;
}

/** Readable form of an address for the cross-operation explanation: the
 * registered text without its trailing "(14 Willow Quay)" short-code bracket
 * or full stop — "14 Willow Quay, EAST FREMANTLE WA". */
function displayAddressForLink(v: string): string {
  return v
    .replace(/\s*\([^()]*\)\s*$/, "")
    .replace(/[.\s]+$/, "")
    .trim();
}

/** core -> a readable address, for every address a record registers (the
 * longest text wins when the same address is held in several forms). */
export function targetAddressDisplays(t: {
  hbf?: string | null;
  hb?: string | null;
  dep?: string | null;
  arr?: string | null;
  extraAddresses?: string | null;
}): Map<string, string> {
  const out = new Map<string, string>();
  const add = (v?: string | null) => {
    if (!v) return;
    const core = addressCoreLower(v);
    if (!core) return;
    const shown = displayAddressForLink(v);
    const prev = out.get(core);
    if (!prev || shown.length > prev.length) out.set(core, shown);
  };
  add(t.hbf);
  add(t.hb);
  add(t.dep);
  add(t.arr);
  try {
    const eas: Array<{ full?: string; short?: string }> = JSON.parse(
      t.extraAddresses ?? "[]"
    );
    eas.forEach(ea => {
      add(ea.short);
      add(ea.full);
    });
  } catch {
    /* malformed JSON — skip */
  }
  return out;
}

/** Bulk targetId -> operations map from operationTargetLinks, for folding a
 * registered target's own operation membership into another entity's
 * (vehicle/location/target) cross-operation detection without an N+1 query
 * per target. */
export async function getTargetOperationLinksMap(): Promise<
  Map<number, Array<{ id: number; name: string }>>
> {
  const db = await getDb();
  if (!db) return new Map();
  const links = await db
    .select({
      targetId: operationTargetLinks.targetId,
      id: operations.id,
      name: operations.name,
    })
    .from(operationTargetLinks)
    .innerJoin(operations, eq(operations.id, operationTargetLinks.operationId))
    .where(isNull(operations.deletedAt));
  const map = new Map<number, Array<{ id: number; name: string }>>();
  for (const l of links) {
    if (!map.has(l.targetId)) map.set(l.targetId, []);
    map.get(l.targetId)!.push({ id: l.id, name: l.name });
  }
  return map;
}

/** Finds every OTHER target that registers a vehicle rego or address this
 * one also does, and folds in their operation(s) — see
 * SharedEntityCrossLink. Deliberately targets-only (not associates): an
 * associate's own cross-operation exposure already comes from its parent
 * target's operations, so the residual gap this closes is specifically two
 * independent target records sharing a vehicle/address. */
export async function getSharedEntityCrossLinks(
  ownVehicleRegos: Set<string>,
  ownAddressCores: Set<string>,
  excludeTargetId: number
): Promise<SharedEntityCrossLink[]> {
  if (ownVehicleRegos.size === 0 && ownAddressCores.size === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const allTargets = await db
    .select({
      id: targets.id,
      name: targets.name,
      v1f: targets.v1f,
      v1: targets.v1,
      v2f: targets.v2f,
      v2: targets.v2,
      vehRegistration: targets.vehRegistration,
      vehModel: targets.vehModel,
      extraVehicles: targets.extraVehicles,
      hbf: targets.hbf,
      hb: targets.hb,
      dep: targets.dep,
      arr: targets.arr,
      extraAddresses: targets.extraAddresses,
    })
    .from(targets)
    .where(isNull(targets.deletedAt));

  const opLinksMap = await getTargetOperationLinksMap();
  const links: SharedEntityCrossLink[] = [];
  const seen = new Set<string>();

  for (const t of allTargets) {
    if (t.id === excludeTargetId) continue;
    const theirRegos = targetVehicleRegos(t);
    const theirCores = targetAddressCores(t);
    // EVERY vehicle/address both records register, stated exactly: the
    // registration number(s), the address(es) in full.
    const matchedVehicles = Array.from(theirRegos).filter(r =>
      ownVehicleRegos.has(r)
    );
    const theirDisplays = targetAddressDisplays(t);
    const matchedAddresses = Array.from(theirCores)
      .filter(c => ownAddressCores.has(c))
      .map(c => theirDisplays.get(c) ?? c);
    const matchedVehicle = matchedVehicles.length
      ? matchedVehicles.join(", ")
      : null;
    const matchedAddress = matchedAddresses.length
      ? matchedAddresses.join("; ")
      : null;
    if (!matchedVehicle && !matchedAddress) continue;

    const theirOps = opLinksMap.get(t.id) ?? [];
    const opsToUse =
      theirOps.length > 0 ? theirOps : [{ id: 0, name: "(Registry)" }];
    for (const op of opsToUse) {
      if (matchedVehicle) {
        const key = `${t.id}::${op.id}::vehicle`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push({
            targetId: t.id,
            targetName: t.name,
            operationId: op.id,
            operationName: op.name,
            via: "vehicle",
            sharedValue: matchedVehicle,
          });
        }
      }
      if (matchedAddress) {
        const key = `${t.id}::${op.id}::address`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push({
            targetId: t.id,
            targetName: t.name,
            operationId: op.id,
            operationName: op.name,
            via: "address",
            sharedValue: matchedAddress,
          });
        }
      }
    }
  }
  return links;
}

/** Finds operations reached by a target/associate's own registered
 * vehicle(s)/address(es) via a real observation SIGHTING of that exact
 * vehicle/address — independent of whose name the sighting was logged
 * against. This is what catches "my car was seen on someone else's
 * operation" (e.g. a different target was observed near it) even when
 * that other target doesn't register the vehicle themselves and neither
 * record's name ever appears in the other's text — getSharedEntityCrossLinks
 * above only catches two records that both register the SAME field value;
 * this catches the vehicle/address itself turning up elsewhere. */
export function getEntitySightingCrossLinks(
  allEntities: IntelligenceEntity[],
  ownVehicleRegos: Set<string>,
  ownAddressCores: Set<string>,
  excludeOperationIds: Set<number>
): SharedEntityCrossLink[] {
  if (ownVehicleRegos.size === 0 && ownAddressCores.size === 0) return [];
  const links: SharedEntityCrossLink[] = [];
  const seen = new Set<string>();
  for (const e of allEntities) {
    let via: "vehicle" | "address" | null = null;
    if (e.type === "vehicle") {
      const rego = extractRegoUpper(e.shortForm);
      if (rego && ownVehicleRegos.has(rego)) via = "vehicle";
    } else if (e.type === "address" || e.type === "business") {
      if (ownAddressCores.has(addressCoreLower(e.shortForm))) via = "address";
    }
    if (!via) continue;
    for (const occ of e.occurrences) {
      if (occ.rowId <= 0) continue; // real sightings only, not registry-only occurrences
      if (excludeOperationIds.has(occ.operationId)) continue;
      const key = `${occ.operationId}::${via}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        operationId: occ.operationId,
        operationName: occ.operationName,
        via,
        sharedValue:
          via === "vehicle"
            ? (extractRegoUpper(e.shortForm) ?? e.shortForm)
            : e.shortForm,
      });
    }
  }
  return links;
}

/** Finds targets from a DIFFERENT operation whose own entity co-occurs
 * (same observation row) with one of THIS target/associate's own
 * registered vehicle(s)/address(es) — e.g. a different target was
 * observed near/in this record's car. Catches the case
 * getEntitySightingCrossLinks can't: the vehicle/address itself was only
 * ever sighted on this record's own operation, but that same sighting
 * also names a target who belongs to a different operation. */
export async function getCoOccurringTargetCrossLinks(
  allEntities: IntelligenceEntity[],
  ownVehicleRegos: Set<string>,
  ownAddressCores: Set<string>,
  excludeOperationIds: Set<number>
): Promise<SharedEntityCrossLink[]> {
  if (ownVehicleRegos.size === 0 && ownAddressCores.size === 0) return [];

  // Every row where one of my own vehicles/addresses actually appears,
  // tagged with which one so the link can say what was shared.
  const ownRowVia = new Map<
    number,
    { via: "vehicle" | "address"; sharedValue: string }
  >();
  for (const e of allEntities) {
    let via: "vehicle" | "address" | null = null;
    if (e.type === "vehicle") {
      const rego = extractRegoUpper(e.shortForm);
      if (rego && ownVehicleRegos.has(rego)) via = "vehicle";
    } else if (e.type === "address" || e.type === "business") {
      if (ownAddressCores.has(addressCoreLower(e.shortForm))) via = "address";
    }
    if (!via) continue;
    for (const occ of e.occurrences) {
      if (occ.rowId <= 0) continue;
      if (!ownRowVia.has(occ.rowId))
        ownRowVia.set(occ.rowId, {
          via,
          sharedValue:
            via === "vehicle"
              ? (extractRegoUpper(e.shortForm) ?? e.shortForm)
              : e.shortForm,
        });
    }
  }
  if (ownRowVia.size === 0) return [];

  const opLinksMap = await getTargetOperationLinksMap();
  const links: SharedEntityCrossLink[] = [];
  const seen = new Set<string>();
  for (const e of allEntities) {
    if (!e.isTarget || !e.targetId) continue;
    const overlap = e.occurrences.find(
      o => o.rowId > 0 && ownRowVia.has(o.rowId)
    );
    if (!overlap) continue;
    const info = ownRowVia.get(overlap.rowId)!;
    for (const op of opLinksMap.get(e.targetId) ?? []) {
      if (excludeOperationIds.has(op.id)) continue;
      const key = `${e.targetId}::${op.id}::${info.via}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        targetId: e.targetId,
        targetName: e.shortForm,
        operationId: op.id,
        operationName: op.name,
        via: info.via,
        sharedValue: info.sharedValue,
      });
    }
  }
  return links;
}

/** Cross-operation links through PEOPLE: one of this target's registered
 * associates is also a registered associate of — or is itself — a target on
 * a different operation. Matched on the exact normalised name (first names +
 * SURNAME), the same name convention every registry record uses; the link
 * states the person's name. */
export async function getSharedAssociateCrossLinks(
  ownAssociateNames: string[],
  excludeTargetId: number
): Promise<SharedEntityCrossLink[]> {
  const normalise = (n: string) => targetCoreName(n).replace(/\s+/g, " ");
  const own = new Map<string, string>(); // normalised → display name
  for (const n of ownAssociateNames) {
    const key = normalise(n);
    if (key && !own.has(key)) own.set(key, n.split(",")[0].trim());
  }
  if (own.size === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const opLinksMap = await getTargetOperationLinksMap();
  const links: SharedEntityCrossLink[] = [];
  const seen = new Set<string>();
  const push = (
    ownerTargetId: number,
    ownerTargetName: string,
    personKey: string
  ) => {
    for (const op of opLinksMap.get(ownerTargetId) ?? []) {
      const key = `${ownerTargetId}::${op.id}::${personKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        targetId: ownerTargetId,
        targetName: ownerTargetName,
        operationId: op.id,
        operationName: op.name,
        via: "associate",
        sharedValue: own.get(personKey) ?? personKey,
      });
    }
  };
  // The same person registered as an associate of another target…
  const otherAssociates = await db
    .select({
      name: associates.name,
      targetId: associates.targetId,
      targetName: targets.name,
    })
    .from(associates)
    .innerJoin(targets, eq(targets.id, associates.targetId))
    .where(and(isNull(associates.deletedAt), isNull(targets.deletedAt)));
  for (const a of otherAssociates) {
    if (a.targetId === excludeTargetId) continue;
    const key = normalise(a.name);
    if (own.has(key)) push(a.targetId, a.targetName, key);
  }
  // …or already a target in their own right.
  const allTargets = await db
    .select({ id: targets.id, name: targets.name })
    .from(targets)
    .where(isNull(targets.deletedAt));
  for (const t of allTargets) {
    if (t.id === excludeTargetId) continue;
    const key = normalise(t.name);
    if (own.has(key)) push(t.id, t.name, key);
  }
  return links;
}

/** getSharedEntityCrossLinks, getEntitySightingCrossLinks, and
 * getCoOccurringTargetCrossLinks each dedupe within themselves, but the
 * same underlying fact (e.g. "this vehicle was sighted on operation X")
 * can legitimately be found by more than one of them at once — collapse
 * those into a single entry before returning to the client, preferring a
 * named entry (from the registry-sharing or co-occurring-target checks)
 * over an anonymous one (from the plain entity-sighting check) when both
 * exist for the same target/operation/via/value. */
function dedupeCrossLinks(
  links: SharedEntityCrossLink[]
): SharedEntityCrossLink[] {
  const map = new Map<string, SharedEntityCrossLink>();
  for (const l of links) {
    const key = `${l.targetId ?? "-"}::${l.operationId}::${l.via}::${l.sharedValue.toLowerCase()}`;
    const existing = map.get(key);
    if (!existing || (!existing.targetName && l.targetName)) {
      map.set(key, l);
    }
  }
  return Array.from(map.values());
}

async function buildTargetOperationalAssociations(
  targetId: number,
  targetLabel: string,
  targetName: string,
  allEntities: IntelligenceEntity[],
  targetEntity: IntelligenceEntity | undefined,
  /** Restrict to mentions on these sheets. Omitted = app-wide (the target's
   * own profile); the Operation Profile passes its own sheets so it stays a
   * summary of that operation rather than of the target everywhere. */
  scopeSheetIds?: Set<number>
): Promise<{
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
}> {
  // Rows where this target is actually mentioned — the same occurrence data
  // that links them in the Intelligence Folder / Ego Network, so a target's
  // profile shows the co-occurring people/vehicles/locations those views
  // already agree on.
  //
  // Every row of a formally-assigned sheet used to be included as well. That
  // was wrong: a sheet assignment says who the team set out to watch, not who
  // they saw. On a shift spent watching a house the target never leaves, the
  // associates and vehicles that do come and go were all being listed as the
  // target's own associations. An entity only associates with the target
  // where both are named in the same observation.
  const targetRowIds = attributedRowIds(targetEntity?.occurrences, {
    sheetIds: scopeSheetIds,
  });

  if (!targetRowIds.size)
    return { assocPersons: [], assocVehicles: [], assocLocations: [] };
  const targetLabelLower = targetLabel.toLowerCase();
  // Catches observation-derived person entities that are just the target's own
  // name in different wording (e.g. "Sighted JOHN SMITH" vs the target card's
  // "JOHN SMITH, born 1 Jan 1980") — without this, the same real person shows
  // up both as the profile's main subject and again in its own associate list.
  const coreName = targetCoreName(targetName);

  const assocPersonsMap = new Map<string, IntelProfileEntity>();
  const assocVehiclesMap = new Map<string, IntelProfileEntity>();
  const assocLocationsMap = new Map<string, IntelProfileEntity>();

  for (const entity of allEntities) {
    if (entity.shortForm.toLowerCase() === targetLabelLower) continue;
    if (entity.isTarget && entity.targetId === targetId) continue;
    if (!entity.isTarget && entity.type === "person" && coreName) {
      const entityLower = entity.shortForm.toLowerCase().trim();
      if (entityLower === coreName || entityLower.endsWith(` ${coreName}`))
        continue;
    }
    const relevantOccs = entity.occurrences.filter(
      occ => occ.rowId > 0 && targetRowIds.has(occ.rowId)
    );
    if (!relevantOccs.length) continue;

    const key = `${entity.type}::${entity.shortForm.toLowerCase()}`;
    const profileEntity: IntelProfileEntity = {
      id: key,
      label: entity.shortForm,
      type: entity.isTarget
        ? "target"
        : (entity.type as IntelProfileEntity["type"]),
      sheetIds: Array.from(new Set(relevantOccs.map(o => o.sheetId))),
      operationIds: Array.from(new Set(relevantOccs.map(o => o.operationId))),
      rowCount: new Set(relevantOccs.map(o => o.rowId)).size,
    };

    if (entity.type === "person" || entity.isTarget) {
      assocPersonsMap.set(key, profileEntity);
    } else if (entity.type === "vehicle") {
      assocVehiclesMap.set(key, profileEntity);
    } else if (entity.type === "address" || entity.type === "business") {
      assocLocationsMap.set(key, profileEntity);
    }
  }

  return {
    assocPersons: Array.from(assocPersonsMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
    assocVehicles: Array.from(assocVehiclesMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
    assocLocations: Array.from(assocLocationsMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
  };
}

// Populates `.photos` on a set of associated-entity arrays (mutates in place),
// mirroring the batched lookup already used by getIntelOperationProfile — so
// every profile page (Target/Associate/Vehicle/Location) shows an associated
// entity's own linked photos, not just the Operation profile.
async function populateAssocPhotos(
  assocPersons: IntelProfileEntity[],
  assocVehicles: IntelProfileEntity[],
  assocLocations: IntelProfileEntity[]
): Promise<void> {
  const vehicleKeys = assocVehicles.map(v => normalizeEntityLabel(v.label));
  const personKeys = assocPersons
    .filter(p => p.type !== "target")
    .map(p => normalizeEntityLabel(p.label));
  const locationKeys = assocLocations.map(l => normalizeEntityLabel(l.label));
  const { entityPhotos } = await getAttachmentsForOperationEntities([], {
    vehicle: vehicleKeys,
    associate: personKeys,
    location: locationKeys,
  });
  for (const p of assocPersons)
    p.photos =
      entityPhotos.get(`associate::${normalizeEntityLabel(p.label)}`) ?? [];
  for (const v of assocVehicles)
    v.photos =
      entityPhotos.get(`vehicle::${normalizeEntityLabel(v.label)}`) ?? [];
  for (const l of assocLocations)
    l.photos =
      entityPhotos.get(`location::${normalizeEntityLabel(l.label)}`) ?? [];
}

export async function getIntelTargetProfile(
  targetId: number
): Promise<IntelTargetProfile | null> {
  const db = await getDb();
  if (!db) return null;

  const target = await getTargetById(targetId);
  if (!target) return null;

  const opLinks = await db
    .select({
      id: operations.id,
      name: operations.name,
      background: operationTargetLinks.background,
    })
    .from(operationTargetLinks)
    .innerJoin(operations, eq(operations.id, operationTargetLinks.operationId))
    .where(
      and(
        eq(operationTargetLinks.targetId, targetId),
        isNull(operations.deletedAt)
      )
    );

  const linkedSheetRows = await db
    .select({
      id: runningSheets.id,
      title: runningSheets.title,
      operationId: runningSheets.operationId,
    })
    .from(runningSheets)
    .where(
      and(eq(runningSheets.targetId, targetId), isNull(runningSheets.deletedAt))
    );

  const opNames: Record<number, string> = {};
  for (const op of opLinks) opNames[op.id] = op.name;

  const extraOpIds = Array.from(
    new Set(linkedSheetRows.map(s => s.operationId).filter(id => !opNames[id]))
  );
  if (extraOpIds.length) {
    const extraOps = await db
      .select({ id: operations.id, name: operations.name })
      .from(operations)
      .where(inArray(operations.id, extraOpIds));
    for (const op of extraOps) opNames[op.id] = op.name;
  }

  let observationCount = 0;
  for (const sheet of linkedSheetRows) {
    const cnt = await db
      .select({ c: sql<number>`count(*)` })
      .from(sheetRows)
      .where(eq(sheetRows.sheetId, sheet.id));
    observationCount += Number(cnt[0]?.c ?? 0);
  }

  const allEntities = await getAllIntelligenceEntities();
  const targetEntity = allEntities.find(
    e => e.isTarget && e.targetId === targetId
  );

  // Sheets this target is mentioned in by name (per the same entity data the
  // Intelligence Folder / Ego Network already use) but isn't formally
  // assigned to — e.g. appearing as a passenger on someone else's sheet.
  const linkedSheetIdSet = new Set(linkedSheetRows.map(s => s.id));
  const mentionedSheetIds = Array.from(
    new Set(
      (targetEntity?.occurrences ?? [])
        .filter(occ => occ.rowId > 0 && !linkedSheetIdSet.has(occ.sheetId))
        .map(occ => occ.sheetId)
    )
  );
  let mentionedSheets: IntelTargetProfile["mentionedSheets"] = [];
  if (mentionedSheetIds.length) {
    const mentionedSheetRows = await db
      .select({
        id: runningSheets.id,
        title: runningSheets.title,
        operationId: runningSheets.operationId,
      })
      .from(runningSheets)
      .where(
        and(
          inArray(runningSheets.id, mentionedSheetIds),
          isNull(runningSheets.deletedAt)
        )
      );
    const extraOpIds2 = Array.from(
      new Set(
        mentionedSheetRows.map(s => s.operationId).filter(id => !opNames[id])
      )
    );
    if (extraOpIds2.length) {
      const extraOps2 = await db
        .select({ id: operations.id, name: operations.name })
        .from(operations)
        .where(inArray(operations.id, extraOpIds2));
      for (const op of extraOps2) opNames[op.id] = op.name;
    }
    mentionedSheets = mentionedSheetRows.map(s => ({
      id: s.id,
      title: s.title,
      operationId: s.operationId,
      operationName: opNames[s.operationId] ?? "Unknown",
    }));

    // Mentioned-only sheets aren't formally linked to this target, but the
    // target still appears in their rows — count those rows too so the
    // profile's Observations total matches "everywhere this target shows
    // up", not just formally-assigned sheets.
    for (const sheet of mentionedSheetRows) {
      const cnt = await db
        .select({ c: sql<number>`count(*)` })
        .from(sheetRows)
        .where(eq(sheetRows.sheetId, sheet.id));
      observationCount += Number(cnt[0]?.c ?? 0);
    }
  }

  const targetLabel = target.tgt ?? target.name;
  const { assocPersons, assocVehicles, assocLocations } =
    await buildTargetOperationalAssociations(
      targetId,
      targetLabel,
      target.name,
      allEntities,
      targetEntity
    );
  await populateAssocPhotos(assocPersons, assocVehicles, assocLocations);
  markPreviousEntities(
    assocVehicles,
    assocLocations,
    await getPreviousEntityMatchers()
  );

  const registryAssociateRows = await getAssociatesForTarget(targetId);
  const associateEntityById = new Map(
    allEntities
      .filter(e => e.isAssociate && e.associateId != null)
      .map(e => [e.associateId as number, e])
  );

  const ownVehicleRegos = targetVehicleRegos(target);
  const ownAddressCores = targetAddressCores(target);
  const ownOperationIds = new Set(opLinks.map(o => o.id));
  // Same reasoning as the mirror-image check in getIntelAssociateProfile: if
  // this target is Person-Identity-Linked to a registry associate, that
  // associate's own operation (via its parent target) is this same
  // person's own turf, not a genuine cross-operation connection to flag.
  if (target.linkedAssociateId) {
    const linkedAssociate = await getAssociateById(target.linkedAssociateId);
    if (linkedAssociate) {
      const parentOps = await getLinkedOperationsForTarget(
        linkedAssociate.targetId
      );
      for (const op of parentOps) ownOperationIds.add(op.operationId);
    }
  }
  const sharedEntityLinks = dedupeCrossLinks([
    ...(await getSharedEntityCrossLinks(
      ownVehicleRegos,
      ownAddressCores,
      targetId
    )),
    ...getEntitySightingCrossLinks(
      allEntities,
      ownVehicleRegos,
      ownAddressCores,
      ownOperationIds
    ),
    ...(await getCoOccurringTargetCrossLinks(
      allEntities,
      ownVehicleRegos,
      ownAddressCores,
      ownOperationIds
    )),
    ...(await getSharedAssociateCrossLinks(
      registryAssociateRows.map(a => a.name),
      targetId
    )),
  ]);

  return {
    targetId,
    name: target.name,
    tgt: target.tgt,
    hbf: target.hbf,
    hb: target.hb,
    v1f: target.v1f,
    v1: target.v1,
    v2f: target.v2f,
    v2: target.v2,
    extraVehicles: target.extraVehicles ?? null,
    extraAddresses: target.extraAddresses ?? null,
    dep: target.dep,
    arr: target.arr,
    operations: opLinks,
    sharedEntityLinks,
    linkedSheets: linkedSheetRows.map(s => ({
      id: s.id,
      title: s.title,
      operationId: s.operationId,
      operationName: opNames[s.operationId] ?? "Unknown",
    })),
    mentionedSheets,
    observationCount,
    assocPersons,
    assocVehicles,
    assocLocations,
    isIndicesOnly: targetEntity?.isIndicesOnly ?? false,
    identicalProfile: targetEntity?.identicalProfile ?? null,
    registryAssociates: registryAssociateRows.map(a => ({
      id: a.id,
      name: a.name,
      tgt: a.tgt,
      hbf: a.hbf,
      hb: a.hb,
      v1f: a.v1f,
      v1: a.v1,
      extraAddresses: a.extraAddresses ?? null,
      isIndicesOnly: associateEntityById.get(a.id)?.isIndicesOnly ?? false,
      relationship: a.relationship,
    })),
    specialProjects: target.specialProjects ?? null,
    mdlStatus: target.mdlStatus ?? null,
    bailStatus: target.bailStatus ?? null,
    bailConditions: target.bailConditions ?? null,
    bailConditionsText: target.bailConditionsText ?? null,
    registryBackground: target.registryBackground ?? null,
    registryBackgroundUpdatedAt: target.registryBackgroundUpdatedAt ?? null,
    registryBackgroundUpdatedByCIN:
      target.registryBackgroundUpdatedByCIN ?? null,
  };
}

export async function getIntelOperationProfile(
  operationId: number
): Promise<IntelOperationProfile | null> {
  const db = await getDb();
  if (!db) return null;

  const opRows = await db
    .select()
    .from(operations)
    .where(and(eq(operations.id, operationId), isNull(operations.deletedAt)));
  if (!opRows.length) return null;
  const op = opRows[0];

  const sheets = await db
    .select({
      id: runningSheets.id,
      title: runningSheets.title,
      targetId: runningSheets.targetId,
      targetName: runningSheets.targetName,
    })
    .from(runningSheets)
    .where(
      and(
        eq(runningSheets.operationId, operationId),
        isNull(runningSheets.deletedAt)
      )
    );

  const targetLinks = await db
    .select({ targetId: operationTargetLinks.targetId })
    .from(operationTargetLinks)
    .where(eq(operationTargetLinks.operationId, operationId));

  const allEntities = await getAllIntelligenceEntities();
  const operationSheetIds = new Set(sheets.map(s => s.id));
  const associateEntityById = new Map(
    allEntities
      .filter(e => e.isAssociate && e.associateId != null)
      .map(e => [e.associateId as number, e])
  );

  const targetProfilesRaw = await Promise.all(
    targetLinks.map(async ({ targetId }) => {
      const target = await getTargetById(targetId);
      if (!target) return null;
      const targetLabel = target.tgt ?? target.name;
      const targetSheets = sheets.filter(s => s.targetId === targetId);
      const targetEntity = allEntities.find(
        e => e.isTarget && e.targetId === targetId
      );
      // Operation Profile is scoped to this operation's own sheets by
      // design (it's summarizing the operation, not the target), unlike the
      // target's own profile page which widens app-wide. That scoping is
      // now expressed as an explicit sheet scope rather than by withholding
      // targetEntity — associations are the rows the target is mentioned
      // in, and withholding the entity would leave nothing to match on.
      const { assocPersons, assocVehicles, assocLocations } =
        await buildTargetOperationalAssociations(
          targetId,
          targetLabel,
          target.name,
          allEntities,
          targetEntity,
          operationSheetIds
        );
      // Does this target share a registered vehicle/address with a target
      // on a DIFFERENT operation, or has its own vehicle/address been
      // independently sighted on a different operation? (Same-operation
      // matches aren't a cross-operation signal, so those are filtered out
      // below.)
      const ownVehicleRegos = targetVehicleRegos(target);
      const ownAddressCores = targetAddressCores(target);
      const registryAssociateRows = await getAssociatesForTarget(targetId);
      const crossLinksRaw = dedupeCrossLinks([
        ...(await getSharedEntityCrossLinks(
          ownVehicleRegos,
          ownAddressCores,
          targetId
        )),
        ...(await getSharedAssociateCrossLinks(
          registryAssociateRows.map(a => a.name),
          targetId
        )),
        ...getEntitySightingCrossLinks(
          allEntities,
          ownVehicleRegos,
          ownAddressCores,
          new Set([operationId])
        ),
        ...(await getCoOccurringTargetCrossLinks(
          allEntities,
          ownVehicleRegos,
          ownAddressCores,
          new Set([operationId])
        )),
      ]);
      const crossLinks = crossLinksRaw.filter(
        l => l.operationId !== operationId
      );
      const registryAssociates = registryAssociateRows.map(a => ({
        id: a.id,
        name: a.name,
        tgt: a.tgt,
        hbf: a.hbf,
        hb: a.hb,
        v1f: a.v1f,
        v1: a.v1,
        extraAddresses: a.extraAddresses ?? null,
        isIndicesOnly: associateEntityById.get(a.id)?.isIndicesOnly ?? false,
        relationship: a.relationship,
      }));
      return {
        targetId,
        name: target.name,
        tgt: target.tgt,
        hbf: target.hbf,
        v1f: target.v1f,
        v2f: target.v2f,
        extraVehicles: target.extraVehicles ?? null,
        extraAddresses: target.extraAddresses ?? null,
        dep: target.dep,
        arr: target.arr,
        linkedSheets: targetSheets.map(s => ({ id: s.id, title: s.title })),
        registryAssociates,
        mdlStatus: target.mdlStatus ?? null,
        bailStatus: target.bailStatus ?? null,
        bailConditions: target.bailConditions ?? null,
        bailConditionsText: target.bailConditionsText ?? null,
        specialProjects: target.specialProjects ?? null,
        registryBackground: target.registryBackground ?? null,
        registryBackgroundUpdatedAt: target.registryBackgroundUpdatedAt ?? null,
        registryBackgroundUpdatedByCIN:
          target.registryBackgroundUpdatedByCIN ?? null,
        assocPersons,
        assocVehicles,
        assocLocations,
        isIndicesOnly: targetEntity?.isIndicesOnly ?? false,
        crossLinks,
      };
    })
  );
  // crossLinks entries can come from more than one detection mechanism
  // (e.g. a registry-field match against one other target, and a separate
  // row co-occurrence against a different other target) that both resolve
  // to the same fact once displayed here — this flatMap deliberately
  // overwrites each entry's own internal targetId/targetName with THIS
  // (outer-loop) target's, so those two mechanisms produce rows that are
  // indistinguishable to the reader even though dedupeCrossLinks() above
  // correctly kept them apart (it saw two different internal targetIds).
  // Collapse again here, on the identity actually shown on screen: this
  // target, that other operation, that kind of link — regardless of which
  // mechanism found it or what exact value it matched on.
  const crossOperationLinksRaw: IntelOperationProfile["crossOperationLinks"] =
    targetProfilesRaw
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .flatMap(t =>
        t.crossLinks.map(l => ({
          targetId: t.targetId,
          targetName: t.name,
          otherOperationId: l.operationId,
          otherOperationName: l.operationName,
          via: l.via,
          sharedValue: l.sharedValue,
        }))
      );
  const seenOpLinks = new Set<string>();
  const crossOperationLinks = crossOperationLinksRaw.filter(l => {
    const key = `${l.targetId}::${l.otherOperationId}::${l.via}`;
    if (seenOpLinks.has(key)) return false;
    seenOpLinks.add(key);
    return true;
  });
  const targetProfiles = targetProfilesRaw
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map(({ crossLinks, ...rest }) => rest) as IntelOperationProfile["targets"];

  // Batch-fetch photos for every target and every associated vehicle/
  // associate/location shown across this operation's targets, then slot
  // them into the matching entity below.
  const vehicleKeys = new Set<string>();
  const personKeys = new Set<string>();
  const locationKeys = new Set<string>();
  for (const t of targetProfiles) {
    for (const v of t.assocVehicles)
      vehicleKeys.add(normalizeEntityLabel(v.label));
    for (const p of t.assocPersons)
      if (p.type !== "target") personKeys.add(normalizeEntityLabel(p.label));
    for (const l of t.assocLocations)
      locationKeys.add(normalizeEntityLabel(l.label));
  }
  const { targetPhotos, entityPhotos } =
    await getAttachmentsForOperationEntities(
      targetProfiles.map(t => t.targetId),
      {
        vehicle: Array.from(vehicleKeys),
        associate: Array.from(personKeys),
        location: Array.from(locationKeys),
      }
    );
  const previousMatchers = await getPreviousEntityMatchers();
  for (const t of targetProfiles) {
    t.photos = targetPhotos.get(t.targetId) ?? [];
    for (const p of t.assocPersons)
      p.photos =
        entityPhotos.get(`associate::${normalizeEntityLabel(p.label)}`) ?? [];
    for (const v of t.assocVehicles)
      v.photos =
        entityPhotos.get(`vehicle::${normalizeEntityLabel(v.label)}`) ?? [];
    for (const l of t.assocLocations)
      l.photos =
        entityPhotos.get(`location::${normalizeEntityLabel(l.label)}`) ?? [];
    markPreviousEntities(t.assocVehicles, t.assocLocations, previousMatchers);
  }

  return {
    operationId,
    operationName: op.name,
    promisNumber: op.promisNumber ?? null,
    imsNumber: op.imsNumber ?? null,
    investigationUnit: op.investigationUnit ?? null,
    linkedSheets: sheets,
    targets: targetProfiles,
    crossOperationLinks,
  };
}

/**
 * Operations a vehicle/associate/location entity has appeared in, for the
 * manual-upload "link to operation" dropdown — reuses the same
 * getAllIntelligenceEntities() + opMap pattern as getIntelVehicleProfile.
 */
export async function getLinkedOperationsForEntity(
  category: "vehicle" | "associate" | "location",
  entityLabel: string
): Promise<Array<{ id: number; name: string }>> {
  const allEntities = await getAllIntelligenceEntities();
  const labelLower = entityLabel.toLowerCase();

  const entity = allEntities.find(e => {
    if (e.shortForm.toLowerCase() !== labelLower) return false;
    if (category === "vehicle") return e.type === "vehicle";
    if (category === "associate")
      return (e.type === "person" || e.type === "business") && !e.isTarget;
    return (e.type === "address" || e.type === "business") && !e.isTarget;
  });
  if (!entity) return [];

  const opMap = new Map<number, { id: number; name: string }>();
  for (const occ of entity.occurrences) {
    if (!opMap.has(occ.operationId))
      opMap.set(occ.operationId, {
        id: occ.operationId,
        name: occ.operationName,
      });
  }
  return Array.from(opMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export async function getIntelAssociateProfile(
  label: string
): Promise<IntelAssociateProfile | null> {
  const allEntities = await getAllIntelligenceEntities();
  const db = await getDb();
  if (!db) return null;

  const entity = allEntities.find(
    e =>
      e.shortForm.toLowerCase() === label.toLowerCase() &&
      (e.type === "person" || e.type === "business") &&
      !e.isTarget
  );
  if (!entity) return null;

  const observationOccs = entity.occurrences.filter(o => o.rowId > 0);
  const assocRowIds = new Set(observationOccs.map(o => o.rowId));

  const sheetMap = new Map<
    number,
    { id: number; title: string; operationId: number; operationName: string }
  >();
  for (const occ of observationOccs) {
    if (!sheetMap.has(occ.sheetId)) {
      sheetMap.set(occ.sheetId, {
        id: occ.sheetId,
        title: occ.sheetTitle,
        operationId: occ.operationId,
        operationName: occ.operationName,
      });
    }
  }

  const allTargets = await db
    .select({ id: targets.id, name: targets.name })
    .from(targets)
    .where(isNull(targets.deletedAt));

  const linkedTargets: IntelAssociateProfile["linkedTargets"] = [];

  // Guaranteed link: a registry associate always belongs to exactly one
  // target, regardless of whether they've been mentioned in that target's
  // observation text yet — this must show up even with zero row overlap.
  if (entity.isAssociate && entity.associateOfTargetId) {
    const parentOpLinks = await db
      .select({ id: operations.id, name: operations.name })
      .from(operationTargetLinks)
      .innerJoin(
        operations,
        eq(operations.id, operationTargetLinks.operationId)
      )
      .where(
        and(
          eq(operationTargetLinks.targetId, entity.associateOfTargetId),
          isNull(operations.deletedAt)
        )
      );
    if (parentOpLinks.length > 0) {
      for (const op of parentOpLinks) {
        linkedTargets.push({
          targetId: entity.associateOfTargetId,
          name: entity.associateOfTargetName ?? "Unknown",
          operationId: op.id,
          operationName: op.name,
        });
      }
    } else {
      linkedTargets.push({
        targetId: entity.associateOfTargetId,
        name: entity.associateOfTargetName ?? "Unknown",
        operationId: 0,
        operationName: "(Registry)",
      });
    }
  }

  for (const target of allTargets) {
    const targetSheets = await db
      .select({ id: runningSheets.id, operationId: runningSheets.operationId })
      .from(runningSheets)
      .where(
        and(
          eq(runningSheets.targetId, target.id),
          isNull(runningSheets.deletedAt)
        )
      );

    for (const sheet of targetSheets) {
      const rows = await db
        .select({ id: sheetRows.id })
        .from(sheetRows)
        .where(eq(sheetRows.sheetId, sheet.id));
      const hasOverlap = rows.some(r => assocRowIds.has(r.id));
      if (hasOverlap) {
        const opRows = await db
          .select({ name: operations.name })
          .from(operations)
          .where(eq(operations.id, sheet.operationId));
        const alreadyLinked = linkedTargets.some(
          lt =>
            lt.targetId === target.id && lt.operationId === sheet.operationId
        );
        if (!alreadyLinked) {
          linkedTargets.push({
            targetId: target.id,
            name: target.name,
            operationId: sheet.operationId,
            operationName: opRows[0]?.name ?? "Unknown",
          });
        }
        break;
      }
    }
  }

  const assocLocationsMap = new Map<string, IntelProfileEntity>();
  const assocVehiclesMap = new Map<string, IntelProfileEntity>();

  for (const other of allEntities) {
    if (other.shortForm.toLowerCase() === label.toLowerCase()) continue;
    const overlappingOccs = other.occurrences.filter(
      o => o.rowId > 0 && assocRowIds.has(o.rowId)
    );
    if (!overlappingOccs.length) continue;
    const key = `${other.type}::${other.shortForm.toLowerCase()}`;
    const profileEntity: IntelProfileEntity = {
      id: key,
      label: other.shortForm,
      type: other.isTarget
        ? "target"
        : (other.type as IntelProfileEntity["type"]),
      sheetIds: Array.from(new Set(overlappingOccs.map(o => o.sheetId))),
      operationIds: Array.from(
        new Set(overlappingOccs.map(o => o.operationId))
      ),
      rowCount: new Set(overlappingOccs.map(o => o.rowId)).size,
    };
    if (other.type === "vehicle") assocVehiclesMap.set(key, profileEntity);
    else if (other.type === "address" || other.type === "business")
      assocLocationsMap.set(key, profileEntity);
  }

  const assocVehicles = Array.from(assocVehiclesMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const assocLocations = Array.from(assocLocationsMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  await populateAssocPhotos([], assocVehicles, assocLocations);
  markPreviousEntities(
    assocVehicles,
    assocLocations,
    await getPreviousEntityMatchers()
  );

  // Surface the associate's own structured identity/address/vehicle if this
  // is a formal registry record, not just a text-mined mention.
  const registryAssociate = entity.isAssociate
    ? await getAssociateById(entity.associateId ?? -1)
    : undefined;

  // Associates aren't rows in the `targets` table, so there's normally no
  // self id to exclude — EXCEPT when this associate is Person-Identity-
  // Linked to a target (linkedTargetId), whose shared fields (hbf/v1f/etc.)
  // are kept in sync with this record — see updateAssociate/updateTarget.
  // Without excluding it, that linked target's own registered
  // vehicle/address would falsely show up here as a "shared" cross-op
  // match, when it's actually just this same person's other profile (now
  // already surfaced by the "Identical profile" banner/combined intel).
  const associateOwnOperationIds = new Set(
    linkedTargets.map(t => t.operationId)
  );
  // Same reasoning as the linkedTargetId exclusion above, for the two
  // occurrence-based cross-link checks below: a real sighting of this
  // person's own vehicle/address on an operation the LINKED target (not
  // this associate's associateOfTargetId) is tasked to is this same
  // person's own turf, not a cross-operation connection to flag.
  if (registryAssociate?.linkedTargetId) {
    const linkedTargetOps = await getLinkedOperationsForTarget(
      registryAssociate.linkedTargetId
    );
    for (const op of linkedTargetOps)
      associateOwnOperationIds.add(op.operationId);
  }
  const sharedEntityLinks = registryAssociate
    ? dedupeCrossLinks([
        ...(await getSharedEntityCrossLinks(
          targetVehicleRegos(registryAssociate),
          targetAddressCores(registryAssociate),
          registryAssociate.linkedTargetId ?? -1
        )),
        ...getEntitySightingCrossLinks(
          allEntities,
          targetVehicleRegos(registryAssociate),
          targetAddressCores(registryAssociate),
          associateOwnOperationIds
        ),
        ...(await getCoOccurringTargetCrossLinks(
          allEntities,
          targetVehicleRegos(registryAssociate),
          targetAddressCores(registryAssociate),
          associateOwnOperationIds
        )),
      ])
    : [];

  return {
    label: entity.shortForm,
    type: entity.type as "person" | "business",
    linkedTargets,
    sharedEntityLinks,
    linkedSheets: Array.from(sheetMap.values()),
    assocLocations,
    assocVehicles,
    isIndicesOnly: entity.isIndicesOnly ?? false,
    identicalProfile: entity.identicalProfile ?? null,
    registryAssociateId: registryAssociate?.id ?? null,
    firstNames: registryAssociate?.firstNames ?? null,
    surname: registryAssociate?.surname ?? null,
    bornDate: registryAssociate?.bornDate ?? null,
    hbf: registryAssociate?.hbf ?? null,
    hb: registryAssociate?.hb ?? null,
    v1f: registryAssociate?.v1f ?? null,
    v1: registryAssociate?.v1 ?? null,
    extraAddresses: registryAssociate?.extraAddresses ?? null,
    extraVehicles: registryAssociate?.extraVehicles ?? null,
  };
}

export async function getIntelVehicleProfile(
  label: string
): Promise<IntelVehicleProfile | null> {
  const allEntities = await getAllIntelligenceEntities();
  const db = await getDb();
  if (!db) return null;

  const entity = allEntities.find(
    e =>
      e.shortForm.toLowerCase() === label.toLowerCase() && e.type === "vehicle"
  );
  if (!entity) return null;

  const observationOccs = entity.occurrences.filter(o => o.rowId > 0);
  const assocRowIds = new Set(observationOccs.map(o => o.rowId));
  const labelLower = label.toLowerCase();

  const allTargets = await db
    .select({
      id: targets.id,
      name: targets.name,
      v1f: targets.v1f,
      v1: targets.v1,
      v2f: targets.v2f,
      v2: targets.v2,
      extraVehicles: targets.extraVehicles,
      vehRegistration: targets.vehRegistration,
      vehModel: targets.vehModel,
    })
    .from(targets)
    .where(isNull(targets.deletedAt));

  // Registered target(s) — a rego can legitimately be registered by more
  // than one target (e.g. two independent targets on two different
  // operations both have the same car), so this collects every match, not
  // just the first. Deliberately registry-field-only: a target/associate
  // that merely co-occurs with this vehicle in an observation row belongs
  // in assocPersons below, not here — "registered target" should mean
  // exactly what the Target Registry says, not an inferred association.
  const selfRegoForMatch = extractRegoUpper(label);
  // This vehicle's own keys, built the same way as each registry record's
  // (see vehicleLinkKeys) so the two sides always agree.
  const selfLinkKeys = vehicleLinkKeys(entity.shortForm);
  vehicleLinkKeys(label).forEach(k => selfLinkKeys.add(k));
  if (selfRegoForMatch) selfLinkKeys.add(selfRegoForMatch);
  const matchesThisVehicle = (
    rec: Parameters<typeof registryVehicleLinkKeys>[0]
  ) => {
    const keys = registryVehicleLinkKeys(rec);
    return Array.from(selfLinkKeys).some(k => keys.has(k));
  };
  const linkedTargetsMap = new Map<
    number,
    { targetId: number; name: string }
  >();
  for (const t of allTargets) {
    if (matchesThisVehicle(t)) {
      linkedTargetsMap.set(t.id, { targetId: t.id, name: t.name });
    }
  }
  const linkedTargets = Array.from(linkedTargetsMap.values());

  // Registered associate(s) — same idea as linkedTargets above, but for an
  // associate's own vehicle field rather than a target's. An associate has
  // no operation of its own; its only tie to an operation is whichever
  // one(s) its parent target happens to be tasked to, and that tie is
  // registry bookkeeping, not evidence this vehicle has anything to do
  // with that operation — see the isIndicesOnly guard on opMap below.
  const allAssociatesForVehicle = await db
    .select({
      id: associates.id,
      name: associates.name,
      targetId: associates.targetId,
      targetName: targets.name,
      v1f: associates.v1f,
      v1: associates.v1,
      extraVehicles: associates.extraVehicles,
      vehRegistration: associates.vehRegistration,
      vehModel: associates.vehModel,
    })
    .from(associates)
    .innerJoin(targets, eq(associates.targetId, targets.id))
    .where(and(isNull(associates.deletedAt), isNull(targets.deletedAt)));
  const linkedAssociatesMap = new Map<
    number,
    { associateId: number; name: string; targetId: number; targetName: string }
  >();
  for (const a of allAssociatesForVehicle) {
    if (matchesThisVehicle(a)) {
      linkedAssociatesMap.set(a.id, {
        associateId: a.id,
        name: a.name,
        targetId: a.targetId,
        targetName: a.targetName,
      });
    }
  }
  const linkedAssociates = Array.from(linkedAssociatesMap.values());

  const opMap = new Map<number, { id: number; name: string }>();
  const sheetMap = new Map<
    number,
    { id: number; title: string; operationId: number; operationName: string }
  >();
  // Only a REAL sighting (a running-sheet row) counts as this vehicle being
  // linked to an operation. A registry-only entry — this vehicle merely
  // being listed on a target's or associate's card — is ownership
  // information, not evidence it has anything to do with wherever that
  // target/associate happens to be tasked; see linkedTargets/linkedAssociates
  // above for that ownership fact instead. Previously this also folded in
  // an "owner's own operations" signal for a never-sighted vehicle, which
  // read as "this vehicle has been active on operation X" when it hadn't.
  const opLinksMap = await getTargetOperationLinksMap();
  for (const occ of entity.occurrences) {
    if (occ.rowId <= 0) continue;
    if (!opMap.has(occ.operationId))
      opMap.set(occ.operationId, {
        id: occ.operationId,
        name: occ.operationName,
      });
    if (!sheetMap.has(occ.sheetId)) {
      sheetMap.set(occ.sheetId, {
        id: occ.sheetId,
        title: occ.sheetTitle,
        operationId: occ.operationId,
        operationName: occ.operationName,
      });
    }
  }

  const assocPersonsMap = new Map<string, IntelProfileEntity>();
  const assocLocationsMap = new Map<string, IntelProfileEntity>();

  for (const other of allEntities) {
    if (other.shortForm.toLowerCase() === labelLower) continue;
    const overlappingOccs = other.occurrences.filter(
      o => o.rowId > 0 && assocRowIds.has(o.rowId)
    );
    if (!overlappingOccs.length) continue;
    // A target who merely co-occurs with this vehicle in an observation
    // (e.g. named alongside it in the same row) still makes their own
    // operation(s) relevant here — someone from another operation showing
    // up around this vehicle is exactly the kind of thing worth flagging,
    // even though it doesn't make them a "registered" owner (see above).
    if (other.isTarget && other.targetId) {
      for (const op of opLinksMap.get(other.targetId) ?? []) {
        if (!opMap.has(op.id)) opMap.set(op.id, op);
      }
    }
    const key = `${other.type}::${other.shortForm.toLowerCase()}`;
    const profileEntity: IntelProfileEntity = {
      id: key,
      label: other.shortForm,
      type: other.isTarget
        ? "target"
        : (other.type as IntelProfileEntity["type"]),
      sheetIds: Array.from(new Set(overlappingOccs.map(o => o.sheetId))),
      operationIds: Array.from(
        new Set(overlappingOccs.map(o => o.operationId))
      ),
      rowCount: new Set(overlappingOccs.map(o => o.rowId)).size,
    };
    if (other.type === "person" || other.isTarget)
      assocPersonsMap.set(key, profileEntity);
    else if (other.type === "address" || other.type === "business")
      assocLocationsMap.set(key, profileEntity);
  }

  // Find the first observation text that contains the full vehicle description
  const firstObservation =
    entity.occurrences.find(o => o.fullDescription)?.fullDescription ?? null;

  const assocPersons = Array.from(assocPersonsMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const assocLocations = Array.from(assocLocationsMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  await populateAssocPhotos(assocPersons, [], assocLocations);
  const previousMatchers = await getPreviousEntityMatchers();
  markPreviousEntities([], assocLocations, previousMatchers);
  const selfRego = extractRegoUpper(entity.shortForm);
  const isPrevious = !!selfRego && previousMatchers.vehicleRegos.has(selfRego);

  return {
    label: entity.shortForm,
    firstObservation,
    linkedTargets,
    linkedAssociates,
    linkedOperations: Array.from(opMap.values()),
    linkedSheets: Array.from(sheetMap.values()),
    assocPersons,
    assocLocations,
    isPrevious,
    isIndicesOnly: entity.isIndicesOnly ?? false,
  };
}

export async function getIntelLocationProfile(
  label: string
): Promise<IntelLocationProfile | null> {
  const allEntities = await getAllIntelligenceEntities();
  const db = await getDb();
  if (!db) return null;

  const entity = allEntities.find(
    e =>
      e.shortForm.toLowerCase() === label.toLowerCase() &&
      (e.type === "address" || e.type === "business")
  );
  if (!entity) return null;

  const observationOccs = entity.occurrences.filter(o => o.rowId > 0);
  const assocRowIds = new Set(observationOccs.map(o => o.rowId));
  const labelLower = label.toLowerCase();

  // entity.shortForm (== label here) is composeAddress's bracketCode —
  // when the address has a business/place name, that's ALL it is (e.g.
  // "Balthazar", no street or suburb at all — see composeAddress in
  // shared/addressFormat.ts). Geocoding a bare business name is unreliable
  // (the Geocoding API expects a structured address, not a place-name
  // search), so recover a fuller "<street>, SUBURB STATE" form from an
  // occurrence's fullDescription — the free text immediately preceding
  // this entity's bracket, which composeAddress always writes as
  // "<street>, SUBURB STATE" (see extractEntitiesFromText above).
  const fullAddress = fullAddressForGeocode(
    entity.occurrences.map(o => o.fullDescription)
  );

  const allTargets = await db
    .select({
      id: targets.id,
      name: targets.name,
      hbf: targets.hbf,
      hb: targets.hb,
      dep: targets.dep,
      arr: targets.arr,
      extraAddresses: targets.extraAddresses,
    })
    .from(targets)
    .where(isNull(targets.deletedAt));

  // Registered target(s) — registry-field-only (hbf/hb/dep/arr/
  // extraAddresses). Deliberately excludes row co-occurrence: a target
  // that merely appears in an observation alongside this address belongs
  // in assocPersons below, not here — "registered target" should mean
  // exactly what the Target Registry says.
  const selfCoreForMatch = addressCoreLower(label);
  const linkedTargetsMap = new Map<
    number,
    { targetId: number; name: string }
  >();
  for (const t of allTargets) {
    if (targetAddressCores(t).has(selfCoreForMatch)) {
      linkedTargetsMap.set(t.id, { targetId: t.id, name: t.name });
    }
  }
  const linkedTargets: IntelLocationProfile["linkedTargets"] = Array.from(
    linkedTargetsMap.values()
  );

  // Registered associate(s) — same idea as linkedTargets above, but for an
  // associate's own address field. See the matching comment in
  // getIntelVehicleProfile for why this doesn't fold into linkedOperations.
  const allAssociatesForLocation = await db
    .select({
      id: associates.id,
      name: associates.name,
      targetId: associates.targetId,
      targetName: targets.name,
      hbf: associates.hbf,
      hb: associates.hb,
      extraAddresses: associates.extraAddresses,
    })
    .from(associates)
    .innerJoin(targets, eq(associates.targetId, targets.id))
    .where(and(isNull(associates.deletedAt), isNull(targets.deletedAt)));
  const linkedAssociatesMap = new Map<
    number,
    { associateId: number; name: string; targetId: number; targetName: string }
  >();
  for (const a of allAssociatesForLocation) {
    if (targetAddressCores(a).has(selfCoreForMatch)) {
      linkedAssociatesMap.set(a.id, {
        associateId: a.id,
        name: a.name,
        targetId: a.targetId,
        targetName: a.targetName,
      });
    }
  }
  const linkedAssociates = Array.from(linkedAssociatesMap.values());

  const opMap = new Map<number, { id: number; name: string }>();
  const sheetMap = new Map<
    number,
    { id: number; title: string; operationId: number; operationName: string }
  >();
  // Only a REAL sighting counts as this address being linked to an
  // operation — see the matching comment in getIntelVehicleProfile.
  const opLinksMap = await getTargetOperationLinksMap();
  for (const occ of entity.occurrences) {
    if (occ.rowId <= 0) continue;
    if (!opMap.has(occ.operationId))
      opMap.set(occ.operationId, {
        id: occ.operationId,
        name: occ.operationName,
      });
    if (!sheetMap.has(occ.sheetId)) {
      sheetMap.set(occ.sheetId, {
        id: occ.sheetId,
        title: occ.sheetTitle,
        operationId: occ.operationId,
        operationName: occ.operationName,
      });
    }
  }

  const assocPersonsMap = new Map<string, IntelProfileEntity>();
  const assocVehiclesMap = new Map<string, IntelProfileEntity>();

  for (const other of allEntities) {
    if (other.shortForm.toLowerCase() === labelLower) continue;
    const overlappingOccs = other.occurrences.filter(
      o => o.rowId > 0 && assocRowIds.has(o.rowId)
    );
    if (!overlappingOccs.length) continue;
    // A target who merely co-occurs with this address in an observation
    // still makes their own operation(s) relevant here — see the matching
    // comment in getIntelVehicleProfile.
    if (other.isTarget && other.targetId) {
      for (const op of opLinksMap.get(other.targetId) ?? []) {
        if (!opMap.has(op.id)) opMap.set(op.id, op);
      }
    }
    const key = `${other.type}::${other.shortForm.toLowerCase()}`;
    const profileEntity: IntelProfileEntity = {
      id: key,
      label: other.shortForm,
      type: other.isTarget
        ? "target"
        : (other.type as IntelProfileEntity["type"]),
      sheetIds: Array.from(new Set(overlappingOccs.map(o => o.sheetId))),
      operationIds: Array.from(
        new Set(overlappingOccs.map(o => o.operationId))
      ),
      rowCount: new Set(overlappingOccs.map(o => o.rowId)).size,
    };
    if (other.type === "person" || other.isTarget)
      assocPersonsMap.set(key, profileEntity);
    else if (other.type === "vehicle") assocVehiclesMap.set(key, profileEntity);
  }

  const assocPersons = Array.from(assocPersonsMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  const assocVehicles = Array.from(assocVehiclesMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  await populateAssocPhotos(assocPersons, assocVehicles, []);
  const previousMatchers = await getPreviousEntityMatchers();
  markPreviousEntities(assocVehicles, [], previousMatchers);
  const isPrevious = previousMatchers.addressCores.has(
    addressCoreLower(entity.shortForm)
  );

  return {
    label: entity.shortForm,
    fullAddress,
    linkedTargets,
    linkedAssociates,
    linkedOperations: Array.from(opMap.values()),
    linkedSheets: Array.from(sheetMap.values()),
    assocPersons,
    assocVehicles,
    isPrevious,
    isIndicesOnly: entity.isIndicesOnly ?? false,
  };
}
