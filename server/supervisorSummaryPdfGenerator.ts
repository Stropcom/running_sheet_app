/**
 * supervisorSummaryPdfGenerator.ts
 *
 * Generates a real, downloadable .pdf for a Running Sheet's Supervisor
 * Summary — the same sections and data as the existing browser
 * print/"Save as PDF" export (see exportSummaryToPDF in
 * client/src/pages/SheetSummary.tsx), but as an actual file the server
 * hands back, not something built by driving the OS print dialog.
 *
 * Why this exists: on a locked-down device (e.g. an MDM-managed iPad with
 * printing disabled), "Save as PDF" is unavailable too — it's the same
 * underlying system print service. A server-generated file sidesteps that
 * entirely; the client just downloads it like any other attachment.
 *
 * Built with pdfmake (pure JS, no native build step, no headless-browser
 * dependency) rather than rendering the print HTML through something like
 * Playwright. That trades pixel-for-pixel parity with the print version for
 * a much lighter, lower-risk dependency on a small production box — this is
 * a first pass for one report to prove the approach out before it's
 * considered for the other print-based exports.
 */

// pdfmake's Node build exports a singleton instance (`module.exports = new
// pdfmake()`) whose methods rely on their own `this` — destructuring them
// (`import { createPdf, setFonts }`) detaches that binding and throws at
// call time. Import the default export and call methods on it directly.
import pdfMake from "pdfmake";
import type { Content } from "pdfmake";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

// The only image this document ever embeds is a `data:` URI (the static
// map, already fetched and base64-encoded before it reaches here) — never a
// remote URL or a local file path. Deny both by default rather than leaving
// pdfmake's default (fetch/read anything) in place, since the document is
// partly built from user-entered fields.
//
// pdfkit's built-in standard fonts (below) are validated through this same
// "local file" check even though they're not real paths, so the policy has
// to allow exactly those 14 names through — everything else stays denied.
const STANDARD_PDF_FONTS = new Set([
  "Courier",
  "Courier-Bold",
  "Courier-Oblique",
  "Courier-BoldOblique",
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Helvetica-BoldOblique",
  "Times-Roman",
  "Times-Bold",
  "Times-Italic",
  "Times-BoldItalic",
  "Symbol",
  "ZapfDingbats",
]);
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(path => STANDARD_PDF_FONTS.has(path));

pdfMake.setFonts({
  Roboto: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
});

const BLUE_DARK = "#1e3a8a";
const BLUE_LIGHT = "#dbeafe";
const GREY_TEXT = "#1e293b";
const GREY_BORDER = "#e2e8f0";
const MUTED = "#94a3b8";

export interface SupervisorSummaryPdfInput {
  sheetTitle: string;
  form: {
    teamLabel: string;
    teamCins: string;
    operationName: string;
    dayDate: string;
    startTime: string;
    finishTime: string;
    targetName: string;
    location: string;
    ioSupport: string;
    intelSupport: string;
    specialProjects: string; // JSON: {key, detail}[]
    ioContactTiming: string;
    ioContactMethod: string;
    objectives: string; // JSON: string[]
    criticalDecisions: string; // JSON: string[]
    issues: string;
  };
  vehicles: { key: string; label: string }[];
  entries: {
    id: number;
    text: string;
    time?: string | null;
    location?: string | null;
  }[];
  record:
    | { completedAt?: number | null; completedByCIN?: string | null }
    | null
    | undefined;
  /** data: URL, already fetched via rsMapping.getStaticMapImage — same image the print version embeds. */
  mapImageDataUrl: string | null;
}

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mutedNote(text: string): Content {
  return {
    text,
    italics: true,
    fontSize: 9,
    color: MUTED,
    margin: [0, 2, 0, 0],
  };
}

/** A titled card: coloured title bar + body, matching the print version's `.section`. */
function card(title: string, body: Content | Content[]): Content {
  return {
    table: {
      widths: ["*"],
      body: [
        [{ text: title.toUpperCase(), style: "sectionTitle" }],
        [
          {
            stack: Array.isArray(body) ? body : [body],
            margin: [10, 8, 10, 8],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => GREY_BORDER,
      vLineColor: () => GREY_BORDER,
    },
    margin: [0, 0, 0, 10],
    // Matches the print version's `break-inside: avoid` — a title bar
    // stranded at the bottom of a page with its content pushed to the next
    // one is worse than the section starting a line lower.
    unbreakable: true,
  };
}

/** Label/value pairs, two per row — matches the print version's `.detail-grid`. */
function detailGrid(rows: [string, string][]): Content {
  const present = rows.filter(([, v]) => v.trim());
  if (!present.length) return mutedNote("None recorded.");
  return {
    table: {
      widths: [110, "*"],
      body: present.map(([label, value]) => [
        { text: label, style: "detailLabel" },
        { text: value, style: "detailValue" },
      ]),
    },
    layout: "noBorders",
  };
}

function chipList(labels: string[], emptyText: string): Content {
  if (!labels.length) return mutedNote(emptyText);
  // Inline text runs with a per-run background (not `columns`, which lays
  // each item out in its own fixed-width block and was wrapping long labels
  // inside that narrow box instead of flowing to the next line) — this
  // wraps the way the print version's flex chip row does.
  return {
    text: labels.flatMap((label, i) => [
      {
        text: ` ${label} `,
        fontSize: 9,
        bold: true,
        color: BLUE_DARK,
        background: BLUE_LIGHT,
      },
      i < labels.length - 1 ? { text: "  " } : "",
    ]),
    lineHeight: 1.8,
  };
}

function numberedList(items: string[], emptyText: string): Content {
  if (!items.length) return mutedNote(emptyText);
  return {
    ol: items.map(i => ({ text: i, fontSize: 10, margin: [0, 0, 0, 4] })),
  };
}

export async function generateSupervisorSummaryPdf(
  input: SupervisorSummaryPdfInput
): Promise<Buffer> {
  const { sheetTitle, form, vehicles, entries, record, mapImageDataUrl } =
    input;

  const specialProjects = parseJsonArray<{ key: string; detail: string }>(
    form.specialProjects
  );
  const objectives = parseJsonArray<string>(form.objectives).filter(o =>
    o.trim()
  );
  const criticalDecisions = parseJsonArray<string>(
    form.criticalDecisions
  ).filter(d => d.trim());

  const communicationParts = [form.ioContactTiming, form.ioContactMethod]
    .map(s => s.trim())
    .filter(Boolean);

  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const statusText = record?.completedAt
    ? `Complete — ${record.completedByCIN ?? ""}`
    : "In progress";
  const statusColor = record?.completedAt ? "#16a34a" : "#64748b";

  const content: Content[] = [
    // ── Cover header ──────────────────────────────────────────────────────
    {
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                {
                  text: "RUNLOG",
                  color: "#93c5fd",
                  fontSize: 9,
                  bold: true,
                  characterSpacing: 1,
                  alignment: "center",
                },
                {
                  text: "SUPERVISOR SUMMARY",
                  color: "#ffffff",
                  fontSize: 20,
                  bold: true,
                  alignment: "center",
                  margin: [0, 6, 0, 0],
                },
                {
                  text: [
                    form.operationName || "—",
                    form.dayDate ? ` · ${form.dayDate}` : "",
                  ].join(""),
                  color: "#ffffff",
                  fontSize: 13,
                  bold: true,
                  alignment: "center",
                  margin: [0, 6, 0, 0],
                },
                {
                  text: sheetTitle,
                  color: "#c7d5ee",
                  fontSize: 9,
                  alignment: "center",
                  margin: [0, 4, 0, 0],
                },
                {
                  text: statusText,
                  color: statusColor === "#16a34a" ? "#86efac" : "#e2e8f0",
                  bold: true,
                  fontSize: 9,
                  alignment: "center",
                  margin: [0, 8, 0, 0],
                },
              ],
              fillColor: BLUE_DARK,
              margin: [20, 18, 20, 16],
            },
          ],
        ],
      },
      layout: "noBorders",
      margin: [0, 0, 0, 16],
    },

    card(
      "Deployment",
      detailGrid([
        ["Team", form.teamLabel],
        ["Team Members CIN", form.teamCins],
        ["Start time", form.startTime],
        ["Finish time", form.finishTime],
        ["Target (TGT)", form.targetName],
        ["Location", form.location],
      ])
    ),

    card(
      "Vehicle",
      chipList(
        vehicles.map(v => v.label),
        "No vehicles found in the Target Registry or running sheet text."
      )
    ),

    card(
      "Investigator",
      form.ioSupport.trim() ||
        communicationParts.length ||
        form.intelSupport.trim()
        ? detailGrid([
            ["Investigator", form.ioSupport],
            ["Contacted", communicationParts.join(" — ")],
            ["Intel Support", form.intelSupport],
          ])
        : mutedNote("None recorded.")
    ),

    card(
      "Special Projects",
      specialProjects.length
        ? {
            stack: specialProjects.map(p => ({
              text: [
                { text: p.key, bold: true },
                p.detail.trim()
                  ? { text: ` — ${p.detail}`, color: "#475569" }
                  : "",
              ],
              fontSize: 10,
              margin: [0, 0, 0, 4],
            })),
          }
        : mutedNote("None recorded.")
    ),

    card("Objectives", numberedList(objectives, "None recorded.")),
    card(
      "Critical Decisions",
      numberedList(criticalDecisions, "None recorded.")
    ),

    // ── Summary table (kept as a plain flat title bar, matching the print version) ──
    {
      text: "SUMMARY",
      style: "plainSectionTitle",
      margin: [0, 0, 0, 8],
    },
    entries.length
      ? {
          table: {
            headerRows: 1,
            widths: [55, "22%", "*"],
            body: [
              [
                { text: "Time", style: "tableHeader" },
                { text: "Address", style: "tableHeader" },
                { text: "Observation", style: "tableHeader" },
              ],
              ...entries.map(e => [
                { text: e.time || "—", fontSize: 9.5 },
                { text: e.location || "", fontSize: 9.5 },
                { text: e.text, fontSize: 9.5 },
              ]),
            ],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => GREY_BORDER,
            vLineColor: () => GREY_BORDER,
          },
          margin: [0, 0, 0, 16],
        }
      : mutedNote("No running sheet rows yet."),

    card(
      "Issues",
      form.issues.trim() ? { text: form.issues, fontSize: 10 } : ""
    ),

    {
      text: `Generated: ${generatedAt}`,
      fontSize: 8,
      color: MUTED,
      margin: [0, 4, 0, 0],
    },
  ];

  if (mapImageDataUrl) {
    content.push({
      text: "LOCATION MAP",
      style: "plainSectionTitle",
      pageBreak: "before",
      margin: [0, 0, 0, 8],
    });
    content.push({
      image: mapImageDataUrl,
      width: 515,
    });
  }

  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [40, 30, 40, 50],
    defaultStyle: { font: "Roboto", color: GREY_TEXT, fontSize: 10 },
    styles: {
      sectionTitle: {
        fontSize: 8.5,
        bold: true,
        color: BLUE_DARK,
        fillColor: BLUE_LIGHT,
        margin: [10, 4, 10, 4],
        characterSpacing: 0.5,
      },
      plainSectionTitle: {
        fontSize: 9.5,
        bold: true,
        color: BLUE_DARK,
        fillColor: BLUE_LIGHT,
        margin: [8, 5, 8, 5],
      },
      detailLabel: {
        fontSize: 9,
        color: "#64748b",
        bold: true,
        margin: [0, 2, 0, 2],
      },
      detailValue: { fontSize: 9, color: GREY_TEXT, margin: [0, 2, 0, 2] },
      tableHeader: {
        bold: true,
        fontSize: 8.5,
        color: BLUE_DARK,
        fillColor: BLUE_LIGHT,
      },
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: "", width: "*" },
        {
          text: "PROTECTED",
          color: "#dc2626",
          bold: true,
          fontSize: 8,
          alignment: "center",
          width: "auto",
        },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          color: BLUE_DARK,
          bold: true,
          fontSize: 8,
          alignment: "right",
          width: "*",
        },
      ],
      margin: [40, 12, 40, 0],
    }),
    content,
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBuffer();
}
