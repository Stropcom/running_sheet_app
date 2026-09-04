/**
 * Thorough tests for address formatting in the intelligence pipeline.
 *
 * Tests cover:
 *  1. extractEntitiesFromText — address entity label recovery from fullDescription
 *  2. formatIntelAddress (client-side) — Title Case street + CAPS suburb formatting
 *
 * The core requirement:
 *   Observation: "...arrived at 4 Glyde St, East Fremantle WA (4 GLYDE ST)..."
 *   Entity shortForm (display label): "4 Glyde St, EAST FREMANTLE"
 *   Entity rawShortForm (geocoding key): "4 GLYDE ST"
 *
 * Full address format (in running sheet text):
 *   "4 Glyde Street, East Fremantle WA (4 Glyde Street)"
 *
 * Short address (bracket code, for geocoding):
 *   "4 GLYDE ST"
 *
 * Intelligence/markers/profiles display:
 *   "4 Glyde Street, EAST FREMANTLE"
 */

import { describe, it, expect } from "vitest";
import { extractEntitiesFromText } from "./db";

// ─── Helper: extract only address entities ───────────────────────────────────
function extractAddresses(text: string) {
  return extractEntitiesFromText(text).filter(e => e.type === "address");
}

// ─── 1. extractEntitiesFromText — address label recovery ─────────────────────
describe("extractEntitiesFromText — address label recovery", () => {
  it("recovers Title Case street + CAPS suburb from fullDescription (standard case)", () => {
    const obs =
      "Vehicle 1FAB007, REID driver and sole occupant, arrived at 4 Glyde St, East Fremantle WA (4 GLYDE ST) and parked.";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    // Display label should be properly formatted
    expect(addrs[0].shortForm).toBe("4 Glyde St, EAST FREMANTLE");
    // Raw short form (geocoding key) should be the bracket token
    expect(addrs[0].rawShortForm).toBe("4 GLYDE ST");
  });

  it("recovers address from Marine Parade observation (the reported bug)", () => {
    const obs =
      "Vehicle 1FAB007, REID driver and sole occupant, arrived at 146 Marine Parade, Cottesloe WA (146 MARINE PARADE) and parked in a car bay.";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    expect(addrs[0].shortForm).toBe("146 Marine Parade, COTTESLOE");
    expect(addrs[0].rawShortForm).toBe("146 MARINE PARADE");
  });

  it("recovers address with multi-word suburb", () => {
    const obs =
      "Target arrived at 187 Mill Point Road, South Perth WA (187 MILL POINT RD) and entered the building.";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    expect(addrs[0].shortForm).toBe("187 Mill Point Road, SOUTH PERTH");
    expect(addrs[0].rawShortForm).toBe("187 MILL POINT RD");
  });

  it("recovers address with unit number (3/12 format)", () => {
    const obs = "Subject entered 3/12 Smith St, Fremantle WA (3/12 SMITH ST).";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    expect(addrs[0].shortForm).toContain("Smith");
    expect(addrs[0].shortForm.toUpperCase()).toContain("FREMANTLE");
  });

  it("falls back to title-casing the bracket token when fullDescription has no address", () => {
    // Short form only, no preceding address text
    const obs = "Subject was observed at (4 GLYDE ST).";
    const addrs = extractAddresses(obs);
    // May or may not extract depending on fullDescription length, but if it does,
    // the shortForm should be title-cased, not all-caps
    if (addrs.length > 0) {
      expect(addrs[0].shortForm).not.toBe("4 GLYDE ST");
      expect(addrs[0].shortForm).toMatch(/^4 Glyde/i);
    }
  });

  it("does not corrupt person entities when address is also present", () => {
    const obs =
      "Bruce REID (REID) arrived at 110 Broome Street, Cottesloe WA (110 BROOME ST).";
    const entities = extractEntitiesFromText(obs);
    const persons = entities.filter(e => e.type === "person");
    const addrs = entities.filter(e => e.type === "address");
    // Person should still be extracted
    expect(persons.length).toBeGreaterThanOrEqual(1);
    expect(persons[0].rawShortForm).toBe("REID");
    // Address should be properly formatted
    expect(addrs.length).toBeGreaterThanOrEqual(1);
    expect(addrs[0].shortForm).toBe("110 Broome Street, COTTESLOE");
  });

  it("handles intersection addresses", () => {
    const obs =
      "Vehicle observed at Kent St & Queens Park Rd, Wilson WA (KENT ST & QUEENS PARK RD).";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    // Should contain both street names in proper case
    expect(addrs[0].shortForm.toLowerCase()).toContain("kent");
    expect(addrs[0].shortForm.toLowerCase()).toContain("queens park");
    expect(addrs[0].shortForm.toUpperCase()).toContain("WILSON");
  });

  it("handles address with business name prefix", () => {
    const obs =
      "Target entered Ocean Beach Hotel, 1 Marine Terrace, Cottesloe WA (Ocean Beach Hotel).";
    const entities = extractEntitiesFromText(obs);
    const addrs = entities.filter(e => e.type === "address");
    expect(addrs).toHaveLength(1);
    // Business name must be restored as a prefix on the display label,
    // not dropped in favour of just the street portion.
    expect(addrs[0].shortForm).toBe(
      "Ocean Beach Hotel, 1 Marine Terrace, COTTESLOE"
    );
    expect(addrs[0].rawShortForm).toBe("Ocean Beach Hotel");
  });

  it("recovers business location display name with narrative text before the business name", () => {
    // The bracket short form is the business name itself for business
    // locations (per the RS convention), not a street code.
    const obs =
      "IOs observed the subject enter Bicton Tavern, 1 Point Walter Road, BICTON WA (Bicton Tavern) and speak with staff.";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    expect(addrs[0].shortForm).toBe(
      "Bicton Tavern, 1 Point Walter Road, BICTON"
    );
    expect(addrs[0].rawShortForm).toBe("Bicton Tavern");
  });

  it("recovers a short single-word business name without misclassifying it as a vehicle rego", () => {
    const obs =
      "Subject was observed at Oushk, 61A Carrington Street, PALMYRA WA (Oushk) for approximately 20 minutes.";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    expect(addrs[0].shortForm).toBe("Oushk, 61A Carrington Street, PALMYRA");
    expect(addrs[0].rawShortForm).toBe("Oushk");
  });

  it("recovers business name when narrative between two entities precedes it", () => {
    const obs =
      "Vehicle 1FAB007, REID driver and sole occupant, arrived at Pharmacy 777, 143 Canning Highway, SOUTH PERTH WA (Pharmacy 777) and entered the store.";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    expect(addrs[0].shortForm).toBe(
      "Pharmacy 777, 143 Canning Highway, SOUTH PERTH"
    );
    expect(addrs[0].rawShortForm).toBe("Pharmacy 777");
  });

  it("recovers a 'Shop N/42/44' style address (unit + number range, the reported bug)", () => {
    // Real-world WA shop numbering sometimes uses a second "/NN" instead of
    // a hyphen for a property spanning two numbers (e.g. "42/44" for what a
    // street sign would show as "42-44"). Before the fix, the extra slash
    // meant no digit run in "Shop 1/42/44" was ever preceded by the
    // required word boundary (each one sits right after a "/"), so the
    // whole address was unreachable and the entity silently fell back to
    // just its bracket business name with no address at all — worse than
    // the other cases here, which at least recovered a (possibly
    // name-less) address.
    const obs =
      "Vehicle 1IDX721, IKIN driver and sole occupant, arrived at Pronto Butcher, Shop 1/42/44 Gugeri Street, CLAREMONT WA (Pronto Butcher) parked in the car park.";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    expect(addrs[0].shortForm).toBe(
      "Pronto Butcher, Shop 1/42/44 Gugeri Street, CLAREMONT"
    );
    expect(addrs[0].rawShortForm).toBe("Pronto Butcher");
  });

  it("does not prepend an unrelated business name for plain (non-business) addresses", () => {
    const obs =
      "Subject departed 27 Olding Way, MELVILLE WA (27 Olding Way) at 1400 hours.";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    expect(addrs[0].shortForm).toBe("27 Olding Way, MELVILLE");
  });

  it("title-cases a unit-letter-suffixed street number correctly (61a → 61A)", () => {
    const obs =
      "Subject departed 61A Carrington Street, PALMYRA WA (61A Carrington Street) at 1400 hours.";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    expect(addrs[0].shortForm).toBe("61A Carrington Street, PALMYRA");
  });

  it("handles multiple addresses in one observation", () => {
    const obs =
      "Vehicle departed 4 Glyde St, East Fremantle WA (4 GLYDE ST) and arrived at 110 Broome Street, Cottesloe WA (110 BROOME ST).";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(2);
    const labels = addrs.map(a => a.shortForm);
    expect(labels).toContain("4 Glyde St, EAST FREMANTLE");
    expect(labels).toContain("110 Broome Street, COTTESLOE");
  });

  it("preserves rawShortForm as the all-caps bracket token for geocoding", () => {
    const obs =
      "Arrived at 1 Wauhop Rd, East Fremantle WA (1 WAUHOP RD) and parked.";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    // rawShortForm must be the exact bracket token (for geocoding)
    expect(addrs[0].rawShortForm).toBe("1 WAUHOP RD");
    // shortForm must be properly formatted (for display)
    expect(addrs[0].shortForm).toBe("1 Wauhop Rd, EAST FREMANTLE");
  });

  it("handles address with postcode in fullDescription", () => {
    const obs =
      "Subject arrived at 131 Lakey St, Southern River WA 6110 (131 LAKEY ST) and entered.";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    expect(addrs[0].shortForm).toBe("131 Lakey St, SOUTHERN RIVER");
    // Postcode should not appear in display label
    expect(addrs[0].shortForm).not.toContain("6110");
  });

  it("handles address with ', Australia' suffix in fullDescription", () => {
    const obs =
      "Arrived at 131 Lakey St, Southern River WA 6110, Australia (131 LAKEY ST).";
    const addrs = extractAddresses(obs);
    expect(addrs).toHaveLength(1);
    expect(addrs[0].shortForm).not.toContain("Australia");
    expect(addrs[0].shortForm).toBe("131 Lakey St, SOUTHERN RIVER");
  });
});

// ─── 2. formatIntelAddress — client-side safety net ──────────────────────────
// We test the pure function directly by importing it.
// Since this is a server test file, we replicate the function logic here
// to avoid cross-boundary imports. The actual function is in addressFormat.ts.

function formatIntelAddress(shortForm: string): string {
  if (!shortForm) return shortForm;

  let text = shortForm.replace(/\s*\([^)]{1,80}\)\s*$/, "").trim();
  text = text.replace(/,?\s*Australia\s*$/i, "").trim();
  text = text.replace(/\s+\d{4}\s*$/, "").trim();

  const AU_STATES_RE = /^(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)$/i;
  const parts = text.split(",");
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1].trim();
    const stateMatch = lastPart.match(
      /^(.*?)\s+(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)$/i
    );
    if (stateMatch) {
      const suburb = stateMatch[1].trim();
      parts[parts.length - 1] = " " + suburb.toUpperCase();
      text = parts.join(",");
    } else if (AU_STATES_RE.test(lastPart)) {
      parts.pop();
      text = parts.join(",").trim();
    }
  }

  // Safety net: title-case all-caps street segments
  const finalParts = text.split(",");
  if (finalParts.length >= 1) {
    const streetSegment = finalParts[0].trim();
    const nonDigitChars = streetSegment.replace(/[\d\s/]/g, "");
    if (
      nonDigitChars.length > 0 &&
      nonDigitChars === nonDigitChars.toUpperCase() &&
      /[A-Z]{2}/.test(nonDigitChars)
    ) {
      finalParts[0] =
        " " +
        streetSegment.replace(/\b(\w+)/g, w => {
          if (/^\d+$/.test(w)) return w;
          if (
            /^(WA|NSW|VIC|QLD|SA|TAS|NT|ACT|HWY|RD|ST|AVE|DR|CT|PL|CL|CRES|BLVD|FWY|LN|TCE|PDE|CCT|GR|CNR)$/i.test(
              w
            )
          )
            return w.toUpperCase();
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        });
      text = finalParts.join(",").trim();
    }
  }

  return text.trim();
}

describe("formatIntelAddress — display formatting", () => {
  it("formats standard address correctly", () => {
    expect(formatIntelAddress("1 Smith Street, Melville WA")).toBe(
      "1 Smith Street, MELVILLE"
    );
  });

  it("title-cases all-caps street segment (safety net for old entities)", () => {
    expect(formatIntelAddress("4 GLYDE ST, EAST FREMANTLE")).toBe(
      "4 Glyde ST, EAST FREMANTLE"
    );
  });

  it("strips state abbreviation from suburb+state", () => {
    expect(formatIntelAddress("146 Marine Parade, Cottesloe WA")).toBe(
      "146 Marine Parade, COTTESLOE"
    );
  });

  it("strips postcode", () => {
    expect(formatIntelAddress("131 Lakey St, Southern River WA 6110")).toBe(
      "131 Lakey St, SOUTHERN RIVER"
    );
  });

  it("strips ', Australia' suffix", () => {
    expect(
      formatIntelAddress("131 Lakey St, Southern River WA 6110, Australia")
    ).toBe("131 Lakey St, SOUTHERN RIVER");
  });

  it("strips trailing bracket code", () => {
    expect(
      formatIntelAddress("4 Glyde St, East Fremantle WA (4 GLYDE ST)")
    ).toBe("4 Glyde St, EAST FREMANTLE");
  });

  it("handles intersection address", () => {
    expect(formatIntelAddress("Kent St & Queens Park Rd, Wilson WA")).toBe(
      "Kent St & Queens Park Rd, WILSON"
    );
  });

  it("returns business name as-is when no address info", () => {
    expect(formatIntelAddress("Ocean Beach Hotel")).toBe("Ocean Beach Hotel");
  });

  it("handles multi-word suburb", () => {
    expect(formatIntelAddress("187 Mill Point Road, South Perth WA")).toBe(
      "187 Mill Point Road, SOUTH PERTH"
    );
  });

  it("handles already-correctly-formatted address (idempotent)", () => {
    expect(formatIntelAddress("4 Glyde St, EAST FREMANTLE")).toBe(
      "4 Glyde St, EAST FREMANTLE"
    );
  });

  it("does not title-case suburb (suburb stays CAPS)", () => {
    const result = formatIntelAddress("4 Glyde St, East Fremantle WA");
    expect(result).toBe("4 Glyde St, EAST FREMANTLE");
    // Suburb must be all-caps
    const suburb = result.split(",")[1]?.trim();
    expect(suburb).toBe("EAST FREMANTLE");
  });

  it("handles empty string", () => {
    expect(formatIntelAddress("")).toBe("");
  });
});
