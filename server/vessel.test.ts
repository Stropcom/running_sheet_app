import { describe, expect, it } from "vitest";
import {
  matchVesselBoarding,
  matchVesselDisembark,
  stripVesselLeave,
} from "@shared/vesselPatterns";
import { locateTarget } from "@shared/targetPosition";
import { isReadAsMovement, scanWalkEvents } from "@shared/walkEventPatterns";

const rows = (...obs: string[]) =>
  obs.map((observation, i) => ({ id: i + 1, sheetId: 1, observation }));

const ARRIVED =
  "Vehicle 1FAT001, HOGAN driver, arrived at 15 Riverside Road, EAST FREMANTLE WA (15 Riverside Road) and parked on the street.\n\nHOGAN exited the vehicle and walked along the first jetty.";
const BOARDED = "HOGAN boarded a vessel at the end of the jetty.";

describe("matchVesselBoarding", () => {
  it.each([
    ["HOGAN boarded a vessel at the end of the jetty.", "HOGAN", "a vessel"],
    [
      "HOGAN and CORNELL embarked on the white yacht.",
      "HOGAN and CORNELL",
      "the white yacht",
    ],
    ["HOGAN entered a boat at the pens.", "HOGAN", "a boat"],
    [
      "HOGAN climbed aboard a 10 metre catamaran.",
      "HOGAN",
      "a 10 metre catamaran",
    ],
    ["HOGAN stepped onto the dinghy.", "HOGAN", "the dinghy"],
  ])("%s", (text, names, vessel) => {
    expect(matchVesselBoarding(text)).toMatchObject({ names, vessel });
  });

  it("is not fooled by places named after boats", () => {
    expect(
      matchVesselBoarding("HOGAN entered the boat ramp car park.")
    ).toBeNull();
    expect(
      matchVesselBoarding("HOGAN entered the Fremantle Boat Pens.")
    ).toBeNull();
    expect(matchVesselBoarding("HOGAN entered the boat shed.")).toBeNull();
    expect(
      matchVesselBoarding("HOGAN entered a vehicle (Vehicle 1FAT001).")
    ).toBeNull();
  });
});

describe("matchVesselDisembark", () => {
  it.each([
    "HOGAN disembarked from the vessel.",
    "HOGAN disembarked and walked along the jetty.",
    "HOGAN got off the boat.",
    "HOGAN stepped off the yacht onto the jetty.",
    "HOGAN exited the vessel.",
  ])("%s", text => {
    expect(matchVesselDisembark(text)).toMatchObject({ names: "HOGAN" });
  });

  it("ignores leaving a vehicle or a place", () => {
    expect(
      matchVesselDisembark("HOGAN exited the vehicle and walked off.")
    ).toBeNull();
    expect(matchVesselDisembark("HOGAN left the boat ramp.")).toBeNull();
  });
});

describe("scanWalkEvents — on a vessel", () => {
  it("puts him aboard, where he was last logged, and not on foot", () => {
    const scan = scanWalkEvents(rows(ARRIVED, BOARDED));
    expect(scan.walkIns).toEqual([]);
    expect(scan.headingTo).toEqual([]);
    expect(scan.placements).toMatchObject([
      { name: "HOGAN", rego: "", vessel: "a vessel" },
    ]);
  });

  it("takes him out of the place he was inside", () => {
    const scan = scanWalkEvents(
      rows(
        "HOGAN entered Fremantle Sailing Club and continued out of sight.",
        BOARDED
      )
    );
    expect(scan.walkIns).toEqual([]);
    expect(scan.placements[0]).toMatchObject({ vessel: "a vessel" });
  });

  it("disembarking ends it, and a later row elsewhere wins", () => {
    const off = scanWalkEvents(
      rows(ARRIVED, BOARDED, "HOGAN disembarked from the vessel.")
    );
    expect(off.placements.every(p => !p.vessel)).toBe(true);
    const elsewhere = scanWalkEvents(
      rows(BOARDED, "HOGAN entered 5 Smith Street and continued out of sight.")
    );
    expect(elsewhere.placements.every(p => !p.vessel)).toBe(true);
  });

  it("is read as a move, so the tracker doesn't warn", () => {
    expect(isReadAsMovement(BOARDED)).toBe(true);
    expect(isReadAsMovement("HOGAN got off the boat.")).toBe(true);
  });
});

describe("locateTarget — on a vessel", () => {
  const input = (obs: string[], token = "HOGAN") => {
    const scan = scanWalkEvents(rows(...obs));
    return {
      token,
      arrivals: [
        {
          rego: "1FAT001",
          names: "HOGAN",
          address: "15 Riverside Road",
          rowId: 1,
        },
      ],
      departures: [],
      walkIns: scan.walkIns,
      headingTo: scan.headingTo,
      placements: scan.placements,
    };
  };

  it("flags the target on a vessel at the last place logged", () => {
    const pos = locateTarget(input([ARRIVED, BOARDED]));
    expect(pos).toMatchObject({
      state: "vessel",
      label: "on a vessel",
      place: "15 Riverside Road",
      placeIsEstimate: true,
    });
    expect(pos?.people).toEqual(["HOGAN"]);
  });

  it("once he is off, the vessel is gone", () => {
    const pos = locateTarget(
      input([ARRIVED, BOARDED, "HOGAN disembarked from the vessel."])
    );
    expect(pos?.state).not.toBe("vessel");
  });
});

describe("where the vessel is: the latest place logged, not an older one", () => {
  const DRIVO =
    "HOGAN and CORNELL entered DRIVO Carpark and continued out of sight.";
  const DEPART_DRIVO =
    "Vehicle 1FAT001, HOGAN driver, CORNELL front passenger, departed DRIVO Carpark and continued via:";
  const ARRIVE =
    "Vehicle 1FAT001, HOGAN driver, arrived at 15 Riverside Road, EAST FREMANTLE WA (15 Riverside Road) and parked on the street opposite the Left Bank Hotel.\n\nHOGAN exited the vehicle and walked along the boat jetty on the Swan River.";
  const BOARD = "HOGAN boarded the boat in the last pen on the jetty.";

  it("an arrival at an address updates 'last seen', so the boat is there, not at the old car park", () => {
    const scan = scanWalkEvents(rows(DRIVO, DEPART_DRIVO, ARRIVE, BOARD));
    const hogan = scan.placements.find(p => p.name === "HOGAN");
    expect(hogan).toMatchObject({
      vessel: "the boat",
      at: "15 Riverside Road",
    });
  });

  it("the flag position is that address", () => {
    const scan = scanWalkEvents(rows(DRIVO, DEPART_DRIVO, ARRIVE, BOARD));
    const pos = locateTarget({
      token: "HOGAN",
      arrivals: [
        {
          rego: "1FAT001",
          names: "HOGAN",
          address: "15 Riverside Road",
          rowId: 3,
        },
      ],
      departures: [],
      walkIns: scan.walkIns,
      headingTo: scan.headingTo,
      placements: scan.placements,
    });
    expect(pos).toMatchObject({
      state: "vessel",
      place: "15 Riverside Road",
      placeIsEstimate: true,
    });
  });

  it("a departure naming people records where they left from", () => {
    const scan = scanWalkEvents(rows(DRIVO, DEPART_DRIVO));
    expect(scan.placements.find(p => p.name === "HOGAN")?.at).toBe(
      "DRIVO Carpark"
    );
  });
});

describe("getting off a boat and walking: short wording", () => {
  const OFF =
    "HOGAN disembarked from the boat and walked [route] towards [location].";
  it("strips the getting-off clause so the walker is just HOGAN", () => {
    expect(stripVesselLeave(OFF)).toBe(
      "HOGAN walked [route] towards [location]."
    );
    expect(
      stripVesselLeave("HOGAN disembarked and walked along the jetty.")
    ).toBe("HOGAN walked along the jetty.");
    expect(stripVesselLeave("HOGAN got off the yacht and walked away.")).toBe(
      "HOGAN walked away."
    );
    expect(stripVesselLeave("HOGAN walked to the shop.")).toBe(
      "HOGAN walked to the shop."
    );
  });

  it("matchVesselDisembark says what he got off", () => {
    expect(matchVesselDisembark(OFF)).toEqual({
      names: "HOGAN",
      vessel: "the boat",
    });
    expect(matchVesselDisembark("HOGAN disembarked.")).toEqual({
      names: "HOGAN",
      vessel: "",
    });
  });

  it("the logger shows HOGAN on foot after getting off, not a long name", () => {
    const scan = scanWalkEvents(
      rows("HOGAN boarded the boat in the last pen on the jetty.", OFF)
    );
    expect(scan.headingTo).toHaveLength(1);
    expect(scan.headingTo[0]).toMatchObject({
      names: "HOGAN",
      destination: "[location]",
      fromVessel: "the boat",
    });
    expect(scan.placements.every(p => !p.vessel)).toBe(true);
  });

  it("the flag reads 'HOGAN · disembarked, on foot'", () => {
    const scan = scanWalkEvents(
      rows(
        "Vehicle 1FAT001, HOGAN driver, arrived at 15 Riverside Road, EAST FREMANTLE WA (15 Riverside Road) and parked on the street.\n\nHOGAN exited the vehicle and walked along the boat jetty.",
        "HOGAN boarded the boat in the last pen on the jetty.",
        OFF
      )
    );
    const pos = locateTarget({
      token: "HOGAN",
      arrivals: [
        {
          rego: "1FAT001",
          names: "HOGAN",
          address: "15 Riverside Road",
          rowId: 1,
        },
      ],
      departures: [],
      walkIns: scan.walkIns,
      headingTo: scan.headingTo,
      placements: scan.placements,
    });
    expect(pos).toMatchObject({
      state: "walking",
      label: "disembarked, on foot",
      people: ["HOGAN"],
    });
  });
});

describe("walked to the car and got in", () => {
  const BACK =
    "HOGAN disembarked from the boat and walked along the jetty to Vehicle 1FAT001 (Vehicle 1FAT001), and entered via the driver's door.";
  const input = (obs: string[]) => {
    const scan = scanWalkEvents(rows(...obs));
    return {
      token: "HOGAN",
      arrivals: [
        {
          rego: "1FAT001",
          names: "HOGAN",
          address: "15 Riverside Road",
          rowId: 1,
        },
      ],
      departures: [],
      walkIns: scan.walkIns,
      headingTo: scan.headingTo,
      placements: scan.placements,
    };
  };
  const earlier = [
    "Vehicle 1FAT001, HOGAN driver, arrived at 15 Riverside Road, EAST FREMANTLE WA (15 Riverside Road) and parked on the street.\n\nHOGAN exited the vehicle and walked along the boat jetty.",
    "HOGAN boarded the boat in the last pen on the jetty.",
  ];

  it("'and entered via the driver's door' means he is IN the vehicle", () => {
    const scan = scanWalkEvents(rows(...earlier, BACK));
    expect(scan.placements.find(p => p.name === "HOGAN")).toMatchObject({
      rego: "1FAT001",
      inside: true,
    });
  });

  it("the flag says 'in 1FAT001', not 'to 1FAT001'", () => {
    expect(locateTarget(input([...earlier, BACK]))).toMatchObject({
      state: "vehicle",
      label: "in 1FAT001",
      place: "15 Riverside Road",
    });
  });

  it("only walking to it, or 'entered the car park', is still just heading there", () => {
    for (const row of [
      "HOGAN disembarked from the boat and walked along the jetty to Vehicle 1FAT001 (Vehicle 1FAT001).",
      "HOGAN walked towards Vehicle 1FAT001 and entered the car park.",
    ]) {
      const scan = scanWalkEvents(rows(...earlier, row));
      expect(scan.placements.find(p => p.name === "HOGAN")?.inside).toBe(false);
    }
  });
});
