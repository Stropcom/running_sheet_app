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
  governanceOutstandingItems,
} from "./governance";
import { teamNameMap, visitorTeamMap } from "./accounts";

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

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * How many rows of each live sheet are NOT signed off — one aggregate query
 * (indexed on row_members.rowId and certifications.rowId/memberId), never every
 * row, member and certification loaded into memory. A row is not signed off
 * when it has no real member, or any real member lacks an active certification
 * of their own (same rule as isRowSignedOff, governance.ts).
 */
async function unsignedRowCountsBySheet(db: Db): Promise<Map<number, number>> {
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
  return new Map<number, number>(
    unsignedCounts.map(r => [r.sheetId, Number(r.unsigned)])
  );
}

/** How many rows each live sheet has. */
async function rowCountsBySheet(db: Db): Promise<Map<number, number>> {
  const counts = await db
    .select({
      sheetId: sheetRows.sheetId,
      n: sql<number>`COUNT(*)`,
    })
    .from(sheetRows)
    .innerJoin(runningSheets, eq(runningSheets.id, sheetRows.sheetId))
    .where(isNull(runningSheets.deletedAt))
    .groupBy(sheetRows.sheetId);
  return new Map<number, number>(counts.map(r => [r.sheetId, Number(r.n)]));
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

  const unsignedBySheet = await unsignedRowCountsBySheet(db);

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

// A CIN is matched the way the database matches it (case and trailing spaces
// ignored), as the per-person lookups always were.
const cinKey = (cin: string) => cin.trim().toLowerCase();

/**
 * For each CIN, the number of distinct rows that CIN is a member of and has not
 * certified, on sheets (and operations) that still exist — the sum of
 * getOutstandingSheetsForCin's uncertifiedRowCount, for every CIN at once in
 * one query. A member is uncertified when they have no active certification of
 * their own on that row.
 */
async function uncertifiedRowCountsByCin(
  db: Db,
  cins: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (cins.length === 0) return out;
  const rows = await db
    .select({
      cin: rowMembers.memberName,
      n: sql<number>`COUNT(DISTINCT ${sheetRows.id})`,
    })
    .from(rowMembers)
    .innerJoin(sheetRows, eq(sheetRows.id, rowMembers.rowId))
    .innerJoin(runningSheets, eq(runningSheets.id, sheetRows.sheetId))
    .innerJoin(operations, eq(operations.id, runningSheets.operationId))
    .where(
      and(
        inArray(rowMembers.memberName, cins),
        notExists(
          db
            .select({ one: sql`1` })
            .from(certifications)
            .where(
              and(
                eq(certifications.rowId, rowMembers.rowId),
                eq(certifications.memberId, rowMembers.id),
                eq(certifications.isActive, true)
              )
            )
        )
      )
    )
    .groupBy(rowMembers.memberName);
  for (const r of rows) {
    const k = cinKey(r.cin);
    out.set(k, (out.get(k) ?? 0) + Number(r.n));
  }
  return out;
}

/**
 * For each CIN, how many governance items it owns as Team Leader / Author on
 * live sheets whose operation still exists (everything getGovernanceTodoForCin
 * lists except "Ready to close"), for every CIN at once: the sheets, their
 * governance records and the signed-off counts are each read once, and the
 * per-person rule is governanceOutstandingItems — the same one the to-do list
 * uses.
 */
async function governanceCountsByCin(
  db: Db,
  cins: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (cins.length === 0) return out;
  const wanted = new Set(cins);

  const sheets = await db
    .select({
      id: runningSheets.id,
      sheetCins: runningSheets.sheetCins,
      closedAt: runningSheets.closedAt,
    })
    .from(runningSheets)
    .innerJoin(operations, eq(operations.id, runningSheets.operationId))
    .where(isNull(runningSheets.deletedAt));
  if (sheets.length === 0) return out;

  const recs = await db
    .select({ rec: governanceRecords })
    .from(governanceRecords)
    .innerJoin(runningSheets, eq(runningSheets.id, governanceRecords.sheetId))
    .where(isNull(runningSheets.deletedAt));
  const recBySheet = new Map(recs.map(r => [r.rec.sheetId, r.rec]));
  const [unsigned, rowCounts] = await Promise.all([
    unsignedRowCountsBySheet(db),
    rowCountsBySheet(db),
  ]);

  for (const sheet of sheets) {
    let list: {
      cin: string;
      isTeamLeader?: boolean;
      isAuthor?: boolean;
    }[];
    try {
      list = JSON.parse(sheet.sheetCins ?? "[]");
    } catch {
      continue;
    }
    if (!Array.isArray(list)) continue;
    const seen = new Set<string>();
    for (const e of list) {
      const cin = e?.cin;
      if (typeof cin !== "string" || !wanted.has(cin) || seen.has(cin))
        continue;
      seen.add(cin);
      // On the to-do list a sheet counts for a CIN only if one of its entries
      // is a Team Leader or Author; the items then come from its first entry.
      if (!list.some(c => c.cin === cin && (c.isTeamLeader || c.isAuthor)))
        continue;
      const items = governanceOutstandingItems({
        entry: list.find(c => c.cin === cin),
        rec: recBySheet.get(sheet.id),
        allSigned:
          (rowCounts.get(sheet.id) ?? 0) > 0 &&
          (unsigned.get(sheet.id) ?? 0) === 0,
        closed: !!sheet.closedAt,
      });
      const n =
        (items.teamLeader ?? []).filter(o => o !== "Ready to close").length +
        (items.author ?? []).filter(o => o !== "Ready to close").length;
      if (n > 0) out.set(cin, (out.get(cin) ?? 0) + n);
    }
  }
  return out;
}

/**
 * Returns all users ranked by total outstanding to-do actions
 * (uncertified rows they are a member of + governance items they own as TL/Author).
 *
 * Worked out for everyone at once (a few queries, however many users there
 * are). It used to ask the database about each user in turn — every user's
 * rows, every sheet again, and every one of their sheets' rows — which took
 * 32 s with 80 users and a year of data and made the Governance folder the
 * slowest page; the answer is unchanged
 * (scripts/dev/compare-outstanding-todos.ts runs the old way beside this one).
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

  const cins = Array.from(new Set(usersWithCin.map(u => u.cin!)));
  const [uncertified, governance] = await Promise.all([
    uncertifiedRowCountsByCin(db, cins),
    governanceCountsByCin(db, cins),
  ]);

  const results: OutstandingTodoUser[] = [];
  for (const user of usersWithCin) {
    const cin = user.cin!;
    const uncertifiedCount = uncertified.get(cinKey(cin)) ?? 0;
    const governanceCount = governance.get(cin) ?? 0;
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
