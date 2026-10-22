// A short-lived memory of the Intelligence entity set, so the Intelligence
// folder, the profiles, the map and the "as you type" suggestions don't each
// re-read and re-parse every running sheet row (about 0.7 s at 2,400 rows, and
// growing with the data).
//
// It only reuses what it built when a cheap check of the source tables says
// nothing has changed (row counts, newest id and newest updated-time of every
// table the entity build reads). Two further guards keep it honest:
//  - a build is only remembered when the newest change is at least two seconds
//    old, because timestamps have one-second resolution and a second edit in
//    the same second would look unchanged;
//  - nothing is reused for more than a minute, whatever the check says.
// Every caller gets its own copy, so one request editing a result in place can
// never alter what another request sees. Deterministic: same data → same set.

/** The tables `buildAllIntelligenceEntities` reads (server/db.ts). */
export const INTEL_SOURCE_TABLES: { table: string; hasUpdatedAt: boolean }[] = [
  { table: "sheet_rows", hasUpdatedAt: true },
  { table: "running_sheets", hasUpdatedAt: true },
  { table: "targets", hasUpdatedAt: true },
  { table: "associates", hasUpdatedAt: true },
  { table: "operations", hasUpdatedAt: true },
  { table: "operation_target_links", hasUpdatedAt: false },
  { table: "entity_aliases", hasUpdatedAt: false },
];

/** One query that reads the change marker of every source table. */
export function fingerprintSql(): string {
  const parts: string[] = [];
  INTEL_SOURCE_TABLES.forEach((t, i) => {
    parts.push(`(SELECT COUNT(*) FROM \`${t.table}\`) AS c${i}`);
    parts.push(`(SELECT COALESCE(MAX(id), 0) FROM \`${t.table}\`) AS m${i}`);
    parts.push(
      t.hasUpdatedAt
        ? `(SELECT COALESCE(UNIX_TIMESTAMP(MAX(updatedAt)), 0) FROM \`${t.table}\`) AS u${i}`
        : `0 AS u${i}`
    );
  });
  parts.push("UNIX_TIMESTAMP(NOW()) AS now_s");
  return `SELECT ${parts.join(", ")}`;
}

export interface Fingerprint {
  /** Changes whenever any source table changes. */
  key: string;
  /** Running sheet rows at the time (for the build-time watch). */
  rows: number;
  /** Seconds since the newest change (large when there is no data). */
  ageSeconds: number;
}

/** Reads the result row of `fingerprintSql()`; null if it isn't usable. */
export function fingerprintFromRow(
  row: Record<string, unknown> | undefined | null
): Fingerprint | null {
  if (!row) return null;
  const nums: number[] = [];
  let newest = 0;
  let rows = 0;
  for (let i = 0; i < INTEL_SOURCE_TABLES.length; i++) {
    const c = Number(row[`c${i}`]);
    const m = Number(row[`m${i}`]);
    const u = Number(row[`u${i}`]);
    if (![c, m, u].every(Number.isFinite)) return null;
    nums.push(c, m, u);
    newest = Math.max(newest, u);
    if (INTEL_SOURCE_TABLES[i].table === "sheet_rows") rows = c;
  }
  const now = Number(row.now_s);
  if (!Number.isFinite(now)) return null;
  return {
    key: nums.join("|"),
    rows,
    ageSeconds: newest === 0 ? 1e9 : now - newest,
  };
}

interface Master<T> {
  key: string;
  value: T;
  at: number;
}

export class FingerprintCache<T> {
  private master: Master<T> | null = null;
  private inflight: { key: string; promise: Promise<T> } | null = null;
  private generation = 0;

  constructor(
    private readonly clone: (value: T) => T,
    private readonly opts: {
      minAgeSeconds?: number;
      maxAgeMs?: number;
      now?: () => number;
    } = {}
  ) {}

  /** Forget everything (a write the fingerprint can't see, or a test). */
  invalidate() {
    this.generation++;
    this.master = null;
    this.inflight = null;
  }

  /** The value for this fingerprint: a copy of what is remembered, a copy of a
   * build already under way for the same data, or a fresh `build()`. A null
   * fingerprint (the check failed) always builds fresh and remembers nothing. */
  async get(fp: Fingerprint | null, build: () => Promise<T>): Promise<T> {
    if (!fp) return build();
    const now = this.opts.now?.() ?? Date.now();
    const maxAge = this.opts.maxAgeMs ?? 60_000;
    if (
      this.master &&
      this.master.key === fp.key &&
      now - this.master.at <= maxAge
    )
      return this.clone(this.master.value);
    if (fp.ageSeconds < (this.opts.minAgeSeconds ?? 2)) return build();
    if (this.inflight && this.inflight.key === fp.key)
      return this.clone(await this.inflight.promise);

    const gen = this.generation;
    const built = build();
    // The remembered copy is made before any caller sees the result, so no
    // caller can alter it.
    const masterPromise = built.then(raw => this.clone(raw));
    masterPromise.catch(() => {});
    this.inflight = { key: fp.key, promise: masterPromise };
    try {
      const raw = await built;
      const master = await masterPromise;
      if (this.generation === gen && this.inflight?.promise === masterPromise) {
        this.master = { key: fp.key, value: master, at: now };
        this.inflight = null;
      }
      return raw;
    } catch (e) {
      if (this.inflight?.promise === masterPromise) this.inflight = null;
      throw e;
    }
  }
}
