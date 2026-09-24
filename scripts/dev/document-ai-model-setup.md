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
`localDocumentAI.ts`'s header). The quantized weight file itself is
**confirmed 1505MB** (`onnx/decoder_model_merged_quantized.onnx`,
measured from a real fetch against the actual repo on the droplet this
was deployed to — not an estimate). What that costs once loaded into
RAM alongside the rest of the running app hasn't been confirmed the same
way yet — watch memory closely through the model's first real load
(`free -h`, `pm2 monit`, or `scripts/dev/document-ai-eval.ts`'s forced
smoke test) rather than assuming it'll just work. If the app becomes
unresponsive or the process gets OOM-killed when this runs, that's the
droplet needing another resize, not a bug to chase in the code.

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

Expected repo layout — the weight filename below is **not a guess about
the repo**, it's fixed by `@xenova/transformers@2.17.2` itself (this
repo's pinned version): `constructSession()` in
`node_modules/@xenova/transformers/src/models.js` builds the path as
`onnx/${fileName}${quantized ? '_quantized' : ''}.onnx`, and for any
decoder-only causal LM (which `Qwen2ForCausalLM` is) `fileName` defaults
to `'decoder_model_merged'` — confirmed the hard way, by a real deploy
attempt against the actual 1.5B repo throwing exactly this filename in
its "file was not found locally" error. (An earlier version of this doc
said `onnx/model_quantized.onnx`, based on a web search result for a
sibling repo — that was wrong; don't use it.)

```
server/models/
  onnx-community/
    Qwen2.5-1.5B-Instruct/
      config.json
      tokenizer.json
      tokenizer_config.json
      onnx/
        decoder_model_merged_quantized.onnx
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
curl -L -o onnx/decoder_model_merged_quantized.onnx "https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct/resolve/main/onnx/decoder_model_merged_quantized.onnx"
```

**If someone already fetched `onnx/model_quantized.onnx` under the old
(wrong) instructions**, that file can be deleted — it's the wrong name
and the app will never look for it:

```bash
rm -f server/models/onnx-community/Qwen2.5-1.5B-Instruct/onnx/model_quantized.onnx
```

**If the `decoder_model_merged_quantized.onnx` fetch 404s**, the repo's
actual layout differs from this — browse
`https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct/tree/main/onnx`
in a browser to see the real name(s) available, fetch that instead, and
either rename it to `decoder_model_merged_quantized.onnx` locally or pass
`{ model_file_name: "<real-name-without-_quantized.onnx-suffix>" }` as a
`pipeline()` option in `getDocumentAIPipeline()`
(`server/documentImport/localDocumentAI.ts`) to override the library's
default.

## Verifying it worked

```bash
ls -la server/models/onnx-community/Qwen2.5-1.5B-Instruct/onnx/decoder_model_merged_quantized.onnx
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
