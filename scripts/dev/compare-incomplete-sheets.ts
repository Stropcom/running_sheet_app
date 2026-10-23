/**
 * Proves the rewritten Incomplete Sheets report gives exactly the same answer
 * as the original. Holds a verbatim copy of the ORIGINAL implementation
 * (loads every sheet, row, member and certification into memory — correct but
 * far too slow on years of data) and runs it side by side with the real
 * getIncompleteRunningSheets, then compares the two results in full.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3307/runlog_scale \
 *   pnpm tsx scripts/dev/compare-incomplete-sheets.ts
 *
 * Refuses to run unless the database name ends in "_scale". Exits 1 on any
 * difference. Delete this file once the new report has proved itself in use.
 */
import "dotenv/config";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { CommandCode } from "@shared/commands";
import {
  certifications,
  operations,
  rowMembers,
  runningSheets,
  sheetRows,
  users,
} from "../../drizzle/schema";
import { getDb } from "../../server/db/core";
import { teamNameMap, visitorTeamMap } from "../../server/db/accounts";
import {
  computeAllRowsSigned,
  computeGovernancePercent,
  getGovernanceRecordsBySheetIds,
  isRowSignedOff,
} from "../../server/db/governance";
import {
  getIncompleteRunningSheets,
  type IncompleteSheetReport,
} from "../../server/db/reports";

export async function legacyIncompleteRunningSheets(
  viewerCommand?: CommandCode | null
): Promise<IncompleteSheetReport[]> {
  const db = await getDb();
  if (!db) return [];

  // All non-deleted sheets
  const sheets = await db
    .select()
    .from(runningSheets)
    .where(isNull(runningSheets.deletedAt));

  if (sheets.length === 0) return [];

  const opIds = Array.from(new Set(sheets.map(s => s.operationId)));
  const sheetIds = sheets.map(s => s.id);

  const [ops, govRecords, allUsers] = await Promise.all([
    db.select().from(operations).where(inArray(operations.id, opIds)),
    getGovernanceRecordsBySheetIds(sheetIds),
    db.select().from(users),
  ]);

  // Build CIN → team name map from users table
  const teamNames = await teamNameMap();
  const cinTeamMap = new Map<string, string>();
  // A visitor hosted by the viewer's Command counts in that Command's team.
  const visitorTeams = await visitorTeamMap(viewerCommand);
  for (const u of allUsers) {
    const teamId = visitorTeams.get(u.id) ?? u.teamId;
    const name = teamId != null ? teamNames.get(teamId) : undefined;
    if (u.cin && name) cinTeamMap.set(u.cin, name);
  }

  // Compute certification status per sheet
  const allRowMembers =
    sheetIds.length > 0
      ? await db
          .select()
          .from(rowMembers)
          .where(
            inArray(
              rowMembers.rowId,
              (
                await db
                  .select({ id: sheetRows.id })
                  .from(sheetRows)
                  .where(inArray(sheetRows.sheetId, sheetIds))
              ).map(r => r.id)
            )
          )
      : [];

  const allRows =
    sheetIds.length > 0
      ? await db
          .select()
          .from(sheetRows)
          .where(inArray(sheetRows.sheetId, sheetIds))
      : [];

  const allRowIds = allRows.map(r => r.id);
  const allCerts =
    allRowIds.length > 0
      ? await db
          .select()
          .from(certifications)
          .where(
            and(
              inArray(certifications.rowId, allRowIds),
              eq(certifications.isActive, true)
            )
          )
      : [];

  const results: IncompleteSheetReport[] = [];

  for (const sheet of sheets) {
    const op = ops.find(o => o.id === sheet.operationId);
    if (!op) continue;

    // Parse sheetCins
    let teamCins: {
      cin: string;
      isTeamLeader?: boolean;
      isAuthor?: boolean;
      isCertifier?: boolean;
    }[] = [];
    try {
      teamCins = JSON.parse(sheet.sheetCins ?? "[]");
    } catch {
      teamCins = [];
    }

    const teamLeaderCin = teamCins.find(c => c.isTeamLeader)?.cin ?? null;
    const authorCin = teamCins.find(c => c.isAuthor)?.cin ?? null;
    // Certifier: first CIN that is neither TL nor Author (or TL if no one else)
    const certifierCin =
      teamCins.find(c => !c.isTeamLeader && !c.isAuthor)?.cin ?? teamLeaderCin;

    // Derive teams present on this sheet
    const teamsOnSheet = Array.from(
      new Set(
        teamCins.map(c => cinTeamMap.get(c.cin)).filter((t): t is string => !!t)
      )
    );
    const isTeamBlended = teamsOnSheet.length > 1;

    // Compute uncertified row count
    const sheetRowObjs = allRows.filter(r => r.sheetId === sheet.id);
    const sheetRowIds = sheetRowObjs.map(r => r.id);
    const sheetMembers = allRowMembers.filter(m =>
      sheetRowIds.includes(m.rowId)
    );
    const sheetCerts = allCerts.filter(c => sheetRowIds.includes(c.rowId));
    const uncertifiedRowCount = sheetRowObjs.filter(
      row => !isRowSignedOff(row, sheetMembers, sheetCerts)
    ).length;

    // Per row, not flattened across the whole sheet -- a row with no CIN
    // contributed nothing to a flat "every member" check, so it was
    // silently treated as fine instead of blocking (same bug as the
    // sheet.close mutation and the client Governance page's own
    // allSigned). See computeAllRowsSigned's own comment for the shared
    // fix.
    const allSigned =
      sheetRowObjs.length === 0 ||
      computeAllRowsSigned(sheetRowObjs, sheetMembers, sheetCerts);

    // Governance percent
    const govRec = govRecords.find(g => g.sheetId === sheet.id) ?? null;
    const govPercent = computeGovernancePercent(govRec, allSigned);

    const isClosed = !!sheet.closedAt;

    // Only include sheets that are incomplete (not closed OR governance < 100 OR uncertified rows)
    const isIncomplete =
      !isClosed || uncertifiedRowCount > 0 || govPercent < 100;
    if (!isIncomplete) continue;

    results.push({
      sheetId: sheet.id,
      sheetTitle: sheet.title,
      operationId: op.id,
      operationName: op.name,
      operationStatus: op.status,
      teamCins,
      teams: teamsOnSheet,
      isTeamBlended,
      teamLeaderCin,
      authorCin,
      certifierCin,
      uncertifiedRowCount,
      govPercent,
      isClosed,
      createdAt: sheet.createdAt,
    });
  }

  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/_scale$/.test(new URL(url).pathname.replace(/^\//, "")))
    throw new Error('DATABASE_URL must point at a database ending in "_scale"');
  for (const command of [undefined, "WESTERN"] as (CommandCode | undefined)[]) {
    const t0 = Date.now();
    const oldResult = await legacyIncompleteRunningSheets(command);
    const t1 = Date.now();
    const newResult = await getIncompleteRunningSheets(command);
    const t2 = Date.now();
    const same = JSON.stringify(oldResult) === JSON.stringify(newResult);
    console.log(
      `viewer ${command ?? "(all)"}: old ${oldResult.length} sheets in ${t1 - t0} ms, new ${newResult.length} sheets in ${t2 - t1} ms — ${same ? "IDENTICAL" : "DIFFERENT"}`
    );
    if (!same) {
      const a = new Map(oldResult.map(r => [r.sheetId, JSON.stringify(r)]));
      const b = new Map(newResult.map(r => [r.sheetId, JSON.stringify(r)]));
      for (const [id, v] of a)
        if (b.get(id) !== v)
          console.log(
            "old only / changed:",
            id,
            v.slice(0, 200),
            "| new:",
            (b.get(id) ?? "").slice(0, 200)
          );
      for (const [id, v] of b)
        if (!a.has(id)) console.log("new only:", id, v.slice(0, 200));
      process.exit(1);
    }
  }
  process.exit(0);
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
