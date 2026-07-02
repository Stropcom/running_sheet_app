/**
 * statementGenerator.ts
 * Generates a per-CIN court statement as a .docx Buffer using the `docx` library.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  PageNumber,
  Header,
  Footer,
  SectionType,
  WidthType,
  Table,
  TableRow,
  TableCell,
  VerticalAlign,
  convertInchesToTwip,
} from "docx";
import { format } from "date-fns";

export type StatementInput = {
  /** The CIN this statement is for */
  cin: string;
  /** Full name of the officer */
  name: string;
  /** Operation name */
  operationName: string;
  /**
   * All running sheet dates where this CIN appears (as a team member).
   * ISO date strings or timestamps.
   */
  surveillanceDates: number[];
  /**
   * Dates where this CIN was the Running Sheet Author (isAuthor = true).
   */
  authorDates: number[];
  /**
   * Dates where this CIN had hasImages = true on the roster.
   */
  imageDates: number[];
  /** CIN of the person producing/certifying this statement */
  certifierCin: string;
  /** Full name of the certifier */
  certifierName: string;
  /** Timestamp when the statement was produced */
  producedAt: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return format(new Date(ts), "d MMMM yyyy");
}

function formatDateList(dates: number[]): string {
  const sorted = Array.from(new Set(dates)).sort((a, b) => a - b);
  return sorted.map(formatDate).join(", ");
}

function protectedText(): TextRun {
  return new TextRun({
    text: "PROTECTED",
    color: "DC2626",
    bold: true,
    size: 24,
    allCaps: true,
  });
}

function protectedParagraph(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [protectedText()],
  });
}

function spacer(): Paragraph {
  return new Paragraph({ children: [new TextRun("")] });
}

// ─── Main generator ──────────────────────────────────────────────────────────

export async function generateStatementDocx(input: StatementInput): Promise<Buffer> {
  const {
    cin,
    name,
    operationName,
    surveillanceDates,
    authorDates,
    imageDates,
    certifierCin,
    certifierName,
    producedAt,
  } = input;

  const sortedSurveillance = Array.from(new Set(surveillanceDates)).sort((a, b) => a - b);
  const sortedAuthor = Array.from(new Set(authorDates)).sort((a, b) => a - b);
  const sortedImages = Array.from(new Set(imageDates)).sort((a, b) => a - b);

  const producedAtStr = format(new Date(producedAt), "d MMMM yyyy 'at' h:mm:ss aaa");

  // ── Body paragraphs ────────────────────────────────────────────────────────

  const bodyParagraphs: Paragraph[] = [];

  // Title
  bodyParagraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "STATEMENT",
          bold: true,
          size: 28,
          allCaps: true,
        }),
      ],
    })
  );

  bodyParagraphs.push(spacer());

  // Officer details block
  bodyParagraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Name: ", bold: true }),
        new TextRun({ text: name }),
      ],
    })
  );
  bodyParagraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: "CIN: ", bold: true }),
        new TextRun({ text: cin }),
      ],
    })
  );
  bodyParagraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Date of Statement: ", bold: true }),
        new TextRun({ text: format(new Date(producedAt), "d MMMM yyyy") }),
      ],
    })
  );

  bodyParagraphs.push(spacer());

  // Opening paragraph
  const dateListStr = formatDateList(sortedSurveillance);
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `I, ${name}, CIN ${cin}, state that I was conducting surveillance duties in relation to `,
        }),
        new TextRun({ text: operationName, bold: true }),
        new TextRun({
          text: ` on the following date${sortedSurveillance.length !== 1 ? "s" : ""}: ${dateListStr}.`,
        }),
      ],
    })
  );

  // Running Sheet Author section (only if applicable)
  if (sortedAuthor.length > 0) {
    bodyParagraphs.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: `I was the Running Sheet Author on the following date${sortedAuthor.length !== 1 ? "s" : ""}: `,
          }),
          new TextRun({ text: formatDateList(sortedAuthor), bold: true }),
          new TextRun({ text: "." }),
        ],
      })
    );
  }

  // Images/Video section (only if applicable)
  if (sortedImages.length > 0) {
    bodyParagraphs.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: `I took photographs and/or video footage on the following date${sortedImages.length !== 1 ? "s" : ""}: `,
          }),
          new TextRun({ text: formatDateList(sortedImages), bold: true }),
          new TextRun({ text: "." }),
        ],
      })
    );
  }

  bodyParagraphs.push(spacer());
  bodyParagraphs.push(spacer());

  // Signature line
  bodyParagraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Signature: ___________________________" }),
      ],
    })
  );
  bodyParagraphs.push(spacer());
  bodyParagraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Date: ___________________________" }),
      ],
    })
  );

  bodyParagraphs.push(spacer());
  bodyParagraphs.push(spacer());

  // Certification block
  bodyParagraphs.push(
    new Paragraph({
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: "94A3B8" },
      },
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: "RunLog Digital Certification",
          bold: true,
          size: 18,
          color: "475569",
        }),
      ],
    })
  );
  bodyParagraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `This statement was produced via RunLog. Certified by CIN ${certifierCin} — ${certifierName} — ${producedAtStr}.`,
          size: 18,
          color: "475569",
          italics: true,
        }),
      ],
    })
  );

  // ── Header and Footer ──────────────────────────────────────────────────────

  const headerContent = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [protectedText()],
      }),
    ],
  });

  const footerContent = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [protectedText()],
      }),
    ],
  });

  // ── Assemble document ─────────────────────────────────────────────────────

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1.2),
              bottom: convertInchesToTwip(1.2),
              left: convertInchesToTwip(1.25),
              right: convertInchesToTwip(1.25),
            },
          },
        },
        headers: { default: headerContent },
        footers: { default: footerContent },
        children: bodyParagraphs,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
