import { describe, expect, it } from "vitest";
import {
  canonicalizeEntities,
  compareEntityLists,
  entityKey,
} from "./intelCompare";

const occ = (rowId: number, sheetId = 1) => ({
  sheetId,
  rowId,
  operationId: 1,
  observationSnippet: `row ${rowId}`,
  timeMinutes: rowId,
});

const veh = (rego: string, rows: number[]) => ({
  type: "vehicle",
  shortForm: rego,
  occurrences: rows.map(r => occ(r)),
});

describe("compareEntityLists", () => {
  it("calls two equal lists identical, whatever order things came in", () => {
    const a = [veh("1ABC123", [3, 1, 2]), veh("1XYZ999", [5])];
    const b = [veh("1XYZ999", [5]), veh("1ABC123", [1, 2, 3])];
    const r = compareEntityLists(a, b);
    expect(r.identical).toBe(true);
    expect(r.countA).toBe(2);
    expect(r.countB).toBe(2);
  });
  it("ignores key order and undefined fields", () => {
    const a = [
      { type: "person", shortForm: "A B", isTarget: true, x: undefined },
    ];
    const b = [{ isTarget: true, shortForm: "A B", type: "person" }];
    expect(compareEntityLists(a, b).identical).toBe(true);
  });
  it("treats alias labels as a set", () => {
    const a = [{ type: "person", shortForm: "A", aliasLabels: ["x", "y"] }];
    const b = [{ type: "person", shortForm: "A", aliasLabels: ["y", "x"] }];
    expect(compareEntityLists(a, b).identical).toBe(true);
  });
  it("reports an entity present on one side only", () => {
    const r = compareEntityLists(
      [veh("1A", [1])],
      [veh("1A", [1]), veh("1B", [2])]
    );
    expect(r.identical).toBe(false);
    expect(r.differences).toEqual([
      { key: "vehicle::1B::::", kind: "only-in-b" },
    ]);
    const r2 = compareEntityLists(
      [veh("1A", [1]), veh("1B", [2])],
      [veh("1A", [1])]
    );
    expect(r2.differences[0]).toMatchObject({ kind: "only-in-a" });
  });
  it("reports which fields changed and the occurrence counts", () => {
    const a = [{ ...veh("1A", [1, 2]), lowConfidence: false }];
    const b = [{ ...veh("1A", [1]), lowConfidence: true }];
    const r = compareEntityLists(a, b);
    expect(r.identical).toBe(false);
    expect(r.differences[0]).toMatchObject({
      kind: "changed",
      fields: ["lowConfidence", "occurrences"],
      occurrences: [2, 1],
    });
  });
  it("notices a single changed occurrence", () => {
    const a = [veh("1A", [1, 2])];
    const b = [veh("1A", [1, 3])];
    expect(compareEntityLists(a, b).identical).toBe(false);
  });
  it("keeps two entities with the same identity apart", () => {
    const e1 = { type: "person", shortForm: "A", targetId: null, n: 1 };
    const e2 = { type: "person", shortForm: "A", targetId: null, n: 2 };
    expect(compareEntityLists([e1, e2], [e2, e1]).identical).toBe(true);
    expect(compareEntityLists([e1, e2], [e1]).identical).toBe(false);
  });
});

describe("canonicalizeEntities / entityKey", () => {
  it("sorts entities by identity", () => {
    const out = canonicalizeEntities([veh("2B", []), veh("1A", [])]) as {
      shortForm: string;
    }[];
    expect(out.map(e => e.shortForm)).toEqual(["1A", "2B"]);
  });
  it("builds the identity from type, short form and ids", () => {
    expect(entityKey({ type: "person", shortForm: "A B", targetId: 7 })).toBe(
      "person::A B::7::"
    );
  });
});
