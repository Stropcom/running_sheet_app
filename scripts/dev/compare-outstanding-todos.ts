/**
 * Proves the rewritten Governance ranking (getOutstandingTodosByUser) gives
 * exactly the same answer as the original. Holds a verbatim copy of the
 * ORIGINAL implementation — it asks the database about each user in turn (their
 * rows, every sheet again, every one of their sheets' rows), which took 32 s
 * with 80 users and a year of data — and runs it beside the real function, then
 * compares the two results in full and prints how long each took.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3307/runlog_scale \
 *   pnpm tsx scripts/dev/compare-outstanding-todos.ts [--quick]
 *
 * Refuses to run unless the database name ends in "_scale", "_clean" or "_ci"
 * (throwaway databases). Exits 1 on any difference. `--quick` skips the slow
 * original and only times the new one. Delete this file once the new ranking
 * has proved itself in use.
 */
import "dotenv/config";
import type { CommandCode } from "@shared/commands";
import { users } from "../../drizzle/schema";
import { getDb } from "../../server/db/core";
import { teamNameMap, visitorTeamMap } from "../../server/db/accounts";
import { getGovernanceTodoForCin } from "../../server/db/governance";
import { getOutstandingSheetsForCin } from "../../server/db/operations";
import {
  getOutstandingTodosByUser,
  type OutstandingTodoUser,
} from "../../server/db/incompleteSheets";

export async function legacyOutstandingTodosByUser(
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

async function main() {
  const url = process.env.DATABASE_URL;
  const name = url ? new URL(url).pathname.replace(/^\//, "") : "";
  if (!/_(scale|clean|ci)$/.test(name))
    throw new Error(
      'DATABASE_URL must point at a throwaway database ending in "_scale", "_clean" or "_ci"'
    );
  const quick = process.argv.includes("--quick");

  let t = Date.now();
  const fresh = await getOutstandingTodosByUser(null);
  console.log(`new:      ${Date.now() - t} ms, ${fresh.length} people`);
  if (quick) return;

  t = Date.now();
  const old = await legacyOutstandingTodosByUser(null);
  console.log(`original: ${Date.now() - t} ms, ${old.length} people`);

  const a = JSON.stringify(old);
  const b = JSON.stringify(fresh);
  if (a !== b) {
    console.error("DIFFERENT");
    for (let i = 0; i < Math.max(old.length, fresh.length); i++)
      if (JSON.stringify(old[i]) !== JSON.stringify(fresh[i]))
        console.error(i, "original", old[i], "new", fresh[i]);
    process.exit(1);
  }
  const gov = fresh.filter(r => r.governanceCount > 0).length;
  const unc = fresh.filter(r => r.uncertifiedCount > 0).length;
  console.log(
    `IDENTICAL (${fresh.length} people; ${gov} with governance items, ${unc} with uncertified rows)`
  );
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
