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
(`getVoiceModelStatus()` in `voiceTranscription.ts`) rather than silently
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
transformers.js also needs alongside them.

## ⚠️ Git LFS trap — do not `git clone` the model repo directly

The `.onnx` weight files in a Hugging Face Hub repo are stored via **Git
LFS**. If `git-lfs` isn't installed on the machine doing the clone, a plain
`git clone` silently downloads tiny **LFS pointer stub** text files instead
of the real binaries — each one is ~130 bytes and looks like:

```
version https://git-lfs.github.com/spec/v1
oid sha256:...
size 13xxxxxx
```

The app will still find these files and pass `isVoiceModelAvailable()`
(the config/tokenizer JSON files aren't LFS-tracked and clone fine), but
transcription fails at runtime with `Can't create a session` —
onnxruntime-web trying to parse a 130-byte text stub as a model binary.
This bit a real deployment; confirm with `ls -la` on the `onnx/` folder
after fetching — real quantized weights are multi-megabyte
(`encoder_model_quantized.onnx` ~13MB, `decoder_model_merged_quantized.onnx`
~16MB), not ~130 bytes.

**Recommended fetch method — bypasses git-lfs entirely.** Only two `.onnx`
files are actually loaded (per `{ quantized: true }` above), so just pull
those two plus the small config/tokenizer files directly via HTTP, using
the Hub's `resolve` endpoint (always serves real binary content,
regardless of LFS):

```bash
cd client/public/models/Xenova/whisper-tiny.en
mkdir -p onnx
for f in config.json generation_config.json preprocessor_config.json tokenizer.json tokenizer_config.json; do
  curl -L -o "$f" "https://huggingface.co/Xenova/whisper-tiny.en/resolve/main/$f"
done
curl -L -o onnx/encoder_model_quantized.onnx "https://huggingface.co/Xenova/whisper-tiny.en/resolve/main/onnx/encoder_model_quantized.onnx"
curl -L -o onnx/decoder_model_merged_quantized.onnx "https://huggingface.co/Xenova/whisper-tiny.en/resolve/main/onnx/decoder_model_merged_quantized.onnx"
```

If you'd rather `git clone` the repo (e.g. to browse it, or grab every
quantization variant), install `git-lfs` **first** and run `git lfs pull`
inside the clone before copying anything out of it:

```bash
apt-get install -y git-lfs   # or: brew install git-lfs
git lfs install
git clone https://huggingface.co/Xenova/whisper-tiny.en
cd whisper-tiny.en && git lfs pull   # only needed if the clone above still left pointer stubs
```

## Verifying it worked

```bash
curl -I http://localhost:PORT/models/Xenova/whisper-tiny.en/config.json
```

should return `200`, not `404` — that's exactly the check
`isVoiceModelAvailable()` makes client-side. That alone isn't enough
though — it doesn't catch the LFS pointer-stub case above, since
`config.json` isn't LFS-tracked and returns 200 either way. Also check the
actual weight file sizes:

```bash
ls -la client/public/models/Xenova/whisper-tiny.en/onnx/*_quantized.onnx
```

Both `encoder_model_quantized.onnx` and `decoder_model_merged_quantized.onnx`
should be several megabytes, not ~130 bytes.
