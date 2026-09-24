import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { readPdfText } from "./pdfTextReader";

// Two real generated PDFs (see __fixtures__) carrying the same target-
// profile content in the two real-world shapes a typed-text PDF actually
// uses: a colon-separated label line ("NAME: Sarah Jane MILLER", the shape
// a document typed straight into a PDF-writing tool tends to use), and a
// two-column table row with no colon at all (the shape a .docx's own
// Label/Value table template produces once flattened onto one PDF text
// line by printing/exporting it).
const COLON_FIXTURE = join(
  __dirname,
  "__fixtures__/target-profile-pdf-colon.pdf"
);
const TABLE_FIXTURE = join(
  __dirname,
  "__fixtures__/target-profile-pdf-table.pdf"
);
// A real training PDF (Operation COBALT) whose header block is a genuine
// narrow multi-column grid table — NAME/ROLE/DOB/... label cells barely
// wider than their own content, several label/value pairs side by side on
// one physical row. Its own single-column narrative section ("SUMMARY",
// "Associates:") sits at the exact same left margin as that table's own
// label column, which is what makes this fixture worth keeping: an
// earlier version of the narrow-grid support flagged that shared margin
// as "table-like" globally and swallowed the whole narrative into cell
// reflow along with it (see clusterIntoCells' own comment).
const NARROW_GRID_FIXTURE = join(
  __dirname,
  "__fixtures__/target-profile-pdf-narrow-grid.pdf"
);
// A real training PDF (Operation SILVERBROOK) whose header table is a
// genuine 3-column grid (label/value pairs three-wide on one row). Its
// first value column happens to sit at the exact same x-bucket as a
// completely unrelated, much wider "SUMMARY" narrative sentence elsewhere
// on the page. Two different width-based eligibility checks were each
// tried and each silently dropped the narrow NAME/DOB/ALIASES value cells
// sharing that bucket -- not merging them wrong, just leaving them out of
// the row entirely, since a row that succeeds for its OTHER cells still
// claims the whole source line and nothing re-checks it for stranded
// segments. See clusterIntoCells' own comment for why co-occurrence
// (hasRowMate) is now the only eligibility gate.
const SHARED_BUCKET_FIXTURE = join(
  __dirname,
  "__fixtures__/target-profile-pdf-shared-bucket.pdf"
);
// A real training PDF (Operation TIDELINE) whose "LOCATION OF INTEREST"
// section sits in its own column immediately to the right of VEHICLES, on
// the exact same row -- a genuine two-column layout ("1TLN902 (WA) 2023
// black Lexus NX350h wagon." beside "Current Address: 41 Arbour Street,
// COMO WA 6152.", both wrapping onto their own second line first). Both
// cells' own wrap-continuations are found and rejoined correctly; the bug
// this guards was one level up, in how the ROW itself gets flattened to
// plain text once neither cell is a single recognised label on its own
// (pairRowCells only fires when a whole cell IS a label like "VEHICLES" —
// here both cells already carry their full value, so it declines and the
// row fell back to being read as one flat line): the fallback used to
// flatten every cell's raw pdf.js items into one array and run the same
// columnText() a single physical line would, which inserts nothing at all
// between the last glyph of one cell and the first glyph of the next
// (pdf.js never emits a space glyph across a column gap) -- gluing
// "wagon." straight onto "Current" with zero separator. That glued text
// then defeated vehicleLineParser's own sentence-boundary cutoff (which
// looks for a period followed by whitespace), so the address swallowed
// whole into the vehicle's own model field.
const ADJACENT_COLUMN_FIXTURE = join(
  __dirname,
  "__fixtures__/target-profile-pdf-adjacent-address-column.pdf"
);
// A real training PDF (Operation NIGHTJAR) whose "Associates:" section runs
// one long run-on paragraph per associate (name, address, vehicle, mobile,
// background) stacked as many wrapped physical lines in one ~200pt-wide
// column. clusterIntoCells' own packed-width join heuristic (see
// NARROW_JOIN_MAX_WIDTH) used to treat ordinary wrapped sentences in a
// column this wide as if they were forced mid-word breaks -- normal word-
// wrapping ALSO tends to fill a line close to its own column's widest-ever
// line, which is exactly the same signal the heuristic used to (mis)read as
// "this line ran out of room mid-word". That glued a vehicle sentence's own
// closing "." straight onto the very next fact's label with zero
// separator ("...wagon.Mobile: 0491...", "...Amarok" + "utility." with no
// space at all).
const WIDE_COLUMN_GLUE_FIXTURE = join(
  __dirname,
  "__fixtures__/target-profile-pdf-wide-column-glue.pdf"
);
// A real training PDF (Operation HARBOUR) whose header grid packs its
// label/value pairs only ~14pt apart (NAME/ROLE, tighter than any prior
// fixture's own spacing), and whose "VEHICLES"/"LOCATION OF INTEREST"
// labels sit VERTICALLY CENTRED beside their own tall, multi-line values
// rather than top-aligned with them — a genuinely new layout shape none
// of the fixtures above cover. Caused three compounding failures found
// against the real document: (1) "PASSPORT"/"VEHICLES" hard-wrapped
// mid-word came out with a spurious space ("PASSPO RT"/"VEHICLE S") since
// the packed-width heuristic alone can't tell a narrow forced break from
// a real word-boundary wrap when the SAME x-bucket also carries much
// wider content elsewhere on the page; (2) "ROLE" landed glued onto
// NAME's own value, the gap between them being real but under
// splitLineIntoColumns' 18pt floor; (3) "Current Address:"/"Warehouse:"
// each sat on their own line with no row-mate at their own y (their tall
// value's FIRST line, and an unrelated vehicle line elsewhere, happened
// to share y with each OTHER instead), so the labels were silently
// dropped and their own values ended up glued onto whichever unrelated
// vehicle line coincidentally shared a y — real content loss, not just a
// cosmetic split. See pdfTextReader.ts's KNOWN_VOCABULARY_WORDS/
// isStandaloneColonLabel/resplitEmbeddedLabels and
// targetProfileFieldMap.ts's splitParagraphsIntoSections/
// expandEmbeddedLabels for the fixes.
const VERTICALLY_CENTERED_LABELS_FIXTURE = join(
  __dirname,
  "__fixtures__/target-profile-pdf-vertically-centered-labels.pdf"
);
// A real training PDF (Operation COBALT, "VERSION 3" update of the same
// target the NARROW_GRID_FIXTURE above already covers) with two genuinely
// new bugs found against the real document. First: "VEHICLES" and
// "LOCATION OF INTEREST" sit as two side-by-side wrapped LIST columns
// (several distinct entries each, wrapping to differing numbers of lines),
// so their per-line y-coordinates drift out of sync after the first entry
// -- coincidental y-collisions between unrelated wrapped-continuation
// lines from the two different lists got wrongly merged into one row by
// clusterIntoCells' hasRowMate/row-grouping mechanism, contaminating a
// vehicle description with a stray address fragment (or vice versa) and
// losing part of an address entirely. Fixed via chainEligible: a segment
// lacking its own row-mate can still anchor its own genuine cell if ITS
// OWN wrap-continuation coincidentally has a row-mate elsewhere --
// computed as connected components over the same gap/x-bucket adjacency
// test the existing wrap-join loop already uses, then flooded through
// each chain. Second: the header grid's NAME row has ROLE/COB sitting
// beside it, top-aligned with their own single-line values same as every
// prior fixture -- but NAME's OWN value ("Marcus Andrew" / "VELASCO") is
// vertically CENTRED relative to NAME's own y, so neither of its two
// lines shares NAME's y and the existing hasRowMate-based eligibility
// (even after the chainEligible fix above) never anchors it, dropping the
// surname entirely. Distinct from the already-fixed HARBOUR bug above
// (whole SECTION headings sharing a y, handled at the
// targetProfileFieldMap.ts paragraph-section level) since this is within
// one table ROW, not between two headings. Fixed via
// recoverCenteredLabelValues: once a row's other label/value pairs are
// known, search the gap between a still-unpaired label and its next
// sibling cell for unconsumed lines sitting near the label's own y (not
// necessarily sharing it), then grow a wrap-continuation chain from
// whichever candidate sits closest.
const WRAPPED_LIST_COLUMNS_FIXTURE = join(
  __dirname,
  "__fixtures__/target-profile-pdf-wrapped-list-columns.pdf"
);
// A real training PDF (Operation ORCHARD) whose header grid's third column
// on two separate rows -- PASSPORT (beside DOB/OCG) and PROMIS ID (beside
// ALIASES/IDs) -- hard-wraps BOTH its own label AND its own value into
// short (2-3 line) blocks that straddle the row's shared y symmetrically,
// with neither the label's nor the value's own individual lines landing
// on it (see Cell's own centerY field comment in pdfTextReader.ts). A
// label split this way ("PASSPOR"/"T", "PROMIS"/"ID") never independently
// gets a row-mate of its own, so clusterIntoCells never turns it into a
// cell at all -- the label vanished entirely, dropped as two orphaned
// paragraph fragments, while its own value (which DOES independently
// become a cell, via an unrelated coincidental row-mate elsewhere on the
// page) ends up silently glued onto whichever real label happens to sit
// last in the row instead (PASSPORT's own value onto OCG's, here).
const VERTICALLY_CENTERED_GRID_COLUMN_FIXTURE = join(
  __dirname,
  "__fixtures__/target-profile-pdf-vertically-centered-grid-column.pdf"
);
// A real training PDF (Operation NIGHTJAR) with the exact same header-grid
// shape as the ORCHARD fixture above, but whose own PASSPORT/PROMIS ID
// values happen to land in a DIFFERENT wrong row (sharing one with each
// other, or with an unrelated label fragment, rather than each ending up
// alone) -- worked by pure coincidence on ORCHARD's own layout even before
// reclaimOrphanCells existed, and needed it to be found and fixed here.
const ORPHANED_GRID_VALUE_FIXTURE = join(
  __dirname,
  "__fixtures__/target-profile-pdf-orphaned-grid-value.pdf"
);

describe("readPdfText", () => {
  it("reads colon-separated labelled lines as synthetic table rows", async () => {
    const result = await readPdfText(readFileSync(COLON_FIXTURE));
    expect(result.tables).toHaveLength(1);
    const rows = result.tables[0].rows;

    expect(rows).toContainEqual(["NAME", "Sarah Jane MILLER"]);
    expect(rows).toContainEqual(["DOB", "14/03/1990"]);
    expect(rows).toContainEqual(["PROMIS ID", "5551234"]);
    expect(rows).toContainEqual(["ROLE", "Person of Interest"]);

    // "SUMMARY" and "VEHICLES" are bare section headings, not colon lines —
    // they must NOT become (spurious) table rows, and their content must
    // still show up as paragraph text.
    expect(rows.some(r => r[0] === "SUMMARY")).toBe(false);
    expect(rows.some(r => r[0] === "VEHICLES")).toBe(false);
    const joined = result.paragraphs.join("\n");
    expect(joined).toContain(
      "MILLER has been seen frequenting 22 Bridge Road, Rivertown WA 6100."
    );
    expect(joined).toContain(
      "Red Mazda 3, WA registration 2XYZ789 (Vehicle 2XYZ789)"
    );
  });

  it("reads a two-column table row with no colon (a flattened .docx-style table) the same way", async () => {
    const result = await readPdfText(readFileSync(TABLE_FIXTURE));
    expect(result.tables).toHaveLength(1);
    const rows = result.tables[0].rows;

    expect(rows).toContainEqual(["NAME", "Sarah Jane MILLER"]);
    expect(rows).toContainEqual(["DOB", "14/03/1990"]);
    expect(rows).toContainEqual(["PROMIS ID", "5551234"]);
    expect(rows).toContainEqual(["ROLE", "Person of Interest"]);
    expect(rows).toContainEqual([
      "VEHICLES",
      "Red Mazda 3, WA registration 2XYZ789 (Vehicle 2XYZ789)",
    ]);
  });

  it("gives a section-heading line its own paragraph even without a big vertical gap", async () => {
    // Regression: the first version of this reconstructed paragraphs purely
    // from vertical gaps, so "SUMMARY" (a normal line-height away from the
    // narrative under it) merged into one blob with that narrative instead
    // of becoming its own heading paragraph the way a real Word document's
    // "SUMMARY" paragraph naturally would — which silently broke the
    // heading-based VEHICLES/LOCATION OF INTEREST/SUBJECT lookups
    // targetProfileFieldMap.ts already relies on for headed-paragraph
    // documents.
    const result = await readPdfText(readFileSync(COLON_FIXTURE));
    expect(result.paragraphs).toContain("SUMMARY");
    expect(result.paragraphs).toContain("VEHICLES");
  });

  it("returns an empty result for a non-PDF buffer instead of throwing", async () => {
    const result = await readPdfText(Buffer.from("not a pdf file"));
    expect(result).toEqual({ tables: [], paragraphs: [], images: [] });
  });

  describe("narrow multi-column grid table (Operation COBALT fixture)", () => {
    it("rejoins a word hard-wrapped mid-token by a too-narrow cell, with no hyphen or space to guide it", async () => {
      // "PASSPORT" renders as two stacked lines "PASSPO" / "RT" at the
      // exact same x -- the cell is narrower than the word itself, so it
      // hard-wraps with nothing marking where. Regression: this is the
      // core case none of the shapes above cover at all.
      const result = await readPdfText(readFileSync(NARROW_GRID_FIXTURE));
      const rows = result.tables[0].rows;
      expect(rows.some(r => r[0] === "PASSPORT")).toBe(true);
    });

    it("reunites a value embedded mid-row (not the row's own leftmost cell) with its own wrapped continuation", async () => {
      // "VELASCO" wraps onto its own line below "Marcus Andrew" -- but
      // "Marcus Andrew" itself isn't the row's leftmost item ("NAME" is,
      // with "ROLE"'s own label/value pair sitting to its right on the
      // same physical row). Regression: an earlier version anchored the
      // wrap-continuation search to the whole ROW's own x0 (the label's),
      // never finding the embedded value's own column, and losing the
      // surname off the target's name entirely.
      const result = await readPdfText(readFileSync(NARROW_GRID_FIXTURE));
      const rows = result.tables[0].rows;
      expect(rows).toContainEqual(["NAME", "Marcus Andrew VELASCO"]);
    });

    it("keeps the document's own narrative text flowing as ordinary paragraphs, not swallowed into the grid table", async () => {
      // "Associates: Trent HOLLOWAY <vehicle>" sits at the exact same left
      // margin the grid table's own label column uses. Regression: an
      // earlier version flagged that shared x-position as "table-like" for
      // the WHOLE page once it saw it participate in the real table
      // anywhere, collapsing the entire narrative section into one glued
      // cell and losing "Trent HOLLOWAY" as a standalone line entirely --
      // which findAssociateBlocks (targetProfileFieldMap.ts) depends on to
      // recognise an associate at all.
      const result = await readPdfText(readFileSync(NARROW_GRID_FIXTURE));
      expect(result.paragraphs).toContain("Trent HOLLOWAY");
    });

    it("still reads the document's real two-column DOB/ALIASES-style rows correctly (no regression from the grid-table support)", async () => {
      const result = await readPdfText(readFileSync(NARROW_GRID_FIXTURE));
      const rows = result.tables[0].rows;
      expect(rows.some(r => r[0] === "DOB" && r[1] === "14/03/1985")).toBe(
        true
      );
    });
  });

  describe("3-column grid table sharing an x-bucket with unrelated narrative (Operation SILVERBROOK fixture)", () => {
    it("does not drop a narrow value cell just because its column also holds an unrelated wide narrative line elsewhere on the page", async () => {
      const result = await readPdfText(readFileSync(SHARED_BUCKET_FIXTURE));
      const rows = result.tables[0].rows;
      expect(rows.some(r => r[0] === "NAME" && /CROSS/.test(r[1]))).toBe(true);
      expect(rows.some(r => r[0] === "DOB" && r[1] === "14/03/1987")).toBe(
        true
      );
    });

    it("does not strand a legitimately wide, un-wrapped single-line value (e.g. VEHICLES) just because a row-mate label happens to pass a narrow-width check on its own", async () => {
      // Regression guard for the fix that replaced a per-segment width
      // eligibility check: that attempt fixed SILVERBROOK's NAME row but
      // broke the pre-existing TABLE_FIXTURE's VEHICLES row, because
      // "VEHICLES" (the label) is narrow and has a row-mate (its own
      // value), so it alone claimed the row and stranded its wide value.
      const result = await readPdfText(readFileSync(TABLE_FIXTURE));
      const rows = result.tables[0].rows;
      expect(rows).toContainEqual([
        "VEHICLES",
        "Red Mazda 3, WA registration 2XYZ789 (Vehicle 2XYZ789)",
      ]);
    });
  });

  describe("two value columns sharing one row, neither a recognised label on its own (Operation TIDELINE fixture)", () => {
    it("keeps a space between an unlabelled row's own cells instead of gluing the last word of one cell straight onto the first word of the next", async () => {
      const result = await readPdfText(readFileSync(ADJACENT_COLUMN_FIXTURE));
      const joined = result.paragraphs.join("\n");
      expect(joined).toContain(
        "1TLN902 (WA) 2023 black Lexus NX350h wagon. Current Address:"
      );
      expect(joined).not.toContain("wagon.Current Address:");
    });
  });

  describe("wrapped prose in a column too wide for a genuine mid-word break (Operation NIGHTJAR fixture)", () => {
    it("keeps a space between two wrapped sentences instead of treating an ordinarily-packed line as a forced mid-word break", async () => {
      const result = await readPdfText(readFileSync(WIDE_COLUMN_GLUE_FIXTURE));
      const joined = result.paragraphs.join("\n");
      expect(joined).toContain(
        "1RJM17 (WA) 2020 silver Ford Everest wagon. Mobile: 0491 570 161"
      );
      expect(joined).not.toContain("wagon.Mobile:");
    });

    it("keeps a space between a vehicle's own model and its trailing type word wrapped onto the next line", async () => {
      const result = await readPdfText(readFileSync(WIDE_COLUMN_GLUE_FIXTURE));
      const joined = result.paragraphs.join("\n");
      expect(joined).toContain("grey Volkswagen Amarok utility");
      expect(joined).not.toContain("Amarokutility");
    });

    it("still treats a genuinely narrow single-word column as a forced mid-word break (no regression from widening the join gate)", async () => {
      const result = await readPdfText(readFileSync(NARROW_GRID_FIXTURE));
      const rows = result.tables[0].rows;
      expect(rows.some(r => r[0] === "PASSPORT")).toBe(true);
    });
  });

  describe("vertically-centred labels beside a tall multi-line value (Operation HARBOUR fixture)", () => {
    it("doesn't insert a spurious space rejoining a word hard-wrapped mid-token, even when its own column also carries much wider content elsewhere on the page", async () => {
      const result = await readPdfText(
        readFileSync(VERTICALLY_CENTERED_LABELS_FIXTURE)
      );
      const rows = result.tables[0].rows;
      expect(rows).toContainEqual(["PASSPORT", "UAE Passport N7843021"]);
      const joined = result.paragraphs.join("\n");
      expect(joined).toContain("VEHICLES");
      expect(joined).not.toContain("VEHICLE S");
    });

    it("splits a label from a value it's merged into when their gap is real but under the usual column-split threshold", async () => {
      const result = await readPdfText(
        readFileSync(VERTICALLY_CENTERED_LABELS_FIXTURE)
      );
      const rows = result.tables[0].rows;
      expect(rows).toContainEqual(["NAME", "Rafiq Hassan KADER"]);
      expect(rows).toContainEqual(["ROLE", "Broker"]);
    });

    it("keeps a standalone label and its own multi-line value together instead of dropping the label and losing part of the value to an unrelated line elsewhere on the page", async () => {
      const result = await readPdfText(
        readFileSync(VERTICALLY_CENTERED_LABELS_FIXTURE)
      );
      const joined = result.paragraphs.join("\n");
      expect(joined).toContain(
        "Current Address: 24 Sorrento Street, NORTH BEACH WA 6020."
      );
      expect(joined).toContain(
        "Warehouse: 19 Furnace Road, WELSHPOOL WA 6106."
      );
      // The vehicle these two addresses used to leak into (see the fixed
      // bug) must stay clean, with nothing from the address section stuck
      // onto its own description.
      expect(joined).toContain("1RFK221 (WA) 2022 grey Lexus RX350 wagon");
      expect(joined).not.toContain("wagon BEACH WA 6020");
    });

    it("doesn't glue an unrelated list section (Associates:) into one cell just because it's also a standalone colon-terminated line (no regression from the label-eligibility fix above)", async () => {
      const result = await readPdfText(
        readFileSync(VERTICALLY_CENTERED_LABELS_FIXTURE)
      );
      expect(
        result.paragraphs.some(p => p.startsWith("Matthew John KEARNS"))
      ).toBe(true);
    });
  });

  describe("two side-by-side wrapped list columns + a vertically-centred NAME value (Operation COBALT VERSION 3 fixture)", () => {
    it("keeps a vehicle description clean of a stray address fragment from the adjacent LOCATION OF INTEREST column", async () => {
      const result = await readPdfText(
        readFileSync(WRAPPED_LIST_COLUMNS_FIXTURE)
      );
      const joined = result.paragraphs.join("\n");
      expect(joined).toContain("1KINGZ (WA) 2021 white BMW X5 4WD");
      expect(joined).toContain("SLICK1, (WA) 2019 black Audi RS3 hatch");
      expect(joined).toContain(
        "1CBT663 (WA) 2020 silver Toyota LandCruiser Prado wagon."
      );
      // Regression: without the chainEligible fix, a coincidental
      // y-collision between these unrelated wrapped-continuation lines
      // glued the LOCATION OF INTEREST column's own stray fragment onto
      // the end of an unrelated vehicle entry.
      expect(joined).not.toContain("4WD VALE WA 6155.");
      expect(joined).not.toContain("RS3 hatch NORTHBRIDGE WA 6003.");
      expect(joined).not.toContain("wagon. 6148 Additional Location");
    });

    it("keeps an address complete instead of losing its suburb/postcode to a coincidental y-collision with an unrelated vehicle line", async () => {
      const result = await readPdfText(
        readFileSync(WRAPPED_LIST_COLUMNS_FIXTURE)
      );
      const joined = result.paragraphs.join("\n");
      expect(joined).toContain("14 Bannister Road, CANNING VALE WA 6155.");
      expect(joined).toContain("88 Fitzgerald Street, NORTHBRIDGE WA 6003.");
      expect(joined).toContain(
        "66 Central Rd, Rossmoyne WA 6148 Additional Location: Unit 4/27 Baile Road, CANNING VALE WA 6155."
      );
      // Regression: the broken baseline stranded each address mid-word,
      // e.g. "14 Bannister Road, CANNING" with "VALE WA 6155." claimed by
      // the vehicle column instead.
      expect(joined).not.toContain("14 Bannister Road, CANNING\n");
      expect(joined).not.toContain("88 Fitzgerald Street,\n");
    });

    it("recovers a NAME value vertically centred beside its own label instead of dropping the surname", async () => {
      const result = await readPdfText(
        readFileSync(WRAPPED_LIST_COLUMNS_FIXTURE)
      );
      const rows = result.tables[0].rows;
      expect(rows).toContainEqual(["NAME", "Marcus Andrew VELASCO"]);
    });

    it("doesn't disturb ROLE/COB, whose own values stay top-aligned same as every other fixture (no regression from the centred-value recovery)", async () => {
      const result = await readPdfText(
        readFileSync(WRAPPED_LIST_COLUMNS_FIXTURE)
      );
      const rows = result.tables[0].rows;
      expect(rows).toContainEqual(["ROLE", "Principal"]);
      expect(rows).toContainEqual(["COB", "New Zealand"]);
    });
  });

  describe("a header grid column whose own label AND value both hard-wrap into short, vertically-centred blocks (Operation ORCHARD/NIGHTJAR fixtures)", () => {
    it("recovers PASSPORT and PROMIS ID as their own label/value pairs instead of dropping the label and gluing its value onto a neighbouring field (ORCHARD)", async () => {
      const result = await readPdfText(
        readFileSync(VERTICALLY_CENTERED_GRID_COLUMN_FIXTURE)
      );
      const rows = result.tables[0].rows;
      expect(rows).toContainEqual(["PASSPORT", "Pakistani PassportKP4071832"]);
      expect(rows).toContainEqual([
        "IDs",
        "WA DL 5902764; Customer ID OTG-7713",
      ]);
      expect(rows).toContainEqual(["PROMIS ID", "9341758"]);
      // Regression: PASSPORT's own value used to land glued onto OCG's.
      expect(rows).not.toContainEqual([
        "OCG",
        "Orchard Trading Group Pakistani PassportKP4071832",
      ]);
    });

    it("doesn't disturb the row's own genuine single-line fields (no regression from the grid-column recovery)", async () => {
      const result = await readPdfText(
        readFileSync(VERTICALLY_CENTERED_GRID_COLUMN_FIXTURE)
      );
      const rows = result.tables[0].rows;
      expect(rows).toContainEqual(["NAME", "Haris Imran BAIG"]);
      expect(rows).toContainEqual(["DOB", "19/09/1984"]);
      expect(rows).toContainEqual(["OCG", "Orchard Trading Group"]);
      expect(rows).toContainEqual(["ALIASES", "Haris KHAN; ‘Harry’; H. BAIG"]);
    });

    it("recovers PASSPORT and PROMIS ID on a second real document whose own values land in a different wrong row than ORCHARD's (NIGHTJAR)", async () => {
      const result = await readPdfText(
        readFileSync(ORPHANED_GRID_VALUE_FIXTURE)
      );
      const rows = result.tables[0].rows;
      expect(rows).toContainEqual([
        "PASSPORT",
        "Australian Passport PA6814720",
      ]);
      expect(rows).toContainEqual([
        "IDs",
        "WA DL 7304186; Client ID NJ- 20841",
      ]);
      expect(rows).toContainEqual(["PROMIS ID", "9286401"]);
    });

    it("still reads the ORIGINAL Operation COBALT fixture's own PASSPORT row correctly (no regression from reclaimOrphanCells)", async () => {
      const result = await readPdfText(readFileSync(NARROW_GRID_FIXTURE));
      const rows = result.tables[0].rows;
      expect(rows.some(r => r[0] === "PASSPORT")).toBe(true);
    });

    it("doesn't reclaim a genuine vehicle-list entry into an unrelated pair of column headings that coincidentally share a y (no regression from reclaimOrphanCells on the COBALT V3 fixture)", async () => {
      const result = await readPdfText(
        readFileSync(WRAPPED_LIST_COLUMNS_FIXTURE)
      );
      const joined = result.paragraphs.join("\n");
      expect(joined).toContain("SLICK1, (WA) 2019 black Audi RS3 hatch");
      const rows = result.tables[0].rows;
      expect(rows.some(r => r[0] === "VEHICLES" && /SLICK1/.test(r[1]))).toBe(
        false
      );
    });
  });
});
