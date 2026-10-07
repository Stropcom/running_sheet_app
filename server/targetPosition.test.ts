import { describe, expect, it } from "vitest";
import {
  locateTarget,
  samePlace,
  vehiclesPeopleCanReach,
  type TargetPositionInput,
} from "@shared/targetPosition";
import {
  extractDepartureAddress,
  scanWalkEvents,
} from "@shared/walkEventPatterns";
import {
  computePendingVehicleArrivals,
  computePendingVehicleDepartures,
} from "./db";

// Reads a whole sheet the way the server does, then locates the target.
function locate(token: string, ...obs: string[]) {
  const rows = obs.map((observation, i) => ({
    id: i + 1,
    sheetId: 1,
    observation,
  }));
  const walk = scanWalkEvents(rows);
  const strip = (d: string) =>
    d
      .replace(/\b(?:driver|sole occupant|front passenger|passenger)\b/gi, "")
      .replace(/\bunseen\s+occupant(?:\/s|s)?\b/gi, "")
      .replace(/\band\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  const input: TargetPositionInput = {
    token,
    arrivals: computePendingVehicleArrivals(rows).map(a => ({
      rego: a.rego,
      names: strip(a.occupantDesc),
      address: a.address,
      rowId: a.rowId,
      outOfSight: a.outOfSight,
    })),
    departures: computePendingVehicleDepartures(rows).map(d => ({
      rego: d.rego,
      names: strip(d.occupantDesc),
      fromAddress: d.fromAddress,
      rowId: d.rowId,
    })),
    walkIns: walk.walkIns,
    headingTo: walk.headingTo,
    placements: walk.placements,
  };
  return locateTarget(input);
}

describe("locateTarget — BAIG's night", () => {
  const arrived =
    "Vehicle 1ORB419, BAIG driver and sole occupant, arrived at 77 Reynolds Rd and parked.";
  const tavernArrive =
    "Vehicle 1HIB84, occupant/s not observed, arrived at Bull Creek Tavern.";
  const seated =
    "BAIG seated at a table having a meal inside Bull Creek Tavern.";
  const out =
    "BAIG exited Bull Creek Tavern and walked towards Vehicle 1HIB84.\nVehicle 1HIB84, BAIG driver and sole occupant, departed Bull Creek Tavern and continued via:";
  const back =
    "Vehicle 1HIB84, BAIG driver and sole occupant, arrived at 77 Reynolds Rd and continued out of sight.";

  it("in a parked vehicle", () => {
    expect(locate("BAIG", arrived)).toMatchObject({
      place: "77 Reynolds Rd",
      state: "vehicle",
      rego: "1ORB419",
    });
  });

  it("inside a place once seen there", () => {
    expect(locate("BAIG", arrived, tavernArrive, seated)).toMatchObject({
      place: "Bull Creek Tavern",
      state: "inside",
    });
  });

  it("departed, from the place he left, with who is in the vehicle", () => {
    expect(locate("BAIG", arrived, tavernArrive, seated, out)).toMatchObject({
      place: "Bull Creek Tavern",
      state: "moving",
      label: "departed in 1HIB84",
      people: ["BAIG"],
      rego: "1HIB84",
    });
  });

  it("lists everyone in the vehicle, the target first", () => {
    const both =
      "BAIG and James JONES exited Bull Creek Tavern and walked towards Vehicle 1HIB84.\nVehicle 1HIB84, JONES driver, BAIG front passenger, departed Bull Creek Tavern and continued via:";
    const r = locate("BAIG", arrived, tavernArrive, seated, both);
    expect(r?.state).toBe("moving");
    expect(r?.people[0]).toBe("BAIG");
    expect(r?.people.length).toBe(2);
  });

  it("out of sight at the next address", () => {
    expect(
      locate("BAIG", arrived, tavernArrive, seated, out, back)
    ).toMatchObject({
      place: "77 Reynolds Rd",
      state: "oos",
      rego: "1HIB84",
    });
  });

  it("walking from a vehicle names where it is parked", () => {
    expect(
      locate(
        "BAIG",
        arrived,
        "BAIG exited the vehicle and walked towards 13 Denford Street."
      )
    ).toMatchObject({
      place: "77 Reynolds Rd",
      state: "walking",
      label: "departed on foot",
    });
  });

  it("null when the target is never mentioned", () => {
    expect(locate("BAIG", "JORDAN entered 13 Denford Street.")).toBeNull();
  });
});

describe("extractDepartureAddress", () => {
  it("reads the place a vehicle left", () => {
    expect(
      extractDepartureAddress(
        "Vehicle 1HIB84, BAIG, departed Bull Creek Tavern and continued via:"
      )
    ).toBe("Bull Creek Tavern");
    expect(
      extractDepartureAddress(
        "Vehicle 1HIB84, unseen occupant/s, departed 77 Reynolds Rd and continued via:"
      )
    ).toBe("77 Reynolds Rd");
  });
});

describe("samePlace", () => {
  it("ignores case and punctuation, and short against full", () => {
    expect(samePlace("Bull Creek Tavern", "bull creek tavern")).toBe(true);
    expect(samePlace("77 Reynolds Rd", "77 Reynolds Rd, BULL CREEK WA")).toBe(
      true
    );
    expect(samePlace("77 Reynolds Rd", "21 Leach Avenue")).toBe(false);
  });
});

describe("vehiclesPeopleCanReach", () => {
  const reynolds = {
    rego: "1HIB84",
    address: "77 Reynolds Rd",
    rowId: 5,
    names: "BAIG",
  };
  const goldsbrough = {
    rego: "1ORB419",
    address: "1 Goldsbrough Street",
    rowId: 8,
    names: "BAIG JONES",
  };

  it("only vehicles where their latest vehicle journey ended", () => {
    const r = vehiclesPeopleCanReach({
      people: "BAIG JONES",
      arrivals: [reynolds, goldsbrough],
      placements: [],
      fallbackPlace: "Chicho Gelato Fremantle",
    });
    expect(r.map(v => v.rego)).toEqual(["1ORB419"]);
  });

  it("keeps every vehicle at that same address", () => {
    const other = {
      rego: "1TG252",
      address: "1 Goldsbrough Street",
      rowId: 9,
      names: "",
    };
    const r = vehiclesPeopleCanReach({
      people: "BAIG",
      arrivals: [reynolds, goldsbrough, other],
      placements: [],
    });
    expect(r.map(v => v.rego).sort()).toEqual(["1ORB419", "1TG252"]);
  });

  it("follows a vehicle they were logged walking to", () => {
    const unseen = { ...reynolds, names: "" };
    const r = vehiclesPeopleCanReach({
      people: "BAIG",
      arrivals: [unseen, goldsbrough],
      placements: [{ name: "BAIG", rego: "1HIB84", rowId: 20 }],
    });
    expect(r.map(v => v.rego)).toEqual(["1HIB84"]);
  });

  it("with no vehicle history, only vehicles at the place they are", () => {
    const r = vehiclesPeopleCanReach({
      people: "SMITH",
      arrivals: [reynolds, goldsbrough],
      placements: [],
      fallbackPlace: "77 Reynolds Rd",
    });
    expect(r.map(v => v.rego)).toEqual(["1HIB84"]);
  });

  it("with nothing to go on, offers them all", () => {
    const r = vehiclesPeopleCanReach({
      people: "SMITH",
      arrivals: [reynolds, goldsbrough],
      placements: [],
    });
    expect(r).toHaveLength(2);
  });
});

describe("getting into another vehicle and departing", () => {
  const entered =
    "BAIG entered Dôme Café - Deep Water Point, 100 The Esplanade, MOUNT PLEASANT (Dôme Café - Deep Water Point) and continued out of sight.";
  const row =
    "BAIG exited Dôme Café - Deep Water Point, walked into the car park and entered the front passenger seat of a red Ford Ranger, bearing WA registration 1EXP123 (Vehicle 1EXP123).\n\nVehicle 1EXP123, BAIG front passenger, unidentified male (UM1) driver, departed Dôme Café - Deep Water Point and continued via:";

  it("he is not left walking", () => {
    const r = scanWalkEvents(
      [entered, row].map((observation, i) => ({
        id: i + 1,
        sheetId: 1,
        observation,
      }))
    );
    expect(r.headingTo).toEqual([]);
    expect(r.walkIns).toEqual([]);
    expect(r.placements).toEqual([
      expect.objectContaining({ name: "BAIG", rego: "1EXP123" }),
    ]);
  });

  it("the departed card has him in it, with the driver", () => {
    const pos = locate("BAIG", entered, row);
    expect(pos).toMatchObject({
      state: "moving",
      rego: "1EXP123",
      place: "Dôme Café - Deep Water Point",
    });
    expect(pos?.people[0]).toBe("BAIG");
    expect(pos?.people.length).toBe(2);
  });

  it.each([
    "BAIG got into Vehicle 1EXP123.",
    "BAIG boarded the front passenger seat of Vehicle 1EXP123.",
    "BAIG climbed into a red Ford Ranger (Vehicle 1EXP123).",
  ])("any wording for getting in: %s", text => {
    const r = scanWalkEvents(
      [entered, text].map((observation, i) => ({
        id: i + 1,
        sheetId: 1,
        observation,
      }))
    );
    expect(r.walkIns).toEqual([]);
    expect(r.placements).toEqual([
      expect.objectContaining({ rego: "1EXP123" }),
    ]);
  });
});

describe("extractDepartureAddress tolerates a doubled and", () => {
  it("drops trailing and", () => {
    expect(
      extractDepartureAddress(
        "Vehicle 1EXP123, BAIG, departed Dôme Café - Deep Water Point and and continued via:"
      )
    ).toBe("Dôme Café - Deep Water Point");
  });
});
