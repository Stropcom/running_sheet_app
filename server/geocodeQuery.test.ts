import { describe, expect, it } from "vitest";
import {
  dominantState,
  fullAddressForGeocode,
  fullDescriptionsByLabel,
  geocodeQueryFor,
  stateOfAddress,
} from "@shared/geocodeQuery";

describe("fullAddressForGeocode", () => {
  it("takes the written street and suburb when a mention has one", () => {
    expect(fullAddressForGeocode(["Terminal 4, Perth Airport WA"])).toBe(
      "Terminal 4, Perth Airport WA"
    );
  });

  it("skips mentions with no suburb and state, and finds a later one", () => {
    expect(
      fullAddressForGeocode([
        "Terminal 4",
        "",
        null,
        "  Terminal 4, Perth Airport WA  ",
      ])
    ).toBe("Terminal 4, Perth Airport WA");
  });

  it("returns null when no mention has a suburb and state", () => {
    expect(fullAddressForGeocode(["Terminal 4", "Middleton Park"])).toBeNull();
    expect(fullAddressForGeocode([])).toBeNull();
  });
});

describe("fullDescriptionsByLabel (Summary map)", () => {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  it("finds the fuller address written for a bare place label", () => {
    const m = fullDescriptionsByLabel(
      [
        {
          type: "address",
          shortForm: "Terminal 4, Terminal 4",
          fullDescription: "Terminal 4, Perth Airport WA",
        },
        { type: "person", shortForm: "VALE", fullDescription: "Elliot Vale" },
      ],
      norm
    );
    const full = fullAddressForGeocode(
      m.get(norm("Terminal 4, Terminal 4")) ?? []
    );
    expect(full).toBe("Terminal 4, Perth Airport WA");
    expect(m.has("vale")).toBe(false);
  });
  it("gives nothing for a label no row wrote, so it is geocoded as written", () => {
    const m = fullDescriptionsByLabel([], norm);
    expect(fullAddressForGeocode(m.get("terminal 4") ?? [])).toBeNull();
  });
});

describe("the State a geocoder query names (Melbourne and Tasmania pins)", () => {
  it("reads the State an address names", () => {
    expect(stateOfAddress("39 Salamanca Place, HOBART TAS")).toBe("TAS");
    expect(stateOfAddress("Flinders Street Station, MELBOURNE VIC 3000")).toBe(
      "VIC"
    );
    expect(stateOfAddress("12 Murray Street, PERTH WA")).toBe("WA");
    expect(stateOfAddress("1 Main Road, Launceston, Tasmania")).toBe("TAS");
    expect(stateOfAddress("25 Smith Street, Collingwood, Victoria")).toBe(
      "VIC"
    );
  });

  it("does not take a street name, a vehicle's WA or a bare place for a State", () => {
    expect(stateOfAddress("12 Victoria Street, HOBART")).toBeNull();
    expect(
      stateOfAddress("MOSS Hotel - 39, 39 Salamanca Place, HOBART")
    ).toBeNull();
    expect(stateOfAddress("Terminal 4")).toBeNull();
    expect(stateOfAddress("")).toBeNull();
    expect(stateOfAddress(null)).toBeNull();
  });

  it("an address that names a State is not asked for as Western Australia", () => {
    const tas = geocodeQueryFor(
      "39 Salamanca Place, HOBART TAS",
      "39 salamanca place, hobart tas"
    );
    expect(tas.query).toBe("39 Salamanca Place, HOBART TAS, Australia");
    expect(tas.state).toBe("TAS");
    const vic = geocodeQueryFor(
      "Flinders Street Station, MELBOURNE VIC 3000, Australia",
      "k"
    );
    expect(vic.query).toBe(
      "Flinders Street Station, MELBOURNE VIC 3000, Australia"
    );
  });

  it("a place with no State takes the sheet's, else Western Australia", () => {
    expect(
      geocodeQueryFor("MOSS Hotel - 39, 39 Salamanca Place, HOBART", "k", "TAS")
        .query
    ).toBe("MOSS Hotel - 39, 39 Salamanca Place, HOBART, Tasmania, Australia");
    expect(geocodeQueryFor("Terminal 4", "k").query).toBe(
      "Terminal 4, Western Australia, Australia"
    );
    expect(geocodeQueryFor("12 Murray Street, PERTH WA", "k").query).toBe(
      "12 Murray Street, PERTH WA, Australia"
    );
  });

  it("WA keeps the cache key it always had; another State never reuses it", () => {
    expect(geocodeQueryFor("12 Murray Street, PERTH WA", "perth").key).toBe(
      "perth"
    );
    expect(geocodeQueryFor("Terminal 4", "t4").key).toBe("t4");
    // positions cached for the old always-WA query sit under the plain key
    expect(geocodeQueryFor("39 Salamanca Place, HOBART TAS", "sal").key).toBe(
      "sal|TAS"
    );
    expect(geocodeQueryFor("MOSS Hotel", "moss", "VIC").key).toBe("moss|VIC");
  });

  it("the sheet's State is the one most of its places name", () => {
    expect(
      dominantState([
        "39 Salamanca Place, HOBART TAS",
        "Bar, 1 Hunter Street, HOBART TAS",
        "12 Murray Street, PERTH WA",
        "Terminal 4",
      ])
    ).toBe("TAS");
    expect(dominantState(["Terminal 4", null])).toBeNull();
  });

  it("a suburb in capitals with no State still counts as a fuller address", () => {
    expect(
      fullAddressForGeocode([
        "MOSS Hotel - 39",
        "MOSS Hotel - 39, 39 Salamanca Place, HOBART",
      ])
    ).toBe("MOSS Hotel - 39, 39 Salamanca Place, HOBART");
    // a State-bearing description still wins over one without
    expect(
      fullAddressForGeocode(["Bar, 1 Hunter Street, HOBART", "Bar, HOBART TAS"])
    ).toBe("Bar, HOBART TAS");
  });
});

describe("every State and Territory is identified (the app is used across Australia)", () => {
  const cases: [string, string][] = [
    ["12 Murray Street, PERTH WA", "WA"],
    ["5 George Street, SYDNEY NSW", "NSW"],
    ["12 Collins Street, MELBOURNE VIC", "VIC"],
    ["100 Queen Street, BRISBANE QLD", "QLD"],
    ["1 King William Street, ADELAIDE SA", "SA"],
    ["39 Salamanca Place, HOBART TAS", "TAS"],
    ["Mitchell Street, DARWIN NT", "NT"],
    ["1 Constitution Avenue, CANBERRA ACT", "ACT"],
  ];
  it.each(cases)("%s is %s", (text, state) => {
    expect(stateOfAddress(text)).toBe(state);
    expect(geocodeQueryFor(text, "k").state).toBe(state);
    expect(geocodeQueryFor(text, "k").query).toBe(`${text}, Australia`);
  });

  const written: [string, string][] = [
    ["1 Main Road, Launceston, Tasmania", "TAS"],
    ["1 Main Road, Launceston Tasmania 7250", "TAS"],
    ["25 Smith Street, Collingwood, Victoria, Australia", "VIC"],
    ["25 Smith Street, Collingwood Victoria 3066", "VIC"],
    ["3 Hunter Street, Newcastle, New South Wales", "NSW"],
    ["3 Hunter Street, Newcastle NSW 2300, Australia", "NSW"],
    ["9 Ann Street, Brisbane, Queensland", "QLD"],
    ["2 North Terrace, Adelaide, South Australia 5000", "SA"],
    ["4 Smith Street, Darwin, Northern Territory", "NT"],
    ["1 Northbourne Avenue, Canberra, Australian Capital Territory", "ACT"],
    ["1 Main Road, Hobart Tas", "TAS"],
    ["5 George Street, Parramatta N.S.W.", "NSW"],
    ["9 Ann Street, Brisbane Qld 4000", "QLD"],
    ["12 Collins Street, Melbourne Vic 3000", "VIC"],
  ];
  it.each(written)("%s is %s", (text, state) => {
    expect(stateOfAddress(text)).toBe(state);
  });

  it("a place named Victoria / Tasmania / Western Australia mid-address is not a State", () => {
    expect(stateOfAddress("12 Victoria Street, HOBART")).toBeNull();
    expect(
      stateOfAddress("Victoria Park Hotel, 605 Albany Highway")
    ).toBeNull();
    expect(stateOfAddress("1 Tasmania Street, PERTH")).toBeNull();
    // ...but a suburb called Victoria Park is still in the State it names
    expect(stateOfAddress("Hotel, 605 Albany Highway, VICTORIA PARK WA")).toBe(
      "WA"
    );
  });

  it("each State's query names that State, and a bare place takes the hint", () => {
    for (const [state, name] of [
      ["NSW", "New South Wales"],
      ["VIC", "Victoria"],
      ["QLD", "Queensland"],
      ["SA", "South Australia"],
      ["TAS", "Tasmania"],
      ["NT", "Northern Territory"],
      ["ACT", "Australian Capital Territory"],
      ["WA", "Western Australia"],
    ] as const)
      expect(geocodeQueryFor("Town Hall", "k", state).query).toBe(
        `Town Hall, ${name}, Australia`
      );
  });
});
