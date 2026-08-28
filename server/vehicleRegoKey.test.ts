/**
 * Tests for vehicleRegoKey's rego-extraction pattern.
 *
 * Regression: the pattern only recognised the current-standard WA shape
 * (digit + 2-3 letters + 3 digits, e.g. "1ADF124"). A letter-first plate
 * like "XFD987" — a common older/interstate shape, also documented in the
 * WA_REGO classifier used elsewhere for text-mining — fell through to the
 * full-description-string fallback instead of keying on the rego alone.
 * extractRegoUpper used to diverge further still (it had its own,
 * independently-defined copy of the digit-first-only pattern), which meant
 * a letter-first-plate vehicle's "Registered Target(s)" cross-link lookup
 * on the Vehicle Profile page silently found nothing even when the vehicle
 * really was registered to a target.
 */

import { describe, it, expect } from "vitest";
import { vehicleRegoKey } from "./db";

describe("vehicleRegoKey", () => {
  it("keys on a digit-first rego embedded in a longer description", () => {
    expect(vehicleRegoKey("1ADF124 red Ford Territory")).toBe("1adf124");
    expect(
      vehicleRegoKey("silver Hyundai Santa Fe, bearing WA registration 1ICW519")
    ).toBe("1icw519");
  });

  it("keys on a letter-first rego embedded in a longer description", () => {
    expect(vehicleRegoKey("XFD987 white Audi A4 Sedan")).toBe("xfd987");
    expect(
      vehicleRegoKey("white Audi A4 Sedan, bearing WA registration XFD987")
    ).toBe("xfd987");
  });

  it("collapses two mentions of the same letter-first-plate vehicle to the same key", () => {
    const a = vehicleRegoKey("XFD987 white Audi A4 Sedan");
    const b = vehicleRegoKey(
      "white Audi A4 Sedan, bearing WA registration XFD987"
    );
    expect(a).toBe(b);
  });

  it("falls back to the normalized full text when no rego shape is found", () => {
    expect(vehicleRegoKey("white Audi A4 Sedan, no plate visible")).toBe(
      "white audi a4 sedan, no plate visible"
    );
  });
});
