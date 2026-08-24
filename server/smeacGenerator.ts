/**
 * smeacGenerator.ts
 *
 * Generates a .docx export of a SMEAC briefing. Matches the AFP statement
 * template style used by every other export in the app (Statement, Witness
 * List, WIPC): Roboto 10pt, 1.5 line spacing, justified paragraphs, no
 * visible table borders, bold+underline section headings, horizontal rule
 * dividers, RunLog Digital Certification footer block.
 *
 * Section content/order mirrors SmeacMapOverlay.tsx's read view exactly, so
 * the exported document reads as the same briefing an officer sees on
 * screen — same field labels, same conditional "only show if present"
 * behaviour per field.
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
} from "docx";
import { format } from "date-fns";
import type { SmeacTeamSlot } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmeacExportInput {
  operationName: string;
  revision: number;
  status: "draft" | "posted";
  postedAt: number | null;
  postedByCIN: string | null;

  targetName: string | null;
  voi: string | null;
  hb: string | null;
  extraLocations: string[];

  backgroundIntel: string | null;
  knownRisks: string | null;
  otherAgencies: string[];

  mission: string | null;

  overallPlan: string | null;
  actionsOn: string | null;
  situationChange: string | null;
  objectives: string[];
  teamSlots: SmeacTeamSlot[];

  legalAuthArrest: string | null;
  afpOrders: string | null;
  warrant: string | null;
  accoutrements: string[];
  covertIdentifiers: string[];
  firstAidAllVehicles: boolean;
  firstAidMemberName: string | null;

  locationOfTeamLeader: string | null;
  reportingProcedures: string | null;
  commsPrimary: string | null;
  commsSecondary: string | null;

  producedAt: number;
  certifierCin: string;
}

// ─── Helpers (matches witnessListGenerator.ts conventions) ────────────────────

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

function run(
  text: string,
  opts: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    size?: number;
  } = {}
) {
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

function formatDateTime(ts: number) {
  return format(new Date(ts), "d MMMM yyyy, h:mm a");
}

const hrPara = (spaceBefore = 160, spaceAfter = 160) =>
  new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
    spacing: { before: spaceBefore, after: spaceAfter },
  });

const sectionHeading = (text: string, spaceBefore = 240) =>
  para([run(text, { bold: true, underline: true })], {
    spaceBefore,
    spaceAfter: 80,
  });

const fieldLabel = (text: string, spaceBefore = 0) =>
  para([run(text, { bold: true })], { spaceBefore, spaceAfter: 40 });

const bulletList = (items: string[]) =>
  items.map((item, i) =>
    para([run(`${i + 1}.   ${item}`)], {
      indent: { left: 360 },
      spaceAfter: 60,
    })
  );

const chipList = (items: string[]) =>
  para([run(items.join("  •  "))], { spaceAfter: 80 });

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateSmeacDocx(
  input: SmeacExportInput
): Promise<Buffer> {
  const producedDateStr = formatDate(input.producedAt);
  const cinLabel = (cin: string) => `CIN${cin}`;

  // ── Header table (AFP logo placeholder + title) ─────────────────────────────
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
            para([run("Surveillance SMEAC", { bold: true, size: 24 })], {
              align: AlignmentType.RIGHT,
              spaceAfter: 0,
            })
          ),
        ],
      }),
    ],
  });

  // ── Title line ───────────────────────────────────────────────────────────────
  const titlePara = para(
    [
      run("Surveillance SMEAC in the matter of: ", { bold: true }),
      run(`Operation ${input.operationName}`, { bold: true }),
    ],
    { spaceBefore: 240, spaceAfter: 120 }
  );

  // ── Details table ─────────────────────────────────────────────────────────────
  const detailRows: TableRow[] = [
    new TableRow({
      children: [
        noBorderCell(fieldLabel("Date"), 2000),
        noBorderCell(
          para([run(producedDateStr, { italic: true, bold: true })], {
            spaceAfter: 40,
          })
        ),
      ],
    }),
    new TableRow({
      children: [
        noBorderCell(fieldLabel("Status"), 2000),
        noBorderCell(
          para(
            [
              run(
                input.status === "posted"
                  ? `Posted${input.postedByCIN ? ` by ${cinLabel(input.postedByCIN)}` : ""}${input.postedAt ? ` · ${formatDateTime(input.postedAt)}` : ""}`
                  : "Draft"
              ),
            ],
            { spaceAfter: 40 }
          )
        ),
      ],
    }),
    new TableRow({
      children: [
        noBorderCell(fieldLabel("Revision"), 2000),
        noBorderCell(para([run(String(input.revision))], { spaceAfter: 40 })),
      ],
    }),
    new TableRow({
      children: [
        noBorderCell(fieldLabel("Produced by"), 2000),
        noBorderCell(
          para([run(cinLabel(input.certifierCin))], { spaceAfter: 40 })
        ),
      ],
    }),
  ];
  const detailsTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    borders: NO_BORDER,
    rows: detailRows,
  });

  const body: (Paragraph | Table)[] = [
    headerTable,
    titlePara,
    detailsTable,
    emptyPara(),
  ];

  // ── TARGET — precedes SMEAC, not part of it (matches SmeacMapOverlay) ──────
  if (
    input.targetName ||
    input.voi ||
    input.hb ||
    input.extraLocations.length > 0
  ) {
    body.push(hrPara(160, 120));
    body.push(sectionHeading("TARGET", 0));
    if (input.targetName)
      body.push(para([run(`POI: ${input.targetName}`)], { spaceAfter: 60 }));
    if (input.voi)
      body.push(para([run(`VOI: ${input.voi}`)], { spaceAfter: 60 }));
    if (input.hb) body.push(para([run(`HB: ${input.hb}`)], { spaceAfter: 60 }));
    if (input.extraLocations.length > 0) {
      body.push(fieldLabel("Other locations", 40));
      body.push(chipList(input.extraLocations));
    }
  }

  // ── S — SITUATION ────────────────────────────────────────────────────────────
  if (
    input.backgroundIntel ||
    input.knownRisks ||
    input.otherAgencies.length > 0
  ) {
    body.push(hrPara(160, 120));
    body.push(sectionHeading("S — Situation", 0));
    if (input.backgroundIntel) {
      body.push(fieldLabel("Background / intelligence"));
      body.push(para([run(input.backgroundIntel)], { spaceAfter: 120 }));
    }
    if (input.knownRisks) {
      body.push(fieldLabel("Known risks or threats"));
      body.push(para([run(input.knownRisks)], { spaceAfter: 120 }));
    }
    if (input.otherAgencies.length > 0) {
      body.push(fieldLabel("Other agencies / teams"));
      body.push(chipList(input.otherAgencies));
    }
  }

  // ── M — MISSION ──────────────────────────────────────────────────────────────
  if (input.mission) {
    body.push(hrPara(160, 120));
    body.push(sectionHeading("M — Mission", 0));
    body.push(para([run(input.mission)], { spaceAfter: 80 }));
  }

  // ── E — EXECUTION ────────────────────────────────────────────────────────────
  if (
    input.overallPlan ||
    input.actionsOn ||
    input.situationChange ||
    input.objectives.length > 0 ||
    input.teamSlots.length > 0
  ) {
    body.push(hrPara(160, 120));
    body.push(sectionHeading("E — Execution", 0));
    if (input.overallPlan) {
      body.push(fieldLabel("Overall plan"));
      body.push(para([run(input.overallPlan)], { spaceAfter: 120 }));
    }
    if (input.actionsOn) {
      body.push(fieldLabel("Actions on"));
      body.push(para([run(input.actionsOn)], { spaceAfter: 120 }));
    }
    if (input.situationChange) {
      body.push(fieldLabel("Situation change"));
      body.push(para([run(input.situationChange)], { spaceAfter: 120 }));
    }
    if (input.objectives.length > 0) {
      body.push(fieldLabel("Objectives"));
      body.push(...bulletList(input.objectives));
      body.push(emptyPara());
    }
    if (input.teamSlots.length > 0) {
      body.push(fieldLabel("Surveillance team"));
      for (const slot of input.teamSlots) {
        const nameLine = slot.isTeamLeader ? `${slot.name}  (TL)` : slot.name;
        body.push(
          para([run(nameLine, { bold: true })], {
            spaceBefore: 60,
            spaceAfter: 20,
          })
        );
        const details = [
          slot.vehicle && `Vehicle: ${slot.vehicle}`,
          slot.foot && `Foot: ${slot.foot}`,
          slot.skill && `Skill: ${slot.skill}`,
          slot.kit && `Kit: ${slot.kit}`,
        ].filter(Boolean) as string[];
        if (details.length > 0) {
          body.push(
            para([run(details.join("   |   "))], {
              indent: { left: 360 },
              spaceAfter: 60,
            })
          );
        }
      }
      body.push(emptyPara());
    }
  }

  // ── A — ADMINISTRATION & LOGISTICS ──────────────────────────────────────────
  if (
    input.legalAuthArrest ||
    input.afpOrders ||
    input.warrant ||
    input.accoutrements.length > 0 ||
    input.covertIdentifiers.length > 0 ||
    !input.firstAidAllVehicles
  ) {
    body.push(hrPara(160, 120));
    body.push(sectionHeading("A — Administration & Logistics", 0));
    if (input.legalAuthArrest) {
      body.push(
        para(
          [
            run("Legal auth — arrest: ", { bold: true }),
            run(input.legalAuthArrest),
          ],
          { spaceAfter: 60 }
        )
      );
    }
    if (input.afpOrders) {
      body.push(
        para([run("AFP Orders: ", { bold: true }), run(input.afpOrders)], {
          spaceAfter: 60,
        })
      );
    }
    if (input.warrant) {
      body.push(
        para([run("Warrant: ", { bold: true }), run(input.warrant)], {
          spaceAfter: 60,
        })
      );
    }
    if (input.accoutrements.length > 0) {
      body.push(fieldLabel("Accoutrements", 40));
      body.push(chipList(input.accoutrements));
    }
    if (input.covertIdentifiers.length > 0) {
      body.push(fieldLabel("Covert police identifier", 40));
      body.push(chipList(input.covertIdentifiers));
    }
    body.push(
      para(
        [
          run(
            input.firstAidAllVehicles
              ? "First aid kit confirmed in all vehicles"
              : `First aid held by ${input.firstAidMemberName || "—"}`
          ),
        ],
        { spaceAfter: 80 }
      )
    );
  }

  // ── C — COMMAND & SIGNAL ────────────────────────────────────────────────────
  const teamLeader = input.teamSlots.find(s => s.isTeamLeader);
  if (
    input.commsPrimary ||
    input.commsSecondary ||
    input.locationOfTeamLeader ||
    input.reportingProcedures ||
    teamLeader
  ) {
    body.push(hrPara(160, 120));
    body.push(sectionHeading("C — Command & Signal", 0));
    if (teamLeader) {
      body.push(
        para([run("Team leader: ", { bold: true }), run(teamLeader.name)], {
          spaceAfter: 60,
        })
      );
    }
    if (input.locationOfTeamLeader) {
      body.push(fieldLabel("Location of team leader"));
      body.push(para([run(input.locationOfTeamLeader)], { spaceAfter: 120 }));
    }
    if (input.reportingProcedures) {
      body.push(fieldLabel("Reporting procedures"));
      body.push(para([run(input.reportingProcedures)], { spaceAfter: 120 }));
    }
    if (input.commsPrimary) {
      body.push(
        para(
          [run("Comms Primary: ", { bold: true }), run(input.commsPrimary)],
          { spaceAfter: 60 }
        )
      );
    }
    if (input.commsSecondary) {
      body.push(
        para(
          [run("Comms Secondary: ", { bold: true }), run(input.commsSecondary)],
          { spaceAfter: 60 }
        )
      );
    }
  }

  // ── RunLog Digital Certification ────────────────────────────────────────────
  body.push(
    hrPara(240, 120),
    emptyPara(),
    para([run("RunLog Digital Certification", { bold: true })], {
      spaceAfter: 40,
    }),
    para(
      [run(`Certified by ${cinLabel(input.certifierCin)}  ${producedDateStr}`)],
      { spaceAfter: 0 }
    )
  );

  // ── Assemble document ────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
          },
        },
        children: body,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
