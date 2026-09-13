# Local NER model — manual deployment step

`server/models/` is where the local named-entity-recognition model lives at
runtime (`server/localNER.ts`, used by the Missed-Entity Scan on the admin's
Profile page — Step 2 of the Local AI Roadmap). It is **not** committed to
git — the model weights are tens of megabytes of binary, same reason
`node_modules`/`dist/` and the voice model (`client/public/models/`) aren't
committed either — and this sandbox's network policy blocks fetching them
directly (the model host is not on the reachable-host allowlist), so they
weren't fetched as part of building this feature. This is a one-time manual
step for whoever deploys this branch — same situation as
`scripts/dev/voice-model-setup.md`, just on the server side instead of the
client.

## What must never happen

Per CLAUDE.md's Golden Rule, this app must never call an external AI/LLM
service at runtime. Populating `server/models/` is a **build-time** step
done once during deployment — it is not a runtime fetch, and once these
files are in place `env.allowRemoteModels = false` (set in
`server/localNER.ts`) means the running app will never attempt to reach
that host, or any other, to get them. If the directory is empty, the scan
button returns `modelStatus: "missing"` (`getNerModelStatus()` in
`localNER.ts`) rather than silently falling back to a network call.

## ⚠️ This has not been run against the real model

Unlike the voice feature, this integration has **not** been exercised
against real weights in any environment — this sandbox can't fetch them to
even try. The code in `server/localNER.ts` (and the token-merging logic in
`mergePersonTokenTags`, which server/localNER.test.ts does cover without
the real model) is written to match the token-classification pipeline's
documented shape as closely as possible, but treat it as unverified until
someone has actually run a scan against real running-sheet data and
checked the results make sense.

## What to fetch

Model: **`Xenova/bert-base-NER`** — a general-purpose English NER model
(person/organisation/location/misc), the standard example model in
`@xenova/transformers`' own documentation for the `token-classification`
pipeline. Confirmed as a real, correct model ID from this repo's own
installed copy of the library
(`node_modules/@xenova/transformers/types/pipelines.d.ts`'s own worked
example uses this exact model), not just from memory — but double-check it
still resolves on Hugging Face Hub before fetching, the same way you would
for any dependency.

From a machine that can reach the model host, fetch every file in the
`Xenova/bert-base-NER` model repository on Hugging Face Hub
(huggingface.co) into `server/models/`, preserving the repo's own
structure:

```
server/models/
  Xenova/
    bert-base-NER/
      config.json
      tokenizer.json
      tokenizer_config.json
      onnx/
        model_quantized.onnx
```

## ⚠️ Git LFS trap — do not `git clone` the model repo directly

Same trap as the voice model — see `scripts/dev/voice-model-setup.md`'s
"Git LFS trap" section for the full explanation. In short: a plain
`git clone` without `git-lfs` installed silently downloads ~130-byte
pointer stub text files instead of the real binary. Use the Hub's
`resolve` endpoint instead, which always serves real content:

```bash
mkdir -p server/models/Xenova/bert-base-NER/onnx
cd server/models/Xenova/bert-base-NER
for f in config.json tokenizer.json tokenizer_config.json; do
  curl -L -o "$f" "https://huggingface.co/Xenova/bert-base-NER/resolve/main/$f"
done
curl -L -o onnx/model_quantized.onnx "https://huggingface.co/Xenova/bert-base-NER/resolve/main/onnx/model_quantized.onnx"
```

## Verifying it worked

```bash
ls -la server/models/Xenova/bert-base-NER/onnx/model_quantized.onnx
```

should be several megabytes, not ~130 bytes (a Git LFS pointer stub —
see above). `getNerModelStatus()` in `server/localNER.ts` checks the same
thing at runtime before the Missed-Entity Scan button will actually try to
use the model — its result surfaces directly in the Profile page UI
("model not installed" / "model files look incomplete").

## A real bug this work already found and fixed

Importing `@xenova/transformers` in a Node (server) context pulls in
`sharp` transitively (`utils/image.js`, imported unconditionally from the
library's main entry point even for a text-only pipeline like this one) —
and the specific old `sharp@0.32.6` version it depends on had no prebuilt
binary available in this sandbox, which crashed the whole process on
import. Fixed via a `pnpm.overrides` entry in `package.json` pinning
`sharp` to the same `^0.35.3` version already used elsewhere in this app,
so the whole dependency tree dedupes onto the one working copy instead.
**Worth explicitly re-checking this still works after `pnpm install` on
whatever machine actually deploys this** — if the override stops applying
for any reason (a `pnpm-lock.yaml` conflict, a dependency bump), the
server will crash immediately on startup once this module is imported,
not just when the scan button is clicked.
