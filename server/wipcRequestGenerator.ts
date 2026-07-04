/**
 * wipcRequestGenerator.ts
 *
 * Generates a .docx WIPC Request (Application for Witness Identity Protection Certificate)
 * exactly matching the HUMINT Ops – Capability Protection Team template.
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
  ShadingType,
  UnderlineType,
  CheckBox,
} from "docx";

// ── Types ────────────────────────────────────────────────────────────────────
export interface WipcRequestInput {
  operationName: string;
  courtDate: string;            // e.g. "28th April 2026"
  courtLocation: string;        // e.g. "Perth District Court"
  requestingCommander: string;  // e.g. "Commander COLLIE"
  assistantCommissioner: string; // e.g. "A/C SCANLAN"
  isUrgent: boolean;
  requestingOfficerFullName: string;
  requestingOfficerAfpId: string;
  requestingOfficerWorkLocation: string;
  requestingOfficerPortfolio: string;
  requestingOfficerContact: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const FONT = "Arial";
const SIZE = 18;       // 9pt
const SIZE_BODY = 20;  // 10pt
const SIZE_SMALL = 16; // 8pt
const SIZE_TITLE = 22; // 11pt

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

function sp(before = 0, after = 0) {
  return { before, after, line: 240, lineRule: LineRuleType.AUTO };
}

function run(text: string, opts: {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number;
  color?: string;
  font?: string;
} = {}) {
  return new TextRun({
    text,
    bold: opts.bold ?? false,
    italics: opts.italic ?? false,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    size: opts.size ?? SIZE_BODY,
    color: opts.color,
    font: opts.font ?? FONT,
  });
}

function para(
  children: TextRun[],
  opts: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    before?: number;
    after?: number;
    indent?: { left?: number; right?: number; firstLine?: number; hanging?: number };
  } = {}
) {
  return new Paragraph({
    children,
    alignment: opts.alignment ?? AlignmentType.LEFT,
    spacing: sp(opts.before ?? 0, opts.after ?? 60),
    indent: opts.indent,
  });
}

function emptyPara(size = SIZE_BODY) {
  return new Paragraph({ children: [run("", { size })], spacing: sp(0, 60) });
}

function cell(paragraphs: Paragraph[], opts: {
  width?: number;
  borders?: typeof noBorder;
  shading?: { fill: string };
  bold?: boolean;
} = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    borders: opts.borders ?? thinBorder,
    shading: opts.shading ? { type: ShadingType.CLEAR, fill: opts.shading.fill, color: opts.shading.fill } : undefined,
    children: paragraphs,
  });
}

// ── Main generator ────────────────────────────────────────────────────────────
export async function generateWipcRequestDocx(input: WipcRequestInput): Promise<Buffer> {
  const {
    operationName,
    courtDate,
    courtLocation,
    requestingCommander,
    assistantCommissioner,
    isUrgent,
    requestingOfficerFullName,
    requestingOfficerAfpId,
    requestingOfficerWorkLocation,
    requestingOfficerPortfolio,
    requestingOfficerContact,
  } = input;

  // ── PROTECTED banner (top) ──────────────────────────────────────────────────
  const protectedBanner = (text = "PROTECTED") =>
    para(
      [run(text, { bold: true, size: 22, color: "C00000" })],
      { alignment: AlignmentType.CENTER, after: 40 }
    );

  // ── Header row: HUMINT Ops line + WIPC reference ───────────────────────────
  const headerInfoRow = new Table({
    width: { size: 9000, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 6000, type: WidthType.DXA },
            borders: noBorder,
            children: [para([run("HUMINT Ops – Capability Protection Team Use:", { size: SIZE_SMALL, italic: true })], { after: 0 })],
          }),
          new TableCell({
            width: { size: 3000, type: WidthType.DXA },
            borders: noBorder,
            children: [para([run("WIPC = / =", { size: SIZE_SMALL })], { alignment: AlignmentType.RIGHT, after: 0 })],
          }),
        ],
      }),
    ],
  });

  // ── Title banner (dark background) ─────────────────────────────────────────
  const titleBanner = new Table({
    width: { size: 9000, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 7200, type: WidthType.DXA },
            borders: thinBorder,
            shading: { type: ShadingType.CLEAR, fill: "1F3864", color: "1F3864" },
            children: [
              new Paragraph({
                children: [run("HUMINT OPS – Capability Protection Team", { bold: true, size: SIZE_TITLE, color: "FFFFFF" })],
                spacing: sp(120, 40),
                indent: { left: 120 },
              }),
              new Paragraph({
                children: [run("Application for Witness Identity Protection Certificate", { bold: true, size: SIZE_TITLE, color: "FFFFFF" })],
                spacing: sp(0, 120),
                indent: { left: 120 },
              }),
            ],
          }),
          new TableCell({
            width: { size: 1800, type: WidthType.DXA },
            borders: thinBorder,
            shading: { type: ShadingType.CLEAR, fill: "FFFFFF", color: "FFFFFF" },
            children: [
              new Paragraph({
                children: [run("AFP", { bold: true, size: 36, color: "1F3864" })],
                alignment: AlignmentType.CENTER,
                spacing: sp(80, 0),
              }),
              new Paragraph({
                children: [run("AUSTRALIAN FEDERAL POLICE", { size: SIZE_SMALL, color: "1F3864" })],
                alignment: AlignmentType.CENTER,
                spacing: sp(0, 80),
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // ── Intro text ──────────────────────────────────────────────────────────────
  const introText: Paragraph[] = [
    emptyPara(),
    para([run("Please complete this form when requesting a Witness Identity Protection Certificate (WIPC).")], { after: 40 }),
    para([run("Only one Operation per form.")], { after: 120 }),
    para([run("All members requiring a WIPC MUST be included on this form.", { bold: true })], { after: 40 }),
    para([run("Each member requiring a WIPC MUST complete a Stat Dec not more than 3 months old.", { bold: true })], { after: 120 }),
  ];

  // ── Court / operation details ───────────────────────────────────────────────
  const detailsBlock: Paragraph[] = [
    para([run("COURT DATE: ", { bold: true }), run(courtDate)], { after: 40 }),
    para([run("COURT LOCATION: ", { bold: true }), run(courtLocation)], { after: 40 }),
    para([run("OPERATION NAME: ", { bold: true }), run(operationName)], { after: 40 }),
    para([run("REQUESTING AREAS COMMANDER: ", { bold: true }), run(requestingCommander)], { after: 40 }),
    para([run("REQUESTING AREAS ASSISTANT COMMISSIONER: ", { bold: true }), run(assistantCommissioner)], { after: 40 }),
    para([run(isUrgent ? "\u2612 URGENT" : "\u2610 URGENT", { bold: true })], { after: 120 }),
  ];

  // ── Requesting Officer heading ──────────────────────────────────────────────
  const requestingOfficerHeading = para(
    [run("REQUESTING OFFICER (AFP CASE OFFICER/CONTROLLER/OIC)", { bold: true })],
    { after: 60 }
  );

  // ── Requesting Officer table ────────────────────────────────────────────────
  const officerTable = new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          cell([para([run("FULL NAME", { bold: true })])], { width: 2000 }),
          cell([para([run(requestingOfficerFullName)])], { width: 7000 }),
        ],
      }),
      new TableRow({
        children: [
          cell([para([run("AFP ID", { bold: true })])], { width: 2000 }),
          cell([para([run(requestingOfficerAfpId)])], { width: 2000 }),
          cell([para([run("AFP WORK LOCATION", { bold: true })])], { width: 2000 }),
          cell([para([run(requestingOfficerWorkLocation)])], { width: 3000 }),
        ],
      }),
      new TableRow({
        children: [
          cell([para([run("PORTFOLIO/TEAM", { bold: true })])], { width: 2000 }),
          cell([para([run(requestingOfficerPortfolio)])], { width: 7000 }),
        ],
      }),
      new TableRow({
        children: [
          cell([para([run("CONTACT NUMBER", { bold: true })])], { width: 2000 }),
          cell([para([run(requestingOfficerContact)])], { width: 7000 }),
        ],
      }),
    ],
  });

  // ── Operation details box ───────────────────────────────────────────────────
  const operationDetailsSection: Paragraph[] = [
    emptyPara(),
    para([run("OPERATION DETAILS", { bold: true })], { after: 40 }),
  ];

  const operationDetailsBox = new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: thinBorder,
            children: [
              new Paragraph({
                children: [run(operationName)],
                spacing: sp(120, 120),
                indent: { left: 120 },
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // ── Criteria confirmation ───────────────────────────────────────────────────
  const criteriaSection: Paragraph[] = [
    emptyPara(),
    para(
      [run("Please confirm that the below members meet the criteria of the definition of \u2018operative\u2019 under s 15M.")],
      { after: 80 }
    ),
    para(
      [run("a)\ta participant in a controlled operation authorised under Part IAB; or")],
      { indent: { left: 360 }, after: 40 }
    ),
    para(
      [run("b)\t", { bold: true }), run("authorised to acquire and use an assumed identity under Part IAC by the chief officer of a law enforcement agency", { bold: true })],
      { indent: { left: 360 }, after: 120 }
    ),
  ];

  // ── WIPC Justification ──────────────────────────────────────────────────────
  const justificationSection: Paragraph[] = [
    para([run("WIPC JUSTIFICATION", { bold: true })], { after: 40 }),
    para(
      [run("Please select from below, the justification for the WIPC application referring to s15ME(1b) of the "), run("Crimes Act 1914", { italic: true }), run(" (Cth).")],
      { after: 80 }
    ),
    para([run("(i)\tendanger the safety of the operative or another person; or")], { indent: { left: 360 }, after: 40 }),
    para([run("(ii)\tprejudice any current or future investigation; or")], { indent: { left: 360 }, after: 40 }),
    para([run("(iii)\tprejudice any current or future activity relating to security")], { indent: { left: 360 }, after: 120 }),
  ];

  // ── Justification text box ──────────────────────────────────────────────────
  const justificationBox = new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: thinBorder,
            children: [
              new Paragraph({
                children: [run("Issuing a Witness Identity Protection Certificate is justified on the grounds that disclosure of the operative\u2019s identity would endanger the safety of the operative and prejudice current and future investigations.")],
                spacing: sp(80, 80),
                indent: { left: 120, right: 120 },
                alignment: AlignmentType.JUSTIFIED,
              }),
              new Paragraph({
                children: [run(`The operative was deployed as a covert surveillance operative during Operation ${operationName} and conducted duties under an approved assumed identity, including making observations and compiling evidentiary running sheets relied upon by the prosecution.`)],
                spacing: sp(80, 80),
                indent: { left: 120, right: 120 },
                alignment: AlignmentType.JUSTIFIED,
              }),
              new Paragraph({
                children: [run("The accused is linked to serious organised criminal activity involving the importation of significant quantities of methamphetamine and has demonstrated access to interstate and international criminal associates.")],
                spacing: sp(80, 80),
                indent: { left: 120, right: 120 },
                alignment: AlignmentType.JUSTIFIED,
              }),
              new Paragraph({
                children: [
                  run("Disclosure of the operative\u2019s "),
                  run("true identity", { underline: true }),
                  run(" would expose the operative to a credible risk of reprisal, compromise covert methodologies and undermine the effectiveness of future covert surveillance operations."),
                ],
                spacing: sp(80, 80),
                indent: { left: 120, right: 120 },
                alignment: AlignmentType.JUSTIFIED,
              }),
              new Paragraph({
                children: [run("Accordingly, identity protection is necessary to preserve the safety of the operative and the integrity of ongoing future AFP")],
                spacing: sp(80, 120),
                indent: { left: 120, right: 120 },
                alignment: AlignmentType.JUSTIFIED,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // ── Bottom PROTECTED banner ─────────────────────────────────────────────────
  const bottomBanner: Paragraph[] = [
    emptyPara(),
    protectedBanner(),
    para(
      [run("UPDATED January 2026", { size: SIZE_SMALL, italic: true })],
      { alignment: AlignmentType.RIGHT, after: 0 }
    ),
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
          protectedBanner(),
          headerInfoRow,
          emptyPara(),
          titleBanner,
          ...introText,
          ...detailsBlock,
          requestingOfficerHeading,
          officerTable,
          ...operationDetailsSection,
          operationDetailsBox,
          ...criteriaSection,
          ...justificationSection,
          justificationBox,
          ...bottomBanner,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
