import { describe, expect, it } from "vitest";
import { extractOccupantNames } from "@/lib/mentionAutocomplete";

describe("extractOccupantNames", () => {
  it("strips role words", () => {
    expect(extractOccupantNames("BAIG driver and sole occupant")).toBe("BAIG");
    expect(
      extractOccupantNames("HOGAN driver, Denise HOLLY (HOLLY) front passenger")
    ).toBe("HOGAN and Denise HOLLY (HOLLY)");
  });

  it("leaves nothing for an unseen-occupants placeholder", () => {
    expect(extractOccupantNames("unseen occupant/s")).toBe("");
    expect(extractOccupantNames("unseen occupants")).toBe("");
    expect(extractOccupantNames("occupant/s not observed")).toBe("");
    expect(extractOccupantNames("occupants not seen")).toBe("");
  });
});

describe("extractOccupantNames without commas", () => {
  it("role words separate the people", () => {
    expect(
      extractOccupantNames(
        "BAIG driver UM1 front passenger and JOHNSON rear passenger"
      )
    ).toBe("BAIG and UM1 and JOHNSON");
  });
});
