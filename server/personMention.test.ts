/**
 * Tests for the shared helpers backing the observation field's inline
 * mention autocomplete (see EditableCell / detectMentionTrigger in
 * SheetDetail.tsx, and searchRegisteredPersonMentions in db.ts) and the
 * Target/Associate match-confirmation bracket rewrite in TargetMatchDialog.
 */

import { describe, it, expect } from "vitest";
import {
  bracketCodeFromRegisteredName,
  nameWithoutBornClause,
} from "@shared/addressFormat";

describe("bracketCodeFromRegisteredName", () => {
  it("extracts the trailing bracket code from a registered name", () => {
    expect(
      bracketCodeFromRegisteredName("Basil CAT, born 2 June 2005 (CAT)")
    ).toBe("CAT");
  });

  it("handles a multi-word bracket code", () => {
    expect(
      bracketCodeFromRegisteredName("John P. HILL, born 1 Jan 1990 (P.HILL)")
    ).toBe("P.HILL");
  });

  it("falls back to the input unchanged when there's no trailing bracket", () => {
    expect(bracketCodeFromRegisteredName("No Brackets Here")).toBe(
      "No Brackets Here"
    );
  });
});

describe("nameWithoutBornClause", () => {
  it("drops the born-date-and-bracket clause", () => {
    expect(nameWithoutBornClause("Basil CAT, born 2 June 2005 (CAT)")).toBe(
      "Basil CAT"
    );
  });

  it("falls back to the input unchanged when there's no comma", () => {
    expect(nameWithoutBornClause("No Comma Here")).toBe("No Comma Here");
  });

  it("strips a trailing bracket even with no born-date clause (the reported bug)", () => {
    // An associate registered with no DOB on file has a registered name of
    // just "Full Name (BRACKET)" — no comma to split on. Previously this
    // fell all the way back to the input unchanged, leaving the bracket in
    // the display name — searchRegisteredPersonMentions then appended
    // " (BRACKET)" again on top of it, producing a doubled-up bracket in
    // the inserted mention text (e.g. "Nadia Farah QURESHI (QURESHI)
    // (QURESHI)").
    expect(nameWithoutBornClause("Nadia Farah QURESHI (QURESHI)")).toBe(
      "Nadia Farah QURESHI"
    );
  });
});
