import { describe, expect, it } from "vitest";
import type { PlaceVisit } from "../shared/placesReport";
import {
  AREAS,
  LIKELY_REACH_SHARE,
  MIN_SAMPLES,
  NEAR_KEY,
  USE_ALL_HISTORY,
  areaFromSpeedLimit,
  areaFromStreetName,
  buildStops,
  describePrediction,
  formatKm,
  haversineKm,
  perthClock,
  predict,
  type PredictorInput,
  type PredictorPlace,
  type PredictorStop,
} from "../shared/targetPredictor";

// Perth-ish coordinates, a few km apart.
const PLACES: PredictorPlace[] = [
  { placeKey: "home", name: "Home", lat: -31.99, lng: 115.76 },
  { placeKey: "gym", name: "Gym", lat: -31.95, lng: 115.8 },
  { placeKey: "cafe", name: "Cafe", lat: -31.951, lng: 115.805 },
  { placeKey: "work", name: "Work", lat: -31.95, lng: 115.86 },
  { placeKey: "mall", name: "Mall", lat: -31.93, lng: 116.0 },
];
const nameOf = (k: string) => PLACES.find(p => p.placeKey === k)?.name ?? k;

function stop(
  placeKey: string,
  weekday: number,
  start: number,
  end: number | null,
  next: string | null,
  nextStart: number | null = null
): PredictorStop {
  return {
    placeKey,
    weekday,
    dateISO: "2026-01-01",
    startMinutes: start,
    endMinutes: end,
    departureLogged: end !== null,
    nextPlaceKey: next,
    nextStartMinutes: nextStart ?? (end !== null && next ? end + 15 : null),
  };
}

function visit(
  sheetId: number,
  dateISO: string,
  placeKey: string,
  start: number | null,
  end: number | null
): PlaceVisit {
  return {
    placeKey,
    sheetId,
    sheetTitle: "S",
    rowId: sheetId * 100 + (start ?? 0),
    dateISO,
    startMinutes: start,
    endMinutes: end,
    endDayOffset: 0,
    dwellMinutes: start !== null && end !== null ? end - start : null,
  };
}

const base = (over: Partial<PredictorInput>): PredictorInput => ({
  mode: "next",
  stops: [],
  places: PLACES,
  from: { kind: "place", placeKey: "home", minutes: 380, leaving: false },
  nowWeekday: 2, // Wednesday
  nowMinutes: 400, // 06:40
  area: "built",
  // These tests are about the careful search (same weekday and time of day
  // first); "every visit on record" has its own tests below.
  allHistory: false,
  ...over,
});

describe("buildStops", () => {
  it("attaches the next place on the same sheet, in time order", () => {
    const stops = buildStops([
      visit(1, "2026-03-02", "gym", 500, 560),
      visit(1, "2026-03-02", "home", 0, 420),
      visit(1, "2026-03-02", "work", 600, null),
    ]);
    const by = Object.fromEntries(stops.map(s => [s.placeKey, s]));
    expect(by.home.nextPlaceKey).toBe("gym");
    expect(by.home.nextStartMinutes).toBe(500);
    expect(by.gym.nextPlaceKey).toBe("work");
    expect(by.work.nextPlaceKey).toBeNull(); // nothing logged after it
  });

  it("does not link places across sheets or more than 12 hours apart", () => {
    const stops = buildStops([
      visit(1, "2026-03-02", "home", 0, 420),
      visit(2, "2026-03-02", "gym", 480, 540),
      visit(3, "2026-03-02", "home", 100, 200),
      visit(3, "2026-03-02", "work", 1000, null),
    ]);
    expect(stops.every(s => s.nextPlaceKey === null)).toBe(true);
  });

  it("records the weekday and whether a departure was logged", () => {
    const [s] = buildStops([visit(1, "2026-03-02", "home", 60, null)]);
    expect(s.weekday).toBe(0); // Monday
    expect(s.departureLogged).toBe(false);
  });
});

describe("areaFromSpeedLimit", () => {
  it("reads the kind of area from a posted limit", () => {
    expect(areaFromSpeedLimit(110)).toBe("freeway");
    expect(areaFromSpeedLimit(100)).toBe("freeway");
    expect(areaFromSpeedLimit(90)).toBe("freeway");
    expect(areaFromSpeedLimit(80)).toBe("main");
    expect(areaFromSpeedLimit(70)).toBe("main");
    expect(areaFromSpeedLimit(60)).toBe("built");
    expect(areaFromSpeedLimit(50)).toBe("back");
    expect(areaFromSpeedLimit(40)).toBe("back");
  });
});

describe("areaFromStreetName", () => {
  it("reads only unmistakable names", () => {
    expect(areaFromStreetName("Kwinana Freeway")).toBe("freeway");
    expect(areaFromStreetName("Mitchell Fwy")).toBe("freeway");
    expect(areaFromStreetName("Great Eastern Highway")).toBe("main");
    expect(areaFromStreetName("Smith Street")).toBeNull();
    expect(areaFromStreetName("Freeman Road")).toBeNull();
    expect(areaFromStreetName(null)).toBeNull();
  });
});

describe("Where next", () => {
  const history = [
    // Wednesdays: five left home ~06:50, four went to the gym, one to the cafe
    ...[0, 1, 2, 3].map(i => stop("home", 2, 0, 410 + i, "gym")),
    stop("home", 2, 0, 415, "cafe"),
  ];

  it("counts where similar visits went next", () => {
    const pr = predict(base({ stops: history }));
    expect(pr.total).toBe(5);
    expect(pr.scope).toBe("day");
    expect(pr.candidates[0].placeKey).toBe("gym");
    expect(pr.candidates[0].p).toBeCloseTo(0.8);
    expect(pr.candidates[1].placeKey).toBe("cafe");
    expect(pr.tier).toBe("low"); // fewer than 6 similar visits
    expect(pr.leaveMinutes).toBe(412);
    expect(pr.candidates[0].arriveMinutes).toBe(427); // leaves ~412, 15 min gap
  });

  it("falls back to all weekdays when the weekday is thin", () => {
    const pr = predict(
      base({
        nowWeekday: 3,
        stops: [
          ...history,
          stop("home", 3, 0, 420, "gym"),
          stop("home", 3, 0, 420, "gym"),
        ],
      })
    );
    expect(pr.scope).toBe("group");
    expect(pr.total).toBe(7);
  });

  it("under the minimum it still answers, but as very limited history", () => {
    const input = base({ stops: history.slice(0, MIN_SAMPLES - 1) });
    const pr = predict(input);
    expect(pr.tier).toBe("thin");
    expect(pr.candidates[0].placeKey).toBe("gym");
    const line = describePrediction(pr, input, nameOf);
    expect(line.sub).toContain("only 2 similar visits — very limited history");
  });

  it("says nothing only when there is no similar visit at all", () => {
    const input = base({ stops: [] });
    const pr = predict(input);
    expect(pr.tier).toBe("none");
    expect(describePrediction(pr, input, nameOf).main).toBe(
      "No prediction yet"
    );
  });

  it("ignores visits with nothing logged after them", () => {
    const pr = predict(
      base({
        stops: [
          ...history,
          stop("home", 2, 0, 410, null),
          stop("home", 2, 0, 410, null),
        ],
      })
    );
    expect(pr.total).toBe(5);
  });

  it("widens to any time of day when nothing was under way at this time", () => {
    const pr = predict(base({ nowMinutes: 900, stops: history }));
    expect(pr.scope).toBe("anytime");
    expect(pr.total).toBe(5);
    expect(pr.candidates[0].placeKey).toBe("gym");
  });

  it("is high only with 12+ similar visits and 70%+ the same way", () => {
    const many = Array.from({ length: 12 }, () =>
      stop("home", 2, 0, 410, "gym")
    );
    expect(predict(base({ stops: many })).tier).toBe("high");
    const split = [
      ...Array.from({ length: 6 }, () => stop("home", 2, 0, 410, "gym")),
      ...Array.from({ length: 6 }, () => stop("home", 2, 0, 410, "cafe")),
    ];
    expect(predict(base({ stops: split })).tier).toBe("mid");
  });

  it("says the same thing for the same history and clock", () => {
    const a = predict(base({ stops: history }));
    const b = predict(base({ stops: [...history].reverse() }));
    expect(b).toEqual(a);
  });

  it("starts from the departure when the sheet says he already left", () => {
    const pr = predict(
      base({
        stops: history,
        from: { kind: "place", placeKey: "home", minutes: 411, leaving: true },
        nowMinutes: 420,
      })
    );
    expect(pr.total).toBeGreaterThan(0);
    expect(pr.candidates[0].placeKey).toBe("gym");
    expect(pr.candidates[0].arriveMinutes).toBe(426); // left 06:51, 15 min on
  });

  it("writes the headline", () => {
    const input = base({ stops: history });
    const line = describePrediction(predict(input), input, nameOf);
    expect(line.main).toBe("Next: Gym, about 07:07");
    expect(line.sub).toContain("80% of similar visits");
    expect(line.sub).toContain("usually leaves Home about 06:52");
  });
});

describe("Where now", () => {
  // He leaves the gym ~08:25 and most days goes to the cafe next door (0.4 km)
  // or work (5 km); twice he went to the mall (20 km).
  const out = (to: string, n: number, gap = 10) =>
    Array.from({ length: n }, () => stop("gym", 2, 450, 505, to, 505 + gap));
  const history = [
    ...out("cafe", 4),
    ...out("work", 5, 20),
    ...out("mall", 3, 35),
  ];
  const lost = (over: Partial<PredictorInput> = {}) =>
    base({
      mode: "now",
      stops: history,
      from: { kind: "place", placeKey: "gym", minutes: 505, leaving: true },
      nowMinutes: 517,
      ...over,
    });

  it("limits how far he could have got by area speed and time", () => {
    const pr = predict(lost({ area: "back" }));
    expect(pr.elapsedMinutes).toBe(12);
    expect(pr.reachKm).toBeCloseTo((AREAS.back.kmh * 12) / 60);
    const free = predict(lost({ area: "freeway" }));
    expect(free.reachKm).toBeGreaterThan(pr.reachKm);
  });

  it("grows the ring as the clock moves on", () => {
    const early = predict(lost({ nowMinutes: 510 }));
    const later = predict(lost({ nowMinutes: 540 }));
    expect(later.reachKm).toBeGreaterThan(early.reachKm);
  });

  it("favours nearby places on a back street more than on a freeway", () => {
    const back = predict(lost({ area: "back" }));
    const free = predict(lost({ area: "freeway" }));
    const share = (pr: ReturnType<typeof predict>, k: string) =>
      pr.candidates.find(c => c.placeKey === k)?.p ?? 0;
    expect(share(back, "cafe") / (1 - AREAS.back.nearShare)).toBeGreaterThan(
      share(free, "cafe") / (1 - AREAS.freeway.nearShare)
    );
    expect(back.adjusted).toBe(true);
  });

  it("adds a 'close by' share set by the area, summing with the rest to 100%", () => {
    for (const area of ["freeway", "main", "built", "back"] as const) {
      const pr = predict(lost({ area }));
      const near = pr.candidates.find(c => c.placeKey === NEAR_KEY);
      expect(near?.p).toBeCloseTo(AREAS[area].nearShare);
      expect(pr.candidates.reduce((t, c) => t + c.p, 0)).toBeCloseTo(1);
    }
  });

  it("calls it 'at' once enough time has passed to be there, else 'route'", () => {
    const soon = predict(lost({ nowMinutes: 507 }));
    expect(soon.candidates.find(c => c.placeKey === "work")?.state).toBe(
      "route"
    );
    const later = predict(lost({ nowMinutes: 540, area: "main" }));
    expect(later.candidates.find(c => c.placeKey === "work")?.state).toBe("at");
  });

  it("keeps the tier from his history, not from the 'close by' share", () => {
    const pr = predict(lost({ area: "back" }));
    expect(pr.tier).toBe("low"); // 12 similar visits, but the top outcome is only 42%
  });

  it("from a point on the map drops places he cannot have reached", () => {
    const pr = predict(
      lost({
        from: { kind: "point", lat: -31.99, lng: 115.76, minutes: 515 },
        nowMinutes: 517,
        area: "back",
      })
    );
    // 2 minutes at 50 km/h ≈ 1.7 km: nothing in the history is that close
    // to a point 5 km+ from every stop except none; "close by" remains.
    expect(
      pr.candidates.every(
        c => c.placeKey === NEAR_KEY || (c.km ?? 0) <= 1.7 * 1.25 + 0.6
      )
    ).toBe(true);
  });

  it("not seen yet: where he usually is at this time of day", () => {
    const pr = predict(
      base({
        mode: "now",
        stops: history,
        from: { kind: "none" },
        nowMinutes: 480,
      })
    );
    expect(pr.total).toBe(12);
    expect(pr.candidates[0].placeKey).toBe("gym");
    expect(pr.candidates.every(c => c.placeKey !== NEAR_KEY)).toBe(true);
    const line = describePrediction(
      pr,
      base({ mode: "now", from: { kind: "none" }, nowMinutes: 480 }),
      nameOf
    );
    expect(line.main).toBe("Likely at Gym right now");
  });

  it("widens to any time when no visit ended near the last-seen time", () => {
    const pr = predict(
      lost({
        from: { kind: "place", placeKey: "gym", minutes: 800, leaving: true },
        nowMinutes: 810,
      })
    );
    expect(pr.scope).toBe("anytime");
    expect(pr.total).toBe(12);
  });
});

describe("counting every visit on record (the current setting)", () => {
  // Yesterday (a Friday) he went Terminal 4 -> Terminal 2 -> the supermarket.
  // Today is a Saturday and he has just left Terminal 4 at 17:13.
  const places: PredictorPlace[] = [
    { placeKey: "t4", name: "Terminal 4", lat: -31.94, lng: 115.97 },
    { placeKey: "t2", name: "Terminal 2", lat: -31.93, lng: 115.96 },
    { placeKey: "super", name: "Woolworths", lat: -31.92, lng: 115.95 },
  ];
  const friday = 4;
  const saturday = 5;
  const stops: PredictorStop[] = [
    {
      placeKey: "t4",
      weekday: friday,
      dateISO: "2026-10-23",
      startMinutes: 600,
      endMinutes: 620,
      departureLogged: true,
      nextPlaceKey: "t2",
      nextStartMinutes: 640,
    },
    {
      placeKey: "t2",
      weekday: friday,
      dateISO: "2026-10-23",
      startMinutes: 640,
      endMinutes: 700,
      departureLogged: true,
      nextPlaceKey: "super",
      nextStartMinutes: 715,
    },
  ];
  const input = (over: Partial<PredictorInput> = {}): PredictorInput => ({
    mode: "now",
    stops,
    places,
    from: { kind: "place", placeKey: "t4", minutes: 1033, leaving: true },
    nowWeekday: saturday,
    nowMinutes: 1040,
    area: "main",
    ...over,
  });

  it("uses yesterday's route today, whatever the day or time", () => {
    const pr = predict(input());
    expect(pr.scope).toBe("anytime");
    expect(pr.tier).toBe("thin");
    expect(pr.total).toBe(1);
    const next = pr.candidates.find(c => c.placeKey === "t2");
    expect(next).toBeTruthy();
    expect(next!.history).toBe(1);
    const line = describePrediction(pr, input(), nameOf2(places));
    expect(line.sub).toContain("very limited history");
  });

  it("the careful search ends on the same step for this case", () => {
    // Different weekday and time of day: only the widest step finds it, and
    // that step is the one the careful search ends on too.
    const pr = predict(input({ allHistory: false }));
    expect(pr.scope).toBe("anytime");
  });

  it("works from Where next too", () => {
    const pr = predict(
      input({
        mode: "next",
        from: { kind: "place", placeKey: "t4", minutes: 1040, leaving: false },
      })
    );
    expect(pr.candidates[0].placeKey).toBe("t2");
    expect(pr.tier).toBe("thin");
  });

  it("is on by default", () => {
    expect(USE_ALL_HISTORY).toBe(true);
    const { allHistory: _a, ...rest } = input();
    expect(predict(rest as PredictorInput).scope).toBe("anytime");
  });

  it("a tapped point still ranks his places when nothing is on record at this time", () => {
    // Tapped near Terminal 4 at 17:38; every recorded visit was in the morning.
    const pr = predict(
      input({
        from: { kind: "point", lat: -31.94, lng: 115.971, minutes: 1033 },
        nowMinutes: 1058,
        area: "main",
      })
    );
    expect(pr.scope).toBe("anytime");
    expect(pr.tier).not.toBe("none");
    expect(pr.candidates.length).toBeGreaterThan(0);
    // The reach (25 min at 70 km/h) covers all three places; the nearest
    // places are favoured.
    expect(pr.candidates.some(c => c.placeKey === "t4")).toBe(true);
    expect(pr.candidates.reduce((t, c) => t + c.p, 0)).toBeCloseTo(1);
  });

  it("a tapped point is a point on the map even when it gives nothing to predict", () => {
    const pr = predict(
      input({
        stops: [],
        from: { kind: "point", lat: -31.94, lng: 115.971, minutes: 1033 },
        nowMinutes: 1058,
      })
    );
    expect(pr.tier).toBe("none");
    expect(pr.elapsedMinutes).toBe(25);
    expect(pr.reachKm).toBeCloseTo((70 * 25) / 60);
  });

  it("not seen yet: where he usually is at this time, on any day", () => {
    const pr = predict(
      input({ from: { kind: "none" }, nowWeekday: saturday, nowMinutes: 650 })
    );
    expect(pr.scope).toBe("anyday");
    expect(pr.candidates[0].placeKey).toBe("t2");
  });
});

describe("Where now: how far he could have got, and locations of interest", () => {
  const places: PredictorPlace[] = [
    { placeKey: "near", name: "Near", lat: -31.95, lng: 115.86, visits: 3 },
    {
      placeKey: "reg",
      name: "Registered address",
      lat: -31.97,
      lng: 115.86,
      visits: 0,
      registered: true,
    },
    { placeKey: "far", name: "Far", lat: -32.5, lng: 115.86, visits: 9 },
  ];
  const nameOf = (k: string) => places.find(p => p.placeKey === k)?.name ?? k;
  const lost = (over: Partial<PredictorInput> = {}): PredictorInput => ({
    mode: "now",
    stops: [],
    places,
    from: { kind: "point", lat: -31.95, lng: 115.85, minutes: 1000 },
    nowWeekday: 5,
    nowMinutes: 1020,
    area: "main",
    ...over,
  });

  it("the reach works with no history and no known places at all", () => {
    const input = lost({ places: [] });
    const pr = predict(input);
    expect(pr.tier).toBe("none");
    expect(pr.seenLocated).toBe(true);
    expect(pr.reachKm).toBeCloseTo((70 * 20) / 60);
    expect(pr.inReach).toEqual([]);
    const line = describePrediction(pr, input, nameOf);
    expect(line.main).toBe(
      "He could be up to 23.3 km from where he was last seen"
    );
    expect(line.sub).toContain("20 min at about 70 km/h");
    expect(line.sub).toContain("no known locations of interest in reach");
  });

  it("lists known places inside the reach, nearest first, with or without visits", () => {
    const pr = predict(lost());
    expect(pr.inReach.map(r => r.placeKey)).toEqual(["near", "reg"]);
    expect(pr.inReach[1].registered).toBe(true);
    expect(pr.inReach[1].visits).toBe(0);
    // "far" is ~60 km away: outside 20 minutes at 70 km/h.
    expect(pr.inReach.some(r => r.placeKey === "far")).toBe(false);
  });

  it("the most-likely ring is 60% of the reach and marks the places inside it", () => {
    const pr = predict(lost());
    expect(LIKELY_REACH_SHARE).toBe(0.6);
    expect(pr.likelyKm).toBeCloseTo(pr.reachKm * 0.6);
    for (const r of pr.inReach) expect(r.likely).toBe(r.km <= pr.likelyKm);
    // It follows the clock and the pause (the clock input) with the reach.
    const later = predict(lost({ nowMinutes: 1100 }));
    expect(later.likelyKm).toBeCloseTo(later.reachKm * 0.6);
    // Nothing to measure from when he has not been located.
    expect(predict(lost({ places: [] })).inReach).toEqual([]);
  });

  it("the reach grows with the clock and takes in more places", () => {
    const later = predict(lost({ nowMinutes: 1100 }));
    expect(later.reachKm).toBeGreaterThan(predict(lost()).reachKm);
    expect(later.inReach.some(r => r.placeKey === "far")).toBe(true);
  });

  it("a fresh sighting still lists what is right there", () => {
    const fresh = lost({
      nowMinutes: 1000,
      from: { kind: "point", lat: -31.95, lng: 115.857, minutes: 1000 },
    });
    const pr = predict(fresh);
    expect(pr.elapsedMinutes).toBe(0);
    expect(pr.inReach.map(r => r.placeKey)).toEqual(["near"]);
    expect(describePrediction(pr, fresh, nameOf).main).toMatch(/^Just seen/);
  });

  it("is separate from the history: places in reach are listed even when none is likely", () => {
    const pr = predict(lost());
    expect(pr.candidates.every(c => c.placeKey === "_near" || c.n > 0)).toBe(
      true
    );
    expect(pr.inReach.length).toBe(2);
  });

  it("uses the posted limit as the travel speed when it is known", () => {
    const withLimit = predict(lost({ limitKmh: 100 }));
    expect(withLimit.kmh).toBe(100);
    expect(withLimit.reachKm).toBeCloseTo((100 * 20) / 60);
    // No limit: the area's assumed speed, as before.
    expect(predict(lost()).kmh).toBe(70);
    const line = describePrediction(withLimit, lost({ limitKmh: 100 }), nameOf);
    expect(line.sub).toContain("at about 100 km/h");
  });

  it("formats small distances in metres", () => {
    expect(formatKm(0.45)).toBe("450 m");
    expect(formatKm(2.34)).toBe("2.3 km");
  });
});

const nameOf2 = (ps: PredictorPlace[]) => (k: string) =>
  ps.find(p => p.placeKey === k)?.name ?? k;

describe("haversineKm", () => {
  it("measures roughly right", () => {
    expect(
      haversineKm({ lat: -31.95, lng: 115.86 }, { lat: -31.95, lng: 115.87 })
    ).toBeCloseTo(0.94, 1);
  });
});

describe("perthClock", () => {
  it("reads the Perth date, weekday and time from an instant", () => {
    // 22:40 UTC Wednesday is 06:40 Thursday in Perth (UTC+8).
    expect(perthClock(new Date("2026-03-04T22:40:00Z"))).toEqual({
      dateISO: "2026-03-05",
      weekday: 3,
      minutes: 400,
    });
  });
});
