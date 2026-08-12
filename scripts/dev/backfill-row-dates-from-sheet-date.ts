/**
 * Backfill for sheet_rows.rowDate left null (or malformed) on sheets that
 * already have a picker-set sheetDate. Before the date-picker landed on the
 * create-sheet flow, and until the row.create/resolveRowDate fixes in this
 * same change, a row with no explicit rowDate silently fell back to its
 * sheet's createdAt (when the DB row happened to be inserted) instead of
 * the sheet's actual sheetDate (the calendar date it represents) — so a
 * sheet created in advance or backfilled for a different day than it was
 * saved on had every row misdated everywhere that fallback was used
 * (Weekly Activity Report, Intelligence Heat Map date-window filtering).
 *
 * This sets rowDate = sheetDate + dayOffset days for every row that:
 *   - belongs to a non-deleted sheet that HAS a sheetDate (post-picker), and
 *   - itself has no valid rowDate (null or not YYYY-MM-DD).
 *
 * Rows on sheets with no sheetDate (legacy, pre-picker) are left untouched —
 * the createdAt fallback is the documented, intentional behaviour for those.
 *
 * Defaults to a DRY RUN — it only prints what it found. Pass --confirm to
 * actually update.
 *
 * Usage:
 *   pnpm tsx scripts/dev/backfill-row-dates-from-sheet-date.ts
 *   pnpm tsx scripts/dev/backfill-row-dates-from-sheet-date.ts --confirm
 *
 * Refuses to run unless DATABASE_URL looks local, or --force is also
 * passed — this is meant to be run against production deliberately, by
 * hand, with --force, after reviewing the dry-run output.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

function isLocalHost(databaseUrl: string): boolean {
  try {
    const { hostname } = new URL(databaseUrl);
    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    );
  } catch {
    return false;
  }
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const force = process.argv.includes("--force");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set — nothing to do.");
    process.exit(1);
  }
  if (!isLocalHost(databaseUrl) && !force) {
    console.error(
      `Refusing to run: DATABASE_URL does not point at localhost (host: ${new URL(databaseUrl).hostname}).\n` +
        "Re-run with --force if you mean to run this against that database (e.g. production)."
    );
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    uri: databaseUrl,
    ...(isLocalHost(databaseUrl) ? {} : { ssl: { rejectUnauthorized: false } }),
  });

  try {
    const [candidates] = await conn.query<any[]>(
      `SELECT sr.id AS rowId, sr.sheetId, sr.rowNumber, sr.rowDate AS oldRowDate,
              sr.dayOffset, rs.sheetDate, rs.title,
              DATE_FORMAT(DATE_ADD(rs.sheetDate, INTERVAL sr.dayOffset DAY), '%Y-%m-%d') AS newRowDate
       FROM sheet_rows sr
       JOIN running_sheets rs ON rs.id = sr.sheetId
       WHERE rs.sheetDate IS NOT NULL
         AND rs.deletedAt IS NULL
         AND (sr.rowDate IS NULL OR sr.rowDate NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
       ORDER BY rs.id, sr.rowNumber`
    );

    if (candidates.length === 0) {
      console.log(
        "No rows with a missing/malformed rowDate on a picker-dated sheet. Nothing to do."
      );
      return;
    }

    const sheetIds = new Set(candidates.map((c: any) => c.sheetId));
    console.log(
      `Found ${candidates.length} row(s) across ${sheetIds.size} sheet(s) with a missing/malformed rowDate:`
    );
    for (const c of candidates.slice(0, 30)) {
      console.log(
        `  sheet #${c.sheetId} "${c.title}" row ${c.rowNumber} — rowDate ${JSON.stringify(c.oldRowDate)} -> ${c.newRowDate} (sheetDate ${c.sheetDate}, dayOffset ${c.dayOffset})`
      );
    }
    if (candidates.length > 30) {
      console.log(`  ...and ${candidates.length - 30} more.`);
    }

    if (!confirm) {
      console.log(
        "\nDry run only — nothing was updated. Re-run with --confirm to apply the above."
      );
      return;
    }

    const [result]: any = await conn.query(
      `UPDATE sheet_rows sr
       JOIN running_sheets rs ON rs.id = sr.sheetId
       SET sr.rowDate = DATE_FORMAT(DATE_ADD(rs.sheetDate, INTERVAL sr.dayOffset DAY), '%Y-%m-%d')
       WHERE rs.sheetDate IS NOT NULL
         AND rs.deletedAt IS NULL
         AND (sr.rowDate IS NULL OR sr.rowDate NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')`
    );
    console.log(`\nUpdated ${result.affectedRows} row(s).`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
