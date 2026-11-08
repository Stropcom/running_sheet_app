import { describe, expect, it } from "vitest";
import { scanWalkEvents } from "../shared/walkEventPatterns";
import { locateTarget } from "../shared/targetPosition";
import { occupantsStillInVehicle } from "../shared/walkEventPatterns";

const scan = (obs: string[]) =>
  scanWalkEvents(
    obs.map((o, i) => ({ id: i + 1, sheetId: 1, observation: o }))
  );

const ARRIVED =
  "Vehicle 1DOY78, DOYLE driver, PARK front passenger, arrived at Westpac Branch Booragoon, T5004, Westfield, 125 Riseley Street, BOORAGOON WA (Westpac Branch Booragoon) parked in the car park.\n\nPARK exited the vehicle, entered Westpac Branch Booragoon and continued out of sight.";
const DOYLE_IN =
  "DOYLE exited the vehicle, entered Westpac Branch Booragoon and continued out of sight.";

describe("two people enter the same place one after the other", () => {
  it("the place holds both, not just the last one", () => {
    const r = scan([ARRIVED, DOYLE_IN]);
    const w = r.walkIns.filter(x => /Westpac/.test(x.location));
    expect(w).toHaveLength(1);
    expect(w[0].names).toBe("PARK and DOYLE");
    // and the flag lists both for either target
    for (const token of ["DOYLE", "PARK"]) {
      const pos = locateTarget({
        token,
        arrivals: [],
        departures: [],
        walkIns: r.walkIns,
        headingTo: r.headingTo,
        placements: r.placements,
      } as any);
      expect(pos?.state).toBe("inside");
      expect(pos?.people?.sort()).toEqual(["DOYLE", "PARK"]);
    }
  });

  it("nobody is left in the vehicle", () => {
    const r = scan([ARRIVED, DOYLE_IN]);
    const onFoot = r.walkIns.flatMap(w => w.names.split(" and "));
    expect(
      occupantsStillInVehicle("DOYLE driver, PARK front passenger", onFoot)
    ).toEqual([]);
  });

  it("someone who already walked out, or got back in a vehicle, does not carry over", () => {
    const left = scan([
      ARRIVED,
      "PARK exited Westpac Branch Booragoon and walked towards Vehicle 1DOY78.",
      DOYLE_IN,
    ]);
    const w = left.walkIns.filter(x => /Westpac/.test(x.location));
    expect(w.map(x => x.names)).toEqual(["DOYLE"]);
  });

  it("someone who walked into a second place does not stay at the first", () => {
    const r = scan([
      ARRIVED,
      "PARK exited Westpac Branch Booragoon and entered Coffea Espresso Bar, 1 A Street, BOORAGOON WA (Coffea Espresso Bar).",
      DOYLE_IN,
    ]);
    const bank = r.walkIns.filter(x => /Westpac/.test(x.location));
    expect(bank.map(x => x.names)).toEqual(["DOYLE"]);
  });

  it("walking in again never doubles a name", () => {
    const r = scan([ARRIVED, DOYLE_IN, DOYLE_IN]);
    const w = r.walkIns.filter(x => /Westpac/.test(x.location));
    expect(w[0].names).toBe("PARK and DOYLE");
  });
});

// ─── Walking in through a gate or door of an address ────────────────────────
// "… walked in the front gate of 15 Victoria Street and continued out of
// sight." was not read as an entry, so the logger left them "in the vehicle"
// and the flag said "in <rego>" although the row said they had gone inside.
describe("walked in the front gate of an address", () => {
  const VALE_ARRIVED =
    "Vehicle 1VAL75, VALE driver, FRASER front passenger and WATANABE rear passenger, arrived at 15 Victoria Street, SOUTH PERTH WA (15 Victoria Street) and parked on the street.";
  const WHOLE_ROW =
    VALE_ARRIVED +
    "\n\nVALE, FRASER and WATANABE exited the vehicle, FRASER went to the boot retrieved the brown suitcase.\n\nVALE, FRASER and WATANABE walked in the front gate of 15 Victoria Street and continued out of sight.";

  it("the people are inside the address, not in the vehicle", () => {
    const r = scan([WHOLE_ROW]);
    expect(r.walkIns).toHaveLength(1);
    expect(r.walkIns[0].names).toBe("VALE, FRASER and WATANABE");
    expect(r.walkIns[0].location).toBe("15 Victoria Street");
    for (const p of r.placements) {
      expect(p.rego).toBe("");
      expect(p.at).toBe("15 Victoria Street");
    }
    const pos = locateTarget({
      token: "VALE",
      arrivals: [],
      departures: [],
      walkIns: r.walkIns,
      headingTo: r.headingTo,
      placements: r.placements,
    } as any);
    expect(pos?.state).toBe("inside");
  });

  it("works as a row of its own, with 'through' and without 'continued out of sight'", () => {
    for (const t of [
      "VALE, FRASER and WATANABE walked in the front gate of 15 Victoria Street and continued out of sight.",
      "VALE, FRASER and WATANABE walked through the front gate of 15 Victoria Street.",
      "VALE walked into the front door of 15 Victoria Street.",
    ]) {
      const r = scan([VALE_ARRIVED, t]);
      expect(r.walkIns[0]?.location).toBe("15 Victoria Street");
    }
  });

  it("after 'exited the vehicle,' the place is the address, not 'in the front gate of …'", () => {
    const r = scan([
      VALE_ARRIVED,
      "VALE and FRASER exited the vehicle, walked in the front gate of 15 Victoria Street and continued out of sight.",
    ]);
    expect(r.walkIns[0]?.location).toBe("15 Victoria Street");
  });

  it("walking in a gate with no place named, or through a car park, is not an entry", () => {
    expect(
      scan([VALE_ARRIVED, "VALE walked in the front gate."]).walkIns
    ).toHaveLength(0);
    expect(
      scan([VALE_ARRIVED, "VALE walked through the car park."]).walkIns
    ).toHaveLength(0);
  });
});
