/**
 * Finds and deletes one operation (by name/running-sheet-title/target-name
 * search match) plus everything tied to it: running sheets, rows,
 * certifications, sub-observations, RS map waypoints, governance records,
 * audit log entries, linked targets, target shortcuts, and custom map
 * markers. "Intelligence" entities are mined live from row text (there is
 * no separate intelligence table) so they disappear automatically once the
 * rows are gone.
 *
 * Defaults to a DRY RUN — it only prints what it found. Pass --confirm to
 * actually delete.
 *
 * Usage:
 *   pnpm tsx scripts/dev/delete-test-record.ts "search term"
 *   pnpm tsx scripts/dev/delete-test-record.ts "search term" --confirm
 *
 * Local dev/testing use only — refuses to run unless DATABASE_URL looks
 * local, or --force is also passed.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

function isLocalHost(databaseUrl: string): boolean {
  try {
    const { hostname } = new URL(databaseUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
  const confirm = process.argv.includes("--confirm");
  const force = process.argv.includes("--force");
  const search = args[0];

  if (!search || search.trim().length < 2) {
    console.error('Usage: pnpm tsx scripts/dev/delete-test-record.ts "search term" [--confirm]');
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
        "This script is for LOCAL test data only. If you are certain, re-run with --force."
    );
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    uri: databaseUrl,
    ...(isLocalHost(databaseUrl) ? {} : { ssl: { rejectUnauthorized: false } }),
  });

  const like = `%${search}%`;

  try {
    // Match operations directly by name, and via a matching running sheet title.
    const [opsByName] = await conn.query<any[]>(
      "SELECT id, name FROM operations WHERE name LIKE ?",
      [like]
    );
    const [sheetsMatched] = await conn.query<any[]>(
      "SELECT id, operationId, title FROM running_sheets WHERE title LIKE ?",
      [like]
    );
    const opIdsFromSheets = [...new Set(sheetsMatched.map((s: any) => s.operationId))];

    const operationIds = [
      ...new Set([...opsByName.map((o: any) => o.id), ...opIdsFromSheets]),
    ];

    if (operationIds.length === 0) {
      console.log(`No operations or running sheets matched "${search}". Nothing to do.`);
      return;
    }

    const [allSheets] = operationIds.length
      ? await conn.query<any[]>(
          `SELECT id, operationId, title FROM running_sheets WHERE operationId IN (${operationIds.map(() => "?").join(",")})`,
          operationIds
        )
      : [[]];
    const sheetIds = allSheets.map((s: any) => s.id);

    const [rows] = sheetIds.length
      ? await conn.query<any[]>(
          `SELECT id FROM sheet_rows WHERE sheetId IN (${sheetIds.map(() => "?").join(",")})`,
          sheetIds
        )
      : [[]];
    const rowIds = rows.map((r: any) => r.id);

    const [linkedTargets] = await conn.query<any[]>(
      `SELECT DISTINCT t.id, t.name FROM targets t
       LEFT JOIN operation_target_links l ON l.targetId = t.id
       LEFT JOIN running_sheets rs ON rs.targetId = t.id
       WHERE (l.operationId IN (${operationIds.map(() => "?").join(",") || "NULL"})
          OR rs.id IN (${sheetIds.map(() => "?").join(",") || "NULL"})
          OR t.name LIKE ?)`,
      [...operationIds, ...sheetIds, like]
    );
    const targetIds = linkedTargets.map((t: any) => t.id);

    const [markers] = await conn.query<any[]>(
      `SELECT id, label FROM custom_map_markers WHERE
        operationId IN (${operationIds.map(() => "?").join(",") || "NULL"})
        OR targetId IN (${targetIds.map(() => "?").join(",") || "NULL"})`,
      [...operationIds, ...targetIds]
    );

    console.log("Found:");
    console.log(
      "  Operations:",
      operationIds.length
        ? (
            await conn.query<any[]>(
              `SELECT name FROM operations WHERE id IN (${operationIds.map(() => "?").join(",")})`,
              operationIds
            )
          )[0].map((o: any) => o.name)
        : []
    );
    console.log("  Running sheets:", allSheets.map((s: any) => s.title));
    console.log("  Rows:", rowIds.length);
    console.log("  Linked targets:", linkedTargets.map((t: any) => t.name));
    console.log("  Map markers:", markers.map((m: any) => m.label || `#${m.id}`));

    if (!confirm) {
      console.log("\nDry run only — nothing was deleted. Re-run with --confirm to delete the above.");
      return;
    }

    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    if (rowIds.length) {
      const inRows = rowIds.map(() => "?").join(",");
      await conn.query(`DELETE FROM certifications WHERE rowId IN (${inRows})`, rowIds);

      const [subObs] = await conn.query<any[]>(
        `SELECT id FROM sub_observations WHERE rowId IN (${inRows})`,
        rowIds
      );
      const subObsIds = subObs.map((s: any) => s.id);
      if (subObsIds.length) {
        const inSub = subObsIds.map(() => "?").join(",");
        await conn.query(`DELETE FROM sub_observation_certifications WHERE subObsId IN (${inSub})`, subObsIds);
        await conn.query(`DELETE FROM sub_observation_members WHERE subObsId IN (${inSub})`, subObsIds);
        await conn.query(`DELETE FROM sub_observations WHERE id IN (${inSub})`, subObsIds);
      }

      await conn.query(`DELETE FROM row_members WHERE rowId IN (${inRows})`, rowIds);
      await conn.query(`DELETE FROM rs_mapping_waypoints WHERE rowId IN (${inRows})`, rowIds);

      const [attachments] = await conn.query<any[]>(
        `SELECT id FROM row_attachments WHERE rowId IN (${inRows})`,
        rowIds
      );
      const attachmentIds = attachments.map((a: any) => a.id);
      if (attachmentIds.length) {
        const inAttachments = attachmentIds.map(() => "?").join(",");
        await conn.query(`DELETE FROM attachment_entity_links WHERE attachmentId IN (${inAttachments})`, attachmentIds);
        await conn.query(`DELETE FROM row_attachments WHERE id IN (${inAttachments})`, attachmentIds);
      }
    }

    if (sheetIds.length) {
      const inSheets = sheetIds.map(() => "?").join(",");
      await conn.query(`DELETE FROM rs_mapping_waypoints WHERE sheetId IN (${inSheets})`, sheetIds);
      await conn.query(`DELETE FROM audit_logs WHERE sheetId IN (${inSheets})`, sheetIds);
      await conn.query(`DELETE FROM governance_records WHERE sheetId IN (${inSheets})`, sheetIds);
      await conn.query(`DELETE FROM sheet_rows WHERE sheetId IN (${inSheets})`, sheetIds);
      await conn.query(`DELETE FROM running_sheets WHERE id IN (${inSheets})`, sheetIds);
    }

    if (targetIds.length) {
      const inTargets = targetIds.map(() => "?").join(",");
      await conn.query(`DELETE FROM target_shortcuts WHERE targetId IN (${inTargets})`, targetIds);
      await conn.query(`DELETE FROM custom_map_markers WHERE targetId IN (${inTargets})`, targetIds);
    }

    if (operationIds.length) {
      const inOps = operationIds.map(() => "?").join(",");
      await conn.query(`DELETE FROM operation_target_links WHERE operationId IN (${inOps})`, operationIds);
      await conn.query(`DELETE FROM custom_map_markers WHERE operationId IN (${inOps})`, operationIds);
    }

    if (targetIds.length) {
      const inTargets = targetIds.map(() => "?").join(",");
      await conn.query(`DELETE FROM targets WHERE id IN (${inTargets})`, targetIds);
    }

    if (operationIds.length) {
      const inOps = operationIds.map(() => "?").join(",");
      await conn.query(`DELETE FROM operations WHERE id IN (${inOps})`, operationIds);
    }

    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log("\nDeleted.");
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
