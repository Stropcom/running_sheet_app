#!/usr/bin/env node
// File-size ratchet. Big files are hard to change safely (see
// docs/features/dev-and-ops.md, "Big-file plan"). This check lets a file that is
// already over the limit stay as it is or get SMALLER, never bigger, and keeps
// every other file at or under the limit.
//
//   node scripts/check-file-sizes.mjs          check (what CI runs)
//   node scripts/check-file-sizes.mjs --update  lower the baseline to today's
//                                               sizes (after a file shrinks)
//
// The baseline is scripts/file-size-baseline.json: { "path": lines }.
// Adding a file to it by hand is not allowed; only --update writes it, and
// --update refuses to add a file or raise a number.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const LIMIT = 2000;
const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const BASELINE = join(ROOT, "scripts", "file-size-baseline.json");
const DIRS = ["client/src", "server", "shared", "e2e", "scripts"];
const EXT = /\.(ts|tsx|mjs|css)$/;

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith("."))
      continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
}

function lineCount(p) {
  const t = readFileSync(p, "utf8");
  if (!t) return 0;
  return t.split("\n").length - (t.endsWith("\n") ? 1 : 0);
}

const files = [];
for (const d of DIRS) {
  const abs = join(ROOT, d);
  if (existsSync(abs)) walk(abs, files);
}
const sizes = {};
for (const f of files) sizes[relative(ROOT, f).split("\\").join("/")] = lineCount(f);

const baseline = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, "utf8"))
  : {};
const update = process.argv.includes("--update");

const problems = [];
for (const [path, n] of Object.entries(sizes)) {
  const allowed = baseline[path];
  if (allowed === undefined) {
    if (n > LIMIT)
      problems.push(
        `${path} is ${n} lines (limit ${LIMIT}). Put the new code in its own file.`
      );
  } else if (n > allowed) {
    problems.push(
      `${path} grew from ${allowed} to ${n} lines. A file over ${LIMIT} lines may only shrink: move the piece you are changing into its own file.`
    );
  }
}
if (update) {
  // Only ever lower or drop entries; never add or raise.
  const out = {};
  for (const [path, n] of Object.entries(sizes)) {
    if (n <= LIMIT) continue;
    if (baseline[path] === undefined && Object.keys(baseline).length > 0) {
      console.error(`Refusing to add ${path} (${n} lines) to the baseline.`);
      process.exit(1);
    }
    out[path] = Math.min(n, baseline[path] ?? n);
  }
  const sorted = Object.fromEntries(
    Object.entries(out).sort((a, b) => b[1] - a[1])
  );
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Baseline written: ${Object.keys(sorted).length} files over ${LIMIT} lines.`);
  process.exit(0);
}

if (problems.length) {
  console.error("File-size check failed:\n");
  for (const p of problems) console.error("  • " + p);
  console.error(
    "\nSee 'Big-file plan' in docs/features/dev-and-ops.md. If a file shrank, run: node scripts/check-file-sizes.mjs --update"
  );
  process.exit(1);
}
const stale = Object.entries(baseline).filter(
  ([p]) => sizes[p] !== undefined && sizes[p] < baseline[p]
);
if (stale.length)
  console.log(
    `Note: ${stale.length} file(s) are smaller than the baseline — run with --update to lock in the gain.`
  );
console.log(
  `File sizes OK (${Object.keys(baseline).length} files over ${LIMIT} lines held at their baseline, none grew).`
);
