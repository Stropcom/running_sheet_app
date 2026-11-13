// Part of the PDF reader (server/documentImport/pdfTextReader.ts): a positioned text item and the label vocabulary, shared by the text reader and the image reader.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { ALL_KNOWN_LABELS } from "../targetProfileFieldMap";

export interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

// "SUBJECT" is a real alternate label targetProfileFieldMap.ts falls back
// to for NAME (a training document used it instead of "NAME") but isn't
// itself in ALL_KNOWN_LABELS, which only lists the labels
// findFreeTextSection needs to recognise as a section-ending stop word —
// added here too so a PDF using that wording still gets picked up.
export const LINE_LABELS = Array.from(ALL_KNOWN_LABELS).concat("SUBJECT");
