# Ops Notes

Running log of production incidents, droplet issues, and operational
decisions for the RunLog droplet (`ubuntu-s-1vcpu-1gb-35gb-intel-syd1` —
hostname is stale, actual spec is 2GB RAM, upgraded from the original 1GB
plan; DigitalOcean doesn't rename the hostname on resize).

Newest entries at the top. Read this at the start of any session where the
user mentions the droplet, an outage, high CPU/latency, or asks "did this
happen before."

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
