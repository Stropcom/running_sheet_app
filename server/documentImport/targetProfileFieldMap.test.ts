import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { readDocxTables } from "./docxTableReader";
import { mapDocxToTargetProfile } from "./targetProfileFieldMap";

const FIXTURE_PATH = join(
  __dirname,
  "__fixtures__/target-profile-training.docx"
);
const PAYNE_FIXTURE_PATH = join(
  __dirname,
  "__fixtures__/target-profile-training-payne.docx"
);

describe("mapDocxToTargetProfile", () => {
  it("maps the real training document end-to-end", async () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const read = await readDocxTables(buffer);
    const result = mapDocxToTargetProfile(read);

    expect(result.name).toMatchObject({
      firstNames: "John Alawishes",
      surname: "DOE",
      bornDate: "21/09/1992",
      confident: true,
    });

    expect(result.vehicles).toHaveLength(2);
    expect(result.vehicles[0]).toMatchObject({
      registration: "1ABC123",
      make: "Toyota",
      model: "Landcruiser",
    });
    expect(result.vehicles[1]).toMatchObject({
      registration: "1KEEPUP",
      make: "Yamaha",
      model: "YZF",
    });

    expect(result.addresses).toHaveLength(2);
    expect(result.addresses[0]).toMatchObject({
      label: "Current Address",
      houseNo: "3",
      streetName: "Appletree",
      suburb: "WOODVALE",
    });
    expect(result.addresses[1]).toMatchObject({
      label: "Previous Address",
      houseNo: "58",
      streetName: "Explorer",
      suburb: "YANCHEP",
    });

    expect(result.unmappedFields).toContainEqual({
      label: "PROMIS ID",
      value: "7228008",
    });
    // ROLE/COB/OCG/PASSPORT/ALIASES/IDs are blank in the fixture, so should
    // not show up as noise.
    expect(result.unmappedFields).toHaveLength(1);

    expect(result.freeText).toContain("Ryan FORBES");
    expect(result.freeText).toContain("Container DFSU1205246");

    const types = result.candidateEntities.map(c => c.type);
    expect(types).toContain("person");
    expect(types).toContain("business");
    expect(types).toContain("email");
    expect(types).toContain("phone");
    expect(result.candidateEntities.some(c => c.value === "Ryan FORBES")).toBe(
      true
    );
  });

  // Regression test for a real bug report: a second real training document
  // (PAYNE) has an "Associates:" block in its Summary cell — a name on its
  // own line followed by that person's address (with no state code) and
  // vehicle on the next two lines. The first version of this pipeline
  // dropped both the address and vehicle entirely, AND falsely matched the
  // all-caps suburb "WHITE GUM VALLEY" as if it were a second person's name
  // (since the person regex only checked the leading letter was uppercase,
  // not that the rest of the word was lowercase).
  it("attaches an associate's address and vehicle from a free-text block, without false-positiving on an all-caps suburb", async () => {
    const buffer = readFileSync(PAYNE_FIXTURE_PATH);
    const read = await readDocxTables(buffer);
    const result = mapDocxToTargetProfile(read);

    expect(result.name).toMatchObject({
      firstNames: "Thomas David",
      surname: "PAYNE",
      bornDate: "29/09/2005",
    });

    expect(result.associateBlocks).toHaveLength(1);
    expect(result.associateBlocks[0]).toMatchObject({
      firstNames: "David",
      surname: "GRAY",
    });
    expect(result.associateBlocks[0].address).toMatchObject({
      houseNo: "103",
      streetName: "Watkins",
      streetType: "Street",
      suburb: "WHITE GUM VALLEY",
      state: "WA",
    });
    expect(result.associateBlocks[0].vehicle).toMatchObject({
      registration: "1GHF389",
      state: "WA",
      colour: "Red",
      make: "BYD",
      model: "Sealion 6",
    });

    // "WHITE GUM VALLEY" must not also show up as a bogus second person —
    // and "David GRAY" must not be duplicated as a bare candidate now that
    // it's captured as a full associate block above.
    const personValues = result.candidateEntities
      .filter(c => c.type === "person")
      .map(c => c.value);
    expect(personValues).not.toContain("WHITE GUM VALLEY");
    expect(personValues).not.toContain("David GRAY");
  });
});
