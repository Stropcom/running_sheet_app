import { describe, expect, it } from "vitest";
import { enforceWith, type Resolvers } from "./operationAccess";
import type {
  AccessOperation,
  AccessShare,
  AccessUser,
} from "@shared/operationAccess";

// Operations 1,2 are Western; 3 is Eastern. Sheets 10,11 belong to 1 and 3.
// Row 100 is on sheet 10; row 300 is on sheet 11.
const ops: AccessOperation[] = [
  { id: 1, command: "WESTERN" },
  { id: 2, command: "WESTERN" },
  { id: 3, command: "EASTERN" },
];
// Targets: 50 is linked to Western op 1 only; 51 to Eastern op 3 only (3 is
// restricted in the "restricted" tests below); 52 to both; 53 to nothing.
const targetOps = new Map<number, number[]>([
  [50, [1]],
  [51, [3]],
  [52, [1, 3]],
  [53, []],
]);
const resolvers: Resolvers = {
  operationsOfSheets: async ids =>
    new Map(
      ids.filter(i => i === 10 || i === 11).map(i => [i, i === 10 ? 1 : 3])
    ),
  sheetsOfRows: async ids => ids.map(i => (i === 100 ? 10 : 11)),
  rowsOfMembers: async ids => ids.map(i => (i === 1000 ? 100 : 300)),
  operationsOfAttachments: async ids => ids.map(() => 3),
  attachmentsOfLinks: async ids => ids.map(() => 7),
  operationsOfTargets: async ids =>
    new Map(ids.map(i => [i, targetOps.get(i) ?? []])),
  targetsOfAssociates: async ids => ids.map(i => (i === 900 ? 51 : 50)),
  targetsOfShortcuts: async ids => ids.map(() => 51),
  operationsOfBriefings: async (_k, ids) => ids.map(i => (i === 1 ? 1 : 3)),
  operationsOfMarkers: async ids => ids.map(i => (i === 1 ? 1 : 3)),
  operationsOfShapes: async ids => ids.map(i => (i === 1 ? 1 : 3)),
};
const west: AccessUser = {
  id: 10,
  command: "WESTERN",
  role: "member",
  allRegions: false,
};
const allAdmin: AccessUser = {
  ...west,
  id: 11,
  role: "admin",
  allRegions: true,
};

const run = (
  user: AccessUser,
  path: string,
  type: "query" | "mutation",
  input: unknown,
  shares: AccessShare[] = []
) =>
  enforceWith({
    user,
    path,
    type,
    getRawInput: async () => input,
    ops,
    shares,
    resolvers,
  });

describe("operation guard", () => {
  it("lets anyone who can reach everything straight through", async () => {
    expect(
      await run(allAdmin, "sheet.listByOperation", "query", { operationId: 3 })
    ).toEqual({});
    const onlyWest = ops.filter(o => o.command === "WESTERN");
    expect(
      await enforceWith({
        user: west,
        path: "sheet.listByOperation",
        type: "query",
        getRawInput: async () => ({ operationId: 1 }),
        ops: onlyWest,
        shares: [],
        resolvers,
      })
    ).toEqual({});
  });

  it("refuses another Command's operation id", async () => {
    await expect(
      run(west, "sheet.listByOperation", "query", { operationId: 3 })
    ).rejects.toThrow(/access/i);
    await expect(
      run(west, "operation.get", "query", { id: 3 })
    ).rejects.toThrow(/access/i);
  });

  it("allows their own Command's", async () => {
    expect(
      await run(west, "sheet.listByOperation", "query", { operationId: 1 })
    ).toEqual({});
  });

  it("resolves sheet, row, member and attachment ids to their operation", async () => {
    await expect(run(west, "sheet.get", "query", { id: 11 })).rejects.toThrow();
    await expect(
      run(west, "row.list", "query", { sheetId: 11 })
    ).rejects.toThrow();
    await expect(
      run(west, "row.update", "mutation", { id: 300 })
    ).rejects.toThrow();
    await expect(
      run(west, "member.remove", "mutation", { memberId: 3000 })
    ).rejects.toThrow();
    await expect(
      run(west, "attachment.get", "query", { attachmentId: 5 })
    ).rejects.toThrow();
    expect(await run(west, "row.list", "query", { sheetId: 10 })).toEqual({});
  });

  it("a View share reads but cannot log", async () => {
    const shares: AccessShare[] = [
      { operationId: 3, fromCommand: null, userId: 10, level: "view" },
    ];
    expect(
      await run(west, "row.list", "query", { sheetId: 11 }, shares)
    ).toEqual({});
    await expect(
      run(west, "row.create", "mutation", { sheetId: 11 }, shares)
    ).rejects.toThrow();
  });

  it("a Log share can log but not edit the operation", async () => {
    const shares: AccessShare[] = [
      { operationId: 3, fromCommand: null, userId: 10, level: "log" },
    ];
    expect(
      await run(west, "row.create", "mutation", { sheetId: 11 }, shares)
    ).toEqual({});
    await expect(
      run(west, "operation.update", "mutation", { id: 3 }, shares)
    ).rejects.toThrow();
  });

  it("a Manage share can edit the operation", async () => {
    const shares: AccessShare[] = [
      { operationId: 3, fromCommand: null, userId: 10, level: "manage" },
    ];
    expect(
      await run(west, "operation.update", "mutation", { id: 3 }, shares)
    ).toEqual({});
  });

  it("trims a list of operation ids to what they can reach", async () => {
    const r = await run(west, "sheet.listByOperations", "query", {
      operationIds: [1, 2, 3],
    });
    expect((r.input as { operationIds: number[] }).operationIds).toEqual([
      1, 2,
    ]);
  });

  it("trims a list of sheet ids", async () => {
    const r = await run(west, "export.pdf", "query", { sheetIds: [10, 11] });
    expect((r.input as { sheetIds: number[] }).sheetIds).toEqual([10]);
  });

  it("fills in everything reachable for a map list with none named", async () => {
    const r = await run(west, "intelligence.mappingLocations", "query", {});
    expect((r.input as { operationIds: number[] }).operationIds.sort()).toEqual(
      [1, 2]
    );
  });

  it("does not block personal view state on a View-only operation", async () => {
    const shares: AccessShare[] = [
      { operationId: 3, fromCommand: null, userId: 10, level: "view" },
    ];
    expect(
      await run(
        west,
        "sheet.setContinuityDismissal",
        "mutation",
        { sheetId: 11 },
        shares
      )
    ).toEqual({});
  });

  it("a whole-Command share opens every operation that Command owns", async () => {
    const shares: AccessShare[] = [
      { operationId: null, fromCommand: "EASTERN", userId: 10, level: "view" },
    ];
    expect(
      await run(
        west,
        "sheet.listByOperation",
        "query",
        { operationId: 3 },
        shares
      )
    ).toEqual({});
  });

  it("covers the other ids a request can name", async () => {
    await expect(
      run(west, "attachment.delete", "mutation", { id: 5 })
    ).rejects.toThrow();
    await expect(
      run(west, "attachment.unlinkFromEntity", "mutation", { linkId: 5 })
    ).rejects.toThrow();
    await expect(
      run(west, "member.remove", "mutation", { id: 3000 })
    ).rejects.toThrow();
    await expect(
      run(west, "export.sheetData", "query", { id: 11 })
    ).rejects.toThrow();
    await expect(
      run(west, "smeacBriefing.getById", "query", { id: 2 })
    ).rejects.toThrow();
    await expect(
      run(west, "ucoGuide.setLevel", "mutation", { id: 2 })
    ).rejects.toThrow();
    await expect(
      run(west, "customMarker.update", "mutation", { id: 2 })
    ).rejects.toThrow();
    await expect(
      run(west, "mapShape.delete", "mutation", { id: 2 })
    ).rejects.toThrow();
    expect(
      await run(west, "smeacBriefing.getById", "query", { id: 1 })
    ).toEqual({});
    expect(
      await run(west, "customMarker.update", "mutation", { id: 1 })
    ).toEqual({});
  });

  it("covers an operation named as linkToOperationId", async () => {
    await expect(
      run(west, "target.registry.create", "mutation", { linkToOperationId: 3 })
    ).rejects.toThrow();
  });

  it("recycle bin entries are traced by type", async () => {
    await expect(
      run(west, "recycleBin.reinstate", "mutation", {
        type: "operation",
        id: 3,
      })
    ).rejects.toThrow();
    await expect(
      run(west, "recycleBin.reinstate", "mutation", { type: "sheet", id: 11 })
    ).rejects.toThrow();
    await expect(
      run(west, "recycleBin.reinstate", "mutation", {
        type: "map_marker",
        id: 2,
      })
    ).rejects.toThrow();
    expect(
      await run(west, "recycleBin.reinstate", "mutation", {
        type: "sheet",
        id: 10,
      })
    ).toEqual({});
  });
});

describe("targets follow their operations", () => {
  const east3: AccessOperation[] = [
    { id: 1, command: "WESTERN" },
    { id: 2, command: "WESTERN" },
    { id: 3, command: "EASTERN", restricted: false },
  ];
  const runT = (
    user: AccessUser,
    path: string,
    type: "query" | "mutation",
    input: unknown,
    opsList: AccessOperation[] = east3,
    shares: AccessShare[] = []
  ) =>
    enforceWith({
      user,
      path,
      type,
      getRawInput: async () => input,
      ops: opsList,
      shares,
      resolvers,
    });

  it("reads a target linked to an operation that is open in Intelligence", async () => {
    // Eastern's op 3 is unrestricted: a Western user may open its target
    // (Region Search -> Open in Intelligence)…
    expect(
      await runT(west, "intelligence.targetProfile", "query", { targetId: 51 })
    ).toEqual({});
    expect(await runT(west, "target.getById", "query", { id: 51 })).toEqual({});
  });

  it("but not once that operation is Restricted", async () => {
    const restricted: AccessOperation[] = east3.map(o =>
      o.id === 3 ? { ...o, restricted: true } : o
    );
    await expect(
      runT(
        west,
        "intelligence.targetProfile",
        "query",
        { targetId: 51 },
        restricted
      )
    ).rejects.toThrow();
    await expect(
      runT(west, "target.getById", "query", { id: 51 }, restricted)
    ).rejects.toThrow();
    // Linked to one of their own operations as well: still reachable.
    expect(
      await runT(west, "target.getById", "query", { id: 52 }, restricted)
    ).toEqual({});
  });

  it("changing a target needs Log on one of its operations", async () => {
    await expect(
      runT(west, "target.update", "mutation", { id: 51 })
    ).rejects.toThrow();
    expect(await runT(west, "target.update", "mutation", { id: 50 })).toEqual(
      {}
    );
    expect(await runT(west, "target.update", "mutation", { id: 52 })).toEqual(
      {}
    );
    const view: AccessShare[] = [
      { operationId: 3, fromCommand: null, userId: 10, level: "view" },
    ];
    await expect(
      runT(west, "target.update", "mutation", { id: 51 }, east3, view)
    ).rejects.toThrow();
  });

  it("a target with no operations is not blocked", async () => {
    expect(await runT(west, "target.getById", "query", { id: 53 })).toEqual({});
  });

  it("follows an associate or a shortcut to its target", async () => {
    await expect(
      runT(west, "associate.update", "mutation", { id: 900 })
    ).rejects.toThrow();
    expect(await runT(west, "associate.update", "mutation", { id: 1 })).toEqual(
      {}
    );
    await expect(
      runT(west, "targetShortcuts.delete", "mutation", { id: 4 })
    ).rejects.toThrow();
  });
});
