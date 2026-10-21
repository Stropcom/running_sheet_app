# Dev process & CI

Detailed per-feature notes moved out of `CLAUDE.md` (text unchanged, original order). `CLAUDE.md` keeps only the standing rules; add a new note for a change **here**, in the file for its area.

## Contents

- CI runs the type check and the unit tests on every push and pull request (v2.17.11)

---

**CI runs the type check and the unit tests on every push and pull request (v2.17.11)** — `.github/workflows/ci.yml` (Node 22, pnpm from the `packageManager` field, `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`; on pushes to `main`, `runlogtest` and `develop`, on every pull request, and by hand; a newer run on the same branch cancels the older one; 20-minute limit). The tests are offline (no database, network or AI), so the job needs no services. It sits alongside `no-runtime-ai.yml`, which is unchanged. **The six long-standing failures in `server/running_sheet.test.ts` were stale tests, not bugs, and are fixed** (so the suite is green and a red run means something): sheet creation by an Observer is refused (Observers have view and export access only), a Member creates a sheet on an active operation; `sheet.delete` needed `softDeleteSheet` in the `./db` mock; `row.update` needs an active sheet and operation; and a Member may only certify / unlock rows that carry their own CIN, so those tests now sign in as a member with a CIN and a row that has it. **If CI goes red, fix the test or the code — do not leave a known failure in the suite.** Not done: a branch-protection rule requiring the check before merge (a GitHub setting), browser smoke tests, and splitting `db.ts` / `routers.ts`.
