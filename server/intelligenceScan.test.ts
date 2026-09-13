import { describe, it, expect } from "vitest";
import { scanIntelligenceEntities } from "./intelligenceScan";
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
        observationSnippet: "some observation text",
        timeMinutes: 600,
        fullDescription: overrides.shortForm,
      },
    ],
    ...overrides,
  };
}

describe("scanIntelligenceEntities", () => {
  it("flags a vehicle short form with a comma in it (the reported bug)", () => {
    const findings = scanIntelligenceEntities([
      makeEntity({ type: "vehicle", shortForm: "1DHY084, MOSMAN PARK" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("comma-in-short-form");
  });

  it("does not flag a clean vehicle rego", () => {
    const findings = scanIntelligenceEntities([
      makeEntity({ type: "vehicle", shortForm: "1DHY084" }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("flags a placeholder-code-shaped entity that wasn't skipped upstream", () => {
    const findings = scanIntelligenceEntities([
      makeEntity({ type: "person", shortForm: "YM2" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("placeholder-code-shape");
  });

  it("flags a vehicle-typed entity with no digits at all", () => {
    const findings = scanIntelligenceEntities([
      makeEntity({ type: "vehicle", shortForm: "SMITH" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("vehicle-no-digits");
  });

  it("flags a person-typed entity containing a digit", () => {
    const findings = scanIntelligenceEntities([
      makeEntity({ type: "person", shortForm: "SMITH2" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("person-has-digits");
  });

  it("flags a single-mention, low-confidence entity", () => {
    const findings = scanIntelligenceEntities([
      makeEntity({
        type: "unknown",
        shortForm: "ODD FRAGMENT",
        lowConfidence: true,
      }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("single-mention-low-confidence");
  });

  it("does not flag a registered Target/Associate card even if it matches a rule's shape", () => {
    const findings = scanIntelligenceEntities([
      makeEntity({ type: "person", shortForm: "SMITH2", isTarget: true }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("flags a mined name that's a likely typo of a registered target", () => {
    const findings = scanIntelligenceEntities([
      makeEntity({ type: "person", shortForm: "John Smith", isTarget: true }),
      makeEntity({ type: "person", shortForm: "Jhon Smith" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("possible-typo-of-registry-name");
    expect(findings[0].shortForm).toBe("Jhon Smith");
  });

  it("flags a mined name that's a likely typo of a registered associate", () => {
    const findings = scanIntelligenceEntities([
      makeEntity({ type: "person", shortForm: "Jane Doe", isAssociate: true }),
      makeEntity({ type: "person", shortForm: "Jane Doeh" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("possible-typo-of-registry-name");
  });

  it("does not flag an exact name match to the registry — that's the same person", () => {
    const findings = scanIntelligenceEntities([
      makeEntity({ type: "person", shortForm: "John Smith", isTarget: true }),
      makeEntity({ type: "person", shortForm: "John Smith" }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("does not flag a genuinely different name near the registry", () => {
    const findings = scanIntelligenceEntities([
      makeEntity({ type: "person", shortForm: "John Smith", isTarget: true }),
      makeEntity({ type: "person", shortForm: "Sarah Nguyen" }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("does not flag typo-matching when there is no registry to compare against", () => {
    const findings = scanIntelligenceEntities([
      makeEntity({ type: "person", shortForm: "Jhon Smith" }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("does not flag an indices-only entity (never actually mentioned in a row)", () => {
    const findings = scanIntelligenceEntities([
      makeEntity({
        type: "vehicle",
        shortForm: "1DHY084, MOSMAN PARK",
        isIndicesOnly: true,
        occurrences: [
          {
            sheetId: 1,
            sheetTitle: "Sheet 1",
            operationId: 1,
            operationName: "Op One",
            rowId: 0,
            observationSnippet: "",
            timeMinutes: null,
            fullDescription: "",
          },
        ],
      }),
    ]);
    expect(findings).toHaveLength(0);
  });
});
