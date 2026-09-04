/**
 * Regression test for parseHHMMToMinutes — the Supervisor Summary's
 * start/finish time fields feeding the Weekly Surveillance Report's
 * per-target coverage-hours total.
 *
 * The bug: the Summary tab stores times 12-hour with an AM/PM suffix
 * ("07:00 AM"–"02:00 PM"), but the parser read only the leading digits as
 * already 24-hour. Every PM finish time whose hour was 1-11 (e.g. "02:00
 * PM" -> 2, not 14) came out numerically earlier than its own morning
 * start time, so that shift's duration was silently dropped from the
 * week's total — a real CARBIDE week of ~27.2h across 4 shifts reported
 * as ~5.3h, the one shift where the PM hour happened to still be >= 12
 * ("12:51 PM").
 */
import { describe, it, expect } from "vitest";
import { parseHHMMToMinutes } from "./db";

describe("parseHHMMToMinutes", () => {
  it("parses a 24-hour-look-alike string with no AM/PM as-is", () => {
    expect(parseHHMMToMinutes("07:33")).toBe(7 * 60 + 33);
  });

  it("converts a PM hour (1-11) to 24-hour", () => {
    expect(parseHHMMToMinutes("02:00 PM")).toBe(14 * 60);
    expect(parseHHMMToMinutes("03:10 PM")).toBe(15 * 60 + 10);
  });

  it("keeps 12 PM as noon, not midnight", () => {
    expect(parseHHMMToMinutes("12:51 PM")).toBe(12 * 60 + 51);
  });

  it("converts 12 AM to midnight (0), not noon", () => {
    expect(parseHHMMToMinutes("12:00 AM")).toBe(0);
  });

  it("keeps an AM hour as-is", () => {
    expect(parseHHMMToMinutes("07:00 AM")).toBe(7 * 60);
  });

  it("is case-insensitive on the am/pm suffix", () => {
    expect(parseHHMMToMinutes("02:00 pm")).toBe(14 * 60);
  });

  it("returns null for unparseable input", () => {
    expect(parseHHMMToMinutes(null)).toBe(null);
    expect(parseHHMMToMinutes("")).toBe(null);
    expect(parseHHMMToMinutes("not a time")).toBe(null);
  });

  it("reproduces the real CARBIDE week: four AM-PM shifts totalling ~27.2h", () => {
    const shifts: [string, string][] = [
      ["07:00 AM", "02:00 PM"],
      ["07:33 AM", "12:51 PM"],
      ["07:15 AM", "02:00 PM"],
      ["07:00 AM", "03:10 PM"],
    ];
    const totalMinutes = shifts.reduce((sum, [start, finish]) => {
      const s = parseHHMMToMinutes(start)!;
      const f = parseHHMMToMinutes(finish)!;
      return sum + (f - s);
    }, 0);
    expect(Math.round((totalMinutes / 60) * 10) / 10).toBe(27.2);
  });
});
