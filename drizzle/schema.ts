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
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["observer", "certifier", "admin"]).default("observer").notNull(),
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
  description: text("description"),
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
  description: text("description"),
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
  observation: text("observation"),
  isLocked: boolean("isLocked").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SheetRow = typeof sheetRows.$inferSelect;
export type InsertSheetRow = typeof sheetRows.$inferInsert;

// ─── Row Members ──────────────────────────────────────────────────────────────

export const rowMembers = mysqlTable("row_members", {
  id: int("id").autoincrement().primaryKey(),
  rowId: int("rowId").notNull(),
  memberName: varchar("memberName", { length: 255 }).notNull(),
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
  certifiedAt: bigint("certifiedAt", { mode: "number" }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
});

export type Certification = typeof certifications.$inferSelect;
export type InsertCertification = typeof certifications.$inferInsert;

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  sheetId: int("sheetId").notNull(),
  rowId: int("rowId"),
  memberId: int("memberId"),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
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
  ]).notNull(),
  details: text("details"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
