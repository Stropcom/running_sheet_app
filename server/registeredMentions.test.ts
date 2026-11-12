import { describe, expect, it } from "vitest";
import {
  registeredAddressIn,
  registeredPlatesIn,
  registeredStreet,
  registeredSuburb,
} from "@shared/registeredMentions";

const plates = new Set(["1emb303", "1mas82"]);

describe("registeredPlatesIn", () => {
  it("finds a registered plate written plainly, once", () => {
    expect(
      registeredPlatesIn(
        "Vehicle 1EMB303, SANTOS driving, 1emb303 again",
        plates
      )
    ).toEqual(["1emb303"]);
  });
  it("finds the bare plate", () => {
    expect(registeredPlatesIn("Seen in 1MAS82 on Hay Street", plates)).toEqual([
      "1mas82",
    ]);
  });
  it("ignores a plate that is not registered", () => {
    expect(registeredPlatesIn("Vehicle 1ZZZ999 parked", plates)).toEqual([]);
  });
  it("ignores a plate inside a bracket (the bracket path counts it)", () => {
    expect(registeredPlatesIn("grey sedan (Vehicle 1EMB303)", plates)).toEqual(
      []
    );
  });
  it("does not read part of a longer word", () => {
    expect(registeredPlatesIn("ref 1EMB3031 noted", plates)).toEqual([]);
  });
  it("ignores a measurement even if someone registered it", () => {
    expect(registeredPlatesIn("about 30cm wide", new Set(["30cm"]))).toEqual(
      []
    );
  });
  it("nothing registered, nothing found", () => {
    expect(registeredPlatesIn("Vehicle 1EMB303", new Set())).toEqual([]);
  });
});

describe("registeredSuburb", () => {
  it("reads the suburb from a registry label", () => {
    expect(registeredSuburb("19 Jacaranda Drive, ATTADALE WA")).toBe(
      "ATTADALE"
    );
    expect(registeredSuburb("19 Jacaranda Drive, ATTADALE")).toBe("ATTADALE");
    expect(
      registeredSuburb("19 Jacaranda Drive, BIBRA LAKE WA (19 Jacaranda Drive)")
    ).toBe("BIBRA LAKE");
  });
  it("is null when there is none", () => {
    expect(registeredSuburb("19 Jacaranda Drive")).toBeNull();
    expect(registeredSuburb(null)).toBeNull();
  });
  it("reads a lower-cased key and ignores a postcode", () => {
    expect(registeredSuburb("19 jacaranda drive, attadale wa")).toBe(
      "ATTADALE"
    );
    expect(registeredSuburb("19 Jacaranda Drive, ATTADALE WA 6163")).toBe(
      "ATTADALE"
    );
    expect(registeredSuburb("7 Ocean Drive, southern river wa")).toBe(
      "SOUTHERN RIVER"
    );
  });
});

describe("registeredStreet", () => {
  it("is the part before the first comma", () => {
    expect(registeredStreet("19 Jacaranda Drive, ATTADALE WA")).toBe(
      "19 Jacaranda Drive"
    );
    expect(registeredStreet("19 jacaranda drive, attadale wa")).toBe(
      "19 jacaranda drive"
    );
    expect(registeredStreet("19 Jacaranda Drive")).toBe("19 Jacaranda Drive");
    expect(registeredStreet("19 Jacaranda Drive, ATTADALE (home)")).toBe(
      "19 Jacaranda Drive"
    );
    expect(registeredStreet(null)).toBe("");
  });
  it("a card address is found in a plain sentence through street + suburb", () => {
    const card = "19 jacaranda drive, attadale wa";
    const street = registeredStreet(card);
    const suburb = registeredSuburb(card);
    expect(
      registeredAddressIn(
        "departed 19 Jacaranda Drive and continued via:",
        street,
        suburb
      )
    ).toBe(true);
    expect(
      registeredAddressIn("at 19 Jacaranda Drive, ATTADALE WA", street, suburb)
    ).toBe(true);
    // a different suburb is a different place
    expect(
      registeredAddressIn(
        "at 19 Jacaranda Drive, BIBRA LAKE WA",
        street,
        suburb
      )
    ).toBe(false);
    // a longer number or a unit is a different address
    expect(registeredAddressIn("at 119 Jacaranda Drive", street, suburb)).toBe(
      false
    );
    expect(registeredAddressIn("at 2/19 Jacaranda Drive", street, suburb)).toBe(
      false
    );
  });
  it("a name that is not number-led is never matched in plain text", () => {
    const card = "crown towers, 1 great eastern highway, burswood wa";
    expect(
      registeredAddressIn(
        "went to Crown Towers",
        registeredStreet(card),
        registeredSuburb(card)
      )
    ).toBe(false);
  });
});

describe("registeredAddressIn", () => {
  const street = "19 Jacaranda Drive";
  it("finds the address written plainly", () => {
    expect(
      registeredAddressIn(
        "SANTOS departed 19 Jacaranda Drive and continued via:",
        street,
        "ATTADALE"
      )
    ).toBe(true);
    expect(
      registeredAddressIn("arrived 19 JACARANDA DRIVE", street, "ATTADALE")
    ).toBe(true);
  });
  it("accepts the registered suburb after it", () => {
    expect(
      registeredAddressIn(
        "at 19 Jacaranda Drive, ATTADALE WA",
        street,
        "ATTADALE"
      )
    ).toBe(true);
  });
  it("rejects a different suburb after it", () => {
    expect(
      registeredAddressIn(
        "at 19 Jacaranda Drive, BIBRA LAKE WA",
        street,
        "ATTADALE"
      )
    ).toBe(false);
    expect(
      registeredAddressIn(
        "at 19 Jacaranda Drive, Bibra Lake.",
        street,
        "ATTADALE"
      )
    ).toBe(false);
  });
  it("a surname after the comma is a person, not a different suburb", () => {
    expect(
      registeredAddressIn(
        "at 19 Jacaranda Drive, SANTOS driving",
        street,
        "ATTADALE"
      )
    ).toBe(true);
  });
  it("does not read part of a longer number or a unit", () => {
    expect(
      registeredAddressIn("at 119 Jacaranda Drive", street, "ATTADALE")
    ).toBe(false);
    expect(
      registeredAddressIn("at 2/19 Jacaranda Drive", street, "ATTADALE")
    ).toBe(false);
  });
  it("does not read a different street type or a longer street", () => {
    expect(
      registeredAddressIn("at 19 Jacaranda Driveway", street, "ATTADALE")
    ).toBe(false);
  });
  it("ignores a bracketed mention (the bracket path counts it)", () => {
    expect(
      registeredAddressIn("home (19 Jacaranda Drive)", street, "ATTADALE")
    ).toBe(false);
  });
  it("never matches a place that is not number-led", () => {
    expect(registeredAddressIn("at the park", "the park", null)).toBe(false);
    expect(registeredAddressIn("at HSBC", "HSBC", null)).toBe(false);
  });
  it("with no registered suburb, a plain mention still counts", () => {
    expect(registeredAddressIn("at 19 Jacaranda Drive", street, null)).toBe(
      true
    );
  });
});
