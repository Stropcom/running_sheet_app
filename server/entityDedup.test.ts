import { describe, it, expect } from "vitest";
import {
  findPossibleDuplicates,
  type DedupCandidateEntity,
} from "./entityDedup";

const existing: DedupCandidateEntity[] = [
  {
    key: "person::jason smith",
    label: "Jason SMITH",
    type: "person",
    rowCount: 5,
  },
  {
    key: "person::jason smith, born 1 jan 1980",
    label: "Jason SMITH, born 1 Jan 1980",
    type: "person",
    rowCount: 2,
  },
  {
    key: "vehicle::1abc234",
    label: "1ABC234 white Toyota",
    type: "vehicle",
    rowCount: 3,
  },
  {
    key: "address::12 smith street, melville",
    label: "12 Smith Street, MELVILLE",
    type: "address",
    rowCount: 4,
  },
  {
    key: "business::the blend cafe",
    label: "The Blend Cafe",
    type: "business",
    rowCount: 1,
  },
  {
    key: "person::totally different guy",
    label: "Totally Different Guy",
    type: "person",
    rowCount: 1,
  },
];

describe("findPossibleDuplicates — persons", () => {
  it("flags a misspelled name as a possible duplicate", () => {
    const matches = findPossibleDuplicates(
      "Jason SMYTHE",
      "person",
      "person::jason smythe",
      existing
    );
    expect(matches.map(m => m.label)).toContain("Jason SMITH");
  });

  it("flags a name with an extra trailing clause as a possible duplicate", () => {
    const matches = findPossibleDuplicates(
      "Jason SMITH, born 5 Feb 1985",
      "person",
      "person::jason smith, born 5 feb 1985",
      existing
    );
    expect(matches.map(m => m.label)).toContain("Jason SMITH");
  });

  it("flags an initial + surname as a possible duplicate", () => {
    const matches = findPossibleDuplicates(
      "J SMITH",
      "person",
      "person::j smith",
      existing
    );
    expect(matches.map(m => m.label)).toContain("Jason SMITH");
  });

  it("does not flag a genuinely different person", () => {
    const matches = findPossibleDuplicates(
      "Totally Different Guy",
      "person",
      "person::totally different guy-2",
      existing
    );
    expect(matches.find(m => m.label === "Jason SMITH")).toBeUndefined();
  });

  it("excludes the entity's own exact key from its own results", () => {
    const matches = findPossibleDuplicates(
      "Jason SMITH",
      "person",
      "person::jason smith",
      existing
    );
    expect(matches.find(m => m.key === "person::jason smith")).toBeUndefined();
  });
});

describe("findPossibleDuplicates — vehicles", () => {
  it("flags a registration one character off", () => {
    const matches = findPossibleDuplicates(
      "1ABC235 white Toyota",
      "vehicle",
      "vehicle::1abc235",
      existing
    );
    expect(matches.map(m => m.label)).toContain("1ABC234 white Toyota");
  });

  it("does not flag a genuinely different registration", () => {
    const matches = findPossibleDuplicates(
      "1XYZ999 blue Holden",
      "vehicle",
      "vehicle::1xyz999",
      existing
    );
    expect(matches).toHaveLength(0);
  });
});

describe("findPossibleDuplicates — addresses", () => {
  it("flags the same address with a unit number added", () => {
    const matches = findPossibleDuplicates(
      "Unit 3, 12 Smith Street, MELVILLE",
      "address",
      "address::unit 3, 12 smith street, melville",
      existing
    );
    expect(matches.map(m => m.label)).toContain("12 Smith Street, MELVILLE");
  });

  it("does not flag a genuinely different address", () => {
    const matches = findPossibleDuplicates(
      "45 Totally Different Road, FREO",
      "address",
      "address::45 totally different road, freo",
      existing
    );
    expect(matches).toHaveLength(0);
  });
});

describe("findPossibleDuplicates — businesses", () => {
  it("flags the same business name with a legal suffix added", () => {
    const matches = findPossibleDuplicates(
      "The Blend Cafe Pty Ltd",
      "business",
      "business::the blend cafe pty ltd",
      existing
    );
    expect(matches.map(m => m.label)).toContain("The Blend Cafe");
  });
});
