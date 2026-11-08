/**
 * Read-only trial of the "New Intelligence" wording list (shared/intelCues.ts)
 * over the real running sheets. It only SELECTs: nothing in the database is
 * changed, and nothing leaves the machine — the result is a text file you read
 * and decide what to keep.
 *
 * Usage (from the app folder, on the server that has the real data):
 *   pnpm tsx scripts/dev/intel-cue-trial.ts
 *   pnpm tsx scripts/dev/intel-cue-trial.ts --since 2026-09-01
 *   pnpm tsx scripts/dev/intel-cue-trial.ts --operation 42 --out ~/trial-op42.txt
 *
 * The report has:
 *   1. how many rows it read and how many gave a cue, by category and heading;
 *   2. sample sentences for every heading (with the sheet and time), so you can
 *      say "yes, that is intelligence" or "no, that is noise";
 *   3. sentences that mention something it might have been expected to catch
 *      (bag, phone, cash, ATM, handed, mirror…) but gave NO cue — the misses to
 *      add wording for.
 * Rows from sheets or operations in the Recycle Bin are left out.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import {
  CUE_CATEGORY_LABELS,
  findIntelCues,
  splitCueSentences,
  type CueCategory,
} from "../../shared/intelCues";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const TRIGGERS =
  /\b(?:bags?|suitcases?|luggage|backpacks?|rucksacks?|parcels?|packages?|envelopes?|boxes|box|briefcases?|documents?|phones?|mobiles?|texting|text\s+message|laptops?|tablets?|cameras?|binoculars|radio|cash|money|notes|ATMs?|withdr\w+|deposit\w*|handed|passed|exchang\w+|swapp?\w+|shook|embrac\w+|hugged|mirrors?|u[- ]?turn|over\s+(?:his|her)\s+shoulder|counter[- ]?surveillance|changed\s+(?:his|her|their)?\s*(?:clothes|jacket|shirt|vehicle|car)|boot)\b/i;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const since = arg("since");
  const operationId = arg("operation");
  const out = path.resolve(
    (arg("out") ?? "intel-cue-trial-report.txt").replace(
      /^~/,
      process.env.HOME ?? "~"
    )
  );

  const conn = await mysql.createConnection(url);
  const where: string[] = [
    "s.deletedAt IS NULL",
    "o.deletedAt IS NULL",
    "r.observation IS NOT NULL",
    "r.observation <> ''",
  ];
  const params: Array<string | number> = [];
  if (since) {
    where.push("COALESCE(r.rowDate, s.sheetDate, DATE(r.createdAt)) >= ?");
    params.push(since);
  }
  if (operationId) {
    where.push("s.operationId = ?");
    params.push(Number(operationId));
  }
  const [rows] = (await conn.query(
    `SELECT r.id, r.time, r.observation, s.id AS sheetId, s.title AS sheetTitle, o.name AS opName
       FROM sheet_rows r
       JOIN running_sheets s ON s.id = r.sheetId
       JOIN operations o ON o.id = s.operationId
      WHERE ${where.join(" AND ")}
      ORDER BY r.id`,
    params
  )) as [
    Array<{
      id: number;
      time: string | null;
      observation: string;
      sheetId: number;
      sheetTitle: string;
      opName: string;
    }>,
    unknown,
  ];
  await conn.end();

  type Sample = { sentence: string; where: string; flags: string };
  const byHeading = new Map<
    string,
    { n: number; firm: number; doubtful: number; samples: Sample[] }
  >();
  const byCategory = new Map<CueCategory, number>();
  const misses: Sample[] = [];
  // A straight count from ONE sheet: the same item or action (a brown and a
  // black suitcase are both "suitcase") appearing more than once on it.
  const repeats = new Map<string, number>();
  let rowsWithCue = 0;

  for (const r of rows) {
    const cues = findIntelCues(r.observation);
    if (cues.length) rowsWithCue++;
    const cuedSentences = new Set(cues.map(c => c.sentence));
    const where = `${r.opName} · ${r.sheetTitle} · ${r.time ?? "no time"}`;
    for (const c of cues) {
      const rk = `${CUE_CATEGORY_LABELS[c.category]} / ${c.group}   [${r.opName} · ${r.sheetTitle}]`;
      repeats.set(rk, (repeats.get(rk) ?? 0) + 1);
      byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
      const key = `${CUE_CATEGORY_LABELS[c.category]} / ${c.heading}`;
      const e = byHeading.get(key) ?? {
        n: 0,
        firm: 0,
        doubtful: 0,
        samples: [],
      };
      e.n++;
      if (c.strength === "firm") e.firm++;
      if (c.doubtful) e.doubtful++;
      if (e.samples.length < 8)
        e.samples.push({
          sentence: c.sentence,
          where,
          flags: `${c.strength}${c.doubtful ? ", doubtful" : ""}; matched “${c.matched}”`,
        });
      byHeading.set(key, e);
    }
    for (const s of splitCueSentences(r.observation))
      if (!cuedSentences.has(s) && TRIGGERS.test(s))
        misses.push({ sentence: s, where, flags: "" });
  }

  // A repeatable spread of the misses (every Nth) instead of just the first few.
  const step = Math.max(1, Math.floor(misses.length / 80));
  const missSample = misses.filter((_, i) => i % step === 0).slice(0, 80);

  const L: string[] = [];
  L.push("NEW INTELLIGENCE — WORDING TRIAL (read-only)");
  L.push(`Run: ${new Date().toISOString()}`);
  L.push(
    `Filter: ${since ? "since " + since : "all dates"}${operationId ? `, operation ${operationId}` : ""}`
  );
  L.push("");
  L.push(`Rows read: ${rows.length}`);
  L.push(
    `Rows giving at least one cue: ${rowsWithCue} (${rows.length ? ((100 * rowsWithCue) / rows.length).toFixed(1) : 0}%)`
  );
  L.push("");
  L.push("BY CATEGORY (cues found)");
  for (const [c, label] of Object.entries(CUE_CATEGORY_LABELS))
    L.push(`  ${label}: ${byCategory.get(c as CueCategory) ?? 0}`);
  L.push("");
  L.push(
    "BY HEADING — most common first (firm = the sentence says it happened; low = a bare mention)"
  );
  const sorted = Array.from(byHeading.entries()).sort(
    (a, b) => b[1].n - a[1].n
  );
  for (const [k, v] of sorted)
    L.push(
      `  ${String(v.n).padStart(6)}  ${k}   (firm ${v.firm}, doubtful ${v.doubtful})`
    );
  L.push("");
  L.push(
    "MOST TIMES ON ONE SHEET — each line is one sheet (a straight count, nothing carried over from other sheets)"
  );
  for (const [k, n] of Array.from(repeats.entries())
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25))
    L.push(`  ${String(n).padStart(4)} times  ${k}`);
  L.push("");
  L.push("SAMPLES — mark each yes (intelligence) or no (noise)");
  for (const [k, v] of sorted) {
    L.push("");
    L.push(`## ${k}`);
    for (const s of v.samples) {
      L.push(`  - “${s.sentence}”`);
      L.push(`      ${s.where}   [${s.flags}]`);
    }
  }
  L.push("");
  L.push(
    `POSSIBLE MISSES — ${misses.length} sentences mention a bag / phone / cash / ATM / hand-over … word but gave no cue (showing ${missSample.length})`
  );
  L.push(
    "Say which of these SHOULD have been caught, and what the wording was after."
  );
  for (const s of missSample) {
    L.push(`  - “${s.sentence}”`);
    L.push(`      ${s.where}`);
  }
  fs.writeFileSync(out, L.join("\n") + "\n");
  console.log(
    `Read ${rows.length} rows; ${rowsWithCue} gave a cue. Report written to ${out}`
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
