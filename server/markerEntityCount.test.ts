import { describe, expect, it } from "vitest";
import {
  markerEntityCount,
  type CountLocation,
  type CountRegistered,
  type CountRegistry,
} from "../shared/markerEntityCount";
import { addressMatchKey } from "../shared/addressMatchKey";

const people: Array<CountRegistered & { address: string }> = [
  {
    name: "Leila Samira HADDAD",
    role: "target",
    address: "7/31 Marine Parade, COTTESLOE",
    vehicles: [
      "1TDM414 white Lexus NX350h station sedan",
      "1TMD414 white Toyota Kluger station sedan",
      "TFG414 silver Ford Transit Van",
    ],
  },
  {
    name: "Karim Elias NAJJAR",
    role: "associate",
    address: "9/88 Stirling Highway, NEDLANDS",
    vehicles: ["1NAJ555 black Subaru WRX sedan"],
  },
  {
    name: "Sophia Marie D'ANGELO",
    role: "resident",
    address: "7/31 Marine Parade, COTTESLOE",
    vehicles: [],
  },
  {
    name: "Diego NAVARRO",
    role: "target",
    address: "12 Smith Street, PERTH",
    vehicles: ["black Hyundai Staria", "silver Toyota"],
  },
];
const registry: CountRegistry = {
  byName: new Map(people.map(p => [p.name.toLowerCase(), p])),
  byAddress: new Map(),
};
for (const p of people) {
  const k = addressMatchKey(p.address);
  registry.byAddress.set(k, [...(registry.byAddress.get(k) ?? []), p]);
}

const HADDAD_LONG = "Leila Samira HADDAD, born 14 April 1988 (HADDAD)";
const NAJJAR_LONG = "Karim Elias NAJJAR, born 02 May 1985 (NAJJAR)";
const V1F =
  "white Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414)";
const V2F =
  "white Toyota Kluger station sedan, bearing WA registration 1TMD414 (Vehicle 1TMD414)";

const marine: CountLocation = {
  label: "7/31 Marine Parade, COTTESLOE",
  type: "target_address",
  linkedTargets: [
    { name: HADDAD_LONG, v1f: V1F, v2f: V2F, addressLabel: null },
  ],
  assocPersons: [
    "Sophia Marie D'ANGELO, born 01 Jan 1990 (D'ANGELO)",
    NAJJAR_LONG,
  ],
  assocVehicles: [
    "1TDM414 in white Lexus NX350h station sedan",
    "1NAJ555 in black Subaru WRX sedan",
  ],
  observedTargets: [HADDAD_LONG],
  observedPersons: [NAJJAR_LONG],
  observedVehicles: [
    "1TDM414 in white Lexus NX350h station sedan",
    "1NAJ555 in black Subaru WRX sedan",
  ],
};

describe("markerEntityCount — follows the popup", () => {
  it("target home address: registered people with every vehicle, plus who and what was seen, each once", () => {
    // people: HADDAD, D'ANGELO, NAJJAR · vehicles: 1TDM414, 1TMD414, TFG414, 1NAJ555
    expect(markerEntityCount(marine, registry)).toBe(7);
  });

  it("a place someone was only seen at counts who was seen, not everything they own", () => {
    const woolworths: CountLocation = {
      label: "Woolworths Southlands, 45 Burrendah Boulevard, WILLETON",
      type: "observation",
      linkedTargets: [{ name: HADDAD_LONG, v1f: V1F, v2f: V2F }],
      assocPersons: [NAJJAR_LONG],
      assocVehicles: [],
      observedTargets: [HADDAD_LONG],
      observedPersons: [NAJJAR_LONG],
      observedVehicles: [],
    };
    expect(markerEntityCount(woolworths, registry)).toBe(2);
  });

  it("an associate's address counts the associate and their registry vehicles", () => {
    const nedlands: CountLocation = {
      label: "9/88 Stirling Highway, NEDLANDS",
      type: "associate_address",
      linkedTargets: [],
      assocPersons: [NAJJAR_LONG],
      assocVehicles: [],
      observedTargets: [],
      observedPersons: [],
      observedVehicles: [],
    };
    expect(markerEntityCount(nedlands, registry)).toBe(2);
  });

  it("a vehicle description with no rego still counts once", () => {
    const navarro: CountLocation = {
      label: "12 Smith Street, PERTH",
      type: "target_address",
      linkedTargets: [
        {
          name: "Diego NAVARRO",
          v1f: "Black Hyundai Staria",
          v2f: "Silver Toyota",
          addressLabel: null,
        },
      ],
      assocPersons: [],
      assocVehicles: [],
      observedTargets: [],
      observedPersons: [],
      observedVehicles: [],
    };
    expect(markerEntityCount(navarro, registry)).toBe(3);
  });

  it("a pin that absorbed another address counts both, each person and vehicle once", () => {
    const nedlands: CountLocation = {
      label: "9/88 Stirling Highway, NEDLANDS",
      type: "associate_address",
      linkedTargets: [],
      assocPersons: [NAJJAR_LONG],
      assocVehicles: [],
      observedTargets: [],
      observedPersons: [],
      observedVehicles: [],
    };
    expect(
      markerEntityCount({ ...marine, secondaryLocs: [nedlands] }, registry)
    ).toBe(7);
    // …and a secondary with someone new adds them.
    const other: CountLocation = {
      label: "Somewhere, PERTH",
      type: "observation",
      linkedTargets: [],
      assocPersons: ["Zed Quill"],
      assocVehicles: ["1ZZZ999 red Holden Commodore"],
      observedTargets: [],
      observedPersons: ["Zed Quill"],
      observedVehicles: ["1ZZZ999 red Holden Commodore"],
    };
    expect(
      markerEntityCount({ ...marine, secondaryLocs: [other] }, registry)
    ).toBe(9);
  });

  it("works before the registry has loaded, using the target's own vehicles", () => {
    // people: HADDAD, NAJJAR · vehicles: 1TDM414 (also on the target), 1TMD414, 1NAJ555
    expect(markerEntityCount(marine, undefined)).toBe(5);
  });

  it("counts the same vehicle once whichever way it is written", () => {
    const loc: CountLocation = {
      label: "1 Test Street, PERTH",
      type: "observation",
      linkedTargets: [],
      assocPersons: [],
      assocVehicles: [],
      observedVehicles: [
        "1TDM414 white Lexus NX350h",
        "Vehicle 1TDM414",
        "white Lexus NX350h station sedan, bearing WA registration 1TDM414 (Vehicle 1TDM414)",
      ],
    };
    expect(markerEntityCount(loc, undefined)).toBe(1);
  });

  it("an empty place counts nothing", () => {
    expect(
      markerEntityCount(
        {
          label: "1 Nowhere Road, PERTH",
          type: "observation",
          linkedTargets: [],
          assocPersons: [],
          assocVehicles: [],
          observedTargets: [],
          observedPersons: [],
          observedVehicles: [],
        },
        registry
      )
    ).toBe(0);
  });
});
