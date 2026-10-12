import { describe, expect, it } from "vitest";
import { resolveRosterCommand } from "../shared/rosterCommand";
import {
  ROSTER_ID_REFS,
  collectIds,
  enforceRosterWith,
  type RosterOwners,
} from "./rosterScope";
import { appRouter } from "./routers";

describe("resolveRosterCommand", () => {
  it("uses the person's own Command", () => {
    expect(
      resolveRosterCommand({ command: "EASTERN", allRegions: false }, undefined)
    ).toBe("EASTERN");
  });
  it("ignores a requested Command from anyone who isn't an all-region admin", () => {
    expect(
      resolveRosterCommand({ command: "EASTERN", allRegions: false }, "WESTERN")
    ).toBe("EASTERN");
    expect(
      resolveRosterCommand({ command: "EASTERN", allRegions: null }, "WESTERN")
    ).toBe("EASTERN");
  });
  it("lets an all-region admin pick, but only a real Command", () => {
    const admin = { command: "WESTERN", allRegions: true };
    expect(resolveRosterCommand(admin, "SOUTHERN")).toBe("SOUTHERN");
    expect(resolveRosterCommand(admin, "NOWHERE")).toBe("WESTERN");
    expect(resolveRosterCommand(admin, ["CENTRAL"])).toBe("CENTRAL");
    expect(resolveRosterCommand(admin, undefined)).toBe("WESTERN");
  });
  it("falls back to Western when a person has no Command", () => {
    expect(resolveRosterCommand({}, undefined)).toBe("WESTERN");
  });
});

describe("collectIds", () => {
  it("reads plain, list and array-input fields", () => {
    expect(collectIds({ memberId: 4 }, "memberId")).toEqual([4]);
    expect(collectIds({ ids: [1, 2, 3] }, "ids[]")).toEqual([1, 2, 3]);
    expect(collectIds([{ id: 7 }, { id: 8 }], "[].id")).toEqual([7, 8]);
    expect(collectIds({ rows: [{ memberId: 5 }] }, "rows[].memberId")).toEqual([
      5,
    ]);
  });
  it("ignores missing and non-numeric values", () => {
    expect(collectIds({}, "memberId")).toEqual([]);
    expect(collectIds({ memberId: "4" }, "memberId")).toEqual([]);
    expect(collectIds(undefined, "memberId")).toEqual([]);
    expect(collectIds({ ids: "x" }, "ids[]")).toEqual([]);
  });
});

describe("enforceRosterWith", () => {
  // Members 1,2 are Western's; 9 is Eastern's. Team 20 Western, 90 Eastern.
  const owners: RosterOwners = async (kind, ids) => {
    const m = new Map<number, "WESTERN" | "EASTERN">();
    for (const id of ids) {
      if (kind === "member") {
        if (id === 1 || id === 2) m.set(id, "WESTERN");
        if (id === 9) m.set(id, "EASTERN");
      }
      if (kind === "team") {
        if (id === 20) m.set(id, "WESTERN");
        if (id === 90) m.set(id, "EASTERN");
      }
    }
    return m;
  };
  const run = (path: string, input: unknown) =>
    enforceRosterWith(path, "WESTERN", input, owners);

  it("lets a request on its own Command's ids through", async () => {
    await expect(
      run("ctoRoster.roster.updateShift", { memberId: 1 })
    ).resolves.toBeUndefined();
  });
  it("refuses another Command's member", async () => {
    await expect(
      run("ctoRoster.roster.updateShift", { memberId: 9 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("refuses when any one id in a list is another Command's", async () => {
    await expect(
      run("ctoRoster.roster.bulkCopy", {
        sourceMemberId: 1,
        targetMemberIds: [2, 9],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("checks the destination team as well as the member", async () => {
    await expect(
      run("ctoRoster.members.changeTeam", { memberId: 1, newTeamId: 90 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      run("ctoRoster.members.changeTeam", { memberId: 1, newTeamId: 20 })
    ).resolves.toBeUndefined();
  });
  it("checks array inputs (reorder)", async () => {
    await expect(
      run("ctoRoster.teams.reorder", [
        { id: 20, sortOrder: 0 },
        { id: 90, sortOrder: 1 },
      ])
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("lets an id that doesn't exist through (it can't belong to anyone)", async () => {
    await expect(
      run("ctoRoster.roster.updateShift", { memberId: 12345 })
    ).resolves.toBeUndefined();
  });
  it("does nothing for a path with no roster ids", async () => {
    await expect(run("ctoRoster.teams.list", {})).resolves.toBeUndefined();
  });
});

describe("ROSTER_ID_REFS", () => {
  it("only names real procedures (a typo would silently skip the check)", () => {
    const real = new Set(Object.keys(appRouter._def.procedures));
    const missing = Object.keys(ROSTER_ID_REFS).filter(p => !real.has(p));
    expect(missing).toEqual([]);
  });
  it("lists every ctoRoster procedure whose input names a roster id", () => {
    // Reads each procedure's input schema, so a new endpoint that takes a
    // member / team / draft / saved-roster id can't be added without a check.
    const ID_KEYS = new Set([
      "id",
      "memberId",
      "teamId",
      "newTeamId",
      "destinationTeamId",
      "draftId",
      "savedRosterId",
      "sourceMemberId",
      "targetMemberIds",
    ]);
    // eba.updateRule's id is a rule (company-wide settings), not a roster row.
    const NOT_ROSTER_ROWS = new Set(["ctoRoster.eba.updateRule"]);
    const keysOf = (schema: any): string[] => {
      if (!schema) return [];
      const shape = schema.shape ?? schema._def?.shape?.();
      if (shape) return Object.keys(shape);
      const element = schema.element ?? schema._def?.type;
      return element && element !== schema ? keysOf(element) : [];
    };
    const unlisted: string[] = [];
    let withIds = 0;
    for (const [path, proc] of Object.entries(appRouter._def.procedures)) {
      if (!path.startsWith("ctoRoster.") || NOT_ROSTER_ROWS.has(path)) continue;
      const inputs: any[] = (proc as any)._def?.inputs ?? [];
      const names = inputs.flatMap(keysOf);
      if (names.some(k => ID_KEYS.has(k))) {
        withIds++;
        if (!ROSTER_ID_REFS[path]) unlisted.push(path);
      }
    }
    // Guards against this check quietly reading nothing.
    expect(withIds).toBeGreaterThan(40);
    expect(unlisted).toEqual([]);
  });
  it("covers every roster procedure that takes an id, member or team", () => {
    // Every ctoRoster procedure that changes or reads one thing by id must be
    // listed (lists are limited in the data layer instead).
    const byIdPrefixes = [
      "ctoRoster.teams.rename",
      "ctoRoster.teams.delete",
      "ctoRoster.members.delete",
      "ctoRoster.members.move",
      "ctoRoster.members.changeTeam",
      "ctoRoster.secondments.update",
      "ctoRoster.secondments.delete",
      "ctoRoster.roster.updateShift",
      "ctoRoster.roster.bulkUpdate",
      "ctoRoster.roster.bulkCopy",
      "ctoRoster.draft.get",
      "ctoRoster.draft.delete",
      "ctoRoster.draft.merge",
      "ctoRoster.savedRoster.get",
      "ctoRoster.savedRoster.delete",
      "ctoRoster.eba.runCheck",
    ];
    for (const p of byIdPrefixes) expect(ROSTER_ID_REFS[p]).toBeTruthy();
  });
});
