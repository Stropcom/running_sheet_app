import { describe, expect, it } from "vitest";
import {
  buildVisits,
  classifyPlace,
  formatDwell,
  isGenericAddressLabel,
  kindOfPlaceName,
  kindOfRegisteredLabel,
  sortPlaces,
  summarisePlaces,
  weekdayIndex,
  type PlaceMention,
  type PlaceRecord,
} from "../shared/placesReport";

const m = (
  placeKey: string,
  order: number,
  time: string,
  direction: PlaceMention["direction"],
  over: Partial<PlaceMention> = {}
): PlaceMention => {
  const [h, mm] = time.split(":").map(Number);
  return {
    placeKey,
    sheetId: 1,
    sheetTitle: "20261023 - 496 - RAVEN (MENON)",
    order,
    rowId: order + 100,
    dateISO: "2026-10-23",
    timeMinutes: h * 60 + mm,
    direction,
    ...over,
  };
};

describe("kindOfPlaceName", () => {
  it("reads the kind from the name, the way the map signs do", () => {
    expect(kindOfPlaceName("Elevate Gym, 62 Rokeby Road, SUBIACO WA")).toBe(
      "gym"
    );
    expect(kindOfPlaceName("Woolworths Cottesloe, 22 Napier Street")).toBe(
      "shop"
    );
    expect(kindOfPlaceName("Bunnings Belmont WA")).toBe("shop");
    expect(kindOfPlaceName("Terminal 4, Perth Airport WA")).toBe("travel");
    expect(kindOfPlaceName("Forster Park, 130 Keane Street")).toBe("leisure");
  });
  it("never guesses: an unrecognised name is null", () => {
    expect(kindOfPlaceName("The Rowing Pavilion, 4 The Esplanade")).toBeNull();
    expect(kindOfPlaceName("14 Marine Parade, COTTESLOE WA")).toBeNull();
  });
  it("a sign saved for the place (Google's type) wins over the name", () => {
    expect(kindOfPlaceName("Iron Works, 5 High Street", "place_gym")).toBe(
      "gym"
    );
    expect(kindOfPlaceName("Bunnings Belmont WA", "place_cafe")).toBe("food");
  });
  it("ignores a saved icon that is not a place sign", () => {
    expect(
      kindOfPlaceName("Iron Works, 5 High Street", "house_filled")
    ).toBeNull();
  });
});

describe("registered addresses", () => {
  it("knows a label nobody chose", () => {
    for (const g of [
      "",
      "  ",
      "Address 2",
      "address 3",
      "Additional Address 4",
      "Address",
    ])
      expect(isGenericAddressLabel(g), g).toBe(true);
    for (const g of ["Work", "Girlfriend's", "Gym", "Safehouse"])
      expect(isGenericAddressLabel(g), g).toBe(false);
  });
  it("reads a label that plainly names a kind", () => {
    expect(kindOfRegisteredLabel("Work")).toBe("work");
    expect(kindOfRegisteredLabel(" workplace ")).toBe("work");
    expect(kindOfRegisteredLabel("Office")).toBe("work");
    expect(kindOfRegisteredLabel("Gym")).toBe("gym");
    expect(kindOfRegisteredLabel("Girlfriend's")).toBeNull();
    expect(kindOfRegisteredLabel("Network of workers")).toBeNull();
  });
});

describe("classifyPlace — the one rule for what a place is called", () => {
  it("the registered home address is Home", () => {
    expect(
      classifyPlace({
        name: "14 Marine Parade",
        registered: { slot: "home", label: "" },
      })
    ).toEqual({ kind: "home", source: "registry-home", registeredAs: "Home" });
  });
  it("a registered address labelled Work is Work, with no extra step", () => {
    expect(
      classifyPlace({
        name: "100 St Georges Terrace",
        registered: { slot: "extra", number: 2, label: "Work" },
      })
    ).toEqual({ kind: "work", source: "registry-label", registeredAs: "Work" });
  });
  it("a custom label stays as written, under Registered address", () => {
    const c = classifyPlace({
      name: "9 Elm Street",
      registered: { slot: "extra", number: 3, label: "Girlfriend's" },
    });
    expect(c.kind).toBe("registered");
    expect(c.registeredAs).toBe("Girlfriend's");
  });
  it("a generic 'Address 3' gives way to a name the place has (Gym, not Address 3)", () => {
    const c = classifyPlace({
      name: "Elevate Gym, 62 Rokeby Road",
      registered: { slot: "extra", number: 3, label: "" },
    });
    expect(c.kind).toBe("gym");
    expect(c.source).toBe("sign");
    expect(c.registeredAs).toBe("Address 3");
  });
  it("a generic 'Address 3' with a saved Google sign is that sign's kind", () => {
    expect(
      classifyPlace({
        name: "Iron Works, 5 High Street",
        savedSign: "place_gym",
        registered: { slot: "extra", number: 3, label: "Address 3" },
      }).kind
    ).toBe("gym");
  });
  it("a generic 'Address 3' that nothing names stays Address 3", () => {
    const c = classifyPlace({
      name: "9 Elm Street",
      registered: { slot: "extra", number: 3, label: "" },
    });
    expect(c).toEqual({
      kind: "registered",
      source: "registry-generic",
      registeredAs: "Address 3",
    });
  });
  it("an officer's label on the report wins over everything", () => {
    expect(
      classifyPlace({
        name: "Elevate Gym",
        registered: { slot: "home", label: "" },
        officerKind: "work",
      }).kind
    ).toBe("work");
  });
  it("an unregistered place is what its name says, else Other", () => {
    expect(
      classifyPlace({ name: "Little Bird Cafe, 45 Hay Street" }).kind
    ).toBe("food");
    expect(classifyPlace({ name: "The Rowing Pavilion" })).toEqual({
      kind: "other",
      source: "none",
      registeredAs: null,
    });
  });
  it("never works out Work from a name", () => {
    expect(
      classifyPlace({ name: "Harbourview Advisory, 100 St Georges Terrace" })
        .kind
    ).toBe("other");
  });
});

describe("buildVisits", () => {
  it("one visit: arrived then departed, with the time between", () => {
    const v = buildVisits([
      m("gym", 1, "06:00", "arrived"),
      m("gym", 2, "06:40", "neutral"),
      m("gym", 3, "07:10", "departed"),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      startMinutes: 360,
      endMinutes: 430,
      dwellMinutes: 70,
    });
  });
  it("no departure logged: the visit stands but its time is left blank", () => {
    const v = buildVisits([
      m("gym", 1, "06:00", "arrived"),
      m("gym", 2, "06:30", "neutral"),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].dwellMinutes).toBeNull();
    expect(v[0].endMinutes).toBeNull();
  });
  it("a different place in between starts a new visit and does not end the first", () => {
    const v = buildVisits([
      m("cafe", 1, "07:30", "arrived"),
      m("work", 2, "08:15", "arrived"),
      m("cafe", 3, "12:00", "arrived"),
      m("cafe", 4, "12:20", "departed"),
    ]);
    expect(v.map(x => [x.placeKey, x.dwellMinutes])).toEqual([
      ["cafe", null],
      ["work", null],
      ["cafe", 20],
    ]);
  });
  it("a sheet that opens with them leaving has no arrival and no time", () => {
    const v = buildVisits([m("home", 1, "07:00", "departed")]);
    expect(v[0]).toMatchObject({
      startMinutes: null,
      endMinutes: 420,
      dwellMinutes: null,
    });
  });
  it("a row that reads as both arriving and leaving is never an end", () => {
    const v = buildVisits([
      m("gym", 1, "06:00", "arrived"),
      m("gym", 2, "06:50", "neutral"),
    ]);
    expect(v[0].dwellMinutes).toBeNull();
  });
  it("an overnight stay on one sheet counts across midnight", () => {
    const v = buildVisits([
      m("hotel", 1, "22:00", "arrived"),
      m("hotel", 2, "06:30", "departed", { dateISO: "2026-10-24" }),
    ]);
    expect(v[0].dwellMinutes).toBe(510);
    expect(v[0].endDayOffset).toBe(1);
  });
  it("a departure earlier than the arrival is ignored, not turned negative", () => {
    const v = buildVisits([
      m("gym", 1, "09:00", "arrived"),
      m("gym", 2, "08:00", "departed"),
    ]);
    expect(v[0].dwellMinutes).toBeNull();
  });
  it("keeps sheets apart", () => {
    const v = buildVisits([
      m("gym", 1, "06:00", "arrived", { sheetId: 1 }),
      m("gym", 1, "06:00", "arrived", { sheetId: 2 }),
    ]);
    expect(v).toHaveLength(2);
  });
});

describe("summarisePlaces", () => {
  const rec = (
    key: string,
    dates: string[],
    start = 360,
    dwell: number | null = 60
  ): PlaceRecord => ({
    placeKey: key,
    name: key,
    kind: "gym",
    source: "sign",
    registeredAs: null,
    visits: dates.map((d, i) => ({
      placeKey: key,
      sheetId: i,
      sheetTitle: "s",
      rowId: i,
      dateISO: d,
      startMinutes: start,
      endMinutes: dwell === null ? null : start + dwell,
      endDayOffset: 0,
      dwellMinutes: dwell,
    })),
  });
  it("counts visits, time, weekdays and the usual arrival", () => {
    // 2026-10-19 Mon, 21 Wed, 23 Fri
    const [s] = summarisePlaces(
      [rec("gym", ["2026-10-19", "2026-10-21", "2026-10-23"])],
      {
        sinceISO: null,
        todayISO: "2026-10-23",
      }
    );
    expect(s.visits).toHaveLength(3);
    expect(s.totalMinutes).toBe(180);
    expect(s.averageMinutes).toBe(60);
    expect(s.usualDays).toEqual([0, 2, 4]);
    expect(s.usualMinutes).toBe(360);
  });
  it("weekday index is Monday first", () => {
    expect(weekdayIndex("2026-10-19")).toBe(0);
    expect(weekdayIndex("2026-10-25")).toBe(6);
  });
  it("the period leaves out older visits and a place with none", () => {
    const out = summarisePlaces(
      [rec("a", ["2026-09-01"]), rec("b", ["2026-10-20", "2026-09-01"])],
      { sinceISO: "2026-10-10", todayISO: "2026-10-23" }
    );
    expect(out.map(p => [p.placeKey, p.visits.length])).toEqual([["b", 1]]);
  });
  it("'new this week' is judged on the place's whole history, not the period", () => {
    const [a, b] = summarisePlaces(
      [rec("fresh", ["2026-10-22"]), rec("old", ["2026-08-01", "2026-10-22"])],
      { sinceISO: "2026-10-10", todayISO: "2026-10-23" }
    );
    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(false);
  });
  it("a visit with no departure is counted but adds no time", () => {
    const [s] = summarisePlaces(
      [rec("a", ["2026-10-22", "2026-10-23"], 360, null)],
      {
        sinceISO: null,
        todayISO: "2026-10-23",
      }
    );
    expect(s.visits).toHaveLength(2);
    expect(s.totalMinutes).toBe(0);
    expect(s.averageMinutes).toBeNull();
    expect(s.noDeparture).toBe(2);
  });
  it("sorts by visits, time, recency and first seen", () => {
    const list = summarisePlaces(
      [
        rec("a", ["2026-10-01", "2026-10-02"], 360, 10),
        rec("b", ["2026-10-23"], 360, 500),
      ],
      { sinceISO: null, todayISO: "2026-10-23" }
    );
    expect(sortPlaces(list, "visits")[0].placeKey).toBe("a");
    expect(sortPlaces(list, "time")[0].placeKey).toBe("b");
    expect(sortPlaces(list, "recent")[0].placeKey).toBe("b");
    expect(sortPlaces(list, "first")[0].placeKey).toBe("b");
  });
});

describe("formatDwell", () => {
  it("reads naturally", () => {
    expect(formatDwell(45)).toBe("45 min");
    expect(formatDwell(60)).toBe("1 h");
    expect(formatDwell(125)).toBe("2 h 05 min");
  });
});
