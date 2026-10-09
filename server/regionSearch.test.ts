import { describe, expect, it } from "vitest";
import {
  matchesQuery,
  regionSearch,
  type RegionOperation,
  type RegionSearchEntity,
} from "@shared/regionSearch";

const ops: RegionOperation[] = [
  { id: 1, name: "BOOM", command: "WESTERN", restricted: false },
  { id: 2, name: "HARBOUR", command: "EASTERN", restricted: true },
  { id: 3, name: "COPPER", command: "EASTERN", restricted: false },
  { id: 4, name: "CASSOWARY", command: "CENTRAL", restricted: false },
];

const camry: RegionSearchEntity = {
  shortForm: "E426HOD white Toyota Camry Sedan",
  type: "vehicle",
  isTarget: true,
  targetId: 7,
  occurrences: [
    { operationId: 1, rowId: 0 }, // target card linked to BOOM (Western)
    { operationId: 1, rowId: 12 },
    { operationId: 2, rowId: 40 }, // seen in a HARBOUR (Eastern) row
  ],
};
const hassan: RegionSearchEntity = {
  shortForm: "Farah Leila HASSAN (HASSAN)",
  type: "person",
  isTarget: true,
  occurrences: [
    { operationId: 3, rowId: 0 },
    { operationId: 4, rowId: 9 },
  ],
};
const west = { command: "WESTERN" as const, allRegions: false };
const east = { command: "EASTERN" as const, allRegions: false };
const all = { command: "WESTERN" as const, allRegions: true };

describe("matchesQuery", () => {
  it("needs every typed word, in any order, any case", () => {
    expect(matchesQuery(camry, "camry e426")).toBe(true);
    expect(matchesQuery(camry, "CAMRY nissan")).toBe(false);
    expect(matchesQuery(camry, "   ")).toBe(false);
  });
  it("also matches an also-known-as label", () => {
    const e = { ...hassan, aliasLabels: ["F. Hassen"] };
    expect(matchesQuery(e, "hassen")).toBe(true);
  });
});

describe("regionSearch", () => {
  it("groups the matches by Command, with the role held in each", () => {
    const [r] = regionSearch([camry], ops, west, { query: "e426hod" });
    expect(r.hits.map(h => [h.command, h.role])).toEqual([
      ["WESTERN", "Target"],
      ["EASTERN", "Mentioned"],
    ]);
  });

  it("lists operations, flagging restricted ones", () => {
    const [r] = regionSearch([camry], ops, west, { query: "e426hod" });
    expect(r.hits[1].operations).toEqual([
      { id: 2, name: "HARBOUR", restricted: true },
    ]);
  });

  it("lets a Command open its own, but not another's restricted operation", () => {
    const [r] = regionSearch([camry], ops, west, { query: "e426hod" });
    expect(r.hits.find(h => h.command === "WESTERN")!.canOpen).toBe(true);
    expect(r.hits.find(h => h.command === "EASTERN")!.canOpen).toBe(false);
  });

  it("lets another Command open an unrestricted operation", () => {
    const [r] = regionSearch([hassan], ops, west, { query: "hassan" });
    expect(r.hits.every(h => h.canOpen)).toBe(true);
  });

  it("lets the owning Command open its restricted operation", () => {
    const [r] = regionSearch([camry], ops, east, { query: "e426hod" });
    expect(r.hits.find(h => h.command === "EASTERN")!.canOpen).toBe(true);
    expect(r.hits.find(h => h.command === "WESTERN")!.canOpen).toBe(true);
  });

  it("lets someone who was shared a restricted operation open it", () => {
    const shared = { ...west, reachableOperationIds: [2] };
    const [r] = regionSearch([camry], ops, shared, { query: "e426hod" });
    expect(r.hits.find(h => h.command === "EASTERN")!.canOpen).toBe(true);
  });

  it("lets an all-region admin open everything", () => {
    const [r] = regionSearch([camry], ops, all, { query: "e426hod" });
    expect(r.hits.every(h => h.canOpen)).toBe(true);
  });

  it("filters by type and by Command", () => {
    expect(
      regionSearch([camry, hassan], ops, west, { query: "a", type: "person" })
    ).toHaveLength(1);
    const [r] = regionSearch([camry], ops, west, {
      query: "e426hod",
      command: "EASTERN",
    });
    expect(r.hits.map(h => h.command)).toEqual(["EASTERN"]);
  });

  it("skips entities with no real operation and unknown types", () => {
    const registryOnly: RegionSearchEntity = {
      shortForm: "Nobody HASSAN",
      type: "person",
      occurrences: [{ operationId: 0, rowId: 0 }],
    };
    const unknown: RegionSearchEntity = {
      shortForm: "hassan thing",
      type: "unknown",
      occurrences: [{ operationId: 3, rowId: 2 }],
    };
    expect(
      regionSearch([registryOnly, unknown], ops, west, { query: "hassan" })
    ).toEqual([]);
  });

  it("puts entities held by several Commands first", () => {
    const rs = regionSearch([hassan, camry], ops, west, { query: "a" });
    expect(
      rs.every((r, i) => i === 0 || rs[i - 1].hits.length >= r.hits.length)
    ).toBe(true);
  });
});
