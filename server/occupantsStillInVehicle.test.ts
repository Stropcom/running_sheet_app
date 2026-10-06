import { describe, expect, it } from "vitest";
import {
  occupantsStillInVehicle,
  splitPeopleNames,
} from "@shared/walkEventPatterns";

describe("splitPeopleNames", () => {
  it("splits on and, commas and ampersands", () => {
    expect(splitPeopleNames("BAIG and JORDAN")).toEqual(["BAIG", "JORDAN"]);
    expect(splitPeopleNames("HOGAN, Denise HOLLY (HOLLY)")).toEqual([
      "HOGAN",
      "Denise HOLLY (HOLLY)",
    ]);
  });
});

describe("occupantsStillInVehicle", () => {
  it("drops people who are walking or inside an address", () => {
    expect(occupantsStillInVehicle("BAIG and JORDAN", ["BAIG"])).toEqual([
      "JORDAN",
    ]);
    expect(occupantsStillInVehicle("BAIG", ["BAIG"])).toEqual([]);
  });
  it("matches on the capitalised surname, not first names", () => {
    expect(
      occupantsStillInVehicle("Mark SMITH and Mark JONES", ["Mark JONES"])
    ).toEqual(["Mark SMITH"]);
    expect(
      occupantsStillInVehicle("HOGAN and Denise HOLLY (HOLLY)", ["HOLLY"])
    ).toEqual(["HOGAN"]);
  });
  it("keeps everyone when nobody is on foot", () => {
    expect(occupantsStillInVehicle("BAIG and JORDAN", [])).toEqual([
      "BAIG",
      "JORDAN",
    ]);
  });
});

describe("unseen-occupant placeholders", () => {
  it("are not treated as people", () => {
    expect(occupantsStillInVehicle("Occupant/s not observed", [])).toEqual([]);
    expect(occupantsStillInVehicle("occupants unseen", [])).toEqual([]);
  });
});
