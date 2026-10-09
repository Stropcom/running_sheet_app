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
const resolvers: Resolvers = {
  operationsOfSheets: async ids =>
    new Map(
      ids.filter(i => i === 10 || i === 11).map(i => [i, i === 10 ? 1 : 3])
    ),
  sheetsOfRows: async ids => ids.map(i => (i === 100 ? 10 : 11)),
  rowsOfMembers: async ids => ids.map(i => (i === 1000 ? 100 : 300)),
  operationsOfAttachments: async ids => ids.map(() => 3),
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
});
