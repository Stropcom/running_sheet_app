/**
 * Wipes operational test data (operations, running sheets, rows, targets,
 * governance, WIPC case records, map markers, audit log) from the database
 * pointed to by DATABASE_URL, so local testing can start from a clean slate.
 *
 * Deliberately does NOT touch: users, observation shortcuts, style
 * guide/rules, sidebar/tile layout, Operation Manager tasking board, saved
 * WIPC officer profile, push subscriptions, or user location sharing state.
 *
 * Local dev/testing use only — never run this against a production
 * DATABASE_URL. The script refuses to run unless the host looks local, or
 * --force is passed.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const TABLES_TO_WIPE = [
  // children first (no real FK constraints in this schema, but keep the
  // order sane for readability / in case constraints are added later)
  "certifications",
  "sub_observation_certifications",
  "sub_observation_members",
  "sub_observations",
  "row_members",
  "rs_mapping_waypoints",
  "audit_logs",
  "sheet_rows",
  "running_sheets",
  "operation_target_links",
  "target_shortcuts",
  "targets",
  "custom_map_markers",
  "governance_records",
  "wipc_members",
  "wipc_audit_log",
  "operations",
];

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
    console.error("DATABASE_URL is not set — nothing to do.");
    process.exit(1);
  }

  const force = process.argv.includes("--force");
  if (!isLocalHost(databaseUrl) && !force) {
    console.error(
      `Refusing to run: DATABASE_URL does not point at localhost (host: ${new URL(databaseUrl).hostname}).\n` +
        "This script is for wiping LOCAL test data only. If you are certain, re-run with --force."
    );
    process.exit(1);
  }

  const { hostname, pathname } = new URL(databaseUrl);
  console.log(`Connecting to ${hostname}${pathname} ...`);

  const conn = await mysql.createConnection({
    uri: databaseUrl,
    ...(isLocalHost(databaseUrl) ? {} : { ssl: { rejectUnauthorized: false } }),
  });

  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of TABLES_TO_WIPE) {
      await conn.query(`TRUNCATE TABLE \`${table}\``);
      console.log(`  cleared ${table}`);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log("\nDone. Users, shortcuts, and other account/settings data were left untouched.");
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
