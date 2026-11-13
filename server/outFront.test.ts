// "Stood out the front": inside a place, steps out the front and stays — out
// the front of that place, not "departed on foot" (shared/outFront.ts).
import { describe, expect, it } from "vitest";
import {
  matchWalkedBackInside,
  matchWentOutFront,
  returnedInsideSentence,
  saysStoodOutFront,
} from "../shared/outFront";
import { isReadAsMovement, scanWalkEvents } from "../shared/walkEventPatterns";
import { locateTarget } from "../shared/targetPosition";

const rows = (...o: string[]) =>
  o.map((observation, i) => ({ id: i + 1, sheetId: 1, observation }));
const IN = "SANTOS entered 21 Hope Road and continued out of sight.";

describe("saysStoodOutFront", () => {
  it("reads standing, waiting or going out the front or outside", () => {
    for (const t of [
      "SANTOS exited 21 Hope Road, stood out the front was talking on a mobile phone.",
      "SANTOS exited 21 Hope Road and stood out the front and was talking on a mobile phone.",
      "SANTOS exited A and waited outside.",
      "SANTOS exited A and went out the front.",
      "SANTOS exited A and stepped outside to smoke.",
    ])
      expect(saysStoodOutFront(t), t).toBe(true);
  });
  it("is not walking on, getting into a vehicle, or out of sight", () => {
    for (const t of [
      "SANTOS exited A and walked out the front towards Smith Street.",
      "SANTOS exited A and stood outside Vehicle 1EMB303.",
      "SANTOS exited A and went out of sight.",
      "SANTOS exited A and walked along Smith Street.",
    ])
      expect(saysStoodOutFront(t), t).toBe(false);
  });
});

describe("matchWentOutFront / matchWalkedBackInside", () => {
  it("reads a row with no 'exited'", () => {
    expect(
      matchWentOutFront(
        "SANTOS went out the front of 21 Hope Road and stood talking on the phone."
      )
    ).toEqual({ names: "SANTOS", place: "21 Hope Road" });
    expect(matchWentOutFront("SANTOS stood out the front.")).toEqual({
      names: "SANTOS",
      place: null,
    });
    expect(matchWentOutFront("SANTOS exited A and stood outside.")).toBeNull();
  });
  it("reads walking back in", () => {
    expect(
      matchWalkedBackInside(
        "SANTOS walked back to 21 Hope Road and continued out of sight."
      )
    ).toEqual({ names: "SANTOS", place: "21 Hope Road" });
    expect(matchWalkedBackInside("SANTOS walked back inside.")).toEqual({
      names: "SANTOS",
      place: null,
    });
  });
  it("writes the Returned inside sentence", () => {
    expect(returnedInsideSentence("SANTOS", "21 Hope Road")).toBe(
      "SANTOS walked back to 21 Hope Road and continued out of sight."
    );
  });
});

describe("the logger with someone out the front", () => {
  const OUT1 =
    "SANTOS exited 21 Hope Road, stood out the front was talking on a mobile phone.";
  const OUT2 =
    "SANTOS exited 21 Hope Road and stood out the front and was talking on a mobile phone.";

  it("puts him out the front of the place he left, in neither inside nor departed", () => {
    for (const out of [OUT1, OUT2]) {
      const r = scanWalkEvents(rows(IN, out));
      expect(r.walkIns).toEqual([]);
      expect(r.headingTo).toHaveLength(1);
      expect(r.headingTo[0]).toMatchObject({
        names: "SANTOS",
        from: "21 Hope Road",
        outFront: true,
      });
    }
  });

  it("reads 'went out the front' when he is logged inside, and only then", () => {
    const went =
      "SANTOS went out the front of 21 Hope Road to talk on the phone.";
    const r = scanWalkEvents(rows(IN, went));
    expect(r.walkIns).toEqual([]);
    expect(r.headingTo[0]).toMatchObject({
      from: "21 Hope Road",
      outFront: true,
    });
    // Not logged inside anywhere: nothing is invented.
    expect(scanWalkEvents(rows(went)).headingTo).toEqual([]);
    // Logged inside somewhere else: not that place.
    expect(
      scanWalkEvents(
        rows("SANTOS entered 5 Other Street and continued out of sight.", went)
      ).headingTo
    ).toEqual([]);
  });

  it("returned inside puts him inside the place again", () => {
    const back = returnedInsideSentence("SANTOS", "21 Hope Road");
    const r = scanWalkEvents(rows(IN, OUT1, back));
    expect(r.headingTo).toEqual([]);
    expect(r.walkIns).toHaveLength(1);
    expect(r.walkIns[0]).toMatchObject({
      names: "SANTOS",
      location: "21 Hope Road",
    });
    expect(
      scanWalkEvents(rows(IN, OUT1, "SANTOS walked back inside.")).walkIns[0]
    ).toMatchObject({ location: "21 Hope Road" });
  });

  it("walking back to a place he was NOT out the front of is an ordinary walk", () => {
    const r = scanWalkEvents(
      rows(
        IN,
        OUT1,
        "SANTOS walked back to 9 Other Road and continued out of sight."
      )
    );
    expect(r.walkIns.map(w => w.location)).not.toContain("21 Hope Road");
    expect(r.headingTo[0]?.outFront).toBeUndefined();
  });

  it("a walk on afterwards ends the out-the-front state", () => {
    const r = scanWalkEvents(
      rows(IN, OUT1, "SANTOS walked towards 13 Denford Street.")
    );
    expect(r.headingTo).toHaveLength(1);
    expect(r.headingTo[0].outFront).toBeUndefined();
    expect(r.headingTo[0].destination).toBe("13 Denford Street");
  });

  it("walking out the front towards somewhere is still a walk, not out the front", () => {
    const r = scanWalkEvents(
      rows(
        IN,
        "SANTOS exited 21 Hope Road and walked out the front towards 13 Denford Street."
      )
    );
    expect(r.headingTo[0].outFront).toBeUndefined();
  });

  it("a plain exit is unchanged", () => {
    const r = scanWalkEvents(rows(IN, "SANTOS exited 21 Hope Road."));
    expect(r.headingTo[0].outFront).toBeUndefined();
    expect(r.headingTo[0].from).toBe("21 Hope Road");
  });

  it("the flag says out the front, at that place", () => {
    const r = scanWalkEvents(rows(IN, OUT1));
    const pos = locateTarget({
      token: "SANTOS",
      arrivals: [],
      departures: [],
      walkIns: r.walkIns,
      headingTo: r.headingTo,
      placements: r.placements,
    });
    expect(pos).toMatchObject({
      place: "21 Hope Road",
      state: "walking",
      label: "out the front",
    });
  });

  it("the tracker counts these rows as read movements", () => {
    expect(isReadAsMovement("SANTOS went out the front of 21 Hope Road.")).toBe(
      true
    );
    expect(isReadAsMovement("SANTOS walked back inside.")).toBe(true);
  });
});
