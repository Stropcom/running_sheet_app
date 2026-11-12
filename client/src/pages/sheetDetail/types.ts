import { type DedupType } from "@/components/EntityDuplicateDialog";
import { type TargetMatchCandidate } from "@/components/TargetMatchDialog";
// Types shared by the running sheet screen and the pieces split out of it
// (client/src/pages/sheetDetail/).

export type Member = {
  id: number;
  rowId: number;
  memberName: string;
  sortOrder: number;
  createdAt: Date;
};
export type Certification = {
  id: number;
  rowId: number;
  memberId: number;
  certifiedByUserId: number;
  certifiedByName: string;
  certifiedAt: number;
  isActive: boolean;
};
export type RowAttachment = {
  id: number;
  rowId: number | null;
  url: string;
  mimeType: string;
  caption: string | null;
  uploadedByCIN: string | null;
  createdAt: Date;
  linkedCount?: number;
  linkedCategories?: string[];
  linkedEntities?: Array<{ category: string; label: string }>;
  faceCount?: number | null;
};

export type SheetRow = {
  id: number;
  sheetId: number;
  rowNumber: number;
  time: string | null;
  timeMinutes: number | null;
  dayOffset?: number | null;
  rowDate?: string | null;
  observation: string | null;
  isLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
  members: Member[];
  certifications: Certification[];
  attachments: RowAttachment[];
};

export type ExportRow = {
  id: number;
  rowNumber: number;
  time: string | null;
  timeMinutes: number | null;
  dayOffset?: number | null;
  rowDate?: string | null;
  observation: string | null;
  isLocked: boolean;
  members: { id: number; memberName: string }[];
  certifications: {
    memberId: number;
    certifiedByName: string;
    certifiedAt: number;
    isActive: boolean;
  }[];
  attachments: {
    id: number;
    url: string;
    linkedEntities?: Array<{ category: string; label: string }>;
  }[];
};

export type OperationMeta = {
  name: string;
  promisNumber?: string | null;
  imsNumber?: string | null;
  investigationUnit?: string | null;
  createdAt: Date;
} | null;

export type CinEntry = {
  cin: string;
  hasImages: boolean;
  isTeamLeader?: boolean;
  isAuthor?: boolean;
};

/** What the running sheet screen is given (see SheetDetail). */
export type SheetDetailProps = {
  sheetIdProp?: number;
  embedded?: boolean;
};

// Types that were declared inside the SheetDetail function and are now shared by its step hooks.

// Session-scoped undo stack for this officer's own row edits (observation/time),
// laptop/iPad only. Only ever populated from edits made while online, against
// rows that were unlocked (not fully certified) at the time of the edit — undo
// itself re-checks isLocked before applying, since certification can land
// between the edit and the undo click. Cleared implicitly on page reload; not
// persisted, since it's a convenience for catching a mis-edit, not part of the
// record.
export type UndoEntry = {
  rowId: number;
  previous: Omit<RowSaveInput, "id">;
};

// ── Live possible-duplicate check on observation save ──────────────────────
// Before an edited observation actually saves, extract its entities the same
// way the Intelligence folder does and fuzzy-check each one against every
// existing entity. Any near-miss matches are queued and shown one at a time
// via EntityDuplicateDialog (other text-mined entities) or TargetMatchDialog
// (the formal Target/Associate Registry) — the real save only fires once the
// queue (which may be empty) is drained, so this never silently loses an edit.
export type RowSaveInput = {
  id: number;
  time?: string;
  timeMinutes?: number;
  dayOffset?: number;
  rowDate?: string;
  observation?: string;
};

export type PendingDupe =
  | {
      kind: "generic";
      type: DedupType;
      label: string;
      match: { label: string; rowCount: number; reason: string };
    }
  | {
      kind: "target";
      /** The exact bracket text as typed, e.g. "LOCKET" — this is what
       * gets replaced in the observation text on confirm. */
      rawShortForm: string;
      match: TargetMatchCandidate;
    }
  | {
      /** Informational only — this exact entity is already a real
       * sighting on a different operation. See checkCrossOperationEntity;
       * deliberately independent of the "generic"/"target" near-duplicate
       * checks above, not a variant of them. */
      kind: "crossOp";
      type: DedupType;
      label: string;
      operationNames: string[];
    }
  | {
      /** A vehicle-presence row ("parked and unattended...") with no
       * location entity of its own — see findMissingLocationSuggestion.
       * An actual decision, not informational: confirm appends the
       * suggested location to the observation before saving. */
      kind: "missingLocation";
      location: string;
      source: string;
    }
  | {
      /** A vehicle with a real registration that might be the same car
       * as an earlier no-rego sighting on this sheet — see
       * findVagueVehicleMatch. Confirm merges the two entities via
       * intelligence.mergeEntities (same mechanism as the Merge Entities
       * tool); this row's own text is never touched. */
      kind: "vagueVehicle";
      loserLabel: string;
      winnerLabel: string;
      reason: string;
    };
