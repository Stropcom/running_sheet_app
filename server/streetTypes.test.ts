import { describe, expect, it } from "vitest";
import {
  findAbbreviatedStreetTypes,
  fullStreetTypes,
} from "@shared/streetTypes";

describe("fullStreetTypes", () => {
  it.each([
    ["29A Robert St", "29A Robert Street"],
    [
      "6 Hill St, SOUTH PERTH WA (6 Hill St)",
      "6 Hill Street, SOUTH PERTH WA (6 Hill Street)",
    ],
    ["77 Reynolds Rd", "77 Reynolds Road"],
    ["902 Canning Hwy, APPLECROSS WA", "902 Canning Highway, APPLECROSS WA"],
    ["12/4 Smith Ave and continued", "12/4 Smith Avenue and continued"],
    ["1 SMITH ST, MELVILLE", "1 SMITH STREET, MELVILLE"],
    [
      "Kent St & Queens Park Rd, WILSON WA",
      "Kent Street & Queens Park Road, WILSON WA",
    ],
    ["arrived at 31 Ardross St.", "arrived at 31 Ardross Street."],
  ])("%s", (input, expected) => {
    expect(fullStreetTypes(input)).toBe(expected);
  });

  it.each([
    "29A Robert Street",
    "St Georges Terrace",
    "Dr Smith saw BAIG",
    "St Kilda Road",
    "Walked to St John's church",
    "Vehicle 1EXP123 arrived",
  ])("leaves alone: %s", input => {
    expect(fullStreetTypes(input)).toBe(input);
  });

  it("is idempotent", () => {
    const once = fullStreetTypes("6 Hill St (6 Hill St)");
    expect(fullStreetTypes(once)).toBe(once);
  });

  it("finds each abbreviation with its position", () => {
    const text = "arrived at 6 Hill St, SOUTH PERTH WA (6 Hill St)";
    const hits = findAbbreviatedStreetTypes(text);
    expect(
      hits.map(h => [text.slice(h.index, h.index + h.abbr.length), h.full])
    ).toEqual([
      ["St", "Street"],
      ["St", "Street"],
    ]);
  });
});

import { convertGoogleAddresses, ensureBracketCode } from "@/lib/addressFormat";
import { buildSheetAddressText } from "@shared/knownAddress";
import { formatIntelAddress } from "@shared/addressFormat";
import { checkAbbreviatedStreetTypes } from "./sheetCheck";
import { computePendingVehicleArrivals } from "./db";

describe("the app writes street types in full", () => {
  it("a Google address, converted", () => {
    expect(
      convertGoogleAddresses("12 Swan St, South Perth WA 6151, Australia")
    ).toBe("12 Swan Street, SOUTH PERTH WA (12 Swan Street)");
  });

  it("an address that already has an abbreviated bracket", () => {
    expect(
      convertGoogleAddresses("12 Swan Street, SOUTH PERTH WA (12 Swan St)")
    ).toBe("12 Swan Street, SOUTH PERTH WA (12 Swan Street)");
    expect(ensureBracketCode("12 Swan St, SOUTH PERTH WA")).toBe(
      "12 Swan Street, SOUTH PERTH WA (12 Swan Street)"
    );
  });

  it("a known address picked from the suggestions", () => {
    expect(
      buildSheetAddressText({
        businessName: "",
        street: "13 Denford St",
        suburb: "KENWICK",
      })
    ).toBe("13 Denford Street, KENWICK WA (13 Denford Street)");
  });

  it("an address shown in the Intelligence folder or on the map", () => {
    expect(formatIntelAddress("4 GLYDE ST, MELVILLE WA (4 Glyde St)")).toBe(
      "4 Glyde Street, MELVILLE"
    );
  });

  it("an arrival's place, whichever way the row wrote it", () => {
    const [a] = computePendingVehicleArrivals([
      {
        id: 1,
        sheetId: 1,
        observation:
          "Vehicle 1EXP123, BAIG driver, arrived at 6 Hill Street, SOUTH PERTH WA (6 Hill St) and parked.",
      },
    ]);
    expect(a.address).toBe("6 Hill Street");
  });

  it("Check Sheet flags an abbreviation, with a fix to the full word", () => {
    const row = {
      rowId: 1,
      timeMinutes: 100,
      observation:
        "arrived at 6 Hill Street, SOUTH PERTH WA (6 Hill St) and left 6 Hill St.",
    };
    const findings = checkAbbreviatedStreetTypes([row]);
    expect(findings).toHaveLength(2);
    let text = row.observation;
    for (const f of findings) {
      expect(f.suggestedFix).toBeDefined();
    }
    text = text.replace(
      findings[0].suggestedFix!.wrong,
      findings[0].suggestedFix!.correct
    );
    expect(text).toContain("(6 Hill Street)");
  });
});
