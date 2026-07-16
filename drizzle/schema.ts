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
  role: mysqlEnum("role", ["observer", "member", "admin"]).default("observer").notNull(),
  // Legacy OAuth field — kept nullable so existing rows are not broken
  openId: varchar("openId", { length: 64 }),
  loginMethod: varchar("loginMethod", { length: 64 }).default("local"),
  // Forces a password change on next login (e.g. admin-issued temporary
  // password). Enforced server-side in _core/trpc.ts, not just client UI.
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
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
  status: mysqlEnum("status", ["active", "before_court", "archive"]).default("active").notNull(),
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

// ─── Targets ────────────────────────────────────────────────────────────────
// One row per target in the global registry. Targets are independent of
// operations — they are linked via the operation_target_links join table.
// operationId is kept nullable for backward-compat with legacy rows.

export const targets = mysqlTable("targets", {
  id: int("id").autoincrement().primaryKey(),
  operationId: int("operationId"),  // nullable — legacy field, use join table instead
  name: varchar("name", { length: 255 }).notNull(), // e.g. "Target 1" or a codename
  tgt: text("tgt"),   // Target (person) details
  hbf: text("hbf"),   // Home Address Full
  hb:  text("hb"),    // Home Base (short)
  v1f: text("v1f"),   // Vehicle 1 Full description
  v1:  text("v1"),    // Vehicle 1 (short)
  v2f: text("v2f"),   // Vehicle 2 Full description
  v2:  text("v2"),    // Vehicle 2 (short)
  dep: text("dep"),   // Depart address/location
  arr: text("arr"),   // Arrive address/location
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  // Soft-delete
  deletedAt: bigint("deletedAt", { mode: "number" }),
  deletedByCIN: varchar("deletedByCIN", { length: 64 }),
});

export type Target = typeof targets.$inferSelect;
export type InsertTarget = typeof targets.$inferInsert;

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
export type InsertOperationTargetLink = typeof operationTargetLinks.$inferInsert;

// ─── Observation Shortcuts ──────────────────────────────────────────────────
// Global list of text shortcuts for the observation field.
// When a user types the trigger word followed by a space, it auto-expands.

export const shortcuts = mysqlTable("shortcuts", {
  id: int("id").autoincrement().primaryKey(),
  trigger: varchar("trigger", { length: 64 }).notNull().unique(), // e.g. "sc"
  expansion: text("expansion").notNull(),                         // e.g. "Surveillance commenced in the vicinity of"
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
export type InsertSubObservationMember = typeof subObservationMembers.$inferInsert;

// ─── Sub-Observation Certifications ───────────────────────────────────────────
// Each CIN on a sub-observation can be certified independently.

export const subObservationCertifications = mysqlTable("sub_observation_certifications", {
  id: int("id").autoincrement().primaryKey(),
  subObsId: int("subObsId").notNull(),
  memberId: int("memberId").notNull(), // references sub_observation_members.id
  certifiedByUserId: int("certifiedByUserId").notNull(),
  certifiedByName: varchar("certifiedByName", { length: 255 }).notNull(),
  certifiedByCIN: varchar("certifiedByCIN", { length: 64 }).notNull(),
  certifiedAt: bigint("certifiedAt", { mode: "number" }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
});

export type SubObservationCertification = typeof subObservationCertifications.$inferSelect;
export type InsertSubObservationCertification = typeof subObservationCertifications.$inferInsert;

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
  fullName: text("fullName").notNull(),       // encrypted
  afpId: text("afpId").notNull(),             // encrypted
  workLocation: text("workLocation"),         // encrypted
  portfolio: text("portfolio"),               // encrypted
  contactNumber: text("contactNumber"),       // encrypted
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
  fullName: text("fullName").notNull(),   // encrypted
  dob: text("dob"),                       // encrypted (DD/MM/YYYY)
  afpId: text("afpId").notNull(),         // encrypted
  cinNumber: text("cinNumber"),           // encrypted — CIN-to-identity link
  aiInitials: text("aiInitials"),         // encrypted
  aiKnownAs: text("aiKnownAs"),           // encrypted
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
  targetId: int("targetId"),   // wipcMembers.id or wipcOfficerProfiles.id if applicable
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
  createdBy: int("createdBy").notNull(),          // FK → users.id
  operationId: int("operationId"),                // FK → operations.id (nullable)
  targetId: int("targetId"),                      // FK → targets.id (nullable)
  lat: double("lat").notNull(),
  lng: double("lng").notNull(),
  label: varchar("label", { length: 255 }),       // user-typed name/business
  address: varchar("address", { length: 512 }),   // reverse-geocoded or typed
  markerIcon: varchar("markerIcon", { length: 64 }).notNull(),  // e.g. "house_filled"
  markerColour: varchar("markerColour", { length: 32 }).notNull(), // "red"|"yellow"|"blue"|"purple"
  note: text("note"),                             // observation note
  assocPersons: text("assocPersons"),             // JSON array of person label strings
  assocVehicles: text("assocVehicles"),           // JSON array of vehicle label strings
  rotation: int("rotation").default(0).notNull(), // degrees 0-359
  linkedIntelLabel: varchar("linkedIntelLabel", { length: 512 }), // manually merged intel pin label (null = no merge)
  deletedAt: bigint("deletedAt", { mode: "number" }),  // soft-delete timestamp
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

export const userLocations = mysqlTable("user_locations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),          // FK → users.id
  deviceId: varchar("deviceId", { length: 128 }).notNull(), // unique per browser/device
  lat: double("lat").notNull(),
  lng: double("lng").notNull(),
  speed: double("speed"),                   // m/s from GPS, null when unknown
  heading: double("heading"),               // degrees 0-360, null when unknown
  accuracy: double("accuracy"),             // metres
  operationIds: text("operationIds").notNull().default("[]"), // JSON array of op IDs
  sharingEnabled: boolean("sharingEnabled").default(false).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  userDeviceIdx: uniqueIndex("idx_user_device").on(table.userId, table.deviceId),
}));

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
    "abbreviation",      // banned abbreviation → full word
    "phrase_required",   // observation type must contain a required phrase
    "sentence_start",    // observation must start with a specific pattern
    "article_missing",   // missing article (the/a/an) before a noun
    "passive_voice",     // passive voice pattern to flag
    "tense",             // wrong tense pattern
    "punctuation",       // missing punctuation (e.g. full stop at end)
    "capitalisation",    // suburb/place name must be ALL CAPS
    "custom",            // free-form custom rule
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
  sheetId: int("sheetId").notNull(),       // FK → running_sheets.id
  rowId: int("rowId").notNull(),           // FK → sheet_rows.id
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
  homeScreenMode: varchar("homeScreenMode", { length: 16 }).default("folder").notNull(),
  /** JSON array of 10 tile keys in display order (row1=[0,1], row2=[2,3,4,5], row3=[6,7,8,9]) */
  tileOrder: text("tileOrder"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserSidebarOrder = typeof userSidebarOrder.$inferSelect;

// ─── Operation Manager ────────────────────────────────────────────────────────

export const opManagerPriorityRows = mysqlTable("op_manager_priority_rows", {
  id: int("id").autoincrement().primaryKey(),
  weekStart: varchar("weekStart", { length: 10 }).notNull(), // ISO date string YYYY-MM-DD (Monday)
  category: varchar("category", { length: 64 }).notNull(),   // e.g. "A-TACC", "WC"
  priority: int("priority").notNull(),                        // 1, 2, 3 ...
  operationId: int("operationId"),                            // FK to operations (nullable — may be free-text)
  operationName: varchar("operationName", { length: 255 }),   // free-text fallback
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
  dayIndex: int("dayIndex").notNull(),   // 0=Mon … 6=Sun
  teamRow: varchar("teamRow", { length: 64 }).notNull(), // "surv1" | "surv2" | "ptt" | "cap"
  shiftTime: varchar("shiftTime", { length: 32 }),       // "RDO" | "0600-1400" | custom
  primaryTask: varchar("primaryTask", { length: 255 }),
  secondaryTask: varchar("secondaryTask", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OpManagerTaskingCell = typeof opManagerTaskingCells.$inferSelect;

export const opManagerSupervisorContacts = mysqlTable("op_manager_supervisor_contacts", {
  id: int("id").autoincrement().primaryKey(),
  weekStart: varchar("weekStart", { length: 10 }).notNull(),
  role: varchar("role", { length: 128 }).notNull(), // e.g. "CTO", "Team 1 TL", "On Call Supervisor"
  userId: int("userId"),                             // FK to users (nullable)
  customName: varchar("customName", { length: 255 }),
  phone: varchar("phone", { length: 32 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OpManagerSupervisorContact = typeof opManagerSupervisorContacts.$inferSelect;

// ─── Op Manager Posted Weeks ─────────────────────────────────────────────────
export const opManagerPostedWeeks = mysqlTable("op_manager_posted_weeks", {
  id: int("id").autoincrement().primaryKey(),
  weekStart: varchar("weekStart", { length: 10 }).notNull().unique(), // ISO date YYYY-MM-DD (Monday)
  postedAt: timestamp("postedAt").defaultNow().notNull(),
  postedBy: int("postedBy").notNull(), // FK → users.id
});
export type OpManagerPostedWeek = typeof opManagerPostedWeeks.$inferSelect;

// ─── Push Subscriptions ───────────────────────────────────────────────────────
export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // FK → users.id
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
