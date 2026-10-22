# Playwright end-to-end tests

Separate from `server/*.test.ts` (vitest, node environment — see
`vitest.config.ts`). These drive a real browser against a real running
instance of the app, so they need an actual server and database to point at —
nothing here starts one for you (CI does, see `.github/workflows/e2e.yml`).

## Running

```bash
E2E_BASE_URL=http://localhost:3000 \
E2E_USERNAME=<a real login username> \
E2E_PASSWORD=<its password> \
E2E_CIN=<that account's CIN> \
pnpm test:e2e
```

- `E2E_BASE_URL` — defaults to `http://localhost:3000`.
- `E2E_USERNAME` / `E2E_PASSWORD` — a real account on that instance. Without
  them every test is skipped, not failed.
- `E2E_CIN` — the account's own CIN (default `E2E1`). The smoke test adds it
  to a row, which certifies the row for that officer.
- `E2E_CHROMIUM_PATH` — optional: use an already-installed Chromium instead
  of Playwright's own download (useful where downloads are blocked).

**Use a throwaway database.** The smoke test creates a new operation and
running sheet on every run (named `Smoke <timestamp>`). It deletes nothing.

The first test (`auth.setup.ts`) signs in once and saves the session to
`e2e/.auth/user.json` (git-ignored — it holds a live session cookie); every
other test starts signed in. The login endpoint is rate limited to 20 attempts
per 15 minutes per IP, so one sign-in per run keeps repeated runs from locking
themselves out.

## Starting a local instance to test against

```bash
# any local MySQL / MariaDB, an empty database:
export DATABASE_URL="mysql://root@127.0.0.1:3306/runlog_e2e"
pnpm exec drizzle-kit migrate
pnpm tsx scripts/dev/create-admin-user.ts e2e 'E2e-Passw0rd!' "E2E Officer" "E2E1"
VITE_APP_ID=e2e-app JWT_SECRET=<any long string> PORT=3000 pnpm dev
```

`VITE_APP_ID` and `JWT_SECRET` must both be set or the session cookie is
rejected and sign-in appears to do nothing.

## What's covered

- `smoke.spec.ts` — the main officer workflow through the real UI: create an
  operation, create a running sheet, add a row with an observation and a CIN,
  reload to prove it was saved, and see the row lock once everyone on it has
  certified. A second test opens every main page that doesn't need Google
  Maps and fails on the error screen or any uncaught script error — the check
  that would have caught a blank-screen deploy (ops-notes.md, 2026-09-06).
- `voice-offline.spec.ts` — the Golden Rule's network-isolation guarantee for
  voice input: goes into airplane mode mid-session and asserts opening RS
  Quick Entry and tapping the Voice button produces zero requests to any
  origin other than the app's own. It doesn't attempt a real transcription —
  that needs the deployment-only ONNX model files
  (`scripts/dev/voice-model-setup.md`).

- `sheet-and-photos.spec.ts` — the running sheet screen and its photo paths
  (the safety net for splitting `SheetDetail.tsx`): two rows saved, one edited
  in place, both still there after a reload; the sheet fits a phone (390 px)
  and a tablet (820 px) with no sideways scroll; a photo is picked, linked as
  an **Item** with a description, uploaded only on Confirm, shows its Item pill
  and the description pop-over, and is found again in the Images folder.
- `screens.spec.ts` — the other big screens (the safety net for splitting
  `IntelligenceMapping.tsx`): a row can be deleted (the browser's own
  "Delete this row?" question); a person typed on a sheet reaches the
  Intelligence folder and the operation's Intelligence page; the same person on
  a second sheet raises "Possible duplicate entity"; the operation page opens
  each tab; Governance lists the sheet; Add Target opens with its four steps.
  A random surname per run keeps these independent of earlier runs on the same
  database.

Pages that load Google Maps (Mapping, RS Mapping) aren't in the page-load
list: Google isn't reachable from CI or the dev sandbox.

Extend this directory as more client behaviour needs automated coverage,
rather than starting a second parallel setup.
