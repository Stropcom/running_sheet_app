import { describe, expect, it } from "vitest";
import {
  OCCUPANTS_UNSEEN,
  parkedAtCommencement,
  parkedDepartOptions,
} from "@shared/vehicleCardWording";
import { surveillanceState } from "@shared/surveillanceState";
import { extractOccupantNames } from "@shared/occupantNames";
import {
  computePendingVehicleArrivals,
  computePendingVehicleDepartures,
} from "./db";

const person = { kind: "person", token: "Daryani" } as any;
const vehicle = { kind: "vehicle", token: "1ABC123" } as any;

describe("parkedDepartOptions — Depart TGT / Depart US at the start", () => {
  it("offers both, worded as the owner asked", () => {
    const o = parkedDepartOptions({
      rego: "1DAR77",
      address: "38 Lawley Crescent",
      target: person,
    });
    expect(o.map(x => x.label)).toEqual([
      "1DAR77 Depart TGT",
      "1DAR77 Depart US",
    ]);
    expect(o[0].text).toBe(
      "Vehicle 1DAR77, DARYANI driver and sole occupant, departed 38 Lawley Crescent and continued via:"
    );
    expect(o[1].text).toBe(
      `Vehicle 1DAR77, ${OCCUPANTS_UNSEEN}, departed 38 Lawley Crescent and continued via:`
    );
    expect(OCCUPANTS_UNSEEN).toBe("occupant/s unseen");
  });
  it("offers only US when the sheet has no person target", () => {
    for (const target of [vehicle, null, undefined]) {
      const o = parkedDepartOptions({
        rego: "1DAR77",
        address: "38 Lawley Crescent",
        target,
      });
      expect(o.map(x => x.label)).toEqual(["1DAR77 Depart US"]);
    }
  });
  it("the sentences are read back as a departure, with no name for US", () => {
    const [tgt, us] = parkedDepartOptions({
      rego: "1DAR77",
      address: "38 Lawley Crescent",
      target: person,
    });
    const dep = (text: string) =>
      computePendingVehicleDepartures([
        { id: 1, sheetId: 1, observation: text },
      ])[0];
    const t = dep(tgt.text);
    expect(t?.rego).toBe("1DAR77");
    expect(extractOccupantNames(t.occupantDesc)).toBe("DARYANI");
    const u = dep(us.text);
    expect(u?.rego).toBe("1DAR77");
    expect(extractOccupantNames(u.occupantDesc)).toBe("");
  });
});

describe("parkedAtCommencement", () => {
  const base = {
    address: "38 Lawley Crescent",
    commencedPlace: "38 Lawley Crescent, MOUNT LAWLEY WA (38 Lawley Crescent)",
    ended: false,
    positionLogged: false,
  };
  it("is true at the commenced place while nobody is located", () => {
    expect(parkedAtCommencement(base)).toBe(true);
  });
  it("is false elsewhere, once located, once ended, or with no commenced place", () => {
    expect(parkedAtCommencement({ ...base, address: "5 Smith Street" })).toBe(
      false
    );
    expect(parkedAtCommencement({ ...base, positionLogged: true })).toBe(false);
    expect(parkedAtCommencement({ ...base, ended: true })).toBe(false);
    expect(parkedAtCommencement({ ...base, commencedPlace: null })).toBe(false);
  });
});

describe("the owner's sheet: two vehicles parked, then commenced", () => {
  const rows = [
    {
      id: 1,
      sheetId: 1,
      observation:
        "A charcoal Volvo XC60 station sedan, bearing WA registration 1DAR77 (Vehicle 1DAR77) and a white Isuzu D-MAX Utility, bearing WA registration 1ARD64 (Vehicle 1ARD64), park and unattended in the driveway at 38 Lawley Crescent.",
    },
    {
      id: 2,
      sheetId: 1,
      observation:
        "Surveillance commenced in the vicinity of 38 Lawley Crescent, MOUNT LAWLEY WA (38 Lawley Crescent).",
    },
  ];
  it("lists both vehicles parked at the commenced place", () => {
    const arrivals = computePendingVehicleArrivals(rows);
    expect(arrivals.map(a => a.rego).sort()).toEqual(["1ARD64", "1DAR77"]);
    const state = surveillanceState(
      [
        {
          id: 1,
          observation: rows[0].observation,
          members: [],
          time: "07:34 AM",
        },
        {
          id: 2,
          observation: rows[1].observation,
          members: ["459"],
          time: "07:34 AM",
        },
      ],
      ["459"]
    );
    for (const a of arrivals) {
      expect(a.unattended).toBe(true);
      expect(
        parkedAtCommencement({
          address: a.address,
          commencedPlace: state.commencedPlace,
          ended: state.ended,
          positionLogged: false,
        })
      ).toBe(true);
    }
  });
});
