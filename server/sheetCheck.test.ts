import { describe, it, expect } from "vitest";
import {
  checkSpellingInText,
  checkConsistency,
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

  it("ignores person and business entities entirely", () => {
    const entities: IntelligenceEntity[] = [
      makeEntity({ type: "person", shortForm: "SMITH" }),
      makeEntity({ type: "business", shortForm: "Blend Cafe" }),
    ];
    expect(checkConsistency(entities)).toHaveLength(0);
  });
});
