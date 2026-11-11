import {
  and,
  eq,
  exists,
  inArray,
  isNull,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import type { CommandCode } from "@shared/commands";
import {
  certifications,
  governanceRecords,
  operations,
  rowMembers,
  runningSheets,
  sheetRows,
  users,
} from "../../drizzle/schema";
import { getDb } from "./core";
import {
  computeGovernancePercent,
  getGovernanceTodoForCin,
} from "./governance";
import { teamNameMap, visitorTeamMap } from "./accounts";
import { getOutstandingSheetsForCin } from "./operations";

export interface IncompleteSheetReport {
  sheetId: number;
  sheetTitle: string;
  operationId: number;
  operationName: string;
  operationStatus: string;
  /** Parsed sheetCins array */
  teamCins: {
    cin: string;
    isTeamLeader?: boolean;
    isAuthor?: boolean;
    isCertifier?: boolean;
  }[];
  /** Teams present on this sheet (derived from users table) */
  teams: string[];
  /** True when members span more than one distinct team */
  isTeamBlended: boolean;
  teamLeaderCin: string | null;
  authorCin: string | null;
  certifierCin: string | null;
  uncertifiedRowCount: number;
  govPercent: number;
  isClosed: boolean;
  createdAt: Date;
}

/**
 * The sheets the Reports page lists as incomplete, each with full status info
 * and team membership (from the users table, so the "Team Blended" logic can
 * be applied client-side). A non-deleted sheet is incomplete when it is not
 * closed, OR it has a row that is not signed off, OR its governance is under
 * 100%.
 *
 * Done in the database, not in memory: the unsigned-row count per sheet comes
 * from one aggregate query (indexed on row_members.rowId and
 * certifications.rowId/memberId), so only the sheets, their governance records
 * and a count per sheet are loaded — never every row, member and
 * certification ever recorded. The original loaded all of those into memory
 * and rescanned them for every sheet (30 s at one year of data, an error at
 * three); the answer is unchanged — scripts/dev/compare-incomplete-sheets.ts
 * proves it against a copy of the original. Row sign-off is the same rule as
 * isRowSignedOff (governance.ts): at least one real (non-"__SPACE__") member,
 * and every one of them has their OWN active certification.
 */
export async function getIncompleteRunningSheets(
  viewerCommand?: CommandCode | null
): Promise<IncompleteSheetReport[]> {
  const db = await getDb();
  if (!db) return [];

  const sheets = await db
    .select()
    .from(runningSheets)
    .where(isNull(runningSheets.deletedAt))
    .orderBy(runningSheets.id);
  if (sheets.length === 0) return [];

  // A row is NOT signed off when it has no real member, or any real member
  // lacks an active certification of their own. (BINARY: the comparison with
  // "__SPACE__" is exact, like the JavaScript rule, not case-insensitive.)
  const realMember = and(
    eq(rowMembers.rowId, sheetRows.id),
    sql`BINARY ${rowMembers.memberName} <> '__SPACE__'`
  );
  const unsignedCounts = await db
    .select({
      sheetId: sheetRows.sheetId,
      unsigned: sql<number>`COUNT(*)`,
    })
    .from(sheetRows)
    .innerJoin(runningSheets, eq(runningSheets.id, sheetRows.sheetId))
    .where(
      and(
        isNull(runningSheets.deletedAt),
        or(
          notExists(
            db
              .select({ one: sql`1` })
              .from(rowMembers)
              .where(realMember)
          ),
          exists(
            db
              .select({ one: sql`1` })
              .from(rowMembers)
              .where(
                and(
                  realMember,
                  notExists(
                    db
                      .select({ one: sql`1` })
                      .from(certifications)
                      .where(
                        and(
                          eq(certifications.rowId, sheetRows.id),
                          eq(certifications.memberId, rowMembers.id),
                          eq(certifications.isActive, true)
                        )
                      )
                  )
                )
              )
          )
        )
      )
    )
    .groupBy(sheetRows.sheetId);
  const unsignedBySheet = new Map<number, number>(
    unsignedCounts.map(r => [r.sheetId, Number(r.unsigned)])
  );

  // Governance records of the live sheets (a join, not a giant IN list).
  const govRows = await db
    .select({ rec: governanceRecords })
    .from(governanceRecords)
    .innerJoin(runningSheets, eq(runningSheets.id, governanceRecords.sheetId))
    .where(isNull(runningSheets.deletedAt));
  const govBySheet = new Map(govRows.map(r => [r.rec.sheetId, r.rec]));

  // Which sheets are incomplete — decided without parsing anything else.
  const incompleteSheets = sheets.filter(sheet => {
    const uncertifiedRowCount = unsignedBySheet.get(sheet.id) ?? 0;
    const allSigned = uncertifiedRowCount === 0;
    const govPercent = computeGovernancePercent(
      govBySheet.get(sheet.id) ?? null,
      allSigned
    );
    return !sheet.closedAt || uncertifiedRowCount > 0 || govPercent < 100;
  });
  if (incompleteSheets.length === 0) return [];

  const opIds = Array.from(new Set(incompleteSheets.map(s => s.operationId)));
  const [ops, allUsers] = await Promise.all([
    db.select().from(operations).where(inArray(operations.id, opIds)),
    db
      .select({ id: users.id, cin: users.cin, teamId: users.teamId })
      .from(users),
  ]);
  const opById = new Map(ops.map(o => [o.id, o]));

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

  const results: IncompleteSheetReport[] = [];
  for (const sheet of incompleteSheets) {
    const op = opById.get(sheet.operationId);
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

    const uncertifiedRowCount = unsignedBySheet.get(sheet.id) ?? 0;
    const govPercent = computeGovernancePercent(
      govBySheet.get(sheet.id) ?? null,
      uncertifiedRowCount === 0
    );

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
      isClosed: !!sheet.closedAt,
      createdAt: sheet.createdAt,
    });
  }

  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export interface OutstandingTodoUser {
  cin: string;
  name: string;
  team: string | null;
  uncertifiedCount: number;
  governanceCount: number;
  totalCount: number;
}

/**
 * Returns all users ranked by total outstanding to-do actions
 * (uncertified rows they are a member of + governance items they own as TL/Author).
 */
export async function getOutstandingTodosByUser(
  viewerCommand?: CommandCode | null
): Promise<OutstandingTodoUser[]> {
  const db = await getDb();
  if (!db) return [];

  const allUsers = await db.select().from(users);
  const usersWithCin = allUsers.filter(u => u.cin && u.cin.trim() !== "");
  const teamNames = await teamNameMap();
  const visitorTeams = await visitorTeamMap(viewerCommand);

  const results: OutstandingTodoUser[] = [];

  for (const user of usersWithCin) {
    const cin = user.cin!;

    // Uncertified rows for this CIN
    const outstanding = await getOutstandingSheetsForCin(cin);
    const uncertifiedCount = outstanding.reduce(
      (sum, s) => sum + s.uncertifiedRowCount,
      0
    );

    // Governance items for this CIN (TL + Author)
    const govTodo = await getGovernanceTodoForCin(cin);
    const governanceCount = govTodo.reduce(
      (sum, s) =>
        sum + s.outstanding.filter(o => o !== "Ready to close").length,
      0
    );

    const totalCount = uncertifiedCount + governanceCount;
    if (totalCount === 0) continue;

    results.push({
      cin,
      name: user.name,
      team:
        teamNames.get(visitorTeams.get(user.id) ?? user.teamId ?? -1) ?? null,
      uncertifiedCount,
      governanceCount,
      totalCount,
    });
  }

  return results.sort((a, b) => b.totalCount - a.totalCount);
}
