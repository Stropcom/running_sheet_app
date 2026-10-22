# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚫 GOLDEN RULE — No runtime AI/LLM calls (non-negotiable)

This app must **never** call any external AI/LLM API (OpenAI, Anthropic, Google, etc.) during operational runtime. All running-sheet logic, intelligence processing, tagging, search, and analysis must be implemented as **deterministic, testable code that runs fully offline** — this is a legal/evidentiary system and behavior must be reproducible, not probabilistic.

- AI/LLM assistance (i.e. Claude Code, this session) is permitted **only at development time**, to write/review code. It must never leave a runtime dependency behind.
- Never add a network AI call as a "fallback" or "enhancement" to a feature, even if it seems like the easy way to solve something — not even silently, not even behind a flag.
- If a feature genuinely seems to need NLP/AI-style capability (e.g. entity extraction, classification, summarization), **flag it and propose a rule-based / deterministic / on-device approach instead.** Do not silently reach for an API call.
- Current state (audited when this rule was added): `server/_core/llm.ts` (`invokeLLM`), `server/_core/imageGeneration.ts`, and `server/_core/voiceTranscription.ts` are template scaffolding **left over from the Manus platform bootstrap and are not wired into any live route** — no router in `server/routers.ts` imports or calls them. `client/src/components/AIChatBox.tsx` likewise is only rendered on `client/src/pages/ComponentShowcase.tsx` (a component demo page), not in any real workflow. The existing entity extraction in `server/db.ts` (`extractEntitiesFromText`, used by the Intelligence module) is rule-based/regex, **not** an LLM call — that's the correct pattern to keep extending.
- Treat any future PR/diff that adds a call to `invokeLLM`, `generateImage`, `transcribeAudio`, or any other external AI SDK from a request-serving code path as a rule violation to reject, not a style nit.
- **Technically enforced, not just documented**: `.claude/settings.json` denies WebFetch/curl/wget to known AI API hosts (including `forge.manus.im`, the actual host `server/_core/llm.ts` posts to — not a generic OpenAI/Anthropic domain) and wires up `.claude/hooks/check-no-runtime-ai.sh`, which blocks any Write/Edit introducing a banned AI SDK/host/helper pattern outside `dev-tools/`, `scripts/dev/`, or a `_core` directory. `scripts/check-no-runtime-ai.sh` re-runs the same scan (text files only — `grep -I` skips binary test fixtures) as the authoritative gate in CI (`.github/workflows/no-runtime-ai.yml`, on every push/PR). The banned-pattern list matches literal SDK/package/host strings (`openai`, `anthropic`, `forge.manus.im`, ...) **and** the dead `_core` helper call sites (`invokeLLM(`, `generateImage(`, `transcribeAudio(`) — so importing one of them into a live route outside `_core` now trips both the hook and CI. If you extend this list, keep it in sync across both scripts (both enforcement scripts, `.claude/settings.json`, and this file are self-exempted by path in the hook, since they must contain these strings as declared blocklist/documentation data, not as calls).

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
pnpm test:e2e         # Playwright smoke tests against a running instance (see e2e/README.md)
pnpm db:push          # drizzle-kit generate && drizzle-kit migrate — generates a migration file AND applies it
```

Run a single test file: `pnpm vitest run server/running_sheet.test.ts`
Run tests matching a name: `pnpm vitest run -t "certif"`

Tests live under `server/*.test.ts` (vitest, `environment: "node"`, see `vitest.config.ts`). There are no client unit tests; `e2e/` holds Playwright **smoke tests** (sign in → operation → sheet → row → certify → locked, plus every main page opening without the error screen; they need a running instance and a throwaway database, see `e2e/README.md`, and CI runs them in `.github/workflows/e2e.yml`). Anything beyond that — a client change — should still be checked by running `pnpm dev` and exercising the UI in a browser.

Package manager is **pnpm** (see `packageManager` field in `package.json`); don't use npm/yarn. `wouter` is patched via `patches/wouter@3.7.1.patch` (pnpm applies it automatically on install).

## Versioning — bump on every merge to `main` (non-negotiable)

**Every PR merged into `main` must bump the version number**, in both places, kept in sync:

- `package.json`'s `"version"` field
- `shared/const.ts`'s `export const APP_VERSION`

This applies to all merges to `main` — features, fixes, docs, refactors — not just user-facing changes. There is no size/significance exception: every merge gets at least a patch bump. Do the bump as part of the same PR being merged (or as a final standalone "Bump version to X.Y.Z" commit immediately before merging), not as a follow-up. Before merging any branch into `main`, check whether the version has already been bumped on that branch; if not, bump it before merging.

**Which digit to bump — categorize it, don't default to patch every time:**

- **PATCH** (`1.0.X`) — the default. Bug fixes, corrections to existing behavior, copy/UI tweaks, refactors, dependency bumps, doc/CLAUDE.md changes — anything that doesn't add a capability an officer didn't already have.
- **MINOR** (`1.X.0`, resets patch to 0) — a new, backward-compatible feature or capability: a new chip/shortcut type on the running sheet, a new autocomplete, a new report/export, a new module or section, a new field on an existing form. If the change description would honestly use "add" for something genuinely new an officer can now do, it's minor, not patch.
- **MAJOR** (`X.0.0`, resets minor and patch to 0) — a breaking or structural change: a non-backward-compatible schema change, an auth/session model change, replacing how a whole module works, or anything that would require officers to be retrained or old running sheets reinterpreted differently. Expect this to almost never fire in normal feature work.

When a single PR bundles multiple changes (e.g. a new feature plus incidental fixes along the way), bump for the **highest** category present — one new feature alongside three bug fixes is a minor bump, not three separate patches.

## Architecture

**Stack:** Express + tRPC (v11) server, React 19 + Vite client, Drizzle ORM over MySQL, wouter for client routing, TanStack Query via `@trpc/react-query`, Tailwind v4 + shadcn/radix components, PWA (workbox) with an IndexedDB offline draft layer.

**Monorepo layout, one process:** `server/` (API), `client/src/` (SPA), `shared/` (types/constants used by both). Path aliases: `@/*` → `client/src/*`, `@shared/*` → `shared/*` (defined in `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` — keep all three in sync if aliases change). In dev, `server/_core/index.ts` mounts Vite as Express middleware; in production it serves the built static client (`server/_core/vite.ts`).

### `_core` directories are template/platform plumbing

`server/_core/`, `client/src/_core/`, and `shared/_core/` hold **generic platform integration code** (auth/OAuth, LLM calls, image generation, voice transcription, maps proxy, file storage, notifications, cron/heartbeat, tRPC context/middleware setup). This app was bootstrapped from a "Manus" platform template — treat `_core` as scaffolding: read `references/*.md` before touching any of these integrations (OAuth redirect handling, maps/storage helpers, owner notifications, periodic/cron jobs). Notably `references/periodic-updates.md` forbids `setInterval`/`node-cron` for scheduled work — use the platform's heartbeat/agent cron endpoints instead. App-specific domain logic (everything else) lives outside `_core`. **Exception: `llm.ts`, `imageGeneration.ts`, `voiceTranscription.ts` are dead scaffolding — see the Golden Rule above, do not wire these into any live route.**

**Auth is now local, not OAuth:** despite the `_core`/Manus OAuth scaffolding still being present (and used as a fallback), day-to-day auth is username/password against the `users` table (`bcryptjs` hashing, see `auth.login`/`auth.logout` in `server/routers.ts` and `server/_core/sdk.ts#authenticateRequest`). Session state is a cookie (`COOKIE_NAME` in `shared/const.ts`), 12-hour expiry (`SESSION_EXPIRY_MS`). `users.role` is `observer | member | admin`; `adminProcedure` in `server/_core/trpc.ts` gates admin-only endpoints, `protectedProcedure` gates any logged-in user.

### Server (`server/`)

- `routers.ts` — only assembles the single tRPC `appRouter` (`export type AppRouter` is derived from it). Each area is its own file under `routers/` exporting `<name>Router` (`operation`, `sheet`, `row`, `attachment`, `target`, `intelligence`, `ctoRoster`, `admin`, … — the order and names in `routers.ts` are the API's namespaces; plus `system` from `_core/systemRouter.ts`); the guards, shared input schemas and small shared helpers (`adminProcedure`, `guardActiveSheet`, …) are in `routers/_helpers.ts`. Add new endpoints inside the matching area's file rather than creating new top-level routers; a new area is a new file plus one line in `routers.ts`. Request/response shape and auth checks live here; query logic lives in `db.ts`.
- `db.ts` — only re-exports (the same names as before, so every `import … from "./db"` elsewhere is unchanged). The code is in `db/<area>.ts`, one file per area: `core` (the connection pool, `getDb`, `withDedicatedConnection`), `accounts` (users, teams, shares, visitor teams, sidebar order), `operations` (operations, sheets, rows, members, certifications, audit log), `attachments`, `faces`, `targets` (targets, associates, registry, merges, shortcuts), `intelligence`, `crossOperation`, `targetLogger` (walk-in / vehicle continuity and observation punctuation), `reports`, `governance` (governance, sheet summary), `court` (WIPC vault, SMEAC, UCO), `mapping`, `opManager`, `notifications`, `recycleBin`. Every query/mutation is a plain exported async function; within a file they keep the `// ─── Section ───` headers. `routers/*.ts` import these functions rather than querying Drizzle directly. Follow this split when adding features: query logic in `db/<area>.ts` (add the name to the barrel `db.ts` if another file or a test imports it from `./db`), request/response shape + auth checks in `routers/<area>.ts`. A name used only inside its own area file need not be exported.
- `*Generator.ts` (`statDecGenerator.ts`, `wipcRequestGenerator.ts`, `witnessListGenerator.ts`, `statementGenerator.ts`) — build `.docx` files with the `docx` package for court output.
- `wipcVault.ts` — encrypt/decrypt helpers for sensitive WIPC member data at rest.
- `storage.ts` — file storage helper (see `references/file-storage.md`); don't hand-roll upload/URL logic.

### Data model conventions (`drizzle/schema.ts`)

- **Soft delete, not hard delete**, for `operations`, `runningSheets`, `targets`, `customMapMarkers`: a nullable `deletedAt` (bigint ms timestamp) + `deletedByCIN`. Always filter live queries with `isNull(table.deletedAt)`; there's a Recycle Bin (`recycleBin` router / `getRecycleBinItems`) to reinstate or the record purges after expiry (`purgeExpiredRecycleBinItems`).
- **Audit trail**: significant mutations call `createAuditLog` (see `auditLogs` table / `auditLog` router) — follow this pattern for new mutating endpoints that touch operational data.
- **CIN, not user id, is the human-facing identity** stored on rows/certifications/audit entries (`memberName`, `certifiedByCIN`, `deletedByCIN`, etc.) so history reads correctly even if a user record changes.
- Timestamps are inconsistently typed across the schema — some columns are Drizzle `timestamp` (`createdAt`/`updatedAt`), others are `bigint` ms epoch (`deletedAt`, `closedAt`, `certifiedAt`). Check the column type before formatting/comparing.
- **Street types are always written in full** — "Street", "Road", "Avenue", never "St", "Rd", "Ave" — in everything the app writes or shows: Quick Entry addresses and their bracket short forms, card/chip sentences, known-address suggestions, map and Intelligence labels. `shared/streetTypes.ts` (`fullStreetTypes`) is the single rule (only expands the last word of a number-led street or an intersection, so "St Kilda"/"Dr Smith" are safe); apply it at the point text is produced, don't hand-roll abbreviations. Rows officers already typed are never rewritten — Check Sheet flags an abbreviation (`street-type-abbreviated`) with a one-tap fix. Place matching (`samePlace`) treats short and long forms as the same place.
- Server timezone is forced to `Australia/Perth` at the top of `server/_core/index.ts` — this must stay the very first executable line (before any `Date`-touching code runs) since running sheets are time-sensitive legal records.
- Migrations: `drizzle/*.sql` are numbered, auto-named by drizzle-kit (e.g. `0036_long_gertrude_yorkes.sql`). Never hand-edit an already-applied migration; run `pnpm db:push` to generate + apply a new one after changing `drizzle/schema.ts`.

### Client (`client/src/`)

- Routing is `wouter` (`App.tsx`), not React Router. Most routes render inside `DashboardLayout`; sidebar order is user-configurable and persisted server-side (`sidebar` router).
- Data fetching goes through the tRPC React Query client (`lib/trpc.ts`) — don't add a second fetch layer.
- **Offline-first draft mode**: `lib/offlineStore.ts` (IndexedDB via `idb`) persists draft operations/targets/sheets/rows with local UUIDs when offline, and `lib/offlineSync.ts` replays a queue against the server on reconnect, remapping local IDs to server IDs as it goes (`OfflineContext`, `useOfflineMutations`, `DraftModeBanner`, `DraftHubPage`/`DraftSheetPage`). If you touch sheet/row creation, check whether the offline draft path also needs updating — it duplicates the shape of the equivalent server mutations.
- `pages/Intelligence*` and `pages/RSMapping*`/`IntelligenceMapping.tsx` are large (`IntelligenceMapping.tsx` is 4000+ lines) map/entity-extraction views; `lib/markerSvgs.ts` and `components/Map.tsx` back the map rendering (Google Maps via the platform's maps proxy — see `references/maps-integration.md`, never request API keys from users or use a third-party map library).
- **Map overlays are `DivIconOverlay` (`lib/divIconOverlay.ts`, built on `google.maps.OverlayView`), never `AdvancedMarkerElement`** — `AdvancedMarkerElement` has a confirmed positioning-drift bug during zoom that can't be fixed from outside the class (reproduced under vector and raster Map IDs). `DivIconOverlay` mirrors its API shape (`.map/.position/.content/.zIndex/.title/.gmpDraggable`, `.addListener` from `MVCObject` — don't replace it with a shim) and hand-rolls drag-to-move and `anchor: "center" | "none"`. Build any `OverlayView` subclass inside the effect, never at module scope. Full history: `docs/features/ui-conventions.md`.
- UI primitives are shadcn (`components/ui/`, configured via `components.json`) on top of Radix; keep new UI consistent with existing components rather than adding another design system.
- **Design preference — symmetry (non-negotiable, check on every UI change)**: the user cares about layouts reading as neat and symmetrical (equal-sized buttons/pills in a row, balanced spacing, aligned icons) — when building or touching UI, actively check for lopsided sizing/spacing rather than leaving whatever falls out of default flex/grid behavior. This isn't just for new components: adding a tab, button, or item to an existing row/group means re-checking that the whole row still reads as symmetrical (e.g. equal-width tabs via `grid grid-cols-N`, not one trigger sized to its own text while others aren't — see the Operation page's 3-tab bar in `OperationDetail.tsx` for the pattern). This app is used on laptop, tablet, and phone; mentally (or actually, via Playwright) check how a change looks at each of those widths, not just desktop, before considering it done.
- **Form kit — one look for forms, dialogs and titled panels (non-negotiable, extend it rather than inventing a new style)**: `lib/formKit.ts` is the single source. Controls (`Input`, `Select`, `Textarea`, the Operation picker) get a white fill and a visible border from the base components in `components/ui`; field labels are `FORM_LABEL`. Panels use `FORM_TONES[tone].panel` + `.band` — a solid white card with a full-strength border and a tinted titled header band (the band pulls to the card edge with `-mx-3 -mt-3`, so the panel needs `p-3`). Tone is the entity colour: target/person = rose, address = emerald, vehicle = amber, associate = violet, resident = sky, photo/Images = cyan, a person mined from observation text = navy (`blue-900`), other = slate. Colour marks what a panel *is*, never tints the fields; nest panels at most two levels (`FORM_NESTED_PANEL`); no translucent tinted bodies or `border-l-4` rails. The PDF exports and the map popup write the same hexes out (`#e11d48` target, `#0284c7` resident) — change them together. Full text and where it is applied: `docs/features/ui-conventions.md`.
- **Page kit — one look for read-only pages (non-negotiable, extend it rather than inventing a new style)**: the companion to the Form kit. `lib/pageKit.ts`: `SECTION_CARD` (solid white card, full-strength border), `SECTION_BAND`/`SECTION_TITLE`/`SECTION_COUNT` (grey titled band, must be the card's first child, bleeds out with `-mx-4 -mt-4`), `ROW_ITEM`, `FIELD_LABEL`/`FIELD_VALUE`; profile headings use `components/ProfileSectionHeading.tsx`. Rules: no `border-border/NN` or translucent `bg-card/NN` on cards, no text under 12px, labels uppercase semibold `text-foreground/70`, values `text-sm`. Still to convert: Op Manager / CTO Roster (incl. Weekly Tasking Report) and the Mapping / RS Mapping side panels. Full text: `docs/features/ui-conventions.md`.
- Formatting: Prettier config in `.prettierrc` (double quotes off — i.e. `"singleQuote": false`, no semicolons off — semi:true, 80 col width). Run `pnpm format` before committing significant client/server changes.

## Feature notes live in `docs/features/` (read the one for your area first)

This file holds only the standing rules. The per-feature detail — what each version added, why, how it was checked, known limits — is in `docs/features/`, one file per area. **When you change a feature, read the matching file first; when you finish, add or edit the note there (not here).**

| File | Covers |
| --- | --- |
| `sheet-and-observation.md` | Observation tidy-up, typing-slip repair, joining words, vehicle lists, shortcut chip order, address suggestions, Check Sheet rules, photo resize, Sheet Summary |
| `target-logger-and-map.md` | Target Logger rules (walk-ins, vehicles, boats, buses/trains, hand-over, ceased), the target flag, place and transit sign markers, Nearby Location, Heat Map on the Map page, Fly + Nearmap |
| `intelligence-and-profiles.md` | Profile pages (Target / Operation / Vehicle / Location / Associate), associations rule, Heat Map report, entity-set cache, photo sizes |
| `registry-import-and-photos.md` | Add Target to Registry, Import Target (document reading, Document AI switch), identity-linked photos, Face picker and match triage, photo upload flows |
| `exports-and-printing.md` | Running sheet and profile PDF exports, fonts, photo captions and sizes |
| `access-admin-and-security.md` | Commands and sharing, access enforcement, per-Command roster and tasking, Command features, teams, Region Search, Zero data, upload sign-in, caching, Passkey login |
| `ui-conventions.md` | Full text of the Form kit, Page kit and map-overlay history |
| `dev-and-ops.md` | CI and the test suite |

`ops-notes.md` (repo root) is the production incident log and deploy procedure — see the last section.

## Standing rules (the ones that have bitten before)

**Code shape**
- Rules that decide what text or data means are **pure functions in `shared/`** with a test in `server/*.test.ts` — change the rule there, not in JSX or a route. To add a phrasing or a case, add it to the rule *and* a test. Examples: `shared/companions.ts` ("who is with them" — one place), `shared/placeSigns.ts`, `shared/walkEventPatterns.ts`, `shared/sentenceJoin.ts`, `shared/observationTidy.ts`, `shared/operationAccess.ts`.
- `pnpm check` and `pnpm test` must both pass (CI runs them on every push/PR and `main` requires the check). The e2e smoke tests run in their own workflow; if a change moves a button or label the smoke test uses (`e2e/smoke.spec.ts`), update the test with it. **If CI goes red, fix the test or the code — never leave a known failure in the suite.** Merge to `main` through a pull request once the check is green.
- A query that filters a large table by a column needs an **index** on it (declared in `drizzle/schema.ts`, with its migration in the same commit; make the migration create it only if missing — see `drizzle/0129_add_missing_indexes.sql`). `scripts/dev/check-schema-drift.ts` (run in the e2e workflow) fails if `schema.ts` and a database built from the migrations disagree, columns or indexes. Never change a database with `drizzle-kit push` or by hand.
- A new DB table must be classified in `scripts/ops/zero-data-tables.mjs` (`KEEP_TABLES` or `CLEAR_TABLES`; a table from an unmerged branch goes in the `OTHER_BRANCH_*` lists) — `server/zeroDataTables.test.ts` fails otherwise.
- If `getAllIntelligenceEntities` starts reading another table, add it to `INTEL_SOURCE_TABLES` (`server/intelCache.ts`); call `invalidateIntelligenceCache()` after any in-place update the fingerprint can't see.
- Anything that writes `runlog_map_settings` and wants the header to follow dispatches `runlog-map-settings-changed` on `window`.

**Observation text**
- Tidy-up, joining words, vehicle lists and typing-slip repair run **only on text an officer typed**. Chips, shortcuts, pre-typed sentences and Target Logger text are never changed. They are deliberately not in the server's `normalizeObservationPunctuation`, and locked rows are never changed.
- Shortcut chip order comes from the **Shortcuts page** only (`shortcuts.sortOrder`, `orderRsChips` in `shared/rsChips.ts`) — no drag on the sheet.
- Street types are always written in full everywhere the app writes text (`shared/streetTypes.ts`); vehicle colour is always lower case (`shared/vehicleColour.ts`).

**Intelligence and associations (legal risk — err towards missing a mention, never inventing one)**
- A link must come from a running sheet row that names both. Never match a surname alias case-insensitively; a bare word may only credit someone with a row if it cannot be an ordinary English word in that row; never fold a mention into a target when it exactly names another registered person (`server/personAliasMatch.ts`, `server/entityAttribution.ts`).

**Photos and files**
- A photo is never saved on pick: pick → preview → green **Confirm upload / Save**. Never upload on file-chosen.
- `/local-uploads/…` and `/manus-storage/…` require a signed-in user (`requireSignedIn`, `server/uploadAccess.ts`). Built-file caching: never widen the long cache beyond hashed `/assets/` files — `index.html`, `sw.js`, `workbox-*.js` and the manifest stay `no-cache` (`server/staticCache.ts`).
- The Nearmap key stays on the server; Google Maps goes through the platform proxy.

**Access, Commands and admin switches**
- Who can reach an operation is one rule (`shared/operationAccess.ts`), enforced centrally in the `requireUser` middleware (`server/operationAccess.ts`). A new procedure that takes an operation / sheet / row / member / attachment id must be covered by that guard — check it is.
- Per-Command roster or tasking endpoint: filter by `rosterCommand()` in the data function, stamp new rows with `rosterCommandForWrite()`, and add its id fields to `ROSTER_ID_REFS` (`server/rosterScope.test.ts` enforces it).
- Switchable Command feature: add the key to `FEATURES` / `FEATURE_KEYS` (and to `DEFAULT_OFF_FEATURES` if it should start off — Check Sheet does), map its procedures in `featureForPath`, hide its menu entries (both sidebar renderings) and gate its route (`gatedByFeature`).
- Any screen that groups people by team on the hosting Command's side uses `visitorTeamMap(command)`.
- Owner-only switches (Command features, Zero data, Document AI) check `isFeatureOwner` on the screen **and** in the procedure.
- Passkey login ships **OFF**; while it is off nothing about it may show for anyone but the owner. Do not widen that.

**Target Logger and the map**
- A map pin's default icon is `override?.markerIcon ?? signIconOf(label) ?? "house_filled"`; an officer's own chosen icon always wins. The target flag goes on the most specific marker the sheet points at (`shared/flagMarker.ts`) and never on an unfit marker.
- Label vehicle markers with their rego — it is the only thing that ties a marker to a specific vehicle.

**Document import**
- The AI step of Import Target is on-device, time-limited (`AI_TIME_BUDGET_MS`) and optional (owner switch); the rules-based reader must never depend on it. When an import hangs, suspect a promise that can never settle before blaming the model. A new agency template is a new recogniser plus a fixture (see `docs/features/registry-import-and-photos.md`).

**Deploying**
- Use `/opt/runlog/deploy.sh` (backup → `git pull --ff-only` → `pnpm install --frozen-lockfile` → `pnpm build` → `drizzle-kit migrate` → `pm2 restart` → health check), run detached: `nohup ./deploy.sh > ~/deploy.log 2>&1 &`. Always include `pnpm install` in any deploy command. Details, history and recoveries are in `ops-notes.md`.

## Planned — local voice observation (not built yet)

A tap-to-talk voice input for the Observation field is planned: mic button → in-browser WebAssembly Whisper (fully on-device, no network call, satisfies the Golden Rule as the "deterministic/on-device" pattern it already asks for) → transcript run through the existing `shortcuts`/`target_shortcuts` expansion dictionary (same trigger→expansion data the RS textarea's `handleShortcutKeyDown` already applies per-keystroke, just as one batch pass over the whole transcript) → dropped into the Observation field for manual review/edit → existing submit flow, unchanged. See the "Local Voice Observation" artifact (published from this session) for the full writeup.

**Confirmed direction, not yet scheduled: this is intended to eventually be wrapped in a native shell (Capacitor or equivalent) to support hands-free wake-word activation** — browsers don't allow background microphone access or an always-listening keyword spotter while the app isn't foregrounded, so that mode is a separate, later, native-app-only project (App Store/MDM distribution, a custom native keyword-spotter plugin, background-audio entitlements). The web-only tap-to-talk build should not assume or block on this — build it as a normal PWA feature — but don't reach for a browser-only voice API or library that would need to be thrown away when the native wrap happens; prefer approaches that would still work (or port cleanly) inside a Capacitor WebView.

## Root-level scratch files

`todo.md`, `map_implementation_context.md`, and `map_tab_bar_notes.md` at the repo root are working notes from prior implementation sessions (task tracking / handoff notes for the map + running-sheet quick-entry feature), not authoritative docs — treat `drizzle/schema.ts`, `routers.ts`, and the actual component code as ground truth over them.

`ops-notes.md` is a running log of production/droplet incidents (outages, high CPU/latency, deploy issues) — check it whenever the user reports something happening on the live droplet, in case it's a recurrence of something already investigated. Append new incidents there rather than only answering in chat, so the next session has the history.
