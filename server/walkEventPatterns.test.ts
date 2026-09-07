/**
 * Tests for WALK_IN_PATTERN / WALK_OUT_PATTERN — the on-foot mirror of
 * VEHICLE_DEPART_PATTERN/VEHICLE_ARRIVE_PATTERN, used by
 * getPendingWalkIns (server/db.ts) to power the "Walked in"/"Walked out"
 * RS Quick Entry chips. Run directly against the real example narratives
 * the feature was designed from, since a regex miss here means the chip
 * silently never appears — exactly the failure mode
 * normalizeObservationPunctuation's own comments warn about for the
 * vehicle patterns.
 */
import { describe, it, expect } from "vitest";
import { WALK_IN_PATTERN, WALK_OUT_PATTERN } from "@shared/walkEventPatterns";

describe("WALK_IN_PATTERN", () => {
  it("matches the street-route example", () => {
    const text =
      "KENNEDY and JOHNS exited the vehicle, walked along Belmont Avenue, entered Sapore Espresso Bar and continued out of sight.";
    const match = text.match(WALK_IN_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe("KENNEDY and JOHNS");
    expect(match![2].trim()).toBe("along Belmont Avenue");
    expect(match![3].trim()).toBe("Sapore Espresso Bar");
  });

  it("matches the car-park-route example (no street name)", () => {
    const text =
      "KENNEDY and JOHNS exited the vehicle, walked through the car park, entered Sapore Espresso Bar and continued out of sight.";
    const match = text.match(WALK_IN_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe("KENNEDY and JOHNS");
    expect(match![2].trim()).toBe("through the car park");
    expect(match![3].trim()).toBe("Sapore Espresso Bar");
  });

  it("matches even with no commas at all", () => {
    const text =
      "KENNEDY and JOHNS exited the vehicle walked through the car park entered Sapore Espresso Bar and continued out of sight.";
    const match = text.match(WALK_IN_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe("KENNEDY and JOHNS");
    expect(match![2].trim()).toBe("through the car park");
    expect(match![3].trim()).toBe("Sapore Espresso Bar");
  });

  it("captures only the walk-in's own names, not the preceding vehicle-arrival sentence in the same row", () => {
    const text =
      "Vehicle 1MGR73, KENNEDY driver and sole occupant, arrived at Sapore Espresso Bar, 4/275 Belmont Avenue, CLOVERDALE WA (Sapore Espresso Bar) parked in the car park.\n\nKENNEDY and JOHNS exited the vehicle, walked through the car park, entered Sapore Espresso Bar and continued out of sight.";
    const match = text.match(WALK_IN_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe("KENNEDY and JOHNS");
    expect(match![2].trim()).toBe("through the car park");
    expect(match![3].trim()).toBe("Sapore Espresso Bar");
  });

  it("does not match a plain vehicle arrival with no walking", () => {
    const text =
      "Vehicle 1MGR73, KENNEDY driver and sole occupant, arrived at Sapore Espresso Bar, 4/275 Belmont Avenue, CLOVERDALE WA (Sapore Espresso Bar) parked in the car park.";
    expect(text.match(WALK_IN_PATTERN)).toBeNull();
  });
});

describe("WALK_OUT_PATTERN", () => {
  it("matches the canonical 'and walked ... towards Vehicle' example", () => {
    const text =
      "KENNEDY and JOHNS exited Sapore Espresso Bar and walked along Belmont Avenue towards Vehicle 1MGR73.";
    const match = text.match(WALK_OUT_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe("Sapore Espresso Bar");
    expect(match![2].trim()).toBe("along Belmont Avenue");
    expect(match![3].toUpperCase()).toBe("1MGR73");
  });

  it("matches the canonical form with no 'and' or commas at all", () => {
    const text =
      "KENNEDY and JOHNS exited Sapore Espresso Bar walked through the car park towards Vehicle 1MGR73.";
    const match = text.match(WALK_OUT_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe("Sapore Espresso Bar");
    expect(match![2].trim()).toBe("through the car park");
    expect(match![3].toUpperCase()).toBe("1MGR73");
  });

  it("still matches the older comma-separated 'to Vehicle' phrasing, for sheets written before this wording was standardised", () => {
    const text =
      "KENNEDY and JOHNS exited Sapore Espresso Bar, walked along Belmont Avenue, to Vehicle 1MGR73.";
    const match = text.match(WALK_OUT_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe("Sapore Espresso Bar");
    expect(match![2].trim()).toBe("along Belmont Avenue");
    expect(match![3].toUpperCase()).toBe("1MGR73");
  });

  it("does not match a plain vehicle departure with no walking", () => {
    const text =
      "Vehicle 1MGR73, KENNEDY driver and sole occupant, departed Sapore Espresso Bar and continued via:";
    expect(text.match(WALK_OUT_PATTERN)).toBeNull();
  });
});
