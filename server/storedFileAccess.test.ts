import { describe, expect, it } from "vitest";
import {
  canOpenStoredFile,
  type AccessOperation,
  type AccessShare,
  type AccessUser,
} from "@shared/operationAccess";
import { parseStoredFileKey, storedFileKey } from "@shared/storedFileKey";

describe("stored file keys", () => {
  it("reads which kind of owner a stored file has", () => {
    expect(
      parseStoredFileKey("row-attachments/sheet-12/row-34/1730_ab.jpeg")
    ).toMatchObject({ kind: "sheet", id: 12 });
    expect(
      parseStoredFileKey("manual-uploads/operation-5/1730_ab.png")
    ).toMatchObject({ kind: "operation", id: 5 });
    expect(
      parseStoredFileKey("target-documents/target-7/1730-profile_ab.pdf")
    ).toMatchObject({ kind: "target", id: 7 });
    expect(
      parseStoredFileKey("smeac-briefings/snapshots/1730-map-snapshot_ab.jpg")
        .kind
    ).toBe("open");
    expect(parseStoredFileKey("row-attachments/1_ab12cd34.jpeg").kind).toBe(
      "other"
    );
    expect(parseStoredFileKey("something/else.bin").kind).toBe("other");
  });

  it("accepts a plain relative path, with or without a leading slash", () => {
    expect(storedFileKey("/row-attachments/sheet-1/a.jpg")).toBe(
      "row-attachments/sheet-1/a.jpg"
    );
    expect(storedFileKey("row-attachments/sheet-1/a%20b.jpg")).toBe(
      "row-attachments/sheet-1/a b.jpg"
    );
  });

  it("refuses a path that climbs out, or is not a path", () => {
    for (const bad of [
      "../etc/passwd",
      "a/../../b",
      "/a/./b",
      "a\\b",
      "a%00b",
      "%2e%2e/x",
      "%E0%A4%A",
      "",
    ])
      expect(storedFileKey(bad)).toBeNull();
  });
});

// Operations: 1 Western open, 2 Eastern open, 3 Eastern restricted, 4 Western restricted.
const ops: AccessOperation[] = [
  { id: 1, command: "WESTERN" },
  { id: 2, command: "EASTERN" },
  { id: 3, command: "EASTERN", restricted: true },
  { id: 4, command: "WESTERN", restricted: true },
];
const west: AccessUser = {
  id: 10,
  command: "WESTERN",
  role: "member",
  allRegions: false,
};
const westObs: AccessUser = { ...west, id: 11, role: "observer" };
const westInv: AccessUser = { ...west, id: 12, role: "investigator" };
const allAdmin: AccessUser = {
  ...west,
  id: 13,
  role: "admin",
  allRegions: true,
};

describe("who may open a stored file", () => {
  it("opens a file in their own Command's operation, restricted or not", () => {
    expect(canOpenStoredFile(west, { ops: [1] }, ops, [])).toBe(true);
    expect(canOpenStoredFile(west, { ops: [4] }, ops, [])).toBe(true);
  });

  it("opens another Command's unrestricted operation (matches are followed across regions)", () => {
    expect(canOpenStoredFile(west, { ops: [2] }, ops, [])).toBe(true);
    expect(canOpenStoredFile(westObs, { ops: [2] }, ops, [])).toBe(true);
  });

  it("closes another Command's RESTRICTED operation, for every role, until it is shared", () => {
    for (const u of [west, westObs, westInv])
      expect(canOpenStoredFile(u, { ops: [3] }, ops, [])).toBe(false);
    const shared: AccessShare[] = [
      { operationId: 3, fromCommand: null, userId: 10, level: "view" },
    ];
    expect(canOpenStoredFile(west, { ops: [3] }, ops, shared)).toBe(true);
    // a share to somebody else changes nothing
    expect(canOpenStoredFile(westObs, { ops: [3] }, ops, shared)).toBe(false);
  });

  it("a file in several operations opens when any one of them is open", () => {
    expect(canOpenStoredFile(west, { ops: [3, 1] }, ops, [])).toBe(true);
    expect(canOpenStoredFile(west, { ops: [3] }, ops, [])).toBe(false);
  });

  it("an all-region admin opens everything", () => {
    expect(canOpenStoredFile(allAdmin, { ops: [3] }, ops, [])).toBe(true);
    expect(canOpenStoredFile(allAdmin, null, ops, [])).toBe(true);
  });

  it("a file with no owner opens for members and admins only", () => {
    expect(canOpenStoredFile(west, null, ops, [])).toBe(true);
    expect(
      canOpenStoredFile({ ...west, role: "admin" }, { ops: [] }, ops, [])
    ).toBe(true);
    expect(canOpenStoredFile(westObs, null, ops, [])).toBe(false);
    expect(canOpenStoredFile(westInv, { ops: [] }, ops, [])).toBe(false);
  });

  it("a briefing's map picture is not tied to evidence and opens for anyone signed in", () => {
    expect(canOpenStoredFile(westObs, { open: true }, ops, [])).toBe(true);
    expect(canOpenStoredFile(westInv, { open: true }, ops, [])).toBe(true);
  });

  it("an operation that no longer exists does not close its files", () => {
    expect(canOpenStoredFile(west, { ops: [999] }, ops, [])).toBe(true);
  });
});
