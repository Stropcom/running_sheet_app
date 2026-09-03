import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { readDocxTables } from "./docxTableReader";
import { readPdfText } from "./pdfTextReader";
import { mapDocumentToTargetProfile } from "./targetProfileFieldMap";

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
const LANTERN_FIXTURE_PATH = join(
  __dirname,
  "__fixtures__/target-profile-training-lantern.docx"
);
const QUARRY_FIXTURE_PATH = join(
  __dirname,
  "__fixtures__/target-profile-training-quarry.docx"
);
const BLUEGUM_FIXTURE_PATH = join(
  __dirname,
  "__fixtures__/target-profile-training-bluegum.docx"
);
const IRONBARK_FIXTURE_PATH = join(
  __dirname,
  "__fixtures__/target-profile-training-ironbark.docx"
);
const PDF_COLON_FIXTURE_PATH = join(
  __dirname,
  "__fixtures__/target-profile-pdf-colon.pdf"
);
const PDF_TABLE_FIXTURE_PATH = join(
  __dirname,
  "__fixtures__/target-profile-pdf-table.pdf"
);
// A real training PDF (Operation HARBOUR) whose narrow-grid DOB row's own
// value cell overran into the next fields' text before the column
// mismatch that would normally stop it ("18 August 1984 OCG Harbour
// Syndicate PASSP ORT UAE Passport N7843 021" instead of just "18 August
// 1984") -- see extractLeadingDob's own comment in targetProfileFieldMap.ts.
const PDF_DOB_OVERRUN_FIXTURE_PATH = join(
  __dirname,
  "__fixtures__/target-profile-pdf-dob-overrun.pdf"
);

describe("mapDocumentToTargetProfile", () => {
  it("maps the real training document end-to-end", async () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const read = await readDocxTables(buffer);
    const result = mapDocumentToTargetProfile(read);

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
    const result = mapDocumentToTargetProfile(read);

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
    const trainingResult = mapDocumentToTargetProfile(
      await readDocxTables(readFileSync(FIXTURE_PATH))
    );
    expect(trainingResult.needsReview).toEqual([]);

    const payneResult = mapDocumentToTargetProfile(
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
    const result = mapDocumentToTargetProfile({
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
    const result = mapDocumentToTargetProfile(read);

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
    expect(result.associateBlocks).toHaveLength(5);
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

    // A business sharing the same dense-paragraph shape as a person
    // associate ("Name - address. Telephone: X. Training ABN: Y.") —
    // businessName takes the place of firstNames/surname, the address
    // resolves the same way, and the telephone/ABN clauses that follow are
    // never claimed by anything rather than bleeding into the name.
    expect(result.associateBlocks[2]).toMatchObject({
      firstNames: "",
      surname: "",
      businessName: "Echo Point Technology Pty Ltd",
    });
    expect(result.associateBlocks[2].address).toMatchObject({
      houseNo: "101",
      unitNo: "4",
      streetName: "Garling",
      suburb: "O'CONNOR",
    });

    // Two more businesses in the same section, written under their plain
    // trading name with no legal suffix at all — findDashSeparatedEntities'
    // last-resort fallback, tried only once neither the person shape nor
    // the suffixed-business shape matched.
    expect(result.associateBlocks[3]).toMatchObject({
      firstNames: "",
      surname: "",
      businessName: "West Coast Device Supply",
    });
    expect(result.associateBlocks[3].address).toMatchObject({
      houseNo: "220",
      unitNo: "3",
      streetName: "Albany",
      suburb: "VICTORIA PARK",
    });
    expect(result.associateBlocks[4]).toMatchObject({
      firstNames: "",
      surname: "",
      businessName: "Harbourline Rentals",
    });
    expect(result.associateBlocks[4].address).toMatchObject({
      houseNo: "12",
      streetName: "Queen Victoria",
      suburb: "FREMANTLE",
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

  // Regression: a third real training document (LANTERN) uses "SUBJECT" as
  // the table label for the person's name/DOB row instead of "NAME" — the
  // subject was silently dropped entirely (both the table lookup and the
  // paragraph-heading fallback only recognised "NAME"). It also has a
  // business associate written under its plain trading name, with no
  // "Pty Ltd"/"Ltd"/... suffix at all ("Westline Freight Solutions"),
  // unlike the ECHOPOINT fixture's suffixed "Echo Point Technology Pty
  // Ltd" — findDashSeparatedBusinesses' required suffix meant this business
  // matched neither the person shape nor the business shape and vanished
  // entirely.
  it("maps a document using SUBJECT (not NAME) for the subject, and a business associate with no legal suffix", async () => {
    const buffer = readFileSync(LANTERN_FIXTURE_PATH);
    const read = await readDocxTables(buffer);
    const result = mapDocumentToTargetProfile(read);

    expect(result.name).toMatchObject({
      firstNames: "Mia Elizabeth",
      surname: "HART",
      bornDate: "14/02/1986",
      confident: true,
    });

    const westline = result.associateBlocks.find(
      a => a.businessName === "Westline Freight Solutions"
    );
    expect(westline).toBeDefined();
    expect(westline!.address).toMatchObject({
      houseNo: "5",
      streetName: "Kewdale",
      suburb: "KEWDALE",
    });

    // The suffixed business from the same section still resolves too — the
    // new no-suffix fallback doesn't come at the cost of the existing shape.
    const pacificRoute = result.associateBlocks.find(
      a => a.businessName === "Pacific Route Services Pty Ltd"
    );
    expect(pacificRoute).toBeDefined();
  });

  // Regression: a fourth real training document (QUARRY) bundles its whole
  // subject card into a single table cell — "Target\nOliver James BISHOP\n
  // DOB: 03/11/1990\nCOB: United Kingdom\nRole: Finance facilitator" — a
  // shape not seen in the other three fixtures. Two compounding bugs hid
  // the subject entirely: isHeadingLine didn't recognise a bare "Target"
  // line as a heading (it isn't ALL-CAPS like every other heading in this
  // document family), and even once it did, "DOB: 03/11/1990" was itself
  // misread as a second heading (no lowercase letters, so it passed the
  // ALL-CAPS rule), splitting the section apart right after the name.
  // Separately, findSubjectFromParagraphs gave up entirely at the first
  // SUBJECT-matching heading it found — this document's own title line,
  // "PERSON OF INTEREST PROFILE - TRAINING DATA", which has no lines under
  // it — instead of trying the real "Target" section further down.
  it("maps a document whose subject card is bundled into one table cell under a bare 'Target' heading", async () => {
    const buffer = readFileSync(QUARRY_FIXTURE_PATH);
    const read = await readDocxTables(buffer);
    const result = mapDocumentToTargetProfile(read);

    expect(result.name).toMatchObject({
      firstNames: "Oliver James",
      surname: "BISHOP",
      bornDate: "03/11/1990",
      confident: true,
    });

    // The same document's "ADDRESS REGISTER" section is a real table with
    // each sub-label as its own row ([label, address]) rather than one
    // cell bundling every address under a single "LOCATION OF INTEREST"
    // label — findAddressRegisterRows' shape.
    expect(result.addresses).toHaveLength(4);
    expect(result.addresses[0]).toMatchObject({
      label: "Current Address",
      houseNo: "64",
      streetName: "Matheson",
      suburb: "APPLECROSS",
    });
    expect(result.addresses[1]).toMatchObject({
      label: "Previous Address",
      houseNo: "14A",
      streetName: "Lawler",
      suburb: "NORTH PERTH",
    });
    expect(result.addresses[2]).toMatchObject({
      label: "Office Address",
      unitNo: "4",
      houseNo: "18",
      streetName: "Riseley",
      suburb: "ARDROSS",
    });
    expect(result.addresses[3]).toMatchObject({
      label: "Secondary Location",
      houseNo: "31",
      streetName: "Division",
      suburb: "WELSHPOOL",
    });

    // The document's associates are a real 4-column table ("PERSON /
    // ENTITY | RELATIONSHIP | LOCATION / VEHICLE | CONTACT / IDENTIFIER")
    // rather than a dash-separated or vertical-block paragraph —
    // findAssociateTableRows' shape. Two person rows and two business rows
    // (no legal suffix on either), each with its address/vehicle pulled
    // out of the shared detail cell.
    expect(result.associateBlocks).toHaveLength(4);
    const tan = result.associateBlocks.find(a => a.surname === "TAN");
    expect(tan).toMatchObject({ firstNames: "Emily Grace", surname: "TAN" });
    expect(tan!.address).toMatchObject({ houseNo: "8A", suburb: "MELVILLE" });
    expect(tan!.vehicle).toMatchObject({ registration: "1EGT221" });

    const donovan = result.associateBlocks.find(a => a.surname === "DONOVAN");
    expect(donovan!.address).toMatchObject({
      houseNo: "31",
      suburb: "WELSHPOOL",
    });
    expect(donovan!.vehicle).toMatchObject({ registration: "1MDV730" });

    const blueArc = result.associateBlocks.find(
      a => a.businessName === "Blue Arc Imports Pty Ltd"
    );
    expect(blueArc!.address).toMatchObject({
      unitNo: "6",
      houseNo: "73",
      suburb: "OSBORNE PARK",
    });

    const northernGate = result.associateBlocks.find(
      a => a.businessName === "Northern Gate Trading"
    );
    expect(northernGate!.address).toMatchObject({
      houseNo: "19",
      suburb: "BELLEVUE",
    });

    // Now that the real associate table is read, TAN/DONOVAN's own bare
    // narrative mentions (repeated across the case narrative and the
    // observation log) don't also surface as duplicate low-confidence
    // candidates.
    const personCandidates = result.candidateEntities
      .filter(c => c.type === "person")
      .map(c => c.value);
    expect(personCandidates).not.toContain("Emily Grace TAN");
    expect(personCandidates).not.toContain("Marcus Lee DONOVAN");

    // Regression: "silver Lexus NX wagon" used to read as a bare person
    // candidate ("Lexus" as a firstname, "NX" as an ALL-CAPS surname) —
    // same false-positive class as "Mazda CX" found earlier this session.
    expect(personCandidates).not.toContain("Lexus NX");
  });

  it("maps a document whose identity block is a column-headed table, without garbling its reference codes into fake associates", async () => {
    const buffer = readFileSync(BLUEGUM_FIXTURE_PATH);
    const read = await readDocxTables(buffer);
    const result = mapDocumentToTargetProfile(read);

    // The identity block has no NAME/SUBJECT label:value row at all — it's
    // a header row ("PRIMARY IDENTITY | OPERATIONAL DESCRIPTION |
    // REFERENCE IDENTIFIERS") followed by one data row underneath, name
    // included — findIdentityColumnTableValue's shape.
    expect(result.name).toMatchObject({
      firstNames: "Leila Mariam",
      surname: "HASSAN",
      confident: true,
    });

    // Regression: a compact reference/event code with no surrounding
    // whitespace around its hyphen ("Reference BLU-7719", "BLU-E01— ...")
    // used to be misread by the last-resort dash matcher as a "<name> -
    // <detail>" associate line, producing a fake "BLU" business associate
    // that also swallowed a real address into a garbled vehicle field.
    expect(result.associateBlocks.some(a => a.businessName === "BLU")).toBe(
      false
    );

    const personCandidates = result.candidateEntities
      .filter(c => c.type === "person")
      .map(c => c.value);

    // Regression: "Operation BLUEGUM" / "Reference BLU" (a Title-Case word
    // immediately followed by an ALL-CAPS code) used to match the same
    // shape as a real name and surface as fake person candidates.
    expect(personCandidates).not.toContain("Operation BLUEGUM");
    expect(personCandidates).not.toContain("Reference BLU");

    // Regression: the same two real associates are named across four
    // different sections of this document (an entity register table, the
    // narrative, a communications table, an event cross-reference list) —
    // each used to surface as its own separate low-confidence candidate
    // instead of being recognised as the same person.
    expect(personCandidates.filter(v => v === "Marcus Anthony DUNN")).toEqual([
      "Marcus Anthony DUNN",
    ]);
    expect(personCandidates.filter(v => v === "Yasmin Noor ABDALLA")).toEqual([
      "Yasmin Noor ABDALLA",
    ]);

    // Regression: "Contact: Mobile 0491 570 121; email marcus.dunn@..."
    // used to be captured whole as the "phone" value — it now stops at the
    // semicolon that introduces the email clause.
    const phone = result.candidateEntities.find(
      c => c.type === "phone" && c.value.includes("0491 570 121")
    );
    expect(phone?.value).toBe("Mobile 0491 570 121");
  });

  // Regression: a sixth real training document (IRONBARK) has a genuine
  // three-column identity table — "SUBJECT | IDENTIFIERS | CONTACT
  // CHANNELS" as the header row, the actual name/DOB/etc. one row further
  // down under the SUBJECT column (findIdentityColumnTableValue's shape).
  // findLabelledValue(rows, "SUBJECT") doesn't know the difference between
  // that header row and a genuine "SUBJECT: <name>" label:value row (the
  // LANTERN shape, tested above) — on this document it paired "SUBJECT"
  // with the very next cell, "IDENTIFIERS" (the next column's own header),
  // producing a garbled name ("IDENTIFIERS" / "") instead of ever reaching
  // findIdentityColumnTableValue at all. The subject then fell through
  // entirely to the free-text associate scan, showing up as just another
  // "Associate Found" alongside the two people he was mentioned with.
  it("maps a document whose SUBJECT cell is a column-table header, not a label:value row (the IRONBARK bug)", async () => {
    const buffer = readFileSync(IRONBARK_FIXTURE_PATH);
    const read = await readDocxTables(buffer);
    const result = mapDocumentToTargetProfile(read);

    expect(result.name).toMatchObject({
      firstNames: "Callum Peter",
      surname: "REID",
      confident: true,
    });

    // The DOB sits inline inside the same multi-line SUBJECT cell as the
    // name ("Callum Peter REID\nDOB 06 December 1982\n...") in prose-date
    // form, not a separate "DOB" table row and not the numeric d/m/y shape
    // DOB_RE alone recognised — see matchDob/DOB_PROSE_RE.
    expect(result.name?.bornDate).toBe("06/12/1982");

    // The real CURRENT ADDRESS (from a genuine "CURRENT ADDRESS" table row)
    // must come through, and REID's own name must NOT also show up as a
    // free-text associate candidate now that he's correctly recognised as
    // the primary subject.
    expect(result.addresses).toContainEqual(
      expect.objectContaining({
        label: "CURRENT ADDRESS",
        houseNo: "26",
        streetName: "Jarrah",
        suburb: "SOUTH LAKE",
      })
    );
    const personCandidates = result.candidateEntities
      .filter(c => c.type === "person")
      .map(c => c.value);
    expect(personCandidates).not.toContain("Callum Peter REID");
    expect(personCandidates).toContain("Olivia Grace MCKENZIE");
    expect(personCandidates).toContain("Tariq Samuel AZIZ");
  });
});

describe("mapDocumentToTargetProfile — needsReview", () => {
  // A "LOCATION OF INTEREST" line under a recognised sub-label that matches
  // neither parseAddressLine nor its loose fallback (no leading house
  // number, e.g. a corner address) used to just vanish. It should now be
  // reported so the officer knows something was there.
  it("reports an address line under a label that nothing could parse", () => {
    const result = mapDocumentToTargetProfile({
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
    const result = mapDocumentToTargetProfile({
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
    const result = mapDocumentToTargetProfile({
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
    const result = mapDocumentToTargetProfile({
      tables: [{ rows: [["", "VEHICLES", ""]] }],
      paragraphs: [],
    });
    expect(result.needsReview).toEqual([]);
  });

  // Found reviewing a real training document (IRONBARK): its subject was
  // declared as "Subject: Callum Peter REID • Reporting period: 04–19
  // August 2026" — one narrative line inside an unrelated "OPERATION
  // IRONBARK" brief, not a NAME/SUBJECT table row and not a bare "Subject"
  // heading paragraph with the name on its own line underneath (the two
  // shapes findSubjectFromParagraphs already handles). With no name
  // detected at all, REID never became the primary target — he fell
  // through to the free-text associate scan and showed up as just another
  // "Associate Found" alongside everyone else he was mentioned with.
  it("finds the subject from an inline 'Subject: <name>' narrative line (the IRONBARK bug)", () => {
    const result = mapDocumentToTargetProfile({
      tables: [],
      paragraphs: [
        "OPERATION IRONBARK",
        "Subject: Callum Peter REID • Reporting period: 04–19 August 2026",
        "Callum Peter REID is recorded as a procurement consultant associated with Ironbark Commercial Advisory.",
      ],
    });
    expect(result.name).toMatchObject({
      firstNames: "Callum Peter",
      surname: "REID",
      confident: true,
    });
  });

  it("doesn't mistake an email header's own 'Subject:' line for a person's name", () => {
    const result = mapDocumentToTargetProfile({
      tables: [],
      paragraphs: ["From: ops@example.com", "Subject: RE: quarterly review"],
    });
    expect(result.name).toBeNull();
  });
});

// A .pdf goes through a different reader (pdfTextReader.ts, which
// reconstructs structure from on-page text position instead of walking a
// real <w:tbl> tree) but must land on the same mapDocumentToTargetProfile
// pipeline and produce the same shape of result — these two fixtures carry
// identical content in the two real-world shapes a typed-text PDF actually
// uses (see pdfTextReader.test.ts's own module comment), proving the two
// readers are interchangeable inputs to the mapper.
describe("mapDocumentToTargetProfile — PDF documents", () => {
  it("maps a colon-style PDF (NAME: value) end-to-end", async () => {
    const read = await readPdfText(readFileSync(PDF_COLON_FIXTURE_PATH));
    const result = mapDocumentToTargetProfile(read);

    expect(result.name).toMatchObject({
      firstNames: "Sarah Jane",
      surname: "MILLER",
      bornDate: "14/03/1990",
      confident: true,
    });
    expect(result.unmappedFields).toContainEqual({
      label: "PROMIS ID",
      value: "5551234",
    });
    expect(result.unmappedFields).toContainEqual({
      label: "ROLE",
      value: "Person of Interest",
    });
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0]).toMatchObject({
      houseNo: "22",
      streetName: "Bridge",
      streetType: "Road",
    });
  });

  it("maps a two-column table-style PDF (no colon) to the same result", async () => {
    const read = await readPdfText(readFileSync(PDF_TABLE_FIXTURE_PATH));
    const result = mapDocumentToTargetProfile(read);

    expect(result.name).toMatchObject({
      firstNames: "Sarah Jane",
      surname: "MILLER",
      bornDate: "14/03/1990",
      confident: true,
    });
    expect(result.unmappedFields).toContainEqual({
      label: "PROMIS ID",
      value: "5551234",
    });
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0]).toMatchObject({
      houseNo: "22",
      streetName: "Bridge",
      streetType: "Road",
    });
  });

  it("extracts just the date from a DOB row whose value overran into the next field's text, instead of failing validation on the raw string", async () => {
    // Regression: passing the whole overrun string through as bornDate
    // doesn't just read oddly on the review screen -- it fails the Date
    // of birth field's own dd/mm/yyyy validation outright and blocks the
    // officer from continuing.
    const read = await readPdfText(readFileSync(PDF_DOB_OVERRUN_FIXTURE_PATH));
    const result = mapDocumentToTargetProfile(read);

    expect(result.name).toMatchObject({
      firstNames: "Rafiq Hassan",
      surname: "KADER",
      bornDate: "18/08/1984",
      confident: true,
    });
  });
});
