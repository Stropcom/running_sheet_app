/**
 * statDecGenerator.ts
 *
 * Generates a .docx Statutory Declaration document exactly matching the
 * Commonwealth of Australia template (Statutory Declarations Act 1959).
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
  UnderlineType,
  PageBreak,
} from "docx";

// ── Types ────────────────────────────────────────────────────────────────────
export interface StatDecInput {
  declarantFullName: string;   // Full name of person making the declaration
  witnessFullName: string;     // Full name of witness (field 8)
  declaredBeforeName: string;  // Name declared before (field 7 area)
  declarationDate: string;     // e.g. "4 July 2026"
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const FONT = "Times New Roman";
const SIZE = 20; // half-points = 10pt
const SIZE_SMALL = 16; // 8pt for footnotes
const SIZE_HEADER = 24; // 12pt for headers
const SIZE_TITLE = 28; // 14pt for main title

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

const thinBorder = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
};

function spacing(before = 0, after = 0, line = 360) {
  return { before, after, line, lineRule: LineRuleType.AUTO };
}

function run(text: string, opts: {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number;
  font?: string;
} = {}) {
  return new TextRun({
    text,
    bold: opts.bold ?? false,
    italics: opts.italic ?? false,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    size: opts.size ?? SIZE,
    font: opts.font ?? FONT,
  });
}

function para(
  children: TextRun[],
  opts: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spaceBefore?: number;
    spaceAfter?: number;
    indent?: { left?: number; right?: number; firstLine?: number; hanging?: number };
  } = {}
) {
  return new Paragraph({
    children,
    alignment: opts.alignment ?? AlignmentType.LEFT,
    spacing: spacing(opts.spaceBefore ?? 0, opts.spaceAfter ?? 80),
    indent: opts.indent,
  });
}

function emptyPara() {
  return new Paragraph({ children: [run("")], spacing: spacing(0, 80) });
}

// ── Main generator ────────────────────────────────────────────────────────────
export async function generateStatDecDocx(input: StatDecInput): Promise<Buffer> {
  const { declarantFullName, witnessFullName, declarationDate } = input;

  // ── Header: OFFICIAL + title block ─────────────────────────────────────────
  const headerSection: Paragraph[] = [
    para(
      [run("OFFICIAL", { bold: true, size: SIZE_HEADER })],
      { alignment: AlignmentType.CENTER, spaceAfter: 40 }
    ),
    para(
      [run("Commonwealth of Australia", { size: SIZE_HEADER })],
      { alignment: AlignmentType.CENTER, spaceAfter: 40 }
    ),
    para(
      [run("STATUTORY DECLARATION", { bold: true, size: SIZE_HEADER })],
      { alignment: AlignmentType.CENTER, spaceAfter: 40 }
    ),
    para(
      [run("Statutory Declarations Act 1959", { italic: true, size: SIZE_HEADER })],
      { alignment: AlignmentType.CENTER, spaceAfter: 240 }
    ),
  ];

  // ── Two-column layout: left margin notes + right content ───────────────────
  // We use a borderless table with a narrow left column for the margin instructions
  // and a wide right column for the actual content.

  function marginCell(text: string) {
    return new TableCell({
      width: { size: 1800, type: WidthType.DXA },
      borders: noBorder,
      children: [
        new Paragraph({
          children: [run(text, { italic: true, size: SIZE_SMALL })],
          spacing: spacing(0, 40),
        }),
      ],
    });
  }

  function contentCell(paragraphs: Paragraph[]) {
    return new TableCell({
      width: { size: 7200, type: WidthType.DXA },
      borders: noBorder,
      children: paragraphs,
    });
  }

  // Row 1: Field 1 — declarant intro
  const row1 = new TableRow({
    children: [
      marginCell("1  Insert the name, address and occupation of person making the declaration"),
      contentCell([
        para([
          run("1 I "),
          run(declarantFullName, { bold: true }),
          run(" of 1120 Hay Street, WEST PERTH being a member of the Australian Federal Police."),
        ], { spaceAfter: 120 }),
        para(
          [run("make the following declaration under the "), run("Statutory Declarations Act 1959", { italic: true }), run(":")],
          { spaceAfter: 160 }
        ),
        // Bullet points
        para([run("\u2022  I have not been convicted or found guilty of an offence. "), run("(If yes, provide details)", { italic: true })], { indent: { left: 360 }, spaceAfter: 120 }),
        para([run("\u2022  There are no charges pending or outstanding against me;")], { indent: { left: 360 }, spaceAfter: 120 }),
        para([run("\u2022  I have not been found guilty of professional misconduct. "), run("(if yes, provide details).", { italic: true })], { indent: { left: 360 }, spaceAfter: 120 }),
        para([run("\u2022  To the best of my knowledge, there are no allegations of professional misconduct against me that are outstanding")], { indent: { left: 360 }, spaceAfter: 120 }),
        para([run("\u2022  To the best of my knowledge no court has made any adverse comment about my credibility")], { indent: { left: 360 }, spaceAfter: 120 }),
        para([run("\u2022  I have never made a false representation when the truth was required")], { indent: { left: 360 }, spaceAfter: 120 }),
        para([run("\u2022  There is nothing else known to me that may be relevant to credibility")], { indent: { left: 360 }, spaceAfter: 200 }),
        // Closing declaration paragraph
        para(
          [
            run("I understand that a person who intentionally makes a false statement in a statutory declaration is guilty of an offence under section 11 of the "),
            run("Statutory Declarations Act 1959", { italic: true }),
            run(", and I believe that the statements in this declaration are true in every particular."),
          ],
          { alignment: AlignmentType.JUSTIFIED, spaceAfter: 200 }
        ),
      ]),
    ],
  });

  // Row 2: Field 3 — signature of declarant
  const row2 = new TableRow({
    children: [
      marginCell("3  Signature of person making the declaration"),
      contentCell([
        para([run("3")], { spaceAfter: 40 }),
        emptyPara(),
        para([run("_".repeat(50))], { spaceAfter: 200 }),
      ]),
    ],
  });

  // Row 3: Fields 4-6 — Declared at PERTH on [Date]
  const row3 = new TableRow({
    children: [
      marginCell("4  Place\n5  Day\n6  Month and year"),
      contentCell([
        para(
          [
            run("Declared at "),
            run("4", { size: SIZE_SMALL }),
            run("  PERTH     on "),
            run("5", { size: SIZE_SMALL }),
            run("  "),
            run(declarationDate, { bold: true }),
          ],
          { spaceAfter: 160 }
        ),
        para([run("Before me,")], { spaceAfter: 200 }),
      ]),
    ],
  });

  // Row 4: Field 7 — signature of witness
  const row4 = new TableRow({
    children: [
      marginCell("7  Signature of person before whom the declaration is made (see over)"),
      contentCell([
        para([run("7")], { spaceAfter: 40 }),
        emptyPara(),
        para([run("_".repeat(50))], { spaceAfter: 200 }),
      ]),
    ],
  });

  // Row 5: Field 8 — full name, qualification and address of witness
  const row5 = new TableRow({
    children: [
      marginCell("8  Full name, qualification and address of person before whom the declaration is made (in printed letters)"),
      contentCell([
        para([run("8  "), run(witnessFullName, { bold: true })], { spaceAfter: 80 }),
        para([run("Federal Agent")], { spaceAfter: 80 }),
        para([run("1120 Hay Street, WEST PERTH")], { spaceAfter: 200 }),
      ]),
    ],
  });

  const mainTable = new Table({
    width: { size: 9000, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [row1, row2, row3, row4, row5],
  });

  // ── Footer notes ─────────────────────────────────────────────────────────────
  const footerNotes: Paragraph[] = [
    new Paragraph({
      children: [
        run("Note 1", { bold: true, size: SIZE_SMALL }),
        run("  A person who intentionally makes a false statement in a statutory declaration is guilty of an offence, the punishment for which is imprisonment for a term of 4 years — see section 11 of the ", { size: SIZE_SMALL }),
        run("Statutory Declarations Act 1959", { italic: true, size: SIZE_SMALL }),
        run(".", { size: SIZE_SMALL }),
      ],
      spacing: spacing(120, 40),
    }),
    new Paragraph({
      children: [
        run("Note 2", { bold: true, size: SIZE_SMALL }),
        run("  Chapter 2 of the ", { size: SIZE_SMALL }),
        run("Criminal Code", { italic: true, size: SIZE_SMALL }),
        run(" applies to all offences against the ", { size: SIZE_SMALL }),
        run("Statutory Declarations Act 1959", { italic: true, size: SIZE_SMALL }),
        run(" — see section 5A of the ", { size: SIZE_SMALL }),
        run("Statutory Declarations Act 1959", { italic: true, size: SIZE_SMALL }),
        run(".", { size: SIZE_SMALL }),
      ],
      spacing: spacing(0, 0),
    }),
  ];

  // ── Assemble document ────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 900, right: 900 },
          },
        },
        children: [
          ...headerSection,
          mainTable,
          ...footerNotes,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
