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
const ECHOPOINT_FIXTURE_PATH = join(
  __dirname,
  "__fixtures__/target-profile-training-echopoint.docx"
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

  it("reports an empty needsReview for both real fixtures — no false positives", async () => {
    const trainingResult = mapDocxToTargetProfile(
      await readDocxTables(readFileSync(FIXTURE_PATH))
    );
    expect(trainingResult.needsReview).toEqual([]);

    const payneResult = mapDocxToTargetProfile(
      await readDocxTables(readFileSync(PAYNE_FIXTURE_PATH))
    );
    expect(payneResult.needsReview).toEqual([]);
  });

  // A document doesn't always introduce an associate with "Associates:" —
  // sometimes there's no title at all, sometimes it's a relationship word
  // ("Mum", "Dad", ...) instead. Both still need to anchor a full
  // name+address+vehicle block end-to-end through the orchestrator, not
  // just at the matchWholeLinePersonName unit level.
  it("finds an associate block with no title and one introduced by a relationship word", () => {
    const result = mapDocxToTargetProfile({
      tables: [
        {
          rows: [["", "SUMMARY"]],
        },
        {
          rows: [
            [
              "",
              "Jane SMITH\n123 Example Street, PERTH WA 6000\n1ABC123 (WA) blue Toyota Camry sedan\n\nDad - John SMITH\n45 Other Road, FREMANTLE WA 6160",
            ],
          ],
        },
      ],
      paragraphs: [],
    });

    expect(result.associateBlocks).toHaveLength(2);
    expect(result.associateBlocks[0]).toMatchObject({
      firstNames: "Jane",
      surname: "SMITH",
    });
    expect(result.associateBlocks[0].vehicle).toMatchObject({
      registration: "1ABC123",
    });
    expect(result.associateBlocks[1]).toMatchObject({
      firstNames: "John",
      surname: "SMITH",
    });
    expect(result.associateBlocks[1].address).toMatchObject({
      houseNo: "45",
      streetName: "Other",
      suburb: "FREMANTLE",
    });
  });

  // Regression test for a real bug report: a third real training document
  // (ECHOPOINT) is written as headed paragraphs and a two-column table
  // whose cells each carry their own mini-heading — a genuinely different
  // shape from the first two fixtures' row-pair tables. Before the
  // paragraph-heading and table-cell-section fallbacks, this document's
  // name, addresses and vehicles were all silently dropped, and its
  // associates (written as one dense paragraph per person, not a vertical
  // block) fell apart into disconnected mentions instead of linked
  // records.
  it("maps a headed-paragraph document with cell-embedded sub-sections and dash-separated associates", async () => {
    const buffer = readFileSync(ECHOPOINT_FIXTURE_PATH);
    const read = await readDocxTables(buffer);
    const result = mapDocxToTargetProfile(read);

    // Subject found via the "1. SUBJECT" heading, not a NAME table row.
    expect(result.name).toMatchObject({
      firstNames: "Aisha Noor",
      surname: "RAHMAN",
      bornDate: "27/06/1993",
      confident: true,
    });

    // Vehicles found inside a table cell that bundles its own "VEHICLES"
    // mini-heading with three content lines — not a row-pair label/value.
    expect(result.vehicles).toHaveLength(3);
    expect(result.vehicles[0]).toMatchObject({
      registration: "1ANR693",
      colour: "White",
      make: "Volvo",
      model: "XC60",
    });
    expect(result.vehicles[1]).toMatchObject({
      registration: "1ECP118",
      colour: "Black",
      make: "Toyota",
      model: "Prado",
    });
    expect(result.vehicles[2]).toMatchObject({
      registration: "1NRH440",
      colour: "Red",
      make: "Mazda",
    });

    // Addresses found the same way, each correctly labelled from
    // "<Label>: <address>" sharing one line — not a label-only line
    // followed by the address on the next.
    expect(result.addresses).toHaveLength(4);
    expect(result.addresses[0]).toMatchObject({
      label: "Current Address",
      houseNo: "27",
      streetName: "Davy",
      suburb: "ALFRED COVE",
    });
    expect(result.addresses[1]).toMatchObject({
      label: "Previous Address",
      houseNo: "9",
      streetName: "Araluen",
      suburb: "DIANELLA",
    });
    // O'CONNOR — the suburb apostrophe that used to break the match
    // entirely (no suburb match at all, not just a mis-split one).
    expect(result.addresses[2]).toMatchObject({
      label: "Business Address",
      houseNo: "101",
      unitNo: "4",
      streetName: "Garling",
      suburb: "O'CONNOR",
    });
    expect(result.addresses[3]).toMatchObject({
      label: "Frequented Address",
      houseNo: "71",
      streetName: "Robinson",
      suburb: "BELMONT",
    });

    // Associates written as one dense paragraph each ("Name - address.
    // Vehicle: X. Mobile: Y. Email: Z.") rather than a vertical block —
    // both still resolve to a full name+address+vehicle record.
    expect(result.associateBlocks).toHaveLength(2);
    expect(result.associateBlocks[0]).toMatchObject({
      firstNames: "Benjamin Cole",
      surname: "WATTS",
    });
    expect(result.associateBlocks[0].address).toMatchObject({
      houseNo: "44",
      streetName: "Brandon",
      suburb: "SOUTH PERTH",
    });
    expect(result.associateBlocks[0].vehicle).toMatchObject({
      registration: "1BCW552",
      colour: "Grey",
      make: "Toyota",
    });
    expect(result.associateBlocks[1]).toMatchObject({
      firstNames: "Farah Yasmin",
      surname: "KHOURY",
    });
    expect(result.associateBlocks[1].address).toMatchObject({
      houseNo: "16A",
      streetName: "Flinders",
      suburb: "YOKINE",
    });
    expect(result.associateBlocks[1].vehicle).toMatchObject({
      registration: "1FYK813",
      colour: "Blue",
      make: "Kia",
    });

    // Nothing silently lost — every vehicle/address the document clearly
    // meant either parsed cleanly or would have shown up here.
    expect(result.needsReview).toEqual([]);

    // The subject's own resolved name doesn't also show up as a duplicate
    // low-confidence candidate mention alongside the associates.
    const personValues = result.candidateEntities
      .filter(c => c.type === "person")
      .map(c => c.value);
    expect(personValues).not.toContain("Aisha Noor RAHMAN");
  });
});

describe("mapDocxToTargetProfile — needsReview", () => {
  // A "LOCATION OF INTEREST" line under a recognised sub-label that matches
  // neither parseAddressLine nor its loose fallback (no leading house
  // number, e.g. a corner address) used to just vanish. It should now be
  // reported so the officer knows something was there.
  it("reports an address line under a label that nothing could parse", () => {
    const result = mapDocxToTargetProfile({
      tables: [
        {
          rows: [
            [
              "",
              "LOCATION OF INTEREST",
              "Current Address:\nCnr Marmion Street and Preston Point Road, EAST FREMANTLE WA.",
            ],
          ],
        },
      ],
      paragraphs: [],
    });
    expect(result.addresses).toEqual([]);
    expect(result.needsReview).toEqual([
      {
        kind: "address",
        label: "Current Address",
        raw: "Cnr Marmion Street and Preston Point Road, EAST FREMANTLE WA.",
      },
    ]);
  });

  // A second vehicle whose own "<token> (<STATE>)" anchor has a stray
  // comma before the bracket ("SLICK1, (WA) ...") used to get silently
  // swallowed into the first vehicle's description — vehicleLineParser.ts
  // now tolerates that comma directly, so both anchor independently and
  // neither needs the needsReview safety net below.
  it("splits a comma-before-bracket vehicle into its own entry, not a needsReview fallback", () => {
    const result = mapDocxToTargetProfile({
      tables: [
        {
          rows: [
            [
              "",
              "VEHICLES",
              "1KINGZ (WA) 2021 white BMW X5 4WD\n\nSLICK1, (WA) 2019 black Audi RS3 hatch",
            ],
          ],
        },
      ],
      paragraphs: [],
    });
    expect(result.vehicles).toHaveLength(2);
    expect(result.vehicles[0]).toMatchObject({
      registration: "1KINGZ",
      make: "BMW",
      model: "X5",
    });
    expect(result.vehicles[1]).toMatchObject({
      registration: "SLICK1",
      make: "Audi",
      model: "RS3",
    });
    expect(result.needsReview).toEqual([]);
  });

  // A VEHICLES cell with real content but no "(<STATE>)" anchor at all
  // (e.g. "Rego 1MXP920, ..." with the state never bracketed) currently
  // produces zero vehicle entries — the whole cell should be reported.
  it("reports a whole VEHICLES cell with no anchor at all", () => {
    const result = mapDocxToTargetProfile({
      tables: [
        {
          rows: [
            ["", "VEHICLES", "Rego 1MXP920, red Mazda 3 hatch, parked at rear"],
          ],
        },
      ],
      paragraphs: [],
    });
    expect(result.vehicles).toEqual([]);
    expect(result.needsReview).toEqual([
      {
        kind: "vehicle",
        label: "",
        raw: "Rego 1MXP920, red Mazda 3 hatch, parked at rear",
      },
    ]);
  });

  it("reports nothing for a blank VEHICLES cell", () => {
    const result = mapDocxToTargetProfile({
      tables: [{ rows: [["", "VEHICLES", ""]] }],
      paragraphs: [],
    });
    expect(result.needsReview).toEqual([]);
  });
});
