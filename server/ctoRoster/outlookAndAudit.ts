// Part of the target queries (server/ctoRoster.ts): the Outlook settings and the roster audit log.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { and, eq, desc, count } from "drizzle-orm";
import { getDb } from "../db";
import {
  ctoRosterAuditLog,
  ctoRosterOutlookSettings,
  CtoRosterAuditLog,
} from "../../drizzle/schema";
import { rosterCommandForWrite } from "../rosterContext";
import { inCommand } from "./liveRoster";

// ── Outlook Settings (team coverage minimums) ───────────────────────────────────

const DEFAULT_OUTLOOK_SETTINGS: {
  teamMinimums: Record<string, number>;
  onCallMin: number;
  combinedMin: number;
} = {
  teamMinimums: { "Team 1": 5, "Team 2": 5 },
  onCallMin: 5,
  combinedMin: 5,
};

export async function getCtoRosterOutlookSettings() {
  const db = await getDb();
  if (!db) return DEFAULT_OUTLOOK_SETTINGS;
  const rows = await db
    .select()
    .from(ctoRosterOutlookSettings)
    .where(eq(ctoRosterOutlookSettings.command, rosterCommandForWrite()))
    .limit(1);
  if (rows.length === 0) return DEFAULT_OUTLOOK_SETTINGS;
  const row = rows[0];
  let teamMinimums: Record<string, number>;
  try {
    teamMinimums = JSON.parse(row.teamMinimums);
  } catch {
    teamMinimums = DEFAULT_OUTLOOK_SETTINGS.teamMinimums;
  }
  return {
    teamMinimums,
    onCallMin: row.onCallMin,
    combinedMin: row.combinedMin,
  };
}

export async function updateCtoRosterOutlookSettings(
  teamMinimums: Record<string, number>,
  onCallMin: number,
  combinedMin: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const command = rosterCommandForWrite();
  const rows = await db
    .select()
    .from(ctoRosterOutlookSettings)
    .where(eq(ctoRosterOutlookSettings.command, command))
    .limit(1);
  const teamMinimumsJson = JSON.stringify(teamMinimums);
  if (rows.length === 0) {
    await db.insert(ctoRosterOutlookSettings).values({
      command,
      teamMinimums: teamMinimumsJson,
      onCallMin,
      combinedMin,
    });
  } else {
    await db
      .update(ctoRosterOutlookSettings)
      .set({ teamMinimums: teamMinimumsJson, onCallMin, combinedMin })
      .where(eq(ctoRosterOutlookSettings.id, rows[0].id));
  }
}

// ── Audit Log ────────────────────────────────────────────────────────────────

export async function getCtoRosterAuditLog(
  limit: number,
  offset: number,
  userId?: number,
  action?: string
): Promise<{ entries: CtoRosterAuditLog[]; total: number }> {
  const db = await getDb();
  if (!db) return { entries: [], total: 0 };
  const conditions = [];
  const scoped = inCommand(ctoRosterAuditLog.command);
  if (scoped) conditions.push(scoped);
  if (userId) conditions.push(eq(ctoRosterAuditLog.userId, userId));
  if (action) conditions.push(eq(ctoRosterAuditLog.action, action));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [entries, [{ total }]] = await Promise.all([
    db
      .select()
      .from(ctoRosterAuditLog)
      .where(where)
      .orderBy(desc(ctoRosterAuditLog.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(ctoRosterAuditLog).where(where),
  ]);
  return { entries, total: Number(total) };
}
