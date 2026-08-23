/**
 * Read-only diagnostic for the vehicle depart→arrive continuity feature.
 * Finds every sheet_rows.observation that looks like a vehicle departure or
 * arrival, and reports exactly what the server-side matcher would compute
 * per operation — so we can see whether a "pending departure" is being
 * found without going through the browser at all.
 *
 * Usage: pnpm tsx scripts/dev/debug-pending-vehicle.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";

function isLocalHost(databaseUrl: string): boolean {
  try {
    const { hostname } = new URL(databaseUrl);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

const VEHICLE_DEPART_PATTERN =
  /Vehicle\s+([A-Za-z0-9]{5,8}),?\s*(.+?),\s*departed\b/i;
const VEHICLE_ARRIVE_PATTERN = /Vehicle\s+([A-Za-z0-9]{5,8})\b.*?\barrived\b/i;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    uri: databaseUrl,
    ...(isLocalHost(databaseUrl) ? {} : { ssl: { rejectUnauthorized: false } }),
  });

  try {
    const [rows] = await conn.query<any[]>(
      `SELECT sr.id AS rowId, sr.sheetId, rs.operationId, o.name AS opName,
              rs.deletedAt AS sheetDeletedAt, sr.observation
         FROM sheet_rows sr
         JOIN running_sheets rs ON rs.id = sr.sheetId
         JOIN operations o ON o.id = rs.operationId
        WHERE sr.observation LIKE '%Vehicle%'
          AND (sr.observation LIKE '%departed%' OR sr.observation LIKE '%arrived%')
        ORDER BY sr.id`
    );

    console.log(`\nFound ${rows.length} candidate row(s):\n`);

    const byOp = new Map<number, { name: string; last: Map<string, any>; arrived: Set<string> }>();

    for (const r of rows) {
      const tag = r.sheetDeletedAt ? " [SHEET DELETED]" : "";
      console.log(
        `row#${r.rowId} sheet#${r.sheetId} op#${r.operationId} "${r.opName}"${tag}`
      );
      console.log(`  text: ${r.observation}`);

      const dep = r.observation.match(VEHICLE_DEPART_PATTERN);
      const arr = r.observation.match(VEHICLE_ARRIVE_PATTERN);
      console.log(
        `  depart-match: ${dep ? `rego=${dep[1].toUpperCase()} occ="${dep[2].trim()}"` : "NO"}`
      );
      console.log(`  arrive-match: ${arr ? `rego=${arr[1].toUpperCase()}` : "NO"}`);
      console.log("");

      if (r.sheetDeletedAt) continue; // matches server behaviour: deleted sheets excluded
      if (!byOp.has(r.operationId))
        byOp.set(r.operationId, { name: r.opName, last: new Map(), arrived: new Set() });
      const bucket = byOp.get(r.operationId)!;
      if (dep) {
        const rego = dep[1].toUpperCase();
        bucket.last.set(rego, dep[2].trim());
        bucket.arrived.delete(rego);
      } else if (arr) {
        bucket.arrived.add(arr[1].toUpperCase());
      }
    }

    console.log("─── Computed pending departures per operation ───\n");
    for (const [opId, bucket] of byOp) {
      console.log(`Operation #${opId} "${bucket.name}":`);
      let any = false;
      for (const [rego, occ] of bucket.last) {
        if (bucket.arrived.has(rego)) continue;
        any = true;
        console.log(`  PENDING: ${rego} — "${occ}"`);
      }
      if (!any) console.log("  (none pending)");
      console.log("");
    }
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
