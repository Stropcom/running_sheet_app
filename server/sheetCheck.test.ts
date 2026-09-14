import { describe, it, expect } from "vitest";
import {
  checkSpellingInText,
  checkConsistency,
  isBracketBalanced,
  findDuplicateBracketFragment,
  stableDismissKey,
  findBareAddressMentions,
  findSpaceBeforePunctuation,
  COMMON_MISSPELLINGS,
} from "./sheetCheck";
import type { IntelligenceEntity } from "./db";

function makeEntity(
  overrides: Partial<IntelligenceEntity> &
    Pick<IntelligenceEntity, "type" | "shortForm">
): IntelligenceEntity {
  return {
    occurrences: [
      {
        sheetId: 1,
        sheetTitle: "Sheet 1",
        operationId: 1,
        operationName: "Op One",
        rowId: 1,
        observationSnippet: overrides.shortForm,
        timeMinutes: 600,
        fullDescription: overrides.shortForm,
      },
    ],
    ...overrides,
  };
}

describe("checkSpellingInText", () => {
  it("flags a known common misspelling", () => {
    const hits = checkSpellingInText("Package was recieved by the occupant.");
    expect(hits).toEqual([
      { wrong: "recieved", correct: "received", index: 12 },
    ]);
  });

  it("preserves the original capitalisation of the correction", () => {
    const hits = checkSpellingInText("Recieved the item at the door.");
    expect(hits[0]).toMatchObject({ wrong: "Recieved", correct: "Received" });
  });

  it("finds more than one hit in the same sentence", () => {
    const hits = checkSpellingInText(
      "It occured near the premisis, recieved without issue."
    );
    expect(hits.map(h => h.wrong)).toEqual(["occured", "premisis", "recieved"]);
  });

  it("never flags text inside a bracket — entity codes, not prose", () => {
    const hits = checkSpellingInText(
      "Seen with (RECIEVED) and (1RCV890) nearby."
    );
    expect(hits).toEqual([]);
  });

  it("never flags an ALL-CAPS word — a surname/code by this app's convention", () => {
    const hits = checkSpellingInText("RECIEVED the parcel this morning.");
    expect(hits).toEqual([]);
  });

  it("finds nothing in an ordinary, correctly-spelled sentence", () => {
    expect(
      checkSpellingInText("The team departed the address at 0900hrs.")
    ).toEqual([]);
  });

  it("has no duplicate or self-mapped entries in the dictionary", () => {
    for (const [wrong, correct] of Object.entries(COMMON_MISSPELLINGS)) {
      expect(wrong).not.toBe(correct);
      expect(wrong.endsWith("_")).toBe(false);
    }
  });
});

describe("checkConsistency", () => {
  it("flags the same street address written two different ways on one sheet", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({
        type: "address",
        shortForm: "1 Smith Street",
        occurrences: [
          {
            sheetId: 1,
            sheetTitle: "Sheet 1",
            operationId: 1,
            operationName: "Op One",
            rowId: 10,
            observationSnippet: "outside (1 Smith Street)",
            timeMinutes: 300,
            fullDescription: "1 Smith Street",
          },
        ],
      }),
      makeEntity({
        type: "address",
        shortForm: "1 SMITH ST",
        occurrences: [
          {
            sheetId: 1,
            sheetTitle: "Sheet 1",
            operationId: 1,
            operationName: "Op One",
            rowId: 20,
            observationSnippet: "returned to (1 SMITH ST)",
            timeMinutes: 400,
            fullDescription: "1 SMITH ST",
          },
        ],
      }),
    ];
    const findings = checkConsistency(entities);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: "consistency",
      ruleId: "inconsistent-address-format",
      rowId: 10,
      otherRowId: 20,
    });
  });

  it("flags the same rego written two different ways on one sheet", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "vehicle", shortForm: "1CDR891" }),
      makeEntity({ type: "vehicle", shortForm: "1 CDR-891" }),
    ];
    const findings = checkConsistency(entities);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("inconsistent-vehicle-format");
  });

  it("does not flag an address only ever written one way", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "address", shortForm: "1 Smith Street" }),
    ];
    expect(checkConsistency(entities)).toHaveLength(0);
  });

  it("does not flag two genuinely different addresses", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "address", shortForm: "1 Smith Street" }),
      makeEntity({ type: "address", shortForm: "2 Smith Street" }),
    ];
    expect(checkConsistency(entities)).toHaveLength(0);
  });

  it("does not flag a business-name address bracket against anything", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "address", shortForm: "Blend Cafe" }),
      makeEntity({ type: "address", shortForm: "1 Smith Street" }),
    ];
    expect(checkConsistency(entities)).toHaveLength(0);
  });

  it("does not flag a single person or business mention on its own", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "person", shortForm: "SMITH" }),
      makeEntity({ type: "business", shortForm: "Blend Cafe" }),
    ];
    expect(checkConsistency(entities)).toHaveLength(0);
  });

  it("flags the same person written two different ways (punctuation/spacing) on one sheet", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "person", shortForm: "P.HILL" }),
      makeEntity({ type: "person", shortForm: "P HILL" }),
    ];
    const findings = checkConsistency(entities);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("inconsistent-person-format");
  });

  it("does not conflate a bare surname with an initialled one — could be a different family member", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "person", shortForm: "HILL" }),
      makeEntity({ type: "person", shortForm: "P.HILL" }),
    ];
    expect(checkConsistency(entities)).toHaveLength(0);
  });

  it("flags the same business written two different ways on one sheet", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "business", shortForm: "7-Eleven" }),
      makeEntity({ type: "business", shortForm: "7 Eleven" }),
    ];
    const findings = checkConsistency(entities);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("inconsistent-business-format");
  });

  it("does not flag a more specific business mention as inconsistent with a bare one", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "business", shortForm: "Coles" }),
      makeEntity({ type: "business", shortForm: "Coles Rockingham" }),
    ];
    expect(checkConsistency(entities)).toHaveLength(0);
  });

  it("flags a person name that's a probable typo of another on the sheet", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "person", shortForm: "CHANDRA" }),
      makeEntity({ type: "person", shortForm: "CHANDA" }),
    ];
    const findings = checkConsistency(entities);
    const fuzzy = findings.filter(
      f => f.ruleId === "possible-typo-of-person-name"
    );
    expect(fuzzy).toHaveLength(1);
    expect(fuzzy[0].reason).toContain("CHANDRA");
    expect(fuzzy[0].reason).toContain("CHANDA");
  });

  it("does not flag two genuinely different people", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "person", shortForm: "SMITH" }),
      makeEntity({ type: "person", shortForm: "JONES" }),
    ];
    expect(checkConsistency(entities)).toHaveLength(0);
  });

  it("flags a business name that's a probable typo of another on the sheet", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "business", shortForm: "Woolworths" }),
      makeEntity({ type: "business", shortForm: "Woolworth" }),
    ];
    const findings = checkConsistency(entities);
    const fuzzy = findings.filter(
      f => f.ruleId === "possible-typo-of-business-name"
    );
    expect(fuzzy).toHaveLength(1);
  });

  it("does not flag two genuinely different businesses", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "business", shortForm: "Bunnings" }),
      makeEntity({ type: "business", shortForm: "Kmart" }),
    ];
    expect(checkConsistency(entities)).toHaveLength(0);
  });

  // Regression: a real case found in testing — "1CDR890" mentioned
  // correctly, then typed as "1CDR89" (one digit short) later on the same
  // sheet. Not caught by the exact-normalised-match check above (a
  // genuinely different string, not just different formatting of the same
  // one) — needs the fuzzy pass instead.
  it("flags a rego that's a probable typo of another rego on the sheet", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "vehicle", shortForm: "1CDR890" }),
      makeEntity({ type: "vehicle", shortForm: "1CDR89" }),
    ];
    const findings = checkConsistency(entities);
    const fuzzy = findings.filter(
      f => f.ruleId === "possible-typo-of-vehicle-rego"
    );
    expect(fuzzy).toHaveLength(1);
    expect(fuzzy[0].reason).toContain("1CDR890");
    expect(fuzzy[0].reason).toContain("1CDR89");
  });

  it("does not double-report a pair the exact-match check already caught", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "vehicle", shortForm: "1CDR891" }),
      makeEntity({ type: "vehicle", shortForm: "1 CDR-891" }),
    ];
    const findings = checkConsistency(entities);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("inconsistent-vehicle-format");
  });

  it("does not flag two genuinely different regos", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "vehicle", shortForm: "1ABC123" }),
      makeEntity({ type: "vehicle", shortForm: "1XYZ789" }),
    ];
    expect(checkConsistency(entities)).toHaveLength(0);
  });
});

describe("isBracketBalanced", () => {
  it("accepts an ordinary balanced bracket", () => {
    expect(isBracketBalanced("Departed (1CDR890) towards the address.")).toBe(
      true
    );
  });

  it("accepts text with no brackets at all", () => {
    expect(isBracketBalanced("Nothing bracketed in this sentence.")).toBe(true);
  });

  // Regression: a real malformed observation found in testing — an
  // orphaned extra ")" left over from a duplicated address fragment.
  it("rejects an orphaned closing bracket", () => {
    expect(
      isBracketBalanced(
        "24 Bedford Street, EAST FREMANTLE WA (24 Bedford Street) 24 Bedford Street) and parked."
      )
    ).toBe(false);
  });

  it("rejects an unclosed opening bracket", () => {
    expect(isBracketBalanced("Departed (1CDR890 towards the address.")).toBe(
      false
    );
  });

  it("rejects a close-before-open", () => {
    expect(isBracketBalanced("Weird text )1CDR890( here.")).toBe(false);
  });
});

describe("findDuplicateBracketFragment", () => {
  // Regression: the exact real case found in testing.
  it("finds the duplicated fragment and produces a correct fix", () => {
    const text =
      "arrived at 24 Bedford Street, EAST FREMANTLE WA (24 Bedford Street) 24 Bedford Street) and parked on the street.";
    const result = findDuplicateBracketFragment(text);
    expect(result).toMatchObject({
      wrong: "(24 Bedford Street) 24 Bedford Street)",
      correct: "(24 Bedford Street)",
    });
    expect(text.replace(result!.wrong, result!.correct)).toBe(
      "arrived at 24 Bedford Street, EAST FREMANTLE WA (24 Bedford Street) and parked on the street."
    );
  });

  it("finds a duplicated vehicle rego bracket the same way", () => {
    const result = findDuplicateBracketFragment(
      "departed towards Vehicle 1CDR890 (1CDR890) 1CDR890) heading north."
    );
    expect(result).toMatchObject({
      wrong: "(1CDR890) 1CDR890)",
      correct: "(1CDR890)",
    });
  });

  it("finds nothing in an ordinary, well-formed observation", () => {
    expect(
      findDuplicateBracketFragment(
        "Departed (1CDR890) towards 24 Bedford Street."
      )
    ).toBeNull();
  });

  it("does not misfire on two unrelated brackets on the same row", () => {
    expect(
      findDuplicateBracketFragment(
        "Departed (1CDR890) and arrived at (24 Bedford Street)."
      )
    ).toBeNull();
  });
});

describe("findBareAddressMentions", () => {
  // Regression: the exact real case found in testing — neither mention was
  // ever bracketed, so extractEntitiesFromText never saw either one and the
  // bracket-based consistency check had nothing to compare.
  it("finds a bare address after 'vicinity of' with no street type", () => {
    const hits = findBareAddressMentions(
      "Surveillance ceased in the vicinity of 58 Kintail ."
    );
    expect(hits).toEqual([
      { raw: "58 Kintail", normKey: "58 KINTAIL", hasStreetType: false },
    ]);
  });

  it("finds a bare address after 'at' with a street type, same normKey", () => {
    const hits = findBareAddressMentions(
      "Vehicle 1CDR890, CHANDRA driver and sole occupant, arrived at 58 Kintail Road"
    );
    expect(hits).toEqual([
      {
        raw: "58 Kintail Road",
        normKey: "58 KINTAIL",
        hasStreetType: true,
      },
    ]);
  });

  it("finds nothing when there's no address-introducing preposition", () => {
    expect(
      findBareAddressMentions("58 Kintail Road is a quiet street.")
    ).toEqual([]);
  });

  it("ignores bracketed content", () => {
    expect(
      findBareAddressMentions("Departed towards (at 58 Kintail Road) nearby.")
    ).toEqual([]);
  });
});

describe("findSpaceBeforePunctuation", () => {
  // Regression: the exact real case found in testing — "Road" was deleted
  // from "58 Kintail Road." leaving a dangling space before the full stop.
  it("finds a space before a full stop", () => {
    expect(
      findSpaceBeforePunctuation(
        "Surveillance ceased in the vicinity of 58 Kintail ."
      )
    ).toEqual([{ index: 49 }]);
  });

  it("finds nothing in ordinary, correctly-punctuated text", () => {
    expect(
      findSpaceBeforePunctuation("Vehicle departed the address at 0900hrs.")
    ).toEqual([]);
  });

  it("ignores bracketed content", () => {
    expect(findSpaceBeforePunctuation("Seen with (1CDR890 ,) nearby.")).toEqual(
      []
    );
  });
});

describe("stableDismissKey", () => {
  // Regression: a real bug — a dismissed "comma-in-short-form" finding for
  // a genuine, intentional suburb-disambiguated address ("15 Marbella
  // Avenue, SEVILLE GROVE") kept reappearing, because the entity's own
  // shortForm can legitimately vary (with or without the suburb clause)
  // between one check and the next, and the old key hashed that whole
  // string verbatim.
  it("produces the same key whether or not a suburb clause is present", () => {
    expect(stableDismissKey("15 Marbella Avenue, SEVILLE GROVE")).toBe(
      stableDismissKey("15 Marbella Avenue")
    );
  });

  it("is unaffected by a shortForm with no comma at all", () => {
    expect(stableDismissKey("1CDR890")).toBe("1CDR890");
  });

  it("is case- and whitespace-insensitive, same as scanFindingKey", () => {
    expect(stableDismissKey("  15 marbella avenue , SEVILLE GROVE")).toBe(
      "15 MARBELLA AVENUE"
    );
  });
});
