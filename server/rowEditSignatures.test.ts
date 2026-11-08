import { describe, expect, it } from "vitest";
import {
  rowEditChangesContent,
  signatureRemovalWarning,
} from "@shared/rowEditSignatures";

const row = {
  time: "10:00 AM",
  timeMinutes: 600,
  dayOffset: 0,
  rowDate: "2026-03-05",
  observation: "Target seen leaving the house.",
};

describe("rowEditChangesContent", () => {
  it("saving the same text again changes nothing", () => {
    expect(
      rowEditChangesContent(row, {
        observation: "Target seen leaving the house.",
      })
    ).toBe(false);
    expect(rowEditChangesContent(row, {})).toBe(false);
  });
  it("changed words, time or date count", () => {
    expect(rowEditChangesContent(row, { observation: "Target seen." })).toBe(
      true
    );
    expect(rowEditChangesContent(row, { time: "10:05 AM" })).toBe(true);
    expect(rowEditChangesContent(row, { timeMinutes: 605 })).toBe(true);
    expect(rowEditChangesContent(row, { rowDate: "2026-03-06" })).toBe(true);
    expect(rowEditChangesContent(row, { dayOffset: 1 })).toBe(true);
  });
  it("an empty row treats null and empty text alike", () => {
    expect(
      rowEditChangesContent(
        { observation: null, time: null },
        { observation: "", time: "" }
      )
    ).toBe(false);
  });
});

describe("signatureRemovalWarning", () => {
  it("names who signed", () => {
    expect(signatureRemovalWarning(["123", "456"])).toContain("(123, 456)");
  });
});

import { perthMinutesAndDate } from "@shared/rowTime";

describe("Perth date for a new offline sheet", () => {
  it("is Perth's day, not UTC's, in the early morning", () => {
    // 2026-03-04 22:30 UTC is 2026-03-05 06:30 in Perth (UTC+8).
    expect(perthMinutesAndDate(new Date("2026-03-04T22:30:00Z")).dateISO).toBe(
      "2026-03-05"
    );
    expect(new Date("2026-03-04T22:30:00Z").toISOString().slice(0, 10)).toBe(
      "2026-03-04"
    );
  });
});
