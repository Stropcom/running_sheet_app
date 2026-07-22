# Connectors / Plug-ins — planning note

Status: **planning only, nothing implemented yet.** Captured here so the
plan isn't lost before build work starts. Treat this as a working note,
not authoritative docs — same category as `todo.md` /
`map_implementation_context.md`.

## What this is

A new top-level "Connectors" (or "Plug-ins") section for integrating
external vendor systems the team already uses operationally:

- **Trackers** — GPS vehicle tracking. First vendor: **NovaTrack** (Nova
  Trackers), already used internally. Folder is named generically
  (`Trackers`, not `NovaTrack`) so a second GPS vendor can slot in beside
  it later without a rename.
- **4Sight** — purpose/scope not yet defined.
- **Milestone** — purpose/scope not yet defined; likely VMS/CCTV given
  what Milestone is, but not confirmed.

No API docs or credentials exist yet for any of the three. Nothing here
should be built until a specific connector (starting with Trackers) is
picked up for real implementation.

## Golden Rule check

This is deterministic third-party data ingestion (REST polling / possible
webhooks), not AI/LLM inference — doesn't touch CLAUDE.md's no-runtime-AI
rule. Noting this explicitly since that rule is emphatic about any
external API call.

## Folder shape (server)

```
server/connectors/
  trackers/    # NovaTrack adapter lives here first
    client.ts  # auth + fetch wrapper, same shape as _core/map.ts's makeRequest()
    sync.ts    # heartbeat job handler — polls positions/history, upserts DB
  4sight/
  milestone/
```

Router namespace: `connector.trackers`, `connector.fourSight`,
`connector.milestone` — same domain-namespacing convention as the rest of
`routers.ts`.

## Folder shape (client / nav)

New top-level sidebar section "Connectors" with sub-pages `Trackers`,
`4Sight`, `Milestone`. **Important gotcha to remember when this is
built**: the map page (`IntelligenceMapping.tsx`) maintains its own
separate nav-order mirror (`NAV_KEY_MAP` / `DEFAULT_MAP_NAV_ORDER`) rather
than sharing `DashboardLayout.tsx`'s `DEFAULT_NAV_ORDER`. If a Trackers
view also needs to surface on the RS Map (plotting device positions),
**both** nav lists need updating together — a previous bug this session
was exactly this (an "Images" nav item added to one list but not the
other).

## Trackers (NovaTrack) — concrete design

**Phase 1 — GPS positioning + history:**

- `trackedDevices` table — external device id, label, optional link to a
  target/vehicle rego (reusing the rego-based keying convention just
  fixed in Intelligence entity extraction), active flag.
- `deviceTrackPoints` table — append-only, lat/lng/speed/heading/timestamp
  per device, indexed on (deviceId, timestamp) for history queries.
- Sync via a **Heartbeat job** (`server/_core/heartbeat.ts`,
  `/api/scheduled/novatrack-sync`) — this app's conventions
  (`references/periodic-updates.md`) forbid `setInterval`/node-cron.
  Idempotent, looked up by `task_uid`. If NovaTrack turns out to support
  webhooks instead of polling, that's a plain Express route instead — check
  once API docs exist.
- Read-only tRPC endpoints: `listDevices`, `getDeviceHistory(deviceId,
  range)`, `getLatestPositions()`.
- UI: toggleable layer on the existing RS Map, reusing `markerSvgs.ts`
  for device markers rather than a new map component.

**Phase 2 — populating running sheets (deferred):**

Rows are certified officer observations — a legal record — so this
should **not** auto-insert rows from GPS telemetry. Recommended pattern:
NovaTrack activity (geofence entry/exit, stop-start) generates a
**suggested row** the officer can accept-and-edit or dismiss, never
auto-inserted. Same trust model as the "tv" (Travelled Via) auto-fill
feature already built and debugged this session — pre-fill from derived
data, officer still has to Save/certify.

## 4Sight / Milestone

Deliberately not designed beyond "same connector-folder / heartbeat /
env-var pattern as Trackers" — no scope or API access yet. Once either is
picked up, use the Trackers folder as the template rather than guessing
their data shape now.
