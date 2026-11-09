import { describe, expect, it } from "vitest";
import { isMeasurementWord } from "../shared/measurementWord";
import { regoIn } from "../shared/vehicleRego";
import { detectVehicleMentionTrigger } from "../client/src/lib/mentionAutocomplete";
import { extractEntitiesFromText } from "../server/db";
import { scanWalkEvents } from "../shared/walkEventPatterns";

describe("a measurement is not a registration", () => {
  it("recognises a number with a unit", () => {
    for (const w of [
      "30cm",
      "30CM",
      "5kg",
      "2.5kg",
      "100km",
      "9pm",
      "10am",
      "3rd",
      "2nd",
      "6ft",
      "500ml",
    ])
      expect(isMeasurementWord(w), w).toBe(true);
  });
  it("does not take a plate for one", () => {
    for (const w of [
      "1EMB303",
      "1ABC123",
      "ABC123",
      "1VAL75",
      "XYZ12",
      "1TDM414",
      "NX350H",
      "C200",
      "SR5",
    ])
      expect(isMeasurementWord(w), w).toBe(false);
  });
  it("regoIn skips a measurement and still finds the plate after it", () => {
    expect(regoIn("approx 30cm and then 1ABC123")).toBe("1ABC123");
    expect(regoIn("approx 30cm only")).toBeNull();
  });
  it("typing 30cm then Space does not offer a vehicle bracket (the plate shape still does)", () => {
    const used = new Set<string>();
    expect(detectVehicleMentionTrigger("approx 30cm", 11, used)).toBeNull();
    expect(
      detectVehicleMentionTrigger("bearing WA registration 1ABC123", 31, used)
        ?.word
    ).toBe("1ABC123");
  });
  it("a '(Vehicle 30CM)' already in a row is not a vehicle entity", () => {
    const e = extractEntitiesFromText(
      "The package was described as approx 30cm (Vehicle 30CM), a x 30cm (Vehicle 30CM)."
    );
    expect(e.filter(x => x.type === "vehicle")).toEqual([]);
  });
});

describe("the subject of a walk is the name, not what they carry", () => {
  const scan = (obs: string[]) =>
    scanWalkEvents(
      obs.map((o, i) => ({ id: i + 1, sheetId: 1, observation: o }))
    );
  it("'SANTOS, carrying the package, exited X and walked towards the exit' is SANTOS", () => {
    const r = scan([
      "SANTOS, carrying the package, exited Australia Post - Melville Post Office and walked through the shopping centre towards the exit.",
    ]);
    expect(r.headingTo.map(h => h.names)).toEqual(["SANTOS"]);
  });
  it("a list of names keeps every name, and drops each carrying clause", () => {
    const r = scan([
      "VALE, carrying a bag, and FRASER, holding a phone, exited The Ritz-Carlton and walked towards the exit.",
    ]);
    expect(r.headingTo.map(h => h.names)).toEqual(["VALE and FRASER"]);
  });
  it("plain names are unchanged", () => {
    const r = scan([
      "VALE and FRASER exited The Ritz-Carlton and walked towards the exit.",
    ]);
    expect(r.headingTo.map(h => h.names)).toEqual(["VALE and FRASER"]);
  });
});
