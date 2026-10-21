import { describe, expect, it } from "vitest";
import {
  canonicalNames,
  companionNames,
  knownSurnamesOf,
} from "../shared/companions";
import {
  isReadAsMovement,
  matchPresenceInside,
  scanWalkEvents,
} from "../shared/walkEventPatterns";
import { locateTarget } from "../shared/targetPosition";

const scan = (obs: string[]) =>
  scanWalkEvents(
    obs.map((o, i) => ({ id: i + 1, sheetId: 1, observation: o }))
  );

const ARRIVED =
  "Vehicle 1DOY78, DOYLE driver and sole occupant, arrived at 8 Knots Tavern, 110 Riverside Road, EAST FREMANTLE WA (8 Knots Tavern) parked in the car park.";
const SEATED =
  "Doyle seated inside 8 Knots Tavern with Hye Jin PARK (PARK) at a table.";

const flag = (obs: string[]) => {
  const r = scan(obs);
  return locateTarget({
    token: "DOYLE",
    arrivals: [],
    departures: [],
    walkIns: r.walkIns,
    headingTo: r.headingTo,
    placements: r.placements,
  } as any);
};

describe("one rule for who is with someone", () => {
  it("every phrasing officers use", () => {
    const phrases = [
      "seated inside 8 Knots Tavern with Hye Jin PARK (PARK) at a table",
      "seated with Hye Jin PARK (PARK) inside 8 Knots Tavern",
      "inside 8 Knots Tavern at a table with Hye Jin PARK (PARK)",
      "inside 8 Knots Tavern in the company of Hye Jin PARK (PARK)",
      "inside 8 Knots Tavern in company with Hye Jin PARK (PARK)",
      "inside 8 Knots Tavern together with Hye Jin PARK (PARK)",
      "inside 8 Knots Tavern accompanied by Hye Jin PARK (PARK)",
      "inside 8 Knots Tavern alongside Hye Jin PARK (PARK)",
      "inside 8 Knots Tavern, sharing a table with Hye Jin PARK (PARK)",
      "inside 8 Knots Tavern speaking to Hye Jin PARK (PARK)",
    ];
    for (const p of phrases) {
      const m = matchPresenceInside(`DOYLE ${p}.`);
      expect(m?.names, p).toBe("DOYLE and PARK");
      expect(m?.place, p).toBe("8 Knots Tavern");
    }
  });

  it("a bare 'with' needs a place; a thing in capitals is not a person", () => {
    expect(companionNames("entered Bar One with a bag", "DOYLE")).toEqual([]);
    expect(
      companionNames("entered Bar One with a CCTV camera", "DOYLE")
    ).toEqual([]);
    expect(
      companionNames("inside Bar One with the ATM and WA", "DOYLE", {
        bareWith: true,
      })
    ).toEqual([]);
    expect(
      companionNames("inside Bar One with PARK", "DOYLE", { bareWith: true })
    ).toEqual(["PARK"]);
  });

  it("an unidentified person counts, and nobody is named twice", () => {
    expect(
      companionNames("inside X with an unidentified male (UM1)", "DOYLE", {
        bareWith: true,
      })
    ).toEqual(["UM1"]);
    expect(
      companionNames("inside X with DOYLE and PARK", "DOYLE", {
        bareWith: true,
      })
    ).toEqual(["PARK"]);
  });
});

describe("the target typed in mixed case ('Doyle')", () => {
  const known = knownSurnamesOf([ARRIVED]);

  it("is known from the capitals elsewhere on the sheet", () => {
    expect(known.has("DOYLE")).toBe(true);
    expect(canonicalNames("Doyle and Hye Jin PARK", known)).toBe(
      "DOYLE and Hye Jin PARK"
    );
  });

  it("the seated row is read: card and flag list both people", () => {
    const r = scan([ARRIVED, SEATED]);
    const last = r.walkIns[r.walkIns.length - 1];
    expect(last.names).toBe("DOYLE and PARK");
    expect(last.location).toBe("8 Knots Tavern");
    const pos = flag([ARRIVED, SEATED]);
    expect(pos?.state).toBe("inside");
    expect(pos?.people).toEqual(["DOYLE", "PARK"]);
  });

  it("is a read movement, so the tracker doesn't warn", () => {
    expect(isReadAsMovement(SEATED)).toBe(false);
    expect(isReadAsMovement(SEATED, known)).toBe(true);
  });

  it("an ordinary capitalised word is not taken for the target", () => {
    expect(
      matchPresenceInside("Surveillance seated inside X.", known)
    ).toBeNull();
  });
});
