/**
 * Regression tests for convertGoogleAddresses — the on-blur/on-paste
 * auto-conversion that turns a pasted Google Maps address into the running
 * sheet's own address convention.
 *
 * The bug this guards against: the street-number group had no leading word
 * boundary, so it matched digits embedded mid-word. An officer typing a
 * vehicle description like
 *
 *   "A red Mercedes Benz GL450 SUV, bearing WA registration 1FAD093 ..."
 *
 * had the "450" inside "GL450" read as a street number, "SUV" as a street
 * name, and "bearing WA" as a "suburb STATE" pair — silently rewriting a
 * correct evidentiary observation into
 *
 *   "...GL450 Suv, BEARING WA (450 Suv) registration 1FAD093..."
 *
 * on blur. Model designations containing digits (GL450, X5, Q7, 208 GTi)
 * are common in vehicle descriptions, so this is tested from both sides:
 * such text must be left completely untouched, while genuine Google Maps
 * addresses must still convert.
 */

import { describe, it, expect } from "vitest";
import { convertGoogleAddresses } from "@/lib/addressFormat";

describe("convertGoogleAddresses — leaves vehicle descriptions alone", () => {
  it("does not mangle a model designation containing digits (the reported bug)", () => {
    const text =
      "A red Mercedes Benz GL450 SUV, bearing WA registration 1FAD093 (Vehicle 1FAD093) parked and unattended in the driveway.";
    expect(convertGoogleAddresses(text)).toBe(text);
  });

  it("leaves other digit-bearing model names untouched", () => {
    const samples = [
      "A grey BMW X5, bearing WA registration 1ABC123 (Vehicle 1ABC123) departed.",
      "A white Audi Q7, bearing WA registration 1XYZ789 (Vehicle 1XYZ789) arrived.",
      "A blue Peugeot 208 GTi, bearing WA registration 1QRS456 (Vehicle 1QRS456) parked.",
      "A blue Peugeot 208 GTi, bearing WA rego 1QRS456 parked.",
    ];
    for (const text of samples) {
      expect(convertGoogleAddresses(text)).toBe(text);
    }
  });
});

describe("convertGoogleAddresses — still converts real addresses", () => {
  it("converts a plain Google Maps address", () => {
    expect(
      convertGoogleAddresses("131 Lakey St, Southern River WA 6110, Australia")
    ).toBe("131 Lakey Street, SOUTHERN RIVER WA (131 Lakey Street)");
  });

  it("converts a unit/slash street number", () => {
    expect(convertGoogleAddresses("3/12 Smith St, Fremantle WA 6160")).toBe(
      "3/12 Smith Street, FREMANTLE WA (3/12 Smith Street)"
    );
  });

  it("uses the business name as the bracket code when one precedes the address", () => {
    expect(
      convertGoogleAddresses(
        "Bicton Tavern, 1 Point Walter Rd, Bicton WA 6157, Australia"
      )
    ).toBe("Bicton Tavern, 1 Point Walter Road, BICTON WA (Bicton Tavern)");
  });

  it("converts an address embedded mid-sentence", () => {
    expect(
      convertGoogleAddresses(
        "Target arrived at 131 Lakey St, Southern River WA 6110, Australia"
      )
    ).toBe(
      "Target arrived at 131 Lakey Street, SOUTHERN RIVER WA (131 Lakey Street)"
    );
  });

  it("is idempotent — already-converted text is left as-is", () => {
    const converted = "131 Lakey Street, SOUTHERN RIVER WA (131 Lakey Street)";
    expect(convertGoogleAddresses(converted)).toBe(converted);
  });
});
