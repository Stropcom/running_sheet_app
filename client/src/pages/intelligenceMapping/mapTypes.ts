import { type PinHeadingShape } from "@/lib/pillOptions";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface IntelMapLocation {
  label: string;
  type: "target_address" | "associate_address" | "observation";
  linkedTargets: Array<{
    targetId: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    v1f: string | null;
    v2f: string | null;
    operationId: number | null;
    operationName: string | null;
    addressLabel: string | null;
  }>;
  assocPersons: string[];
  assocVehicles: string[];
  /** Only what running-sheet observations recorded here (see server
   * IntelMapLocation) — the popup's OBSERVATIONS block. Optional so an older
   * server response still renders. */
  observedTargets?: string[];
  observedPersons?: string[];
  observedVehicles?: string[];
  linkCount: number;
  /** Targets this place is tied to (registry or running sheet) — the Target
   * Location switch tints the markers whose list holds the active sheet's
   * target. Optional so an older server response still renders. */
  relatedTargetIds?: number[];
  lat?: number;
  lng?: number;
  /** Observation intel locations that were absorbed into this target_address pin at the same geocoded position */
  secondaryLocs?: IntelMapLocation[];
}

export interface LiveUser {
  userId: number;
  deviceId: string;
  name: string;
  role: "observer" | "member" | "admin" | "investigator";
  teamId: number | null;
  teamName: string | null;
  teamColour: string | null;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  operationIds: number[];
  updatedAt: number;
  onFoot: boolean;
  pinGender: "neutral" | "male" | "female";
  pinSkinTone: "default" | "brown";
  pinVehicleIcon: PinHeadingShape;
  pinColor: string | null;
}
