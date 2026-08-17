/**
 * Regression tests for entity TYPE classification (person / vehicle /
 * address / business) in extractEntitiesFromText — as distinct from
 * addressFormat.test.ts, which covers address LABEL recovery once an
 * entity is already known to be an address.
 */

import { describe, it, expect } from "vitest";
import { extractEntitiesFromText } from "./db";

describe("extractEntitiesFromText — vehicle vs address disambiguation", () => {
  it("classifies a 'station sedan' vehicle mention as a vehicle, not an address (the reported bug)", () => {
    // "station sedan"/"station wagon" is body-style terminology, but the
    // address-detection pass (which runs before vehicle keywords are even
    // considered) had a bare "station" keyword meant for transit stations —
    // it fired on this phrase and misclassified the vehicle as an address,
    // so it silently never appeared as a vehicle chip on the Summary tab.
    const text =
      "A blue Volkswagen Passat station sedan, bearing WA registration 1DHY084 (Vehicle 1DHY084) parked and unattended in the driveway at 101 Eric Street.";
    const entities = extractEntitiesFromText(text);
    const vehicle = entities.find(e => e.rawShortForm === "Vehicle 1DHY084");
    expect(vehicle?.type).toBe("vehicle");
  });

  it("classifies a 'station wagon' vehicle mention as a vehicle", () => {
    const text =
      "A white Holden Commodore station wagon, bearing WA registration 1ABC123 (Vehicle 1ABC123) departed.";
    const entities = extractEntitiesFromText(text);
    const vehicle = entities.find(e => e.rawShortForm === "Vehicle 1ABC123");
    expect(vehicle?.type).toBe("vehicle");
  });

  it("still classifies a real train station as an address (the fix must not break this)", () => {
    const text =
      "TGT (TGT) observed entering Fremantle Train Station, ADELAIDE ST (Fremantle Train Station).";
    const entities = extractEntitiesFromText(text);
    const address = entities.find(
      e => e.rawShortForm === "Fremantle Train Station"
    );
    expect(address?.type).toBe("address");
  });

  it("still classifies a bus station address correctly", () => {
    const text =
      "Vehicle 1XYZ789, TGT driver and sole occupant, arrived at Perth Busport Bus Station, WELLINGTON ST (Perth Busport Bus Station).";
    const entities = extractEntitiesFromText(text);
    const address = entities.find(
      e => e.rawShortForm === "Perth Busport Bus Station"
    );
    expect(address?.type).toBe("address");
  });
});
