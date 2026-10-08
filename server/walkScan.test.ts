import { describe, expect, it } from "vitest";
import {
  cleanWalkerNames,
  extractExitDestination,
  isReadAsMovement,
  matchPresenceInside,
  surnameTokens,
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
    ).toEqual({ names: "BAIG and JORDAN", place: "Bull Creek Tavern" });
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

describe("leaving a place and walking on with no destination", () => {
  const phrasings = [
    "BAIG JONES exited Communicare and walked along Cantonment Street, FREMANTLE.",
    "BAIG and JONES exited Communicare and walked on.",
    "BAIG and JONES departed Communicare and continued via Cantonment Street.",
    "BAIG and JONES left Communicare and continued walking via Cantonment Street.",
    "BAIG and JONES walked out of Communicare and walked along Cantonment Street.",
    "BAIG and JONES exited Communicare, continued walking via Cantonment Street.",
  ];
  for (const text of phrasings) {
    it(`is a walking entry with the place left: ${text}`, () => {
      const r = scanWalkEvents(
        rows(
          "BAIG and JONES entered Communicare and continued out of sight.",
          text
        )
      );
      expect(r.walkIns).toEqual([]);
      expect(r.headingTo).toMatchObject([
        { destination: "[location]", from: "Communicare" },
      ]);
      expect(isReadAsMovement(text)).toBe(true);
    });
  }

  it("a vehicle's own departure is not a walk", () => {
    const r = scanWalkEvents(
      rows(
        "Vehicle 1HIB84, BAIG driver, departed Bull Creek Tavern and continued via:"
      )
    );
    expect(r.headingTo).toEqual([]);
  });

  it("walking towards a vehicle is still not an unknown walk", () => {
    const r = scanWalkEvents(
      rows("BAIG exited Communicare and walked towards Vehicle 1HIB84.")
    );
    expect(r.headingTo).toEqual([]);
  });

  it("a later entry ends the walk", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG and JONES exited Communicare and walked along Cantonment Street.",
        "BAIG and JONES entered Melville Fish and Chips and continued out of sight."
      )
    );
    expect(r.headingTo).toEqual([]);
    expect(r.walkIns).toMatchObject([{ location: "Melville Fish and Chips" }]);
  });
});

describe("the Inside chip: names inside a place, no verb", () => {
  it("reads who is where", () => {
    expect(
      matchPresenceInside(
        "BAIG and JONES inside Communicare, observed speaking to staff."
      )
    ).toEqual({ names: "BAIG and JONES", place: "Communicare" });
  });

  it("puts them there, ending the walk", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG and JONES exited Bull Creek Tavern and walked along Cantonment Street.",
        "BAIG and JONES inside Communicare, observed speaking to staff."
      )
    );
    expect(r.headingTo).toEqual([]);
    expect(r.walkIns).toMatchObject([{ location: "Communicare" }]);
  });

  it("ignores an unwritten place, and sentences about movement", () => {
    expect(
      matchPresenceInside("BAIG inside [location] [observation].")
    ).toBeNull();
    expect(
      matchPresenceInside("BAIG exited Communicare inside Fremantle.")
    ).toBeNull();
  });
});

describe("walking back to a vehicle with no exit written", () => {
  const inside =
    "BAIG JONES entered Chicho Gelato Fremantle and continued out of sight.";
  for (const back of [
    "BAIG JONES walked towards Vehicle 1ORB419.",
    "BAIG JONES walked to Vehicle 1ORB419.",
    "BAIG JONES walked to and entered Vehicle 1ORB419.",
    "BAIG JONES entered Vehicle 1ORB419.",
  ]) {
    it(`takes them out of the place they were inside: ${back}`, () => {
      const r = scanWalkEvents(rows(inside, back));
      expect(r.walkIns).toEqual([]);
      expect(r.placements).toEqual([
        expect.objectContaining({ rego: "1ORB419" }),
      ]);
    });
  }

  it("leaves other people inside", () => {
    const r = scanWalkEvents(
      rows(
        "BAIG and SMITH entered Chicho Gelato Fremantle and continued out of sight.",
        "BAIG walked towards Vehicle 1ORB419."
      )
    );
    expect(r.walkIns).toMatchObject([{ location: "Chicho Gelato Fremantle" }]);
  });
});

describe("the Kinky Lizard sheet (BAIG and UM1)", () => {
  const arrived =
    "Vehicle 1EXP123, BAIG front passenger, unidentified male (UM1) driver, arrived at 902 Canning Highway, APPLECROSS WA (902 Canning Highway) and parked on the street.";
  const exited =
    "BAIG and UM1 exited Vehicle 1EXP123 (Vehicle 1EXP123), walked across the road, entered  Kinky Lizard Cafe on Mews, 28 Moreau Mews, APPLECROSS WA (Kinky Lizard Cafe on Mews) and continued out of sight.";
  const seated =
    "BAIG and UM1 seated inside Kinky Lizard Cafe on Mews with Jason JOHNSON (JOHNSON).";

  it("treats UM1 as a person, like a surname", () => {
    expect(surnameTokens("BAIG and UM1")).toEqual(["BAIG", "UM1"]);
    expect(surnameTokens("unidentified female (UF2) and UC1")).toEqual([
      "UF2",
      "UC1",
    ]);
    // A rego or a vehicle code is not a person.
    expect(surnameTokens("Vehicle 1EXP123, UB1")).toEqual([]);
  });

  it("leaving 'Vehicle <rego> (Vehicle <rego>)' is a walk-in at the café, both people", () => {
    const r = scanWalkEvents(rows(arrived, exited));
    expect(r.walkIns).toMatchObject([
      { names: "BAIG and UM1", location: "Kinky Lizard Cafe on Mews" },
    ]);
  });

  it("the sighting names the café, and lists the person with them", () => {
    expect(matchPresenceInside(seated)).toEqual({
      names: "BAIG and UM1 and JOHNSON",
      place: "Kinky Lizard Cafe on Mews",
    });
    const r = scanWalkEvents(rows(arrived, exited, seated));
    expect(r.walkIns).toMatchObject([
      { location: "Kinky Lizard Cafe on Mews" },
    ]);
  });

  it("a place's own 'and' is kept, a trailing clause is not", () => {
    expect(
      matchPresenceInside("BAIG seated inside Melville Fish and Chips.")
    ).toEqual({ names: "BAIG", place: "Melville Fish and Chips" });
    expect(
      matchPresenceInside(
        "BAIG seated inside Bull Creek Tavern and spoke to staff."
      )
    ).toEqual({ names: "BAIG", place: "Bull Creek Tavern" });
  });
});

describe("scanWalkEvents — exit followed by a meeting, then 'They' get in a vehicle", () => {
  const entered =
    "RAHMAN entered The Lookout Bar Bowling Bites, 1-2/148 The Esplanade, SCARBOROUGH WA (The Lookout Bar Bowling Bites) and continued out of sight.";
  const exitMet =
    "RAHMAN exited The Lookout Bar Bowling Bites and met an unidentified male (UM1) out the front.";
  const gotIn =
    "They walked along The Esplanade, SCARBOROUGH and got into a blue BMW X5, bearing WA registration 1FAD004 (Vehicle 1FAD004).";

  it("reads 'exited X and met ...' as leaving X", () => {
    const scan = scanWalkEvents(rows(entered, exitMet));
    expect(scan.walkIns).toEqual([]);
  });

  it("puts everyone 'They' refers to in the vehicle", () => {
    const scan = scanWalkEvents(rows(entered, `${exitMet}\n\n${gotIn}`));
    expect(scan.walkIns).toEqual([]);
    expect(scan.placements).toMatchObject([
      { name: "RAHMAN", rego: "1FAD004" },
      { name: "UM1", rego: "1FAD004" },
    ]);
  });
});

describe("scanWalkEvents — a plain exit leaves the person on foot", () => {
  const entered =
    "RAHMAN entered The Lookout Bar Bowling Bites, 1-2/148 The Esplanade, SCARBOROUGH WA (The Lookout Bar Bowling Bites) and continued out of sight.";

  it("'exited X, onto The Esplanade and met ...' is departed on foot from X", () => {
    const scan = scanWalkEvents(
      rows(
        entered,
        "RAHMAN exited The Lookout Bar Bowling Bites, onto The Esplanade and met Steven HARRIS (HARRIS)."
      )
    );
    expect(scan.walkIns).toEqual([]);
    expect(scan.headingTo).toMatchObject([
      {
        names: "RAHMAN",
        destination: "[location]",
        from: "The Lookout Bar Bowling Bites",
      },
    ]);
  });

  it("is not on foot when the same sentence gets into a vehicle", () => {
    const scan = scanWalkEvents(
      rows(
        entered,
        "RAHMAN exited The Lookout Bar Bowling Bites and got into a white sedan."
      )
    );
    expect(scan.headingTo).toEqual([]);
  });
});

describe("matchPresenceInside — people with them", () => {
  it("adds 'with John EVANS (EVANS)' to the people inside", () => {
    expect(
      matchPresenceInside(
        "RAHMAN seated at a table inside The Lookout Bar Bowling Bites with John EVANS (EVANS)."
      )
    ).toEqual({
      names: "RAHMAN and EVANS",
      place: "The Lookout Bar Bowling Bites",
    });
  });
  it("adds an unidentified companion by short name", () => {
    expect(
      matchPresenceInside(
        "RAHMAN seated inside The Lookout Bar Bowling Bites with an unidentified male (UM1)."
      )
    ).toEqual({
      names: "RAHMAN and UM1",
      place: "The Lookout Bar Bowling Bites",
    });
  });
  it("leaves names alone when nobody is with them", () => {
    expect(
      matchPresenceInside("RAHMAN seated inside The Lookout Bar Bowling Bites.")
    ).toEqual({ names: "RAHMAN", place: "The Lookout Bar Bowling Bites" });
  });
  it("puts both inside in the scan", () => {
    const scan = scanWalkEvents(
      rows(
        "RAHMAN seated at a table inside The Lookout Bar Bowling Bites with John EVANS (EVANS)."
      )
    );
    expect(scan.walkIns).toMatchObject([
      { names: "RAHMAN and EVANS", location: "The Lookout Bar Bowling Bites" },
    ]);
  });
});

describe("scanWalkEvents — exit 'onto The Esplanade', then into a vehicle with no arrival row", () => {
  const seated =
    "RAHMAN seated at a table inside The Lookout Bar Bowling Bites with John EVANS (EVANS).";
  const exited =
    "RAHMAN and EVANS exited The Lookout Bar Bowling Bites onto The Esplanade and met with Steven TAYLOR (TAYLOR).";
  const gotIn =
    "RAHMAN, EVANS and TAYLOR entered a gold BMW X5 SUV, bearing WA registration 1FAB888 (Vehicle 1FAB888).";

  it("'onto The Esplanade' does not become part of the place left", () => {
    const scan = scanWalkEvents(rows(seated, exited));
    expect(scan.walkIns).toEqual([]);
    expect(scan.headingTo).toMatchObject([
      { names: "RAHMAN and EVANS", from: "The Lookout Bar Bowling Bites" },
    ]);
  });

  it("remembers where they were last logged when they get into the vehicle", () => {
    const scan = scanWalkEvents(rows(seated, exited, gotIn));
    expect(scan.headingTo).toEqual([]);
    expect(scan.placements).toMatchObject([
      { name: "RAHMAN", rego: "1FAB888", at: "The Lookout Bar Bowling Bites" },
      { name: "EVANS", rego: "1FAB888", at: "The Lookout Bar Bowling Bites" },
      { name: "TAYLOR", rego: "1FAB888" },
    ]);
  });
});
