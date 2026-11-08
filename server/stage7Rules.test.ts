import { describe, expect, it } from "vitest";
import { liveChangedSinceSeed } from "@shared/ctoRosterMerge";
import {
  noteKnownAddress,
  resolveKnownAddress,
  suburbOf,
  type KnownAddresses,
} from "@shared/knownAddresses";

describe("liveChangedSinceSeed — has the live roster moved since the draft copied it?", () => {
  it("same code and time: not changed", () => {
    expect(
      liveChangedSinceSeed(
        { shiftCode: "d", shiftTime: "0600-1400" },
        { shiftCode: "d", shiftTime: "0600-1400" }
      )
    ).toBe(false);
  });
  it("a different code is a change", () => {
    expect(liveChangedSinceSeed({ shiftCode: "n" }, { shiftCode: "d" })).toBe(
      true
    );
  });
  it("a change to ONLY the start time is a change (it used to be missed)", () => {
    expect(
      liveChangedSinceSeed(
        { shiftCode: "d", shiftTime: "0700-1500" },
        { shiftCode: "d", shiftTime: "0600-1400" }
      )
    ).toBe(true);
  });
  it("no time on either side, and a cell that did not exist, are unchanged", () => {
    expect(
      liveChangedSinceSeed(
        { shiftCode: "d", shiftTime: null },
        { shiftCode: "d" }
      )
    ).toBe(false);
    expect(liveChangedSinceSeed(undefined, undefined)).toBe(false);
  });
});

describe("a bare address only borrows a suburb the sheet pins down", () => {
  const key = "4 glyde street";
  const mk = (...fulls: string[]) => {
    const k: KnownAddresses = new Map();
    for (const f of fulls) noteKnownAddress(k, key, f);
    return k;
  };
  it("reads the suburb out of a written address", () => {
    expect(suburbOf("4 Glyde Street, MAYLANDS WA")).toBe("MAYLANDS");
    expect(suburbOf("4 Glyde Street")).toBe("");
  });
  it("one suburb seen: used", () => {
    expect(resolveKnownAddress(mk("4 Glyde Street, MAYLANDS"), key)).toBe(
      "4 Glyde Street, MAYLANDS"
    );
  });
  it("the same street seen with and without a suburb: the one with it", () => {
    expect(
      resolveKnownAddress(mk("4 Glyde Street", "4 Glyde Street, MAYLANDS"), key)
    ).toBe("4 Glyde Street, MAYLANDS");
  });
  it("two different suburbs seen: unresolved, never whichever came first", () => {
    expect(
      resolveKnownAddress(
        mk("4 Glyde Street, MAYLANDS", "4 Glyde Street, BASSENDEAN"),
        key
      )
    ).toBeUndefined();
  });
  it("nothing seen: unresolved", () => {
    expect(resolveKnownAddress(mk(), key)).toBeUndefined();
  });
});
