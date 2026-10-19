import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import {
  FingerprintCache,
  INTEL_SOURCE_TABLES,
  fingerprintFromRow,
  fingerprintSql,
  type Fingerprint,
} from "./intelCache";

const fp = (key: string, ageSeconds = 100): Fingerprint => ({
  key,
  ageSeconds,
});
const clone = (v: { n: number; list: number[] }) => structuredClone(v);

function counter() {
  let builds = 0;
  return {
    build: async () => ({ n: ++builds, list: [1, 2, 3] }),
    count: () => builds,
  };
}

describe("FingerprintCache", () => {
  it("reuses the build while the fingerprint is unchanged", async () => {
    const c = new FingerprintCache(clone);
    const b = counter();
    const a1 = await c.get(fp("a"), b.build);
    const a2 = await c.get(fp("a"), b.build);
    expect(b.count()).toBe(1);
    expect(a2).toEqual(a1);
  });

  it("rebuilds when the fingerprint changes", async () => {
    const c = new FingerprintCache(clone);
    const b = counter();
    await c.get(fp("a"), b.build);
    const second = await c.get(fp("b"), b.build);
    expect(b.count()).toBe(2);
    expect(second.n).toBe(2);
  });

  it("does not remember a build when the newest change is under two seconds old", async () => {
    const c = new FingerprintCache(clone);
    const b = counter();
    await c.get(fp("a", 1), b.build);
    await c.get(fp("a", 1), b.build);
    expect(b.count()).toBe(2);
  });

  it("never reuses a build for more than a minute", async () => {
    let t = 1_000;
    const c = new FingerprintCache(clone, { now: () => t });
    const b = counter();
    await c.get(fp("a"), b.build);
    t += 59_000;
    await c.get(fp("a"), b.build);
    expect(b.count()).toBe(1);
    t += 2_000;
    await c.get(fp("a"), b.build);
    expect(b.count()).toBe(2);
  });

  it("gives every caller its own copy", async () => {
    const c = new FingerprintCache(clone);
    const b = counter();
    const first = await c.get(fp("a"), b.build);
    first.list.push(99);
    first.n = -1;
    const second = await c.get(fp("a"), b.build);
    expect(second).toEqual({ n: 1, list: [1, 2, 3] });
    second.list.length = 0;
    const third = await c.get(fp("a"), b.build);
    expect(third.list).toEqual([1, 2, 3]);
  });

  it("shares one build between callers that ask at the same time", async () => {
    const c = new FingerprintCache(clone);
    let builds = 0;
    const slow = async () => {
      builds++;
      await new Promise(r => setTimeout(r, 20));
      return { n: builds, list: [1] };
    };
    const [x, y] = await Promise.all([
      c.get(fp("a"), slow),
      c.get(fp("a"), slow),
    ]);
    expect(builds).toBe(1);
    expect(x).toEqual(y);
    x.list.push(2);
    expect(y.list).toEqual([1]);
  });

  it("drops a build that was under way when invalidate() was called", async () => {
    const c = new FingerprintCache(clone);
    let builds = 0;
    const slow = async () => {
      builds++;
      await new Promise(r => setTimeout(r, 20));
      return { n: builds, list: [] as number[] };
    };
    const pending = c.get(fp("a"), slow);
    c.invalidate();
    await pending;
    await c.get(fp("a"), slow);
    expect(builds).toBe(2);
  });

  it("invalidate() forgets what was remembered", async () => {
    const c = new FingerprintCache(clone);
    const b = counter();
    await c.get(fp("a"), b.build);
    c.invalidate();
    await c.get(fp("a"), b.build);
    expect(b.count()).toBe(2);
  });

  it("builds fresh and remembers nothing when there is no fingerprint", async () => {
    const c = new FingerprintCache(clone);
    const b = counter();
    await c.get(null, b.build);
    await c.get(null, b.build);
    await c.get(fp("a"), b.build);
    expect(b.count()).toBe(3);
  });

  it("passes a failed build on and tries again next time", async () => {
    const c = new FingerprintCache(clone);
    await expect(
      c.get(fp("a"), async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    const b = counter();
    const ok = await c.get(fp("a"), b.build);
    expect(ok.n).toBe(1);
  });
});

describe("fingerprint query", () => {
  it("names real tables, and updatedAt only where the column exists", () => {
    const byName = new Map<string, Record<string, unknown>>();
    for (const v of Object.values(schema)) {
      try {
        const name = getTableName(v as never);
        if (typeof name === "string") byName.set(name, v as never);
      } catch {
        /* not a table */
      }
    }
    for (const t of INTEL_SOURCE_TABLES) {
      const table = byName.get(t.table);
      expect(table, t.table).toBeTruthy();
      expect("updatedAt" in (table as object), t.table).toBe(t.hasUpdatedAt);
    }
    expect(fingerprintSql()).toContain("UNIX_TIMESTAMP(NOW())");
  });

  it("changes key when any marker changes and reports the age", () => {
    const row: Record<string, number> = { now_s: 1_000 };
    INTEL_SOURCE_TABLES.forEach((_, i) => {
      row[`c${i}`] = 5;
      row[`m${i}`] = 9;
      row[`u${i}`] = 900;
    });
    const a = fingerprintFromRow(row)!;
    expect(a.ageSeconds).toBe(100);
    expect(fingerprintFromRow({ ...row, c2: 6 })!.key).not.toBe(a.key);
    expect(fingerprintFromRow({ ...row, u1: 901 })!.key).not.toBe(a.key);
    expect(fingerprintFromRow({ ...row, m3: 10 })!.key).not.toBe(a.key);
    expect(fingerprintFromRow(null)).toBeNull();
    expect(fingerprintFromRow({ ...row, now_s: "x" })).toBeNull();
  });
});
