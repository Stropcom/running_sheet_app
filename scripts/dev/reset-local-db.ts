/**
 * Fully drops and recreates the local database (all tables, all data —
 * users included), then leaves it empty. Run `pnpm db:push` immediately
 * after to rebuild the schema from the migration files.
 *
 * Use this when the local database's migration history has drifted out of
 * sync with its actual tables (e.g. `pnpm db:push` fails with a "Duplicate
 * column" error even though the underlying schema change never actually
 * landed) — this happens when a column was added to the database outside
 * of drizzle's own migration runner at some point. Wiping and rebuilding
 * from the migration files is the fastest reliable fix.
 *
 * Local dev/testing use only — refuses to run unless DATABASE_URL looks
 * local, or --force is also passed. This is more destructive than
 * db:reset-test-data (which keeps users/settings) — it empties everything.
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
    console.error("DATABASE_URL is not set — nothing to do.");
    process.exit(1);
  }

  const force = process.argv.includes("--force");
  if (!isLocalHost(databaseUrl) && !force) {
    console.error(
      `Refusing to run: DATABASE_URL does not point at localhost (host: ${new URL(databaseUrl).hostname}).\n` +
        "This script is for wiping a LOCAL database only. If you are certain, re-run with --force."
    );
    process.exit(1);
  }

  const url = new URL(databaseUrl);
  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName) {
    console.error("Could not work out the database name from DATABASE_URL.");
    process.exit(1);
  }

  // Connect without selecting a database, so DROP/CREATE work regardless
  // of what currently exists.
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/";

  console.log(`Dropping and recreating database "${dbName}" on ${url.hostname} ...`);

  const conn = await mysql.createConnection({ uri: adminUrl.toString() });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await conn.query(`CREATE DATABASE \`${dbName}\``);
    console.log(`Done. Database "${dbName}" is now empty.`);
    console.log('Next: run "pnpm db:push" to rebuild the schema.');
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
