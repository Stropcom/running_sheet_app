/**
 * One-time cleanup for photo attachments left behind by rows that were
 * deleted before deleteSheetRow() cascaded to row_attachments (see
 * server/db.ts). An orphaned attachment's rowId no longer matches any
 * sheet_rows record, so every query that joins attachments back to their
 * row silently drops it — it never shows up anywhere (Images folder,
 * entity profiles, Operation profile) but still occupies storage and
 * still has stale attachment_entity_links pointing at it.
 *
 * Defaults to a DRY RUN — it only prints what it found. Pass --confirm to
 * actually delete.
 *
 * Usage:
 *   pnpm tsx scripts/dev/purge-orphaned-attachments.ts
 *   pnpm tsx scripts/dev/purge-orphaned-attachments.ts --confirm
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
        "This script is for LOCAL test data only. If you are certain, re-run with --force."
    );
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    uri: databaseUrl,
    ...(isLocalHost(databaseUrl) ? {} : { ssl: { rejectUnauthorized: false } }),
  });

  try {
    const [orphaned] = await conn.query<any[]>(
      `SELECT ra.id, ra.rowId, ra.url, ra.createdAt
       FROM row_attachments ra
       LEFT JOIN sheet_rows sr ON sr.id = ra.rowId
       WHERE sr.id IS NULL`
    );

    if (orphaned.length === 0) {
      console.log("No orphaned attachments found. Nothing to do.");
      return;
    }

    console.log(`Found ${orphaned.length} orphaned attachment(s) (row no longer exists):`);
    for (const a of orphaned) {
      console.log(`  #${a.id} — rowId ${a.rowId} (deleted) — ${a.url}`);
    }

    const attachmentIds = orphaned.map((a: any) => a.id);
    const inAttachments = attachmentIds.map(() => "?").join(",");
    const [links] = await conn.query<any[]>(
      `SELECT id, category, entityLabel FROM attachment_entity_links WHERE attachmentId IN (${inAttachments})`,
      attachmentIds
    );
    console.log(`Found ${links.length} stale entity link(s) pointing at them:`);
    for (const l of links) {
      console.log(`  link #${l.id} — ${l.category} — ${l.entityLabel}`);
    }

    if (!confirm) {
      console.log("\nDry run only — nothing was deleted. Re-run with --confirm to delete the above.");
      console.log("Note: this does not delete the underlying image files, only the database records.");
      return;
    }

    await conn.query(`DELETE FROM attachment_entity_links WHERE attachmentId IN (${inAttachments})`, attachmentIds);
    await conn.query(`DELETE FROM row_attachments WHERE id IN (${inAttachments})`, attachmentIds);
    console.log("\nDeleted.");
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
