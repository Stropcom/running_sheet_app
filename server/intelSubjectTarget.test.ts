import { describe, expect, it } from "vitest";
import { extractEntitiesFromText, subjectTargetEntityKey } from "./db";
import { formatIntelVehicle } from "@shared/addressFormat";

describe("subjectTargetEntityKey", () => {
  it("a vehicle target stands in for the vehicle entity of its rego", () => {
    expect(
      subjectTargetEntityKey("vehicle", "E426HOD white Toyota Camry Sedan")
    ).toBe("vehicle::e426hod");
    expect(
      subjectTargetEntityKey(
        "vehicle",
        "white Toyota Camry Sedan, bearing WA registration E426HOD"
      )
    ).toBe("vehicle::e426hod");
  });

  it("a vehicle target with no rego in its name has nothing to fold on", () => {
    expect(
      subjectTargetEntityKey("vehicle", "white Toyota Camry Sedan")
    ).toBeNull();
  });

  it("a location target stands in for the address entity of its bracket", () => {
    expect(
      subjectTargetEntityKey(
        "location",
        "10 Trojan Bend, MADELEY WA (10 Trojan Bend)"
      )
    ).toBe("address::10 trojan bend");
  });

  it("a person target never folds", () => {
    expect(subjectTargetEntityKey("person", "Amira Noor RAHMAN")).toBeNull();
    expect(subjectTargetEntityKey(null, "Amira Noor RAHMAN")).toBeNull();
  });
});

describe("a misspelt 'registration' is still boilerplate, not part of the label", () => {
  it("formatIntelVehicle reads 'registartion' as the registration clause", () => {
    expect(
      formatIntelVehicle(
        "red Ford Ranger Utility, bearing WA registartion 1FAC488"
      )
    ).toBe("1FAC488 red Ford Ranger Utility");
  });

  it("the mined vehicle label drops the clause too", () => {
    const found = extractEntitiesFromText(
      "RAHMAN, EVANS and TAYLOR entered a red Ford Ranger Utility, bearing WA registartion 1FAC488 (Vehicle 1FAC488)."
    ).filter(e => e.type === "vehicle");
    expect(found).toHaveLength(1);
    expect(found[0].shortForm).toBe("1FAC488 red Ford Ranger Utility");
  });
});
