import { describe, expect, it } from "vitest";
import {
  continuedOccupantWording,
  namesTheTarget,
  vehicleDepartLabel,
  walkedToVehicleLabel,
} from "../shared/vehicleCardWording";

const SANTOS = { kind: "person", token: "SANTOS" } as const;

describe("the vehicle card's buttons", () => {
  it("the target walking to the vehicle is 'Tgt to <rego>'", () => {
    expect(walkedToVehicleLabel("1EMB303", "SANTOS", SANTOS)).toBe(
      "Tgt to 1EMB303"
    );
    expect(walkedToVehicleLabel("1EMB303", "SANTOS and JONES", SANTOS)).toBe(
      "Tgt to 1EMB303"
    );
  });

  it("anyone else is 'Walked to <rego>'", () => {
    expect(walkedToVehicleLabel("1EMB303", "JONES", SANTOS)).toBe(
      "Walked to 1EMB303"
    );
  });

  it("no person target (none, a vehicle or a location) is never 'Tgt'", () => {
    expect(walkedToVehicleLabel("1EMB303", "SANTOS", null)).toBe(
      "Walked to 1EMB303"
    );
    expect(
      walkedToVehicleLabel("1EMB303", "SANTOS", {
        kind: "vehicle",
        rego: "1EMB303",
      })
    ).toBe("Walked to 1EMB303");
    expect(
      walkedToVehicleLabel("1EMB303", "SANTOS", { kind: "location" })
    ).toBe("Walked to 1EMB303");
  });

  it("a surname inside another word is not the target", () => {
    expect(namesTheTarget("SANTOSO", SANTOS)).toBe(false);
  });

  it("the depart button is '<rego> Depart'", () => {
    expect(vehicleDepartLabel("1EMB303")).toBe("1EMB303 Depart");
  });
});

describe("a departure with nobody logged in the vehicle carries on from the arrival", () => {
  const base = {
    rego: "1EMB303",
    arrivalRowId: 10,
    placements: [],
  };
  const rows = (desc: string) => [
    { rego: "1EMB303", rowId: 10, names: desc.replace(/ driver.*/, "") },
  ];

  it("'SANTOS driver and sole occupant' continues, though SANTOS is inside the address", () => {
    const desc = "SANTOS driver and sole occupant";
    expect(
      continuedOccupantWording({
        ...base,
        arrivalDesc: desc,
        // inside THIS address: not in the "elsewhere" list
        onFootElsewhere: [],
        insideThisAddress: [],
        allVehicleRows: rows(desc),
      })
    ).toBe("SANTOS driver and sole occupant");
  });

  it("the row that put him inside THIS address is not 'somewhere else'", () => {
    const desc = "SANTOS driver and sole occupant";
    const inside = [{ name: "SANTOS", rego: "", rowId: 11 }];
    expect(
      continuedOccupantWording({
        ...base,
        arrivalDesc: desc,
        onFootElsewhere: [],
        insideThisAddress: ["SANTOS"],
        placements: inside,
        allVehicleRows: rows(desc),
      })
    ).toBe("SANTOS driver and sole occupant");
    // The same placement with nobody inside this address means a later row put
    // him somewhere else: nothing to carry on from.
    expect(
      continuedOccupantWording({
        ...base,
        arrivalDesc: desc,
        onFootElsewhere: [],
        insideThisAddress: [],
        placements: inside,
        allVehicleRows: rows(desc),
      })
    ).toBe("unseen occupant/s");
  });

  it("a driver and a passenger continue as they were worded", () => {
    const desc = "SANTOS driver and JONES front passenger";
    expect(
      continuedOccupantWording({
        ...base,
        arrivalDesc: desc,
        onFootElsewhere: [],
        insideThisAddress: [],
        allVehicleRows: [{ rego: "1EMB303", rowId: 10, names: desc }],
      })
    ).toBe("SANTOS driver and JONES front passenger");
  });

  it("someone logged inside another address is left out", () => {
    const desc = "SANTOS driver and JONES front passenger";
    expect(
      continuedOccupantWording({
        ...base,
        arrivalDesc: desc,
        onFootElsewhere: ["JONES"],
        insideThisAddress: [],
        allVehicleRows: [{ rego: "1EMB303", rowId: 10, names: desc }],
      })
    ).toBe("SANTOS driver");
  });

  it("someone a later row put in another vehicle is left out", () => {
    const desc = "SANTOS driver and JONES front passenger";
    expect(
      continuedOccupantWording({
        ...base,
        arrivalDesc: desc,
        onFootElsewhere: [],
        insideThisAddress: [],
        placements: [{ name: "JONES", rego: "1XYZ999", rowId: 12 }],
        allVehicleRows: [{ rego: "1EMB303", rowId: 10, names: desc }],
      })
    ).toBe("SANTOS driver");
  });

  it("everyone gone elsewhere: 'unseen occupant/s'", () => {
    const desc = "SANTOS driver and sole occupant";
    expect(
      continuedOccupantWording({
        ...base,
        arrivalDesc: desc,
        onFootElsewhere: ["SANTOS"],
        insideThisAddress: [],
        allVehicleRows: rows(desc),
      })
    ).toBe("unseen occupant/s");
  });

  it("an arrival that itself named nobody stays 'unseen occupant/s'", () => {
    expect(
      continuedOccupantWording({
        ...base,
        arrivalDesc: "unseen occupant/s",
        onFootElsewhere: [],
        insideThisAddress: [],
        allVehicleRows: [],
      })
    ).toBe("unseen occupant/s");
  });
});
