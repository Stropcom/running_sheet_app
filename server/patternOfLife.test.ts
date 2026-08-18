import { describe, it, expect } from "vitest";
import {
  classifyVisitDirection,
  timeBucketIndex,
  timeBucketLabels,
  dayOfWeekIndex,
  buildLocationTimeGrid,
  findPeakCell,
  buildDayTimeGrid,
  mostActiveDays,
  computeHomePresenceByBucket,
  toHomePresencePercent,
  dominantRanges,
  buildDirectionHistogram,
  peakBucketIndex,
  confidenceTier,
} from "./patternOfLife";

describe("classifyVisitDirection", () => {
  it("classifies an arrival", () => {
    expect(
      classifyVisitDirection(
        "TGT MARSHALL, David seen to arrive at 459 Canning Highway, MELVILLE WA (459 Canning Highway) and enter the premises."
      )
    ).toBe("arrived");
  });

  it("classifies 'returned to' as an arrival", () => {
    expect(
      classifyVisitDirection(
        "TGT returned to 459 Canning Highway, MELVILLE WA (459 Canning Highway) on foot."
      )
    ).toBe("arrived");
  });

  it("classifies 'pulled into' as an arrival", () => {
    expect(
      classifyVisitDirection(
        "Vehicle 1ABC123 pulled into the driveway of 459 Canning Highway, MELVILLE WA (459 Canning Highway)."
      )
    ).toBe("arrived");
  });

  it("classifies a departure", () => {
    expect(
      classifyVisitDirection(
        "TGT MARSHALL, David seen to depart 459 Canning Highway, MELVILLE WA (459 Canning Highway) via the front door."
      )
    ).toBe("departed");
  });

  it("classifies 'left' as a departure", () => {
    expect(
      classifyVisitDirection(
        "TGT left 459 Canning Highway, MELVILLE WA (459 Canning Highway) on foot."
      )
    ).toBe("departed");
  });

  it("classifies a reversed-from-driveway + continued via as a departure", () => {
    expect(
      classifyVisitDirection(
        "Vehicle 1ABC123 reversed from the driveway of 459 Canning Highway, MELVILLE WA (459 Canning Highway) onto Canning Highway and continued via:"
      )
    ).toBe("departed");
  });

  it("does not assert a direction for a bare presence mention", () => {
    expect(
      classifyVisitDirection(
        "TGT observed parked in the vicinity of 459 Canning Highway, MELVILLE WA (459 Canning Highway)."
      )
    ).toBe("neutral");
  });

  it("does not assert a direction when both arrival and departure language appear", () => {
    expect(
      classifyVisitDirection(
        "TGT arrived at 459 Canning Highway, MELVILLE WA (459 Canning Highway) then shortly after departed the same address."
      )
    ).toBe("neutral");
  });
});

describe("timeBucketIndex / timeBucketLabels", () => {
  it("buckets minute-of-day into 6 four-hour buckets", () => {
    expect(timeBucketIndex(0, 6)).toBe(0);
    expect(timeBucketIndex(239, 6)).toBe(0);
    expect(timeBucketIndex(240, 6)).toBe(1);
    expect(timeBucketIndex(719, 6)).toBe(2); // 11:59am
    expect(timeBucketIndex(1439, 6)).toBe(5); // 11:59pm
  });

  it("clamps out-of-range minutes instead of throwing", () => {
    expect(timeBucketIndex(-5, 6)).toBe(0);
    expect(timeBucketIndex(2000, 6)).toBe(5);
  });

  it("produces labels matching the bucket count", () => {
    expect(timeBucketLabels(6)).toEqual([
      "00–04",
      "04–08",
      "08–12",
      "12–16",
      "16–20",
      "20–24",
    ]);
    expect(timeBucketLabels(12)[0]).toBe("00–02");
    expect(timeBucketLabels(12)[11]).toBe("22–24");
  });
});

describe("dayOfWeekIndex", () => {
  it("resolves known dates to Mon=0..Sun=6", () => {
    expect(dayOfWeekIndex("2026-08-10")).toBe(0); // Monday
    expect(dayOfWeekIndex("2026-08-11")).toBe(1); // Tuesday
    expect(dayOfWeekIndex("2026-08-16")).toBe(6); // Sunday
  });
});

describe("buildLocationTimeGrid / findPeakCell", () => {
  const visits = [
    {
      entityKey: "459 canning highway",
      label: "459 Canning Highway",
      timeMinutes: 13 * 60,
      dateISO: "2026-08-10",
    },
    {
      entityKey: "459 canning highway",
      label: "459 Canning Highway",
      timeMinutes: 13 * 60,
      dateISO: "2026-08-11",
    },
    {
      entityKey: "459 canning highway",
      label: "459 Canning Highway",
      timeMinutes: 9 * 60,
      dateISO: "2026-08-12",
    },
    {
      entityKey: "woolworths karrinyup",
      label: "Woolworths Karrinyup",
      timeMinutes: 17 * 60,
      dateISO: "2026-08-10",
    },
  ];

  it("aggregates visits per entity into time buckets and totals", () => {
    const grid = buildLocationTimeGrid(visits, 6, 10);
    const home = grid.find(r => r.entityKey === "459 canning highway")!;
    expect(home.total).toBe(3);
    expect(home.counts[timeBucketIndex(13 * 60, 6)]).toBe(2);
    expect(home.counts[timeBucketIndex(9 * 60, 6)]).toBe(1);
  });

  it("sorts rows by total descending and caps at topN", () => {
    const grid = buildLocationTimeGrid(visits, 6, 1);
    expect(grid).toHaveLength(1);
    expect(grid[0].entityKey).toBe("459 canning highway");
  });

  it("finds the single highest-count cell across all rows", () => {
    const grid = buildLocationTimeGrid(visits, 6, 10);
    const peak = findPeakCell(grid);
    expect(peak?.entityKey).toBe("459 canning highway");
    expect(peak?.bucketIndex).toBe(timeBucketIndex(13 * 60, 6));
    expect(peak?.count).toBe(2);
  });

  it("returns null for an empty grid", () => {
    expect(findPeakCell([])).toBeNull();
  });
});

describe("buildDayTimeGrid / mostActiveDays", () => {
  it("buckets rows by day of week and time", () => {
    const grid = buildDayTimeGrid(
      [
        { dateISO: "2026-08-10", timeMinutes: 13 * 60 }, // Mon
        { dateISO: "2026-08-11", timeMinutes: 13 * 60 }, // Tue
        { dateISO: "2026-08-11", timeMinutes: 14 * 60 }, // Tue
      ],
      6
    );
    expect(grid[0][timeBucketIndex(13 * 60, 6)]).toBe(1); // Mon
    expect(grid[1][timeBucketIndex(13 * 60, 6)]).toBe(2); // Tue
  });

  it("returns every tied-for-highest day, not just one", () => {
    const grid = [
      [3], // Mon
      [3], // Tue
      [1], // Wed
      [0],
      [0],
      [0],
      [0],
    ];
    expect(mostActiveDays(grid)).toEqual([0, 1]);
  });

  it("returns an empty array when there is no activity at all", () => {
    const grid = Array.from({ length: 7 }, () => [0]);
    expect(mostActiveDays(grid)).toEqual([]);
  });
});

describe("computeHomePresenceByBucket / toHomePresencePercent", () => {
  it("marks the span between an arrival and a later departure as home", () => {
    const buckets = computeHomePresenceByBucket(
      [
        { dateISO: "2026-08-10", timeMinutes: 18 * 60, direction: "arrived" },
        { dateISO: "2026-08-10", timeMinutes: 22 * 60, direction: "departed" },
      ],
      12
    );
    const eveningBucket = timeBucketIndex(19 * 60, 12);
    expect(buckets[eveningBucket].homeMinutes).toBeGreaterThan(0);
    expect(buckets[eveningBucket].awayMinutes).toBe(0);
  });

  it("marks the span between a departure and a later arrival as away", () => {
    const buckets = computeHomePresenceByBucket(
      [
        { dateISO: "2026-08-10", timeMinutes: 8 * 60, direction: "departed" },
        { dateISO: "2026-08-10", timeMinutes: 17 * 60, direction: "arrived" },
      ],
      12
    );
    const middayBucket = timeBucketIndex(12 * 60, 12);
    expect(buckets[middayBucket].awayMinutes).toBeGreaterThan(0);
    expect(buckets[middayBucket].homeMinutes).toBe(0);
  });

  it("marks time before the first and after the last event of a day as unknown", () => {
    const buckets = computeHomePresenceByBucket(
      [{ dateISO: "2026-08-10", timeMinutes: 12 * 60, direction: "arrived" }],
      12
    );
    const earlyMorning = timeBucketIndex(1 * 60, 12);
    const lateNight = timeBucketIndex(23 * 60, 12);
    expect(buckets[earlyMorning].unknownMinutes).toBeGreaterThan(0);
    expect(buckets[earlyMorning].homeMinutes).toBe(0);
    expect(buckets[lateNight].unknownMinutes).toBeGreaterThan(0);
  });

  it("never bridges a gap across two different calendar days", () => {
    // Arrived home on day 1 at 23:00, no more events that day. Next event is
    // a departure on day 2 at 07:00. The overnight gap must NOT be assumed
    // "home" just because the day-1 event was an arrival — each day is
    // resolved independently.
    const buckets = computeHomePresenceByBucket(
      [
        { dateISO: "2026-08-10", timeMinutes: 23 * 60, direction: "arrived" },
        { dateISO: "2026-08-11", timeMinutes: 7 * 60, direction: "departed" },
      ],
      12
    );
    // 03:00-05:00 bucket has no events on either day directly bounding it
    // from arrival on day 1 (day 1 ends unknown after 23:00) or from day 2
    // (day 2 starts unknown before 07:00) — must be unknown, not home.
    const preDawn = timeBucketIndex(4 * 60, 12);
    expect(buckets[preDawn].homeMinutes).toBe(0);
    expect(buckets[preDawn].unknownMinutes).toBeGreaterThan(0);
  });

  it("contributes nothing for days with no home events at all", () => {
    const buckets = computeHomePresenceByBucket(
      [{ dateISO: "2026-08-10", timeMinutes: 12 * 60, direction: "arrived" }],
      12
    );
    const total = buckets.reduce(
      (sum, b) => sum + b.homeMinutes + b.awayMinutes + b.unknownMinutes,
      0
    );
    // Exactly one day's worth of minutes (1440), not inflated by any
    // "missing day" padding.
    expect(total).toBe(1440);
  });

  it("converts minutes to rounded percentages, defaulting to fully unknown when empty", () => {
    expect(
      toHomePresencePercent({
        homeMinutes: 0,
        awayMinutes: 0,
        unknownMinutes: 0,
      })
    ).toEqual({
      home: 0,
      away: 0,
      unknown: 100,
    });
    expect(
      toHomePresencePercent({
        homeMinutes: 90,
        awayMinutes: 30,
        unknownMinutes: 0,
      })
    ).toEqual({ home: 75, away: 25, unknown: 0 });
  });
});

describe("dominantRanges", () => {
  it("finds a simple non-wrapping dominant range", () => {
    const percents = Array.from({ length: 12 }, (_, i) => ({
      home: i >= 9 || i <= 2 ? 80 : 10,
      away: 0,
      unknown: 0,
    }));
    // buckets 0-2 and 9-11 are >=50 home, forming a wraparound run
    const ranges = dominantRanges(percents, "home", 12);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].startBucket).toBe(9);
    expect(ranges[0].endBucket).toBe(3);
  });

  it("returns the full range when every bucket is dominant", () => {
    const percents = Array.from({ length: 6 }, () => ({
      home: 100,
      away: 0,
      unknown: 0,
    }));
    expect(dominantRanges(percents, "home", 6)).toEqual([
      { startBucket: 0, endBucket: 6 },
    ]);
  });

  it("returns an empty array when the state is never dominant", () => {
    const percents = Array.from({ length: 6 }, () => ({
      home: 10,
      away: 10,
      unknown: 80,
    }));
    expect(dominantRanges(percents, "home", 6)).toEqual([]);
  });
});

describe("buildDirectionHistogram / peakBucketIndex", () => {
  const events: Array<{
    dateISO: string;
    timeMinutes: number;
    direction: "arrived" | "departed";
  }> = [
    { dateISO: "2026-08-10", timeMinutes: 7 * 60, direction: "departed" },
    { dateISO: "2026-08-11", timeMinutes: 7 * 60 + 30, direction: "departed" },
    { dateISO: "2026-08-10", timeMinutes: 18 * 60, direction: "arrived" },
  ];

  it("only counts events matching the requested direction", () => {
    const departures = buildDirectionHistogram(events, "departed", 8);
    const arrivals = buildDirectionHistogram(events, "arrived", 8);
    expect(departures.reduce((a, b) => a + b, 0)).toBe(2);
    expect(arrivals.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("finds the peak bucket, or null when all-zero", () => {
    const departures = buildDirectionHistogram(events, "departed", 8);
    expect(peakBucketIndex(departures)).toBe(timeBucketIndex(7 * 60, 8));
    expect(peakBucketIndex(new Array(8).fill(0))).toBeNull();
  });
});

describe("confidenceTier", () => {
  it("tiers by geocoded observation count", () => {
    expect(confidenceTier(3)).toBe("low");
    expect(confidenceTier(9)).toBe("low");
    expect(confidenceTier(10)).toBe("moderate");
    expect(confidenceTier(29)).toBe("moderate");
    expect(confidenceTier(30)).toBe("high");
    expect(confidenceTier(100)).toBe("high");
  });
});
