/**
 * Calls the REAL getWeeklyActivityReport (server/db.ts) directly for a given
 * week — not a hand-copied replica of its logic — and prints the full
 * result. Use this to settle definitively whether a sheet/operation is
 * actually missing from the server's computed report, or whether the server
 * result is correct and the bug is in the client's rendering of it.
 *
 * Read-only. Usage:
 *   pnpm tsx scripts/dev/debug-weekly-report-call.ts --week=2026-08-03
 *   (add --force to run against a non-local DATABASE_URL)
 */
import "dotenv/config";

process.env.TZ = "Australia/Perth";

async function main() {
  const weekArg = process.argv
    .find(a => a.startsWith("--week="))
    ?.split("=")[1];
  const force = process.argv.includes("--force");

  if (!weekArg) {
    console.error("Pass --week=<YYYY-MM-DD> (a Monday).");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set — nothing to do.");
    process.exit(1);
  }
  let isLocal = false;
  try {
    const { hostname } = new URL(databaseUrl);
    isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1";
  } catch {
    /* fall through */
  }
  if (!isLocal && !force) {
    console.error(
      "Refusing to run: DATABASE_URL does not point at localhost.\n" +
        "Re-run with --force if you mean to run this against that database (e.g. production). This script is read-only."
    );
    process.exit(1);
  }

  const { getWeeklyActivityReport } = await import("../../server/db");
  const result = await getWeeklyActivityReport(weekArg);

  console.log(JSON.stringify(result, null, 2));
  console.log(
    `\noperations: ${result.operations.length}, newIntelligence: ${result.newIntelligence.length}, targetActivity: ${result.targetActivity.length}`
  );
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
