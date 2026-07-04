/**
 * statementGenerator.ts
 * Generates a per-CIN AFP court statement as a .docx Buffer using the `docx` library.
 * Layout matches the AFP Statement template exactly.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  Footer,
  WidthType,
  Table,
  TableRow,
  TableCell,
  convertInchesToTwip,
  ImageRun,
} from "docx";
import { format } from "date-fns";
import * as fs from "fs";
import * as path from "path";

export type SurveillanceDay = {
  date: number;          // UTC midnight timestamp
  isAuthor: boolean;
  imageTimes: string[];  // e.g. ["11:54am", "12:51pm"]
};

export type StatementInput = {
  cin: string;
  name: string;
  operationName: string;
  surveillanceDays: SurveillanceDay[];
  certifierCin: string;
  certifierName: string;
  producedAt: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FONT = "Roboto";
const BODY_SIZE = 20; // half-points: 20 = 10pt
const LINE_SPACING = { line: 360, lineRule: "auto" as const }; // 1.5 line spacing (240 = single, 360 = 1.5)

/** "Monday, 17 May 2021" */
function formatDayDate(ts: number): string {
  return format(new Date(ts), "EEEE, d MMMM yyyy");
}

/** "d MMMM yyyy" */
function formatShortDate(ts: number): string {
  return format(new Date(ts), "d MMMM yyyy");
}

function spacer(after = 120): Paragraph {
  return new Paragraph({ spacing: { after }, children: [new TextRun("")] });
}

/** No-border table cell */
function noBorderCell(width: number, children: Paragraph[], vAlign?: "top" | "center" | "bottom"): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    verticalAlign: vAlign,
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    children,
  });
}

/** No-border table */
function noBorderTable(rows: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows,
  });
}

/** Standard body text run — Roboto 10pt */
function body(text: string, opts?: { bold?: boolean; italics?: boolean; underline?: boolean; size?: number }): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: opts?.size ?? BODY_SIZE,
    bold: opts?.bold,
    italics: opts?.italics,
    underline: opts?.underline ? {} : undefined,
  });
}

/** Justified numbered paragraph */
function numberedParagraph(num: number, children: TextRun[]): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.5) },
    spacing: { after: 160, ...LINE_SPACING },
    children: [
      body(`${num}.\t`),
      ...children,
    ],
  });
}

/** Sub-item paragraph */
function subItemParagraph(letter: string, children: TextRun[]): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: convertInchesToTwip(0.75), hanging: convertInchesToTwip(0.5) },
    spacing: { after: 120, ...LINE_SPACING },
    children: [
      body(`${letter})\t`),
      ...children,
    ],
  });
}

// ─── Main generator ──────────────────────────────────────────────────────────

export async function generateStatementDocx(input: StatementInput): Promise<Buffer> {
  const {
    cin,
    operationName,
    surveillanceDays,
    certifierCin,
    producedAt,
  } = input;

  const sortedDays = [...surveillanceDays].sort((a, b) => a.date - b.date);
  const producedDateStr = formatShortDate(producedAt);

  // Full CIN label e.g. "CIN459"
  const cinLabel = `CIN${cin}`;

  // ── AFP Logo placeholder ──────────────────────────────────────────────────
  let logoImageData: Buffer | null = null;
  const logoPath = path.join(process.cwd(), "server", "assets", "afp_logo.png");
  if (fs.existsSync(logoPath)) {
    logoImageData = fs.readFileSync(logoPath);
  }

  // ── Header row: Logo left, "Statement" right — NO BORDERS ────────────────
  const headerLogoCell = noBorderCell(
    20,
    [
      logoImageData
        ? new Paragraph({
            children: [
              new ImageRun({
                data: logoImageData,
                transformation: { width: 80, height: 60 },
                type: "png",
              }),
            ],
          })
        : new Paragraph({
            children: [
              new TextRun({ text: "AFP", font: FONT, bold: true, size: 28 }),
              new TextRun({ text: " AUSTRALIAN\nFEDERAL POLICE", font: FONT, size: 14 }),
            ],
          }),
    ],
    "top"
  );

  const headerTitleCell = noBorderCell(
    80,
    [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [body("Statement", { bold: true, size: 28 })],
      }),
    ],
    "top"
  );

  const headerTable = noBorderTable([
    new TableRow({ children: [headerLogoCell, headerTitleCell] }),
  ]);

  // ── Details block: Name / Occupation / Employer / Date — NO BORDERS ───────
  function detailRow(label: string, value: string, valueItalic = false): TableRow {
    return new TableRow({
      children: [
        noBorderCell(25, [new Paragraph({ spacing: LINE_SPACING, children: [body(label, { bold: true })] })]),
        noBorderCell(75, [new Paragraph({ spacing: LINE_SPACING, children: [body(value, { italics: valueItalic, bold: valueItalic })] })]),
      ],
    });
  }

  const detailsTable = noBorderTable([
    detailRow("Name", cinLabel),
    detailRow("Occupation", "Federal Agent"),
    detailRow("Employer", "Australian Federal Police"),
    detailRow("Date", producedDateStr, true),
  ]);

  // ── Body paragraphs ───────────────────────────────────────────────────────
  const bodyParagraphs: (Paragraph | Table)[] = [];

  bodyParagraphs.push(headerTable);

  // Horizontal rule under header
  bodyParagraphs.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
      spacing: { after: 160 },
      children: [new TextRun("")],
    })
  );

  // "Statement in the matter of: Operation X"
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 160, ...LINE_SPACING },
      children: [
        body("Statement in the matter of: "),
        body(`Operation ${operationName}`, { bold: true }),
      ],
    })
  );

  bodyParagraphs.push(spacer(80));
  bodyParagraphs.push(detailsTable);
  bodyParagraphs.push(spacer(80));

  // Second horizontal rule
  bodyParagraphs.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
      spacing: { after: 200 },
      children: [new TextRun("")],
    })
  );

  // STATES:
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 200, ...LINE_SPACING },
      children: [body("STATES:", { bold: true })],
    })
  );

  // ── Numbered paragraphs 1–8 (fixed boilerplate) ───────────────────────────

  bodyParagraphs.push(numberedParagraph(1, [
    body("This statement made by me accurately sets out the evidence that I would be prepared, if necessary, to give in court as a witness."),
  ]));

  bodyParagraphs.push(numberedParagraph(2, [
    body("I am a covert operative, covert identification number (CIN) "),
    body(cin),
    body(", a Federal Agent (FA) of the Australian Federal Police (AFP) assigned to Perth Office at 1280 Hay Street, WEST PERTH, Western Australia (WA)."),
  ]));

  bodyParagraphs.push(numberedParagraph(3, [
    body("As part of my responsibilities as a surveillance officer, I was periodically required to prepare and complete Surveillance Running Sheets during or after the completion of a surveillance shift."),
  ]));

  bodyParagraphs.push(numberedParagraph(4, [
    body("The compilation of a Surveillance Running Sheet forms an integral part of surveillance duty as a formal written record of observations made and activities undertaken during a particular period or shift."),
  ]));

  bodyParagraphs.push(numberedParagraph(5, [
    body("These observations are either recorded at the time by a recording device, or written down in a Surveillance Running Sheet diary, at the time, or a short time after, the observation has been made, by the designated note taker for the day and/or other team members where possible.  All records, either written or recorded are then transferred to a Surveillance Running Sheet which is then adopted as accurate by all members of the team."),
  ]));

  bodyParagraphs.push(numberedParagraph(6, [
    body("The Surveillance Running Sheet includes a cover sheet containing the operation name, surveillance subject, the date on which the surveillance was conducted, the preparation officer, the number of pages and the CIN of each member involved in the surveillance team on that particular day."),
  ]));

  bodyParagraphs.push(numberedParagraph(7, [
    body("The Surveillance Running Sheet also includes, beside each observation, the printed initials of the officer/s making the observation.  After the Surveillance Running Sheet is compiled, each member reviews the Surveillance Running Sheet and verifies the entries attributed to them are correct by signing their CIN against those entries."),
  ]));

  bodyParagraphs.push(numberedParagraph(8, [
    body("Where images are obtained during the course of surveillance, the original media on which the images are captured is copied.  In the case of digital still images and digital video images, the original media is copied to a hard drive which then constitutes the primary image.  This hard drive is stored in an encrypted AFP secure computer.  At the conclusion of an operation, primary images are transferred to a digital versatile disc (DVD) and then are labelled with, the operation name, the date produced and the operator's CIN.  This DVD is securely stored within Australian Federal Police facilities."),
  ]));

  // ── Para 9: Surveillance days ─────────────────────────────────────────────

  bodyParagraphs.push(numberedParagraph(9, [
    body("As part of this Operation, I conducted observations and duties, as a member of a surveillance team, on the following day:"),
  ]));

  const subLetters = "abcdefghijklmnopqrstuvwxyz";
  sortedDays.forEach((day, idx) => {
    const letter = subLetters[idx] ?? String(idx + 1);
    const dayLabel = formatDayDate(day.date);

    bodyParagraphs.push(subItemParagraph(letter, [
      body(dayLabel, { bold: true, italics: true }),
    ]));

    if (day.isAuthor) {
      bodyParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: convertInchesToTwip(1.0) },
          spacing: { after: 120, ...LINE_SPACING },
          children: [
            body("On this day I was responsible for preparing the Surveillance Running Sheet for the Surveillance Team.", { bold: true, italics: true }),
          ],
        })
      );
    }

    if (day.imageTimes.length > 0) {
      const timeStr = day.imageTimes.join(" and ");
      bodyParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: convertInchesToTwip(1.0) },
          spacing: { after: 120, ...LINE_SPACING },
          children: [
            body(`On this day I also took digital images recorded on the Surveillance Running Sheet at ${timeStr}.`, { bold: true, italics: true }),
          ],
        })
      );

      bodyParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: convertInchesToTwip(1.0) },
          spacing: { after: 160 },
          children: [body("EXHIBIT", { bold: true, underline: true })],
        })
      );
    }
  });

  // ── Para 10 ───────────────────────────────────────────────────────────────

  bodyParagraphs.push(numberedParagraph(10, [
    body("The CIN "),
    body(cin),
    body(" which appears on each Surveillance Running Sheet represent observations made by me during that particular period of surveillance.  I signed the cover sheet with my CIN and initialed my CIN against each entry on the Surveillance Running Sheet attributed to me."),
  ]));

  bodyParagraphs.push(spacer(240));

  // ── Declaration ───────────────────────────────────────────────────────────

  bodyParagraphs.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 240, ...LINE_SPACING },
      children: [
        body("This statement is true to the best of my knowledge and belief.  I have made this statement knowing that, if it is tendered in evidence, I will be guilty of a crime if I have wilfully included in the statement anything that I know to be false or that I do not believe is true."),
      ],
    })
  );

  bodyParagraphs.push(spacer(320));

  // ── Signature block ───────────────────────────────────────────────────────
  // Blank space above signature line (no "Digital signature here" text)
  bodyParagraphs.push(spacer(400));

  // Shorter signature line — ~3 inches wide using a narrow table
  const sigLineTable = noBorderTable([
    new TableRow({
      children: [
        noBorderCell(45, [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
            spacing: { after: 120 },
            children: [new TextRun("")],
          }),
        ]),
        noBorderCell(55, [new Paragraph({ children: [new TextRun("")] })]),
      ],
    }),
  ]);
  bodyParagraphs.push(sigLineTable);

  // Full CIN label under signature line
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [body(cinLabel)],
    })
  );

  // Date produced
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 200, ...LINE_SPACING },
      children: [body(producedDateStr, { italics: true, bold: true })],
    })
  );

  // ── RunLog Digital Certification — directly under date ────────────────────
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "RunLog Digital Certification",
          font: FONT,
          bold: true,
          size: 16,
          color: "475569",
        }),
      ],
    })
  );

  // "Certified by CIN459  4 July 2026"
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({
          text: `Certified by CIN${certifierCin}  ${producedDateStr}`,
          font: FONT,
          size: 16,
          color: "475569",
          italics: true,
        }),
      ],
    })
  );

  // ── Footer: "continued" ───────────────────────────────────────────────────
  const footerContent = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [body("continued")],
      }),
    ],
  });

  // ── Assemble document ─────────────────────────────────────────────────────

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: BODY_SIZE,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1.0),
              bottom: convertInchesToTwip(1.0),
              left: convertInchesToTwip(1.25),
              right: convertInchesToTwip(1.25),
            },
          },
        },
        footers: { default: footerContent },
        children: bodyParagraphs as Paragraph[],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
