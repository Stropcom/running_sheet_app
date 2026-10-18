import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../drizzle/schema";

// scripts/ops/zero-data.mjs clears the operational data. A table added to the
// schema must be sorted into "keep" or "clear" there, or the script refuses to
// run — this test catches that at development time instead.
describe("zero-data table lists", () => {
  it("classify every table in the schema exactly once", async () => {
    const lists = (await import(
      "../scripts/ops/zero-data-tables.mjs" as string
    )) as {
      KEEP_TABLES: string[];
      CLEAR_TABLES: string[];
    };
    const names = Object.values(schema)
      .map(v => {
        try {
          return getTableConfig(v as never).name;
        } catch {
          return null;
        }
      })
      .filter((n): n is string => !!n);
    expect(names.length).toBeGreaterThan(60);
    const keep = new Set(lists.KEEP_TABLES);
    const clear = new Set(lists.CLEAR_TABLES);
    const unclassified = names.filter(n => !keep.has(n) && !clear.has(n));
    expect(unclassified).toEqual([]);
    expect(lists.KEEP_TABLES.filter(n => clear.has(n))).toEqual([]);
    // No stale names either (a rename would otherwise go unnoticed).
    const real = new Set(names);
    expect([...keep, ...clear].filter(n => !real.has(n))).toEqual([]);
  });

  it("keeps the whole CTO Roster and clears the tasking board", async () => {
    const lists = (await import(
      "../scripts/ops/zero-data-tables.mjs" as string
    )) as { KEEP_TABLES: string[]; CLEAR_TABLES: string[] };
    expect(lists.CLEAR_TABLES.filter(n => n.startsWith("cto_roster_"))).toEqual(
      []
    );
    expect(lists.CLEAR_TABLES).toContain("op_manager_tasking_cells");
    expect(lists.KEEP_TABLES).toContain("users");
    expect(lists.KEEP_TABLES).toContain("wipc_vault_key_check");
  });

  it("describes every cleared table in exactly one in-app area", async () => {
    const { ZERO_AREAS } = await import("../shared/zeroDataAreas");
    const lists = (await import(
      "../scripts/ops/zero-data-tables.mjs" as string
    )) as { CLEAR_TABLES: string[] };
    const inAreas = ZERO_AREAS.flatMap(a => a.tables);
    expect(new Set(inAreas).size).toBe(inAreas.length);
    expect([...inAreas].sort()).toEqual([...lists.CLEAR_TABLES].sort());
  });

  it("totals rows per area", async () => {
    const { areaTotals } = await import("../shared/zeroDataAreas");
    const t = areaTotals({ operations: 2, operation_shares: 1, audit_logs: 5 });
    expect(t.find(a => a.label === "Operations and sharing")?.rows).toBe(3);
    expect(t.find(a => a.label === "Notifications and audit log")?.rows).toBe(
      5
    );
    expect(t.find(a => a.label === "Map")?.rows).toBe(0);
  });
});
