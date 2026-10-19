#!/usr/bin/env node
// Zero the operational data so every Command starts empty.
//
//   node scripts/ops/zero-data.mjs             dry run: row counts only, changes nothing
//   node scripts/ops/zero-data.mjs --execute   back up, ask you to type the database name, then clear
//
// Run it from the app's folder (e.g. /opt/runlog) with the app STOPPED. It reads
// DATABASE_URL from the environment or .env. Which tables are cleared and which
// kept is in zero-data-tables.mjs (people, teams, settings and the whole CTO
// Roster are kept). Stored photos/documents are moved aside to
// uploads.pre-zero-<time>/ (not deleted) when the app stores files on disk.
//
// Options: --skip-backup (testing only), --skip-uploads.
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { createConnection } from "mysql2/promise";
import {
  ALL_CLEAR_TABLES as CLEAR_TABLES,
  IGNORED_TABLES,
  ALL_KEEP_TABLES as KEEP_TABLES,
} from "./zero-data-tables.mjs";

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const skipBackup = args.has("--skip-backup");
const skipUploads = args.has("--skip-uploads");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (put it in the environment or .env).");
  process.exit(1);
}
const parsed = new URL(url);
const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

const conn = await createConnection({ uri: url });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

async function tableList() {
  const [rows] = await conn.query(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
  );
  return rows.map(r => r.t).filter(t => !IGNORED_TABLES.includes(t));
}
async function count(table) {
  const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
  return Number(rows[0].n);
}

// ── 1. Every table must be classified ───────────────────────────────────────
const inDb = await tableList();
const known = new Set([...KEEP_TABLES, ...CLEAR_TABLES]);
const unknown = inDb.filter(t => !known.has(t));
const dupes = KEEP_TABLES.filter(t => CLEAR_TABLES.includes(t));
if (unknown.length || dupes.length) {
  if (unknown.length)
    console.error(
      `Not classified in zero-data-tables.mjs (add each to KEEP_TABLES or CLEAR_TABLES): ${unknown.join(", ")}`
    );
  if (dupes.length) console.error(`In both lists: ${dupes.join(", ")}`);
  await conn.end();
  process.exit(1);
}
const toClear = CLEAR_TABLES.filter(t => inDb.includes(t));
const toKeep = KEEP_TABLES.filter(t => inDb.includes(t));

// ── 2. Counts ───────────────────────────────────────────────────────────────
const before = new Map();
for (const t of [...toClear, ...toKeep]) before.set(t, await count(t));
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nDatabase: ${dbName}\n`);
console.log(`${pad("TABLE", 38)}${pad("ROWS", 10)}ACTION`);
for (const t of toClear)
  console.log(`${pad(t, 38)}${pad(before.get(t), 10)}CLEAR`);
for (const t of toKeep)
  console.log(`${pad(t, 38)}${pad(before.get(t), 10)}keep`);
const clearRows = toClear.reduce((a, t) => a + before.get(t), 0);
console.log(
  `\n${toClear.length} tables to clear (${clearRows} rows), ${toKeep.length} kept.`
);

if (!execute) {
  console.log(
    "\nDry run only — nothing was changed. Add --execute to go ahead."
  );
  await conn.end();
  process.exit(0);
}

// ── 3. Back up ──────────────────────────────────────────────────────────────
if (!skipBackup) {
  await fs.mkdir("backups", { recursive: true });
  const file = path.join("backups", `pre-zero-${dbName}-${stamp}.sql`);
  const dumpArgs = [
    `--host=${parsed.hostname}`,
    `--port=${parsed.port || "3306"}`,
    `--user=${decodeURIComponent(parsed.username)}`,
    "--single-transaction",
    "--routines",
    `--result-file=${file}`,
    dbName,
  ];
  const env = {
    ...process.env,
    MYSQL_PWD: decodeURIComponent(parsed.password),
  };
  let ok = false;
  for (const bin of ["mysqldump", "mariadb-dump"]) {
    const r = spawnSync(bin, dumpArgs, { env, stdio: "inherit" });
    if (r.status === 0) {
      ok = true;
      break;
    }
  }
  const size = ok ? (await fs.stat(file)).size : 0;
  if (!ok || size === 0) {
    console.error("The backup failed, so nothing was cleared.");
    await conn.end();
    process.exit(1);
  }
  console.log(
    `\nBackup written: ${file} (${size} bytes). Keep a copy off this server.`
  );
} else {
  console.log("\n--skip-backup given: NO backup was taken.");
}

// ── 4. Confirm ──────────────────────────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const typed = await rl.question(
  `\nThis permanently empties ${toClear.length} tables in "${dbName}". Type the database name to continue: `
);
rl.close();
if (typed.trim() !== dbName) {
  console.log("Not confirmed — nothing was cleared.");
  await conn.end();
  process.exit(1);
}

// ── 5. Clear ────────────────────────────────────────────────────────────────
await conn.query("SET FOREIGN_KEY_CHECKS = 0");
for (const t of toClear) await conn.query(`TRUNCATE TABLE \`${t}\``);
await conn.query("SET FOREIGN_KEY_CHECKS = 1");

// ── 6. Stored files ─────────────────────────────────────────────────────────
const usesRemoteStorage =
  !!process.env.BUILT_IN_FORGE_API_URL && !!process.env.BUILT_IN_FORGE_API_KEY;
if (skipUploads) {
  console.log("Stored files left as they are (--skip-uploads).");
} else if (usesRemoteStorage) {
  console.log(
    "Photos and documents are in remote storage, which this script doesn't touch — they are no longer referenced by anything."
  );
} else {
  const uploads = path.join(process.cwd(), "uploads");
  try {
    await fs.access(uploads);
    const moved = `${uploads}.pre-zero-${stamp}`;
    await fs.rename(uploads, moved);
    await fs.mkdir(uploads, { recursive: true });
    console.log(`Stored files moved to ${moved} (delete it when you're sure).`);
  } catch {
    console.log("No uploads folder here, so no stored files to move.");
  }
}

// ── 7. Check ────────────────────────────────────────────────────────────────
let bad = 0;
for (const t of toClear) {
  const n = await count(t);
  if (n !== 0) {
    bad++;
    console.error(`NOT EMPTY: ${t} has ${n} rows`);
  }
}
for (const t of toKeep) {
  const n = await count(t);
  if (n !== before.get(t)) {
    bad++;
    console.error(`CHANGED: ${t} had ${before.get(t)} rows, now ${n}`);
  }
}
await conn.end();
if (bad) {
  console.error("\nCheck failed — restore from the backup if this is wrong.");
  process.exit(1);
}
console.log(
  `\nDone. ${toClear.length} tables are empty and ${toKeep.length} are unchanged. Start the app again.`
);
