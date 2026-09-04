/**
 * Regression test for extractArrivalAddress — feeds the "Vehicle departing"
 * chip in the RS Quick Entry popup (see the "Vehicle Depart -> Arrive
 * Continuity" section of server/db.ts). getPendingVehicleArrivals uses this
 * to record where a vehicle is known to have arrived, so the client can
 * later match it against the quick-entry popup's current address and offer
 * a "Vehicle departing" chip back.
 *
 * The bug: it searched the WHOLE row for the first "(...)" bracket, so an
 * occupant description carrying its own bracket code for a newly-introduced
 * person (e.g. "Denise HOLLY (HOLLY) front passenger") — which comes BEFORE
 * "arrived at" in the sentence — was picked up instead of the address's own
 * trailing bracket. A business is far more often a first-mention (full-form,
 * bracketed) address than an already-established residential one, so this
 * surfaced almost entirely as "the departing chip doesn't work for
 * businesses" even though the underlying bug wasn't business-specific.
 */
import { describe, it, expect } from "vitest";
import { extractArrivalAddress } from "./db";

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
});
