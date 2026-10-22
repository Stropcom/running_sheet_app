/**
 * Compares drizzle/schema.ts with a real database built from the migrations
 * and lists every table, column or index the schema has that the database does
 * not (and every table or column the database has that the schema does not). A fresh database built from `drizzle-kit migrate` must
 * match the schema, or a rebuilt environment (staging, disaster recovery,
 * CI) is missing columns that production has.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3306/some_empty_db \
 *   pnpm exec drizzle-kit migrate && pnpm tsx scripts/dev/check-schema-drift.ts
 *
 * Exits 1 if there is any difference.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { MySqlTable, getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../../drizzle/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  const conn = await mysql.createConnection(url);
  const [rows] = await conn.query(
    "SELECT TABLE_NAME t, COLUMN_NAME c FROM information_schema.columns WHERE TABLE_SCHEMA = ?",
    [dbName]
  );
  const [idxRows] = await conn.query(
    "SELECT DISTINCT TABLE_NAME t, INDEX_NAME i FROM information_schema.statistics WHERE TABLE_SCHEMA = ?",
    [dbName]
  );
  const indexesInDb = new Map<string, Set<string>>();
  for (const r of idxRows as { t: string; i: string }[]) {
    if (!indexesInDb.has(r.t)) indexesInDb.set(r.t, new Set());
    indexesInDb.get(r.t)!.add(r.i);
  }
  const inDb = new Map<string, Set<string>>();
  for (const r of rows as { t: string; c: string }[]) {
    if (!inDb.has(r.t)) inDb.set(r.t, new Set());
    inDb.get(r.t)!.add(r.c);
  }
  const problems: string[] = [];
  const inSchema = new Set<string>();
  for (const v of Object.values(schema)) {
    if (!is(v, MySqlTable)) continue;
    const table = getTableName(v);
    inSchema.add(table);
    const cols = inDb.get(table);
    if (!cols) {
      problems.push(`table missing from the database: ${table}`);
      continue;
    }
    const names = new Set<string>();
    for (const col of Object.values(getTableColumns(v))) {
      names.add(col.name);
      if (!cols.has(col.name))
        problems.push(
          `column in schema.ts but not in the database: ${table}.${col.name}`
        );
    }
    for (const idx of getTableConfig(v).indexes) {
      const name = idx.config.name;
      if (!indexesInDb.get(table)?.has(name))
        problems.push(
          `index in schema.ts but not in the database: ${table}.${name}`
        );
    }
    for (const c of cols)
      if (!names.has(c))
        problems.push(
          `column in the database but not in schema.ts: ${table}.${c}`
        );
  }
  for (const t of inDb.keys())
    if (!inSchema.has(t) && t !== "__drizzle_migrations")
      problems.push(`table in the database but not in schema.ts: ${t}`);
  await conn.end();
  if (problems.length) {
    console.log(problems.join("\n"));
    console.log(`\n${problems.length} difference(s).`);
    process.exit(1);
  }
  console.log("Schema and migrated database match.");
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
