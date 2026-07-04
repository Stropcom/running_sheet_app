/**
 * witnessListGenerator.ts
 *
 * Generates a .docx Witness List document for a surveillance operation.
 * Matches the AFP statement template style: Roboto 10pt, 1.5 line spacing,
 * justified paragraphs, no visible table borders.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  LineRuleType,
  HeadingLevel,
  PageBreak,
} from "docx";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WitnessListInput {
  operationName: string;
  overallPrimary: string[];   // CINs — sorted
  overallSecondary: string[]; // CINs — sorted
  sheets: {
    sheetTitle: string;
    sheetDate: number;
    primary: string[];
    secondary: string[];
  }[];
  producedAt: number;
  certifierCin: string;
  userByCin: Map<string, { cin: string; name?: string | null }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FONT = "Roboto";
const FONT_SIZE = 20; // half-points → 10pt
const LINE_SPACING = { line: 360, lineRule: LineRuleType.AUTO }; // 1.5 lines

const NO_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideH: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideV: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

const CELL_NO_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function run(text: string, opts: { bold?: boolean; italic?: boolean; underline?: boolean; size?: number } = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: opts.size ?? FONT_SIZE,
    bold: opts.bold,
    italics: opts.italic,
    underline: opts.underline ? {} : undefined,
  });
}

function para(
  children: TextRun[],
  opts: {
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spaceBefore?: number;
    spaceAfter?: number;
    indent?: { left?: number; hanging?: number };
  } = {}
) {
  return new Paragraph({
    children,
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    spacing: {
      ...LINE_SPACING,
      before: opts.spaceBefore ?? 0,
      after: opts.spaceAfter ?? 120,
    },
    indent: opts.indent,
  });
}

function emptyPara() {
  return para([run("")], { spaceAfter: 0 });
}

function noBorderCell(content: Paragraph | Paragraph[], width?: number) {
  const children = Array.isArray(content) ? content : [content];
  return new TableCell({
    children,
    borders: CELL_NO_BORDER,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
  });
}

function formatDate(ts: number) {
  return format(new Date(ts), "d MMMM yyyy");
}

function formatDayDate(ts: number) {
  return format(new Date(ts), "EEEE, d MMMM yyyy");
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateWitnessListDocx(input: WitnessListInput): Promise<Buffer> {
  const {
    operationName,
    overallPrimary,
    overallSecondary,
    sheets,
    producedAt,
    certifierCin,
    userByCin,
  } = input;

  const cinLabel = (cin: string) => `CIN${cin}`;
  const producedDateStr = formatDate(producedAt);

  // ── Header table (AFP logo placeholder + "Witness List" title) ──────────────
  const headerTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    borders: NO_BORDER,
    rows: [
      new TableRow({
        children: [
          noBorderCell(
            para(
              [
                run("AFP", { bold: true, size: 28 }),
                run("  AUSTRALIAN\nFEDERAL POLICE", { size: 14 }),
              ],
              { align: AlignmentType.LEFT, spaceAfter: 0 }
            ),
            3000
          ),
          noBorderCell(
            para(
              [run("Witness List", { bold: true, size: 24 })],
              { align: AlignmentType.RIGHT, spaceAfter: 0 }
            )
          ),
        ],
      }),
    ],
  });

  // ── Title line ───────────────────────────────────────────────────────────────
  const titlePara = para(
    [
      run("Witness List in the matter of: ", { bold: true }),
      run(`Operation ${operationName}`, { bold: true }),
    ],
    { spaceBefore: 240, spaceAfter: 120 }
  );

  // ── Details table (Date) ─────────────────────────────────────────────────────
  const detailsTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    borders: NO_BORDER,
    rows: [
      new TableRow({
        children: [
          noBorderCell(
            para([run("Date", { bold: true })], { spaceAfter: 40 }),
            2000
          ),
          noBorderCell(
            para([run(producedDateStr, { italic: true, bold: true })], { spaceAfter: 40 })
          ),
        ],
      }),
      new TableRow({
        children: [
          noBorderCell(
            para([run("Produced by", { bold: true })], { spaceAfter: 40 }),
            2000
          ),
          noBorderCell(
            para([run(cinLabel(certifierCin))], { spaceAfter: 40 })
          ),
        ],
      }),
    ],
  });

  // ── Section heading helper ───────────────────────────────────────────────────
  const sectionHeading = (text: string, spaceBefore = 240) =>
    para([run(text, { bold: true, underline: true })], { spaceBefore, spaceAfter: 80 });

  // ── Witness entry helper ─────────────────────────────────────────────────────
  const witnessEntry = (cin: string, index: number) => {
    const user = userByCin.get(cin.toUpperCase());
    const label = cinLabel(cin);
    return para(
      [run(`${index + 1}.   ${label}`)],
      { indent: { left: 360 }, spaceAfter: 60 }
    );
  };

  const noWitnessEntry = (type: "primary" | "secondary") =>
    para(
      [run(`No ${type} witnesses.`, { italic: true })],
      { indent: { left: 360 }, spaceAfter: 60 }
    );

  // ── Horizontal rule helper ──────────────────────────────────────────────────
  const hrPara = (spaceBefore = 160, spaceAfter = 160) =>
    new Paragraph({
      children: [],
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
      },
      spacing: { before: spaceBefore, after: spaceAfter },
    });

  // ── Build overall section ────────────────────────────────────────────────────
  const overallSection: Paragraph[] = [
    hrPara(240, 120),
    para([run("COMBINED WITNESS LIST", { bold: true })], { spaceBefore: 0, spaceAfter: 80 }),
    para(
      [run(`The following is a combined Primary and Secondary witness list for all selected running sheets under Operation ${operationName}.`)],
      { spaceAfter: 120 }
    ),
    sectionHeading("Primary Witnesses", 160),
    para(
      [run("Operatives with substantive observations.")],
      { spaceAfter: 80 }
    ),
    ...(overallPrimary.length > 0
      ? overallPrimary.map((cin, i) => witnessEntry(cin, i))
      : [noWitnessEntry("primary")]
    ),
    emptyPara(),
    sectionHeading("Secondary Witnesses", 160),
    para(
      [run("Operatives who were on duty but whose entries are limited to Travelled Via and/or Surveillance Commenced/Ceased rows only.")],
      { spaceAfter: 80 }
    ),
    ...(overallSecondary.length > 0
      ? overallSecondary.map((cin, i) => witnessEntry(cin, i))
      : [noWitnessEntry("secondary")]
    ),
  ];

  // ── Build per-sheet sections ─────────────────────────────────────────────────
  const sheetSections: Paragraph[] = [];

  if (sheets.length > 0) {
    sheetSections.push(
      hrPara(240, 120),
      para([run("INDIVIDUAL RUNNING SHEET WITNESS LIST/S", { bold: true })], { spaceBefore: 0, spaceAfter: 80 }),
      para(
        [run(`The following witness lists are specific to each individual running sheet selected under Operation ${operationName}, presented in date order.`)],
        { spaceAfter: 120 }
      ),
    );
  }

  for (let si = 0; si < sheets.length; si++) {
    const sheet = sheets[si];
    if (si > 0) {
      sheetSections.push(hrPara(160, 80));
    }
    sheetSections.push(
      para(
        [run(`Running Sheet: ${sheet.sheetTitle}`, { bold: true })],
        { spaceBefore: si === 0 ? 0 : 80, spaceAfter: 40 }
      ),
      para(
        [run(`Date: ${formatDayDate(sheet.sheetDate)}`)],
        { spaceAfter: 120 }
      ),
      sectionHeading("Primary Witnesses", 120),
      ...(sheet.primary.length > 0
        ? sheet.primary.map((cin, i) => witnessEntry(cin, i))
        : [noWitnessEntry("primary")]
      ),
      emptyPara(),
      sectionHeading("Secondary Witnesses", 120),
      ...(sheet.secondary.length > 0
        ? sheet.secondary.map((cin, i) => witnessEntry(cin, i))
        : [noWitnessEntry("secondary")]
      ),
    );
  }

  // ── Signature / certification block ─────────────────────────────────────────
  const certBlock: Paragraph[] = [
    emptyPara(),
    emptyPara(),
    para([run("_".repeat(40))], { spaceAfter: 40 }),
    para([run(cinLabel(certifierCin))], { spaceAfter: 40 }),
    para([run(producedDateStr)], { spaceAfter: 120 }),
    para([run("RunLog Digital Certification", { bold: true })], { spaceAfter: 40 }),
    para([run(`Certified by ${cinLabel(certifierCin)} ${producedDateStr}`)], { spaceAfter: 0 }),
  ];

  // ── Assemble document ────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
          },
        },
        children: [
          headerTable,
          titlePara,
          detailsTable,
          emptyPara(),
          ...overallSection,
          ...sheetSections,
          ...certBlock,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
