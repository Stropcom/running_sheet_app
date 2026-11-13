// Part of the Target Registry page (client/src/pages/TargetRegistry.tsx): the types shared by the registry page's pieces.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import type { TargetType } from "@shared/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type WildField = { label: string; value: string };

export type RegistryTarget = {
  id: number;
  targetType: TargetType;
  name: string;
  tgt: string | null;
  hbf: string | null;
  hb: string | null;
  v1f: string | null;
  v1: string | null;
  v2f: string | null; // legacy
  v2: string | null; // legacy
  dep: string | null;
  arr: string | null;
  extraVehicles: string | null; // JSON: ExtraVehicle[]
  extraAddresses: string | null; // JSON: ExtraAddress[]
  wildFields: string | null; // JSON: WildField[] — deprecated, no longer editable
  firstNames: string | null;
  surname: string | null;
  bornDate: string | null; // ISO yyyy-mm-dd
  mdlStatus: string | null; // active | none | suspended
  bailStatus: string | null; // yes | no
  bailConditions: string | null; // yes | no (only when bailStatus = yes)
  bailConditionsText: string | null;
  specialProjects: string | null; // JSON [{key, detail}]
  registryBackground: string | null; // freeform, plain text
  registryBackgroundUpdatedAt: number | null;
  registryBackgroundUpdatedByCIN: string | null;
  addrUnitNo: string | null;
  addrHouseNo: string | null;
  addrStreetName: string | null;
  addrStreetType: string | null;
  addrSuburb: string | null;
  addrState: string | null;
  addrBusinessName: string | null;
  vehRegistration: string | null;
  vehState: string | null;
  vehColour: string | null;
  vehMake: string | null;
  vehModel: string | null;
  vehType: string | null;
  createdAt: Date;
  updatedAt: Date;
  linkedOperations: Array<{
    operationId: number;
    operationName: string | null;
  }>;
  isIndicesOnly?: boolean;
  /** Set when this target has been confirmed as the same real person as an
   * Associate elsewhere in the registry — see "Person Identity Links" in
   * server/db.ts. Both records survive independently; only shared fields
   * stay in sync. */
  linkedAssociateId?: number | null;
};

// ─── Associates ─────────────────────────────────────────────────────────────
// A person linked to a target as a known associate — goes through the same
// controlled Name → Address → Vehicle structured process as a target.

export type AssociateRecord = {
  id: number;
  targetId: number;
  name: string;
  tgt: string | null;
  hbf: string | null;
  hb: string | null;
  v1f: string | null;
  v1: string | null;
  firstNames: string | null;
  surname: string | null;
  bornDate: string | null;
  addrUnitNo: string | null;
  addrHouseNo: string | null;
  addrStreetName: string | null;
  addrStreetType: string | null;
  addrSuburb: string | null;
  addrState: string | null;
  addrBusinessName: string | null;
  vehRegistration: string | null;
  vehState: string | null;
  vehColour: string | null;
  vehMake: string | null;
  vehModel: string | null;
  vehType: string | null;
  extraAddresses: string | null;
  extraVehicles: string | null;
  isIndicesOnly?: boolean;
  /** Set when this associate has been confirmed as the same real person as
   * a Target elsewhere in the registry — mirror of RegistryTarget's
   * linkedAssociateId above. */
  linkedTargetId?: number | null;
  /** "associate" or "resident" (Other Home Address Resident). */
  relationship?: string;
};

// The two kinds of person filed under a target share one record shape and
// one card; only the wording and colour differ.
export type PersonKind = "associate" | "resident";
