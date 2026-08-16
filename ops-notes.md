# Ops Notes

Running log of production incidents, droplet issues, and operational
decisions for the RunLog droplet (`ubuntu-s-1vcpu-1gb-35gb-intel-syd1` —
hostname is stale, actual spec is 2GB RAM, upgraded from the original 1GB
plan; DigitalOcean doesn't rename the hostname on resize).

Newest entries at the top. Read this at the start of any session where the
user mentions the droplet, an outage, high CPU/latency, or asks "did this
happen before."

---

## 2026-08-16 — Droplet switched from tracking the feature branch to `main`

Up to this point the droplet's working copy tracked `claude/claude-md-docs-o4trnz`
directly — every deploy was `git pull` on that branch, `main` was never what
was actually running in production. On 2026-08-16 all outstanding work on
that branch was merged into `main` via PR #4, and the droplet was switched
over: `git checkout main && git pull --ff-only origin main`, then the normal
build/migrate/restart. Confirmed via `git log origin/main..origin/<branch>`
showing zero commits — `main` is a strict superset of the branch (plus a
few pre-existing `main`-only commits: a version bump to 1.0.4, a
faceRecognition native-binary fallback fix, and a saved brand-guide asset).

**Check which branch the droplet is actually on before assuming** —
`git branch --show-current` in `/opt/runlog` — since this has changed at
least once already and future work may or may not go straight to `main`
depending on how the user wants to work going forward.

---

## 2026-08-06 — Deploy procedure, and why `pnpm db:push` shouldn't run on the droplet

The deploy that had been used routinely up to this point:

```bash
cd /opt/runlog && git pull && pnpm install && pnpm db:push && pnpm build && pm2 restart runlog
```

It works, but `db:push` is `drizzle-kit generate && drizzle-kit migrate`
(see `package.json`), and the **`generate` half should never run on a
server**. It compares `drizzle/schema.ts` against the committed snapshots
and *writes a new migration file* when they differ. Normally both come from
git so it's a no-op — but if a schema change is ever committed without its
migration, the droplet authors one itself. That file then exists only on the
droplet, with a random name that won't match the one a developer generates
later for the same change. Two consequences:

- the working tree goes dirty, so the **next `git pull` fails** with "local
  changes would be overwritten" — mid-deploy;
- when the developer's migration for that same change arrives, `migrate`
  tries to apply it on top of a column that already exists and dies with
  `ER_DUP_FIELDNAME`.

That second failure was reproduced in a dev sandbox while checking this
(sandbox DB showed 72 applied against 74 files, failing on
`ALTER TABLE users ADD colorPalette`). **Production was verified clean at
the same time** — see the baseline below — so this is a hazard to avoid,
not damage to repair.

### Health check — run before changing anything about migrations

```bash
cd /opt/runlog
ls drizzle/*.sql | wc -l
git status --porcelain drizzle/          # any output here = server-generated files = drift
node --input-type=module -e "
import 'dotenv/config';
import mysql from 'mysql2/promise';
const c = await mysql.createConnection(process.env.DATABASE_URL);
const [r] = await c.query('SELECT COUNT(*) AS applied FROM __drizzle_migrations');
console.log('applied migrations:', r[0].applied);
await c.end();
"
```

Reads `DATABASE_URL` from `.env`, so no credentials get typed or echoed.
Healthy = applied count equals file count, and `git status` on `drizzle/`
prints nothing.

**Baseline recorded 2026-08-06: 74 of 74 applied, `drizzle/` clean.**
If a future check shows applied < files with no pending deploy to explain
it, or untracked `.sql` files in `drizzle/`, the journal has drifted —
don't just re-run migrate, work out which migration was applied without
being recorded first.

### Preferred deploy — `/opt/runlog/deploy.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/runlog

mkdir -p ~/backups
node --input-type=module -e "
import 'dotenv/config';
const u = new URL(process.env.DATABASE_URL);
console.log(\`-h\${u.hostname} -P\${u.port||3306} -u\${u.username} -p\${decodeURIComponent(u.password)} \${u.pathname.slice(1)}\`);
" | xargs mysqldump > ~/backups/runlog-$(date +%F-%H%M).sql
echo "backup written"

git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
pnpm exec drizzle-kit migrate
pm2 restart runlog

sleep 3
curl -fsS localhost:3000/ > /dev/null && echo "DEPLOY OK" || {
  echo "APP DID NOT COME UP"; pm2 logs runlog --lines 30 --nostream; exit 1;
}
```

Why each difference from the old line, most important first:

1. **`mysqldump` first.** `drizzle-kit migrate` has no undo and this is an
   evidentiary system with certified, locked rows. Non-negotiable.
2. **`build` before `migrate`.** The build can fail on a typecheck or
   bundling error; if that happens after migrating, the schema has moved for
   a deploy that never landed. This way a bad build costs nothing.
3. **`drizzle-kit migrate`, not `db:push`.** Apply-only — it can't author a
   migration on the droplet. See above.
4. **`git pull --ff-only`.** Fails loudly instead of quietly creating a merge
   commit on the server if history diverged.
5. **`--frozen-lockfile`.** Refuses to resolve different versions if the
   lockfile and `package.json` disagree, rather than silently shipping them.
6. **The `curl` check.** `pm2 restart` reports success even when the process
   then crash-loops; this catches a failed boot in three seconds instead of
   when an officer opens the app mid-shift. Adjust the port if nginx fronts
   something other than 3000.

Note there is no rollback for a bad migration other than the dump, hence
point 1. Restoring: `mysql ... running_sheet_app < ~/backups/runlog-<stamp>.sql`.

### Run it detached — the DO web console drops mid-deploy

Deploying from the DigitalOcean web console, the session frequently ends
before the deploy finishes, so there's no way to tell whether it worked or
to copy the output. Don't run the deploy in the foreground there. Run it
detached and log it:

```bash
cd /opt/runlog
nohup ./deploy.sh > ~/deploy.log 2>&1 &
```

Then, whenever the console comes back:

```bash
tail -40 ~/deploy.log        # did it finish? look for "DEPLOY OK"
pm2 status runlog            # is it actually up
pm2 logs runlog --lines 30 --nostream
```

`nohup ... &` means a dropped console can no longer kill the deploy
half-way — which matters most between `migrate` and `pm2 restart`, where
the schema has moved but the running code hasn't.

**If the console dies specifically during `pnpm build`, suspect the OOM
killer** rather than the console. The droplet has 2GB and the vite build is
the most memory-hungry step of the whole deploy. Check:

```bash
dmesg | grep -i "killed process" | tail -5
free -m
```

If it is OOM, the fix is a swap file (there is none by default on this
droplet):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab   # persist across reboot
```

Building on the droplet at all is the underlying cause; the longer-term fix
is to build elsewhere and ship `dist/`, but swap is the cheap answer.

---

## 2026-07-30 (even later) — Doc Import upload failing: missing OCR model in production build

Uploading a document (especially HEIC) through CTO Roster's new "Doc
Import" feature failed with a client-side error: `Unexpected token '<',
"<html> <h"... is not valid JSON`. Two separate issues surfaced along
the way:

1. nginx's default `client_max_body_size` (1MB) was rejecting the
   base64-encoded upload body outright, returning nginx's own HTML error
   page — the tRPC client then failed to parse that HTML as JSON,
   producing the cryptic error. Fixed by adding `client_max_body_size
   30M;` to the `server {}` block in `/etc/nginx/sites-available/runlog`
   (droplet-only config, not in this repo) and reloading nginx.
2. That fix alone didn't resolve it — `pm2 logs runlog` showed the real
   cause: `Error: ENOENT: no such file or directory, open
   '/opt/runlog/dist/models/eng.traineddata.gz'`. The production build
   script only copied `server/faceRecognition/models` into `dist/models`,
   never `server/externalIntel/models` (the OCR feature's vendored
   Tesseract trained-data file) — esbuild bundles the whole server into
   one `dist/index.js`, so every module's `__dirname` resolves to the
   same `dist/` folder after bundling, meaning the missing copy step
   left the OCR worker with nothing to load. Fixed in `package.json`'s
   `build` script (commit on `claude/claude-md-docs-o4trnz`). Verified
   by running the actual production build locally and uploading through
   it end-to-end — dev mode (`tsx watch`) never goes through the
   bundling step, so this was invisible until a real deploy.

**Action needed**: pull latest + redeploy for the model-copy fix to take
effect — this ops-notes entry alone doesn't apply it.

---

## 2026-07-30 (later) — CPU 100% hang, root cause found and fixed: EA Compliance "Check"

User reported CPU 100% recurring — this morning, and again this evening —
and correctly identified the trigger both times: clicking **Check** on
CTO Roster → EA Compliance.

**Root cause:** `checkWeekendFrequency()` in `server/ctoRosterEbaEngine.ts`
had a `while (d <= endDate) { ...; d = addDays(d, 1); }` loop counting
weekend days between a member's first and last recorded shift **one day
at a time**, with no upper bound. Every other loop in that file is bounded
by an array length (safe); this was the only one driven by raw date
arithmetic. `addDays` constructs a full `Date` object and calls
`.toISOString()` per iteration — for a member whose shift history spans
years (or any shift record with a bad/out-of-range date — a typo, stray
seed/test data, etc.), this runs synchronously with **no `await`/yield
inside the loop**, fully blocking the single-threaded Node event loop for
the entire duration. That exactly matches the symptom: 100% CPU, server
unresponsive to all other requests, until restarted.

The default "Check" scope (`main`, no date range selected) queries a
member's *entire* shift history with no date filter, so this was easy to
trigger without realizing it — no unusual input needed, just an
above-average shift history length for one member.

**Fix:** replaced the day-by-day loop with closed-form date-range
arithmetic (`countWeekendDaysInRange`) — O(1) regardless of range size,
verified against the old loop's output across several ranges (all
matched) including a 74-year synthetic range (instant vs. ~27k iterations
the old code would have run). Pushed to `claude/claude-md-docs-o4trnz`.

**Not yet done:** deploy to production (needs `/root/deploy.sh` — no
droplet access from this session) and `pm2 restart runlog` if it's still
hung when this lands.

Worth noting: this doesn't explain the *previous* unexplained hang logged
below (2026-07-30, no request traffic in logs at all that time) — that
one had zero `[Auth]` entries since the prior deploy, meaning nothing hit
the server, so it can't be this same request-triggered bug. Two separate
issues, most likely — leaving the entry below as still unresolved rather
than retroactively closing it.

---

## 2026-07-30 — Unexplained CPU hang, ~50 min, root cause unknown

**What happened:** `runlog` PM2 process (PID 43173, started 16:38:56 UTC
during that evening's deploy) ran normally for ~6 hours, then pegged at
100% CPU (single vCPU box) starting ~22:41 UTC, sustained until restarted
at ~23:32 UTC. Confirmed via `curl localhost:3000` hanging indefinitely —
the Node event loop was fully blocked, not just under heavy load.

**Investigation:**
- `pm2 status` showed the process at 0% CPU while `top` showed 99.9% —
  PM2's own CPU column can be stale/lagged; `top` is the trustworthy source.
- Confirmed via `pm2 pid runlog` + `ss -ltnp | grep :3000` that the spiking
  PID *was* the real, live app (not an orphaned duplicate process — that
  was our first, wrong theory).
- `pm2 logs runlog --lines 80` showed nothing: no errors, no new log lines
  at all after the 16:39 deploy startup sequence, and critically **no
  `[Auth]` request-handling entries since the deploy** — meaning no HTTP
  traffic hit the server the whole time, so whatever hung the event loop
  was NOT triggered by a request.
- A concurrent DigitalOcean status-page incident ("Response Degradation
  Impacting Kimi-K3") looked related at first but turned out to be
  DigitalOcean's separate AI/Model-hosting product (Agentic Inference
  Cloud) — unrelated to droplets/compute. Ruled out.
- Searched the codebase for `setInterval`, `node-cron`, and unbounded
  `while` loops — found nothing that runs unprompted, independent of a
  request, inside the running server process.

**Resolution:** `pm2 restart runlog`. Came back healthy immediately
(200 OK in ~14ms, CPU back to idle, load average dropping normally).

**Root cause: unresolved.** No smoking gun in static code review, and a
silent hang with zero logged activity is very hard to diagnose after the
fact. If this happens again:
1. Don't just restart immediately if you can spare a couple of minutes —
   grab `pm2 status`, `top -bn1`, and ideally a CPU profile *while it's
   still hanging*, since that's the only way to actually identify what's
   looping.
2. Check `free -h` / `top`'s memory line for signs of GC thrashing
   (V8 pinning CPU near 100% under memory pressure) — memory looked normal
   this time (~333MB of 2GB) but worth ruling out explicitly next time.
3. Consider whether it's tied to the TensorFlow.js/face-recognition
   backend doing something pathological — untested theory, no evidence
   either way yet.

## 2026-07-29 — Droplet spec correction

Droplet was resized from 1GB to 2GB RAM at some point; the hostname
(`...1gb-35gb...`) was never updated by DigitalOcean and still reads the
old size. Not a bug, just a label mismatch — don't mistake it for the
droplet still being under-provisioned.
