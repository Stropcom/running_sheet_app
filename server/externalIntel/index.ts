import sharp from "sharp";
import {
  extractDemographicTable,
  type ExtractedTableFields,
} from "./tableExtract";
import { ocrPage } from "./ocrWorker";
import { parseSections, type ParsedSections } from "./sectionParse";
import {
  extractEntitiesFromDocumentText,
  normalizeEntityKey,
  type ExtractedEntity,
} from "./entityExtract";

export type { ExtractedTableFields, ParsedSections, ExtractedEntity };
export { normalizeEntityKey };

export interface ProcessedDocument {
  tableFields: ExtractedTableFields;
  tableGridDetected: boolean;
  sections: ParsedSections;
  entities: ExtractedEntity[];
  /** Full raw OCR text of the page, kept for audit/re-processing. */
  ocrText: string;
}

/**
 * Runs the full deterministic OCR + extraction pipeline for one page image
 * of the "afp_target_profile" template. No LLM call anywhere in this path —
 * OCR is a local WASM library, table-field extraction is grid-line pixel
 * analysis + per-cell OCR, section/entity extraction is regex — see
 * CLAUDE.md Golden Rule.
 */
export async function processExternalDocument(
  imageBuffer: Buffer
): Promise<ProcessedDocument> {
  // Auto-orient from EXIF (phone photos commonly carry a rotation flag) and
  // normalize contrast — cheap, deterministic preprocessing that measurably
  // helped OCR accuracy in testing.
  const normalized = await sharp(imageBuffer)
    .rotate()
    .greyscale()
    .normalize()
    .toBuffer();

  const [tableResult, pageOcr] = await Promise.all([
    extractDemographicTable(normalized),
    ocrPage(normalized),
  ]);

  const sections = parseSections(pageOcr.text);
  // Runs against the raw page OCR text (line breaks intact), not the
  // whitespace-collapsed section values — person/business patterns rely on
  // line breaks to avoid spanning across what were separate lines in the
  // source document (see entityExtract.ts).
  const entities = extractEntitiesFromDocumentText(pageOcr.text);

  // Vehicles and addresses are already cleanly parsed by parseSections (not
  // regex-guessed out of narrative prose), so surface them as their own
  // entity mentions too rather than only the narrative-derived ones.
  for (const vehicle of sections.vehicles) {
    entities.push({ type: "vehicle", label: vehicle });
  }
  if (sections.currentAddress) {
    entities.push({ type: "address", label: sections.currentAddress });
  }
  if (sections.previousAddress) {
    entities.push({ type: "address", label: sections.previousAddress });
  }

  return {
    tableFields: tableResult.fields,
    tableGridDetected: tableResult.gridDetected,
    sections,
    entities,
    ocrText: pageOcr.text,
  };
}
