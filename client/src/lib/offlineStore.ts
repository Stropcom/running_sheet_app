/**
 * offlineStore.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * IndexedDB-backed offline draft store for RunLog.
 *
 * Stores draft operations, targets, running sheets, rows, and row members
 * locally when the device is offline.  A separate "sync queue" records every
 * pending mutation so they can be replayed in order once connectivity returns.
 *
 * DB name : runlog-offline
 * Version : 1
 *
 * Object stores
 * ─────────────
 *  draftOperations  – draft ops keyed by a local UUID
 *  draftTargets     – draft targets keyed by a local UUID
 *  draftSheets      – draft running sheets keyed by a local UUID
 *  draftRows        – draft rows keyed by a local UUID
 *  syncQueue        – ordered list of pending mutations to replay
 */

import { openDB, type IDBPDatabase } from "idb";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DraftOperation {
  localId: string;          // UUID assigned offline
  serverId?: number;        // filled after successful sync
  name: string;
  promisNumber?: string;
  imsNumber?: string;
  investigationUnit?: string;
  createdAt: number;        // ms timestamp
  synced: boolean;
}

export interface DraftTarget {
  localId: string;
  serverId?: number;
  operationLocalId?: string;   // if operation was also created offline
  operationServerId?: number;  // if operation already exists on server
  name: string;
  dateOfBirth?: string;
  createdAt: number;
  synced: boolean;
}

export interface DraftSheet {
  localId: string;
  serverId?: number;
  operationLocalId?: string;
  operationServerId?: number;
  targetLocalId?: string;
  targetServerId?: number;
  title: string;
  sheetCins: Array<{ cin: string; hasImages: boolean; isTeamLeader?: boolean; isAuthor?: boolean }>;
  createdAt: number;
  synced: boolean;
}

export interface DraftRow {
  localId: string;
  serverId?: number;
  sheetLocalId?: string;
  sheetServerId?: number;
  rowNumber: number;
  time?: string;
  observation?: string;
  members: string[];   // CIN strings
  createdAt: number;
  synced: boolean;
}

export type SyncAction =
  | { type: "createOperation";  localId: string; payload: Omit<DraftOperation, "localId" | "serverId" | "synced"> }
  | { type: "createTarget";     localId: string; payload: Omit<DraftTarget,    "localId" | "serverId" | "synced"> }
  | { type: "createSheet";      localId: string; payload: Omit<DraftSheet,     "localId" | "serverId" | "synced"> }
  | { type: "createRow";        localId: string; payload: Omit<DraftRow,       "localId" | "serverId" | "synced"> }
  | { type: "updateRow";        localId: string; payload: { time?: string; observation?: string } }
  | { type: "deleteRow";        localId: string };

export interface SyncQueueEntry {
  id?: number;           // auto-increment key
  action: SyncAction;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

// ── DB singleton ───────────────────────────────────────────────────────────────

type RunLogDB = IDBPDatabase<{
  draftOperations: { key: string; value: DraftOperation };
  draftTargets:    { key: string; value: DraftTarget };
  draftSheets:     { key: string; value: DraftSheet };
  draftRows:       { key: string; value: DraftRow };
  syncQueue:       { key: number; value: SyncQueueEntry };
}>;

let _db: RunLogDB | null = null;

async function getDB(): Promise<RunLogDB> {
  if (_db) return _db;
  _db = await openDB("runlog-offline", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("draftOperations")) {
        db.createObjectStore("draftOperations", { keyPath: "localId" });
      }
      if (!db.objectStoreNames.contains("draftTargets")) {
        db.createObjectStore("draftTargets", { keyPath: "localId" });
      }
      if (!db.objectStoreNames.contains("draftSheets")) {
        db.createObjectStore("draftSheets", { keyPath: "localId" });
      }
      if (!db.objectStoreNames.contains("draftRows")) {
        db.createObjectStore("draftRows", { keyPath: "localId" });
      }
      if (!db.objectStoreNames.contains("syncQueue")) {
        db.createObjectStore("syncQueue", { keyPath: "id", autoIncrement: true });
      }
    },
  }) as RunLogDB;
  return _db;
}

// ── Utility ────────────────────────────────────────────────────────────────────

export function generateLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Draft Operations ───────────────────────────────────────────────────────────

export async function saveDraftOperation(op: DraftOperation): Promise<void> {
  const db = await getDB();
  await db.put("draftOperations", op);
}

export async function getDraftOperations(): Promise<DraftOperation[]> {
  const db = await getDB();
  return db.getAll("draftOperations");
}

export async function getDraftOperation(localId: string): Promise<DraftOperation | undefined> {
  const db = await getDB();
  return db.get("draftOperations", localId);
}

export async function updateDraftOperation(localId: string, updates: Partial<DraftOperation>): Promise<void> {
  const db = await getDB();
  const existing = await db.get("draftOperations", localId);
  if (existing) await db.put("draftOperations", { ...existing, ...updates });
}

export async function deleteDraftOperation(localId: string): Promise<void> {
  const db = await getDB();
  await db.delete("draftOperations", localId);
}

// ── Draft Targets ──────────────────────────────────────────────────────────────

export async function saveDraftTarget(target: DraftTarget): Promise<void> {
  const db = await getDB();
  await db.put("draftTargets", target);
}

export async function getDraftTargets(): Promise<DraftTarget[]> {
  const db = await getDB();
  return db.getAll("draftTargets");
}

export async function getDraftTarget(localId: string): Promise<DraftTarget | undefined> {
  const db = await getDB();
  return db.get("draftTargets", localId);
}

export async function updateDraftTarget(localId: string, updates: Partial<DraftTarget>): Promise<void> {
  const db = await getDB();
  const existing = await db.get("draftTargets", localId);
  if (existing) await db.put("draftTargets", { ...existing, ...updates });
}

export async function deleteDraftTarget(localId: string): Promise<void> {
  const db = await getDB();
  await db.delete("draftTargets", localId);
}

// ── Draft Sheets ───────────────────────────────────────────────────────────────

export async function saveDraftSheet(sheet: DraftSheet): Promise<void> {
  const db = await getDB();
  await db.put("draftSheets", sheet);
}

export async function getDraftSheets(): Promise<DraftSheet[]> {
  const db = await getDB();
  return db.getAll("draftSheets");
}

export async function getDraftSheet(localId: string): Promise<DraftSheet | undefined> {
  const db = await getDB();
  return db.get("draftSheets", localId);
}

export async function updateDraftSheet(localId: string, updates: Partial<DraftSheet>): Promise<void> {
  const db = await getDB();
  const existing = await db.get("draftSheets", localId);
  if (existing) await db.put("draftSheets", { ...existing, ...updates });
}

export async function deleteDraftSheet(localId: string): Promise<void> {
  const db = await getDB();
  await db.delete("draftSheets", localId);
}

// ── Draft Rows ─────────────────────────────────────────────────────────────────

export async function saveDraftRow(row: DraftRow): Promise<void> {
  const db = await getDB();
  await db.put("draftRows", row);
}

export async function getDraftRows(): Promise<DraftRow[]> {
  const db = await getDB();
  return db.getAll("draftRows");
}

export async function getDraftRowsForSheet(sheetLocalId: string): Promise<DraftRow[]> {
  const db = await getDB();
  const all = await db.getAll("draftRows");
  return all.filter((r) => r.sheetLocalId === sheetLocalId).sort((a, b) => a.rowNumber - b.rowNumber);
}

export async function getDraftRow(localId: string): Promise<DraftRow | undefined> {
  const db = await getDB();
  return db.get("draftRows", localId);
}

export async function updateDraftRow(localId: string, updates: Partial<DraftRow>): Promise<void> {
  const db = await getDB();
  const existing = await db.get("draftRows", localId);
  if (existing) await db.put("draftRows", { ...existing, ...updates });
}

export async function deleteDraftRow(localId: string): Promise<void> {
  const db = await getDB();
  await db.delete("draftRows", localId);
}

// ── Sync Queue ─────────────────────────────────────────────────────────────────

export async function enqueueSyncAction(action: SyncAction): Promise<void> {
  const db = await getDB();
  const entry: SyncQueueEntry = { action, createdAt: Date.now(), attempts: 0 };
  await db.add("syncQueue", entry);
}

export async function getSyncQueue(): Promise<SyncQueueEntry[]> {
  const db = await getDB();
  return db.getAll("syncQueue");
}

export async function removeSyncQueueEntry(id: number): Promise<void> {
  const db = await getDB();
  await db.delete("syncQueue", id);
}

export async function updateSyncQueueEntry(id: number, updates: Partial<SyncQueueEntry>): Promise<void> {
  const db = await getDB();
  const existing = await db.get("syncQueue", id);
  if (existing) await db.put("syncQueue", { ...existing, ...updates });
}

export async function getSyncQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count("syncQueue");
}

// ── Aggregate counts ───────────────────────────────────────────────────────────

export async function getDraftCounts(): Promise<{
  operations: number;
  targets: number;
  sheets: number;
  rows: number;
  total: number;
}> {
  const db = await getDB();
  const [ops, targets, sheets, rows] = await Promise.all([
    db.count("draftOperations"),
    db.count("draftTargets"),
    db.count("draftSheets"),
    db.count("draftRows"),
  ]);
  return { operations: ops, targets, sheets, rows, total: ops + targets + sheets + rows };
}

/**
 * Remove only drafts that have been successfully synced (synced: true).
 * Called after a successful sync to clean up the local store.
 */
export async function clearSyncedDrafts(): Promise<void> {
  const db = await getDB();
  const [ops, targets, sheets, rows] = await Promise.all([
    db.getAll("draftOperations"),
    db.getAll("draftTargets"),
    db.getAll("draftSheets"),
    db.getAll("draftRows"),
  ]);
  await Promise.all([
    ...ops.filter((o) => o.synced).map((o) => db.delete("draftOperations", o.localId)),
    ...targets.filter((t) => t.synced).map((t) => db.delete("draftTargets", t.localId)),
    ...sheets.filter((s) => s.synced).map((s) => db.delete("draftSheets", s.localId)),
    ...rows.filter((r) => r.synced).map((r) => db.delete("draftRows", r.localId)),
  ]);
}

export async function clearAllDrafts(): Promise<void> {
  const db = await getDB();
  await Promise.all([
    db.clear("draftOperations"),
    db.clear("draftTargets"),
    db.clear("draftSheets"),
    db.clear("draftRows"),
    db.clear("syncQueue"),
  ]);
}
