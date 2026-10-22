# RunLog — technical overview for ICT and the owner

Written 2026-10-22 for version 2.19.0 (branch `runlogtest`; `main` is behind by a few releases and is updated only when the owner says so). It covers how the code is built, where it stands today, what has been put in place so it keeps working as it grows, and the scale assessments just done. Numbers marked *measured* come from tests run on a development machine (faster than the live droplet); numbers marked *estimate* are reasoned, not measured.

## 1. What the app is

RunLog is a "running sheet" logging system for a police surveillance team. Officers, identified by a CIN (a unique officer number, not a login name), log timestamped observations on **running sheets** inside **operations**. Each row must be **certified** by every CIN listed on it before it locks. Around that core sit a Target Registry, an Intelligence module (people, vehicles, addresses and an association map mined from the observation text), Governance (compliance and to-do tracking), an Operation Manager (weekly tasking), a Court section (Word statements, witness lists and WIPC requests), a map, photos and offline draft mode.

It is a legal and evidentiary system, so one rule sits above all others: **no runtime AI or LLM calls, ever.** Everything that reads or analyses text is deterministic code that runs offline and gives the same answer every time. AI is used only by the developer, at development time. This is enforced by tooling, not just policy (section 5).

## 2. How it is built

**One codebase, one process.** A TypeScript monorepo, about 211,000 lines: `server/` (~75,000), `client/src/` (~127,000), `shared/` (~9,000). In production a single Node process serves both the API and the built web app.

| Layer | Technology |
| --- | --- |
| Server | Node 22, Express, tRPC v11 (typed API; the client gets the server's types for free) |
| Database | MySQL (8 in production and CI), Drizzle ORM, 131 numbered migrations |
| Client | React 19, Vite, wouter (routing), TanStack Query, Tailwind v4, shadcn/Radix components |
| Offline | Progressive web app with an IndexedDB draft layer that replays on reconnect |
| Auth | Local username/password (bcrypt), 12-hour cookie session; roles observer / member / admin; optional passkeys (off by default) |
| Court output | `.docx` files generated with the `docx` package |
| Hosting | One DigitalOcean droplet (2 vCPU, 8 GB RAM, 35 GB disk, Sydney), run under pm2 |

**How the server is organised.** The API has 40 area files in `server/routers/` (operation, sheet, row, attachment, target, intelligence, ctoRoster, admin and so on), assembled by a 93-line `server/routers.ts`. Database logic lives in 16 files in `server/db/` (operations, targets, intelligence, reports, governance, court, mapping…), re-exported through one barrel, `server/db.ts`, so imports elsewhere never change. Request shape and permission checks live in the router; queries live in `db/`. Both used to be single files of 10,000 and 19,000 lines; they were split with no behaviour change, and the split was proven by running the same tests and comparisons before and after.

**Rules live in `shared/`.** Anything that decides what text or data *means* is a pure function in `shared/` (64 files) with a test: who is "with" a target, how a street address is written, how observation text is tidied, who may reach an operation. The client and server use the same function, so they cannot disagree.

**Access is enforced in one place.** Who can reach an operation is a single rule (`shared/operationAccess.ts`) applied by a middleware on every procedure that takes an operation, sheet, row or attachment id. Commands (organisational units) can have features switched on and off individually by the owner.

**Data conventions.** Soft delete with a Recycle Bin (nothing important is hard-deleted); an audit log on significant changes; identity stored as CIN so history reads correctly even if a user record changes; server time forced to Australia/Perth.

**Kept deliberately simple.** One process, one database, no queue, no cache service, no separate search engine. That is cheap to run and easy to reason about, and it is also where the limits in section 4 come from.

## 3. Where it is now

- **Version 2.19.0**, 464 commits. All work lands on `runlogtest` first and is deployed there; `main` is merged to only on the owner's instruction, through a pull request with both required checks green.
- **Tests:** 121 test files, 1,617 unit tests (offline, run in about 40 seconds), plus Playwright browser smoke tests (sign in → operation → sheet → row → certify → locked, and every main page opening without the error screen).
- **Latest release (2.19.0):** *Item photos* — a photo of a thing (a bag, a weapon, a document) can be linked by a short description; it shows as an "Item" pill on the sheet and in the Images folder, counts as linked for Governance, and never appears in Intelligence or the PDF export. Database step: migration 0130 (a guarded, safe enum change).
- **Recent releases:** 2.18.x fixed the Incomplete Sheets report, added the missing database indexes, switched Check Sheet off by default and added the Intelligence early-warning tools.
- **Feature notes:** one file per area in `docs/features/`, plus `ops-notes.md` (incident log, deploy and backup procedure). `CLAUDE.md` holds only the standing rules.

### Known weak spots (honest list)

- **Very large client files.** `IntelligenceMapping.tsx` is 15,000 lines and `SheetDetail.tsx` 7,600, plus several of about 3,000. They work, but they are hard to change safely. Splitting them is deferred.
- **Loose typing.** About 400 uses of `any`; there is no ESLint (the type check is the only static gate).
- **Dead template code.** The platform template's LLM, image-generation and voice scaffolding (`server/_core/llm.ts` and friends) and an OAuth path are still in the tree. None is wired to a live route and CI blocks any use, but they should eventually be deleted.
- **One thread.** Node runs on one thread, so any long computation makes every user wait (see the Intelligence rebuild below).
- **Backups are the platform's only.** See section 6.

## 4. Future-proofing now in place

1. **Automated gates on every push and pull request.** `check-and-test` (type check + all unit tests), `e2e` (browser smoke tests on a clean MySQL 8 built from the migrations, plus the schema-drift check) and `no-runtime-ai`. Branch protection on `main` requires the first two. A red run means something is wrong; known failures are never left in the suite (six stale tests were repaired when CI was introduced).
2. **Schema drift check.** `scripts/dev/check-schema-drift.ts` builds a database from the migrations and compares it with `drizzle/schema.ts` for columns, indexes and enum values. It found nine columns that had no migration (fixed in migration 0128) and now stops that happening again.
3. **Idempotent migrations.** New migrations check what exists before changing it, so they are safe to re-run and safe on a database someone changed by hand.
4. **Database indexes (migration 0129).** The scale test found the busiest tables (`sheet_rows`, `row_members`, `certifications`, `row_attachments`, `running_sheets`, `audit_logs` and others) had no indexes except the primary key. Twenty were added. Standing rule: a query that filters a large table by a column needs an index, declared in `schema.ts` with its migration in the same commit.
5. **Heavy reports rewritten to ask the database for the work.** The Incomplete Sheets report used to load every sheet and row ever recorded into memory; it now uses set-based queries and gives the identical answer (proven field by field against a copy of the original on one year of realistic data and a 17-case edge-case database).
6. **Check Sheet switched off by default,** so a rarely used and expensive feature cannot put Intelligence and search at risk. Per-Command feature switches mean any future feature can ship off and be turned on gradually.
7. **Intelligence early-warning light.** After every rebuild of the global entity list the server logs a line (`pm2 logs runlog | grep "\[Intelligence\]"`). It prints WARNING at **3 seconds or 20,000 rows**, whichever comes first (about month 3 of expected growth). That is the agreed trigger to start the redesign below. Reminders are scheduled (around 2027-01-22, and each October for the yearly re-test).
8. **A written, staged redesign plan for Intelligence** (not started, deliberately): Stage A remember each sheet's extraction in memory; Stage B store it in a table; Stage C look up by operation and page the Folder. Each stage is a separate release behind an owner switch, with a zero-difference proof tool (`scripts/dev/intelligence-snapshot.ts`) that compares the new output to the old field by field. Detail in `docs/features/dev-and-ops.md`.
9. **Scale test tooling.** `seed-scale-data.ts` builds a throwaway database of 1, 3 or 5 years of realistic fake data; `scale-measure.ts` times 20 real API calls against it. Re-run every October (procedure recorded).
10. **The no-AI rule is technically enforced** (section 5), and all file-storage access goes through `server/storage.ts`, so moving photos to other storage later is a change in one place.

## 5. The no-AI rule, and how it is enforced

- A pre-write hook (`.claude/hooks/check-no-runtime-ai.sh`) blocks a development session from writing code that introduces an AI SDK, host or helper call.
- `scripts/check-no-runtime-ai.sh` runs the same scan as a CI job on every push and pull request.
- The development environment's permissions deny network access to known AI API hosts.
- Entity extraction (people, vehicles, addresses) is regular-expression and rule based, never a model. A link between two people must come from a running sheet row that names both, and the rules err towards missing a mention rather than inventing one.

## 6. Progress assessment: how it behaves as data grows

**Method.** Growth assumed: 10 running sheets a day, 5 days a week, about 30 rows a sheet (assumed), 3 photos a sheet, 10 target profiles a week with 5 photos each. That gives, per year, about 2,600 sheets / 78,000 rows / 10,600 photos; at 3 years 7,800 / 234,000 / 31,400; at 5 years 13,000 / 390,000 / 52,200. Test data is realistic: sheets are completed and locked within weeks, so only the newest ten working days are open. Real volumes should replace these assumptions when known.

**What was found, and what was done**

| Finding | Effect (measured, 5 years) | Status |
| --- | --- | --- |
| Missing indexes | Opening a sheet 1.7 s → 0.05 s; Governance summary 35 s → 0.4 s; Pattern of life 42 s → 1.8 s | **Fixed** (0129) |
| Incomplete Sheets report read all history | 1 year 32 s → 0.6 s; 3 years: crashed → about 2 s; 5 years: crashed → about 3.5 s | **Fixed** (2.18.1); still grows with rows, next step recorded |
| Check Sheet slow (9 s at 1 year, 42 s at 5) | Depends on the global Intelligence rebuild | **Off by default** until Intelligence Stage C |
| Global Intelligence rebuild, about 0.1 s per 1,000 rows | About 1 s at 10,000 rows, 9–10 s at one year, ~40 s at five. Runs on the single thread, so everyone waits: random stalls of 26–50 s were seen at 3–5 years | **Plan written, early-warning light live**, build deferred on purpose |
| Intelligence Folder sends everything | 36 MB at 1 year, 106 MB at 3, 175 MB at 5, too large for a phone | In the plan (Stage C pages it) |
| Association graph | 4 MB / 10 MB / 16 MB payload; 1 s / 1.8 s / 3.7 s | Acceptable; watch |

**Why the Intelligence work is not being done now.** Today there is almost no data, everything is fast, and the rebuild costs nothing noticeable. Doing the redesign early would risk the one area where a wrong answer is a legal problem, for no benefit to officers yet. The decision (2026-10-22) was to build the safety net first (warning light, comparison tooling, written plan, reminders) and start only when the warning fires, which is expected around month 3, well before anyone would feel it.

**Nothing is lost to the user.** The fixes so far change how fast results arrive, not what they are. Search, Intelligence and reports return the same answers, which is checked by comparison tools rather than assumed.

**Capacity of the infrastructure (estimates unless stated)**

- **Disk is the first hard limit, not CPU or memory.** Photos run at about 5–7 GB a year (the client shrinks them to 1920 px, about 0.5 MB each) on a 35 GB disk that also holds the OS, the database and its local backups. Plan to add a block-storage volume or move photos to object storage within roughly 2–3 years. All access goes through `server/storage.ts`.
- **Memory:** the server was about 1 GB resident at five years of test data (measured); the droplet has 8 GB.
- **CPU:** two cores, but each Node process uses one at a time. Heavy rebuilds stall the process; the Intelligence plan addresses that.

## 7. Backups and recovery

- **DigitalOcean automated droplet backup:** daily, kept **30 days** (changed from 7 on 2026-10-22; reported by the owner, not seen by the developer). Covers database files and photos.
- **`deploy.sh` takes a `mysqldump`** into `~/backups` before every deploy (database only; on the droplet's own disk).
- **Gaps:** a droplet backup of a running database is crash-consistent, not guaranteed clean; restoring rolls the whole server back; backups die with the droplet; nothing is kept off DigitalOcean for years. **The WIPC encryption key must be kept safely off the droplet: without it the protected WIPC data cannot be read from any backup.**
- **Recommended, not yet done:** a nightly clean database dump copied off the droplet, a tested restore (a backup nobody has restored is unproven), a copy of the WIPC key held separately, and a long-term (monthly) copy of the database and photos if records must be retained for years.

## 8. Operating notes

- **Deploy:** `cd /opt/runlog && git checkout runlogtest && git pull --ff-only && nohup ./deploy.sh > ~/deploy.log 2>&1 &` (backup, pull, `pnpm install --frozen-lockfile`, build, migrate, pm2 restart, health check). Migrations run automatically.
- **Versioning:** every merge to `main` bumps `package.json` and `shared/const.ts` together (patch default, minor for a new capability, major for a breaking change).
- **Incidents:** `ops-notes.md` is the running log; check it first for a recurrence.
- **Yearly:** re-run the scale test each October and record the results; check the Intelligence log line before any release.

## 9. Recommended next steps

1. Watch for the Intelligence WARNING; start Stage A when it prints. (Owner decision: nothing else needed now.)
2. Set up the nightly off-droplet database dump, do one test restore, and store the WIPC key separately.
3. Replace the growth assumptions with real figures (sheets a day, rows a sheet, photos) after the first few months.
4. Plan photo storage growth before year 2.
5. Delete the dead LLM / image / voice / OAuth scaffolding from `_core`.
6. When convenient, split the largest client files and add ESLint, with no behaviour change, using the same comparison approach as the server split.
7. Open owner decisions: a cross-Command staff-names list, and a "possible duplicate" check.
