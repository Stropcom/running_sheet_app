/**
 * Regression tests for extractArrivalAddress and matchVehicleArrival — feed
 * the "Vehicle departing"/"Walked in" chips in the RS Quick Entry popup and
 * the main running sheet table's own continuity chips (see the "Vehicle
 * Depart -> Arrive Continuity" section of server/db.ts).
 * getPendingVehicleArrivals uses these to record where a vehicle is known
 * to have arrived, so the client can later match it against the
 * quick-entry popup's current address, or just list it on the main table.
 *
 * extractArrivalAddress bug (fixed): it searched the WHOLE row for the
 * first "(...)" bracket, so an occupant description carrying its own
 * bracket code for a newly-introduced person (e.g. "Denise HOLLY (HOLLY)
 * front passenger") — which comes BEFORE "arrived at" in the sentence —
 * was picked up instead of the address's own trailing bracket. A business
 * is far more often a first-mention (full-form, bracketed) address than an
 * already-established residential one, so this surfaced almost entirely as
 * "the departing chip doesn't work for businesses" even though the
 * underlying bug wasn't business-specific.
 */
import { describe, it, expect } from "vitest";
import {
  extractArrivalAddress,
  matchVehicleArrival,
  VEHICLE_DEPART_PATTERN,
} from "@shared/vehicleEventPatterns";
import { normalizeObservationPunctuation } from "./db";

describe("extractArrivalAddress", () => {
  it("uses the address's own bracket, not an earlier occupant bracket (business, first mention)", () => {
    const text =
      "Vehicle 1ABC123, Denise HOLLY (HOLLY) front passenger, arrived at Bicton Tavern, 1 Point Walter Road, BICTON WA (Bicton Tavern)";
    expect(extractArrivalAddress(text)).toBe("Bicton Tavern");
  });

  it("uses the address's own bracket, not an earlier occupant bracket (residential, first mention)", () => {
    const text =
      "Vehicle 1ABC123, Denise HOLLY (HOLLY) front passenger, arrived at 34 Duke Street (34 Duke Street)";
    expect(extractArrivalAddress(text)).toBe("34 Duke Street");
  });

  it("still works when the occupant description has no bracket (business, first mention)", () => {
    const text =
      "Vehicle 1ABC123, HOGAN driver, arrived at Bicton Tavern, 1 Point Walter Road, BICTON WA (Bicton Tavern)";
    expect(extractArrivalAddress(text)).toBe("Bicton Tavern");
  });

  it("falls back to the plain-text address when there's no bracket at all (short-form, business)", () => {
    const text =
      "Vehicle 1ABC123, Denise HOLLY (HOLLY) front passenger, arrived at Bicton Tavern";
    expect(extractArrivalAddress(text)).toBe("Bicton Tavern");
  });

  it("falls back to the plain-text address when there's no bracket at all (short-form, residential)", () => {
    const text = "Vehicle 1ABC123, HOGAN driver, arrived at 34 Duke Street";
    expect(extractArrivalAddress(text)).toBe("34 Duke Street");
  });

  it("stops the plain-text fallback at a trailing 'and <verb>' clause", () => {
    const text =
      "Vehicle 1ABC123, HOGAN driver, arrived at 34 Duke Street and remained stationary.";
    expect(extractArrivalAddress(text)).toBe("34 Duke Street");
  });

  it("returns null when the row has no 'arrived at' at all", () => {
    expect(extractArrivalAddress("Vehicle 1ABC123 departed the area.")).toBe(
      null
    );
  });

  it("recognises 'parked at' and 'stopped at' as equivalent to 'arrived at'", () => {
    expect(
      extractArrivalAddress(
        "Vehicle 1ABC123, HOGAN driver, parked at 34 Duke Street"
      )
    ).toBe("34 Duke Street");
    expect(
      extractArrivalAddress(
        "Vehicle 1ABC123, HOGAN driver, stopped at 34 Duke Street"
      )
    ).toBe("34 Duke Street");
  });

  it("falls back to a 'travelled through the car park of X and parked' clause with no '<verb> at' at all", () => {
    const text =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, travelled through the car park of 64 Matheson Road and parked in a car bay.";
    expect(extractArrivalAddress(text)).toBe("64 Matheson Road");
  });

  it("prefers the car-park clause's own bracket over a plain-text repeat", () => {
    const text =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, travelled through the car park of Bicton Tavern, 1 Point Walter Road, BICTON WA (Bicton Tavern) and parked in a car bay.";
    expect(extractArrivalAddress(text)).toBe("Bicton Tavern");
  });

  it("recognises 'parked in the vicinity of X' (a real-world example)", () => {
    const text =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, travelled on Cornish Crescent, MANNING and street parked in the vicinity of 21 Cornish Crescent, MANNING WA (21 Cornish Crescent)";
    expect(extractArrivalAddress(text)).toBe("21 Cornish Crescent");
  });

  it("recognises 'stopped near X' and 'parked outside X'", () => {
    expect(
      extractArrivalAddress(
        "Vehicle 1ABC123, HOGAN driver, stopped near 34 Duke Street"
      )
    ).toBe("34 Duke Street");
    expect(
      extractArrivalAddress(
        "Vehicle 1ABC123, HOGAN driver, parked outside 34 Duke Street"
      )
    ).toBe("34 Duke Street");
  });

  it("does NOT treat the car-park shape's own trailing 'parked in a car bay' as naming an address", () => {
    // Regression: a naive "find the verb, take whatever follows" approach
    // wrongly returned "in a car bay" as the address here, because
    // "parked" is also the last word before "in a car bay" -- the real
    // fix requires the verb to be directly followed by a recognised
    // connector phrase, not just any word.
    const text =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, travelled through the car park of 64 Matheson Road and parked in a car bay.";
    expect(extractArrivalAddress(text)).not.toBe("in a car bay");
    expect(extractArrivalAddress(text)).toBe("64 Matheson Road");
  });
});

describe("matchVehicleArrival", () => {
  it("matches the standard direct form", () => {
    const text =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, arrived at 64 Matheson Road.";
    expect(matchVehicleArrival(text)).toEqual({
      rego: "1BISH0",
      occupantDesc: "BISHOP driver and sole occupant",
    });
  });

  it("matches the direct form with 'parked'/'stopped' in place of 'arrived'", () => {
    const parked =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, parked at 64 Matheson Road.";
    const stopped =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, stopped at 64 Matheson Road.";
    expect(matchVehicleArrival(parked)?.occupantDesc).toBe(
      "BISHOP driver and sole occupant"
    );
    expect(matchVehicleArrival(stopped)?.occupantDesc).toBe(
      "BISHOP driver and sole occupant"
    );
  });

  it("matches a 'travelled ... and arrived at' narrative, stopping occupants at 'travelled' rather than swallowing the route", () => {
    const text =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, travelled on Smith Street, PERTH and arrived at 64 Matheson Road.";
    expect(matchVehicleArrival(text)).toEqual({
      rego: "1BISH0",
      occupantDesc: "BISHOP driver and sole occupant",
    });
  });

  it("matches a 'travelled ... and parked/stopped at' narrative the same way", () => {
    const parked =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, travelled on Smith Street, PERTH and parked at 64 Matheson Road.";
    expect(matchVehicleArrival(parked)?.occupantDesc).toBe(
      "BISHOP driver and sole occupant"
    );
  });

  it("matches a modifier word between 'and' and the verb (a real-world example: 'and street parked')", () => {
    const text =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, travelled on Cornish Crescent, MANNING and street parked in the vicinity of 21 Cornish Crescent, MANNING WA (21 Cornish Crescent)";
    expect(matchVehicleArrival(text)).toEqual({
      rego: "1BISH0",
      occupantDesc: "BISHOP driver and sole occupant",
    });
  });

  it("matches the 'travelled through the car park of X and parked' narrative", () => {
    const text =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, travelled through the car park of 64 Matheson Road and parked in a car bay.";
    expect(matchVehicleArrival(text)).toEqual({
      rego: "1BISH0",
      occupantDesc: "BISHOP driver and sole occupant",
    });
  });

  it("returns null for a plain departure with no arrival wording", () => {
    expect(
      matchVehicleArrival(
        "Vehicle 1BISH0, BISHOP driver and sole occupant, departed 64 Matheson Road and continued via:"
      )
    ).toBe(null);
  });

  // Regression: normalizeObservationPunctuation (server/db.ts) guarantees a
  // comma right before "arrived"/"departed" at save time, inserting one
  // even when the officer wrote "and arrived" — which technically satisfies
  // the direct/generic pattern's own comma-before-verb shape too. Without
  // matchVehicleArrival trying the "travelled" patterns FIRST, the generic
  // pattern would win and swallow the whole travel narrative into
  // "occupants". These run the real save-time normalizer first, the same
  // as createSheetRow/updateSheetRow would, rather than hand-building
  // already-normalized text.
  describe("after normalizeObservationPunctuation (real save-time text)", () => {
    it("still extracts clean occupants from a normalized 'travelled ... and arrived' row", () => {
      const raw =
        "Vehicle 1BISH0, BISHOP driver and sole occupant, travelled on Smith Street, PERTH and arrived at 64 Matheson Road.";
      const normalized = normalizeObservationPunctuation(raw);
      // Sanity check this test is actually exercising the interaction —
      // the normalizer really does insert a comma before "arrived" here.
      expect(normalized).toContain("and, arrived");
      expect(matchVehicleArrival(normalized)).toEqual({
        rego: "1BISH0",
        occupantDesc: "BISHOP driver and sole occupant",
      });
      expect(extractArrivalAddress(normalized)).toBe("64 Matheson Road");
    });

    it("still extracts clean occupants from a normalized car-park row", () => {
      const raw =
        "Vehicle 1BISH0, BISHOP driver and sole occupant, travelled through the car park of 64 Matheson Road and parked in a car bay.";
      const normalized = normalizeObservationPunctuation(raw);
      expect(matchVehicleArrival(normalized)).toEqual({
        rego: "1BISH0",
        occupantDesc: "BISHOP driver and sole occupant",
      });
      expect(extractArrivalAddress(normalized)).toBe("64 Matheson Road");
    });
  });
});

describe("VEHICLE_DEPART_PATTERN", () => {
  it("matches the standard 'departed' form", () => {
    const text =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, departed 5 Edgecumbe Street and continued via:";
    const m = text.match(VEHICLE_DEPART_PATTERN);
    expect(m?.[1]).toBe("1BISH0");
    expect(m?.[2].trim()).toBe("BISHOP driver and sole occupant");
  });

  it("matches 'reversed' as an equivalent departure verb (a real-world example)", () => {
    const text =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, reversed from the driveway of 5 Edgecumbe Street and continued via:";
    const m = text.match(VEHICLE_DEPART_PATTERN);
    expect(m?.[1]).toBe("1BISH0");
    expect(m?.[2].trim()).toBe("BISHOP driver and sole occupant");
  });

  it("matches 'exited' as an equivalent departure verb", () => {
    const text =
      "Vehicle 1BISH0, BISHOP driver and sole occupant, exited 5 Edgecumbe Street and continued via:";
    const m = text.match(VEHICLE_DEPART_PATTERN);
    expect(m?.[1]).toBe("1BISH0");
    expect(m?.[2].trim()).toBe("BISHOP driver and sole occupant");
  });

  it("does not cross-match WALK_IN_PATTERN's unrelated 'NAME exited the vehicle' wording", () => {
    // "exited" here means a person on foot, not the vehicle departing --
    // there's no "Vehicle REGO," immediately before it, so this must not
    // register as a vehicle departure.
    const text =
      "KENNEDY and JOHNS exited the vehicle, walked through the car park, entered Sapore Espresso Bar and continued out of sight.";
    expect(text.match(VEHICLE_DEPART_PATTERN)).toBeNull();
  });
});
