import { describe, it, expect } from "vitest";
import {
  aliasMentionCompatible,
  aliasSearchFlags,
  bareAliasFollowsOtherGivenName,
  givenNameWords,
  mentionIsOtherRegisteredPerson,
  pickRegisteredForAlias,
} from "./personAliasMatch";

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

describe("aliasMentionCompatible — differently spelled given names", () => {
  it("does not fold a different spelling by surname alone", () => {
    // Why a confirmed merge must redirect onto the target by name (see
    // personTargetByKey in getAllIntelligenceEntities).
    expect(
      aliasMentionCompatible(
        "Mikayla JONES (JONES)",
        "JONES",
        "Mikala JONES (JONES)"
      )
    ).toBe(false);
  });
});

describe("aliasSearchFlags", () => {
  const find = (term: string, text: string) =>
    new RegExp(`\\b${term}\\b`, aliasSearchFlags(term)).test(text);

  it("an all-caps surname alias only matches when written in capitals", () => {
    expect(find("PARK", "PARK departed the address")).toBe(true);
    expect(find("PARK", "walked through the car park")).toBe(false);
    expect(find("PARK", "Kings Park Road")).toBe(false);
    expect(find("TAN", "wearing a tan jacket")).toBe(false);
    expect(find("HILL", "drove up the hill")).toBe(false);
  });

  it("anything that is not all capitals keeps the old case-insensitive match", () => {
    expect(aliasSearchFlags("Timothy HOLMES")).toBe("gi");
    expect(aliasSearchFlags("54 Terrace Road")).toBe("gi");
  });

  it("an alias with punctuation or digits still counts as capitals", () => {
    expect(aliasSearchFlags("P.HILL")).toBe("g");
    expect(aliasSearchFlags("EL-SAYED")).toBe("g");
  });
});

describe("mentionIsOtherRegisteredPerson", () => {
  const TARGET = "Soo-Min Hana PARK, born 25 May 1990 (PARK)";
  const others = ["Hana PARK (PARK)", "Min Hanna PARK (PARK)"];

  it("a mention that is exactly another registered person is not the target", () => {
    expect(
      mentionIsOtherRegisteredPerson("Hana PARK", "PARK", TARGET, others)
    ).toBe(true);
    expect(
      mentionIsOtherRegisteredPerson("Min Hanna PARK", "PARK", TARGET, others)
    ).toBe(true);
  });

  it("the target's own name, full or bare, is still the target", () => {
    expect(
      mentionIsOtherRegisteredPerson(
        "Soo-Min Hana PARK",
        "PARK",
        TARGET,
        others
      )
    ).toBe(false);
    expect(mentionIsOtherRegisteredPerson("PARK", "PARK", TARGET, others)).toBe(
      false
    );
  });

  it("a name no other registered person has still folds into the target", () => {
    expect(
      mentionIsOtherRegisteredPerson("Soo-Min PARK", "PARK", TARGET, others)
    ).toBe(false);
    expect(
      mentionIsOtherRegisteredPerson("Hana PARK", "PARK", TARGET, [])
    ).toBe(false);
  });
});

// ─── Audit stage 5: links the app must not invent ───────────────────────────

describe("surname removal is whole-word only", () => {
  it("keeps the given name 'Stan' when the surname TAN is removed", () => {
    expect(givenNameWords("Stan TAN", "TAN")).toEqual(["Stan"]);
  });
  it("so Susan TAN is not the same person as Stan TAN", () => {
    expect(aliasMentionCompatible("Susan TAN", "TAN", "Stan TAN (TAN)")).toBe(
      false
    );
    expect(aliasMentionCompatible("Stan TAN", "TAN", "Stan TAN (TAN)")).toBe(
      true
    );
  });
  it("still removes the surname when it stands alone, and works for P.HILL", () => {
    expect(givenNameWords("Grace Olivia TAN", "TAN")).toEqual([
      "Grace",
      "Olivia",
    ]);
    expect(givenNameWords("Phil HILL", "P.HILL")).toEqual(["Phil"]);
  });
});

describe("pickRegisteredForAlias — a surname two registered people share", () => {
  const GRACE_T = "Grace TAN (TAN)";
  const GREG_A = "Greg TAN (TAN)";
  const both = [GRACE_T, GREG_A];

  it("one registered person: the existing rule (bare alias or fitting name)", () => {
    expect(pickRegisteredForAlias("TAN", "TAN", [GRACE_T], [GRACE_T])).toBe(
      GRACE_T
    );
    expect(
      pickRegisteredForAlias("Lawrence TAN", "TAN", [GRACE_T], [GRACE_T])
    ).toBeUndefined();
  });
  it("two registered people: a bare TAN is nobody in particular", () => {
    expect(
      pickRegisteredForAlias("TAN", "TAN", [GRACE_T], both)
    ).toBeUndefined();
  });
  it("two registered people: a full given name picks exactly that person", () => {
    expect(pickRegisteredForAlias("Grace TAN", "TAN", [GRACE_T], both)).toBe(
      GRACE_T
    );
  });
  it("two registered people: an initial that fits both is nobody (G TAN)", () => {
    expect(
      pickRegisteredForAlias("G TAN", "TAN", [GRACE_T], both)
    ).toBeUndefined();
  });
  it("two registered people: an initial that fits one picks that one (Gr TAN is too short, G is both; Gra fits Grace)", () => {
    expect(pickRegisteredForAlias("Gra TAN", "TAN", [GRACE_T], both)).toBe(
      GRACE_T
    );
  });
  it("it does not matter which was loaded first or last", () => {
    expect(
      pickRegisteredForAlias(
        "Grace TAN",
        "TAN",
        [GREG_A, GRACE_T],
        [GREG_A, GRACE_T]
      )
    ).toBe(GRACE_T);
  });
});

describe("bareAliasFollowsOtherGivenName — a surname at the start of a sentence", () => {
  const GRACE_REG = "Grace Olivia TAN (TAN)";
  it("'Lawrence TAN departed' at the head of a row is not Grace", () => {
    expect(bareAliasFollowsOtherGivenName("Lawrence ", "TAN", GRACE_REG)).toBe(
      true
    );
    expect(
      bareAliasFollowsOtherGivenName(
        "Vehicle stopped. Lawrence ",
        "TAN",
        GRACE_REG
      )
    ).toBe(true);
  });
  it("mid-sentence 'met Lawrence TAN' is not Grace either", () => {
    expect(
      bareAliasFollowsOtherGivenName("She met Lawrence ", "TAN", GRACE_REG)
    ).toBe(true);
  });
  it("'Grace TAN' and a bare 'TAN' are the registered Grace", () => {
    expect(bareAliasFollowsOtherGivenName("Grace ", "TAN", GRACE_REG)).toBe(
      false
    );
    expect(bareAliasFollowsOtherGivenName("", "TAN", GRACE_REG)).toBe(false);
    expect(
      bareAliasFollowsOtherGivenName("Vehicle stopped. ", "TAN", GRACE_REG)
    ).toBe(false);
  });
  it("an opening word that is not a name ('Then TAN left') still counts as Grace", () => {
    expect(bareAliasFollowsOtherGivenName("Then ", "TAN", GRACE_REG)).toBe(
      false
    );
    expect(bareAliasFollowsOtherGivenName("Later ", "TAN", GRACE_REG)).toBe(
      false
    );
  });
});
