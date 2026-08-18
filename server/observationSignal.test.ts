/**
 * Tests for the presence gate — does an observation narrate the subject
 * being at a place, as opposed to merely naming one?
 *
 * An address mention only counts as a visit if this passes (see the
 * OBSERVATION_SIGNAL_RE call sites in db.ts). It exists to keep addresses
 * that are referenced but not visited out of the Heat Map and Pattern of
 * Life, and it runs after rows have already been narrowed to ones naming
 * the entity in question.
 *
 * The reported failure it was extended for: on RS 459, an associate's
 * "CAT arrived at 81 Redmond Road" was counted, while the target standing
 * in the same front yard three hours later was not — because the target's
 * rows narrated what he was *doing* rather than that he arrived.
 */

import { describe, it, expect } from "vitest";
import { hasObservationSignal } from "./db";

describe("hasObservationSignal — presence without an arrival verb", () => {
  it("counts a target who walked from an address and stood in its front yard", () => {
    expect(
      hasObservationSignal(
        "Ruben SANDWICH (SANDWICH) and CAT walked from 81 Redmond Road and stood in conversation in the front yard."
      )
    ).toBe(true);
  });

  it("counts a target who walked back towards the front door and went out of sight", () => {
    expect(
      hasObservationSignal(
        "SANDWICH and CAT walked back towards the front door of 81 Redmond Road and continued out of sight."
      )
    ).toBe(true);
  });

  it("counts other ways presence gets narrated", () => {
    const rows = [
      "SANDWICH returned to 81 Redmond Road.",
      "SANDWICH approached the front door.",
      "SANDWICH knocked and waited.",
      "SANDWICH sat on the front step.",
      "SANDWICH was standing on the driveway.",
    ];
    for (const row of rows) expect(hasObservationSignal(row)).toBe(true);
  });
});

describe("hasObservationSignal — still counts what it always did", () => {
  it("counts arrival, departure and parking", () => {
    const rows = [
      "CAT arrived at 81 Redmond Road walked down the driveway and continued out of sight.",
      "TGT departed 44 Elvira Street and continued via:",
      "A white Hyundai Tucson SUV, bearing WA registration 1HVD346, arrived and parked on the driveway.",
      "Surveillance commenced in the vicinity of 81 Redmond Road.",
    ];
    for (const row of rows) expect(hasObservationSignal(row)).toBe(true);
  });
});

describe("hasObservationSignal — an address named but not visited", () => {
  it("does not count a stated intention to go somewhere", () => {
    expect(
      hasObservationSignal(
        "SANDWICH stated he would be going to 45 Smith Street later that day."
      )
    ).toBe(false);
  });

  it("does not count a registry or records reference to an address", () => {
    expect(
      hasObservationSignal(
        "SANDWICH's vehicle is registered at 45 Smith Street."
      )
    ).toBe(false);
    expect(
      hasObservationSignal(
        "Police records list 45 Smith Street as a previous address."
      )
    ).toBe(false);
  });
});
