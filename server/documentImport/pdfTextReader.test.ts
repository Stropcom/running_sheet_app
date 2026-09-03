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
    expect(result).toEqual({ tables: [], paragraphs: [] });
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
});
