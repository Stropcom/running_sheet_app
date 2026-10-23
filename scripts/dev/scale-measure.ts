/**
 * Times the app's real API calls against a running server that is pointed at
 * a database filled by seed-scale-data.ts, so the effect of years of data can
 * be measured. For each call it prints the first (cold) time, the next two
 * (warm) times and how much data comes back.
 *
 *   # terminal 1 — the app on the scale database
 *   DATABASE_URL=mysql://root@127.0.0.1:3307/runlog_scale JWT_SECRET=x \
 *     VITE_APP_ID=x PORT=3100 NODE_ENV=development pnpm tsx server/_core/index.ts
 *   # terminal 2
 *   SCALE_URL=http://localhost:3100 \
 *   DATABASE_URL=mysql://root@127.0.0.1:3307/runlog_scale \
 *   pnpm tsx scripts/dev/scale-measure.ts
 *
 * Signs in as the seeded officer1 (password "Scale-Test-1!"). Refuses to run
 * unless the database name ends in "_scale". Results are also written as JSON
 * to SCALE_OUT if set.
 */
import "dotenv/config";
import fs from "node:fs";
import mysql from "mysql2/promise";
import superjson from "superjson";

const BASE = process.env.SCALE_URL ?? "http://localhost:3100";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !/_scale$/.test(new URL(dbUrl).pathname.replace(/^\//, "")))
    throw new Error('DATABASE_URL must point at a database ending in "_scale"');
  const conn = await mysql.createConnection(dbUrl);
  const one = async (sql: string) => ((await conn.query(sql))[0] as any[])[0];
  const counts = {
    operations: (await one("SELECT COUNT(*) n FROM operations")).n,
    sheets: (await one("SELECT COUNT(*) n FROM running_sheets")).n,
    rows: (await one("SELECT COUNT(*) n FROM sheet_rows")).n,
    photos: (await one("SELECT COUNT(*) n FROM row_attachments")).n,
    targets: (await one("SELECT COUNT(*) n FROM targets")).n,
  };
  // a recent, busy operation / sheet / target to ask about
  const sheet = await one(
    "SELECT id, operationId, targetId FROM running_sheets ORDER BY id DESC LIMIT 1"
  );
  const weekStart = (
    await one(
      "SELECT DATE_FORMAT(DATE_SUB(MAX(sheetDate), INTERVAL WEEKDAY(MAX(sheetDate)) DAY), '%Y-%m-%d') d FROM running_sheets"
    )
  ).d;
  await conn.end();

  // sign in
  const login = await fetch(`${BASE}/api/trpc/auth.login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      superjson.serialize({ username: "officer1", password: "Scale-Test-1!" })
    ),
  });
  const cookie = (login.headers.getSetCookie?.() ?? [])
    .map(c => c.split(";")[0])
    .join("; ");
  if (!cookie)
    throw new Error("sign-in failed: " + (await login.text()).slice(0, 200));

  const calls: { name: string; path: string; input?: unknown }[] = [
    { name: "Operations list (home page)", path: "operation.list" },
    {
      name: "Running sheets of one operation",
      path: "sheet.listByOperation",
      input: { operationId: sheet.operationId },
    },
    {
      name: "Open a sheet (rows, members, photos)",
      path: "row.list",
      input: { sheetId: sheet.id },
    },
    { name: "Sheet Check", path: "sheet.check", input: { sheetId: sheet.id } },
    {
      name: "Intelligence Folder (all entities)",
      path: "intelligence.getEntities",
    },
    {
      name: "Suggest a vehicle as you type",
      path: "intelligence.searchEntities",
      input: { type: "vehicle", query: "1A", excludeTargets: false },
    },
    {
      name: "Suggest a person as you type",
      path: "intelligence.searchEntities",
      input: { type: "person", query: "SMI", excludeTargets: false },
    },
    {
      name: "Operation profile",
      path: "intelligence.operationProfile",
      input: { operationId: sheet.operationId },
    },
    {
      name: "Target profile",
      path: "intelligence.targetProfile",
      input: { targetId: sheet.targetId },
    },
    {
      name: "Heat Map (all time)",
      path: "intelligence.getHeatMapLocations",
      input: { operationId: sheet.operationId, when: { mode: "all" } },
    },
    {
      name: "Pattern of life",
      path: "intelligence.getPatternOfLife",
      input: { operationId: sheet.operationId, targetId: sheet.targetId },
    },
    {
      name: "Association graph",
      path: "intelligence.getAssociationGraph",
      input: { operationId: sheet.operationId },
    },
    {
      name: "Weekly Activity report",
      path: "reports.weeklyActivity",
      input: { weekStart },
    },
    { name: "Incomplete sheets report", path: "reports.incompleteSheets" },
    {
      name: "Deep search",
      path: "operation.deepSearch",
      input: { query: "Operation 1" },
    },
    { name: "Target Registry list", path: "target.registry.list" },
    { name: "Audit log (all)", path: "auditLog.all" },
    { name: "Recycle Bin", path: "recycleBin.list" },
    { name: "To-do: outstanding for me", path: "sheet.outstandingForMe" },
    {
      name: "Governance summary (operation)",
      path: "governance.summaryByOperation",
      input: { operationId: sheet.operationId },
    },
  ];

  // SCALE_ONLY="Incomplete" times only the calls whose name contains the text
  const only = process.env.SCALE_ONLY?.toLowerCase();
  const selected = only
    ? calls.filter(c => c.name.toLowerCase().includes(only))
    : calls;
  const results: any[] = [];
  const time = async (c: (typeof calls)[number]) => {
    const url =
      `${BASE}/api/trpc/${c.path}` +
      (c.input === undefined
        ? ""
        : `?input=${encodeURIComponent(JSON.stringify(superjson.serialize(c.input)))}`);
    const t0 = performance.now();
    const res = await fetch(url, { headers: { cookie } });
    const body = await res.arrayBuffer();
    return {
      ms: performance.now() - t0,
      bytes: body.byteLength,
      status: res.status,
    };
  };
  console.log(`Data: ${JSON.stringify(counts)}\n`);
  console.log(
    "call".padEnd(44),
    "cold".padStart(9),
    "warm".padStart(9),
    "warm".padStart(9),
    "size".padStart(10),
    " status"
  );
  for (const c of selected) {
    // a call that already takes over 5 s is not repeated (it would only slow the run)
    const a = await time(c);
    const b = a.ms > 5000 ? a : await time(c);
    const d = a.ms > 5000 ? a : await time(c);
    const fmt = (n: number) =>
      (n >= 1000
        ? (n / 1000).toFixed(2) + " s"
        : n.toFixed(0) + " ms"
      ).padStart(9);
    const size =
      a.bytes > 1e6
        ? (a.bytes / 1e6).toFixed(1) + " MB"
        : (a.bytes / 1e3).toFixed(0) + " KB";
    console.log(
      c.name.padEnd(44),
      fmt(a.ms),
      fmt(b.ms),
      fmt(d.ms),
      size.padStart(10),
      " ",
      a.status
    );
    results.push({
      name: c.name,
      path: c.path,
      coldMs: Math.round(a.ms),
      warmMs: [Math.round(b.ms), Math.round(d.ms)],
      bytes: a.bytes,
      status: a.status,
    });
  }
  if (process.env.SCALE_OUT)
    fs.writeFileSync(
      process.env.SCALE_OUT,
      JSON.stringify({ counts, results }, null, 2)
    );
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
