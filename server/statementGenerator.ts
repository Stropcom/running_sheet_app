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
  VerticalAlign,
  convertInchesToTwip,
  ImageRun,
  PageNumber,
  NumberFormat,
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

/** "Monday, 17 May 2021" */
function formatDayDate(ts: number): string {
  return format(new Date(ts), "EEEE, d MMMM yyyy");
}

/** "d MMMM yyyy" */
function formatShortDate(ts: number): string {
  return format(new Date(ts), "d MMMM yyyy");
}

function spacer(size = 120): Paragraph {
  return new Paragraph({ spacing: { after: size }, children: [new TextRun("")] });
}

function hrParagraph(): Paragraph {
  return new Paragraph({
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
    },
    spacing: { after: 160 },
    children: [new TextRun("")],
  });
}

/** Standard body text run — Times New Roman 12pt */
function body(text: string, opts?: { bold?: boolean; italics?: boolean; underline?: boolean; size?: number }): TextRun {
  return new TextRun({
    text,
    font: "Times New Roman",
    size: opts?.size ?? 24, // half-points: 24 = 12pt
    bold: opts?.bold,
    italics: opts?.italics,
    underline: opts?.underline ? {} : undefined,
  });
}

/** Numbered paragraph (e.g. "1.   text...") using a two-column table for alignment */
function numberedParagraph(num: number, children: TextRun[]): Paragraph {
  // We use an indented paragraph with a hanging indent to simulate numbered list
  return new Paragraph({
    indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.5) },
    spacing: { after: 200 },
    children: [
      body(`${num}.\t`),
      ...children,
    ],
  });
}

/** Sub-item paragraph (e.g. "a)  text...") */
function subItemParagraph(letter: string, children: TextRun[]): Paragraph {
  return new Paragraph({
    indent: { left: convertInchesToTwip(0.75), hanging: convertInchesToTwip(0.5) },
    spacing: { after: 160 },
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
    name,
    operationName,
    surveillanceDays,
    certifierCin,
    certifierName,
    producedAt,
  } = input;

  const sortedDays = [...surveillanceDays].sort((a, b) => a.date - b.date);
  const producedDateStr = formatShortDate(producedAt);
  const producedAtStr = format(new Date(producedAt), "d MMMM yyyy 'at' h:mm:ss aaa");

  // ── AFP Logo placeholder ──────────────────────────────────────────────────
  // Try to load a real logo; fall back to a 1×1 transparent PNG placeholder
  let logoImageData: Buffer | null = null;
  const logoPath = path.join(process.cwd(), "server", "assets", "afp_logo.png");
  if (fs.existsSync(logoPath)) {
    logoImageData = fs.readFileSync(logoPath);
  }

  // ── Header row: Logo left, "Statement" right ──────────────────────────────
  const headerLogoCell = new TableCell({
    width: { size: 20, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    children: [
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
              body("AFP", { bold: true, size: 28 }),
              new TextRun({ text: "\nAUSTRALIAN FEDERAL POLICE", font: "Times New Roman", size: 16 }),
            ],
          }),
    ],
  });

  const headerTitleCell = new TableCell({
    width: { size: 80, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.TOP,
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [body("Statement", { bold: true, size: 28 })],
      }),
    ],
  });

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    rows: [
      new TableRow({
        children: [headerLogoCell, headerTitleCell],
      }),
    ],
  });

  // ── Details block: Name / CIN / Occupation / Employer / Date ─────────────
  function detailRow(label: string, value: string, valueItalic = false): TableRow {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          children: [new Paragraph({ children: [body(label, { bold: true })] })],
        }),
        new TableCell({
          width: { size: 75, type: WidthType.PERCENTAGE },
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          children: [new Paragraph({ children: [body(value, { italics: valueItalic, bold: valueItalic })] })],
        }),
      ],
    });
  }

  const detailsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
    rows: [
      detailRow("Name", cin),
      detailRow("Occupation", "Federal Agent"),
      detailRow("Employer", "Australian Federal Police"),
      detailRow("Date", producedDateStr, true),
    ],
  });

  // ── Body paragraphs ───────────────────────────────────────────────────────
  const bodyParagraphs: (Paragraph | Table)[] = [];

  // Header table (logo + "Statement")
  bodyParagraphs.push(headerTable);
  bodyParagraphs.push(hrParagraph());

  // "Statement in the matter of: Operation X"
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        body("Statement in the matter of: "),
        body(`Operation ${operationName}`, { bold: true }),
      ],
    })
  );

  bodyParagraphs.push(spacer(80));

  // Details block
  bodyParagraphs.push(detailsTable);
  bodyParagraphs.push(spacer(80));
  bodyParagraphs.push(hrParagraph());

  // STATES:
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 240 },
      children: [body("STATES:", { bold: true })],
    })
  );

  // ── Numbered paragraphs 1–8 (fixed boilerplate) ───────────────────────────

  bodyParagraphs.push(numberedParagraph(1, [
    body("This statement made by me accurately sets out the evidence that I would be prepared, if necessary, to give in court as a witness."),
  ]));

  bodyParagraphs.push(numberedParagraph(2, [
    body("I am a covert operative, covert identification number (CIN) "),
    body(cin, { bold: false }),
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

    // Sub-item header: "a)  Monday, 17 May 2021"
    bodyParagraphs.push(subItemParagraph(letter, [
      body(dayLabel, { bold: true, italics: true }),
    ]));

    // Author line (only if isAuthor)
    if (day.isAuthor) {
      bodyParagraphs.push(
        new Paragraph({
          indent: { left: convertInchesToTwip(1.0) },
          spacing: { after: 160 },
          children: [
            body("On this day I was responsible for preparing the Surveillance Running Sheet for the Surveillance Team.", { bold: true, italics: true }),
          ],
        })
      );
    }

    // Image times line (only if there are image times)
    if (day.imageTimes.length > 0) {
      const timeStr = day.imageTimes.join(" and ");
      bodyParagraphs.push(
        new Paragraph({
          indent: { left: convertInchesToTwip(1.0) },
          spacing: { after: 160 },
          children: [
            body(`On this day I also took digital images recorded on the Surveillance Running Sheet at ${timeStr}.`, { bold: true, italics: true }),
          ],
        })
      );

      // EXHIBIT label
      bodyParagraphs.push(
        new Paragraph({
          indent: { left: convertInchesToTwip(1.0) },
          spacing: { after: 200 },
          children: [
            body("EXHIBIT", { bold: true, underline: true }),
          ],
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

  bodyParagraphs.push(spacer(200));

  // ── Declaration ───────────────────────────────────────────────────────────

  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        body("This statement is true to the best of my knowledge and belief.  I have made this statement knowing that, if it is tendered in evidence, I will be guilty of a crime if I have wilfully included in the statement anything that I know to be false or that I do not believe is true."),
      ],
    })
  );

  bodyParagraphs.push(spacer(240));

  // ── Signature block ───────────────────────────────────────────────────────

  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [body("Digital signature here", { italics: true, bold: true })],
    })
  );

  // Signature line
  bodyParagraphs.push(
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
      },
      spacing: { after: 120 },
      children: [new TextRun("")],
    })
  );

  // CIN below signature line
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [body(cin)],
    })
  );

  // Date below CIN
  bodyParagraphs.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [body(producedDateStr, { italics: true, bold: true })],
    })
  );

  bodyParagraphs.push(spacer(200));

  // ── RunLog digital certification footer block ─────────────────────────────

  bodyParagraphs.push(
    new Paragraph({
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: "94A3B8" },
      },
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: "RunLog Digital Certification",
          font: "Times New Roman",
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
          font: "Times New Roman",
          size: 18,
          color: "475569",
          italics: true,
        }),
      ],
    })
  );

  // ── Footer: "continued" on all pages except last ──────────────────────────
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
            font: "Times New Roman",
            size: 24,
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
