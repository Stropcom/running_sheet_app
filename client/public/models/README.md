# Voice observation model goes here

This directory holds the local speech-to-text model used by the Observation
field's voice-input button (`client/src/lib/voiceTranscription.ts`) —
intentionally not committed to git (tens of MB of binary weights, same
reason `node_modules`/`dist/` aren't committed either).

See **`scripts/dev/voice-model-setup.md`** for the exact one-time setup
step and directory layout needed here.
