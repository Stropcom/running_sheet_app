import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake database whose operations table can be read "late": the read is held
// open until the test lets it finish, like a poll that started before an
// operation was created.
let opsNow: { id: number; command: string; restricted: boolean }[] = [];
let release: (() => void) | null = null;
let hold = false;

vi.mock("./db", () => {
  const fakeDb = {
    select: () => ({
      from: (table: unknown) => {
        const isOps = (table as { __ops?: boolean }).__ops === true;
        const snapshot = isOps ? opsNow.slice() : [];
        if (isOps && hold)
          return new Promise(res => {
            release = () => res(snapshot);
          });
        return Promise.resolve(snapshot);
      },
    }),
  };
  return { getDb: async () => fakeDb, getAllUsers: async () => [] };
});
vi.mock("../drizzle/schema", async orig => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    operations: Object.assign({}, real.operations, { __ops: true }),
  };
});

import { invalidateAccessCache, loadAccessData } from "./operationAccess";

beforeEach(() => {
  opsNow = [{ id: 1, command: "WESTERN", restricted: false }];
  hold = false;
  release = null;
  invalidateAccessCache();
});

describe("access data cache", () => {
  it("a read that started before an invalidation is not stored, so the next read sees the new operation", async () => {
    hold = true;
    const early = loadAccessData(); // a poll reading the tables…
    await new Promise(r => setTimeout(r, 5));
    // …while an operation is created and the cache invalidated
    opsNow = [...opsNow, { id: 2, command: "WESTERN", restricted: false }];
    invalidateAccessCache();
    hold = false;
    release?.(); // the early read now finishes with the OLD snapshot
    const stale = await early;
    expect(stale.ops.map(o => o.id)).toEqual([1]); // that caller's own view
    // the list refresh right after creating the operation:
    const fresh = await loadAccessData();
    expect(fresh.ops.map(o => o.id)).toEqual([1, 2]);
  });

  it("an ordinary read is still cached for a moment", async () => {
    const a = await loadAccessData();
    opsNow = [...opsNow, { id: 3, command: "WESTERN", restricted: false }];
    const b = await loadAccessData();
    expect(b).toBe(a);
  });
});
