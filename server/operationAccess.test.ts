import { describe, expect, it } from "vitest";
import {
  accessLevel,
  canShareOperation,
  seesEverything,
  visibleOperationIds,
  mapOnlyOperationIds,
  type AccessOperation,
  type AccessShare,
  type AccessUser,
} from "@shared/operationAccess";

const ops: AccessOperation[] = [
  { id: 1, command: "WESTERN" },
  { id: 2, command: "WESTERN" },
  { id: 3, command: "EASTERN" },
  { id: 4, command: "EASTERN" },
];
const west: AccessUser = {
  id: 10,
  command: "WESTERN",
  role: "member",
  allRegions: false,
};
const westObs: AccessUser = { ...west, id: 11, role: "observer" };
const westAdmin: AccessUser = { ...west, id: 12, role: "admin" };
const allAdmin: AccessUser = { ...westAdmin, id: 13, allRegions: true };

describe("accessLevel", () => {
  it("gives full access to your own Command's operations", () => {
    expect(accessLevel(west, ops[0], [])).toBe(3);
  });
  it("gives nothing for another Command's operations by default", () => {
    expect(accessLevel(west, ops[2], [])).toBe(0);
  });
  it("gives the level shared for one operation, only that operation", () => {
    const shares: AccessShare[] = [
      { operationId: 3, fromCommand: null, userId: 10, level: "log" },
    ];
    expect(accessLevel(west, ops[2], shares)).toBe(2);
    expect(accessLevel(west, ops[3], shares)).toBe(0);
  });
  it("a whole-Command share covers every operation that Command owns", () => {
    const shares: AccessShare[] = [
      { operationId: null, fromCommand: "EASTERN", userId: 10, level: "view" },
    ];
    expect(accessLevel(west, ops[2], shares)).toBe(1);
    expect(accessLevel(west, ops[3], shares)).toBe(1);
    expect(accessLevel(west, ops[0], shares)).toBe(3);
  });
  it("takes the highest level when several shares apply", () => {
    const shares: AccessShare[] = [
      { operationId: null, fromCommand: "EASTERN", userId: 10, level: "view" },
      { operationId: 3, fromCommand: null, userId: 10, level: "manage" },
    ];
    expect(accessLevel(west, ops[2], shares)).toBe(3);
    expect(accessLevel(west, ops[3], shares)).toBe(1);
  });
  it("ignores shares made to somebody else", () => {
    const shares: AccessShare[] = [
      { operationId: 3, fromCommand: null, userId: 99, level: "manage" },
    ];
    expect(accessLevel(west, ops[2], shares)).toBe(0);
  });
  it("holds an Observer at View, even with a Log or Manage share", () => {
    const shares: AccessShare[] = [
      { operationId: 3, fromCommand: null, userId: 11, level: "manage" },
    ];
    expect(accessLevel(westObs, ops[2], shares)).toBe(1);
  });
  it("lets an all-region admin reach everything", () => {
    expect(ops.every(o => accessLevel(allAdmin, o, []) === 3)).toBe(true);
  });
});

describe("visibleOperationIds / seesEverything", () => {
  const shares: AccessShare[] = [
    { operationId: 3, fromCommand: null, userId: 10, level: "view" },
  ];
  it("lists own plus shared operations", () => {
    expect([...visibleOperationIds(west, ops, shares)].sort()).toEqual([
      1, 2, 3,
    ]);
  });
  it("can require a minimum level", () => {
    expect([...visibleOperationIds(west, ops, shares, 2)].sort()).toEqual([
      1, 2,
    ]);
  });
  it("knows when there is nothing to enforce", () => {
    expect(seesEverything(west, ops, shares)).toBe(false);
    expect(seesEverything(allAdmin, ops, [])).toBe(true);
    expect(
      seesEverything(
        west,
        ops.filter(o => o.command === "WESTERN"),
        []
      )
    ).toBe(true);
  });
});

describe("canShareOperation", () => {
  it("is the owning Command's admin only", () => {
    expect(canShareOperation(westAdmin, ops[0])).toBe(true);
    expect(canShareOperation(westAdmin, ops[2])).toBe(false);
    expect(canShareOperation(west, ops[0])).toBe(false);
    expect(canShareOperation(allAdmin, ops[2])).toBe(true);
  });
});

import {
  hiddenIntelligenceOperationIds,
  scopeEntities,
} from "@shared/operationAccess";

describe("Intelligence scope", () => {
  const opsR: AccessOperation[] = [
    { id: 1, command: "WESTERN" },
    { id: 2, command: "EASTERN", restricted: false },
    { id: 3, command: "EASTERN", restricted: true },
  ];
  it("hides only other Commands' restricted operations", () => {
    expect([...hiddenIntelligenceOperationIds(west, opsR, [])]).toEqual([3]);
  });
  it("shows a restricted operation that was shared", () => {
    const shares: AccessShare[] = [
      { operationId: 3, fromCommand: null, userId: 10, level: "view" },
    ];
    expect(hiddenIntelligenceOperationIds(west, opsR, shares).size).toBe(0);
  });
  it("hides nothing from its own Command or an all-region admin", () => {
    const east: AccessUser = { ...west, id: 20, command: "EASTERN" };
    expect(hiddenIntelligenceOperationIds(east, opsR, []).size).toBe(0);
    expect(hiddenIntelligenceOperationIds(allAdmin, opsR, []).size).toBe(0);
  });
  it("trims entities to what is visible and drops fully hidden ones", () => {
    const ents = [
      {
        name: "both",
        occurrences: [
          { operationId: 1, rowId: 5 },
          { operationId: 3, rowId: 9 },
        ],
      },
      { name: "hiddenOnly", occurrences: [{ operationId: 3, rowId: 9 }] },
      { name: "registry", occurrences: [{ operationId: 0, rowId: 0 }] },
      { name: "open", occurrences: [{ operationId: 2, rowId: 1 }] },
    ];
    const out = scopeEntities(ents, new Set([3]));
    expect(out.map(e => e.name)).toEqual(["both", "registry", "open"]);
    expect(out[0].occurrences).toHaveLength(1);
  });
});

import { hiddenBrowseOperationIds } from "@shared/operationAccess";

describe("Intelligence scope: browsing vs opening a profile", () => {
  const opsR: AccessOperation[] = [
    { id: 1, command: "WESTERN" },
    { id: 2, command: "EASTERN", restricted: false },
    { id: 3, command: "EASTERN", restricted: true },
  ];
  it("browsing hides every operation you can't reach, restricted or not", () => {
    expect([...hiddenBrowseOperationIds(west, opsR, [])].sort()).toEqual([
      2, 3,
    ]);
  });
  it("opening a profile only hides other Commands' restricted ones", () => {
    expect([...hiddenIntelligenceOperationIds(west, opsR, [])]).toEqual([3]);
  });
  it("a share brings an operation back into the Folder", () => {
    const shares: AccessShare[] = [
      { operationId: 2, fromCommand: null, userId: 10, level: "view" },
    ];
    expect([...hiddenBrowseOperationIds(west, opsR, shares)]).toEqual([3]);
  });
  it("hides nothing from an all-region admin or the owning Command", () => {
    expect(hiddenBrowseOperationIds(allAdmin, opsR, []).size).toBe(0);
    const east: AccessUser = { ...west, id: 20, command: "EASTERN" };
    expect([...hiddenBrowseOperationIds(east, opsR, [])]).toEqual([1]);
  });
});

describe("Investigator-level share", () => {
  const shares: AccessShare[] = [
    { operationId: 3, fromCommand: null, userId: 10, level: "investigator" },
  ];
  it("gives no normal access", () => {
    expect(accessLevel(west, ops[2], shares)).toBe(0);
    expect(visibleOperationIds(west, ops, shares).has(3)).toBe(false);
  });
  it("is picked up as map-only", () => {
    expect([...mapOnlyOperationIds(west, ops, shares)]).toEqual([3]);
  });
  it("is not map-only once a higher share also applies", () => {
    const more: AccessShare[] = [
      ...shares,
      { operationId: null, fromCommand: "EASTERN", userId: 10, level: "view" },
    ];
    expect(mapOnlyOperationIds(west, ops, more).size).toBe(0);
  });
  it("an all-region admin has nothing map-only", () => {
    expect(mapOnlyOperationIds(allAdmin, ops, shares).size).toBe(0);
  });
});
