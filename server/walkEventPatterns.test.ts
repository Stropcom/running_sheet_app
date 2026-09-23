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
import {
  WALK_IN_PATTERN,
  WALK_IN_TOWARDS_PATTERN,
  WALK_OUT_PATTERN,
  extractWalkInTowardsLocation,
  extractWalkInTowardsRoute,
} from "@shared/walkEventPatterns";

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

describe("WALK_IN_TOWARDS_PATTERN", () => {
  it("matches the real example that WALK_IN_PATTERN misses (no 'entered' clause)", () => {
    const text =
      "HOGAN and CORNELL exited the vehicle, walked towards 45 Francis Street and continued out of sight.";
    expect(text.match(WALK_IN_PATTERN)).toBeNull();
    const match = text.match(WALK_IN_TOWARDS_PATTERN);
    expect(match).not.toBeNull();
    expect(match![1].trim()).toBe("HOGAN and CORNELL");
    expect(match![2].trim()).toBe("towards 45 Francis Street");
  });

  it("matches a route with a directional prefix before 'towards'", () => {
    const text =
      "CROSS and FLETCHER exited the vehicle, walked across the road towards 18 Pepperbush Road and continued out of sight.";
    const match = text.match(WALK_IN_TOWARDS_PATTERN);
    expect(match).not.toBeNull();
    expect(match![2].trim()).toBe("across the road towards 18 Pepperbush Road");
  });

  it("does not match a plain vehicle arrival with no walking", () => {
    const text =
      "Vehicle 1MGR73, KENNEDY driver and sole occupant, arrived at Sapore Espresso Bar, 4/275 Belmont Avenue, CLOVERDALE WA (Sapore Espresso Bar) parked in the car park.";
    expect(text.match(WALK_IN_TOWARDS_PATTERN)).toBeNull();
  });
});

describe("extractWalkInTowardsLocation", () => {
  it("strips a plain 'towards' prefix", () => {
    expect(extractWalkInTowardsLocation("towards 18 Pepperbush Road")).toBe(
      "18 Pepperbush Road"
    );
  });

  it("strips a directional prefix before 'towards'", () => {
    expect(
      extractWalkInTowardsLocation("across the road towards 18 Pepperbush Road")
    ).toBe("18 Pepperbush Road");
  });

  it("also drops a leading 'the residence at'", () => {
    expect(
      extractWalkInTowardsLocation(
        "towards the residence at 18 Pepperbush Road"
      )
    ).toBe("18 Pepperbush Road");
  });

  it("drops a leading 'the front of'", () => {
    expect(
      extractWalkInTowardsLocation("towards the front of 64 Matheson Road")
    ).toBe("64 Matheson Road");
  });

  it("drops a leading 'the vicinity of'", () => {
    expect(
      extractWalkInTowardsLocation("towards the vicinity of 64 Matheson Road")
    ).toBe("64 Matheson Road");
  });

  it("drops a leading 'in the vicinity of'", () => {
    expect(
      extractWalkInTowardsLocation(
        "towards in the vicinity of 64 Matheson Road"
      )
    ).toBe("64 Matheson Road");
  });

  it("drops a leading 'outside'/'outside of'", () => {
    expect(
      extractWalkInTowardsLocation("towards outside 64 Matheson Road")
    ).toBe("64 Matheson Road");
    expect(
      extractWalkInTowardsLocation("towards outside of 64 Matheson Road")
    ).toBe("64 Matheson Road");
  });

  it("drops a leading 'near'", () => {
    expect(extractWalkInTowardsLocation("towards near 64 Matheson Road")).toBe(
      "64 Matheson Road"
    );
  });

  it("drops a leading 'the front door of'", () => {
    expect(
      extractWalkInTowardsLocation("towards the front door of 64 Matheson Road")
    ).toBe("64 Matheson Road");
  });

  it("drops a leading 'the door of'", () => {
    expect(
      extractWalkInTowardsLocation("towards the door of 64 Matheson Road")
    ).toBe("64 Matheson Road");
  });

  it("drops a leading 'the entrance of'", () => {
    expect(
      extractWalkInTowardsLocation("towards the entrance of 64 Matheson Road")
    ).toBe("64 Matheson Road");
  });

  it("falls back to the whole clause when there's no 'towards'", () => {
    expect(extractWalkInTowardsLocation("through the car park")).toBe(
      "through the car park"
    );
  });

  it("drops a leading 'down the driveway of' with no 'towards' at all", () => {
    expect(
      extractWalkInTowardsLocation("down the driveway of 115 Bateman Road")
    ).toBe("115 Bateman Road");
  });

  it("drops a leading 'up the driveway of' with no 'towards' at all", () => {
    expect(
      extractWalkInTowardsLocation("up the driveway of 115 Bateman Road")
    ).toBe("115 Bateman Road");
  });

  it("drops a leading 'along the driveway of' with no 'towards' at all", () => {
    expect(
      extractWalkInTowardsLocation("along the driveway of 115 Bateman Road")
    ).toBe("115 Bateman Road");
  });
});

describe("extractWalkInTowardsRoute", () => {
  it("extracts genuine route text before 'towards'", () => {
    expect(
      extractWalkInTowardsRoute("across the road towards 18 Pepperbush Road")
    ).toBe("across the road");
  });

  it("returns empty when the clause is pure destination with nothing before 'towards'", () => {
    expect(extractWalkInTowardsRoute("towards 45 Francis Street")).toBe("");
  });

  it("returns empty for a destination with a positional prefix, not the prefix itself", () => {
    expect(
      extractWalkInTowardsRoute("towards the front of 64 Matheson Road")
    ).toBe("");
  });

  it("returns empty when there's no 'towards' at all", () => {
    expect(extractWalkInTowardsRoute("through the car park")).toBe("");
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
