/**
 * Local Document AI eval — runs the real Qwen2.5-1.5B-Instruct model (once
 * its weights are deployed, see document-ai-model-setup.md) over every
 * real training document fixture in server/documentImport/__fixtures__/
 * and prints, per address/vehicle field, the rules' own reading side by
 * side with the model's outcome — so a human can eyeball whether the
 * upgraded model is actually helping before trusting it in production.
 *
 * This sandbox can't fetch model weights to run this itself — it's built
 * for whoever deploys real weights to run next. It does NOT assert
 * pass/fail against hand-coded "correct" answers (none exist for these
 * fixtures beyond what targetProfileFieldMap.test.ts already encodes as
 * expectations on the RULES' output, not the AI's) — it's a reporting
 * tool for a human reviewer, not a CI gate.
 *
 * Runs a forced smoke test first (runSmokeTest below), before the
 * per-fixture loop — the AI-assist pass only ever runs against a
 * document when the rules found something to be unsure about
 * (needsReview items, or a low-confidence address/vehicle), and the real
 * training fixtures here are exactly the documents the rule-based parser
 * was already hardened against (see targetProfileFieldMap.test.ts's own
 * "reports an empty needsReview for both real fixtures" test) — so it's
 * entirely possible, and NOT a bug, for every fixture to come back 0
 * confirmed/0 suggested/0 declined, meaning the model was never even
 * invoked. The smoke test exists specifically so a 0/0/0 run still tells
 * you whether the model loads and produces a sane reply at all, rather
 * than leaving that question unanswered.
 *
 * Usage: pnpm tsx scripts/dev/document-ai-eval.ts
 */
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDocxTables } from "../../server/documentImport/docxTableReader";
import { readPdfText } from "../../server/documentImport/pdfTextReader";
import { mapDocumentToTargetProfile } from "../../server/documentImport/targetProfileFieldMap";
import {
  getDocumentAIModelStatus,
  suggestExtractedValue,
  suggestVerifiedCorrection,
} from "../../server/documentImport/localDocumentAI";
import {
  verifyAISuggestion,
  composeParsedValue,
} from "../../server/documentImport/documentAIVerify";

// package.json's "type": "module" means this runs as ESM under tsx, where
// __dirname isn't defined — derive the equivalent from import.meta.url
// instead, so this resolves correctly regardless of the shell's cwd.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURES_DIR = path.join(
  __dirname,
  "../../server/documentImport/__fixtures__"
);

// Real, hand-authored training documents only — the synthetic pdfTextReader
// regression fixtures (target-profile-pdf-*.pdf) exist to pin one specific
// geometry bug each and aren't representative documents to eval accuracy
// against.
const FIXTURE_NAME_FILTER = /^target-profile-training/;

/**
 * Forces one real model invocation regardless of what any fixture needs,
 * so this script always answers "does the model actually load and run on
 * this machine" even when every fixture's totals come back 0/0/0. Times
 * the call, since the first invocation includes cold model load (reading
 * ~1.5GB of ONNX weights off disk and initialising the runtime) as well
 * as inference — worth knowing separately from steady-state latency.
 */
async function runSmokeTest(): Promise<void> {
  console.log("=== Smoke test (forces the model to load) ===");
  const startedAt = Date.now();
  const reply = await suggestExtractedValue(
    "address",
    "",
    "he was seen near the shop on the corner, sort of Wanneroo way"
  );
  const elapsedMs = Date.now() - startedAt;
  console.log(
    `  extract call: ${elapsedMs}ms, raw model reply: ${
      reply === null ? "(none / unknown)" : `"${reply}"`
    }`
  );
  if (reply === null) {
    console.log(
      "  (a null reply here is fine — this input is deliberately too vague for a real address. What matters is that the call completed at all, and how long it took.)"
    );
  }
}

async function evalOneFixture(fileName: string) {
  const buffer = await readFile(path.join(FIXTURES_DIR, fileName));
  const isPdf = fileName.toLowerCase().endsWith(".pdf");
  const read = isPdf ? await readPdfText(buffer) : await readDocxTables(buffer);
  const mapped = mapDocumentToTargetProfile(read);

  console.log(`\n=== ${fileName} ===`);

  let confirmed = 0;
  let suggested = 0;
  let declined = 0;

  for (const item of mapped.needsReview) {
    const raw = await suggestExtractedValue(item.kind, item.label, item.raw);
    const outcome = raw ? verifyAISuggestion(item.kind, raw, null) : null;
    console.log(`  [needsReview/${item.kind}] "${item.raw}"`);
    if (!outcome || outcome.status === "declined") {
      declined++;
      console.log(`    -> declined`);
    } else {
      suggested++;
      console.log(`    -> suggested: "${outcome.value}"`);
    }
  }

  for (const a of mapped.addresses) {
    if (a.confident) continue;
    const currentValue = composeParsedValue("address", a);
    const raw = await suggestVerifiedCorrection(
      "address",
      a.label,
      a.raw,
      currentValue
    );
    const outcome = raw
      ? verifyAISuggestion("address", raw, currentValue)
      : null;
    console.log(`  [address, low-confidence] rules: "${currentValue}"`);
    if (!outcome || outcome.status === "declined") {
      declined++;
      console.log(`    -> declined`);
    } else if (outcome.status === "confirmed") {
      confirmed++;
      console.log(`    -> confirmed`);
    } else {
      suggested++;
      console.log(`    -> suggested: "${outcome.value}"`);
    }
  }

  for (const v of mapped.vehicles) {
    if (v.confident) continue;
    const currentValue = composeParsedValue("vehicle", v);
    const raw = await suggestVerifiedCorrection(
      "vehicle",
      "",
      v.raw,
      currentValue
    );
    const outcome = raw
      ? verifyAISuggestion("vehicle", raw, currentValue)
      : null;
    console.log(`  [vehicle, low-confidence] rules: "${currentValue}"`);
    if (!outcome || outcome.status === "declined") {
      declined++;
      console.log(`    -> declined`);
    } else if (outcome.status === "confirmed") {
      confirmed++;
      console.log(`    -> confirmed`);
    } else {
      suggested++;
      console.log(`    -> suggested: "${outcome.value}"`);
    }
  }

  console.log(
    `  totals: ${confirmed} confirmed, ${suggested} suggested, ${declined} declined`
  );
  return { confirmed, suggested, declined };
}

async function main() {
  const status = await getDocumentAIModelStatus();
  if (status !== "ready") {
    console.error(
      `Document AI model status is "${status}", not "ready" — deploy the real model weights first (see scripts/dev/document-ai-model-setup.md).`
    );
    process.exit(1);
  }

  const files = (await readdir(FIXTURES_DIR)).filter(f =>
    FIXTURE_NAME_FILTER.test(f)
  );
  if (files.length === 0) {
    console.error(
      `No fixtures matched ${FIXTURE_NAME_FILTER} in ${FIXTURES_DIR}`
    );
    process.exit(1);
  }

  await runSmokeTest();

  let totalConfirmed = 0;
  let totalSuggested = 0;
  let totalDeclined = 0;
  for (const file of files) {
    const { confirmed, suggested, declined } = await evalOneFixture(file);
    totalConfirmed += confirmed;
    totalSuggested += suggested;
    totalDeclined += declined;
  }

  console.log(
    `\n=== Overall: ${totalConfirmed} confirmed, ${totalSuggested} suggested, ${totalDeclined} declined across ${files.length} document(s) ===`
  );
  console.log(
    "Review each 'suggested' line above against its document by hand — this script reports what the model said, it does not judge whether it's right."
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
