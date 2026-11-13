// Part of the Intelligence queries (server/db/intelligence.ts): the shapes of the Intelligence profile pages' data.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { OperationEntityPhoto } from "../faces";

// ─── Intelligence Profile Queries ─────────────────────────────────────────────
// Correct association logic: an entity is an "operational associate" of a target
// ONLY if it appears in an observation row on a running sheet where that target
// is the LINKED TARGET (runningSheets.targetId = target.id).
// Co-membership in the same operation is NOT sufficient.

export interface IntelProfileEntity {
  id: string;
  label: string;
  type: "target" | "person" | "vehicle" | "address" | "business";
  targetId?: number;
  sheetIds: number[];
  operationIds: number[];
  rowCount: number;
  /** Only populated on the Operation profile — photos linked to this entity. */
  photos?: OperationEntityPhoto[];
  /** True when this vehicle/location matches a value superseded by a target-merge (see target_field_history). */
  isPrevious?: boolean;
}

/** A cross-operation link discovered because a DIFFERENT target/associate
 * registers the same vehicle rego or the same address as this one — e.g.
 * two independent targets on two different operations both have the same
 * car registered. Distinct from a "mentioned" link (which needs the other
 * record's name to actually appear in this one's observation text): this
 * fires purely from registry field overlap, so it catches cases where
 * there's no shared observation text linking the two records at all. */
export interface SharedEntityCrossLink {
  /** Absent when this link came from the vehicle/address itself being
   * independently sighted on another operation, rather than from another
   * specific target/associate registering the same vehicle/address. */
  targetId?: number;
  targetName?: string;
  operationId: number;
  operationName: string;
  via: "vehicle" | "address" | "associate";
  /** Exactly what is shared, for the tooltip/chip: the registration number(s)
   * for a vehicle, the address(es) in full for an address, the person's name
   * for an associate. Several shared things of one kind are joined. */
  sharedValue: string;
}

export interface IntelTargetProfile {
  targetId: number;
  name: string;
  tgt: string | null;
  hbf: string | null;
  hb: string | null;
  v1f: string | null;
  v1: string | null;
  v2f: string | null;
  v2: string | null;
  /** Extra vehicles beyond V1: JSON array of {full: string, short: string} */
  extraVehicles: string | null;
  /** Extra addresses beyond HBF: JSON array of {full: string, short: string, ...} */
  extraAddresses: string | null;
  dep: string | null;
  arr: string | null;
  operations: Array<{
    id: number;
    name: string;
    /** The document's free-text narrative, verbatim, when this target was
     * created via document import for this operation — shown read-only on
     * the profile as "{Operation name} background". Null otherwise. */
    background: string | null;
  }>;
  /** Cross-operation links found via a shared registered vehicle/address —
   * see SharedEntityCrossLink. */
  sharedEntityLinks: SharedEntityCrossLink[];
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  /** Sheets this target is NOT formally assigned to (no runningSheets.targetId
   * link) but whose observation text mentions them by name — e.g. as a
   * passenger/associate on someone else's running sheet. Sourced from the
   * same name-matched entity data that already powers the Intelligence
   * Folder and Ego Network, so it stays consistent with what those show. */
  mentionedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  observationCount: number;
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
  /** True until this target has appeared in at least one real running-sheet
   * observation — i.e. everything known about them so far came from the
   * Target Registry (or another non-RS source), not from the field. */
  isIndicesOnly: boolean;
  /** Present when this target is linked (Person Identity Links) to a
   * Registry Associate record confirmed to be the same real person — both
   * profiles show identical combined intelligence; the UI uses this to
   * flag it and link across. */
  identicalProfile?: {
    type: "target" | "associate";
    id: number;
    label: string;
  } | null;
  /** Associates recorded directly on this target in the Target Registry — a
   * guaranteed link (not inferred from observation-text co-occurrence). */
  registryAssociates: Array<{
    id: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    hb: string | null;
    v1f: string | null;
    v1: string | null;
    /** JSON [{full, short}] — the registry record's further addresses. */
    extraAddresses: string | null;
    isIndicesOnly: boolean;
    /** "associate" or "resident" (Other Home Address Resident). */
    relationship: string;
  }>;
  /** Person-target status from the registry — null until an officer sets it. */
  mdlStatus: string | null;
  bailStatus: string | null;
  bailConditions: string | null;
  bailConditionsText: string | null;
  /** JSON [{key, detail}] — TI / LBS / SEEK / CAD. */
  specialProjects: string | null;
  /** Freeform Background written in the Target Registry — null until set. */
  registryBackground: string | null;
  registryBackgroundUpdatedAt: number | null;
  registryBackgroundUpdatedByCIN: string | null;
}

export interface IntelOperationProfile {
  operationId: number;
  operationName: string;
  promisNumber: string | null;
  imsNumber: string | null;
  investigationUnit: string | null;
  linkedSheets: Array<{
    id: number;
    title: string;
    targetId: number | null;
    targetName: string | null;
  }>;
  targets: Array<{
    targetId: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    v1f: string | null;
    v2f: string | null;
    /** Extra vehicles beyond V1/V2: JSON array of {full, short}. Kept in
     * sync with the Target profile's own Registered Details — see
     * IntelTargetProfile.extraVehicles. */
    extraVehicles: string | null;
    /** Extra addresses beyond HBF: JSON array of {full, short, ...}. */
    extraAddresses: string | null;
    dep: string | null;
    arr: string | null;
    linkedSheets: Array<{ id: number; title: string }>;
    assocPersons: IntelProfileEntity[];
    assocVehicles: IntelProfileEntity[];
    assocLocations: IntelProfileEntity[];
    photos: OperationEntityPhoto[];
    isIndicesOnly: boolean;
    /** Associates recorded directly on this target in the Target Registry —
     * same guaranteed (not inferred) link as IntelTargetProfile.registryAssociates. */
    /** Person-target status from the registry — null until an officer sets it. */
    mdlStatus: string | null;
    bailStatus: string | null;
    bailConditions: string | null;
    bailConditionsText: string | null;
    /** JSON [{key, detail}] — TI / LBS / SEEK / CAD. */
    specialProjects: string | null;
    /** Freeform Background from the Target Registry — null until set. */
    registryBackground: string | null;
    registryBackgroundUpdatedAt: number | null;
    registryBackgroundUpdatedByCIN: string | null;
    registryAssociates: Array<{
      id: number;
      name: string;
      tgt: string | null;
      hbf: string | null;
      hb: string | null;
      v1f: string | null;
      v1: string | null;
      extraAddresses: string | null;
      isIndicesOnly: boolean;
      relationship: string;
    }>;
  }>;
  /** Cross-operation links found for any target in this operation — a
   * shared registered vehicle/address with a target on a DIFFERENT
   * operation. otherOperationId/otherOperationName refer to that other
   * operation, not this one. */
  crossOperationLinks: Array<{
    targetId: number;
    targetName: string;
    otherOperationId: number;
    otherOperationName: string;
    via: "vehicle" | "address" | "associate";
    sharedValue: string;
  }>;
}

export interface IntelAssociateProfile {
  label: string;
  type: "person" | "business";
  linkedTargets: Array<{
    targetId: number;
    name: string;
    operationId: number;
    operationName: string;
  }>;
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  assocLocations: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  /** Cross-operation links found via a shared registered vehicle/address —
   * see SharedEntityCrossLink. */
  sharedEntityLinks: SharedEntityCrossLink[];
  /** True until this associate has appeared in at least one real running-sheet
   * observation — i.e. everything known about them so far came from the
   * Target Registry (or another non-RS source), not from the field. */
  isIndicesOnly: boolean;
  /** Present when this associate is linked (Person Identity Links) to a
   * Target record confirmed to be the same real person — both profiles
   * show identical combined intelligence; the UI uses this to flag it and
   * link across. */
  identicalProfile?: {
    type: "target" | "associate";
    id: number;
    label: string;
  } | null;
  /** Present when this associate has a formal Target Registry record — its
   * own structured identity/address/vehicle, not just text-mined mentions. */
  registryAssociateId?: number | null;
  firstNames?: string | null;
  surname?: string | null;
  bornDate?: string | null;
  hbf?: string | null;
  hb?: string | null;
  v1f?: string | null;
  v1?: string | null;
  /** JSON [{full, short}] — the registry record's further addresses / vehicles. */
  extraAddresses?: string | null;
  extraVehicles?: string | null;
}

export interface IntelVehicleProfile {
  label: string;
  firstObservation: string | null;
  /** Every registered target/associate that lists this vehicle — a rego can
   * legitimately be registered by more than one record (e.g. two
   * independent targets on two different operations both have the same
   * car), so this must never be narrowed to "the first match". */
  linkedTargets: Array<{ targetId: number; name: string }>;
  /** Every registered associate that lists this vehicle — mirrors
   * linkedTargets above but for an associate's own vehicle field. */
  linkedAssociates: Array<{
    associateId: number;
    name: string;
    targetId: number;
    targetName: string;
  }>;
  linkedOperations: Array<{ id: number; name: string }>;
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  assocPersons: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
  /** True when this vehicle itself matches a value superseded by a target-merge. */
  isPrevious?: boolean;
  /** True until this vehicle has appeared in at least one real running-sheet
   * observation — i.e. it's only known from a Target/Associate registry field. */
  isIndicesOnly: boolean;
}

export interface IntelLocationProfile {
  label: string;
  /** A fuller "<street>, SUBURB STATE" form of this address, recovered from
   * an occurrence's free text, for geocoding — `label` alone is often just
   * a business/place name (see composeAddress's bracketCode) with no
   * suburb or street, which is far too ambiguous to geocode reliably. */
  fullAddress: string | null;
  linkedTargets: Array<{ targetId: number; name: string }>;
  /** Every registered associate that lists this address — mirrors
   * linkedTargets above but for an associate's own address field. */
  linkedAssociates: Array<{
    associateId: number;
    name: string;
    targetId: number;
    targetName: string;
  }>;
  linkedOperations: Array<{ id: number; name: string }>;
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  /** True when this location itself matches a value superseded by a target-merge. */
  isPrevious?: boolean;
  /** True until this location has appeared in at least one real running-sheet
   * observation — i.e. it's only known from a Target/Associate registry field. */
  isIndicesOnly: boolean;
}
