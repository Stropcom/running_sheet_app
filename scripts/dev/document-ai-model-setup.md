# Local Document AI model — manual deployment step

`server/models/` is where the local document-reading model lives at
runtime (`server/documentImport/localDocumentAI.ts`, used by the document
import review screen — Step 3 of the Local AI Roadmap). Same story as the
other two local models (`scripts/dev/voice-model-setup.md`,
`scripts/dev/ner-model-setup.md`): not committed to git, this sandbox's
network policy blocks fetching it directly, this is a one-time manual step
for whoever deploys this branch.

## ⚠️ Read this before deploying — heavier than the other two models

**LaMini-Flan-T5-783M is roughly 7x the parameter count of
bert-base-NER** (Step 2's model). The Local AI Roadmap originally scoped
this step for a bigger droplet tier than Steps 1 & 2 need — if this is
being deployed on the same droplet that's only been sized for Steps 1 & 2
so far, watch memory closely the first time this actually runs (`free -h`,
`pm2 monit`) rather than assuming it'll just work. If the app becomes
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
anywhere — this sandbox can't fetch them to try. The two pure functions
that don't need the model (`buildNeedsReviewPrompt`, `parseModelReply`)
are unit-tested in `localDocumentAI.test.ts`; the model-loading and
actual-inference path is not. Treat it as unverified until someone runs a
real document import against it and checks the suggestions make sense.

## What to fetch

Model: **`Xenova/LaMini-Flan-T5-783M`** — an instruction-tuned
encoder-decoder model, the documented example model for
`@xenova/transformers`' `text2text-generation` pipeline (confirmed from
this repo's own installed copy of the library —
`node_modules/@xenova/transformers/types/pipelines.d.ts`'s own worked
example uses this exact model — not just from memory). Double-check it
still resolves on Hugging Face Hub before fetching.

Expected repo layout (⚠️ **not confirmed against the real Hugging Face
repo** — this is inferred from the same encoder/decoder split the Whisper
voice model uses, since both are encoder-decoder architectures unlike
Step 2's single-file BERT model; check the actual file names in the repo
and adjust `WEIGHT_FILE_PATHS` in `localDocumentAI.ts` if they differ):

```
server/models/
  Xenova/
    LaMini-Flan-T5-783M/
      config.json
      tokenizer.json
      tokenizer_config.json
      onnx/
        encoder_model_quantized.onnx
        decoder_model_merged_quantized.onnx
```

## ⚠️ Git LFS trap — do not `git clone` the model repo directly

Same trap as the other two models — see `scripts/dev/voice-model-setup.md`'s
"Git LFS trap" section. Use the Hub's `resolve` endpoint, which always
serves real content regardless of LFS:

```bash
mkdir -p server/models/Xenova/LaMini-Flan-T5-783M/onnx
cd server/models/Xenova/LaMini-Flan-T5-783M
for f in config.json tokenizer.json tokenizer_config.json; do
  curl -L -o "$f" "https://huggingface.co/Xenova/LaMini-Flan-T5-783M/resolve/main/$f"
done
curl -L -o onnx/encoder_model_quantized.onnx "https://huggingface.co/Xenova/LaMini-Flan-T5-783M/resolve/main/onnx/encoder_model_quantized.onnx"
curl -L -o onnx/decoder_model_merged_quantized.onnx "https://huggingface.co/Xenova/LaMini-Flan-T5-783M/resolve/main/onnx/decoder_model_merged_quantized.onnx"
```

**If either `onnx/` file 404s**, the repo's actual file names differ from
what's assumed above — browse
`https://huggingface.co/Xenova/LaMini-Flan-T5-783M/tree/main/onnx` in a
browser to see the real names, fetch those instead, and update
`WEIGHT_FILE_PATHS` in `server/documentImport/localDocumentAI.ts` to
match.

## Verifying it worked

```bash
ls -la server/models/Xenova/LaMini-Flan-T5-783M/onnx/*.onnx
```

Both files should be several megabytes at minimum (a 783M-parameter model
quantized is still a meaningfully large file — expect somewhere in the
hundreds of MB total across both halves, not tens like Step 2's smaller
model) — not ~130 bytes (a Git LFS pointer stub, see above).

After fetching, restart the app (`pm2 restart runlog`) and try importing a
document that has at least one address or vehicle the existing rules
can't parse cleanly (deliberately messy formatting) — the review screen
should show an "AI read this as: …" line under that item if the model
produced a usable suggestion.
