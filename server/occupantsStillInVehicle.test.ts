import { describe, expect, it } from "vitest";
import {
  occupantsStillInVehicle,
  vehicleOccupants,
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

describe("vehicleOccupants: a person is in one vehicle only", () => {
  const parked = { rego: "1ORB419", rowId: 5, names: "BAIG" };
  const moving = { rego: "1HIB84", rowId: 20, names: "" };
  const joined = [{ name: "BAIG", rego: "1HIB84", rowId: 19 }];

  it("moves him out of the older vehicle and into the one he walked to", () => {
    const all = [parked, moving];
    expect(vehicleOccupants(parked, [], joined, all)).toEqual([]);
    expect(vehicleOccupants(moving, [], joined, all)).toEqual(["BAIG"]);
  });

  it("a newer row naming him in another vehicle wins", () => {
    const newer = { rego: "1ORB419", rowId: 30, names: "BAIG" };
    const all = [newer, moving];
    expect(vehicleOccupants(moving, [], joined, all)).toEqual([]);
    expect(vehicleOccupants(newer, [], joined, all)).toEqual(["BAIG"]);
  });
});
