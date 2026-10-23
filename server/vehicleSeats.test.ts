import { describe, expect, it } from "vitest";
import {
  entrySeat,
  seatedOccupantWording,
  seatsInWording,
  seatsOf,
} from "@shared/vehicleSeats";
import {
  scanWalkEvents,
  vehicleOccupants,
  type ScannedPlacement,
} from "@shared/walkEventPatterns";
import { extractOccupantNames } from "@shared/occupantNames";

describe("entrySeat: the seat a sentence says someone got into", () => {
  it("reads the door or seat named after getting in", () => {
    const cases: [string, string | null][] = [
      [
        "IBARRA entered Vehicle 1MEN83 via the front passenger door.",
        "front passenger",
      ],
      [
        "IBARRA entered the front passenger seat of Vehicle 1MEN83.",
        "front passenger",
      ],
      ["IBARRA entered via the front left door.", "front passenger"],
      [
        "IBARRA got into the passenger seat of Vehicle 1MEN83.",
        "front passenger",
      ],
      ["IBARRA entered the rear passenger seat.", "rear passenger"],
      ["IBARRA got into the back seat of Vehicle 1MEN83.", "rear passenger"],
      ["IBARRA entered via the rear left door.", "rear passenger"],
      ["IBARRA entered Vehicle 1MEN83 via the driver's door.", "driver"],
      ["IBARRA entered the driver's seat.", "driver"],
    ];
    for (const [text, seat] of cases) expect(entrySeat(text), text).toBe(seat);
  });

  it("gives no seat when the wording does not say which", () => {
    for (const text of [
      "IBARRA entered Vehicle 1MEN83.",
      "IBARRA entered the front seat of Vehicle 1MEN83.",
      "IBARRA entered via the passenger door.",
      "IBARRA placed a suitcase in the boot, then entered Vehicle 1MEN83.",
      "IBARRA walked to Vehicle 1MEN83.",
    ])
      expect(entrySeat(text), text).toBeNull();
  });

  it("is not fooled by the boot, or by a seat said before getting in", () => {
    expect(
      entrySeat(
        "IBARRA placed a suitcase in the rear door of the boot, then entered via the front passenger door."
      )
    ).toBe("front passenger");
    expect(
      entrySeat("The driver waited while IBARRA entered Vehicle 1MEN83.")
    ).toBeNull();
  });

  it("gives none when two people got in (they cannot be told apart)", () => {
    expect(
      entrySeat(
        "IBARRA entered via the front passenger door and MENON entered via the driver's door."
      )
    ).toBeNull();
  });
});

describe("seatsInWording: seats from how occupants were written", () => {
  it("reads each role to the person before it", () => {
    expect(seatsInWording("MENON driver and sole occupant")).toEqual([
      { name: "MENON", seat: "driver" },
    ]);
    expect(
      seatsInWording(
        "BAIG driver UM1 front passenger and JOHNSON rear passenger"
      )
    ).toEqual([
      { name: "BAIG", seat: "driver" },
      { name: "UM1", seat: "front passenger" },
      { name: "JOHNSON", seat: "rear passenger" },
    ]);
    expect(
      seatsInWording("HOGAN driver, Denise HOLLY (HOLLY) front passenger")
    ).toEqual([
      { name: "HOGAN", seat: "driver" },
      { name: "Denise HOLLY (HOLLY)", seat: "front passenger" },
    ]);
    expect(seatsInWording("unseen occupant/s")).toEqual([]);
  });
});

const ARRIVAL =
  "Vehicle 1MEN83, MENON driver and sole occupant, arrived at Terminal 4, Perth Airport WA (Terminal 4).";
const ENTRY =
  "Daniel Tomas IBARRA (IBARRA), place a suitcase in the boot, then entered Vehicle 1MEN83 via the front passenger door.";

function wordingAfter(rows: string[], descRowId = 1) {
  const scan = scanWalkEvents(
    rows.map((observation, i) => ({ id: i + 1, sheetId: 1, observation }))
  );
  const desc = "MENON driver and sole occupant";
  const self = {
    rego: "1MEN83",
    rowId: descRowId,
    names: extractOccupantNames(desc),
  };
  const occupants = vehicleOccupants(self, [], scan.placements, [self]);
  return {
    scan,
    occupants,
    wording: seatedOccupantWording({
      desc,
      descRowId,
      rego: "1MEN83",
      occupants,
      placements: scan.placements,
    }),
  };
}

describe("the departure wording with seats", () => {
  it("MENON is the driver and IBARRA the front passenger (the arrival, then getting in)", () => {
    const { scan, wording } = wordingAfter([ARRIVAL, ENTRY]);
    expect(scan.placements).toEqual([
      expect.objectContaining({ rego: "1MEN83", seat: "front passenger" }),
    ]);
    expect(wording).toBe(
      "MENON driver and Daniel Tomas IBARRA (IBARRA) front passenger"
    );
  });

  it("a rear passenger is a rear passenger", () => {
    const { wording } = wordingAfter([
      ARRIVAL,
      "IBARRA entered Vehicle 1MEN83 via the rear passenger door.",
    ]);
    expect(wording).toBe("MENON driver and IBARRA rear passenger");
  });

  it("the seat stays until a later row changes it", () => {
    // a later row that names them in the car without a seat keeps it
    const kept = wordingAfter([
      ARRIVAL,
      "IBARRA entered Vehicle 1MEN83 via the front passenger door.",
      "Vehicle 1MEN83, MENON and IBARRA, departed Terminal 4 and continued via:",
    ]);
    expect(kept.wording).toBe("MENON driver and IBARRA front passenger");
    // a later row that says a different seat changes it
    const changed = wordingAfter([
      ARRIVAL,
      "IBARRA entered Vehicle 1MEN83 via the front passenger door.",
      "Vehicle 1MEN83, MENON driver and IBARRA rear passenger, departed Terminal 4 and continued via:",
    ]);
    expect(changed.wording).toBe("MENON driver and IBARRA rear passenger");
  });

  it("someone who gets in with no seat said has none — nobody's seat is guessed", () => {
    const { wording } = wordingAfter([
      ARRIVAL,
      "IBARRA entered Vehicle 1MEN83.",
    ]);
    expect(wording).toBe("MENON driver and IBARRA");
  });

  it("two people getting in at once get no seats", () => {
    const { scan } = wordingAfter([
      ARRIVAL,
      "IBARRA and JOHNSON entered Vehicle 1MEN83 via the rear passenger door.",
    ]);
    expect(scan.placements.every(p => !p.seat)).toBe(true);
  });

  it("a person is not given a seat after they have left the vehicle", () => {
    const { occupants, wording } = wordingAfter([
      ARRIVAL,
      "IBARRA entered Vehicle 1MEN83 via the front passenger door.",
      "IBARRA exited Vehicle 1MEN83 and walked towards 12 Smith Street.",
    ]);
    expect(occupants).toEqual(["MENON"]);
    expect(wording).toBeNull(); // one occupant: the usual wording
  });

  it("one occupant, or no seat anywhere, keeps the usual wording", () => {
    expect(
      seatedOccupantWording({
        desc: "",
        descRowId: 1,
        rego: "1MEN83",
        occupants: ["MENON"],
        placements: [],
      })
    ).toBeNull();
    expect(
      seatedOccupantWording({
        desc: "unseen occupant/s",
        descRowId: 1,
        rego: "1MEN83",
        occupants: ["MENON", "IBARRA"],
        placements: [],
      })
    ).toBeNull();
  });
});

describe("seatsOf: a seat holds one person, the newer row wins", () => {
  const p = (name: string, rowId: number, seat: ScannedPlacement["seat"]) => ({
    name,
    rego: "1MEN83",
    rowId,
    seat,
  });
  it("a newer driver takes the seat from the older one", () => {
    const seats = seatsOf({
      desc: "MENON driver",
      descRowId: 1,
      rego: "1MEN83",
      occupants: ["MENON", "IBARRA"],
      placements: [p("IBARRA", 2, "driver")],
    });
    expect(seats.get("IBARRA")).toBe("driver");
    expect(seats.has("MENON")).toBe(false);
  });

  it("two stated at the same row keep neither", () => {
    const seats = seatsOf({
      desc: "MENON driver, IBARRA driver",
      descRowId: 1,
      rego: "1MEN83",
      occupants: ["MENON", "IBARRA"],
      placements: [],
    });
    expect(seats.size).toBe(0);
  });

  it("several people can be rear passengers", () => {
    const seats = seatsOf({
      desc: "MENON driver",
      descRowId: 1,
      rego: "1MEN83",
      occupants: ["MENON", "IBARRA", "JOHNSON"],
      placements: [
        p("IBARRA", 2, "rear passenger"),
        p("JOHNSON", 3, "rear passenger"),
      ],
    });
    expect(seats.get("IBARRA")).toBe("rear passenger");
    expect(seats.get("JOHNSON")).toBe("rear passenger");
  });

  it("a seat from another vehicle is ignored", () => {
    const seats = seatsOf({
      desc: "",
      descRowId: 1,
      rego: "1MEN83",
      occupants: ["IBARRA", "MENON"],
      placements: [
        { name: "IBARRA", rego: "1XYZ99", rowId: 2, seat: "driver" },
      ],
    });
    expect(seats.size).toBe(0);
  });
});

describe("getting into a seat with no vehicle named", () => {
  const FORUM =
    "Vehicle 1MEN83, MENON driver and sole occupant, arrived at Belmont Forum, 227 Belmont Avenue, CLOVERDALE WA (Belmont Forum) parked in the car park.";
  const ENTER_SEAT =
    "Peter James LANGLEY (LANGLEY) entered the front passenger seat.";

  it("the parked vehicle: the arrival and the entry in one row", () => {
    const { scan, wording, occupants } = wordingAfter([
      FORUM + "\n\n" + ENTER_SEAT,
    ]);
    expect(scan.placements).toEqual([
      expect.objectContaining({
        name: "Peter James LANGLEY (LANGLEY)",
        rego: "1MEN83",
        seat: "front passenger",
      }),
    ]);
    expect(occupants).toEqual(["MENON", "Peter James LANGLEY (LANGLEY)"]);
    expect(wording).toBe(
      "MENON driver and Peter James LANGLEY (LANGLEY) front passenger"
    );
  });

  it("the entry in a later row, while the vehicle is still the one parked", () => {
    const { wording } = wordingAfter([FORUM, ENTER_SEAT]);
    expect(wording).toBe(
      "MENON driver and Peter James LANGLEY (LANGLEY) front passenger"
    );
  });

  it("works for the rear passenger and the driver's seat too", () => {
    expect(
      wordingAfter([FORUM, "LANGLEY got into the rear passenger seat."]).wording
    ).toBe("MENON driver and LANGLEY rear passenger");
  });

  it("is not read when the vehicle has already left", () => {
    const { scan } = wordingAfter([
      FORUM,
      "Vehicle 1MEN83, MENON driver and sole occupant, departed Belmont Forum and continued via:",
      ENTER_SEAT,
    ]);
    // (the departure row itself still puts MENON in the vehicle; LANGLEY is not)
    expect(scan.placements.some(p => /LANGLEY/.test(p.name))).toBe(false);
  });

  it("is not read when no seat or door is stated, or no vehicle is parked", () => {
    expect(
      wordingAfter([FORUM, "LANGLEY entered the car park."]).scan.placements
    ).toEqual([]);
    expect(
      wordingAfter([FORUM, "LANGLEY entered the front seat."]).scan.placements
    ).toEqual([]);
    expect(
      scanWalkEvents([{ id: 1, sheetId: 1, observation: ENTER_SEAT }])
        .placements
    ).toEqual([]);
  });

  it("with two vehicles parked, only the one the row was just about", () => {
    const two = scanWalkEvents(
      [
        "Vehicle 1AAA11, SMITH driver and sole occupant, arrived at 1 Smith Street, PERTH WA (1 Smith Street).",
        FORUM + "\n\n" + ENTER_SEAT,
      ].map((observation, i) => ({ id: i + 1, sheetId: 1, observation }))
    );
    expect(two.placements).toEqual([
      expect.objectContaining({ rego: "1MEN83", seat: "front passenger" }),
    ]);
    // a later row, with both parked and neither just mentioned: nothing guessed
    const later = scanWalkEvents(
      [
        "Vehicle 1AAA11, SMITH driver and sole occupant, arrived at 1 Smith Street, PERTH WA (1 Smith Street).",
        FORUM,
        ENTER_SEAT,
      ].map((observation, i) => ({ id: i + 1, sheetId: 1, observation }))
    );
    expect(later.placements).toEqual([]);
  });
});

describe("walked to the vehicle and got into a seat (the Rowing Pavilion row)", () => {
  const ARRIVE =
    "Vehicle 1MEN83, MENON driver and sole occupant, arrived at The Rowing Pavilion and stopped out the front.";
  const WALK_IN =
    "IBARRA exited The Rowing Pavilion, walked to Vehicle 1MEN83 (Vehicle 1MEN83), and entered the front passenger seat.";

  it("puts IBARRA in the vehicle as the front passenger", () => {
    const { scan, wording, occupants } = wordingAfter([ARRIVE, WALK_IN]);
    expect(scan.placements).toEqual([
      expect.objectContaining({
        name: "IBARRA",
        rego: "1MEN83",
        inside: true,
        seat: "front passenger",
      }),
    ]);
    expect(occupants).toEqual(["MENON", "IBARRA"]);
    expect(wording).toBe("MENON driver and IBARRA front passenger");
  });

  it("walking only towards the vehicle still gives no seat and is not 'inside'", () => {
    const { scan } = wordingAfter([
      ARRIVE,
      "IBARRA exited The Rowing Pavilion and walked towards Vehicle 1MEN83.",
    ]);
    expect(scan.placements[0]).toEqual(
      expect.objectContaining({ inside: false })
    );
    expect(scan.placements[0].seat).toBeUndefined();
  });

  it("driver's door and rear seat work the same way", () => {
    expect(
      wordingAfter([
        ARRIVE,
        "IBARRA exited The Rowing Pavilion, walked to Vehicle 1MEN83 (Vehicle 1MEN83), and entered the rear passenger seat.",
      ]).wording
    ).toBe("MENON driver and IBARRA rear passenger");
  });
});
