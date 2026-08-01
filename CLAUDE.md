# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚫 GOLDEN RULE — No runtime AI/LLM calls (non-negotiable)

This app must **never** call any external AI/LLM API (OpenAI, Anthropic, Google, etc.) during operational runtime. All running-sheet logic, intelligence processing, tagging, search, and analysis must be implemented as **deterministic, testable code that runs fully offline** — this is a legal/evidentiary system and behavior must be reproducible, not probabilistic.

- AI/LLM assistance (i.e. Claude Code, this session) is permitted **only at development time**, to write/review code. It must never leave a runtime dependency behind.
- Never add a network AI call as a "fallback" or "enhancement" to a feature, even if it seems like the easy way to solve something — not even silently, not even behind a flag.
- If a feature genuinely seems to need NLP/AI-style capability (e.g. entity extraction, classification, summarization), **flag it and propose a rule-based / deterministic / on-device approach instead.** Do not silently reach for an API call.
- Current state (audited when this rule was added): `server/_core/llm.ts` (`invokeLLM`), `server/_core/imageGeneration.ts`, and `server/_core/voiceTranscription.ts` are template scaffolding **left over from the Manus platform bootstrap and are not wired into any live route** — no router in `server/routers.ts` imports or calls them. `client/src/components/AIChatBox.tsx` likewise is only rendered on `client/src/pages/ComponentShowcase.tsx` (a component demo page), not in any real workflow. The existing entity extraction in `server/db.ts` (`extractEntitiesFromText`, used by the Intelligence module) is rule-based/regex, **not** an LLM call — that's the correct pattern to keep extending.
- Treat any future PR/diff that adds a call to `invokeLLM`, `generateImage`, `transcribeAudio`, or any other external AI SDK from a request-serving code path as a rule violation to reject, not a style nit.
- **Technically enforced, not just documented**: `.claude/settings.json` denies WebFetch/curl/wget to known AI API hosts (including `forge.manus.im`, the actual host `server/_core/llm.ts` posts to — not a generic OpenAI/Anthropic domain) and wires up `.claude/hooks/check-no-runtime-ai.sh`, which blocks any Write/Edit introducing a banned AI SDK/host/helper pattern outside `dev-tools/`, `scripts/dev/`, or a `_core` directory. `scripts/check-no-runtime-ai.sh` re-runs the same scan as the authoritative gate in CI (`.github/workflows/no-runtime-ai.yml`, on every push/PR). The banned-pattern list matches literal SDK/package/host strings (`openai`, `anthropic`, `forge.manus.im`, ...) **and** the dead `_core` helper call sites (`invokeLLM(`, `generateImage(`, `transcribeAudio(`) — so importing one of them into a live route outside `_core` now trips both the hook and CI. If you extend this list, keep it in sync across both scripts (both enforcement scripts, `.claude/settings.json`, and this file are self-exempted by path in the hook, since they must contain these strings as declared blocklist/documentation data, not as calls).

## What this app is

RunLog is a surveillance/HUMINT "running sheet" logging system for a police operational team. Officers (identified by a **CIN** — a unique officer identifier, not a login username) log timestamped observations against **Operations**, which contain one or more **Running Sheets** (a per-day/per-shift log), which contain **Rows** (a timestamped observation with a list of CIN "members" present). Rows must be **certified** by every CIN listed on them before the row locks. Related modules: a global **Target Registry** (surveillance subjects, linkable to multiple operations), an **Intelligence** module that mines observation text for entities (people/vehicles/addresses/locations) and renders an association map, a **Governance** to-do/compliance tracker, an **Operation Manager** weekly tasking board, and a **Court** section that generates Word documents (statements, witness lists, and WIPC — Witness Identity Protection Certificate — requests).

## Commands

```bash
pnpm dev              # start dev server (tsx watch on server/_core/index.ts, Vite middleware for the client)
pnpm build            # vite build (client) + esbuild bundle of the server into dist/
pnpm start            # run the production build (dist/index.js)
pnpm check            # tsc --noEmit — run before considering backend/shared changes done
pnpm format           # prettier --write .
pnpm test             # vitest run (server-only tests, see below)
pnpm db:push          # drizzle-kit generate && drizzle-kit migrate — generates a migration file AND applies it
```

Run a single test file: `pnpm vitest run server/running_sheet.test.ts`
Run tests matching a name: `pnpm vitest run -t "certif"`

Tests live under `server/*.test.ts` (vitest, `environment: "node"`, see `vitest.config.ts`). There is no client-side test suite — client changes should be verified by running `pnpm dev` and exercising the UI in a browser.

Package manager is **pnpm** (see `packageManager` field in `package.json`); don't use npm/yarn. `wouter` is patched via `patches/wouter@3.7.1.patch` (pnpm applies it automatically on install).

## Architecture

**Stack:** Express + tRPC (v11) server, React 19 + Vite client, Drizzle ORM over MySQL, wouter for client routing, TanStack Query via `@trpc/react-query`, Tailwind v4 + shadcn/radix components, PWA (workbox) with an IndexedDB offline draft layer.

**Monorepo layout, one process:** `server/` (API), `client/src/` (SPA), `shared/` (types/constants used by both). Path aliases: `@/*` → `client/src/*`, `@shared/*` → `shared/*` (defined in `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` — keep all three in sync if aliases change). In dev, `server/_core/index.ts` mounts Vite as Express middleware; in production it serves the built static client (`server/_core/vite.ts`).

### `_core` directories are template/platform plumbing

`server/_core/`, `client/src/_core/`, and `shared/_core/` hold **generic platform integration code** (auth/OAuth, LLM calls, image generation, voice transcription, maps proxy, file storage, notifications, cron/heartbeat, tRPC context/middleware setup). This app was bootstrapped from a "Manus" platform template — treat `_core` as scaffolding: read `references/*.md` before touching any of these integrations (OAuth redirect handling, maps/storage helpers, owner notifications, periodic/cron jobs). Notably `references/periodic-updates.md` forbids `setInterval`/`node-cron` for scheduled work — use the platform's heartbeat/agent cron endpoints instead. App-specific domain logic (everything else) lives outside `_core`. **Exception: `llm.ts`, `imageGeneration.ts`, `voiceTranscription.ts` are dead scaffolding — see the Golden Rule above, do not wire these into any live route.**

**Auth is now local, not OAuth:** despite the `_core`/Manus OAuth scaffolding still being present (and used as a fallback), day-to-day auth is username/password against the `users` table (`bcryptjs` hashing, see `auth.login`/`auth.logout` in `server/routers.ts` and `server/_core/sdk.ts#authenticateRequest`). Session state is a cookie (`COOKIE_NAME` in `shared/const.ts`), 12-hour expiry (`SESSION_EXPIRY_MS`). `users.role` is `observer | member | admin`; `adminProcedure` in `server/_core/trpc.ts` gates admin-only endpoints, `protectedProcedure` gates any logged-in user.

### Server (`server/`)

- `routers.ts` (~2800 lines) — the single tRPC `appRouter`, namespaced by domain (`auth`, `operation`, `sheet`, `row`, `member`, `certification`, `auditLog`, `target`, `targetShortcuts`, `intelligence`, `governance`, `calendar`, `statement`, `witnessList`, `wipc`, `recycleBin`, `customMarker`, `rsMapping`, `sidebar`, `reports`, `opManager`, `admin`, `adminUtils`, `users`, `export`, plus `system` from `_core/systemRouter.ts`). Add new endpoints inside the matching namespace rather than creating new top-level routers.
- `db.ts` (~4600 lines) — every DB query/mutation as a plain exported async function, organized by `// ─── Section ───` comment headers (Users, Operations, Running Sheets, Targets, Intelligence, Governance, WIPC, Recycle Bin, Op Manager, etc.). `routers.ts` imports these functions rather than querying Drizzle directly. Follow this split when adding features: query logic in `db.ts`, request/response shape + auth checks in `routers.ts`.
- `*Generator.ts` (`statDecGenerator.ts`, `wipcRequestGenerator.ts`, `witnessListGenerator.ts`, `statementGenerator.ts`) — build `.docx` files with the `docx` package for court output.
- `wipcVault.ts` — encrypt/decrypt helpers for sensitive WIPC member data at rest.
- `storage.ts` — file storage helper (see `references/file-storage.md`); don't hand-roll upload/URL logic.

### Data model conventions (`drizzle/schema.ts`)

- **Soft delete, not hard delete**, for `operations`, `runningSheets`, `targets`, `customMapMarkers`: a nullable `deletedAt` (bigint ms timestamp) + `deletedByCIN`. Always filter live queries with `isNull(table.deletedAt)`; there's a Recycle Bin (`recycleBin` router / `getRecycleBinItems`) to reinstate or the record purges after expiry (`purgeExpiredRecycleBinItems`).
- **Audit trail**: significant mutations call `createAuditLog` (see `auditLogs` table / `auditLog` router) — follow this pattern for new mutating endpoints that touch operational data.
- **CIN, not user id, is the human-facing identity** stored on rows/certifications/audit entries (`memberName`, `certifiedByCIN`, `deletedByCIN`, etc.) so history reads correctly even if a user record changes.
- Timestamps are inconsistently typed across the schema — some columns are Drizzle `timestamp` (`createdAt`/`updatedAt`), others are `bigint` ms epoch (`deletedAt`, `closedAt`, `certifiedAt`). Check the column type before formatting/comparing.
- Server timezone is forced to `Australia/Perth` at the top of `server/_core/index.ts` — this must stay the very first executable line (before any `Date`-touching code runs) since running sheets are time-sensitive legal records.
- Migrations: `drizzle/*.sql` are numbered, auto-named by drizzle-kit (e.g. `0036_long_gertrude_yorkes.sql`). Never hand-edit an already-applied migration; run `pnpm db:push` to generate + apply a new one after changing `drizzle/schema.ts`.

### Client (`client/src/`)

- Routing is `wouter` (`App.tsx`), not React Router. Most routes render inside `DashboardLayout`; sidebar order is user-configurable and persisted server-side (`sidebar` router).
- Data fetching goes through the tRPC React Query client (`lib/trpc.ts`) — don't add a second fetch layer.
- **Offline-first draft mode**: `lib/offlineStore.ts` (IndexedDB via `idb`) persists draft operations/targets/sheets/rows with local UUIDs when offline, and `lib/offlineSync.ts` replays a queue against the server on reconnect, remapping local IDs to server IDs as it goes (`OfflineContext`, `useOfflineMutations`, `DraftModeBanner`, `DraftHubPage`/`DraftSheetPage`). If you touch sheet/row creation, check whether the offline draft path also needs updating — it duplicates the shape of the equivalent server mutations.
- `pages/Intelligence*` and `pages/RSMapping*`/`IntelligenceMapping.tsx` are large (`IntelligenceMapping.tsx` is 4000+ lines) map/entity-extraction views; `lib/markerSvgs.ts` and `components/Map.tsx` back the map rendering (Google Maps via the platform's maps proxy — see `references/maps-integration.md`, never request API keys from users or use a third-party map library).
- UI primitives are shadcn (`components/ui/`, configured via `components.json`) on top of Radix; keep new UI consistent with existing components rather than adding another design system.
- **Design preference — symmetry**: the user cares about layouts reading as neat and symmetrical (equal-sized buttons/pills in a row, balanced spacing, aligned icons) — when building or touching UI, actively check for lopsided sizing/spacing rather than leaving whatever falls out of default flex/grid behavior. This app is used on laptop, tablet, and phone; mentally (or actually, via Playwright) check how a change looks at each of those widths, not just desktop, before considering it done.
- Formatting: Prettier config in `.prettierrc` (double quotes off — i.e. `"singleQuote": false`, no semicolons off — semi:true, 80 col width). Run `pnpm format` before committing significant client/server changes.

## Root-level scratch files

`todo.md`, `map_implementation_context.md`, and `map_tab_bar_notes.md` at the repo root are working notes from prior implementation sessions (task tracking / handoff notes for the map + running-sheet quick-entry feature), not authoritative docs — treat `drizzle/schema.ts`, `routers.ts`, and the actual component code as ground truth over them.

`ops-notes.md` is a running log of production/droplet incidents (outages, high CPU/latency, deploy issues) — check it whenever the user reports something happening on the live droplet, in case it's a recurrence of something already investigated. Append new incidents there rather than only answering in chat, so the next session has the history.
