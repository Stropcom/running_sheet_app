/**
 * Read-only diagnostic for "why doesn't sheet X show up in the Weekly
 * Activity Report" — prints exactly what getWeeklyActivityReport (server/db.ts)
 * would see and compute for a given sheet, without guessing from outside.
 *
 * Prints: the sheet's own row (sheetDate, createdAt, deletedAt, operationId),
 * whether its operation exists/what state it's in, and for every row on the
 * sheet: timeMinutes, rowDate, dayOffset, and the resolved date the report's
 * resolveRowDate() would compute for it (replicated exactly) — plus which
 * Monday-start week that date falls into.
 *
 * Read-only. Makes no writes. Safe to run directly against production with
 * --force (no --confirm flag exists here because nothing is ever changed).
 *
 * Usage:
 *   pnpm tsx scripts/dev/debug-weekly-report-sheet.ts --title=20260809
 *   pnpm tsx scripts/dev/debug-weekly-report-sheet.ts --id=123
 *   (add --force to run against a non-local DATABASE_URL)
 */
import "dotenv/config";
import mysql from "mysql2/promise";

process.env.TZ = "Australia/Perth";

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

function toPerthDateISO(d: Date): string {
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00+08:00");
  d.setUTCDate(d.getUTCDate() + days);
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Monday-start week (YYYY-MM-DD) containing a given YYYY-MM-DD date, Perth-anchored. */
function mondayOfWeek(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00+08:00");
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const idArg = process.argv.find(a => a.startsWith("--id="))?.split("=")[1];
  const titleArg = process.argv
    .find(a => a.startsWith("--title="))
    ?.split("=")[1];
  const force = process.argv.includes("--force");

  if (!idArg && !titleArg) {
    console.error("Pass --id=<sheetId> or --title=<substring>.");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set — nothing to do.");
    process.exit(1);
  }
  if (!isLocalHost(databaseUrl) && !force) {
    console.error(
      `Refusing to run: DATABASE_URL does not point at localhost (host: ${new URL(databaseUrl).hostname}).\n` +
        "Re-run with --force if you mean to run this against that database (e.g. production). This script is read-only."
    );
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    uri: databaseUrl,
    ...(isLocalHost(databaseUrl) ? {} : { ssl: { rejectUnauthorized: false } }),
  });

  try {
    const [sheets] = await conn.query<any[]>(
      idArg
        ? `SELECT * FROM running_sheets WHERE id = ?`
        : `SELECT * FROM running_sheets WHERE title LIKE ?`,
      [idArg ? Number(idArg) : `%${titleArg}%`]
    );

    if (sheets.length === 0) {
      console.log("No matching sheet found.");
      return;
    }
    if (sheets.length > 1 && !idArg) {
      console.log(
        `${sheets.length} sheets matched "${titleArg}" — showing all:`
      );
    }

    for (const sheet of sheets) {
      console.log("\n" + "=".repeat(70));
      console.log(`Sheet #${sheet.id} — "${sheet.title}"`);
      console.log(`  operationId:  ${sheet.operationId}`);
      console.log(`  sheetDate:    ${sheet.sheetDate}`);
      console.log(
        `  createdAt:    ${new Date(sheet.createdAt).toISOString()} (Perth day: ${toPerthDateISO(new Date(sheet.createdAt))})`
      );
      console.log(`  deletedAt:    ${sheet.deletedAt}`);
      console.log(`  closedAt:     ${sheet.closedAt}`);

      const [ops] = await conn.query<any[]>(
        `SELECT id, name, status, deletedAt FROM operations WHERE id = ?`,
        [sheet.operationId]
      );
      if (ops.length === 0) {
        console.log(
          `  !! operationId ${sheet.operationId} has NO matching row in operations table.`
        );
      } else {
        console.log(
          `  operation:    "${ops[0].name}" status=${ops[0].status} deletedAt=${ops[0].deletedAt}`
        );
      }

      const [rows] = await conn.query<any[]>(
        `SELECT id, rowNumber, timeMinutes, rowDate, dayOffset, observation
         FROM sheet_rows WHERE sheetId = ? ORDER BY rowNumber`,
        [sheet.id]
      );
      console.log(`  rows: ${rows.length}`);
      if (rows.length === 0) {
        console.log(
          "  !! This sheet has ZERO rows — it can never appear in the report regardless of any date field, since the report is built entirely from rows."
        );
      }
      for (const r of rows) {
        const resolved =
          r.rowDate ??
          addDaysISO(
            sheet.sheetDate ?? toPerthDateISO(new Date(sheet.createdAt)),
            r.dayOffset ?? 0
          );
        const week = mondayOfWeek(resolved);
        console.log(
          `    row ${r.rowNumber} (id ${r.id}) — timeMinutes=${r.timeMinutes} rowDate=${JSON.stringify(r.rowDate)} dayOffset=${r.dayOffset} -> resolved=${resolved} (week of ${week})`
        );
      }
    }
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
