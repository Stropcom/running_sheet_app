import { describe, expect, it } from "vitest";
import { scanWalkEvents } from "../shared/walkEventPatterns";
import { locateTarget } from "../shared/targetPosition";

const scan = (obs: string[]) =>
  scanWalkEvents(obs.map((o, i) => ({ id: i + 1, sheetId: 1, observation: o })));

const LOUDER =
  "TRAORE walked through the shopping centre and entered Louder Louder - Vic Park, Shop 23/789 Albany Highway, EAST VICTORIA PARK WA (Louder Louder - Vic Park) and sat at a table with Lucas Minh NGUYEN (NGUYEN)";

describe("someone who sat or met with them inside the place they entered", () => {
  it("is inside too — the card and the flag list both", () => {
    const r = scan([LOUDER]);
    expect(r.walkIns.map(w => [w.names, w.location])).toEqual([
      ["TRAORE and NGUYEN", "Louder Louder - Vic Park"],
    ]);
    const pos = locateTarget({
      token: "TRAORE",
      arrivals: [],
      departures: [],
      walkIns: r.walkIns,
      headingTo: r.headingTo,
      placements: r.placements,
    } as any);
    expect(pos?.people).toEqual(["TRAORE", "NGUYEN"]);
    expect(pos?.state).toBe("inside");
  });

  it("reads met with / joined / had lunch with", () => {
    for (const tail of [
      "and met with Lucas NGUYEN (NGUYEN)",
      "and joined Lucas NGUYEN (NGUYEN)",
      "and had lunch with Lucas NGUYEN (NGUYEN)",
    ]) {
      const r = scan([`TRAORE entered Bar One, 1 A Street, PERTH WA (Bar One) ${tail}.`]);
      expect(r.walkIns[0].names).toBe("TRAORE and NGUYEN");
    }
  });

  it("does not add anyone for a bare 'with', nor repeat a person already named", () => {
    expect(
      scan(["TRAORE entered Bar One, 1 A Street, PERTH WA (Bar One) with a bag of shopping and continued out of sight."]).walkIns[0].names
    ).toBe("TRAORE");
    expect(
      scan(["TRAORE and NGUYEN entered Bar One, 1 A Street, PERTH WA (Bar One) and sat with NGUYEN (NGUYEN)."]).walkIns[0].names
    ).toBe("TRAORE and NGUYEN");
  });
});
