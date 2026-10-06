import { describe, expect, it } from "vitest";
import {
  cleanWalkerNames,
  extractExitDestination,
  isReadAsMovement,
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
    ).toEqual({ walkIns: [], headingTo: [] });
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
