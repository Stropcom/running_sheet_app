import { describe, expect, it } from "vitest";
import { buildPlacesReportHtml } from "../client/src/lib/placesReportExport";
import { summarisePlaces, type PlaceRecord } from "../shared/placesReport";

describe("Places Report export", () => {
  const rec: PlaceRecord = {
    placeKey: "gym",
    name: "Elevate Fitness, 62 Rokeby Road, SUBIACO",
    kind: "gym",
    source: "sign",
    registeredAs: "Address 3",
    visits: [
      {
        placeKey: "gym",
        sheetId: 7,
        sheetTitle: "20261022 - 701 - RAVEN (MENON)",
        rowId: 1,
        dateISO: "2026-10-22",
        startMinutes: 450,
        endMinutes: 505,
        endDayOffset: 0,
        dwellMinutes: 55,
      },
    ],
  };
  const places = summarisePlaces([rec], {
    sinceISO: null,
    todayISO: "2026-10-23",
  });
  const html = buildPlacesReportHtml({
    targetName: "Sahana Priya MENON",
    operationName: "RAVEN",
    periodLabel: "all recorded days",
    places,
  });

  it("lists the places and each visit's details", () => {
    expect(html).toContain("Elevate Fitness");
    expect(html).toContain("Gym");
    expect(html).toContain("Registered as Address 3");
    expect(html).toContain("2026-10-22");
    expect(html).toContain("07:30");
    expect(html).toContain("08:25");
    expect(html).toContain("55 min");
  });

  it("does not list the running sheets", () => {
    expect(html).not.toContain("20261022 - 701 - RAVEN");
    expect(html).not.toContain("Running sheet");
  });
});
