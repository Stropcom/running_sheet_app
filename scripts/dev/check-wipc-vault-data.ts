/**
 * Read-only check: does any WIPC vault data already exist?
 *
 * WIPC_VAULT_KEY (server/wipcVault.ts) currently isn't set (or isn't valid)
 * wherever this error is showing — "Failed to save profile: WIPC_VAULT_KEY
 * is not set or is not a valid 64-character hex string." Before generating
 * a fresh key, it's essential to know whether that key was ever set
 * successfully in the past: if any row already exists in these tables, it
 * was encrypted with SOME key at save time, and a newly generated key will
 * NOT be able to decrypt it — AES-256-GCM has no recovery path without the
 * original key. Losing it means that data is permanently unreadable.
 *
 * This script only counts rows and prints non-sensitive metadata (ids,
 * timestamps, which user/CIN created each row) — it never selects or
 * touches the encrypted fields themselves, and makes no writes.
 *
 * Usage:
 *   pnpm tsx scripts/dev/check-wipc-vault-data.ts
 *   (add --force to run against a non-local DATABASE_URL, e.g. production)
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
  const force = process.argv.includes("--force");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set — nothing to do.");
    process.exit(1);
  }
  if (!isLocalHost(databaseUrl) && !force) {
    console.error(
      "Refusing to run: DATABASE_URL does not point at localhost.\n" +
        "Re-run with --force if you mean to run this against that database (e.g. production). This script is read-only."
    );
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    uri: databaseUrl,
    ...(isLocalHost(databaseUrl) ? {} : { ssl: { rejectUnauthorized: false } }),
  });

  try {
    const [profiles] = await conn.query<any[]>(
      `SELECT id, userId, createdAt, updatedAt FROM wipc_officer_profiles ORDER BY id`
    );
    const [members] = await conn.query<any[]>(
      `SELECT id, createdBy, createdAt FROM wipc_members ORDER BY id`
    );
    const [auditLog] = await conn.query<any[]>(
      `SELECT COUNT(*) AS n, MIN(createdAt) AS earliest, MAX(createdAt) AS latest FROM wipc_audit_log`
    );

    console.log(`wipc_officer_profiles: ${profiles.length} row(s)`);
    for (const p of profiles) {
      console.log(
        `  id ${p.id} — userId ${p.userId} — created ${p.createdAt} — updated ${p.updatedAt}`
      );
    }

    console.log(`\nwipc_members: ${members.length} row(s)`);
    for (const m of members) {
      console.log(
        `  id ${m.id} — createdBy (user id) ${m.createdBy} — created ${m.createdAt}`
      );
    }

    console.log(`\nwipc_audit_log: ${auditLog[0].n} row(s)`);
    if (auditLog[0].n > 0) {
      console.log(`  earliest: ${auditLog[0].earliest}`);
      console.log(`  latest:   ${auditLog[0].latest}`);
    }

    if (profiles.length === 0 && members.length === 0) {
      console.log(
        "\n=> No existing WIPC data of either kind. Safe to generate and set a brand-new WIPC_VAULT_KEY."
      );
    } else {
      console.log(
        "\n=> Existing WIPC data found. DO NOT set a freshly generated WIPC_VAULT_KEY — " +
          "it will not decrypt these rows. Track down the original key first (old .env backups, " +
          "droplet snapshots, secrets manager, deployment notes) before touching this."
      );
    }
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
