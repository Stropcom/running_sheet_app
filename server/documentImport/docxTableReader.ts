// Reads a .docx file's real table structure and paragraph text directly
// from its OOXML — no PDF, no OCR, no conversion step. A .docx is a zip of
// XML; word/document.xml already contains genuine <w:tbl>/<w:tr>/<w:tc>
// table markup, so this walks that tree instead of approximating table
// layout from visual positioning (which is what pdfTextReader.ts has to do
// for a .pdf, which has no equivalent native table markup — see that
// file's module comment for why the two formats need separate readers
// rather than converting one into the other, both producing the same
// DocumentReadResult shape for targetProfileFieldMap.ts to consume).
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export interface DocxTable {
  /** Each row is a list of cell texts, in the order the cells actually
   * appear in the XML — NOT expanded to a fixed column count. A
   * horizontally-merged cell (gridSpan) is a single entry here, so row
   * lengths can legitimately differ; callers should match cells by
   * scanning for known label text rather than by column index. */
  rows: string[][];
}

export interface DocxReadResult {
  tables: DocxTable[];
  /** Paragraph text outside any table, in document order. */
  paragraphs: string[];
}

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  // preserveOrder keeps sibling order and repeated tags (multiple <w:tr>,
  // <w:tc>, etc. under one parent) distinct instead of collapsing them —
  // required for walking a table's real row/cell structure.
  preserveOrder: true,
  // Word runs routinely carry a deliberate leading/trailing space
  // (xml:space="preserve") to keep adjacent runs from mashing together —
  // e.g. "1ABC123" + " (WA)" as two separate <w:r> runs. The parser's
  // default trims that, silently merging text that should have a space
  // between it.
  trimValues: false,
});

function findAll(nodes: unknown, tag: string): XmlNode[] {
  if (!Array.isArray(nodes)) return [];
  const out: XmlNode[] = [];
  for (const n of nodes) {
    if (n && typeof n === "object" && tag in (n as XmlNode)) {
      out.push(n as XmlNode);
    }
  }
  return out;
}

/** Concatenates all text under a subtree, honouring the couple of run-level
 * elements that stand in for real whitespace (a soft line/paragraph break
 * reads as a real line break for our purposes, not nothing). */
function collectText(nodes: unknown): string {
  if (!Array.isArray(nodes)) return "";
  let out = "";
  for (const raw of nodes) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as XmlNode;
    if ("#text" in n) {
      out += String(n["#text"]);
      continue;
    }
    for (const key of Object.keys(n)) {
      if (key === ":@") continue;
      if (key === "w:tab") {
        out += "\t";
        continue;
      }
      if (key === "w:br" || key === "w:cr") {
        out += "\n";
        continue;
      }
      out += collectText(n[key]);
    }
  }
  return out;
}

/** Paragraph text, cell text, etc. all come out with per-run boundaries
 * (which don't matter to a reader) preserved as-is — collapse internal
 * whitespace runs and trim, but keep real paragraph breaks (\n) so a
 * multi-line cell like "Current Address:\n3 Appletree Place..." stays
 * readable instead of becoming one run-on line. */
function cleanText(s: string): string {
  return s
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
}

/** Reads every table and every out-of-table paragraph from a .docx file's
 * bytes. Returns an empty result (not a thrown error) for a corrupt or
 * unreadable file — the caller surfaces that as "couldn't read this file"
 * rather than a crash, the same tolerant-failure pattern the Location Map
 * page export already uses for a failed geocode. */
export async function readDocxTables(buffer: Buffer): Promise<DocxReadResult> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docXmlFile = zip.file("word/document.xml");
    if (!docXmlFile) return { tables: [], paragraphs: [] };
    const xml = await docXmlFile.async("text");
    const tree = parser.parse(xml) as unknown[];

    const documentNode = findAll(tree, "w:document")[0];
    if (!documentNode) return { tables: [], paragraphs: [] };
    const bodyNode = findAll(documentNode["w:document"], "w:body")[0];
    if (!bodyNode) return { tables: [], paragraphs: [] };
    const body = bodyNode["w:body"];

    const tables: DocxTable[] = findAll(body, "w:tbl").map(tblNode => {
      const rows = findAll(tblNode["w:tbl"], "w:tr").map(trNode => {
        const cells = findAll(trNode["w:tr"], "w:tc");
        return cells.map(tcNode => {
          const paras = findAll(tcNode["w:tc"], "w:p");
          return cleanText(paras.map(p => collectText(p["w:p"])).join("\n"));
        });
      });
      return { rows };
    });

    // Top-level paragraphs only (not ones nested inside a table cell,
    // already captured above) — findAll on the body itself only sees
    // w:body's direct children, so table-internal paragraphs are naturally
    // excluded without extra filtering.
    const paragraphs = findAll(body, "w:p")
      .map(p => cleanText(collectText(p["w:p"])))
      .filter(text => text.length > 0);

    return { tables, paragraphs };
  } catch {
    return { tables: [], paragraphs: [] };
  }
}
