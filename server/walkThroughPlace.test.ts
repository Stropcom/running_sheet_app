import { describe, expect, it } from "vitest";
import { scanWalkEvents } from "../shared/walkEventPatterns";
import { locateTarget } from "../shared/targetPosition";

const scan = (obs: string[]) =>
  scanWalkEvents(
    obs.map((o, i) => ({ id: i + 1, sheetId: 1, observation: o }))
  );

const ATM =
  "SANTOS used the ATM inside HSBC Bank Booragoon to deposit approximately $10,000 in $50.00 notes.";

describe("walking through a named centre puts the walker inside it", () => {
  it("'exited HSBC and walked through Garden City Shopping Centre to the food hall' → inside Garden City", () => {
    const r = scan([
      ATM,
      "SANTOS exited HSBC Bank Booragoon and walked through Garden City Shopping Centre to the food hall.",
    ]);
    expect(r.walkIns.map(w => [w.names, w.location])).toEqual([
      ["SANTOS", "Garden City Shopping Centre"],
    ]);
    // no longer "departed on foot / left HSBC"
    expect(r.headingTo).toEqual([]);
    const pos = locateTarget({
      token: "SANTOS",
      arrivals: [],
      departures: [],
      walkIns: r.walkIns,
      headingTo: r.headingTo,
      placements: r.placements,
    } as any);
    expect(pos?.state).toBe("inside");
  });

  it("also for 'towards the food hall' and with no destination", () => {
    for (const tail of ["towards the food hall", ""]) {
      const r = scan([
        `SANTOS exited HSBC Bank Booragoon and walked through Garden City Shopping Centre ${tail}.`.replace(
          " .",
          "."
        ),
      ]);
      expect(r.walkIns.map(w => w.location)).toEqual([
        "Garden City Shopping Centre",
      ]);
      expect(r.headingTo).toEqual([]);
    }
  });

  it("a named place further on still wins as the heading", () => {
    const r = scan([
      "SANTOS exited HSBC Bank Booragoon and walked through Garden City Shopping Centre towards 13 Denford Street, KENWICK WA (13 Denford Street).",
    ]);
    expect(r.walkIns).toEqual([]);
    expect(r.headingTo.map(h => h.destination)).toEqual(["13 Denford Street"]);
  });

  it("an unnamed 'the shopping centre' or a car park is not read as an entry", () => {
    for (const o of [
      "SANTOS exited HSBC Bank Booragoon and walked through the shopping centre towards the exit.",
      "SANTOS exited HSBC Bank Booragoon and walked through the car park to the food hall.",
    ]) {
      expect(scan([o]).walkIns).toEqual([]);
    }
  });
});
