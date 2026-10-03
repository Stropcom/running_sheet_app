// Shared shape produced by every document-format reader (docxTableReader.ts,
// pdfTextReader.ts) and consumed by targetProfileFieldMap.ts's mapper —
// deliberately format-agnostic so the parsing/mapping pipeline downstream of
// extraction doesn't care whether the source was a .docx or a .pdf.
export interface DocumentTable {
  /** Each row is a list of cell texts, in the order the cells actually
   * appear in the source — NOT expanded to a fixed column count. A
   * horizontally-merged docx cell, or a PDF line with more than two
   * columns, is a single entry here, so row lengths can legitimately
   * differ; callers should match cells by scanning for known label text
   * rather than by column index. */
  rows: string[][];
}

/** A photo embedded in the source document (docx: a `word/media/*` part; PDF:
 * a page's own image XObject) — re-encoded to PNG so every downstream
 * consumer (the review screen, the upload-to-attachment path) deals with one
 * consistent format regardless of the document's original encoding. Tiny
 * images (letterhead logos, decorative rules/icons) are filtered out by the
 * reader before this is populated — see MIN_IMAGE_DIMENSION in
 * docxTableReader.ts/pdfTextReader.ts. */
export interface ExtractedDocumentImage {
  dataBase64: string;
  mimeType: "image/png";
  width: number;
  height: number;
  /** A person's name printed directly beneath the photo in the source
   * (PDF only — read from the text layer beside the image's own position on
   * the page), e.g. an associate's headshot captioned "Karim Elias NAJJAR".
   * Absent when nothing name-shaped sits under the photo. The review screen
   * uses it to pre-select who the photo is of instead of assuming it's the
   * target — a hint only, always still correctable by the officer. */
  captionName?: string;
}

export interface DocumentReadResult {
  tables: DocumentTable[];
  /** Paragraph text outside any table, in document order. */
  paragraphs: string[];
  images: ExtractedDocumentImage[];
}
