import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  bigint,
  double,
  uniqueIndex,
  date,
  index,
} from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  // Local auth fields
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  // Profile fields
  name: varchar("name", { length: 255 }).notNull(),
  cin: varchar("cin", { length: 64 }).notNull().unique(),
  unit: varchar("unit", { length: 255 }),
  team: mysqlEnum("team", ["TEAM1", "TEAM2", "PTT"]),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  role: mysqlEnum("role", ["observer", "member", "admin"])
    .default("observer")
    .notNull(),
  // Legacy OAuth field — kept nullable so existing rows are not broken
  openId: varchar("openId", { length: 64 }),
  loginMethod: varchar("loginMethod", { length: 64 }).default("local"),
  // Forces a password change on next login (e.g. admin-issued temporary
  // password). Enforced server-side in _core/trpc.ts, not just client UI.
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
  wallpaperUrl: varchar("wallpaperUrl", { length: 512 }),
  wallpaperOpacity: int("wallpaperOpacity").default(40), // 0-100, overlay darkness
  // Opt-out for CTO Roster shift-change notifications specifically (not a
  // global notification kill switch) — added while the roster is still
  // being actively tested/edited, so people aren't spammed by every change.
  rosterShiftNotificationsEnabled: boolean("rosterShiftNotificationsEnabled")
    .default(true)
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Operations ─────────────────────────────────────────────────────────────

export const operations = mysqlTable("operations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  promisNumber: varchar("promisNumber", { length: 128 }),
  imsNumber: varchar("imsNumber", { length: 128 }),
  investigationUnit: varchar("investigationUnit", { length: 255 }),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  status: mysqlEnum("status", ["active", "before_court", "archive"])
    .default("active")
    .notNull(),
  deletedAt: bigint("deletedAt", { mode: "number" }),
  deletedByCIN: varchar("deletedByCIN", { length: 64 }),
});

export type Operation = typeof operations.$inferSelect;
export type InsertOperation = typeof operations.$inferInsert;

// ─── Running Sheets ───────────────────────────────────────────────────────────

export const runningSheets = mysqlTable("running_sheets", {
  id: int("id").autoincrement().primaryKey(),
  operationId: int("operationId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  targetName: varchar("targetName", { length: 255 }),
  // JSON array of { cin: string, hasImages: boolean } — daily CIN roster
  sheetCins: text("sheetCins"),
  targetId: int("targetId"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  // Close/Reopen
  closedAt: bigint("closedAt", { mode: "number" }),
  closedByCIN: varchar("closedByCIN", { length: 64 }),
  // Soft-delete
  deletedAt: bigint("deletedAt", { mode: "number" }),
  deletedByCIN: varchar("deletedByCIN", { length: 64 }),
});

export type RunningSheet = typeof runningSheets.$inferSelect;
export type InsertRunningSheet = typeof runningSheets.$inferInsert;

// ─── Sheet Rows ───────────────────────────────────────────────────────────────

export const sheetRows = mysqlTable("sheet_rows", {
  id: int("id").autoincrement().primaryKey(),
  sheetId: int("sheetId").notNull(),
  rowNumber: int("rowNumber").notNull(),
  time: varchar("time", { length: 64 }),
  timeMinutes: int("timeMinutes"),
  dayOffset: int("dayOffset").default(0).notNull(), // legacy — kept for migration compat
  rowDate: varchar("rowDate", { length: 16 }), // YYYY-MM-DD — explicit calendar date for this row (null = use inference)
  observation: text("observation"),
  isLocked: boolean("isLocked").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SheetRow = typeof sheetRows.$inferSelect;
export type InsertSheetRow = typeof sheetRows.$inferInsert;

// ─── Row Members ──────────────────────────────────────────────────────────────
// memberName stores the CIN of the member being observed in this row

export const rowMembers = mysqlTable("row_members", {
  id: int("id").autoincrement().primaryKey(),
  rowId: int("rowId").notNull(),
  memberName: varchar("memberName", { length: 255 }).notNull(), // stores CIN
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RowMember = typeof rowMembers.$inferSelect;
export type InsertRowMember = typeof rowMembers.$inferInsert;

// ─── Certifications ───────────────────────────────────────────────────────────

export const certifications = mysqlTable("certifications", {
  id: int("id").autoincrement().primaryKey(),
  rowId: int("rowId").notNull(),
  memberId: int("memberId").notNull(),
  certifiedByUserId: int("certifiedByUserId").notNull(),
  certifiedByName: varchar("certifiedByName", { length: 255 }).notNull(),
  certifiedByCIN: varchar("certifiedByCIN", { length: 64 }).notNull(),
  certifiedAt: bigint("certifiedAt", { mode: "number" }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
});

export type Certification = typeof certifications.$inferSelect;
export type InsertCertification = typeof certifications.$inferInsert;

// ─── Row Attachments ────────────────────────────────────────────────────────
// Photos attached to a specific running sheet row/observation. The file
// itself lives in object storage (server/storage.ts); key/url just point
// at it.

export const rowAttachments = mysqlTable("row_attachments", {
  id: int("id").autoincrement().primaryKey(),
  // Nullable — a manually-uploaded photo (see isManualUpload) may not belong
  // to any running sheet row. Row-captured photos (the original path) always
  // set this.
  rowId: int("rowId"),
  // Always set, either derived from rowId's sheet at upload time (row-captured
  // photos) or chosen directly by the officer (manual uploads) — every photo
  // has a home Operation regardless of whether it has a row.
  operationId: int("operationId").notNull(),
  // True only for photos added via the standalone Images-folder upload flow,
  // never for photos attached to a running sheet row. Drives the "Uploaded:
  // [date]" banner (see client/src/lib/attachmentBanner.ts), which always
  // shows for these even if optionally linked to a row afterward.
  isManualUpload: boolean("isManualUpload").default(false).notNull(),
  key: varchar("key", { length: 512 }).notNull(),
  url: varchar("url", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 64 }).notNull(),
  caption: text("caption"),
  uploadedBy: int("uploadedBy").notNull(),
  uploadedByCIN: varchar("uploadedByCIN", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Soft-delete — goes to the Recycle Bin for 7 days before purge
  deletedAt: bigint("deletedAt", { mode: "number" }),
  deletedByCIN: varchar("deletedByCIN", { length: 64 }),
});

export type RowAttachment = typeof rowAttachments.$inferSelect;
export type InsertRowAttachment = typeof rowAttachments.$inferInsert;

// ─── Attachment Entity Links ─────────────────────────────────────────────────
// Links a photo to an Intelligence entity. Targets are a real table (link by
// targetId). Vehicles/Associates/Locations are mined live from observation
// text with no stable row of their own (see getAllIntelligenceEntities in
// db.ts) — those link by a normalized (lowercase, trimmed) copy of their
// display label, the same key getAllIntelligenceEntities itself uses to
// de-duplicate entities. entityLabel keeps the label text as shown at link
// time for display without needing to re-run extraction.

export const attachmentEntityLinks = mysqlTable(
  "attachment_entity_links",
  {
    id: int("id").autoincrement().primaryKey(),
    attachmentId: int("attachmentId").notNull(),
    category: mysqlEnum("category", [
      "target",
      "vehicle",
      "associate",
      "location",
      "unidentified_person",
    ]).notNull(),
    targetId: int("targetId"), // set when category = "target"
    entityKey: varchar("entityKey", { length: 512 }), // normalized label, set when category != "target"
    entityLabel: varchar("entityLabel", { length: 512 }).notNull(), // display label at link time
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    // Guards the non-target linkAttachmentToEntity path (entityKey is only
    // set there) against a request landing twice — e.g. a fast double-tap on
    // the face-select Confirm button before it disables — creating two
    // Unidentified Person pool entries for what's really one confirmed face.
    entityKeyDedupIdx: uniqueIndex("attachment_entity_links_dedup_idx").on(
      table.attachmentId,
      table.category,
      table.entityKey
    ),
  })
);

export type AttachmentEntityLink = typeof attachmentEntityLinks.$inferSelect;
export type InsertAttachmentEntityLink =
  typeof attachmentEntityLinks.$inferInsert;

// ─── Person Detections (face recognition) ──────────────────────────────────
// One row per face an officer confirmed in a photo via the face-select
// picker when linking that photo to an entity — not one row per face RetinaFace
// merely detected. bbox/landmarks are pixel coordinates in the original photo;
// embedding is a JSON-encoded 256-d MobileFace vector, computed once at
// confirm time entirely on-device (see server/faceRecognition) and reused for
// similarity search against every other confirmed face — never recomputed
// from a live model call at match time. entityLinkId ties this detection back
// to the specific attachment_entity_links row the officer created for that
// face (target/associate/unidentified_person), so re-identifying a face later
// is just updating that link's category/label, not this table.
export const personDetections = mysqlTable("person_detections", {
  id: int("id").autoincrement().primaryKey(),
  attachmentId: int("attachmentId").notNull(),
  entityLinkId: int("entityLinkId").notNull().unique(),
  bboxX0: double("bboxX0").notNull(),
  bboxY0: double("bboxY0").notNull(),
  bboxX1: double("bboxX1").notNull(),
  bboxY1: double("bboxY1").notNull(),
  landmarks: text("landmarks").notNull(), // JSON: [[x,y], ...] x5 (eyes, nose, mouth corners)
  embedding: text("embedding").notNull(), // JSON: number[256]
  detectionConfidence: double("detectionConfidence").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PersonDetection = typeof personDetections.$inferSelect;
export type InsertPersonDetection = typeof personDetections.$inferInsert;

// ─── Face Match Dismissals ──────────────────────────────────────────────────
// Records an officer's "no, not a match" answer to a possible-match
// suggestion so the same pair isn't re-suggested on every subsequent face
// confirm. Stored unordered (always insert with the smaller id first) so a
// single lookup covers both directions.
export const faceMatchDismissals = mysqlTable("face_match_dismissals", {
  id: int("id").autoincrement().primaryKey(),
  entityLinkIdA: int("entityLinkIdA").notNull(),
  entityLinkIdB: int("entityLinkIdB").notNull(),
  dismissedByCIN: varchar("dismissedByCIN", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FaceMatchDismissal = typeof faceMatchDismissals.$inferSelect;
export type InsertFaceMatchDismissal = typeof faceMatchDismissals.$inferInsert;

// ─── Entity Aliases (confirmed duplicate merges) ───────────────────────────
// Records a confirmed "these are the same real-world entity" decision, from
// either the auto-detected possible-duplicate prompt (officer answers "Yes")
// or the manual Merge Entities tool. getAllIntelligenceEntities() consults
// this table to fold the loser's occurrences into the winner entity, the same
// way it already folds TGT aliases into their canonical target. Scoped to
// non-target entities only (person/vehicle/address/business) — targets have
// their own registry-based identity and are not part of this system.
export const entityAliases = mysqlTable(
  "entity_aliases",
  {
    id: int("id").autoincrement().primaryKey(),
    type: mysqlEnum("type", [
      "person",
      "vehicle",
      "address",
      "business",
    ]).notNull(),
    loserKey: varchar("loserKey", { length: 512 }).notNull(), // normalized key merged away
    loserLabel: varchar("loserLabel", { length: 512 }).notNull(), // kept as "also known as" on the winner
    winnerKey: varchar("winnerKey", { length: 512 }).notNull(), // normalized key that survives
    winnerLabel: varchar("winnerLabel", { length: 512 }).notNull(),
    mergedByCIN: varchar("mergedByCIN", { length: 64 }),
    mergedAt: bigint("mergedAt", { mode: "number" }).notNull(),
  },
  table => ({
    // A given loser key can only ever be merged into one winner at a time.
    loserKeyIdx: uniqueIndex("entity_aliases_loser_idx").on(
      table.type,
      table.loserKey
    ),
  })
);

export type EntityAlias = typeof entityAliases.$inferSelect;
export type InsertEntityAlias = typeof entityAliases.$inferInsert;

// ─── Entity Dedup Decisions (confirmed non-duplicates) ─────────────────────
// Records a confirmed "these are NOT the same entity" decision so the
// possible-duplicate prompt never asks about this exact pair again.
export const entityDedupDecisions = mysqlTable(
  "entity_dedup_decisions",
  {
    id: int("id").autoincrement().primaryKey(),
    type: mysqlEnum("type", [
      "person",
      "vehicle",
      "address",
      "business",
    ]).notNull(),
    keyA: varchar("keyA", { length: 255 }).notNull(), // alphabetically-lesser of the pair
    keyB: varchar("keyB", { length: 255 }).notNull(),
    decidedByCIN: varchar("decidedByCIN", { length: 64 }),
    decidedAt: bigint("decidedAt", { mode: "number" }).notNull(),
  },
  table => ({
    pairIdx: uniqueIndex("entity_dedup_decisions_pair_idx").on(
      table.type,
      table.keyA,
      table.keyB
    ),
  })
);

export type EntityDedupDecision = typeof entityDedupDecisions.$inferSelect;
export type InsertEntityDedupDecision =
  typeof entityDedupDecisions.$inferInsert;

// ─── Targets ────────────────────────────────────────────────────────────────
// One row per target in the global registry. Targets are independent of
// operations — they are linked via the operation_target_links join table.
// operationId is kept nullable for backward-compat with legacy rows.

export const targets = mysqlTable("targets", {
  id: int("id").autoincrement().primaryKey(),
  operationId: int("operationId"), // nullable — legacy field, use join table instead
  name: varchar("name", { length: 255 }).notNull(), // e.g. "Target 1" or a codename
  tgt: text("tgt"), // Target (person) details
  hbf: text("hbf"), // Home Address Full
  hb: text("hb"), // Home Base (short)
  v1f: text("v1f"), // Vehicle 1 Full description
  v1: text("v1"), // Vehicle 1 (short)
  v2f: text("v2f"), // Vehicle 2 Full description (legacy — migrated into extraVehicles)
  v2: text("v2"), // Vehicle 2 (short) (legacy — migrated into extraVehicles)
  // Dynamic extra vehicles beyond V1: JSON array of {full: string, short: string}
  extraVehicles: text("extraVehicles"),
  // Numbered wild fields: JSON array of {label: string, value: string} e.g. [{label:"#1",value:"..."},{label:"#2",value:"..."}]
  wildFields: text("wildFields"),
  dep: text("dep"), // Depart address/location
  arr: text("arr"), // Arrive address/location
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  // Soft-delete
  deletedAt: bigint("deletedAt", { mode: "number" }),
  deletedByCIN: varchar("deletedByCIN", { length: 64 }),
});

export type Target = typeof targets.$inferSelect;
export type InsertTarget = typeof targets.$inferInsert;

// ─── Target Field History ────────────────────────────────────────────────────
// When adding a new target whose name matches an existing one, the officer
// resolves each conflicting field (new value vs existing value) rather than
// silently overwriting or duplicating the target. Whichever value loses that
// choice is kept here (not deleted) so historic detail is never lost — the
// UI shows it back as a "Previous" note on the target profile.

export const targetFieldHistory = mysqlTable("target_field_history", {
  id: int("id").autoincrement().primaryKey(),
  targetId: int("targetId").notNull(),
  fieldName: varchar("fieldName", { length: 32 }).notNull(), // e.g. "name" | "tgt" | "hbf" | "hb" | "v1f" | "v1" | "dep" | "arr"
  previousValue: text("previousValue").notNull(),
  supersededAt: bigint("supersededAt", { mode: "number" }).notNull(),
  supersededByCIN: varchar("supersededByCIN", { length: 64 }),
});

export type TargetFieldHistory = typeof targetFieldHistory.$inferSelect;
export type InsertTargetFieldHistory = typeof targetFieldHistory.$inferInsert;

// ─── Operation-Target Links ──────────────────────────────────────────────────
// Many-to-many join: a target can be linked to multiple operations, and an
// operation can have multiple targets. Deleting an operation removes its links
// but NOT the target itself.

export const operationTargetLinks = mysqlTable("operation_target_links", {
  id: int("id").autoincrement().primaryKey(),
  operationId: int("operationId").notNull(),
  targetId: int("targetId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OperationTargetLink = typeof operationTargetLinks.$inferSelect;
export type InsertOperationTargetLink =
  typeof operationTargetLinks.$inferInsert;

// ─── Observation Shortcuts ──────────────────────────────────────────────────
// Global list of text shortcuts for the observation field.
// When a user types the trigger word followed by a space, it auto-expands.

export const shortcuts = mysqlTable("shortcuts", {
  id: int("id").autoincrement().primaryKey(),
  trigger: varchar("trigger", { length: 64 }).notNull().unique(), // e.g. "sc"
  expansion: text("expansion").notNull(), // e.g. "Surveillance commenced in the vicinity of"
  showInRs: boolean("showInRs").notNull().default(true), // whether this shortcut appears as a chip in RS and RS QE
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Shortcut = typeof shortcuts.$inferSelect;
export type InsertShortcut = typeof shortcuts.$inferInsert;

// ─── Target Shortcuts ────────────────────────────────────────────────────────
// Per-target shortcuts that are merged into the observation form when that
// target is assigned to the running sheet.

export const targetShortcuts = mysqlTable("target_shortcuts", {
  id: int("id").autoincrement().primaryKey(),
  targetId: int("targetId").notNull(),
  trigger: varchar("trigger", { length: 64 }).notNull(),
  expansion: text("expansion").notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TargetShortcut = typeof targetShortcuts.$inferSelect;
export type InsertTargetShortcut = typeof targetShortcuts.$inferInsert;

// ─── Sub-Observations ────────────────────────────────────────────────────────
// Each row can have zero or more sub-observations beneath the main observation.
// A sub-observation has its own text and its own set of CINs (row_members-style),
// each of which can be certified independently.

export const subObservations = mysqlTable("sub_observations", {
  id: int("id").autoincrement().primaryKey(),
  rowId: int("rowId").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  observation: text("observation"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SubObservation = typeof subObservations.$inferSelect;
export type InsertSubObservation = typeof subObservations.$inferInsert;

// ─── Sub-Observation Members ──────────────────────────────────────────────────
// CINs attached to a sub-observation (mirrors row_members).

export const subObservationMembers = mysqlTable("sub_observation_members", {
  id: int("id").autoincrement().primaryKey(),
  subObsId: int("subObsId").notNull(),
  memberName: varchar("memberName", { length: 255 }).notNull(), // stores CIN
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SubObservationMember = typeof subObservationMembers.$inferSelect;
export type InsertSubObservationMember =
  typeof subObservationMembers.$inferInsert;

// ─── Sub-Observation Certifications ───────────────────────────────────────────
// Each CIN on a sub-observation can be certified independently.

export const subObservationCertifications = mysqlTable(
  "sub_observation_certifications",
  {
    id: int("id").autoincrement().primaryKey(),
    subObsId: int("subObsId").notNull(),
    memberId: int("memberId").notNull(), // references sub_observation_members.id
    certifiedByUserId: int("certifiedByUserId").notNull(),
    certifiedByName: varchar("certifiedByName", { length: 255 }).notNull(),
    certifiedByCIN: varchar("certifiedByCIN", { length: 64 }).notNull(),
    certifiedAt: bigint("certifiedAt", { mode: "number" }).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
  }
);

export type SubObservationCertification =
  typeof subObservationCertifications.$inferSelect;
export type InsertSubObservationCertification =
  typeof subObservationCertifications.$inferInsert;

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  sheetId: int("sheetId").notNull(),
  rowId: int("rowId"),
  memberId: int("memberId"),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  userCIN: varchar("userCIN", { length: 64 }),
  action: mysqlEnum("action", [
    "row_created",
    "row_updated",
    "row_deleted",
    "member_added",
    "member_removed",
    "certified",
    "uncertified",
    "sheet_created",
    "sheet_updated",
    "sheet_deleted",
    "sheet_closed",
    "sheet_reopened",
    "sheet_moved",
    "sheet_copied",
    "user_login",
    "user_logout",
    "user_created",
    "user_updated",
    "user_deleted",
    "operation_status_changed",
    "password_changed",
    "attachment_added",
    "attachment_deleted",
    "summary_completed",
    "summary_reopened",
  ]).notNull(),
  details: text("details"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ─── Governance Records ──────────────────────────────────────────────────────────────────────────
// One row per running sheet. Tracks write-off checklist completion.

export const governanceRecords = mysqlTable("governance_records", {
  id: int("id").autoincrement().primaryKey(),
  sheetId: int("sheetId").notNull().unique(),
  // Due date (ms epoch) — defaults to sheet date + 7 days, editable
  dueDate: bigint("dueDate", { mode: "number" }),
  // ─ Team Leader section ─
  isurv: boolean("isurv").default(false).notNull(),
  isurvCIN: varchar("isurvCIN", { length: 50 }),
  isurvName: varchar("isurvName", { length: 100 }),
  sentToIO: boolean("sentToIO").default(false).notNull(),
  sentToIOCIN: varchar("sentToIOCIN", { length: 50 }),
  sentToIOName: varchar("sentToIOName", { length: 100 }),
  // ─ Operative / RS Author section ─
  savedAsWord: boolean("savedAsWord").default(false).notNull(),
  savedAsWordCIN: varchar("savedAsWordCIN", { length: 50 }),
  savedAsWordName: varchar("savedAsWordName", { length: 100 }),
  savedAsPdf: boolean("savedAsPdf").default(false).notNull(),
  savedAsPdfCIN: varchar("savedAsPdfCIN", { length: 50 }),
  savedAsPdfName: varchar("savedAsPdfName", { length: 100 }),
  uploadedToPromis: boolean("uploadedToPromis").default(false).notNull(),
  uploadedToPromisCIN: varchar("uploadedToPromisCIN", { length: 50 }),
  uploadedToPromisName: varchar("uploadedToPromisName", { length: 100 }),
  linked: boolean("linked").default(false).notNull(),
  linkedCIN: varchar("linkedCIN", { length: 50 }),
  linkedName: varchar("linkedName", { length: 100 }),
  savedInOpFolder: boolean("savedInOpFolder").default(false).notNull(),
  savedInOpFolderCIN: varchar("savedInOpFolderCIN", { length: 50 }),
  savedInOpFolderName: varchar("savedInOpFolderName", { length: 100 }),
  // ─ Imagery section ─
  imageryTaken: boolean("imageryTaken").default(false).notNull(),
  imageryTakenCIN: varchar("imageryTakenCIN", { length: 50 }),
  imageryTakenName: varchar("imageryTakenName", { length: 100 }),
  coverPage: boolean("coverPage").default(false).notNull(),
  coverPageCIN: varchar("coverPageCIN", { length: 50 }),
  coverPageName: varchar("coverPageName", { length: 100 }),
  sheetCell: varchar("sheetCell", { length: 255 }),
  // JSON array of imagery entries: [{name,cellTime,type,saved}]
  imageryEntries: text("imageryEntries"),
  // General notes
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GovernanceRecord = typeof governanceRecords.$inferSelect;
export type InsertGovernanceRecord = typeof governanceRecords.$inferInsert;

// ─── Sheet Summary ──────────────────────────────────────────────────────────
// A supervisor's brief overview of a running sheet's deployment — one row
// per sheet, auto-created (and prepopulated from the sheet/operation/target)
// the first time the Summary tab is opened, then freely editable.
export const sheetSummaries = mysqlTable("sheet_summaries", {
  id: int("id").autoincrement().primaryKey(),
  sheetId: int("sheetId").notNull().unique(),
  // Derived from CTO Roster team membership by CIN: "Team 1" / "Team 2" / "Blended".
  teamLabel: varchar("teamLabel", { length: 100 }),
  teamCins: text("teamCins"),
  operationName: varchar("operationName", { length: 255 }),
  dayDate: varchar("dayDate", { length: 64 }),
  startTime: varchar("startTime", { length: 32 }),
  finishTime: varchar("finishTime", { length: 32 }),
  targetName: text("targetName"),
  // Sourced from the RS row containing "surveillance commenced", not target.hbf.
  location: text("location"),
  // Vehicles shown on the tab are always computed live (Target Registry + RS
  // text mentions); this only tracks which computed entries were dismissed.
  dismissedVehicleKeys: text("dismissedVehicleKeys"),
  ioSupport: text("ioSupport"),
  intelSupport: text("intelSupport"),
  // JSON array of { key: string; detail: string } for the checked projects.
  specialProjects: text("specialProjects"),
  ioContactTiming: varchar("ioContactTiming", { length: 64 }),
  ioContactMethod: varchar("ioContactMethod", { length: 32 }),
  // JSON array of strings, one per objective line.
  objectives: text("objectives"),
  // JSON array of strings, one per critical-decision entry.
  criticalDecisions: text("criticalDecisions"),
  issues: text("issues"),
  lastEditedByCIN: varchar("lastEditedByCIN", { length: 64 }),
  // Set when the Team Leader (or Admin) ticks "Summary Complete" — locks the
  // summary the same way a closed running sheet locks its rows. Cleared on
  // reopen (see reopenedAt/reopenedByCIN below for who last reopened it).
  completedAt: bigint("completedAt", { mode: "number" }),
  completedByCIN: varchar("completedByCIN", { length: 64 }),
  reopenedAt: bigint("reopenedAt", { mode: "number" }),
  reopenedByCIN: varchar("reopenedByCIN", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SheetSummary = typeof sheetSummaries.$inferSelect;
export type InsertSheetSummary = typeof sheetSummaries.$inferInsert;

// One line per running-sheet row, auto-generated the first time that row is
// seen and then append-only synced: reopening the tab only adds lines for RS
// rows not yet represented here — it never regenerates or overwrites a line
// the supervisor has already edited or deleted. rowId is null for lines the
// supervisor added manually (the "+Add" button) rather than synced from a
// row — MySQL's unique index allows any number of NULLs, so several manual
// lines can coexist without colliding.
export const sheetSummaryEntries = mysqlTable(
  "sheet_summary_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    sheetId: int("sheetId").notNull(),
    rowId: int("rowId"),
    text: text("text").notNull(),
    deleted: boolean("deleted").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("sheet_summary_entries_row_idx").on(table.rowId)]
);

export type SheetSummaryEntry = typeof sheetSummaryEntries.$inferSelect;
export type InsertSheetSummaryEntry = typeof sheetSummaryEntries.$inferInsert;

// ─── WIPC Vault ───────────────────────────────────────────────────────────────
// All sensitive fields in these tables are AES-256-GCM encrypted at rest
// using the WIPC_VAULT_KEY environment secret. The raw values are NEVER stored
// in plaintext. Decryption only occurs server-side in authorised procedures.

/**
 * wipcOfficerProfiles — one saved profile per user (the requesting officer).
 * Stores the officer's details so they auto-fill on future WIPC requests.
 * All fields except userId are encrypted.
 */
export const wipcOfficerProfiles = mysqlTable("wipc_officer_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(), // FK → users.id
  // Encrypted fields (AES-256-GCM via wipcVault.ts)
  fullName: text("fullName").notNull(), // encrypted
  afpId: text("afpId").notNull(), // encrypted
  workLocation: text("workLocation"), // encrypted
  portfolio: text("portfolio"), // encrypted
  contactNumber: text("contactNumber"), // encrypted
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WipcOfficerProfile = typeof wipcOfficerProfiles.$inferSelect;
export type InsertWipcOfficerProfile = typeof wipcOfficerProfiles.$inferInsert;

/**
 * wipcMembers — the registry of members requiring WIPC.
 * Each record represents one person. All identity fields are encrypted.
 * CIN is stored encrypted to prevent CIN-to-identity linkage from raw DB access.
 */
export const wipcMembers = mysqlTable("wipc_members", {
  id: int("id").autoincrement().primaryKey(),
  createdBy: int("createdBy").notNull(), // FK → users.id (admin who created)
  // Encrypted identity fields (AES-256-GCM via wipcVault.ts)
  fullName: text("fullName").notNull(), // encrypted
  dob: text("dob"), // encrypted (DD/MM/YYYY)
  afpId: text("afpId").notNull(), // encrypted
  cinNumber: text("cinNumber"), // encrypted — CIN-to-identity link
  aiInitials: text("aiInitials"), // encrypted
  aiKnownAs: text("aiKnownAs"), // encrypted
  // Role flags (not sensitive, stored plaintext as booleans)
  isUco: boolean("isUco").default(false).notNull(),
  isOco: boolean("isOco").default(false).notNull(),
  isCin: boolean("isCin").default(true).notNull(),
  // Audit
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WipcMemberRecord = typeof wipcMembers.$inferSelect;
export type InsertWipcMemberRecord = typeof wipcMembers.$inferInsert;

/**
 * wipcAuditLog — immutable log of all access to WIPC vault data.
 * Records who accessed/modified what and when.
 */
export const wipcAuditLog = mysqlTable("wipc_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 64 }).notNull(), // e.g. READ_MEMBERS, SAVE_MEMBER, DELETE_MEMBER, SAVE_OFFICER, READ_OFFICER, GENERATE_WIPC, GENERATE_STAT_DEC
  targetId: int("targetId"), // wipcMembers.id or wipcOfficerProfiles.id if applicable
  detail: varchar("detail", { length: 512 }), // non-sensitive context (e.g. operation name)
  ipAddress: varchar("ipAddress", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WipcAuditEntry = typeof wipcAuditLog.$inferSelect;
export type InsertWipcAuditEntry = typeof wipcAuditLog.$inferInsert;

// ─── Custom Map Markers ─────────────────────────────────────────────────────
// User-placed markers on the intelligence map. Each marker has a position,
// an icon (type + colour), optional label/address, and optional links to
// an operation, target, persons, and vehicles.

export const customMapMarkers = mysqlTable("custom_map_markers", {
  id: int("id").autoincrement().primaryKey(),
  createdBy: int("createdBy").notNull(), // FK → users.id
  operationId: int("operationId"), // FK → operations.id (nullable)
  targetId: int("targetId"), // FK → targets.id (nullable)
  lat: double("lat").notNull(),
  lng: double("lng").notNull(),
  label: varchar("label", { length: 255 }), // user-typed name/business
  address: varchar("address", { length: 512 }), // reverse-geocoded or typed
  markerIcon: varchar("markerIcon", { length: 64 }).notNull(), // e.g. "house_filled"
  markerColour: varchar("markerColour", { length: 32 }).notNull(), // "red"|"yellow"|"blue"|"purple"
  note: text("note"), // observation note
  assocPersons: text("assocPersons"), // JSON array of person label strings
  assocVehicles: text("assocVehicles"), // JSON array of vehicle label strings
  rotation: int("rotation").default(0).notNull(), // degrees 0-359
  linkedIntelLabel: varchar("linkedIntelLabel", { length: 512 }), // manually merged intel pin label (null = no merge)
  deletedAt: bigint("deletedAt", { mode: "number" }), // soft-delete timestamp
  deletedByCIN: varchar("deletedByCIN", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustomMapMarker = typeof customMapMarkers.$inferSelect;
export type InsertCustomMapMarker = typeof customMapMarkers.$inferInsert;

// ─── User Locations ───────────────────────────────────────────────────────────
// Stores the last known GPS location for each user who has enabled location
// sharing. operationIds is a JSON array of operation IDs the user has selected
// — used for operation-scoped visibility filtering.

export const userLocations = mysqlTable(
  "user_locations",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(), // FK → users.id
    deviceId: varchar("deviceId", { length: 128 }).notNull(), // unique per browser/device
    lat: double("lat").notNull(),
    lng: double("lng").notNull(),
    speed: double("speed"), // m/s from GPS, null when unknown
    heading: double("heading"), // degrees 0-360, null when unknown
    accuracy: double("accuracy"), // metres
    operationIds: text("operationIds").notNull().default("[]"), // JSON array of op IDs
    sharingEnabled: boolean("sharingEnabled").default(false).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => ({
    userDeviceIdx: uniqueIndex("idx_user_device").on(
      table.userId,
      table.deviceId
    ),
  })
);

export type UserLocation = typeof userLocations.$inferSelect;
export type InsertUserLocation = typeof userLocations.$inferInsert;

// ─── Style Guide & Writing Rules ─────────────────────────────────────────────
// Stores the uploaded pro forma style guide (raw text only — no names/locations
// are retained) and the extracted writing rules used by the local checker engine.

export const styleGuides = mysqlTable("style_guides", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StyleGuide = typeof styleGuides.$inferSelect;
export type InsertStyleGuide = typeof styleGuides.$inferInsert;

export const styleRules = mysqlTable("style_rules", {
  id: int("id").autoincrement().primaryKey(),
  guideId: int("guideId").notNull(),
  ruleType: mysqlEnum("ruleType", [
    "abbreviation", // banned abbreviation → full word
    "phrase_required", // observation type must contain a required phrase
    "sentence_start", // observation must start with a specific pattern
    "article_missing", // missing article (the/a/an) before a noun
    "passive_voice", // passive voice pattern to flag
    "tense", // wrong tense pattern
    "punctuation", // missing punctuation (e.g. full stop at end)
    "capitalisation", // suburb/place name must be ALL CAPS
    "custom", // free-form custom rule
  ]).notNull(),
  // What to detect (regex pattern or plain text trigger)
  pattern: varchar("pattern", { length: 512 }).notNull(),
  // Human-readable description of the rule
  description: varchar("description", { length: 512 }).notNull(),
  // Suggested replacement or correction hint
  suggestion: varchar("suggestion", { length: 512 }),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StyleRule = typeof styleRules.$inferSelect;
export type InsertStyleRule = typeof styleRules.$inferInsert;

// ─── RS Map Waypoints ────────────────────────────────────────────────────────
// Persists per-waypoint overrides for the RS Mapping feature.
// One row per (sheetId, rowId) pair — stores any manual position adjustments
// and free-text comments added by the user in the RS Mapping popup.

export const rsMappingWaypoints = mysqlTable("rs_mapping_waypoints", {
  id: int("id").autoincrement().primaryKey(),
  sheetId: int("sheetId").notNull(), // FK → running_sheets.id
  rowId: int("rowId").notNull(), // FK → sheet_rows.id
  // Optional manual position override (set when user drags the waypoint)
  lat: double("lat"),
  lng: double("lng"),
  // Free-text comment added via the popup
  comment: text("comment"),
  // Marker appearance (set via the Edit dialog in the popup)
  markerIcon: varchar("markerIcon", { length: 40 }),
  markerColour: varchar("markerColour", { length: 20 }),
  markerRotation: int("markerRotation"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RsMappingWaypoint = typeof rsMappingWaypoints.$inferSelect;
export type InsertRsMappingWaypoint = typeof rsMappingWaypoints.$inferInsert;

// ─── User Sidebar Order ───────────────────────────────────────────────────────

export const userSidebarOrder = mysqlTable("user_sidebar_order", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  /** JSON array of nav item keys in user-defined order, e.g. ["operations","todo","governance",...] */
  orderedKeys: text("orderedKeys").notNull(),
  /** 'folder' (default) or 'tile' */
  homeScreenMode: varchar("homeScreenMode", { length: 16 })
    .default("folder")
    .notNull(),
  /** JSON array of 10 tile keys in display order (row1=[0,1], row2=[2,3,4,5], row3=[6,7,8,9]) */
  tileOrder: text("tileOrder"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserSidebarOrder = typeof userSidebarOrder.$inferSelect;

// ─── Operation Manager ────────────────────────────────────────────────────────

export const opManagerPriorityRows = mysqlTable("op_manager_priority_rows", {
  id: int("id").autoincrement().primaryKey(),
  weekStart: varchar("weekStart", { length: 10 }).notNull(), // ISO date string YYYY-MM-DD (Monday)
  category: varchar("category", { length: 64 }).notNull(), // e.g. "A-TACC", "WC"
  priority: int("priority").notNull(), // 1, 2, 3 ...
  operationId: int("operationId"), // FK to operations (nullable — may be free-text)
  operationName: varchar("operationName", { length: 255 }), // free-text fallback
  team: varchar("team", { length: 64 }),
  requestType: varchar("requestType", { length: 128 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OpManagerPriorityRow = typeof opManagerPriorityRows.$inferSelect;

export const opManagerTaskingCells = mysqlTable("op_manager_tasking_cells", {
  id: int("id").autoincrement().primaryKey(),
  weekStart: varchar("weekStart", { length: 10 }).notNull(),
  dayIndex: int("dayIndex").notNull(), // 0=Mon … 6=Sun
  teamRow: varchar("teamRow", { length: 64 }).notNull(), // "surv1" | "surv2" | "ptt" | "cap"
  shiftTime: varchar("shiftTime", { length: 32 }), // "RDO" | "0600-1400" | custom
  primaryTask: varchar("primaryTask", { length: 255 }),
  secondaryTask: varchar("secondaryTask", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OpManagerTaskingCell = typeof opManagerTaskingCells.$inferSelect;

export const opManagerSupervisorContacts = mysqlTable(
  "op_manager_supervisor_contacts",
  {
    id: int("id").autoincrement().primaryKey(),
    weekStart: varchar("weekStart", { length: 10 }).notNull(),
    role: varchar("role", { length: 128 }).notNull(), // e.g. "CTO", "Team 1 TL", "On Call Supervisor"
    userId: int("userId"), // FK to users (nullable)
    customName: varchar("customName", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);
export type OpManagerSupervisorContact =
  typeof opManagerSupervisorContacts.$inferSelect;

// ─── Op Manager Posted Weeks ─────────────────────────────────────────────────
export const opManagerPostedWeeks = mysqlTable("op_manager_posted_weeks", {
  id: int("id").autoincrement().primaryKey(),
  weekStart: varchar("weekStart", { length: 10 }).notNull().unique(), // ISO date YYYY-MM-DD (Monday)
  postedAt: timestamp("postedAt").defaultNow().notNull(),
  postedBy: int("postedBy").notNull(), // FK → users.id
});
export type OpManagerPostedWeek = typeof opManagerPostedWeeks.$inferSelect;

// ─── Push Subscriptions ───────────────────────────────────────────────────────
// In-app notification inbox. Deliberately not browser push (removed after
// proving unreliable — depends on OS permissions/per-device subscriptions,
// broken outright on iOS Safari unless installed as a home-screen PWA). Any
// module can write a row here for a recipient; the bell in DashboardLayout
// polls unread count and lists them, since every user already has to log
// into RunLog to do their job.
export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(), // FK → users.id (recipient)
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    url: varchar("url", { length: 255 }), // optional deep link
    sourceModule: varchar("sourceModule", { length: 64 }), // e.g. "opManager"
    // Opaque JSON state for notifications that coalesce repeated events into
    // one row instead of spamming a new one each time (e.g. CTO Roster shift
    // changes bump {count, startDate, endDate} here rather than creating a
    // fresh notification per edit) — see upsertRosterShiftNotification.
    meta: text("meta"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    readAt: timestamp("readAt"),
  },
  t => [
    index("notifications_userId_idx").on(t.userId),
    index("notifications_userId_readAt_idx").on(t.userId, t.readAt),
  ]
);
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// CTO Roster — ported from the standalone roster_app (same Manus platform
// template as RunLog itself). Every table is prefixed cto_roster_ to read as
// one feature group and avoid collisions with RunLog's own tables (e.g. its
// own auditLogs). The source app's own `users` table (a bare Manus-OAuth
// scaffold, no password) was dropped entirely — every roster member is
// already a real RunLog user, they just never logged into roster_app itself
// — so ctoRosterMembers links to RunLog's real users by CIN (RunLog's
// human-facing identity convention — see CLAUDE.md) instead of duplicating a
// name. Everything else ports close to as-is; these are plain per-roster
// domain tables with no platform-specific plumbing.
// ═══════════════════════════════════════════════════════════════════════════

// ─── CTO Roster: Teams & Members ─────────────────────────────────────────────
export const ctoRosterTeams = mysqlTable("cto_roster_teams", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  sortOrder: int("sortOrder").default(0).notNull(),
});
export type CtoRosterTeam = typeof ctoRosterTeams.$inferSelect;
export type InsertCtoRosterTeam = typeof ctoRosterTeams.$inferInsert;

export const ctoRosterMembers = mysqlTable(
  "cto_roster_members",
  {
    id: int("id").autoincrement().primaryKey(),
    // FK to users.cin, not users.id — matches how the rest of RunLog stamps
    // CIN (not a raw user id) on operational records, so roster history still
    // reads correctly even if a user's own name/profile changes later.
    cin: varchar("cin", { length: 64 }).notNull(),
    teamId: int("teamId").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    // When true, this member is excluded from ON DUTY / ON CALL headcount
    // totals (roster grid tally rows and the Outlook coverage view) — they
    // still appear on the grid with their own shifts, just don't count
    // toward team numbers. For members who are rostered for tracking
    // purposes but shouldn't inflate deployable headcount.
    excludedFromCounts: boolean("excludedFromCounts").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("cto_roster_members_teamId_idx").on(t.teamId),
    uniqueIndex("cto_roster_members_cin_idx").on(t.cin),
  ]
);
export type CtoRosterMember = typeof ctoRosterMembers.$inferSelect;
export type InsertCtoRosterMember = typeof ctoRosterMembers.$inferInsert;

// ─── CTO Roster: Secondments (temporary acting-team assignments) ────────────
// A time-bounded move to a second team (e.g. acting OIC for two weeks)
// layered on top of a member's substantive team — it does NOT touch
// ctoRosterMembers.teamId. While startDate <= today <= endDate (or the
// secondment is upcoming, i.e. endDate >= today), the member's name pill
// shows in BOTH teams: their shifts within [startDate, endDate] belong to
// destinationTeamId for display/counting purposes, everything outside that
// window stays with their substantive team. One secondment at a time per
// member — creating a new one while an active/upcoming one exists is
// rejected by the server rather than allowing overlaps. Auto-reverts
// purely by date (endDate < today), no scheduled job involved — see
// getRelevantCtoRosterSecondments in ctoRoster.ts.
export const ctoRosterSecondments = mysqlTable(
  "cto_roster_secondments",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("memberId").notNull(),
    destinationTeamId: int("destinationTeamId").notNull(),
    startDate: date("startDate", { mode: "string" }).notNull(),
    endDate: date("endDate", { mode: "string" }).notNull(),
    createdByCIN: varchar("createdByCIN", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("cto_roster_secondments_memberId_idx").on(t.memberId),
    index("cto_roster_secondments_endDate_idx").on(t.endDate),
  ]
);
export type CtoRosterSecondment = typeof ctoRosterSecondments.$inferSelect;
export type InsertCtoRosterSecondment =
  typeof ctoRosterSecondments.$inferInsert;

// ─── CTO Roster: Shifts ───────────────────────────────────────────────────────
// Valid shift codes: d, a, r, o, l, c, tt, dep, doc, adoc, ad, aoc
export const CTO_ROSTER_SHIFT_CODES = [
  "d",
  "a",
  "r",
  "o",
  "l",
  "c",
  "tt",
  "dep",
  "doc",
  "adoc",
  "ad",
  "aoc",
] as const;
export type CtoRosterShiftCode = (typeof CTO_ROSTER_SHIFT_CODES)[number];

export const ctoRosterShifts = mysqlTable(
  "cto_roster_shifts",
  {
    id: int("id").autoincrement().primaryKey(),
    memberId: int("memberId").notNull(),
    shiftDate: date("shiftDate", { mode: "string" }).notNull(),
    shiftCode: varchar("shiftCode", { length: 8 }).notNull(),
    /** Optional custom start time override, e.g. "07:00" */
    shiftTime: varchar("shiftTime", { length: 8 }),
    comment: text("comment"),
    isActing: boolean("isActing").default(false).notNull(),
    updatedBy: int("updatedBy"), // FK → users.id
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    uniqueIndex("cto_roster_shifts_member_date_idx").on(
      t.memberId,
      t.shiftDate
    ),
    index("cto_roster_shifts_date_idx").on(t.shiftDate),
  ]
);
export type CtoRosterShift = typeof ctoRosterShifts.$inferSelect;
export type InsertCtoRosterShift = typeof ctoRosterShifts.$inferInsert;

// ─── CTO Roster: Drafts (what-if planning, merges back into live roster) ────
export const ctoRosterDrafts = mysqlTable("cto_roster_drafts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  startDate: date("startDate", { mode: "string" }).notNull(),
  endDate: date("endDate", { mode: "string" }).notNull(),
  createdBy: int("createdBy"), // FK → users.id
  createdByName: varchar("createdByName", { length: 128 }),
  /** Snapshot of main-roster shift values at seed time (JSON) — used for conflict detection at merge */
  seedSnapshot: text("seedSnapshot"),
  /**
   * 'seeded'     — copied from live roster; Leave/Court locked; can be merged back
   * 'standalone' — blank slate; fully editable teams/members; cannot be merged; can be saved as a named roster
   */
  draftType: mysqlEnum("draftType", ["seeded", "standalone"])
    .default("seeded")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Auto-expires 14 days after creation */
  expiresAt: timestamp("expiresAt").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CtoRosterDraft = typeof ctoRosterDrafts.$inferSelect;
export type InsertCtoRosterDraft = typeof ctoRosterDrafts.$inferInsert;

/** Teams owned by a standalone draft (not linked to live teams) */
export const ctoRosterDraftTeams = mysqlTable(
  "cto_roster_draft_teams",
  {
    id: int("id").autoincrement().primaryKey(),
    draftId: int("draftId").notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
  },
  t => [index("cto_roster_draft_teams_draftId_idx").on(t.draftId)]
);
export type CtoRosterDraftTeam = typeof ctoRosterDraftTeams.$inferSelect;
export type InsertCtoRosterDraftTeam = typeof ctoRosterDraftTeams.$inferInsert;

/**
 * Members owned by a standalone draft (not linked to live members). Kept as
 * a free-text name, unlike ctoRosterMembers — a blank-slate "what if" draft
 * can plan around a hypothetical position that isn't a real CIN yet.
 */
export const ctoRosterDraftMembers = mysqlTable(
  "cto_roster_draft_members",
  {
    id: int("id").autoincrement().primaryKey(),
    draftId: int("draftId").notNull(),
    /** References cto_roster_draft_teams.id for standalone drafts */
    teamId: int("teamId").notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
  },
  t => [
    index("cto_roster_draft_members_draftId_idx").on(t.draftId),
    index("cto_roster_draft_members_teamId_idx").on(t.teamId),
  ]
);
export type CtoRosterDraftMember = typeof ctoRosterDraftMembers.$inferSelect;
export type InsertCtoRosterDraftMember =
  typeof ctoRosterDraftMembers.$inferInsert;

export const ctoRosterDraftShifts = mysqlTable(
  "cto_roster_draft_shifts",
  {
    id: int("id").autoincrement().primaryKey(),
    draftId: int("draftId").notNull(),
    memberId: int("memberId").notNull(),
    shiftDate: date("shiftDate", { mode: "string" }).notNull(),
    shiftCode: varchar("shiftCode", { length: 8 }).notNull(),
    shiftTime: varchar("shiftTime", { length: 8 }),
    comment: text("comment"),
    isActing: boolean("isActing").default(false).notNull(),
    updatedBy: int("updatedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    uniqueIndex("cto_roster_draft_shifts_draft_member_date_idx").on(
      t.draftId,
      t.memberId,
      t.shiftDate
    ),
    index("cto_roster_draft_shifts_draftId_idx").on(t.draftId),
    index("cto_roster_draft_shifts_date_idx").on(t.shiftDate),
  ]
);
export type CtoRosterDraftShift = typeof ctoRosterDraftShifts.$inferSelect;
export type InsertCtoRosterDraftShift =
  typeof ctoRosterDraftShifts.$inferInsert;

// ─── CTO Roster: Saved Rosters (named point-in-time archive/export) ─────────
export const ctoRosterSavedRosters = mysqlTable("cto_roster_saved_rosters", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  startDate: date("startDate", { mode: "string" }).notNull(),
  endDate: date("endDate", { mode: "string" }).notNull(),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CtoRosterSavedRoster = typeof ctoRosterSavedRosters.$inferSelect;
export type InsertCtoRosterSavedRoster =
  typeof ctoRosterSavedRosters.$inferInsert;

export const ctoRosterSavedRosterTeams = mysqlTable(
  "cto_roster_saved_roster_teams",
  {
    id: int("id").autoincrement().primaryKey(),
    savedRosterId: int("savedRosterId").notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
  },
  t => [index("cto_roster_saved_roster_teams_rosterId_idx").on(t.savedRosterId)]
);
export type CtoRosterSavedRosterTeam =
  typeof ctoRosterSavedRosterTeams.$inferSelect;
export type InsertCtoRosterSavedRosterTeam =
  typeof ctoRosterSavedRosterTeams.$inferInsert;

/** Frozen snapshot of a member's display name at save time — a saved roster is a point-in-time archive. */
export const ctoRosterSavedRosterMembers = mysqlTable(
  "cto_roster_saved_roster_members",
  {
    id: int("id").autoincrement().primaryKey(),
    savedRosterId: int("savedRosterId").notNull(),
    teamId: int("teamId").notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
  },
  t => [
    index("cto_roster_saved_roster_members_rosterId_idx").on(t.savedRosterId),
    index("cto_roster_saved_roster_members_teamId_idx").on(t.teamId),
  ]
);
export type CtoRosterSavedRosterMember =
  typeof ctoRosterSavedRosterMembers.$inferSelect;
export type InsertCtoRosterSavedRosterMember =
  typeof ctoRosterSavedRosterMembers.$inferInsert;

export const ctoRosterSavedRosterShifts = mysqlTable(
  "cto_roster_saved_roster_shifts",
  {
    id: int("id").autoincrement().primaryKey(),
    savedRosterId: int("savedRosterId").notNull(),
    memberId: int("memberId").notNull(),
    shiftDate: date("shiftDate", { mode: "string" }).notNull(),
    shiftCode: varchar("shiftCode", { length: 8 }).notNull(),
    shiftTime: varchar("shiftTime", { length: 8 }),
    comment: text("comment"),
    isActing: boolean("isActing").default(false).notNull(),
    updatedBy: int("updatedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    uniqueIndex("cto_roster_saved_roster_shifts_roster_member_date_idx").on(
      t.savedRosterId,
      t.memberId,
      t.shiftDate
    ),
    index("cto_roster_saved_roster_shifts_rosterId_idx").on(t.savedRosterId),
    index("cto_roster_saved_roster_shifts_date_idx").on(t.shiftDate),
  ]
);
export type CtoRosterSavedRosterShift =
  typeof ctoRosterSavedRosterShifts.$inferSelect;
export type InsertCtoRosterSavedRosterShift =
  typeof ctoRosterSavedRosterShifts.$inferInsert;

// ─── CTO Roster: Audit Log ────────────────────────────────────────────────────
// Kept separate from RunLog's own auditLogs table — roster audit rows carry
// shift-specific oldValue/newValue JSON diffs that don't fit that table's shape.
export const ctoRosterAuditLog = mysqlTable(
  "cto_roster_audit_log",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId"),
    userName: varchar("userName", { length: 128 }),
    /** upsert_shift | delete_shift | bulk_update | bulk_copy | add_member | delete_member | change_team | reorder | draft_merge | save_as_roster */
    action: varchar("action", { length: 64 }).notNull(),
    memberId: int("memberId"),
    memberName: varchar("memberName", { length: 128 }),
    shiftDate: varchar("shiftDate", { length: 16 }),
    oldValue: text("oldValue"),
    newValue: text("newValue"),
    detail: text("detail"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("cto_roster_audit_log_createdAt_idx").on(t.createdAt),
    index("cto_roster_audit_log_userId_idx").on(t.userId),
  ]
);
export type CtoRosterAuditLog = typeof ctoRosterAuditLog.$inferSelect;
export type InsertCtoRosterAuditLog = typeof ctoRosterAuditLog.$inferInsert;

// ─── CTO Roster: Outlook Settings (coverage minimums) ───────────────────────
export const ctoRosterOutlookSettings = mysqlTable(
  "cto_roster_outlook_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Minimum on-duty headcount per team (JSON: { "Team 1": 5, "Team 2": 5, "PTT": 2, "Capability": 1 }) */
    teamMinimums: text("teamMinimums").notNull(),
    onCallMin: int("onCallMin").default(5).notNull(),
    /** Combined minimum for BLENDED state (Team 1 + Team 2 combined) */
    combinedMin: int("combinedMin").default(5).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);
export type CtoRosterOutlookSettings =
  typeof ctoRosterOutlookSettings.$inferSelect;
export type InsertCtoRosterOutlookSettings =
  typeof ctoRosterOutlookSettings.$inferInsert;

// ─── CTO Roster: EBA Rules (EA compliance engine config) ────────────────────
export const ctoRosterEbaRules = mysqlTable("cto_roster_eba_rules", {
  id: int("id").autoincrement().primaryKey(),
  /** Short machine-readable key, e.g. "max_continuous_hours" */
  ruleKey: varchar("ruleKey", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  /** EA section reference, e.g. "s.33(11)" */
  eaReference: varchar("eaReference", { length: 64 }),
  thresholdValue: int("thresholdValue"),
  thresholdValue2: int("thresholdValue2"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CtoRosterEbaRule = typeof ctoRosterEbaRules.$inferSelect;
export type InsertCtoRosterEbaRule = typeof ctoRosterEbaRules.$inferInsert;
