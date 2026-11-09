import { describe, expect, it } from "vitest";
import { issuesToShow, parseIssues } from "../shared/summaryIssues";

describe("parseIssues", () => {
  it("reads a list", () => {
    expect(parseIssues('["Radio dropped out","Vehicle low on fuel"]')).toEqual([
      "Radio dropped out",
      "Vehicle low on fuel",
    ]);
  });
  it("reads plain text from before Issues was a list as one issue", () => {
    expect(parseIssues("Radio dropped out twice.\nFuel low.")).toEqual([
      "Radio dropped out twice.\nFuel low.",
    ]);
  });
  it("nothing stored is no issues", () => {
    expect(parseIssues(null)).toEqual([]);
    expect(parseIssues(undefined)).toEqual([]);
    expect(parseIssues("")).toEqual([]);
    expect(parseIssues("   ")).toEqual([]);
    expect(parseIssues("[]")).toEqual([]);
  });
  it("keeps a blank entry so a new issue stays on screen while it is typed", () => {
    expect(parseIssues('["First",""]')).toEqual(["First", ""]);
  });
  it("ignores anything in the list that is not text", () => {
    expect(parseIssues('["A",3,null,"B"]')).toEqual(["A", "B"]);
  });
  it("plain text that only looks like JSON but is not a list is one issue", () => {
    expect(parseIssues('{"a":1}')).toEqual(['{"a":1}']);
    expect(parseIssues("[not json")).toEqual(["[not json"]);
  });
});

describe("issuesToShow", () => {
  it("drops blanks and trims, keeping the wording", () => {
    expect(issuesToShow('["  A  ","","B"]')).toEqual(["A", "B"]);
    expect(issuesToShow("  one plain issue ")).toEqual(["one plain issue"]);
    expect(issuesToShow(null)).toEqual([]);
  });
});
