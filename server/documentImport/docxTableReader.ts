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
import sharp from "sharp";
import { createHash } from "crypto";
import type { ExtractedDocumentImage } from "./documentReadResult";
import { matchWholeLinePersonName } from "./freeTextEntityScan";
import { isLikelyPhoto } from "./imagePhotoFilter";

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
  images: ExtractedDocumentImage[];
}

// Size / banner-shape / flat-graphic filtering lives in imagePhotoFilter.ts
// (shared with the PDF reader).

/** Where the document body references each picture, in reading order, with
 * the (top-level) table it sits inside, if any. Header/footer pictures (a
 * letterhead logo repeated on every page) live in their own parts and are
 * never referenced from document.xml, so they're excluded by construction. */
interface ImageRef {
  target: string;
  tableIndex: number | null;
}

async function findBodyImageRefs(zip: JSZip, xml: string): Promise<ImageRef[]> {
  const relsFile = zip.file("word/_rels/document.xml.rels");
  if (!relsFile) return [];
  const rels = await relsFile.async("text");
  const targetById = new Map<string, string>();
  for (const m of Array.from(rels.matchAll(/<Relationship\b[^>]*>/g))) {
    const tag = m[0];
    const id = tag.match(/\bId="([^"]+)"/)?.[1];
    const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
    const type = tag.match(/\bType="([^"]+)"/)?.[1] ?? "";
    if (id && target && /\/image$/.test(type)) {
      targetById.set(id, target.replace(/^\//, "").replace(/^word\//, ""));
    }
  }
  const refs: ImageRef[] = [];
  let depth = 0;
  let tableIndex = -1;
  for (const m of Array.from(
    xml.matchAll(
      /<w:tbl>|<\/w:tbl>|r:embed="([^"]+)"|<v:imagedata\b[^>]*\br:id="([^"]+)"/g
    )
  )) {
    if (m[0] === "<w:tbl>") {
      if (depth === 0) tableIndex++;
      depth++;
    } else if (m[0] === "</w:tbl>") {
      depth--;
    } else {
      const target = targetById.get(m[1] ?? m[2]);
      if (target) {
        refs.push({ target, tableIndex: depth > 0 ? tableIndex : null });
      }
    }
  }
  return refs;
}

/** The name that heads a table, when the table is a person's card — used to
 * caption a photo sitting in it ("Karim Elias NAJJAR"). Empty for a table
 * that isn't a person card (a photoboard, a vehicle list). */
function tableOwnerName(table: DocxTable | undefined): string {
  if (!table) return "";
  for (const row of table.rows) {
    let afterTargetLabel = false;
    for (const cell of row) {
      const text = cell.trim();
      if (!text) continue;
      // A target's card leads with a "Target" label, the name beside it.
      if (!afterTargetLabel && /^Target$/i.test(text)) {
        afterTargetLabel = true;
        continue;
      }
      return matchWholeLinePersonName(text) ? text : "";
    }
  }
  return "";
}

/** Pulls every embedded picture out of a .docx's word/media/ part — these
 * are literal separate files inside the zip (unlike a PDF, which has no
 * equivalent and needs its own page-content-stream walk — see
 * pdfTextReader.ts). Re-encodes each to PNG via sharp so the caller doesn't
 * need to care whether the source was a .png/.jpeg/.bmp/etc, and drops
 * anything sharp can't decode (e.g. a .wmf/.emf vector drawing), anything
 * too small, and anything banner-shaped. Pictures are returned in the order
 * the document first shows them, each once even when the template re-uses
 * the same photo in several places (a photoboard AND the person's own card),
 * with a name caption when the photo sits inside a named person's card.
 * Best-effort: one bad image is skipped, not fatal to the whole read. */
async function extractDocxImages(
  zip: JSZip,
  bodyXml: string,
  tables: DocxTable[]
): Promise<ExtractedDocumentImage[]> {
  const refs = await findBodyImageRefs(zip, bodyXml);
  // First reference per media part, in reading order; the caption comes from
  // whichever reference sits in a named person's card (a photo reused on a
  // photoboard and in its owner's card is captioned by the card).
  const order: string[] = [];
  const captionByTarget = new Map<string, string>();
  for (const ref of refs) {
    if (!order.includes(ref.target)) order.push(ref.target);
    if (ref.tableIndex !== null && !captionByTarget.has(ref.target)) {
      const owner = tableOwnerName(tables[ref.tableIndex]);
      if (owner) captionByTarget.set(ref.target, owner);
    }
  }
  // Nothing recognisable referenced from the body (an unusual markup shape):
  // fall back to every media part so a photo is never lost outright.
  const paths = order.length
    ? order
    : zip.file(/^word\/media\//).map(f => f.name.replace(/^word\//, ""));

  const images: ExtractedDocumentImage[] = [];
  const seenHashes = new Set<string>();
  for (const target of paths) {
    try {
      const file = zip.file(`word/${target}`);
      if (!file) continue;
      const raw = await file.async("nodebuffer");
      const hash = createHash("sha1").update(raw).digest("hex");
      if (seenHashes.has(hash)) continue;
      const decoded = sharp(raw);
      const meta = await decoded.metadata();
      if (!meta.width || !meta.height) continue;
      if (!(await isLikelyPhoto(decoded, meta.width, meta.height))) continue;
      seenHashes.add(hash);
      const png = await decoded.png().toBuffer();
      const caption = captionByTarget.get(target);
      images.push({
        dataBase64: png.toString("base64"),
        mimeType: "image/png",
        width: meta.width,
        height: meta.height,
        ...(caption ? { captionName: caption } : {}),
      });
    } catch {
      // Not a decodable raster image — skip it rather than failing the read.
    }
  }
  return images;
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
    if (!docXmlFile) return { tables: [], paragraphs: [], images: [] };
    const xml = await docXmlFile.async("text");
    const tree = parser.parse(xml) as unknown[];

    const documentNode = findAll(tree, "w:document")[0];
    if (!documentNode) return { tables: [], paragraphs: [], images: [] };
    const bodyNode = findAll(documentNode["w:document"], "w:body")[0];
    if (!bodyNode) return { tables: [], paragraphs: [], images: [] };
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

    const images = await extractDocxImages(zip, xml, tables);
    return { tables, paragraphs, images };
  } catch {
    return { tables: [], paragraphs: [], images: [] };
  }
}
