import { describe, expect, it } from "vitest";
import {
  flattenNestedBrackets,
  placeNameWithoutBrackets,
} from "../shared/nestedBrackets";
import { extractEntitiesFromText } from "./db";
import { samePlace } from "../shared/targetPosition";

const NAB =
  "TRAORE arrived on foot at NAB Victoria Park WA Expert Centre (Tellerless), 789 Albany Highway, EAST VICTORIA PARK WA (NAB Victoria Park WA Expert Centre (Tellerless)). And used the ATM to deposit $5,000.00.";
const CBA =
  "TRAORE entered Commonwealth Bank East Victoria Park Branch, Shop 19 The Park Centre, 789 Albany Highway, EAST VICTORIA PARK WA (Commonwealth Bank East Victoria Park Branch) and used the ATM.";

describe("a bracket inside a place's own name", () => {
  it("is folded into the words for reading", () => {
    expect(flattenNestedBrackets("at Expert Centre (Tellerless), 1 A Street, X WA (Expert Centre (Tellerless))")).toBe(
      "at Expert Centre Tellerless, 1 A Street, X WA (Expert Centre Tellerless)"
    );
    expect(flattenNestedBrackets("Kevin SMITH (SMITH) walked.")).toBe("Kevin SMITH (SMITH) walked.");
    expect(placeNameWithoutBrackets("NAB Victoria Park WA Expert Centre (Tellerless)")).toBe(
      "NAB Victoria Park WA Expert Centre Tellerless"
    );
  });

  it("is one location with its name, not a phantom 'Tellerless' business", () => {
    const e = extractEntitiesFromText(NAB);
    expect(e.map(x => [x.type, x.shortForm])).toEqual([
      ["address", "NAB Victoria Park WA Expert Centre Tellerless, 789 Albany Highway, EAST VICTORIA PARK"],
    ]);
    // the Target Logger's place ("Tellerless") finds that pin
    expect(samePlace("Tellerless", e[0].shortForm)).toBe(true);
  });
});

describe("a shop number or centre between the business name and the street", () => {
  it("keeps the business name in the location", () => {
    const e = extractEntitiesFromText(CBA);
    expect(e.map(x => [x.type, x.shortForm])).toEqual([
      ["address", "Commonwealth Bank East Victoria Park Branch, Shop 19 The Park Centre, 789 Albany Highway, EAST VICTORIA PARK"],
    ]);
    expect(samePlace("Commonwealth Bank East Victoria Park Branch", e[0].shortForm)).toBe(true);
  });

  it("still reads a business straight in front of its address, and a plain street", () => {
    expect(
      extractEntitiesFromText("entered Bicton Tavern, 1 Point Walter Road, BICTON WA (Bicton Tavern) and left.").map(x => x.shortForm)
    ).toEqual(["Bicton Tavern, 1 Point Walter Road, BICTON"]);
    expect(
      extractEntitiesFromText("arrived at 27 Olding Way, MELVILLE WA (27 Olding Way).").map(x => x.shortForm)
    ).toEqual(["27 Olding Way, MELVILLE"]);
  });
});
