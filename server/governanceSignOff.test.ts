/**
 * Tests for isRowSignedOff / computeAllRowsSigned (server/db.ts) — the
 * single shared definition of "has every CIN on every row certified?"
 * used to gate closing a sheet (sheet.close), the client Governance
 * page's own allSigned, and every "outstanding"/"incomplete" report
 * (summaryByOperation, getGovernanceTodoForCin, getIncompleteRunningSheets).
 *
 * Previously reimplemented separately at each of those five call sites,
 * and three of them drifted the same way: a row with NO CIN attached at
 * all contributed nothing to a flattened "every member across the whole
 * sheet" check, so it was silently treated as fine instead of blocking —
 * even though nobody could have certified it, since there was no CIN to
 * certify. One of those three also checked certification at the wrong
 * granularity (does this ROW have any cert at all, rather than does THIS
 * member have their own), which let one certified CIN on a row cover for
 * an uncertified one on the same row.
 */
import { describe, it, expect } from "vitest";
import { isRowSignedOff, computeAllRowsSigned } from "./db";

describe("isRowSignedOff", () => {
  it("is true when the row's only CIN has an active certification", () => {
    const row = { id: 1 };
    const members = [{ id: 10, rowId: 1, memberName: "484" }];
    const certs = [{ rowId: 1, memberId: 10, isActive: true }];
    expect(isRowSignedOff(row, members, certs)).toBe(true);
  });

  it("is false when the row's only CIN has NOT certified", () => {
    const row = { id: 1 };
    const members = [{ id: 10, rowId: 1, memberName: "484" }];
    const certs: { rowId: number; memberId: number; isActive: boolean }[] = [];
    expect(isRowSignedOff(row, members, certs)).toBe(false);
  });

  it("is false when the row has NO CIN attached at all (the reported bug)", () => {
    const row = { id: 1 };
    const members: { id: number; rowId: number; memberName: string }[] = [];
    const certs: { rowId: number; memberId: number; isActive: boolean }[] = [];
    expect(isRowSignedOff(row, members, certs)).toBe(false);
  });

  it("is false when one of two CINs on the row hasn't certified (not covered by the other's cert)", () => {
    const row = { id: 1 };
    const members = [
      { id: 10, rowId: 1, memberName: "484" },
      { id: 11, rowId: 1, memberName: "459" },
    ];
    // Only member 10 has certified -- member 11 has not.
    const certs = [{ rowId: 1, memberId: 10, isActive: true }];
    expect(isRowSignedOff(row, members, certs)).toBe(false);
  });

  it("is true only once BOTH CINs on the row have their own certification", () => {
    const row = { id: 1 };
    const members = [
      { id: 10, rowId: 1, memberName: "484" },
      { id: 11, rowId: 1, memberName: "459" },
    ];
    const certs = [
      { rowId: 1, memberId: 10, isActive: true },
      { rowId: 1, memberId: 11, isActive: true },
    ];
    expect(isRowSignedOff(row, members, certs)).toBe(true);
  });

  it("ignores an inactive (revoked) certification", () => {
    const row = { id: 1 };
    const members = [{ id: 10, rowId: 1, memberName: "484" }];
    const certs = [{ rowId: 1, memberId: 10, isActive: false }];
    expect(isRowSignedOff(row, members, certs)).toBe(false);
  });

  it("treats a lone __SPACE__ spacer entry the same as no CIN at all", () => {
    const row = { id: 1 };
    const members = [{ id: 10, rowId: 1, memberName: "__SPACE__" }];
    const certs: { rowId: number; memberId: number; isActive: boolean }[] = [];
    expect(isRowSignedOff(row, members, certs)).toBe(false);
  });

  it("only counts members and certs belonging to this row, not another row's", () => {
    const row = { id: 1 };
    const members = [
      { id: 10, rowId: 1, memberName: "484" },
      { id: 20, rowId: 2, memberName: "459" }, // different row, uncertified
    ];
    const certs = [{ rowId: 1, memberId: 10, isActive: true }];
    expect(isRowSignedOff(row, members, certs)).toBe(true);
  });
});

describe("computeAllRowsSigned", () => {
  it("is true when every row is individually signed off", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const members = [
      { id: 10, rowId: 1, memberName: "484" },
      { id: 20, rowId: 2, memberName: "459" },
    ];
    const certs = [
      { rowId: 1, memberId: 10, isActive: true },
      { rowId: 2, memberId: 20, isActive: true },
    ];
    expect(computeAllRowsSigned(rows, members, certs)).toBe(true);
  });

  it("is false when ANY row is not signed off, even if the rest are", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const members = [{ id: 10, rowId: 1, memberName: "484" }];
    // Row 2 has no members at all -- the reported bug: a flattened check
    // would find nothing to fail on for row 2 and wrongly return true.
    const certs = [{ rowId: 1, memberId: 10, isActive: true }];
    expect(computeAllRowsSigned(rows, members, certs)).toBe(false);
  });

  it("is false when one row has two CINs and only one has certified", () => {
    const rows = [{ id: 1 }];
    const members = [
      { id: 10, rowId: 1, memberName: "484" },
      { id: 11, rowId: 1, memberName: "459" },
    ];
    const certs = [{ rowId: 1, memberId: 10, isActive: true }];
    expect(computeAllRowsSigned(rows, members, certs)).toBe(false);
  });

  it("is true (vacuous) for an empty rows array -- callers decide what that means", () => {
    expect(computeAllRowsSigned([], [], [])).toBe(true);
  });
});
