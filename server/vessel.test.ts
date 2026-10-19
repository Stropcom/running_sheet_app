import { describe, expect, it } from "vitest";
import {
  matchVesselBoarding,
  matchVesselDisembark,
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
