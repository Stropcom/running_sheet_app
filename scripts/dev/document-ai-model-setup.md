# Local Document AI model — manual deployment step

`server/models/` is where the local document-reading model lives at
runtime (`server/documentImport/localDocumentAI.ts`, used by the document
import review screen — Step 3 of the Local AI Roadmap). Same story as the
other two local models (`scripts/dev/voice-model-setup.md`,
`scripts/dev/ner-model-setup.md`): not committed to git, this sandbox's
network policy blocks fetching it directly, this is a one-time manual step
for whoever deploys this branch.

## ⚠️ Read this before deploying — heavier than the model this replaces

This step was upgraded from `Xenova/LaMini-Flan-T5-783M` to
**`onnx-community/Qwen2.5-1.5B-Instruct`** — roughly 2x the parameter
count, for meaningfully better instruction-following (chat-template
prompting, explicit "don't invent details" instructions, a
verify-and-correct task in addition to plain extraction — see
`localDocumentAI.ts`'s header). Measured on this droplet: ~3.0Gi free at
steady state (`free -h`). A real sibling model
(`onnx-community/Qwen2.5-0.5B-Instruct`) has a confirmed 512MB q8
`model_quantized.onnx` — extrapolating (not measured) puts the 1.5B q8
weights at roughly ~1.4–1.6GB, ~1.8–2.2GB total runtime footprint. Watch
memory closely the first time this actually runs (`free -h`, `pm2
monit`) rather than assuming it'll just work. If the app becomes
unresponsive or the process gets OOM-killed when a document import
triggers this, that's the droplet needing another resize, not a bug to
chase in the code.

## What must never happen

Per CLAUDE.md's Golden Rule, this app must never call an external AI/LLM
service at runtime. Populating `server/models/` is a **build-time** step
done once during deployment — `env.allowRemoteModels = false` (set in
`localDocumentAI.ts`) means the running app will never attempt to reach
that host, or any other, to get them once these files are in place. If
the directory is empty, `parseDocument` still works exactly as before —
it just skips the AI-suggestion pass and returns `aiModelStatus: "missing"`
(surfaced in the import dialog as a small note, not an error).

## ⚠️ This has not been run against the real model

Like Step 2, this has **not** been exercised against real weights
anywhere — this sandbox can't fetch them to try. The pure functions that
don't need the model (`buildExtractPrompt`, `buildVerifyPrompt`,
`parseModelReply`) are unit-tested in `localDocumentAI.test.ts`; the
model-loading and actual-inference path, and the chat-template formatting
transformers.js applies internally for chat-array input, are not. Treat
it as unverified until someone runs a real document import against it and
checks the suggestions make sense — see "Verifying it worked" below for a
concrete eval to run first.

## What to fetch

Model: **`onnx-community/Qwen2.5-1.5B-Instruct`** — a decoder-only,
instruction-tuned chat model. `@xenova/transformers@2.17.2` (this repo's
pinned version — see `package.json`) supports chat-array input directly
on the `text-generation` pipeline: pass an array of `{role, content}`
messages and it internally calls the tokenizer's own
`apply_chat_template` and returns only the newly generated assistant
turn — confirmed from this repo's own installed copy of the library
(`node_modules/@xenova/transformers/src/pipelines.js`'s
`TextGenerationPipeline._call`, which special-cases chat input), not just
from memory. That means the model's own `tokenizer_config.json` (which
carries the chat template) must be fetched too, not just `config.json`.

Expected repo layout (⚠️ **not confirmed against the real 1.5B repo
directly** — this sandbox's network policy blocks reaching the model host
to check; inferred from the confirmed `onnx/model_quantized.onnx` layout
of the sibling `onnx-community/Qwen2.5-0.5B-Instruct` repo, a single
merged decoder file, unlike the encoder/decoder split the previous T5
model used — check the actual file names in the 1.5B repo and adjust
`WEIGHT_FILE_PATHS` in `localDocumentAI.ts` if they differ):

```
server/models/
  onnx-community/
    Qwen2.5-1.5B-Instruct/
      config.json
      tokenizer.json
      tokenizer_config.json
      onnx/
        model_quantized.onnx
```

## ⚠️ Git LFS trap — do not `git clone` the model repo directly

Same trap as the other two models — see `scripts/dev/voice-model-setup.md`'s
"Git LFS trap" section. Use the Hub's `resolve` endpoint, which always
serves real content regardless of LFS:

```bash
mkdir -p server/models/onnx-community/Qwen2.5-1.5B-Instruct/onnx
cd server/models/onnx-community/Qwen2.5-1.5B-Instruct
for f in config.json tokenizer.json tokenizer_config.json; do
  curl -L -o "$f" "https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct/resolve/main/$f"
done
curl -L -o onnx/model_quantized.onnx "https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct/resolve/main/onnx/model_quantized.onnx"
```

**If the `onnx/` file 404s**, the repo's actual file name differs from
what's assumed above — browse
`https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct/tree/main/onnx`
in a browser to see the real name, fetch that instead, and update
`WEIGHT_FILE_PATHS` in `server/documentImport/localDocumentAI.ts` to
match.

## Verifying it worked

```bash
ls -la server/models/onnx-community/Qwen2.5-1.5B-Instruct/onnx/*.onnx
```

Should be well over 1GB (a 1.5B-parameter model quantized to q8 is a
meaningfully large file) — not ~130 bytes (a Git LFS pointer stub, see
above).

After fetching, restart the app (`pm2 restart runlog`) and try importing
a real document that has at least one address or vehicle the existing
rules can't parse cleanly (deliberately messy formatting), and at least
one it parses but not confidently. The review screen should show:

- an "AI suggests: …" line (violet) under a `needsReview` item or a
  low-confidence field the model proposed something different for, or
- an "AI independently reads this the same way." line (emerald) under a
  low-confidence field where the model's own reading agrees with the
  rules', or
- nothing at all, when the model had nothing usable or its suggestion
  didn't survive being re-parsed by the app's own address/vehicle parsers
  (`server/documentImport/documentAIVerify.ts`) — this is expected and
  correct, not a failure to chase.

For a more thorough check than one manual import, run:

```bash
pnpm tsx scripts/dev/document-ai-eval.ts
```

This runs every real training-document fixture already in
`server/documentImport/__fixtures__/` through the same needsReview +
low-confidence AI passes `parseDocument` runs, and prints each field's
rules-reading alongside the model's confirmed/suggested/declined outcome
— a human then eyeballs the "suggested" lines against the source document
by hand (there's no hand-coded "correct answer" file for the AI's output
to assert against, only for the rules' own output — see
`targetProfileFieldMap.test.ts`). This sandbox can't run it (can't fetch
real weights), so it's untested — check it still runs cleanly once
weights are actually in place, and fix anything that doesn't line up
with `localDocumentAI.ts`'s real exports if the two have drifted.
