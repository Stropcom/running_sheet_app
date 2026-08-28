import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { readDocxTables } from "./docxTableReader";

// Real training document (synthetic data — see __fixtures__), not a
// hand-built XML snippet: this is the exact "sometimes it's not
// consistent" case the import feature was designed against — a clean
// labeled table plus a free-text Summary cell burying a second person.
const FIXTURE_PATH = join(
  __dirname,
  "__fixtures__/target-profile-training.docx"
);

describe("readDocxTables", () => {
  it("reads the real table structure from a target-profile-style document", async () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const result = await readDocxTables(buffer);

    expect(result.tables).toHaveLength(1);
    const rows = result.tables[0].rows;
    expect(rows.length).toBeGreaterThanOrEqual(6);

    // Row 0: NAME label/value pair present among the cells (not assuming a
    // fixed column index — see the comment on DocxTable.rows).
    expect(rows[0]).toContain("NAME");
    const nameIdx = rows[0].indexOf("NAME");
    expect(rows[0][nameIdx + 1]).toBe("John Alawishes DOE");

    // Row 1: DOB
    expect(rows[1]).toContain("DOB");
    const dobIdx = rows[1].indexOf("DOB");
    expect(rows[1][dobIdx + 1]).toBe("21/09/1992");

    // Row 2: PROMIS ID (the one populated "unmapped" field)
    expect(rows[2]).toContain("PROMIS ID");
    const promisIdx = rows[2].indexOf("PROMIS ID");
    expect(rows[2][promisIdx + 1]).toBe("7228008");

    // Row 3: VEHICLES cell holds both vehicles, correctly space-separated
    // between the rego and its bracketed state (the xml:space="preserve"
    // regression this reader specifically guards against).
    expect(rows[3]).toContain("VEHICLES");
    const vehIdx = rows[3].indexOf("VEHICLES");
    const vehiclesCell = rows[3][vehIdx + 1];
    expect(vehiclesCell).toContain("1ABC123 (WA)");
    expect(vehiclesCell).toContain("1KEEPUP (WA)");

    // LOCATION OF INTEREST cell holds both addresses with their own
    // sub-labels, on separate lines.
    expect(rows[3]).toContain("LOCATION OF INTEREST");
    const locIdx = rows[3].indexOf("LOCATION OF INTEREST");
    const locationCell = rows[3][locIdx + 1];
    expect(locationCell).toContain("Current Address:");
    expect(locationCell).toContain("3 Appletree Place, Woodvale WA 6026");
    expect(locationCell).toContain("Previous Address:");
    expect(locationCell).toContain("58 Explorer Street, Yanchep WA 6035");

    // Summary cell: the free-text paragraph carrying the second person.
    const summaryRow = rows.find(r => r.some(c => c.includes("Ryan FORBES")));
    expect(summaryRow).toBeDefined();
    const summaryCell = summaryRow!.find(c => c.includes("Ryan FORBES"))!;
    expect(summaryCell).toContain("Container DFSU1205246");
    expect(summaryCell).toContain("Rex imports Australia Pty Ltd");
  });

  it("returns an empty result for a non-docx buffer instead of throwing", async () => {
    const result = await readDocxTables(Buffer.from("not a docx file"));
    expect(result).toEqual({ tables: [], paragraphs: [] });
  });
});
