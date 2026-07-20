/**
 * Creates the first admin user in a local database — needed after
 * db:reset-local-db, which wipes the users table too (unlike
 * db:reset-test-data, which keeps accounts). There's no public sign-up
 * page, so this is the only way to get back into the app once the users
 * table is empty.
 *
 * Usage:
 *   pnpm tsx scripts/dev/create-admin-user.ts <username> <password> <name> <cin>
 *
 * Example:
 *   pnpm tsx scripts/dev/create-admin-user.ts brett Passw0rd! "Brett" "BS1"
 *
 * Local dev/testing use only — refuses to run unless DATABASE_URL looks
 * local, or --force is also passed. Logs in with mustChangePassword=false
 * so it's ready to use immediately (unlike admin-created users, which
 * force a password change on first login).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
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
  const force = process.argv.includes("--force");
  const [username, password, name, cin] = args;

  if (!username || !password || !name || !cin) {
    console.error(
      "Usage: pnpm tsx scripts/dev/create-admin-user.ts <username> <password> <name> <cin>"
    );
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
        "This script is for LOCAL dev use only. If you are certain, re-run with --force."
    );
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    uri: databaseUrl,
    ...(isLocalHost(databaseUrl) ? {} : { ssl: { rejectUnauthorized: false } }),
  });

  try {
    const [existing] = await conn.query<any[]>(
      "SELECT id FROM users WHERE username = ?",
      [username.trim().toLowerCase()]
    );
    if (existing.length > 0) {
      console.error(`A user with username "${username}" already exists.`);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await conn.query(
      `INSERT INTO users (username, passwordHash, name, cin, role, loginMethod, mustChangePassword)
       VALUES (?, ?, ?, ?, 'admin', 'local', false)`,
      [username.trim().toLowerCase(), passwordHash, name, cin.toUpperCase()]
    );

    console.log(`Created admin user "${username}" (CIN ${cin.toUpperCase()}). Log in with that username and the password you gave.`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
