/**
 * Regression test for isPureTravelledViaRow — decides whether a running
 * sheet row is skipped when the Supervisor Summary auto-syncs new entries
 * (see getSheetSummaryEntries in server/db.ts).
 *
 * Bug: the "tv" shortcut (travelledVia.getStreets in routers.ts) replaces a
 * row's whole text with just the street list itself, with no "continued
 * via" wording anywhere — e.g. "Canning Highway, BICTON,\nStock Road,\n
 * Leach Highway, MYAREE, whereat;". isPureTravelledViaRow's two original
 * checks both required the text to START with "continued via", so a real
 * "tv"-filled row never matched either one and always got pulled into the
 * Summary as a normal entry.
 */
import { describe, it, expect } from "vitest";
import { isPureTravelledViaRow } from "./db";

describe("isPureTravelledViaRow", () => {
  it("recognises a real 'tv' shortcut multi-line street list", () => {
    const text =
      "Canning Highway, BICTON,\nStock Road,\nLeach Highway, MYAREE, whereat;";
    expect(isPureTravelledViaRow(text)).toBe(true);
  });

  it("recognises a real 'tv' shortcut single-street list with a suburb", () => {
    expect(isPureTravelledViaRow("Leach Highway, MYAREE, whereat;")).toBe(true);
  });

  it("recognises a real 'tv' shortcut single-street list with no suburb", () => {
    expect(isPureTravelledViaRow("Leach Highway, whereat;")).toBe(true);
  });

  it("still recognises the bare legacy 'continued via:' trigger alone", () => {
    expect(isPureTravelledViaRow("continued via:")).toBe(true);
    expect(isPureTravelledViaRow("continued via;")).toBe(true);
  });

  it("still recognises a self-contained legacy 'continued via: ... whereat' row", () => {
    expect(
      isPureTravelledViaRow(
        "continued via: Canning Highway, Stock Road, whereat;"
      )
    ).toBe(true);
  });

  it("does not match a narrative row that has more text after 'whereat'", () => {
    const text =
      "Vehicle 1ICW519 STROP driver and sole occupant, arrived 27 Olding Way, MELVILLE WA (27 Olding Way), whereat surveillance continued.";
    expect(isPureTravelledViaRow(text)).toBe(false);
  });

  it("does not match an ordinary observation row", () => {
    const text =
      "Vehicle 1ICW519 STROP driver and sole occupant, departed 27 Olding Way, MELVILLE WA (27 Olding Way).";
    expect(isPureTravelledViaRow(text)).toBe(false);
  });

  it("does not match a multi-line row where a middle line has no trailing comma", () => {
    const text =
      "Canning Highway, BICTON,\nStock Road\nLeach Highway, whereat;";
    expect(isPureTravelledViaRow(text)).toBe(false);
  });

  it("returns false for empty text", () => {
    expect(isPureTravelledViaRow("")).toBe(false);
    expect(isPureTravelledViaRow("   ")).toBe(false);
  });
});
