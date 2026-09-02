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

export interface DocumentReadResult {
  tables: DocumentTable[];
  /** Paragraph text outside any table, in document order. */
  paragraphs: string[];
}
