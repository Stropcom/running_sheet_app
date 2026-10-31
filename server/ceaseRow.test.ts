import { describe, expect, it } from "vitest";
import {
  CEASE_OPENING,
  ceaseMembers,
  ceasePlaceFor,
  ceasePlaceOf,
  ceaseRowText,
  lastSurveillancePlace,
} from "@shared/ceaseRow";
import type { TargetPosition } from "@shared/targetPosition";

const pos = (over: Partial<TargetPosition>): TargetPosition => ({
  place: "12 Smith Street",
  state: "inside",
  label: "inside",
  people: ["BAIG"],
  rowId: 1,
  ...over,
});

const roster = (entries: { cin: string; isTeamLeader?: boolean }[]) =>
  JSON.stringify(entries.map(e => ({ hasImages: false, ...e })));

describe("the place on a ceased row", () => {
  it("is where he was last logged, when he is at a place", () => {
    expect(ceasePlaceOf(pos({ state: "inside" }))).toBe("12 Smith Street");
    expect(ceasePlaceOf(pos({ state: "vehicle", rego: "1ABC123" }))).toBe(
      "12 Smith Street"
    );
  });

  it("is left blank when he is moving, or the place is a guess, or there is none", () => {
    for (const state of ["moving", "walking", "transit", "vessel"] as const)
      expect(ceasePlaceOf(pos({ state }))).toBeNull();
    expect(ceasePlaceOf(pos({ placeIsEstimate: true }))).toBeNull();
    expect(ceasePlaceOf(pos({ place: null }))).toBeNull();
    expect(ceasePlaceOf(pos({ place: " " }))).toBeNull();
    expect(ceasePlaceOf(null)).toBeNull();
  });
});

describe("the ceased row's text", () => {
  it("is a whole sentence when the place is known, street types in full", () => {
    expect(ceaseRowText("12 Smith St")).toEqual({
      observation: "Surveillance ceased in the vicinity of 12 Smith Street.",
      complete: true,
    });
    // No doubled full stop.
    expect(ceaseRowText("Rockingham Centre.").observation).toBe(
      "Surveillance ceased in the vicinity of Rockingham Centre."
    );
  });

  it("is the opening, left for the officer, when there is no place", () => {
    for (const place of [null, undefined, "", "  ", "ab"])
      expect(ceaseRowText(place)).toEqual({
        observation: CEASE_OPENING,
        complete: false,
      });
    expect(CEASE_OPENING).toBe("Surveillance ceased in the vicinity of ");
  });
});

describe("who goes on the ceased row", () => {
  const team = roster([
    { cin: "20" },
    { cin: "5" },
    { cin: "12", isTeamLeader: true },
    { cin: "7" },
  ]);

  it("is everyone still on, in the order the sheet shows its team", () => {
    expect(ceaseMembers(["20", "5", "12", "7"], team)).toEqual([
      "12",
      "5",
      "7",
      "20",
    ]);
  });

  it("leaves out anyone who has already ceased", () => {
    expect(ceaseMembers(["20", "12"], team)).toEqual(["12", "20"]);
  });

  it("puts someone on a row but not on the roster after the team, by name", () => {
    expect(ceaseMembers(["zed", "5", "alpha"], team)).toEqual([
      "5",
      "ALPHA",
      "ZED",
    ]);
  });

  it("is empty when nobody is on, and skips spacers", () => {
    expect(ceaseMembers([], team)).toEqual([]);
    expect(ceaseMembers(["__SPACE__", "5"], team)).toEqual(["5"]);
  });

  it("works with no roster, numbers in numeric order", () => {
    expect(ceaseMembers(["10", "9", "3"], null)).toEqual(["3", "9", "10"]);
  });
});

describe("where the team commenced, when nothing else says", () => {
  const commenced =
    "Surveillance commenced in the vicinity of 38 Lawley Crescent, MOUNT LAWLEY WA (38 Lawley Crescent).";

  it("reads the place the latest commenced / ceased row names, as written", () => {
    expect(
      lastSurveillancePlace([{ rowNumber: 1, observation: commenced }])
    ).toBe("38 Lawley Crescent, MOUNT LAWLEY WA (38 Lawley Crescent)");
    // The latest one counts; a row that names no place is skipped.
    expect(
      lastSurveillancePlace([
        { rowNumber: 1, observation: commenced },
        {
          rowNumber: 2,
          observation: "Surveillance commenced in the vicinity of 5 Park Road.",
        },
        { rowNumber: 3, observation: "Target seen leaving." },
        {
          rowNumber: 4,
          observation: "Surveillance ceased in the vicinity of ",
        },
      ])
    ).toBe("5 Park Road");
  });

  it("goes by the order the rows were made, not the order given", () => {
    expect(
      lastSurveillancePlace([
        { rowNumber: 2, observation: "Surveillance ceased at 9 Low Street." },
        { rowNumber: 1, observation: commenced },
      ])
    ).toBe("9 Low Street");
  });

  it("is null when no row names one", () => {
    expect(lastSurveillancePlace([])).toBeNull();
    expect(
      lastSurveillancePlace([
        {
          rowNumber: 1,
          observation: "Surveillance commenced in the vicinity of ",
        },
        { rowNumber: 2, observation: null },
      ])
    ).toBeNull();
  });

  it("is used only when the Target Logger has no position; a logged position wins, and blank when he is moving", () => {
    const rows = [{ rowNumber: 1, observation: commenced }];
    expect(ceasePlaceFor(null, rows)).toBe(
      "38 Lawley Crescent, MOUNT LAWLEY WA (38 Lawley Crescent)"
    );
    expect(ceasePlaceFor(pos({ place: "12 Smith Street" }), rows)).toBe(
      "12 Smith Street"
    );
    // He has left in a vehicle: the commenced place is not where he is.
    expect(ceasePlaceFor(pos({ state: "moving" }), rows)).toBeNull();
    expect(ceasePlaceFor(null, [])).toBeNull();
  });

  it("makes a whole sentence of it, keeping the bracket short form", () => {
    expect(
      ceaseRowText("38 Lawley Crescent, MOUNT LAWLEY WA (38 Lawley Crescent)")
        .observation
    ).toBe(
      "Surveillance ceased in the vicinity of 38 Lawley Crescent, MOUNT LAWLEY WA (38 Lawley Crescent)."
    );
  });
});
