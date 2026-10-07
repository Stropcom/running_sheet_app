import { describe, expect, it } from "vitest";
import {
  cleanWalkerNames,
  extractExitDestination,
  isReadAsMovement,
  matchPresenceInside,
  scanWalkEvents,
} from "@shared/walkEventPatterns";

const rows = (...obs: string[]) =>
  obs.map((observation, i) => ({ id: i + 1, sheetId: 1, observation }));

describe("cleanWalkerNames", () => {
  it("cuts the names off before an exited/walked clause", () => {
    expect(cleanWalkerNames("BAIG exited A, walked across the road,")).toBe(
      "BAIG"
    );
    expect(cleanWalkerNames("BAIG and JORDAN")).toBe("BAIG and JORDAN");
  });
});

describe("extractExitDestination", () => {
  it("reads the destination after towards", () => {
    expect(
      extractExitDestination(" across the road towards 13 Denford Street")
    ).toBe("13 Denford Street");
  });
  it("is null for a vehicle destination or none", () => {
    expect(extractExitDestination(" towards Vehicle 1HIB84")).toBeNull();
    expect(extractExitDestination(" along Albany Highway")).toBeNull();
  });
  it("prefers a bracket label over a full address", () => {
    expect(
      extractExitDestination(
        " towards 13 Denford Street, KENWICK WA (13 Denford Street)"
      )
    ).toBe("13 Denford Street");
  });
});

describe("scanWalkEvents — people on foot, no vehicle", () => {
  it("tracks a direct entry as pending until they exit", () => {
    const entered = rows(
      "BAIG and JORDAN entered 193b Stock Road and continued out of sight."
    );
    expect(scanWalkEvents(entered).walkIns).toMatchObject([
      { names: "BAIG and JORDAN", location: "193b Stock Road", route: "" },
    ]);
    const exited = rows(
      "BAIG and JORDAN entered 193b Stock Road and continued out of sight.",
      "BAIG and JORDAN exited 193b Stock Road and walked along Stock Road."
    );
    expect(scanWalkEvents(exited).walkIns).toEqual([]);
  });

  it("tracks location-to-location movement as heading-to until entered", () => {
    const base = [
      "BAIG entered 193b Stock Road and continued out of sight.",
      "BAIG exited 193b Stock Road and walked across the road towards 13 Denford Street.",
    ];
    const mid = scanWalkEvents(rows(...base));
    expect(mid.walkIns).toEqual([]);
    expect(mid.headingTo).toMatchObject([
      {
        names: "BAIG",
        destination: "13 Denford Street",
        from: "193b Stock Road",
      },
    ]);
    const done = scanWalkEvents(
      rows(
        ...base,
        "BAIG entered 13 Denford Street and continued out of sight."
      )
    );
    expect(done.headingTo).toEqual([]);
    expect(done.walkIns).toMatchObject([{ location: "13 Denford Street" }]);
  });

  it("does not treat leaving a vehicle as leaving an address", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG exited the vehicle, entered 193b Stock Road and continued out of sight."
      )
    );
    expect(r.walkIns).toMatchObject([{ location: "193b Stock Road" }]);
    expect(r.headingTo).toEqual([]);
  });

  it("keeps the vehicle walk-out behaviour", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG exited the vehicle, walked across the road, entered 13 Denford Street and continued out of sight.",
        "BAIG exited 13 Denford Street and walked across the road towards Vehicle 1HIB84."
      )
    );
    expect(r.walkIns).toEqual([]);
    expect(r.headingTo).toEqual([]);
  });

  it("ignores rows with no walking", () => {
    expect(
      scanWalkEvents(rows("Vehicle 1HIB84 arrived at 193b Stock Road."))
    ).toEqual({ walkIns: [], headingTo: [], placements: [] });
  });

  it("ends the walk when they walk back towards a vehicle", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG entered Melville Heights Meat Supply and continued out of sight.",
        "BAIG exited Melville Heights Meat Supply and walked [route] towards [location].",
        "BAIG walked towards Vehicle 1ORB419."
      )
    );
    expect(r.headingTo).toEqual([]);
    expect(r.walkIns).toEqual([]);
  });

  it("re-points where they are heading when they walk on to another place", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG exited Melville Heights Meat Supply and walked [route] towards [location].",
        "BAIG walked across the road towards 13 Denford Street."
      )
    );
    expect(r.headingTo).toMatchObject([
      { names: "BAIG", destination: "13 Denford Street" },
    ]);
    expect(r.headingTo).toHaveLength(1);
  });

  it("clears a heading when they enter somewhere other than the destination", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG exited A and walked towards B.",
        "BAIG entered C and continued out of sight."
      )
    );
    expect(r.headingTo).toEqual([]);
    expect(r.walkIns).toMatchObject([{ location: "C" }]);
  });

  it("puts them inside the place they walked to when the row says they entered it", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG entered Melville Heights Meat Supply and continued out of sight.",
        "BAIG exited Melville Heights Meat Supply and walked through the carpark to Melville Fish & Chips, 362 Marmion Street, MELVILLE WA (Melville Fish & Chips), entered and continued out of sight."
      )
    );
    expect(r.headingTo).toEqual([]);
    expect(r.walkIns).toMatchObject([
      { names: "BAIG", location: "Melville Fish & Chips" },
    ]);
  });

  it("reads a plain 'to <Place>' as a destination, but not 'to the car park'", () => {
    expect(
      extractExitDestination(" through the carpark to Melville Fish & Chips")
    ).toBe("Melville Fish & Chips");
    expect(extractExitDestination(" back to the car park")).toBeNull();
  });

  it("reads 'walked to and entered <Place>' (no 'continued out of sight')", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG entered Melville Heights Meat Supply and continued out of sight.",
        "BAIG exited Melville Heights Meat Supply and walked to and entered Melville Fish & Chips, 362 Marmion Street, MELVILLE WA (Melville Fish & Chips)"
      )
    );
    expect(r.headingTo).toEqual([]);
    expect(r.walkIns).toMatchObject([
      { names: "BAIG", location: "Melville Fish & Chips" },
    ]);
  });

  it("falls back to the first address segment when there is no bracket", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG entered Melville Fish & Chips, 362 Marmion Street, MELVILLE WA"
      )
    );
    expect(r.walkIns).toMatchObject([{ location: "Melville Fish & Chips" }]);
  });

  it("does not treat a seat or a vehicle as a place", () => {
    expect(
      scanWalkEvents(rows("BAIG entered the front passenger seat.")).walkIns
    ).toEqual([]);
    expect(
      scanWalkEvents(rows("BAIG entered Vehicle 1ORB419 and drove off."))
        .walkIns
    ).toEqual([]);
  });

  it("registers a plain exit so someone is no longer inside", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG entered Melville Fish & Chips and continued out of sight.",
        "BAIG exited Melville Fish & Chips."
      )
    );
    expect(r.walkIns).toEqual([]);
  });
});

describe("isReadAsMovement", () => {
  it("recognises the rows from a real sheet", () => {
    for (const t of [
      "Vehicle 1ORB419, BAIG driver and sole occupant, arrived at 15 Leach Avenue, RIVERTON WA (15 Leach Ave) parked in the car park.",
      "BAIG exited the vehicle, entered 15 Leach Avenue and continued out of sight.",
      "BAIG exited 15 Leach Avenue, walked to and entered 21 Leach Avenue, RIVERTON WA (21 Leach Avenue) and continued out of sight.",
      "BAIG exited 21 Leach Avenue and walked towards Vehicle 1ORB419.",
      "BAIG exited Melville Heights Meat Supply and walked to and entered Melville Fish & Chips, 362 Marmion Street, MELVILLE WA (Melville Fish & Chips)",
    ]) {
      expect(isReadAsMovement(t)).toBe(true);
    }
  });
  it("is false for a phrasing it does not know", () => {
    expect(isReadAsMovement("BAIG seen pacing outside the shop.")).toBe(false);
    expect(isReadAsMovement("BAIG went inside.")).toBe(false);
  });
});

describe("walking back to the vehicle, however it is written", () => {
  const out = "BAIG entered 21 Leach Avenue and continued out of sight.";
  for (const back of [
    "BAIG exited 21 Leach Avenue and walked towards Vehicle 1ORB419.",
    "BAIG exited 21 Leach Avenue and walked to Vehicle 1ORB419.",
    "BAIG exited 21 Leach Avenue and walked to and entered Vehicle 1ORB419.",
  ]) {
    it(`leaves him no longer inside: ${back}`, () => {
      const r = scanWalkEvents(rows(out, back));
      expect(r.walkIns).toEqual([]);
      expect(r.headingTo).toEqual([]);
      expect(isReadAsMovement(back)).toBe(true);
    });
  }

  for (const back of [
    "BAIG walked towards Vehicle 1ORB419.",
    "BAIG walked to Vehicle 1ORB419.",
    "BAIG walked to and entered Vehicle 1ORB419.",
    "BAIG entered Vehicle 1ORB419.",
  ]) {
    it(`ends a walk: ${back}`, () => {
      const r = scanWalkEvents(
        rows("BAIG exited A and walked towards B.", back)
      );
      expect(r.headingTo).toEqual([]);
    });
  }
});

describe("entries written as a full sentence ending in a full stop", () => {
  it("registers 'BAIG entered Melville Fish & Chips.'", () => {
    const r = scanWalkEvents(rows("BAIG entered Melville Fish & Chips."));
    expect(r.walkIns).toMatchObject([{ location: "Melville Fish & Chips" }]);
  });
});

describe("leaving a parked vehicle and walking away", () => {
  it("puts them on foot, heading for the named place", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG and JORDAN exited the vehicle and walked through the car park towards 13 Denford Street."
      )
    );
    expect(r.headingTo).toMatchObject([
      {
        names: "BAIG and JORDAN",
        destination: "13 Denford Street",
        from: "the vehicle",
      },
    ]);
    expect(r.walkIns).toEqual([]);
  });

  it("keeps them walking with no destination yet", () => {
    const r = scanWalkEvents(
      rows("BAIG exited the vehicle and walked [route] towards [location].")
    );
    expect(r.headingTo).toMatchObject([
      { names: "BAIG", destination: "[location]" },
    ]);
  });

  it("still reads a full walk-in as being inside", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG exited the vehicle, walked [route], entered 13 Denford Street and continued out of sight."
      )
    );
    expect(r.headingTo).toEqual([]);
    expect(r.walkIns).toMatchObject([{ location: "13 Denford Street" }]);
  });

  it("is read as a movement", () => {
    expect(
      isReadAsMovement("BAIG exited the vehicle and walked towards Blend Cafe.")
    ).toBe(true);
  });

  it("keeps two groups walking to unwritten places separate", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG exited the vehicle and walked [route] towards [location].",
        "YATES exited the vehicle and walked [route] towards [location]."
      )
    );
    expect(r.headingTo).toHaveLength(2);
  });

  it("reads the real car-park row (no destination named) as walking, destination unwritten", () => {
    const r = scanWalkEvents(
      rows(
        "Vehicle 1ORB419, BAIG driver and sole occupant, arrived at City of Fremantle - Parry Street Car Park 1 and parked in the car park.",
        "BAIG exited the vehicle, walked through the car park onto Parry Street and Holdsworth Street, FREMANTLE"
      )
    );
    expect(r.headingTo).toMatchObject([
      { names: "BAIG", destination: "[location]", from: "the vehicle" },
    ]);
  });
});

describe("sightings: where someone is, with no movement sentence", () => {
  it("reads the real row", () => {
    expect(
      matchPresenceInside(
        "BAIG seated at a table having a meal inside Bull Creek Tavern."
      )
    ).toEqual({ names: "BAIG", place: "Bull Creek Tavern" });
  });

  it("reads other phrasings, and more than one person", () => {
    expect(
      matchPresenceInside("BAIG and JORDAN observed inside Bull Creek Tavern.")
    ).toEqual({ names: "BAIG and JORDAN", place: "Bull Creek Tavern" });
    expect(
      matchPresenceInside("BAIG remains inside Bull Creek Tavern.")
    ).toEqual({ names: "BAIG", place: "Bull Creek Tavern" });
    expect(
      matchPresenceInside("BAIG seen in the beer garden of Bull Creek Tavern.")
    ).toEqual({ names: "BAIG", place: "Bull Creek Tavern" });
    expect(
      matchPresenceInside(
        "BAIG remains inside Bull Creek Tavern, 52-54 Benningfield Road, BULL CREEK WA (Bull Creek Tavern) with JORDAN."
      )
    ).toEqual({ names: "BAIG", place: "Bull Creek Tavern" });
  });

  it("does not read streets, car parks, vehicles or negations as a place", () => {
    for (const t of [
      "BAIG seen in the car park.",
      "BAIG observed walking in Marmion Street.",
      "BAIG seen in Vehicle 1ORB419.",
      "BAIG not observed inside Bull Creek Tavern.",
      "Vehicle 1HIB84, occupant/s not observed, arrived at Bull Creek Tavern and parked.",
    ]) {
      expect(matchPresenceInside(t)).toBeNull();
    }
  });

  it("puts them inside, and out of the place they were last inside", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG entered Melville Fish & Chips and continued out of sight.",
        "BAIG seated at a table having a meal inside Bull Creek Tavern."
      )
    );
    expect(r.walkIns).toMatchObject([
      { names: "BAIG", location: "Bull Creek Tavern" },
    ]);
    expect(r.walkIns).toHaveLength(1);
    expect(isReadAsMovement("BAIG remains inside Bull Creek Tavern.")).toBe(
      true
    );
  });
});

describe("placements: where each person was last put", () => {
  const inVehicles = (r: ReturnType<typeof scanWalkEvents>) =>
    r.placements.filter(p => p.rego);

  it("a walk to a vehicle whose own rows say occupants not observed", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG exited Bull Creek Tavern and walked towards Vehicle 1HIB84.\nVehicle 1HIB84, occupant/s not observed, departed Bull Creek Tavern and continued via:"
      )
    );
    expect(inVehicles(r)).toEqual([
      expect.objectContaining({ name: "BAIG", rego: "1HIB84" }),
    ]);
    expect(r.walkIns).toEqual([]);
    expect(r.headingTo).toEqual([]);
  });

  it("walking away from the vehicle again takes him out of it", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG exited Bull Creek Tavern and walked towards Vehicle 1HIB84.",
        "BAIG exited the vehicle and walked towards 13 Denford Street."
      )
    );
    expect(inVehicles(r)).toEqual([]);
  });

  it("entering a place takes him out of it", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG walked to and entered Vehicle 1HIB84.",
        "BAIG entered Melville Fish and Chips."
      )
    );
    expect(inVehicles(r)).toEqual([]);
  });

  it("a sighting inside a place puts him there, not in a vehicle", () => {
    const r = scanWalkEvents(
      rows("BAIG seated at a table having a meal inside Bull Creek Tavern.")
    );
    expect(r.placements).toEqual([
      expect.objectContaining({ name: "BAIG", rego: "" }),
    ]);
  });
});
