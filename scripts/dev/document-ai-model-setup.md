# Local Document AI model — manual deployment step

`server/models/` is where the local document-reading model lives at
runtime (`server/documentImport/localDocumentAI.ts`, used by the document
import review screen — Step 3 of the Local AI Roadmap). Same story as the
other two local models (`scripts/dev/voice-model-setup.md`,
`scripts/dev/ner-model-setup.md`): not committed to git, this sandbox's
network policy blocks fetching it directly, this is a one-time manual step
for whoever deploys this branch.

## ⚠️ Read this before deploying — heavier than the model this replaces, and needs a newer library

This step was upgraded from `Xenova/LaMini-Flan-T5-783M` to
**`onnx-community/Qwen2.5-1.5B-Instruct`** — roughly 2x the parameter
count, for meaningfully better instruction-following (chat-template
prompting, explicit "don't invent details" instructions, a
verify-and-correct task in addition to plain extraction — see
`localDocumentAI.ts`'s header). The quantized weight file itself is
**confirmed 1505MB** (`onnx/model_quantized.onnx`).

**RAM: confirmed 8GB minimum, not an estimate.** A real deployment
attempt on a 4GB droplet was OOM-killed by the kernel outright —
`dmesg` showed the one Node process alone using ~3.6GB resident RAM
once the model actually loaded, more than the droplet's entire 3.8Gi
total. This droplet was resized to 8GB (2 vCPU, same 35GB disk) and
that comfortably covers it (~3.6GB model + baseline app/MySQL/nginx
against ~7.8Gi total). Do not deploy this to anything smaller than 8GB
RAM — it will not just run slowly, it will be killed.

**Library: this repo now runs `@huggingface/transformers`, not
`@xenova/transformers`.** The model repo's ONNX files are built with a
newer ONNX IR version (10) than `@xenova/transformers`' old bundled
`onnxruntime-node@1.14.0` can parse at all — a real deploy attempt threw
`Unsupported model IR version: 10, max supported IR version: 8` on
every backend (native and WASM fallback both failed the same way). This
isn't fixable by picking a different file or adding an option —
`@xenova/transformers` genuinely cannot load any current onnx-community
export. `@huggingface/transformers` (the same project/maintainer,
continued under the Hugging Face org — see `package.json`) pulls in a
current `onnxruntime-node`/`onnxruntime-web` that parses this fine.
`server/localNER.ts` uses the same package now too, for consistency (one
AI runtime library in the app, not two) — see that file's own header for
anything specific to it.

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
instruction-tuned chat model. `@huggingface/transformers@4.3.0` (this
repo's pinned version — see `package.json`) supports chat-array input
directly on the `text-generation` pipeline: pass an array of
`{role, content}` messages and it internally calls the tokenizer's own
`apply_chat_template` and returns only the newly generated assistant
turn — confirmed from this repo's own installed copy of the library
(`node_modules/@huggingface/transformers/src/pipelines/text-generation.js`,
which special-cases chat input identically to how the previous
`@xenova/transformers` version did), not just from memory. That means the
model's own `tokenizer_config.json` (which carries the chat template)
must be fetched too, not just `config.json`.

Expected repo layout — the weight file is `onnx/model_quantized.onnx`,
confirmed two ways: a real successful fetch against the live 1.5B repo
(1505MB, no 404), and `@huggingface/transformers`' own default base
filename for a decoder-only model being `"model"` (confirmed from
`node_modules/@huggingface/transformers/src/models/session_config.js`'s
`MODEL_SESSION_CONFIG[MODEL_TYPES.DecoderOnly]`) — combined with
`dtype: "q8"` in `getDocumentAIPipeline()`
(`server/documentImport/localDocumentAI.ts`), which maps to the
`_quantized` filename suffix. No `model_file_name` override is needed —
this library's own default already matches what onnx-community
publishes (unlike the previous `@xenova/transformers` version, whose
different default, `"decoder_model_merged"`, didn't exist in this repo
at all and needed an explicit override — moot now, but see this file's
git history if that class of mismatch ever resurfaces with a different
model).

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

**If the fetch 404s** (it shouldn't — this exact URL was confirmed
working, 1505MB, during this model's own deployment), the repo's layout
has changed since — browse
`https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct/tree/main/onnx`
in a browser to see the real name(s) available. If it's still a `model*`
family file but a different quantization (e.g. `model_int8.onnx` instead
of `model_quantized.onnx`), just fetch that file and change `dtype` in
`getDocumentAIPipeline()` (`server/documentImport/localDocumentAI.ts`) to
match, per `DEFAULT_DTYPE_SUFFIX_MAPPING` in
`node_modules/@huggingface/transformers/src/utils/dtypes.js` (`q8` →
`_quantized`, `int8` → `_int8`, `fp16` → `_fp16`, `q4` → `_q4`, etc). If
the base name isn't `"model"` at all, pass
`{ model_file_name: "<real-base-name>" }` as an additional `pipeline()`
option to override the library's default.

## Verifying it worked

```bash
ls -la server/models/onnx-community/Qwen2.5-1.5B-Instruct/onnx/model_quantized.onnx
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
