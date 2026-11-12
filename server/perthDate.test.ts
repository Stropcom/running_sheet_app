import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { perthDateISO } from "../shared/runningSheetTitle";

// Perth is UTC+8 all year (no daylight saving). "Today" in the app is the Perth
// date: a sheet made at 07:38 on the 13th in Perth is dated the 13th, though the
// UTC clock still says the 12th.
describe("perthDateISO — the Perth calendar date of an instant", () => {
  it("07:38 Perth on the 13th (23:38 UTC on the 12th) is the 13th", () => {
    expect(perthDateISO(new Date("2026-11-12T23:38:00Z"))).toBe("2026-11-13");
  });

  it("changes at exactly Perth midnight, 16:00 UTC", () => {
    expect(perthDateISO(new Date("2026-11-12T15:59:59Z"))).toBe("2026-11-12");
    expect(perthDateISO(new Date("2026-11-12T16:00:00Z"))).toBe("2026-11-13");
  });

  it("is the same day as UTC from 00:00 to 15:59 UTC", () => {
    expect(perthDateISO(new Date("2026-11-12T00:00:00Z"))).toBe("2026-11-12");
    expect(perthDateISO(new Date("2026-11-12T12:00:00Z"))).toBe("2026-11-12");
  });

  it("turns the year over at Perth midnight", () => {
    expect(perthDateISO(new Date("2026-12-31T15:59:00Z"))).toBe("2026-12-31");
    expect(perthDateISO(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
  });

  it("handles 29 February", () => {
    expect(perthDateISO(new Date("2028-02-28T16:00:00Z"))).toBe("2028-02-29");
    expect(perthDateISO(new Date("2028-02-29T16:00:00Z"))).toBe("2028-03-01");
  });
});

// Guard: nothing may work out "today" from the UTC clock. `new Date().toISOString()`
// cut to a date is yesterday in Perth from midnight to 08:00, which dated new
// running sheets a day late (v2.83.30). Use perthDateISO(new Date()) instead.
describe("no 'today' from the UTC clock", () => {
  const ROOTS = ["client/src", "shared", "server"];
  const BAD =
    /new Date\(\)\s*\.toISOString\(\)\s*\.(?:slice\(0,\s*10\)|substring\(0,\s*10\)|split\(["']T["']\)\[0\])/;
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === "node_modules" ? [] : files(p);
      return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
        ? [p]
        : [];
    });

  it("the guard itself matches the bad patterns and scans the source", () => {
    expect(BAD.test("new Date().toISOString().slice(0, 10)")).toBe(true);
    expect(BAD.test('new Date().toISOString().split("T")[0]')).toBe(true);
    expect(BAD.test("perthDateISO(new Date())")).toBe(false);
    expect(
      ROOTS.flatMap(r => files(r)).length,
      "the scan finds the source files"
    ).toBeGreaterThan(300);
  });

  it("finds no `new Date().toISOString().slice(0, 10)` in the app's source", () => {
    const hits = ROOTS.flatMap(r => files(r)).filter(f =>
      BAD.test(fs.readFileSync(f, "utf8"))
    );
    expect(hits).toEqual([]);
  });
});
