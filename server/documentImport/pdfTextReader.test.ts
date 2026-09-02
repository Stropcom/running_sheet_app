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
});
