# Playwright end-to-end tests

Separate from `server/*.test.ts` (vitest, node environment — see
`vitest.config.ts` and CLAUDE.md's Commands section). These drive a real
browser against a real running instance of the app, so they need an actual
server to point at — nothing here starts one for you.

## Running

```bash
E2E_BASE_URL=http://localhost:3000 \
E2E_USERNAME=<a real login username> \
E2E_PASSWORD=<its password> \
pnpm test:e2e
```

- `E2E_BASE_URL` — defaults to `http://localhost:3000` if omitted.
- `E2E_USERNAME` / `E2E_PASSWORD` — a real account on that instance. Any
  role works; nothing here needs admin access. Tests that need this and
  don't have it are skipped, not failed, so it's safe to leave unset when
  you just want to run whatever doesn't need a login (none yet — see
  below).

No seeded operation/running sheet is required beyond the login itself —
`voice-offline.spec.ts` opens RS Quick Entry via the same
`window.__intelRsQuickEntry` hook the app's own intel-pin popup uses,
rather than clicking through a real map marker.

## What's covered so far

- `voice-offline.spec.ts` — the Golden Rule's network-isolation guarantee
  (CLAUDE.md: no runtime AI/LLM calls, nothing should ever reach an
  external host) for the voice observation feature specifically: goes into
  airplane mode mid-session and asserts opening RS Quick Entry and tapping
  the Voice button produces zero requests to any origin other than the
  app's own. Doesn't attempt a real transcription — that needs the real,
  deployment-only ONNX model weight files (`scripts/dev/voice-model-setup.md`)
  which aren't vendored in the repo and won't be present in every
  environment this runs in.

This is the first Playwright test in the repo — CLAUDE.md's "no client-side
test suite" note predates it. Extend this directory as more client
behaviour needs automated coverage, rather than starting a second parallel
setup.
