import { describe, expect, it } from "vitest";
import { bareAliasOwner } from "../shared/aliasSeeding";

const SANTOS = "Miguel Andres SANTOS, born 30 March 1982 (SANTOS)";

describe("bareAliasOwner", () => {
  it("an alias carried by one person is credited to them everywhere", () => {
    expect(
      bareAliasOwner({ alias: "SANTOS", sharedBy: 1, mappedName: SANTOS })
    ).toBe(SANTOS);
  });

  it("a shared surname is credited to nobody from a bare word", () => {
    expect(
      bareAliasOwner({ alias: "SANTOS", sharedBy: 2, mappedName: SANTOS })
    ).toBeNull();
  });

  it("…except on the sheet opened for one of them: their bare surname is that target", () => {
    expect(
      bareAliasOwner({
        alias: "SANTOS",
        sharedBy: 3,
        mappedName: "Rosa Maria SANTOS",
        ownTarget: { name: SANTOS, alias: "santos" },
      })
    ).toBe(SANTOS);
  });

  it("the sheet's own target does not make a DIFFERENT shared surname credited", () => {
    expect(
      bareAliasOwner({
        alias: "PARK",
        sharedBy: 2,
        mappedName: "Hana PARK",
        ownTarget: { name: SANTOS, alias: "SANTOS" },
      })
    ).toBeNull();
  });

  it("a sheet with no target of its own behaves as before", () => {
    expect(
      bareAliasOwner({
        alias: "PARK",
        sharedBy: 1,
        mappedName: "Soo-Min Hana PARK",
        ownTarget: null,
      })
    ).toBe("Soo-Min Hana PARK");
  });
});
