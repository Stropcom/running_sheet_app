import { describe, it, expect } from "vitest";
import {
  checkSpellingInText,
  checkConsistency,
  isBracketBalanced,
  findDuplicateBracketFragment,
  stableDismissKey,
  findBareAddressMentions,
  findBareVehicleMentions,
  findBareBusinessMentions,
  findTargetNameTypos,
  findSpaceBeforePunctuation,
  COMMON_MISSPELLINGS,
} from "./sheetCheck";
import type { IntelligenceEntity, ObservationTextForSheet } from "./db";

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

  // Regression: a real case found in testing — "arriv" instead of
  // "arrived", a truncation rather than a classic misspelling.
  it("flags 'arriv' as a truncated 'arrived'", () => {
    const hits = checkSpellingInText(
      "Vehicle 1CDR890, CHANDRA driver and sole occupant, arriv at the address."
    );
    expect(hits).toContainEqual(
      expect.objectContaining({ wrong: "arriv", correct: "arrived" })
    );
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

  // Regression: a real case found in testing — extractEntitiesFromText
  // routinely enriches a short address bracket into "Street, SUBURB"
  // using the surrounding sentence, this team's normal writing
  // convention. Including or omitting that suburb clause is legitimate,
  // deliberate variance (the same conclusion already reached for the
  // "15 Marbella Avenue, SEVILLE GROVE" dismiss-key bug), never a real
  // formatting inconsistency — this must NOT be flagged.
  it("does not flag the same street with and without a suburb clause", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({
        type: "address",
        shortForm: "24 Bedford Street, EAST FREMANTLE",
      }),
      makeEntity({ type: "address", shortForm: "24 Bedford Street" }),
    ];
    expect(checkConsistency(entities)).toHaveLength(0);
  });

  // But a genuine formatting difference must still be caught even when
  // one side also happens to carry a suburb clause — the suburb isn't
  // what's being compared, the street portion still is.
  it("still flags a real street-format difference even with a suburb clause present", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({
        type: "address",
        shortForm: "24 Bedford Street, EAST FREMANTLE",
      }),
      makeEntity({ type: "address", shortForm: "24 Bedford Rd" }),
    ];
    const findings = checkConsistency(entities);
    expect(
      findings.filter(f => f.ruleId === "inconsistent-address-format")
    ).toHaveLength(1);
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

  // Regression: a real bug found in testing — a text-mined vehicle
  // entity's shortForm is NOT the bare rego, it's "REGO description"
  // (e.g. "1CDR890 green Subaru Outback station sedan" — see
  // extractEntitiesFromText's vehicle branch in db.ts). Normalising by
  // stripping spaces/hyphens alone turned that into a huge glued string
  // that could never usefully compare against anything, so a real
  // deliberately-planted wrong rego on the sheet went completely
  // uncaught. normalizeRego now falls back to vehicleRegoKey (the same
  // rego-extraction the rest of the app already uses) for anything too
  // long to plausibly be a bare rego on its own.
  it("flags a bare wrong rego as a probable typo of a fully-described vehicle", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({
        type: "vehicle",
        shortForm: "1CDR890 green Subaru Outback station sedan",
      }),
      makeEntity({ type: "vehicle", shortForm: "1CDR80" }),
    ];
    const findings = checkConsistency(entities);
    const fuzzy = findings.filter(
      f => f.ruleId === "possible-typo-of-vehicle-rego"
    );
    expect(fuzzy).toHaveLength(1);
  });

  // The suggested fix must offer bare, literal regos ("1CDR890" /
  // "1CDR80") — not the full reconstructed description ("1CDR890 green
  // Subaru Outback station sedan") — since only the bare rego actually
  // appears verbatim in a row's own text for a one-click find/replace to
  // work. Which of the two lands in `wrong` vs `correct` just follows
  // input order (whichever entity is scanned first becomes the "this
  // row" side) — this check isn't asserting which one is the REAL typo,
  // only that both values offered are the literal bare regos, not
  // descriptions, and that both appear (one each way).
  it("offers a Keep/Change fix using the bare regos, not the full description", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({
        type: "vehicle",
        shortForm: "1CDR890 green Subaru Outback station sedan",
      }),
      makeEntity({ type: "vehicle", shortForm: "1CDR80" }),
    ];
    const findings = checkConsistency(entities);
    const fuzzy = findings.find(
      f => f.ruleId === "possible-typo-of-vehicle-rego"
    );
    expect(
      [fuzzy?.suggestedFix?.wrong, fuzzy?.suggestedFix?.correct].sort()
    ).toEqual(["1CDR80", "1CDR890"]);
  });

  // Regression: a real false positive found in testing — two genuinely
  // different, adjacently-plated vehicles, each independently and fully
  // described in the same row ("1CDR890 green Subaru Outback station
  // sedan" and "1CDR891 burgundy Skoda Octavia hatch"), scored an 86%
  // rego-only match and got flagged as a possible typo of each other —
  // exactly the coincidental-adjacent-plate risk vehicles were already
  // known to carry. Fixed by only firing the fuzzy pass when at least one
  // side is a bare/shorthand mention, not fully described on both sides.
  it("does not flag two independently-described, genuinely different vehicles with adjacent plates", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({
        type: "vehicle",
        shortForm: "1CDR890 green Subaru Outback station sedan",
      }),
      makeEntity({
        type: "vehicle",
        shortForm: "1CDR891 burgundy Skoda Octavia hatch",
      }),
    ];
    const findings = checkConsistency(entities);
    expect(
      findings.filter(f => f.ruleId === "possible-typo-of-vehicle-rego")
    ).toHaveLength(0);
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

  // Regression: the exact real case found in testing — this team's other
  // real address convention, introduced straight after a comma (usually
  // after a business name) with no preposition at all.
  it("finds a bare address straight after a comma, with no street type", () => {
    const hits = findBareAddressMentions(
      "Vehicle 1CDR890, CHANDRA driver and sole occupant, arriv at Blend Cafe and Pizza Bar, 356 Marmion, MELVILLE WA (Blend Cafe and Pizza Bar) parked in the car park."
    );
    expect(hits).toContainEqual({
      raw: "356 Marmion",
      normKey: "356 MARMION",
      hasStreetType: false,
    });
  });

  it("finds the same address after a comma WITH a street type, same normKey", () => {
    const hits = findBareAddressMentions(
      "Blend Cafe and Pizza Bar, 356 Marmion Street, MELVILLE WA (Blend Cafe and Pizza Bar) parked in the car park."
    );
    expect(hits).toContainEqual({
      raw: "356 Marmion Street",
      normKey: "356 MARMION",
      hasStreetType: true,
    });
  });
});

describe("findBareBusinessMentions", () => {
  // Regression: the exact real case found in testing — a business name
  // typo'd on a later, unbracketed re-mention ("Blend Caf" missing the
  // "e"), with no reliable anchor word the way "Vehicle "/"at " give
  // addresses and vehicles — so this only fires when a candidate phrase
  // is actually close to something already properly bracketed elsewhere.
  it("finds a bare business phrase close to a known bracketed business", () => {
    const hits = findBareBusinessMentions(
      "CHANDRA exited the vehicle, walked through the car park, entered Blend Caf and Pizza Bar and continued out of sight.",
      ["Blend Cafe and Pizza Bar"]
    );
    expect(hits).toEqual(["Blend Caf and Pizza Bar"]);
  });

  it("finds nothing when there's no known business to compare against", () => {
    expect(
      findBareBusinessMentions(
        "CHANDRA entered Blend Caf and Pizza Bar and continued out of sight.",
        []
      )
    ).toEqual([]);
  });

  it("does not flag a phrase that isn't close to any known business", () => {
    expect(
      findBareBusinessMentions(
        "CHANDRA walked past Kmart and continued down Stirling Highway.",
        ["Blend Cafe and Pizza Bar"]
      )
    ).toEqual([]);
  });

  it("does not flag an exact match to a known business", () => {
    expect(
      findBareBusinessMentions(
        "CHANDRA entered Blend Cafe and Pizza Bar and continued out of sight.",
        ["Blend Cafe and Pizza Bar"]
      )
    ).toEqual([]);
  });

  it("never flags an ALL-CAPS phrase — a surname/code by this app's convention", () => {
    expect(
      findBareBusinessMentions("CHANDRA SMITH walked through the car park.", [
        "Chandra Smith Removals",
      ])
    ).toEqual([]);
  });

  it("ignores bracketed content", () => {
    expect(
      findBareBusinessMentions(
        "Departed towards (Blend Caf and Pizza Bar) nearby.",
        ["Blend Cafe and Pizza Bar"]
      )
    ).toEqual([]);
  });
});

describe("findTargetNameTypos", () => {
  // Regression: the exact real case found in testing — the TGT ("CHANDRA")
  // is never expected to be bracketed at all (their identity comes from
  // the target card, not the bracket-mining convention), so a typo of
  // their own name has to be compared directly against the sheet's
  // assigned target — never against other bracket-mined entities, since
  // there won't be any for the target themselves.
  it("flags a bare typo of the sheet's assigned target's surname", () => {
    const rows: ObservationTextForSheet[] = [
      {
        rowId: 1,
        timeMinutes: 600,
        observation:
          "Vehicle 1CDR890, CHANDRA driver and sole occupant, departed 15 Marbella Avenue.",
      },
      {
        rowId: 2,
        timeMinutes: 700,
        observation:
          "Vehicle 1CDR890, CHANDR driver and sole occupant, arrived at 8 Kintail Road.",
      },
    ];
    const findings = findTargetNameTypos(rows, "CHANDRA");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "possible-typo-of-target-name",
      category: "registry",
      rowId: 2,
      suggestedFix: { wrong: "CHANDR", correct: "CHANDRA" },
    });
  });

  it("does not flag the target's name written correctly", () => {
    const rows: ObservationTextForSheet[] = [
      {
        rowId: 1,
        timeMinutes: 600,
        observation: "CHANDRA departed the address.",
      },
    ];
    expect(findTargetNameTypos(rows, "CHANDRA")).toHaveLength(0);
  });

  it("does not flag anything when the sheet has no assigned target", () => {
    const rows: ObservationTextForSheet[] = [
      {
        rowId: 1,
        timeMinutes: 600,
        observation: "CHANDR departed the address.",
      },
    ];
    expect(findTargetNameTypos(rows, null)).toHaveLength(0);
  });

  // The app's own "P.HILL" initial-plus-surname convention must not be
  // flagged as a typo of the bare target surname.
  it("does not flag an initial-prefixed variant of the target's name", () => {
    const rows: ObservationTextForSheet[] = [
      {
        rowId: 1,
        timeMinutes: 600,
        observation: "Seen with J.CHANDRA nearby.",
      },
    ];
    expect(findTargetNameTypos(rows, "CHANDRA")).toHaveLength(0);
  });

  it("ignores bracketed content", () => {
    const rows: ObservationTextForSheet[] = [
      { rowId: 1, timeMinutes: 600, observation: "Seen with (CHANDR) nearby." },
    ];
    expect(findTargetNameTypos(rows, "CHANDRA")).toHaveLength(0);
  });

  it("does not flag a genuinely different surname", () => {
    const rows: ObservationTextForSheet[] = [
      {
        rowId: 1,
        timeMinutes: 600,
        observation: "SMITH departed the address.",
      },
    ];
    expect(findTargetNameTypos(rows, "CHANDRA")).toHaveLength(0);
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

  // Regression: a real bug found in testing — blanking bracket content
  // with SPACES (rather than a non-space filler) left a run of padding
  // spaces immediately in front of any punctuation that directly followed
  // a bracket in the original text, e.g. "(58 Kintail Road)." — which is
  // this app's own normal convention, so this false-fired on nearly every
  // bracketed entity mention followed by punctuation.
  it("does not false-fire when punctuation directly follows a bracket", () => {
    expect(
      findSpaceBeforePunctuation(
        "...58 Kintail Road, APPLECROSS WA (58 Kintail Road)."
      )
    ).toEqual([]);
    expect(
      findSpaceBeforePunctuation(
        "...registration 1CDR890 (Vehicle 1CDR890), and a burgundy Toyota."
      )
    ).toEqual([]);
  });

  it("still finds a real space between a bracket and following punctuation", () => {
    expect(findSpaceBeforePunctuation("Departed (1CDR890) .")).toEqual([
      { index: 18 },
    ]);
  });
});

describe("findBareVehicleMentions", () => {
  // Regression: the exact real case found in testing — a deliberately
  // planted wrong rego mentioned as bare prose ("Vehicle 1CDR80.") with no
  // bracket anywhere on the sheet, so extractEntitiesFromText never saw it
  // and the bracket-based vehicle consistency check had nothing to compare
  // it against.
  it("finds a rego-shaped token following the word 'Vehicle'", () => {
    expect(
      findBareVehicleMentions(
        "CHANDRA exited 24 Bedford Street and walked down the driveway towards Vehicle 1CDR80."
      )
    ).toEqual(["1CDR80"]);
  });

  it("finds nothing without the word 'Vehicle' immediately before it", () => {
    expect(findBareVehicleMentions("Seen near 1CDR80 parked outside.")).toEqual(
      []
    );
  });

  it("ignores bracketed content", () => {
    expect(
      findBareVehicleMentions("Departed towards (Vehicle 1CDR890) nearby.")
    ).toEqual([]);
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
