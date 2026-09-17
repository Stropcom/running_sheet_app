import { describe, it, expect } from "vitest";
import {
  buildRunningSheetTitle,
  getTargetTitleBracket,
} from "@shared/runningSheetTitle";

describe("getTargetTitleBracket", () => {
  it("returns the surname for a person target", () => {
    expect(
      getTargetTitleBracket({ targetType: "person", surname: "Farr" })
    ).toBe("Farr");
  });

  it("returns null for a person target with no surname yet", () => {
    expect(
      getTargetTitleBracket({ targetType: "person", surname: null })
    ).toBeNull();
  });

  it("composes rego + description for a vehicle target", () => {
    expect(
      getTargetTitleBracket({
        targetType: "vehicle",
        vehRegistration: "1DHY084",
        vehColour: "White",
        vehMake: "Toyota",
        vehModel: "Camry",
        vehType: "Sedan",
      })
    ).toBe("1DHY084 White Toyota Camry Sedan");
  });

  it("omits vehicle type when not set", () => {
    expect(
      getTargetTitleBracket({
        targetType: "vehicle",
        vehRegistration: "1DHY084",
        vehColour: "White",
        vehMake: "Toyota",
        vehModel: "Camry",
        vehType: null,
      })
    ).toBe("1DHY084 White Toyota Camry");
  });

  it("shows whatever vehicle description is known even with no registration yet", () => {
    // Matches this module's own "missing pieces are simply left out" rule
    // (see its top-of-file comment) — registration itself IS required to
    // actually save a Vehicle target (see composeVehicleTargetName in
    // addressFormat.ts), but this function recomputes a title for an
    // already-saved sheet from whatever's on the target right now.
    expect(
      getTargetTitleBracket({
        targetType: "vehicle",
        vehRegistration: null,
        vehColour: "White",
        vehMake: "Toyota",
        vehModel: "Camry",
      })
    ).toBe("White Toyota Camry");
  });

  it("returns null for a vehicle target with nothing set at all", () => {
    expect(
      getTargetTitleBracket({
        targetType: "vehicle",
        vehRegistration: null,
        vehColour: null,
        vehMake: null,
        vehModel: null,
      })
    ).toBeNull();
  });

  it("uses the street short form for a location target with no business name", () => {
    expect(
      getTargetTitleBracket({
        targetType: "location",
        addrBusinessName: null,
        addrHouseNo: "24",
        addrStreetName: "Bedford",
        addrStreetType: "Street",
      })
    ).toBe("24 Bedford Street");
  });

  it("prefers the business name over the street for a location target", () => {
    expect(
      getTargetTitleBracket({
        targetType: "location",
        addrBusinessName: "Cottesloe Hotel",
        addrHouseNo: "24",
        addrStreetName: "Bedford",
        addrStreetType: "Street",
      })
    ).toBe("Cottesloe Hotel");
  });

  it("returns null for a location target with no address fields yet", () => {
    expect(
      getTargetTitleBracket({
        targetType: "location",
        addrBusinessName: null,
        addrHouseNo: null,
        addrStreetName: null,
        addrStreetType: null,
      })
    ).toBeNull();
  });

  it("returns null for a null target", () => {
    expect(getTargetTitleBracket(null)).toBeNull();
  });
});

describe("buildRunningSheetTitle", () => {
  it("upper-cases the bracket regardless of the source's own case", () => {
    const title = buildRunningSheetTitle({
      sheetDate: "2026-09-17",
      authorCIN: "650",
      operationName: "START",
      targetBracketLabel: getTargetTitleBracket({
        targetType: "vehicle",
        vehRegistration: "1dhy084",
        vehColour: "White",
        vehMake: "Toyota",
        vehModel: "Camry",
        vehType: "Sedan",
      }),
    });
    expect(title).toBe(
      "20260917 - 650 - START (1DHY084 WHITE TOYOTA CAMRY SEDAN)"
    );
  });

  it("omits the bracket entirely when there's nothing to show yet", () => {
    const title = buildRunningSheetTitle({
      sheetDate: "2026-09-17",
      authorCIN: "650",
      operationName: "START",
      targetBracketLabel: getTargetTitleBracket({
        targetType: "location",
        addrBusinessName: null,
        addrHouseNo: null,
        addrStreetName: null,
        addrStreetType: null,
      }),
    });
    expect(title).toBe("20260917 - 650 - START");
  });
});
