/**
 * Read-only listing of everything currently in operations, running_sheets,
 * targets, and custom_map_markers — for sanity-checking the local test DB
 * after a reset/delete script, without needing to dig through the UI.
 *
 * Usage: pnpm tsx scripts/dev/list-data.ts
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
    const [ops] = await conn.query<any[]>(
      "SELECT id, name, status, deletedAt FROM operations ORDER BY id"
    );
    console.log(`\nOperations (${ops.length}):`);
    for (const o of ops) {
      console.log(`  #${o.id} "${o.name}" status=${o.status}${o.deletedAt ? " [DELETED]" : ""}`);
    }

    const [sheets] = await conn.query<any[]>(
      "SELECT id, operationId, title, deletedAt FROM running_sheets ORDER BY id"
    );
    console.log(`\nRunning sheets (${sheets.length}):`);
    for (const s of sheets) {
      console.log(`  #${s.id} op#${s.operationId} "${s.title}"${s.deletedAt ? " [DELETED]" : ""}`);
    }

    const [rows] = await conn.query<any[]>(
      "SELECT sheetId, COUNT(*) c FROM sheet_rows GROUP BY sheetId"
    );
    console.log(`\nRows per sheet:`);
    for (const r of rows) {
      console.log(`  sheet#${r.sheetId}: ${r.c} row(s)`);
    }

    const [targets] = await conn.query<any[]>(
      "SELECT id, name, deletedAt FROM targets ORDER BY id"
    );
    console.log(`\nTargets (${targets.length}):`);
    for (const t of targets) {
      console.log(`  #${t.id} "${t.name}"${t.deletedAt ? " [DELETED]" : ""}`);
    }

    const [markers] = await conn.query<any[]>(
      "SELECT id, operationId, targetId, label, deletedAt FROM custom_map_markers ORDER BY id"
    );
    console.log(`\nCustom map markers (${markers.length}):`);
    for (const m of markers) {
      console.log(`  #${m.id} op#${m.operationId ?? "-"} tgt#${m.targetId ?? "-"} "${m.label ?? ""}"${m.deletedAt ? " [DELETED]" : ""}`);
    }

    console.log("");
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
