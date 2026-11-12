import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import { robotoFontFaceCss, whenFontsReady } from "@/lib/exportFonts";
import { toast } from "sonner";
import { format } from "date-fns";
import type { ExportRow, OperationMeta, CinEntry } from "./types";
import {
  PERTH_TIME_ZONE,
  ymdToPerthMs,
  addDaysToYmd,
  formatPerthDateLabel,
} from "./perthDates";
import { isFullTeamMembers } from "./teamMembers";

// Renders attached photos as inline <img> tags at ~1/3 cell width, matching
// the live table's proportions (see ObservationAttachments). align-items
// must be set explicitly — flex's default "stretch" forces every image in a
// row to the height of its tallest sibling, distorting a landscape photo's
// proportions the moment it sits next to a portrait one. ObservationAttachments
// avoids this with its own "items-end" on the equivalent live container;
// matching that here so a photo prints/exports at its natural aspect ratio,
// same as it already appears on the running sheet itself.
//
// Each photo gets a caption strip joined to its bottom edge, the same width
// as the photo, with "Taken by CIN 484" centred in black (several linked
// CINs read "CIN 484, 503"). A photo not yet linked to a CIN gets the same
// strip left blank, so every photo in a row is the same height and the strips
// line up. Black on light grey, so it reads the same in a black-and-white
// print. Export only — the live sheet keeps its green CIN pills
// (LinkedEntityPills); the link itself is the "member" category link — see
// LinkAttachmentDialog's CIN section / autoLinkAttachmentToRowMemberIfSingle
// in db.ts.
function attachmentImagesHtml(
  attachments: {
    url: string;
    linkedEntities?: Array<{ category: string; label: string }>;
  }[]
): string {
  if (attachments.length === 0) return "";
  // A full blank line before the photos, not just a small margin — matches
  // OBS_TRAILING_SPACE's own "<br/><br/>" convention for a blank line
  // elsewhere in this export: a single <br/> only starts a new line, it
  // takes a second one to actually leave that line empty before the photos.
  return (
    `<br/><br/><div style="margin-top:2px;display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px">` +
    attachments
      .map(a => {
        const cins = (a.linkedEntities ?? [])
          .filter(e => e.category === "member")
          .map(e => e.label);
        const stripHtml =
          `<div style="width:100%;box-sizing:border-box;border:1px solid #ccc;border-top:0;border-radius:0 0 4px 4px;background:#f1f1f1;color:#000;font-size:9px;line-height:1.3;padding:2px 4px;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact">` +
          (cins.length > 0
            ? `Taken by&nbsp;<strong>CIN ${cins.join(", ")}</strong>`
            : "&nbsp;") +
          `</div>`;
        return (
          `<div style="width:calc(50% - 4px);max-width:320px;box-sizing:border-box;display:flex;flex-direction:column;align-items:stretch;break-inside:avoid;page-break-inside:avoid">` +
          `<img src="${a.url}" style="display:block;box-sizing:border-box;width:100%;border:1px solid #ccc;border-radius:4px 4px 0 0" />` +
          stripHtml +
          `</div>`
        );
      })
      .join("") +
    `</div>`
  );
}

export function exportToPDF(
  sheetTitle: string,
  rows: ExportRow[],
  operation: OperationMeta,
  sheetCinsRaw: string | null,
  sheetCreatedAt: Date,
  targetFullName?: string | null,
  sheetDate?: string | null
) {
  const lockedBg = "#ffffff"; // White in PDF — dark green is screen-only via CSS class
  const cb = "border-right:1px solid #e2e9f6";
  const bb = "border-bottom:1px solid #eef2fb";
  // Reserves 2 blank lines below the observation text so printed rows read
  // with breathing room, matching the live table's pb-10 Observation cell.
  const OBS_TRAILING_SPACE = "<br/><br/>";

  // Parse TEAM roster — sort: TL first, then numerically
  let cinRoster: CinEntry[] = [];
  try {
    const raw: CinEntry[] = sheetCinsRaw ? JSON.parse(sheetCinsRaw) : [];
    cinRoster = [...raw].sort((a, b) => {
      if (a.isTeamLeader && !b.isTeamLeader) return -1;
      if (!a.isTeamLeader && b.isTeamLeader) return 1;
      const aNum = parseInt(a.cin, 10);
      const bNum = parseInt(b.cin, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.cin.localeCompare(b.cin);
    });
  } catch {
    cinRoster = [];
  }

  // ── Page header (repeats on every page) ─────────────────────────────────────
  const operationName = operation?.name ?? "";
  const dateStr = sheetDate
    ? format(new Date(`${sheetDate}T00:00:00`), "d MMMM yyyy")
    : format(new Date(sheetCreatedAt), "d MMMM yyyy");

  // Derive the author CIN from the roster (isAuthor flag)
  const authorEntry = cinRoster.find(c => c.isAuthor);
  const authorCin = authorEntry?.cin ?? null;

  // Find the most recent active certification belonging to the author CIN.
  // Light-on-dark, used only in the footer band's "Prepared by" — the top
  // banner's meta pill shows the plain CIN with no tick regardless of
  // certification status.
  let preparedByPill = "";
  if (authorCin) {
    let latestCert: {
      certifiedByCIN?: string;
      certifiedByName: string;
      certifiedAt: number;
    } | null = null;
    for (const row of rows) {
      for (const cert of row.certifications) {
        if (!cert.isActive) continue;
        const certCin =
          ("certifiedByCIN" in cert ? (cert as any).certifiedByCIN : null) ||
          cert.certifiedByName;
        if (certCin === authorCin) {
          if (!latestCert || cert.certifiedAt > latestCert.certifiedAt) {
            latestCert = cert as any;
          }
        }
      }
    }
    if (latestCert) {
      const certCin =
        ("certifiedByCIN" in latestCert
          ? (latestCert as any).certifiedByCIN
          : null) || latestCert.certifiedByName;
      const certTime = format(
        new Date(latestCert.certifiedAt),
        "d MMMM yyyy h:mmaaa"
      );
      preparedByPill = `<span style='color:#86efac;white-space:nowrap'>&#10003; ${certCin}</span> <span style='opacity:0.65;font-weight:400;text-transform:none;letter-spacing:0'>${certTime}</span>`;
    } else {
      // Author exists but hasn't certified yet — show CIN without tick
      preparedByPill = authorCin;
    }
  }

  // ── Imagery Taken row data ───────────────────────────────────────────────────
  const IMAGERY_PHRASES = [
    "PHOTOGRAPHS TAKEN",
    "PHOTOGRAPH/S TAKEN",
    "PHOTOGRAPH TAKEN",
    "VIDEO TAKEN",
    "VIDEO FOOTAGE TAKEN",
    "PHOTOS TAKEN",
    "PHOTO TAKEN",
  ];
  const imageryEntries: { cin: string; time: string }[] = [];
  for (const row of rows) {
    const obs = (row.observation ?? "").toUpperCase();
    const hasImagery = IMAGERY_PHRASES.some(p => obs.includes(p));
    if (hasImagery && row.time) {
      for (const m of row.members) {
        if (m.memberName !== "__SPACE__") {
          imageryEntries.push({ cin: m.memberName, time: row.time });
        }
      }
    }
  }
  // Deduplicate by cin+time
  const seenImagery = new Set<string>();
  const uniqueImageryEntries = imageryEntries.filter(e => {
    const key = `${e.cin}|${e.time}`;
    if (seenImagery.has(key)) return false;
    seenImagery.add(key);
    return true;
  });
  const imageryRowHtml =
    uniqueImageryEntries.length > 0
      ? uniqueImageryEntries.map(e => `${e.cin} (${e.time})`).join(", ")
      : "Nil";

  // ── Drop imagery-keyword phrases from the exported observation text ──────────
  // "PHOTOGRAPH/S TAKEN" (and its variants) is needed live — it drives the
  // photo-upload affordance and the Governance imagery check (see
  // IMAGERY_PHRASE_PATTERN above) — but is redundant once printed: the
  // photo(s) and their CIN caption(s) (see attachmentImagesHtml) already say
  // everything the phrase would. Only the phrase text is removed here; any
  // <br/> line breaks around it (already present from the observation's own
  // \n -> <br/> conversion at each call site below) are left as-is, then
  // collapsed/trimmed afterwards so removing the phrase's own line doesn't
  // leave a stray run of blank lines or trailing space before the photos.
  function stripImageryPhraseForExport(text: string): string {
    const pattern =
      /(PHOTOGRAPHS TAKEN|PHOTOGRAPH\/S TAKEN|PHOTOGRAPH TAKEN|VIDEO FOOTAGE TAKEN|VIDEO TAKEN|PHOTOS TAKEN|PHOTO TAKEN)\.?/gi;
    return text
      .replace(pattern, "")
      .replace(/(<br\/>\s*){3,}/g, "<br/><br/>")
      .replace(/(<br\/>\s*)+$/g, "")
      .trim();
  }

  // ── Page headers ────────────────────────────────────────────────────────────
  // Same look as the Supervisor Summary / Weekly Tasking exports (a centred
  // dark-blue banner: brand dot, "RunLog", title) with the details in labelled
  // cells in two equal columns, drawn like the log table beneath it:
  //   Operation | Date
  //   Target    | Prepared by
  //   Imagery taken (full width)
  // With no target, Prepared by takes the whole second row; with no author
  // CIN, Target takes it.
  //
  // Strategy: the full banner (first-page-header) is page 1 — on screen and in
  // print; the compact version lives in the <thead> and repeats at the top of
  // pages 2+ (on page 1 it is covered by the full banner) — see the print
  // strategy comment in the beforeprint script.
  const escHdr = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const detailCell = (label: string, value: string, full = false) =>
    `<div class="dc${full ? " dc-full" : ""}"><div class="dl">${label}</div><div class="dv">${escHdr(value)}</div></div>`;
  const hasTarget = !!targetFullName;
  const detailsHtml = `
    <div class="details">
      ${detailCell("Operation", operationName)}
      ${detailCell("Date", dateStr)}
      ${hasTarget ? detailCell("Target", targetFullName ?? "", !authorCin) : ""}
      ${authorCin ? detailCell("Prepared by", authorCin, !hasTarget) : ""}
      <div class="di"><span class="dl">Imagery taken</span> <b>${imageryRowHtml}</b></div>
    </div>`;

  // Banner + details builder — `compact` is the repeating thead version for
  // pages 2+ (one-line banner, smaller cells); the full one is page 1 and the
  // on-screen preview. The imagery row is in both, so it is on every printed
  // page.
  function coverHeaderHtml(compact: boolean): string {
    return `
      <div class="cover-header${compact ? " compact" : ""}">
        <div class="brand-row"><div class="brand-dot"></div><span class="brand-label">RunLog</span></div>
        <div class="rs-title">WC SURVEILLANCE RUNNING SHEET</div>
      </div>${detailsHtml}`;
  }

  // ── Running sheet table ──────────────────────────────────────────────────────
  // Spacer row inserted after each log entry for breathing room
  const spacerRow = `<tr><td colspan="3" style="padding:0;height:8px;border:none;background:transparent"></td></tr>`;

  // ── Build day-offset map for export rows (rowDate-aware, falls back to inference) ──
  const exportDayOffsetMap = new Map<number, number>();
  {
    const timedByRowNumber = [...rows]
      .filter(r => r.timeMinutes != null)
      .sort((a, b) => a.rowNumber - b.rowNumber);
    const exportRowDates = timedByRowNumber
      .map(r => r.rowDate)
      .filter((d): d is string => !!d);
    const exportMinRowDate =
      exportRowDates.length > 0 ? exportRowDates.slice().sort()[0] : null;
    // First pass: rowDate (highest priority) or stored dayOffset (legacy)
    for (const r of timedByRowNumber) {
      if (r.rowDate && exportMinRowDate) {
        const anchor = ymdToPerthMs(exportMinRowDate);
        const rowDay = ymdToPerthMs(r.rowDate);
        exportDayOffsetMap.set(r.id, Math.round((rowDay - anchor) / 86400000));
      } else if (r.dayOffset && r.dayOffset !== 0) {
        exportDayOffsetMap.set(r.id, r.dayOffset);
      }
    }
    // Second pass: infer for rows with no explicit date/offset
    let day = 0;
    let prevEff = -1;
    for (const r of timedByRowNumber) {
      if (exportDayOffsetMap.has(r.id)) {
        prevEff = r.timeMinutes! + exportDayOffsetMap.get(r.id)! * 1440;
        day = exportDayOffsetMap.get(r.id)!;
        continue;
      }
      const mins = r.timeMinutes!;
      const eff = mins + day * 1440;
      if (prevEff >= 0 && eff < prevEff - 120) {
        day++;
      }
      exportDayOffsetMap.set(r.id, day);
      prevEff = mins + day * 1440;
    }
  }

  const dateDividerRow = (label: string) =>
    `<tr class="date-divider-row"><td colspan="3"><span class="date-divider-pill">${label}</span></td></tr>`;

  const tableRows = (() => {
    let prevDay = -1;
    const parts: string[] = [];
    for (const row of rows) {
      const day = exportDayOffsetMap.get(row.id) ?? 0;
      if (row.timeMinutes != null && day > prevDay && prevDay >= 0) {
        // Prefer an explicit rowDate from a row on that day
        const rowOnDay = rows.find(
          r => (exportDayOffsetMap.get(r.id) ?? 0) === day && r.rowDate
        );
        let divLabel: string;
        if (rowOnDay?.rowDate) {
          divLabel = formatPerthDateLabel(rowOnDay.rowDate);
        } else if (sheetDate) {
          divLabel = formatPerthDateLabel(addDaysToYmd(sheetDate, day));
        } else {
          const divDate = new Date(sheetCreatedAt);
          divDate.setDate(divDate.getDate() + day);
          divLabel = divDate
            .toLocaleDateString("en-AU", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: PERTH_TIME_ZONE,
            })
            .toUpperCase();
        }
        parts.push(dateDividerRow(divLabel));
      }
      if (row.timeMinutes != null) prevDay = day;
      const rowBg = row.isLocked ? lockedBg : "transparent";
      if (row.members.length === 0) {
        const obsHtml =
          stripImageryPhraseForExport(
            (row.observation ?? "").replace(/\n/g, "<br/>")
          ) +
          attachmentImagesHtml(row.attachments) +
          OBS_TRAILING_SPACE;
        parts.push(`<tr style="background:${rowBg}">
          <td style="padding:6px 6px 8px;${bb};${cb};font-variant-numeric:tabular-nums;font-size:12px;white-space:nowrap">${row.time ?? ""}</td>
          <td style="padding:6px 6px 8px;${bb};${cb};font-size:12px">${obsHtml}</td>
          <td style="padding:6px 6px 8px;${bb};font-size:11px"></td>
        </tr>${spacerRow}`);
        continue;
      }
      // Fully-certified row whose members are exactly the full daily roster —
      // collapse to a single "TEAM" pill instead of one row per CIN. The
      // individual CINs are still real data on the row underneath (Witness
      // List generation reads that, not this export), this is display only.
      if (
        row.isLocked &&
        isFullTeamMembers(
          row.members,
          cinRoster.map(c => c.cin)
        )
      ) {
        const obsHtml =
          stripImageryPhraseForExport(
            (row.observation ?? "").replace(/\n/g, "<br/>")
          ) +
          attachmentImagesHtml(row.attachments) +
          OBS_TRAILING_SPACE;
        parts.push(`<tr style="background:${rowBg}">
          <td style="padding:6px 6px 8px;${bb};${cb};font-variant-numeric:tabular-nums;font-size:12px;white-space:nowrap">${row.time ?? ""}</td>
          <td style="padding:6px 6px 8px;${bb};${cb};font-size:12px">${obsHtml}</td>
          <td style="padding:6px 6px 8px;${bb};font-size:11px"><span class="pill pill-certified">&#10003; TEAM</span></td>
        </tr>${spacerRow}`);
        continue;
      }
      // One <tr> per running-sheet row (not one per member) — every
      // member's CIN/Certified pill is stacked into a single flex-column
      // cell instead of one <tr> per member with rowspan on the shared
      // Time/Observation columns. That per-member-<tr> approach depended on
      // the browser's own row-height distribution whenever a photo made the
      // observation cell much taller than the member rows' natural height:
      // vertical-align:top alone wasn't enough to stop it — the pills still
      // ended up spread out down the photo's height instead of stacking
      // tightly like every other row. A single cell with a flex-column
      // stack packs them tightly regardless of how tall the row gets.
      const cinPillsHtml = row.members
        .map(m => {
          if (m.memberName === "__SPACE__") {
            // Invisible placeholder — keeps the roster's visual gap without
            // showing anything, same height as a real pill via the shared
            // .pill class.
            return `<span class="pill" style="visibility:hidden">&nbsp;</span>`;
          }
          const cert = row.certifications.find(
            c => c.memberId === m.id && c.isActive
          );
          const certifierCIN = cert
            ? "certifiedByCIN" in cert
              ? (cert as any).certifiedByCIN || cert.certifiedByName
              : cert.certifiedByName
            : null;
          return cert
            ? `<span class="pill pill-certified">&#10003; ${certifierCIN}</span>`
            : `<span class="pill pill-pending">${m.memberName}</span>`;
        })
        .join("");
      const obsHtml =
        stripImageryPhraseForExport(
          (row.observation ?? "").replace(/\n/g, "<br/>")
        ) +
        attachmentImagesHtml(row.attachments) +
        OBS_TRAILING_SPACE;
      parts.push(`<tr style="background:${rowBg}">
        <td style="padding:6px 6px 8px;${bb};${cb};font-variant-numeric:tabular-nums;font-size:12px;white-space:nowrap;vertical-align:top">${row.time ?? ""}</td>
        <td style="padding:6px 6px 8px;${bb};${cb};vertical-align:top;font-size:12px">${obsHtml}</td>
        <td style="padding:6px 6px 8px;${bb};font-size:11px;vertical-align:top"><div style="display:flex;flex-direction:column;align-items:flex-start;gap:3px">${cinPillsHtml}</div></td>
      </tr>${spacerRow}`);
    }
    return parts.join("");
  })();

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>${sheetTitle}</title>
  <style>
    /* Roboto is served by RunLog itself (lib/exportFonts.ts) — no request to Google. */
    ${robotoFontFaceCss()}
    @page{
      margin:20mm 15mm;
      @top-center{content:'PROTECTED';font-family:'Roboto',sans-serif;font-size:12px;font-weight:700;color:#dc2626;letter-spacing:0.08em}
      @bottom-center{content:"Page " counter(page) " of " counter(pages);font-family:'Roboto',sans-serif;font-size:11px;font-weight:700;color:#1e3a8a;letter-spacing:0.04em}
    }
    /* Force background colours to print — Chrome strips backgrounds by default */
    *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
    body{font-family:'Roboto',sans-serif;background:#fff;color:#000;margin:0;padding:0;font-size:11px}
    /* Cover-header banner — matches the Intelligence Profile / CTO Weekly
       Tasking export style: full-bleed dark-blue block, brand label, title,
       and meta info as rounded pills instead of a bordered label/value table.
       No border-radius, deliberately — sits flush above the log table so the
       two read as one continuous document block, and a single rectangle
       renders reliably across page breaks with no edge cases. */
    .cover-header{background:#1e3a8a;color:#fff;padding:18px 28px 14px;text-align:center}
    .brand-row{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:10px;opacity:0.9}
    .brand-dot{width:10px;height:10px;border-radius:50%;background:#93c5fd;flex:none}
    .brand-label{font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#93c5fd}
    .rs-title{font-size:22px;font-weight:800;letter-spacing:0.04em;line-height:1.2;text-transform:uppercase}
    /* Compact version (repeats at the top of every printed page): one-line banner */
    .cover-header.compact{padding:8px 28px;display:flex;justify-content:center;align-items:center;gap:14px}
    .cover-header.compact .brand-row{margin:0}
    .cover-header.compact .rs-title{font-size:13px;font-weight:800}
    /* Details — two equal columns of labelled cells, drawn like the log table below.
       On screen the block sits above the table, so it carries the table's blue side
       borders; inside the printed thead the table's own border already runs down both
       sides, so they are dropped there (no doubled line). */
    .details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));background:#f1f6ff;border:1.5px solid #1e3a8a;border-top:none;border-bottom:none}
    .dc{padding:7px 10px;border-right:1px solid #c7d5ee;border-bottom:1px solid #c7d5ee;min-width:0}
    .dc:nth-child(even){border-right:none}
    .dc-full{grid-column:1 / -1;border-right:none}
    .dl{font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;font-weight:600}
    .dv{font-size:12px;font-weight:700;color:#000;line-height:1.3;overflow-wrap:anywhere}
    .di{grid-column:1 / -1;padding:6px 10px;border-bottom:1px solid #c7d5ee;font-size:10.5px}
    .di b{color:#000;font-weight:700}
    .di .dl{margin-right:6px}
    /* The cell is the only (so "last") cell in its row, which would give it the
       no-wrap / 1% width rule meant for the certification column — undo that so the
       compact header wraps like the full one. */
    .log-table td.thead-meta-cell:last-child{white-space:normal;word-break:normal;width:auto;overflow:visible}
    .thead-meta-cell .details{border-left:none;border-right:none}
    .thead-meta-cell .cover-header.compact + .details .dc{padding:4px 10px}
    .thead-meta-cell .cover-header.compact + .details .dl{font-size:8px}
    .thead-meta-cell .cover-header.compact + .details .dv{font-size:10.5px}
    .thead-meta-cell .cover-header.compact + .details .di{padding:3px 10px;font-size:9.5px}
    .thead-meta-cell .cover-header.compact + .details .di .dl{font-size:8px}
    /* Log table — the outer border is a single declaration on the <table> element itself
       (border-collapse:collapse), not assembled from separate per-cell rules. That's what
       guarantees it always renders as one continuous, unbroken, uniform-width rectangle
       regardless of rowspan, spacer rows, or which row happens to be last. */
    table.log-table{width:100%;border:1.5px solid #1e3a8a;border-top:none;border-collapse:collapse;table-layout:auto}
    col.c-time{width:80px}
    col.c-obs{width:auto}
    col.c-cert{width:1%}
    .log-table th{background:#dbeafe;color:#1e3a8a;font-weight:700;padding:6px;text-align:left;
       border-bottom:2px solid #1e3a8a;border-right:1px solid #c7d5ee}
    .log-table th:last-child,.log-table td:last-child{border-right:none}
    .log-table td{vertical-align:top;word-break:break-word;overflow:hidden;color:#000;border-right:1px solid #e2e9f6;border-bottom:1px solid #eef2fb}
    .log-table td:last-child{white-space:nowrap;word-break:normal;width:1%}
    /* thead wrapper cell — no border/padding so the banner floats free of the log table's own border */
    .thead-meta-cell{padding:0 !important;border:none !important}
    /* Footer band — repeats at the bottom of every printed page (display:table-footer-group).
       Same dark blue as the top banner — a plain background fill, no border tricks, so it
       can't run into the per-cell border issues a bordered footer did. */
    tfoot{display:table-footer-group}
    .footer-band td{background:#1e3a8a;padding:8px 14px}
    .footer-grid{display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center}
    .footer-cin{font-size:10px;color:rgba(255,255,255,0.85);font-weight:700;letter-spacing:0.04em;text-transform:uppercase;text-align:right}
    .footer-protected{text-align:center;font-size:11px;font-weight:800;letter-spacing:0.14em;color:#f87171}
    /* Certification pills */
    .pill{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:9999px;font-size:10px;font-weight:700;white-space:nowrap}
    .pill-certified{background:#d1fae5;color:#059669;border:1px solid #6ee7b7}
    .pill-pending{background:#fee2e2;color:#dc2626;border:1px solid #fca5a5}
    /* Date divider — centered pill instead of a full-width bar */
    .date-divider-row td{background:#f1f6ff;text-align:center;padding:6px 0}
    .date-divider-pill{display:inline-block;padding:3px 14px;border-radius:9999px;background:#1e3a8a;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.06em}
    /* Screen: show first-page-header (with imagery); hide print-only blocks.
       No margin-bottom — sits flush against the log table's top edge so the
       banner and table read as one continuous bordered block. */
    .first-page-header{text-align:left}
    .print-only{display:none !important}
    @media print{
      /* Prevent observation rows from splitting across pages */
      .log-table tbody tr{page-break-inside:avoid;break-inside:avoid}
      /* thead repeats on every page */
      thead{display:table-header-group}
      /* Page 1 keeps the FULL header. The compact header in the thead also prints
         on page 1 (a thead repeats on every page, first included), so the full
         header is pulled down over it: --hc is the compact header's height,
         measured in the beforeprint script below, and the full header paints on
         top (opaque, higher z-index) so only the column headings show beneath it. */
      .first-page-header{position:relative;z-index:5;background:#fff;margin-bottom:calc(-1 * var(--hc, 0px))}
    }
  </style>
  <script>
    (function(){
      /*
       * PRINT STRATEGY (browser-compatible, no Prince XML):
       *
       * Screen view: the full header (.first-page-header); print-only blocks hidden.
       *
       * Print: a <thead> repeats on every page — page 1 included — so the compact
       * header lives in the thead and prints at the top of every page. Page 1 is
       * meant to show the FULL header instead, so .first-page-header stays visible
       * and is pulled down over the compact one (see the @media print rule): its
       * negative bottom margin is the compact header's height, measured here at the
       * printed content width (A4 less 15mm margins = 180mm) with the same fonts.
       * Result: page 1 = full header + column headings + rows; pages 2+ = compact
       * header + column headings + rows.
       */
      window.addEventListener('beforeprint', function(){
        var cell = document.querySelector('.thead-meta-cell');
        if (cell) {
          var probe = document.createElement('div');
          probe.className = 'thead-meta-cell';
          probe.style.cssText = 'position:absolute;left:-10000px;top:0;width:180mm;visibility:hidden';
          probe.innerHTML = cell.innerHTML;
          document.body.appendChild(probe);
          var hc = probe.getBoundingClientRect().height;
          document.body.removeChild(probe);
          // 1px short so a measuring rounding error can never leave a sliver showing
          document.documentElement.style.setProperty('--hc', Math.max(0, hc - 1) + 'px');
        }
        document.querySelectorAll('.print-only').forEach(function(el){
          el.style.removeProperty('display');
          el.style.setProperty('display', el.dataset.pd || 'block', 'important');
        });
      });
      window.addEventListener('afterprint', function(){
        document.documentElement.style.removeProperty('--hc');
        document.querySelectorAll('.print-only').forEach(function(el){
          el.style.setProperty('display', 'none', 'important');
        });
      });
    })();
  </script>
  </head><body>
  <!-- SCREEN VIEW: full banner with imagery — hidden during print -->
  <div class="first-page-header" id="first-page-header">
    ${coverHeaderHtml(false)}
  </div>
  <table class="log-table">
    <colgroup>
      <col class="c-time"/>
      <col class="c-obs"/>
      <col class="c-cert"/>
    </colgroup>
    <thead>
      <!-- Compact banner repeats on every page via thead display:table-header-group.
           Hidden on screen (first-page-header shows instead); shown during print by JS. -->
      <tr class="print-only" data-pd="table-row">
        <td colspan="3" class="thead-meta-cell">
          ${coverHeaderHtml(true)}
        </td>
      </tr>
      <tr>
        <th>Time</th>
        <th>Observation</th>
        <th>CIN Certified</th>
      </tr>
    </thead>
    <tfoot>
      <!-- Repeats at the bottom of every printed page. -->
      <tr class="footer-band"><td colspan="3">
        <div class="footer-grid">
          <span></span>
          <span class="footer-protected">Protected</span>
          <span class="footer-cin">${authorCin ? `Prepared by ${preparedByPill}` : ""}</span>
        </div>
      </td></tr>
    </tfoot>
    <tbody>${tableRows}</tbody>
  </table>
  ${buildExportPreviewCloseBar()}
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Pop-up blocked. Please allow pop-ups and try again.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Print only once Roboto has loaded, so the PDF never gets a fallback font.
  void whenFontsReady(win).then(() => {
    setTimeout(() => win.print(), 150);
  });
}
