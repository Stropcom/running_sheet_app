/**
 * Backfill for sheet_rows.rowDate on sheets that already have a picker-set
 * sheetDate, covering two distinct ways a row ended up misdated before the
 * row.create/resolveRowDate/TimePickerCell fixes landed:
 *
 *   1. rowDate left NULL (or malformed) — every reader's fallback used to
 *      resort straight to the sheet's createdAt (when the DB row happened
 *      to be inserted) instead of sheetDate (the calendar date the sheet
 *      actually represents).
 *   2. rowDate EXPLICITLY WRITTEN, but wrong — the old client (SheetDetail's
 *      time picker) defaulted a new row's date to the sheet's createdAt day
 *      too, and saved that explicit (wrong) value to the row the moment an
 *      officer set a time on it. This is the sneakier case: a well-formed,
 *      non-null rowDate that this script's first pass alone would skip,
 *      because it looks like a deliberate value. It's only identifiable by
 *      recognising it exactly matches what the OLD buggy default would have
 *      produced (sheet's createdAt day + dayOffset) while disagreeing with
 *      what sheetDate says it should be — a row an officer genuinely chose
 *      to log against a different real day would essentially never happen to
 *      land exactly on that specific wrong value.
 *
 * Both cases show up as: the sheet's card/title/calendar look right (they
 * all read sheetDate), but the Weekly Activity Report / Intelligence Heat
 * Map / Court Statement dates (which read rowDate first) still don't.
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

// Must be set before any Date/mysql2 usage below — the live server forces
// this same timezone as its very first executable line (see
// server/_core/index.ts) so that DATETIME columns (interpreted by mysql2's
// default timezone:'local' behaviour) and Date math agree with what the app
// itself computes. Running this script without it would silently recompute
// different "buggy" and "correct" dates than what actually got written.
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

/** YYYY-MM-DD (Perth-anchored) for a JS Date — same as db.ts's toPerthDateISO. */
function toPerthDateISO(d: Date): string {
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Add (or subtract) days to a YYYY-MM-DD string, Perth-anchored — same as db.ts's addDaysISO. */
function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00+08:00");
  d.setUTCDate(d.getUTCDate() + days);
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const VALID_YMD = /^\d{4}-\d{2}-\d{2}$/;

interface RowCandidate {
  rowId: number;
  sheetId: number;
  rowNumber: number;
  title: string;
  oldRowDate: string | null;
  dayOffset: number;
  correctDate: string;
  reason: "null_or_malformed" | "matches_old_buggy_default";
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
    const [rows] = await conn.query<any[]>(
      `SELECT sr.id AS rowId, sr.sheetId, sr.rowNumber, sr.rowDate AS oldRowDate,
              sr.dayOffset, rs.sheetDate, rs.createdAt, rs.title
       FROM sheet_rows sr
       JOIN running_sheets rs ON rs.id = sr.sheetId
       WHERE rs.sheetDate IS NOT NULL
         AND rs.deletedAt IS NULL`
    );

    const candidates: RowCandidate[] = [];
    for (const r of rows) {
      const dayOffset: number = r.dayOffset ?? 0;
      const correctDate = addDaysISO(r.sheetDate, dayOffset);
      const oldRowDate: string | null = r.oldRowDate;

      if (!oldRowDate || !VALID_YMD.test(oldRowDate)) {
        candidates.push({
          rowId: r.rowId,
          sheetId: r.sheetId,
          rowNumber: r.rowNumber,
          title: r.title,
          oldRowDate,
          dayOffset,
          correctDate,
          reason: "null_or_malformed",
        });
        continue;
      }

      if (oldRowDate === correctDate) continue; // already right

      const buggyDate = addDaysISO(
        toPerthDateISO(new Date(r.createdAt)),
        dayOffset
      );
      if (oldRowDate === buggyDate) {
        candidates.push({
          rowId: r.rowId,
          sheetId: r.sheetId,
          rowNumber: r.rowNumber,
          title: r.title,
          oldRowDate,
          dayOffset,
          correctDate,
          reason: "matches_old_buggy_default",
        });
      }
      // else: rowDate disagrees with sheetDate but doesn't match the known
      // buggy formula either — leave it alone, it may be a deliberate value.
    }

    if (candidates.length === 0) {
      console.log(
        "No misdated rows found on any picker-dated sheet. Nothing to do."
      );
      return;
    }

    const sheetIds = new Set(candidates.map(c => c.sheetId));
    const nullCount = candidates.filter(
      c => c.reason === "null_or_malformed"
    ).length;
    const buggyCount = candidates.filter(
      c => c.reason === "matches_old_buggy_default"
    ).length;
    console.log(
      `Found ${candidates.length} row(s) across ${sheetIds.size} sheet(s) to fix ` +
        `(${nullCount} null/malformed, ${buggyCount} matching the old buggy default):`
    );
    for (const c of candidates.slice(0, 40)) {
      console.log(
        `  [${c.reason}] sheet #${c.sheetId} "${c.title}" row ${c.rowNumber} — rowDate ${JSON.stringify(c.oldRowDate)} -> ${c.correctDate} (dayOffset ${c.dayOffset})`
      );
    }
    if (candidates.length > 40) {
      console.log(`  ...and ${candidates.length - 40} more.`);
    }

    if (!confirm) {
      console.log(
        "\nDry run only — nothing was updated. Re-run with --confirm to apply the above."
      );
      return;
    }

    for (const c of candidates) {
      await conn.query(`UPDATE sheet_rows SET rowDate = ? WHERE id = ?`, [
        c.correctDate,
        c.rowId,
      ]);
    }
    console.log(`\nUpdated ${candidates.length} row(s).`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
