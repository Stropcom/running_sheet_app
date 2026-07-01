import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  bigint,
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
  role: mysqlEnum("role", ["observer", "member", "admin"]).default("observer").notNull(),
  // Legacy OAuth field — kept nullable so existing rows are not broken
  openId: varchar("openId", { length: 64 }),
  loginMethod: varchar("loginMethod", { length: 64 }).default("local"),
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
    "user_login",
    "user_logout",
    "user_created",
    "user_updated",
    "user_deleted",
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
  sentToIO: boolean("sentToIO").default(false).notNull(),
  // ─ Operative / RS Author section ─
  savedAsWord: boolean("savedAsWord").default(false).notNull(),
  savedAsPdf: boolean("savedAsPdf").default(false).notNull(),
  uploadedToPromis: boolean("uploadedToPromis").default(false).notNull(),
  linked: boolean("linked").default(false).notNull(),
  savedInOpFolder: boolean("savedInOpFolder").default(false).notNull(),
  // ─ Imagery section ─
  imageryTaken: boolean("imageryTaken").default(false).notNull(),
  coverPage: boolean("coverPage").default(false).notNull(),
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
