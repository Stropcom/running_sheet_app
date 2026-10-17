import { describe, it, expect } from "vitest";
import {
  describeNearmapAge,
  latestCaptureDate,
  nearmapSpot,
} from "../shared/nearmapAge";

const NOW = new Date(2026, 9, 17); // 17 Oct 2026

describe("describeNearmapAge", () => {
  it("colours by age: under 6 months green, 6–12 amber, over 12 red", () => {
    expect(describeNearmapAge("2026-09-02", NOW)?.band).toBe("green");
    expect(describeNearmapAge("2026-04-18", NOW)?.band).toBe("green"); // 5 months 29 days
    expect(describeNearmapAge("2026-04-17", NOW)?.band).toBe("amber"); // exactly 6 months
    expect(describeNearmapAge("2025-10-18", NOW)?.band).toBe("amber"); // 11 months 29 days
    expect(describeNearmapAge("2025-10-17", NOW)?.band).toBe("red"); // exactly 12 months
    expect(describeNearmapAge("2024-11-16", NOW)?.band).toBe("red");
  });
  it("words the age plainly", () => {
    expect(describeNearmapAge("2026-10-17", NOW)?.ageText).toBe("today");
    expect(describeNearmapAge("2026-10-16", NOW)?.ageText).toBe("1 day old");
    expect(describeNearmapAge("2026-10-10", NOW)?.ageText).toBe("7 days old");
    expect(describeNearmapAge("2026-09-02", NOW)?.ageText).toBe("6 weeks old");
    expect(describeNearmapAge("2026-03-14", NOW)?.ageText).toBe("7 months old");
    expect(describeNearmapAge("2025-09-17", NOW)?.ageText).toBe(
      "1 year 1 month old"
    );
    expect(describeNearmapAge("2024-11-16", NOW)?.ageText).toBe(
      "1 year 11 months old"
    );
    expect(describeNearmapAge("2023-10-17", NOW)?.ageText).toBe("3 years old");
  });
  it("formats the date and a short age", () => {
    const a = describeNearmapAge("2026-03-14", NOW)!;
    expect(a.dateLabel).toBe("14 Mar 2026");
    expect(a.shortAge).toBe("7 mo");
    expect(describeNearmapAge("2024-11-16", NOW)?.shortAge).toBe("1 yr 11 mo");
  });
  it("reads an ISO timestamp and refuses nonsense", () => {
    expect(describeNearmapAge("2026-03-14T00:00:00Z", NOW)?.dateLabel).toBe(
      "14 Mar 2026"
    );
    for (const bad of ["", "yesterday", "2026-13-40", "14/03/2026"])
      expect(describeNearmapAge(bad, NOW)).toBeNull();
  });
  it("a date in the future counts as today", () => {
    expect(describeNearmapAge("2026-11-01", NOW)?.ageText).toBe("today");
  });
});

describe("latestCaptureDate", () => {
  it("picks the newest survey whatever order they come in", () => {
    expect(
      latestCaptureDate({
        surveys: [
          { captureDate: "2019-02-01" },
          { captureDate: "2026-03-14" },
          { captureDate: "2024-07-30" },
        ],
      })
    ).toBe("2026-03-14");
    expect(
      latestCaptureDate({
        surveys: [{ captureDate: "2026-03-14" }, { captureDate: "2019-02-01" }],
      })
    ).toBe("2026-03-14");
  });
  it("ignores bad entries and returns null when there is nothing usable", () => {
    expect(
      latestCaptureDate({
        surveys: [{ captureDate: "x" }, {}, null, { captureDate: 5 }],
      })
    ).toBeNull();
    expect(latestCaptureDate({ surveys: [] })).toBeNull();
    expect(latestCaptureDate({})).toBeNull();
    expect(latestCaptureDate(null)).toBeNull();
    expect(latestCaptureDate("surveys")).toBeNull();
  });
});

describe("nearmapSpot", () => {
  it("rounds to about 500 m so one neighbourhood asks once", () => {
    expect(nearmapSpot(-31.9505, 115.8605)).toEqual({
      lat: -31.95,
      lng: 115.86,
    });
    expect(nearmapSpot(-31.9524, 115.8624)).toEqual({
      lat: -31.95,
      lng: 115.86,
    });
    expect(nearmapSpot(-31.9549, 115.8651)).toEqual({
      lat: -31.955,
      lng: 115.865,
    });
  });
});
