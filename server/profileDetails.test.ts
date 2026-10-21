import { describe, expect, it } from "vitest";
import {
  groupDetailEntries,
  targetDetailEntries,
} from "@/lib/registeredDetails";
import { specialProjectsOrNone } from "@shared/targetStatus";

describe("Registered Details sub-headings", () => {
  const target = {
    hbf: "7 Mariner Place, MINDARIE WA (7 Mariner Place)",
    v1f: "white Lexus NX station sedan, bearing WA registration 1ROC85 (Vehicle 1ROC85)",
    extraAddresses: JSON.stringify([
      {
        label: "",
        full: "6/19 Prindiville Drive, WANGARA WA (6/19 Prindiville Drive)",
      },
    ]),
    extraVehicles: JSON.stringify([
      {
        full: "silver Holden Barina, bearing VIC registration TFG414 (Vehicle TFG414)",
      },
    ]),
  };

  it("puts addresses under Addresses and vehicles under Vehicles", () => {
    const groups = groupDetailEntries(targetDetailEntries(target));
    expect(groups.map(g => g.title)).toEqual(["Addresses", "Vehicles"]);
    expect(groups[0].items.map(e => e.label)).toEqual([
      "Home Address",
      "Address 2",
    ]);
    expect(groups[1].items.map(e => e.label)).toEqual([
      "Vehicle 1",
      "Vehicle 2",
    ]);
  });

  it("leaves out a group with nothing in it", () => {
    expect(
      groupDetailEntries(targetDetailEntries({ hbf: target.hbf })).map(
        g => g.title
      )
    ).toEqual(["Addresses"]);
    expect(
      groupDetailEntries(targetDetailEntries({ v1f: target.v1f })).map(
        g => g.title
      )
    ).toEqual(["Vehicles"]);
    expect(groupDetailEntries(targetDetailEntries({}))).toEqual([]);
  });
});

describe("Status: Special Projects", () => {
  it("is None when there are none", () => {
    expect(specialProjectsOrNone(null)).toBe("None");
    expect(specialProjectsOrNone("")).toBe("None");
    expect(specialProjectsOrNone("[]")).toBe("None");
  });

  it("lists them when there are some", () => {
    expect(
      specialProjectsOrNone(
        JSON.stringify([
          { key: "TI", detail: "" },
          { key: "LBS", detail: "1ABC" },
        ])
      )
    ).toContain("TI");
  });
});
