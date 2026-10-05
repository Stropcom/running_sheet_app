import { describe, it, expect } from "vitest";
import { aliasMentionCompatible } from "./personAliasMatch";

const GRACE = "Grace Olivia TAN, born 3 March 1992 (TAN)";

describe("aliasMentionCompatible", () => {
  it("does not treat a different first name with the same surname as the registered person", () => {
    expect(aliasMentionCompatible("Lawrence TAN", "TAN", GRACE)).toBe(false);
    expect(
      aliasMentionCompatible("Lawrence TAN", "TAN", "Grace Olivia TAN (TAN)")
    ).toBe(false);
  });

  it("matches the bare alias", () => {
    expect(aliasMentionCompatible("TAN", "TAN", GRACE)).toBe(true);
  });

  it("matches the same person's full or partial name", () => {
    expect(aliasMentionCompatible("Grace Olivia TAN", "TAN", GRACE)).toBe(true);
    expect(aliasMentionCompatible("Grace TAN", "TAN", GRACE)).toBe(true);
    expect(aliasMentionCompatible("Olivia TAN", "TAN", GRACE)).toBe(true);
  });

  it("matches an initial and a shortened name", () => {
    expect(aliasMentionCompatible("G TAN", "TAN", GRACE)).toBe(true);
    expect(aliasMentionCompatible("G. TAN", "TAN", GRACE)).toBe(true);
    expect(
      aliasMentionCompatible("Greg TAN", "TAN", "Gregory Paul TAN (TAN)")
    ).toBe(true);
  });

  it("rejects a wrong initial", () => {
    expect(aliasMentionCompatible("L TAN", "TAN", GRACE)).toBe(false);
  });

  it("handles initial+surname aliases like P.HILL", () => {
    expect(
      aliasMentionCompatible(
        "Peter HILL",
        "P.HILL",
        "Peter James HILL (P.HILL)"
      )
    ).toBe(true);
    expect(
      aliasMentionCompatible(
        "Paula HILL",
        "P.HILL",
        "Peter James HILL (P.HILL)"
      )
    ).toBe(false);
  });

  it("handles hyphenated and multi-word surnames", () => {
    expect(
      aliasMentionCompatible(
        "Fatma EL-SAYED",
        "EL-SAYED",
        "Fatma Nour EL-SAYED (EL-SAYED)"
      )
    ).toBe(true);
    expect(
      aliasMentionCompatible(
        "Omar EL-SAYED",
        "EL-SAYED",
        "Fatma Nour EL-SAYED (EL-SAYED)"
      )
    ).toBe(false);
    expect(
      aliasMentionCompatible(
        "Ana VAN DER BERG",
        "VAN DER BERG",
        "Ana Lee VAN DER BERG"
      )
    ).toBe(true);
  });

  it("ignores titles", () => {
    expect(aliasMentionCompatible("Mr TAN", "TAN", GRACE)).toBe(true);
  });
});
