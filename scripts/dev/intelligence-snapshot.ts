/**
 * Saves, and compares, the Intelligence entity list (the people, vehicles and
 * places mined from every running sheet), so a change to how it is built can be
 * proved to give exactly the same result. Read-only: it never writes to the
 * database. See docs/features/dev-and-ops.md, "Intelligence redesign plan".
 *
 *   # before the change — save what the current code produces
 *   DATABASE_URL=… pnpm tsx scripts/dev/intelligence-snapshot.ts snapshot before.json
 *   # after the change — build it again and compare with the saved one
 *   DATABASE_URL=… pnpm tsx scripts/dev/intelligence-snapshot.ts compare before.json
 *   # or compare two saved snapshots
 *   pnpm tsx scripts/dev/intelligence-snapshot.ts compare before.json after.json
 *
 * Compares in full (every field, every occurrence); exits 1 on any difference
 * and lists the first ones. Use a throwaway "_scale" database (seed-scale-data.ts)
 * or a copy of real data.
 */
import "dotenv/config";
import fs from "node:fs";
import {
  compareEntityLists,
  canonicalizeEntities,
} from "../../server/intelCompare";

async function currentEntities(): Promise<unknown[]> {
  // Imported late so a comparison of two saved files needs no database.
  const { getAllIntelligenceEntities } = await import(
    "../../server/db/reports"
  );
  return getAllIntelligenceEntities({ unscoped: true });
}

async function main() {
  const [command, fileA, fileB] = process.argv.slice(2);
  if (command === "snapshot" && fileA) {
    const t0 = Date.now();
    const entities = await currentEntities();
    fs.writeFileSync(fileA, JSON.stringify(canonicalizeEntities(entities)));
    console.log(
      `Saved ${entities.length} entities to ${fileA} (built in ${Date.now() - t0} ms).`
    );
    process.exit(0);
  }
  if (command === "compare" && fileA) {
    const a = JSON.parse(fs.readFileSync(fileA, "utf8")) as unknown[];
    const b = fileB
      ? (JSON.parse(fs.readFileSync(fileB, "utf8")) as unknown[])
      : await currentEntities();
    const r = compareEntityLists(a, b);
    console.log(
      `${fileA}: ${r.countA} entities; ${fileB ?? "current build"}: ${r.countB} entities — ${r.identical ? "IDENTICAL" : `${r.differences.length} DIFFERENCE(S)`}`
    );
    for (const d of r.differences.slice(0, 25))
      console.log(
        `  ${d.kind}  ${d.key}${d.fields ? `  fields: ${d.fields.join(", ")}` : ""}${d.occurrences ? `  occurrences: ${d.occurrences[0]} vs ${d.occurrences[1]}` : ""}`
      );
    if (r.differences.length > 25)
      console.log(`  … and ${r.differences.length - 25} more`);
    process.exit(r.identical ? 0 : 1);
  }
  console.log(
    "Usage: intelligence-snapshot.ts snapshot <file>  |  compare <fileA> [fileB]"
  );
  process.exit(2);
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
