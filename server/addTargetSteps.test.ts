import { describe, expect, it } from "vitest";
import {
  addressIsBlank,
  addressListProblem,
  canEnterStep,
  firstOpenStep,
  peopleProblem,
  personIsBlank,
  personProblem,
  stepStatus,
  targetStepProblem,
  vehicleListProblem,
  type PersonLike,
  type StepsInput,
} from "@/lib/addTargetSteps";

const addr = (over: Partial<PersonLike["address"]> = {}) => ({
  unitNo: "",
  houseNo: "",
  streetName: "",
  streetType: "",
  suburb: "",
  state: "WA",
  businessName: "",
  ...over,
});
const fullAddr = () =>
  addr({
    houseNo: "17",
    streetName: "Hay",
    streetType: "Street",
    suburb: "Subiaco",
  });
const veh = (over: Partial<PersonLike["vehicle"]> = {}) => ({
  registration: "",
  state: "WA",
  colour: "",
  make: "",
  model: "",
  vehicleType: "",
  ...over,
});
const fullVeh = () =>
  veh({
    registration: "1ABC123",
    colour: "Silver",
    make: "Toyota",
    model: "Camry",
  });
const person = (over: Partial<PersonLike> = {}): PersonLike => ({
  identity: { firstNames: "", surname: "", bornDate: "" },
  address: addr(),
  vehicle: veh(),
  ...over,
});
const named = (over: Partial<PersonLike> = {}) =>
  person({
    identity: { firstNames: "Paul", surname: "Hogan", bornDate: "" },
    ...over,
  });

const input = (over: Partial<StepsInput> = {}): StepsInput => ({
  targetType: "person",
  hasOperation: true,
  identity: { firstNames: "Amira", surname: "Rahman", bornDate: "" },
  mdlChosen: true,
  address: fullAddr(),
  extraAddresses: [],
  noAddress: false,
  vehicle: fullVeh(),
  extraVehicles: [],
  noVehicle: false,
  residents: [person()],
  noResidents: true,
  associates: [person()],
  noAssociates: true,
  background: "Some background",
  noBackground: false,
  personLabel: (p, kind) => p.identity.firstNames || `New ${kind}`,
  ...over,
});

describe("address / vehicle lists", () => {
  it("a single blank form must be filled in or ticked none", () => {
    expect(addressListProblem([addr()], false, "the target’s")).toMatch(
      /tick “No known address”/
    );
    expect(addressListProblem([addr()], true, "the target’s")).toBeNull();
    expect(vehicleListProblem([veh()], false, "the target’s")).toMatch(
      /tick “No known vehicles”/
    );
    expect(vehicleListProblem([veh()], true, "the target’s")).toBeNull();
  });

  it("none can't be ticked while something is typed", () => {
    expect(addressListProblem([fullAddr()], true, "x")).toMatch(
      /Clear the address/
    );
    expect(vehicleListProblem([fullVeh()], true, "x")).toMatch(
      /Clear the vehicle/
    );
  });

  it("a partial address or vehicle names what is missing", () => {
    expect(addressListProblem([addr({ houseNo: "17" })], false, "x")).toMatch(
      /incomplete: it needs a house number, street name, street type and suburb/
    );
    expect(
      vehicleListProblem([veh({ registration: "1ABC123" })], false, "x")
    ).toMatch(
      /Vehicle 1 is incomplete: it needs a registration, colour, make and model/
    );
  });

  it("every extra must be filled in or removed", () => {
    expect(addressListProblem([fullAddr(), addr()], false, "x")).toBe(
      "Address 2 is empty. Fill it in or remove it."
    );
    expect(addressListProblem([fullAddr(), fullAddr()], false, "x")).toBeNull();
    expect(vehicleListProblem([fullVeh(), veh()], false, "x")).toBe(
      "Vehicle 2 is empty. Fill it in or remove it."
    );
  });

  it("a business name alone doesn't count as street detail", () => {
    expect(addressIsBlank(addr({ businessName: "Acme" }))).toBe(false);
    expect(
      addressListProblem([addr({ businessName: "Acme" })], true, "x")
    ).toBeNull();
  });
});

describe("people", () => {
  it("an untouched person is blank; a named one is not", () => {
    expect(personIsBlank(person())).toBe(true);
    expect(personIsBlank(named())).toBe(false);
  });

  it("a person needs a name, then an address (or none), then a vehicle (or none)", () => {
    expect(personProblem(person())).toBe("Add a first name and a surname");
    expect(
      personProblem(
        person({ identity: { firstNames: "Paul", surname: "", bornDate: "" } })
      )
    ).toBe("Add a surname");
    expect(personProblem(named())).toMatch(/Fill in this person’s address/);
    expect(personProblem(named({ noAddress: true }))).toMatch(
      /Fill in this person’s vehicle/
    );
    expect(
      personProblem(named({ noAddress: true, noVehicle: true }))
    ).toBeNull();
    expect(
      personProblem(named({ address: fullAddr(), vehicle: fullVeh() }))
    ).toBeNull();
  });

  it("a resident who lives at the target's address needs no address of their own", () => {
    expect(
      personProblem(named({ addressFollowsTarget: true, noVehicle: true }))
    ).toBeNull();
  });

  it("a business can stand in for an associate's name", () => {
    const biz = person({
      address: addr({ businessName: "Pacific Route Services" }),
    });
    expect(
      personProblem({ ...biz, noAddress: true, noVehicle: true })
    ).toBeNull();
  });

  it("the list needs a person or the none tick", () => {
    const label = (p: PersonLike) => p.identity.firstNames || "New resident";
    expect(peopleProblem([person()], false, "resident", label)).toMatch(
      /No other residents/
    );
    expect(peopleProblem([person()], true, "resident", label)).toBeNull();
    expect(peopleProblem([named()], true, "associate", label)).toMatch(
      /Clear the associates/
    );
    expect(peopleProblem([named()], false, "associate", label)).toBe(
      "Paul: fill in this person’s address, or tick “No known address”."
    );
  });
});

describe("steps", () => {
  it("a complete form is done on every tab", () => {
    const i = input();
    expect(firstOpenStep(i)).toBeNull();
    expect(stepStatus(i, "residents")).toBe("none");
    expect(stepStatus(i, "associates")).toBe("none");
    expect(stepStatus(i, "background")).toBe("done");
    expect(canEnterStep(i, "background")).toBe(true);
  });

  it("the Target tab needs an operation, a name, MDL, and address + vehicle (or none)", () => {
    expect(stepStatus(input({ hasOperation: false }), "target")).toBe("todo");
    expect(stepStatus(input({ mdlChosen: false }), "target")).toBe("todo");
    expect(
      stepStatus(
        input({ identity: { firstNames: "A", surname: "", bornDate: "" } }),
        "target"
      )
    ).toBe("todo");
    expect(
      stepStatus(input({ address: addr(), noAddress: false }), "target")
    ).toBe("todo");
    expect(
      stepStatus(input({ address: addr(), noAddress: true }), "target")
    ).toBe("done");
    expect(
      stepStatus(input({ vehicle: veh(), noVehicle: true }), "target")
    ).toBe("done");
  });

  it("a Vehicle target is identified by the vehicle, with an optional address", () => {
    const base = {
      targetType: "vehicle" as const,
      identity: { firstNames: "", surname: "", bornDate: "" },
      mdlChosen: false,
    };
    expect(stepStatus(input({ ...base, vehicle: veh() }), "target")).toBe(
      "todo"
    );
    expect(stepStatus(input(base), "target")).toBe("done");
    expect(
      stepStatus(input({ ...base, address: addr(), noAddress: true }), "target")
    ).toBe("done");
  });

  it("a Vehicle target asks about the vehicle before the address (screen order)", () => {
    const i = input({
      targetType: "vehicle",
      identity: { firstNames: "", surname: "", bornDate: "" },
      mdlChosen: false,
      vehicle: veh(),
      address: addr(),
      noAddress: false,
    });
    expect(targetStepProblem(i)).toMatch(
      /registration, colour, make and model/
    );
  });

  it("a Location target is identified by the address, with an optional vehicle", () => {
    const base = {
      targetType: "location" as const,
      identity: { firstNames: "", surname: "", bornDate: "" },
      mdlChosen: false,
    };
    expect(stepStatus(input({ ...base, address: addr() }), "target")).toBe(
      "todo"
    );
    expect(
      stepStatus(input({ ...base, vehicle: veh(), noVehicle: true }), "target")
    ).toBe("done");
  });

  it("tabs open in order", () => {
    const i = input({ mdlChosen: false });
    expect(firstOpenStep(i)).toBe("target");
    expect(canEnterStep(i, "target")).toBe(true);
    expect(canEnterStep(i, "residents")).toBe(false);
    const j = input({ noResidents: false });
    expect(firstOpenStep(j)).toBe("residents");
    expect(canEnterStep(j, "associates")).toBe(false);
    expect(canEnterStep(j, "residents")).toBe(true);
  });

  it("background needs text or the none tick", () => {
    expect(stepStatus(input({ background: "" }), "background")).toBe("todo");
    expect(
      stepStatus(input({ background: "", noBackground: true }), "background")
    ).toBe("none");
    expect(
      stepStatus(input({ background: "x", noBackground: true }), "background")
    ).toBe("todo");
  });
});
