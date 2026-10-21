import { describe, expect, it } from "vitest";
import {
  transitSignIconOf,
  expandStopName,
  transitFullAddress,
  transitKindOfPlace,
  transitLabel,
  transitPlaceFromGoogle,
} from "@shared/transitPlace";
import {
  matchTransitAlighting,
  matchTransitBoarding,
  stripTransitAlighting,
  transitPlaceAfter,
} from "@shared/transitPatterns";
import { locateTarget, targetEmoji } from "@shared/targetPosition";
import { chooseFlagMarker, markerFitsState } from "@shared/flagMarker";
import { isReadAsMovement, scanWalkEvents } from "@shared/walkEventPatterns";

const rows = (...obs: string[]) =>
  obs.map((observation, i) => ({ id: i + 1, sheetId: 1, observation }));

const STOP = "Bus Stop Stirling Highway After Eric Street";
const STOP_FULL = `${STOP}, NEDLANDS WA (${STOP})`;
const STATION = "Fremantle Train Station";
const STATION_FULL = `${STATION}, FREMANTLE WA (${STATION})`;

describe("stop and station wording", () => {
  it("expands street abbreviations in a stop name only where it is safe", () => {
    expect(expandStopName("Stirling Hwy After Eric St")).toBe(
      "Stirling Highway After Eric Street"
    );
    expect(expandStopName("St Kilda Rd Stop 12")).toBe("St Kilda Road Stop 12");
    expect(expandStopName("Hay St")).toBe("Hay Street");
    expect(expandStopName("Dr Smith Ave")).toBe("Dr Smith Avenue");
  });

  it("labels a bus stop 'Bus Stop <where>'", () => {
    expect(
      transitPlaceFromGoogle("Stirling Hwy After Eric St", [
        "bus_station",
        "transit_station",
        "point_of_interest",
      ])
    ).toEqual({ kind: "bus", label: STOP });
    // Google's own "Bus Stop …" wording is not doubled.
    expect(transitLabel("bus", "Bus Stop Hay St Stand 5")).toBe(
      "Bus Stop Hay Street Stand 5"
    );
    expect(transitLabel("bus", "Hay St Bus Stop")).toBe("Bus Stop Hay Street");
  });

  it("labels a station '<Place> Train Station'", () => {
    for (const name of [
      "Fremantle Station",
      "Fremantle Railway Station",
      "Fremantle Train Station",
      "Fremantle",
    ]) {
      expect(transitPlaceFromGoogle(name, ["train_station"])).toEqual({
        kind: "train",
        label: STATION,
      });
    }
    expect(
      transitPlaceFromGoogle("Perth Underground Station", ["subway_station"])
    ).toEqual({ kind: "train", label: "Perth Underground Train Station" });
  });

  it("a train type wins when a place is both", () => {
    expect(
      transitPlaceFromGoogle("Perth Station", ["bus_station", "train_station"])
        ?.kind
    ).toBe("train");
  });

  it("reads a bare transit_station by its name, and never guesses otherwise", () => {
    expect(
      transitPlaceFromGoogle("Claremont Station", ["transit_station"])?.kind
    ).toBe("train");
    expect(
      transitPlaceFromGoogle("Hay St Stand 5", ["transit_station"])?.kind
    ).toBe("bus");
    // A bare transit_station with no rail word is a bus stop.
    expect(transitPlaceFromGoogle("Somewhere", ["transit_station"])?.kind).toBe(
      "bus"
    );
    // No types at all, but an agency stop name.
    expect(
      transitPlaceFromGoogle("Grange Dr After Gascoyne Wy", [
        "point_of_interest",
      ])
    ).toEqual({
      kind: "bus",
      label: "Bus Stop Grange Drive After Gascoyne Way",
    });
    expect(
      transitPlaceFromGoogle("Opposite Page Books", ["book_store"])
    ).toBeNull();
    expect(
      transitPlaceFromGoogle("Bicton Tavern", ["bar", "point_of_interest"])
    ).toBeNull();
    expect(transitPlaceFromGoogle("", ["bus_station"])).toBeNull();
    expect(transitPlaceFromGoogle("X", undefined)).toBeNull();
  });

  it("recognises a written stop or station, and not a police station", () => {
    expect(transitKindOfPlace(STOP)).toBe("bus");
    expect(transitKindOfPlace(STATION)).toBe("train");
    expect(transitKindOfPlace("Perth Busport")).toBe("bus");
    expect(transitKindOfPlace("Fremantle Police Station")).toBeNull();
    expect(transitKindOfPlace("Caltex Station")).toBeNull();
    expect(transitKindOfPlace("27 Olding Way")).toBeNull();
  });
});

describe("a tapped stop's full address", () => {
  it("is '<label>, SUBURB WA (<label>)'", () => {
    expect(
      transitFullAddress(STOP, "Stirling Hwy, Nedlands WA 6009, Australia")
    ).toBe(STOP_FULL);
    expect(
      transitFullAddress(STATION, "Elder Pl, Fremantle WA 6160, Australia")
    ).toBe(STATION_FULL);
  });

  it("leaves a number-led address to the usual wording, and never guesses", () => {
    expect(
      transitFullAddress(
        STATION,
        "1 Phillimore St, Fremantle WA 6160, Australia"
      )
    ).toBeNull();
    expect(transitFullAddress(STATION, "")).toBeNull();
    expect(transitFullAddress(STATION, "Somewhere, Australia")).toBeNull();
  });
});

describe("matchTransitBoarding", () => {
  it.each([
    ["HOGAN boarded a bus at Bus Stop X.", "HOGAN", "a bus"],
    ["HOGAN got on the train.", "HOGAN", "the train"],
    ["HOGAN got onto the 998 bus.", "HOGAN", "the 998 bus"],
    ["HOGAN stepped aboard a train.", "HOGAN", "a train"],
    ["HOGAN entered the bus.", "HOGAN", "the bus"],
    [
      "HOGAN climbed on board the Armadale line train.",
      "HOGAN",
      "the Armadale line train",
    ],
    ["HOGAN hopped on a tram.", "HOGAN", "a tram"],
    ["HOGAN seated on the train.", "HOGAN", "the train"],
    ["HOGAN sat in the bus.", "HOGAN", "the bus"],
    ["HOGAN and CORNELL boarded the train.", "HOGAN and CORNELL", "the train"],
    ["HOGAN travelling on the bus.", "HOGAN", "the bus"],
  ])("%s", (text, names, transit) => {
    expect(matchTransitBoarding(text)).toMatchObject({ names, transit });
  });

  it("is not fooled by places and things named after transport", () => {
    for (const text of [
      "HOGAN entered the train station.",
      "HOGAN entered the bus station.",
      "HOGAN seated at the bus stop.",
      "HOGAN sat in the bus shelter.",
      "HOGAN walked along the train line.",
      "HOGAN entered the shopping centre and the bus.",
      "HOGAN entered a vehicle (Vehicle 1FAT001).",
    ]) {
      expect(matchTransitBoarding(text)).toBeNull();
    }
  });

  it("reads the mode and where they boarded", () => {
    expect(
      matchTransitBoarding(`HOGAN boarded a bus at ${STOP_FULL}.`)
    ).toMatchObject({ mode: "bus", place: STOP_FULL });
    expect(
      matchTransitBoarding(
        `HOGAN boarded the train at ${STATION_FULL} and sat down.`
      )
    ).toMatchObject({ mode: "train", place: STATION_FULL });
    expect(matchTransitBoarding("HOGAN boarded a tram.")?.mode).toBe("tram");
    expect(matchTransitBoarding("HOGAN got on a bus.")?.place).toBe("");
  });
});

describe("matchTransitAlighting", () => {
  it.each([
    "HOGAN alighted from the bus.",
    "HOGAN got off the train.",
    "HOGAN disembarked from the train at Perth Train Station.",
    "HOGAN exited the bus.",
    "HOGAN stepped off the tram.",
    "HOGAN left the bus.",
    "HOGAN got out of the bus.",
    "HOGAN departed the train.",
  ])("%s", text => {
    expect(matchTransitAlighting(text)).toMatchObject({ names: "HOGAN" });
  });

  it("is not fooled by places", () => {
    for (const text of [
      "HOGAN left the bus stop.",
      "HOGAN exited the train station.",
      "HOGAN got off at the bus stop.",
    ]) {
      expect(matchTransitAlighting(text)).toBeNull();
    }
  });

  it("a bare 'alighted' counts only for someone already aboard", () => {
    expect(matchTransitAlighting("HOGAN alighted and walked on.")).toBeNull();
    expect(
      matchTransitAlighting("HOGAN alighted and walked on.", () => true)
    ).toMatchObject({ names: "HOGAN", transit: "" });
  });

  it("reads where they got off", () => {
    expect(
      matchTransitAlighting(`HOGAN alighted from the bus at ${STOP_FULL}.`)
    ).toMatchObject({ transit: "the bus", mode: "bus", place: STOP_FULL });
  });

  it("cuts the clause (and its place) out so the rest reads as walking", () => {
    expect(
      stripTransitAlighting(
        `HOGAN alighted from the bus at ${STOP_FULL} and walked [route] towards [location].`
      )
    ).toBe("HOGAN walked [route] towards [location].");
    expect(
      stripTransitAlighting("HOGAN got off the train and walked on.")
    ).toBe("HOGAN walked on.");
  });

  it("finds a place after the vehicle, with or without a bracket", () => {
    expect(transitPlaceAfter(` at ${STOP_FULL} and walked`)).toMatchObject({
      place: STOP_FULL,
    });
    expect(
      transitPlaceAfter(" at Perth Train Station and walked")
    ).toMatchObject({ place: "Perth Train Station" });
    expect(transitPlaceAfter(" and walked").place).toBe("");
  });
});

describe("scanWalkEvents — buses and trains", () => {
  const BOARD_BUS = `HOGAN boarded a bus at ${STOP_FULL}.`;

  it("puts a person on the bus, at the stop they boarded", () => {
    const { placements, walkIns } = scanWalkEvents(
      rows(
        `HOGAN entered 5 Smith Street and continued out of sight.`,
        BOARD_BUS
      )
    );
    expect(placements.find(p => p.name === "HOGAN")).toMatchObject({
      transit: "a bus",
      rego: "",
      at: STOP,
    });
    // No longer inside the place an earlier row put him.
    expect(walkIns).toHaveLength(0);
  });

  it("is not read as being inside 'the bus'", () => {
    const { walkIns } = scanWalkEvents(rows("HOGAN entered the bus."));
    expect(walkIns).toHaveLength(0);
  });

  it("a later row puts him somewhere else", () => {
    const { placements } = scanWalkEvents(
      rows(
        BOARD_BUS,
        "HOGAN entered 5 Smith Street, PERTH WA (5 Smith Street) and continued out of sight."
      )
    );
    expect(placements.every(p => !p.transit)).toBe(true);
  });

  it("getting off puts him on foot from the stop he got off at", () => {
    const { headingTo, placements } = scanWalkEvents(
      rows(BOARD_BUS, `HOGAN alighted from the bus at ${STATION_FULL}.`)
    );
    expect(headingTo).toHaveLength(1);
    expect(headingTo[0]).toMatchObject({
      names: "HOGAN",
      from: STATION,
      destination: "[location]",
      fromTransit: "the bus",
    });
    expect(placements.every(p => !p.transit)).toBe(true);
  });

  it("getting off and walking keeps the stop and reads the walk", () => {
    const { headingTo } = scanWalkEvents(
      rows(
        BOARD_BUS,
        `HOGAN got off the bus at ${STOP_FULL} and walked along Hay Street towards 12 Hay Street.`
      )
    );
    expect(headingTo[0]).toMatchObject({
      names: "HOGAN",
      from: STOP,
      fromTransit: "the bus",
    });
    expect(headingTo[0].destination).toMatch(/12 Hay Street/);
  });

  it("a bare 'alighted' leaves the bus, and a bare 'disembarked' still leaves a boat", () => {
    const bus = scanWalkEvents(
      rows(BOARD_BUS, "HOGAN alighted and walked on.")
    );
    expect(bus.headingTo[0]?.fromTransit).toBe("a bus");
    const boat = scanWalkEvents(
      rows("HOGAN boarded a vessel at the jetty.", "HOGAN disembarked.")
    );
    expect(boat.headingTo.every(h => !h.fromTransit)).toBe(true);
  });

  it("two people board together", () => {
    const { placements } = scanWalkEvents(
      rows(`HOGAN and CORNELL boarded the train at ${STATION_FULL}.`)
    );
    expect(placements.map(p => p.name).sort()).toEqual(["CORNELL", "HOGAN"]);
    expect(placements.every(p => p.transit === "the train")).toBe(true);
  });

  it("a vehicle's own sentence is never a person boarding", () => {
    const { placements } = scanWalkEvents(
      rows("Vehicle 1FAT001, HOGAN driver, travelled on the bus lane.")
    );
    expect(placements.every(p => !p.transit)).toBe(true);
  });

  it("is read as a move, so the tracker doesn't warn", () => {
    expect(isReadAsMovement(BOARD_BUS)).toBe(true);
    expect(isReadAsMovement("HOGAN got off the train.")).toBe(true);
  });
});

describe("locateTarget — on a bus or train", () => {
  const input = (obs: string[], token = "HOGAN") => {
    const scan = scanWalkEvents(rows(...obs));
    return {
      token,
      arrivals: [],
      departures: [],
      walkIns: scan.walkIns,
      headingTo: scan.headingTo,
      placements: scan.placements,
    };
  };

  it("flags the target on the bus at the stop he boarded, as a guess", () => {
    const pos = locateTarget(input([`HOGAN boarded a bus at ${STOP_FULL}.`]));
    expect(pos).toMatchObject({
      state: "transit",
      label: "on a bus",
      place: STOP,
      placeIsEstimate: true,
      transitMode: "bus",
    });
    expect(targetEmoji("transit", pos?.transitMode)).toBe("🚌");
  });

  it("a train and a tram get their own emoji", () => {
    expect(targetEmoji("transit", "train")).toBe("🚆");
    expect(targetEmoji("transit", "tram")).toBe("🚋");
    const pos = locateTarget(
      input([`HOGAN boarded the train at ${STATION_FULL}.`])
    );
    expect(pos).toMatchObject({ label: "on the train", transitMode: "train" });
  });

  it("after getting off he is on foot, 'alighted, on foot', at that stop", () => {
    const pos = locateTarget(
      input([
        `HOGAN boarded a bus at ${STOP_FULL}.`,
        `HOGAN alighted from the bus at ${STATION_FULL}.`,
      ])
    );
    expect(pos).toMatchObject({
      state: "walking",
      label: "alighted, on foot",
      place: STATION,
    });
  });
});

describe("the flag on a stop's marker", () => {
  it("never lands on a boat marker", () => {
    expect(markerFitsState("boat", "transit")).toBe(false);
    expect(markerFitsState("place", "transit")).toBe(true);
    expect(markerFitsState("vehicle", "transit")).toBe(true);
  });

  it("prefers the place marker (the stop) when several share the address", () => {
    const base = {
      lat: 0,
      lng: 0,
      label: null,
      address: null,
      operationId: 1,
    };
    const choice = chooseFlagMarker(
      [
        { ...base, id: 1, icon: "sedan" },
        { ...base, id: 2, icon: "house_filled" },
      ],
      { state: "transit" }
    );
    expect(choice?.marker.id).toBe(2);
  });
});

describe("no postcode and no 'Australia' in a numberless place's address", () => {
  it("is '<name>, SUBURB WA (<name>)' for any numberless place", () => {
    expect(
      transitFullAddress(
        "Bus Stop Grange Drive After Gascoyne Way",
        "Cooloongup WA 6168, Australia"
      )
    ).toBe(
      "Bus Stop Grange Drive After Gascoyne Way, COOLOONGUP WA (Bus Stop Grange Drive After Gascoyne Way)"
    );
    expect(
      transitFullAddress(
        "Bibra Lake Reserve",
        "Progress Dr, Bibra Lake WA 6163, Australia"
      )
    ).toBe("Bibra Lake Reserve, BIBRA LAKE WA (Bibra Lake Reserve)");
  });

  it("leaves numbered addresses and intersections to the usual wording", () => {
    expect(
      transitFullAddress(
        "Bicton Tavern",
        "1 Point Walter Rd, Bicton WA 6157, Australia"
      )
    ).toBeNull();
    expect(
      transitFullAddress(
        "Canning River Cafe",
        "Kent St &, Queens Park Rd, Wilson WA 6107, Australia"
      )
    ).toBeNull();
  });
});

describe("expandStopName: Way", () => {
  it("writes Wy in full", () => {
    expect(expandStopName("Grange Dr After Gascoyne Wy")).toBe(
      "Grange Drive After Gascoyne Way"
    );
  });
});

describe("arrived on foot", () => {
  const STOP2 = "Bus Stop Grange Drive After Gascoyne Way";
  const FULL2 = `${STOP2}, COOLOONGUP WA (${STOP2})`;

  it("puts a walker at the place, like a walk-in", () => {
    const { walkIns, headingTo } = scanWalkEvents(
      rows(
        "ROCHA exited 7 Mariner Place and walked along Marina Place towards Mataitai Loop.",
        `ROCHA arrived on foot at ${FULL2}.`
      )
    );
    expect(walkIns).toHaveLength(1);
    expect(walkIns[0]).toMatchObject({ names: "ROCHA", location: STOP2 });
    expect(headingTo).toHaveLength(0);
  });

  it("then boarding a bus takes him off the stop", () => {
    const { walkIns, placements } = scanWalkEvents(
      rows(
        `ROCHA arrived on foot at ${FULL2}.`,
        `ROCHA boarded a bus at ${STOP2}.`
      )
    );
    expect(walkIns).toHaveLength(0);
    expect(placements.find(p => p.name === "ROCHA")?.transit).toBe("a bus");
  });

  it("needs 'on foot': a vehicle's arrival is not a person walking", () => {
    const { walkIns } = scanWalkEvents(
      rows(
        "Vehicle 1ROC85, ROCHA driver, arrived at 7 Mariner Place, MINDARIE WA (7 Mariner Place) and parked."
      )
    );
    expect(walkIns).toHaveLength(0);
    expect(isReadAsMovement(`ROCHA arrived on foot at ${FULL2}.`)).toBe(true);
  });
});

describe("the sign marker for a stop or station", () => {
  it("is the bus stop sign or the train station sign", () => {
    expect(transitSignIconOf("Bus Stop Grange Drive After Gascoyne Way")).toBe(
      "bus_stop"
    );
    expect(transitSignIconOf("Fremantle Train Station")).toBe("train_station");
    expect(transitSignIconOf("Perth Busport")).toBe("bus_stop");
  });

  it("is nothing for any other place", () => {
    expect(transitSignIconOf("27 Olding Way")).toBeNull();
    expect(transitSignIconOf("Fremantle Police Station")).toBeNull();
    expect(transitSignIconOf("")).toBeNull();
  });
});
