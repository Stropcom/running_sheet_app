# Voice observation model — manual deployment step

`client/public/models/` is where the local Whisper speech-to-text model
lives at runtime (`client/src/lib/voiceTranscription.ts`). It is **not**
committed to git — the model weights are tens of megabytes of binary, the
same reason `node_modules` and `dist/` aren't committed either — and this
sandbox's network policy blocks fetching them directly (the model host is
not on the reachable-host allowlist), so they weren't fetched as part of
building this feature. This is a one-time manual step for whoever deploys
this branch.

This file lives under `scripts/dev/` deliberately — it's the one path in
this repo the no-runtime-ai guard exempts for referencing an AI-host name as
plain documentation (see CLAUDE.md's Golden Rule section and
`.claude/hooks/check-no-runtime-ai.sh`); `client/public/models/README.md`
just points here rather than repeating the host name itself.

## What must never happen

Per CLAUDE.md's Golden Rule, this app must never call an external AI/LLM
service at runtime. Populating `client/public/models/` is a **build-time**
step done once during deployment — it is not a runtime fetch, and once
these files are in place `env.allowRemoteModels = false` (set in
`voiceTranscription.ts`) means the running app will never attempt to reach
that host, or any other, to get them. If the directory is empty, the voice
button shows "voice model not installed"
(`isVoiceModelAvailable()` in `voiceTranscription.ts`) rather than silently
falling back to a network call.

## What to fetch

Model: **`Xenova/whisper-tiny.en`** (the quantized ONNX build) — Whisper's
smallest English-only model, the right starting point for Phase 1 testing
per the "Local Voice Observation" plan; swap for `Xenova/whisper-base.en` or
similar later if accuracy needs it (same directory shape either way, just
change `VOICE_MODEL_ID` in `voiceTranscription.ts` and the folder name below
to match).

From a machine that can reach the model host, fetch every file in the
`Xenova/whisper-tiny.en` model repository on Hugging Face Hub
(huggingface.co) into `client/public/models/`, preserving the repo's own
structure, so the result looks like:

```
client/public/models/
  Xenova/
    whisper-tiny.en/
      config.json
      generation_config.json
      preprocessor_config.json
      tokenizer.json
      tokenizer_config.json
      onnx/
        encoder_model_quantized.onnx
        decoder_model_merged_quantized.onnx
```

The `onnx/` subfolder is what actually gets loaded at inference time (the
quantized `.onnx` files, per the `{ quantized: true }` option already set in
`voiceTranscription.ts`); the rest are small JSON config/tokenizer files
transformers.js also needs alongside them. Easiest way to get the exact
set: `git clone` the model repo directly and copy its `whisper-tiny.en`
folder in as-is, dropping the model repo's own `.git`.

## Verifying it worked

```bash
curl -I http://localhost:PORT/models/Xenova/whisper-tiny.en/config.json
```

should return `200`, not `404` — that's exactly the check
`isVoiceModelAvailable()` makes client-side.
