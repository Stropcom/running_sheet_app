// Shared print-document shell for the Intelligence Package export.
//
// Every existing export (Supervisor Summary, Deployment Rollup, Ego Network,
// Operation/Target Profile, Heat Map) builds its own full HTML document with
// its own near-identical copy of this stylesheet. A package stitches several
// of those together into one document, so the shell and CSS live here once
// and each section contributes only its body HTML.

import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";

export const PKG_BLUE_DARK = "#1e3a8a";
export const PKG_BLUE_MID = "#93c5fd";
export const PKG_BLUE_LIGHT = "#dbeafe";
export const PKG_GREY_TEXT = "#1e293b";
export const PKG_GREY_BORDER = "#e2e8f0";

export function escHtml(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** One row of the cover page's Package Summary panel. */
export interface PackageSummaryRow {
  label: string;
  value: string;
}

/** One titled block in the package. */
export interface PackageSection {
  /** Shown in the section header bar and the contents list. */
  title: string;
  /** Section body HTML — already escaped by whoever built it. */
  html: string;
  /** Start this section on a fresh page (default true — sections are big). */
  pageBreak?: boolean;
}

const PACKAGE_CSS = `
* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
/* Paper size is declared rather than left to the print dialog's default —
   a package is a legal record and its pagination shouldn't depend on
   whichever paper the printing machine happens to default to. */
@page{ size:A4 portrait; margin:16mm 12mm; @top-center{content:'PROTECTED';font-family:'Roboto',sans-serif;font-size:12px;font-weight:700;color:#dc2626;letter-spacing:0.08em} @bottom-center{content:"Page " counter(page) " of " counter(pages);font-family:'Roboto',sans-serif;font-size:11px;font-weight:700;color:${PKG_BLUE_DARK};letter-spacing:0.04em} }
body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${PKG_GREY_TEXT}; background:#fff; }

/* ── Cover ── */
.cover-header { background:${PKG_BLUE_DARK} !important; color:#fff !important; padding:30px 32px 26px; text-align:center; }
.brand-row { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:14px; opacity:0.85; }
.brand-dot { width:10px; height:10px; border-radius:50%; background:${PKG_BLUE_MID}; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${PKG_BLUE_MID}; }
.main-title { font-size:27px; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; line-height:1.2; }
.op-date-line { font-size:16px; font-weight:600; margin-top:8px; }
.sheet-name { font-size:11px; opacity:0.7; margin-top:6px; }

/* ── Cover body: summary panel + contents ── */
.cover-body { padding:20px 32px 0; }
.contents-list { list-style:none; counter-reset:sec; }
.contents-list li { counter-increment:sec; font-size:11px; padding:5px 6px; border-bottom:1px solid ${PKG_GREY_BORDER}; }
.contents-list li:last-child { border-bottom:none; }
.contents-list li:nth-child(odd) { background:#f8fafc; }
.contents-list li::before { content:counter(sec) ". "; font-weight:700; color:${PKG_BLUE_DARK}; }
.cover-foot { margin-top:14px; padding-top:10px; border-top:1px solid ${PKG_GREY_BORDER}; font-size:9.5px; color:#94a3b8; display:flex; flex-wrap:wrap; justify-content:space-between; gap:4px 12px; }

/* ── Section framing ── */
.pkg-section { padding:0 32px 18px; }
/* break-after:avoid keeps this heading from ever being stranded alone at
   the top of a page while its content gets pushed to the next one — see
   the matching fix on .sub-head below for why that happens. */
.pkg-section-head { background:${PKG_BLUE_DARK} !important; color:#fff !important; padding:9px 16px; margin:0 -32px 16px; font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; break-after:avoid; page-break-after:avoid; }
.page-break { page-break-before:always; break-before:page; }

/* ── Shared building blocks used by section bodies ── */
.section { margin-bottom:14px; border:1px solid ${PKG_GREY_BORDER}; border-radius:8px; overflow:hidden; break-inside:avoid; page-break-inside:avoid; }
.section-title { font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${PKG_BLUE_DARK} !important; padding:7px 14px; background:${PKG_BLUE_LIGHT} !important; border-bottom:1px solid ${PKG_GREY_BORDER}; }
.section-body { padding:12px 14px; }
.detail-grid { display:grid; grid-template-columns:130px 1fr; gap:0; font-size:10.5px; }
.detail-grid > div { padding:4px 6px; }
.detail-grid > div:nth-child(4n+1), .detail-grid > div:nth-child(4n+2) { background:#f8fafc; }
.detail-label { color:#64748b; font-weight:600; }
.detail-value { color:${PKG_GREY_TEXT}; }
.chip-list { display:flex; flex-wrap:wrap; gap:6px; }
.chip { background:${PKG_BLUE_LIGHT} !important; color:${PKG_BLUE_DARK} !important; border:1px solid ${PKG_BLUE_MID}; border-radius:6px; padding:4px 10px; font-size:10px; font-weight:600; }
.chip-detail { font-weight:400; color:#475569; }
.numbered-list { list-style:none; counter-reset:item; }
.numbered-list li { counter-increment:item; display:flex; align-items:flex-start; gap:8px; margin-bottom:7px; font-size:10.5px; }
.numbered-list li:last-child { margin-bottom:0; }
.numbered-list li::before { content:counter(item); flex-shrink:0; width:16px; height:16px; border-radius:50%; background:${PKG_BLUE_LIGHT} !important; color:${PKG_BLUE_DARK} !important; font-size:9px; font-weight:700; display:flex; align-items:center; justify-content:center; margin-top:1px; }
.muted-note { font-size:10px; color:#94a3b8; font-style:italic; }
.data-table { width:100%; border-collapse:collapse; border:1.5px solid ${PKG_BLUE_DARK}; }
.data-table th { background:${PKG_BLUE_LIGHT} !important; color:${PKG_BLUE_DARK} !important; font-weight:700; font-size:9.5px; text-transform:uppercase; letter-spacing:0.04em; text-align:left; padding:6px 8px; border-bottom:2px solid ${PKG_BLUE_DARK}; border-right:1px solid #c7d5ee; }
.data-table th:last-child, .data-table td:last-child { border-right:none; }
.data-table td { vertical-align:top; font-size:10.5px; padding:6px 8px; border-bottom:1px solid ${PKG_GREY_BORDER}; border-right:1px solid ${PKG_GREY_BORDER}; }
.data-table tbody tr:last-child td { border-bottom:none; }

/* ── Deployment Rollup blocks (buildRollupSheetBlocksHtml) ── */
.sheet-block { border-top:4px solid ${PKG_BLUE_MID}; margin-bottom:8px; }
.sheet-block:first-child { border-top:none; }
.sheet-header { padding:14px 0 8px; }
.sheet-header-main { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.sheet-date { font-size:15px; font-weight:700; color:${PKG_GREY_TEXT}; }
.sheet-chip { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; padding:3px 8px; border-radius:5px; background:${PKG_BLUE_LIGHT} !important; color:${PKG_BLUE_DARK} !important; border:1px solid ${PKG_BLUE_MID}; }
.sheet-time { font-size:11px; color:#64748b; }
.sheet-target { font-size:11px; font-weight:700; color:${PKG_GREY_TEXT}; margin-top:4px; }
.status-pill { display:inline-flex; align-items:center; padding:3px 10px; border-radius:9999px; font-size:9px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; margin-left:auto; }
.status-complete { background:#dcfce7 !important; color:#15803d !important; border:1px solid #86efac; }
.status-open { background:#fef3c7 !important; color:#92400e !important; border:1px solid #fcd34d; }
/* Rollup blocks wrap their sections in .content; inside a package section
   that padding is already supplied by .pkg-section. */
.pkg-section .content { padding:0 0 18px; }
.summary-table { width:100%; border-collapse:collapse; border:1.5px solid ${PKG_BLUE_DARK}; }
.summary-table th { background:${PKG_BLUE_LIGHT} !important; color:${PKG_BLUE_DARK} !important; font-weight:700; font-size:9.5px; text-transform:uppercase; letter-spacing:0.04em; text-align:left; padding:6px 8px; border-bottom:2px solid ${PKG_BLUE_DARK}; border-right:1px solid #c7d5ee; }
.summary-table th:last-child, .summary-table td:last-child { border-right:none; }
.summary-table td { vertical-align:top; font-size:10.5px; padding:6px 8px; border-bottom:1px solid ${PKG_GREY_BORDER}; border-right:1px solid ${PKG_GREY_BORDER}; }
.summary-table tbody tr:last-child td { border-bottom:none; }

/* ── Diagram captions / legend ── */
.stats-line { text-align:center; font-size:10px; color:#64748b; padding:6px 0 2px; }
.legend { display:flex; flex-wrap:wrap; gap:14px; justify-content:center; padding:8px 0 2px; border-top:1px solid ${PKG_GREY_BORDER}; }
.legend-item { display:inline-flex; align-items:center; gap:6px; font-size:10px; color:#475569; }
.legend-dot { width:9px; height:9px; border-radius:50%; display:inline-block; }

/* ── Sub-heading used between repeated blocks (e.g. one per target) ── */
/* break-after:avoid — same reasoning as .pkg-section-head above: without
   it, a sub-block tall enough not to fit in whatever space is left on the
   current page gets pushed whole to the next one, leaving this heading
   behind on its own (the reported bug — "the heading for the section, then
   the report starts on the next page"). This keeps the heading glued to
   whatever comes right after it instead. */
.sub-head { font-size:13px; font-weight:700; color:${PKG_GREY_TEXT}; margin:0 0 10px; padding-bottom:6px; border-bottom:2px solid ${PKG_BLUE_MID}; break-after:avoid; page-break-after:avoid; }
/* Deliberately no break-inside:avoid-page on the block itself (unlike the
   heading above) — a target's Pattern of Life grids or a long Ego Network
   entity table can easily run taller than a single page now that both are
   uncapped, and forcing the whole block to stay in one piece just pushes
   it wholesale onto the next page: the exact bug this replaced. Trailing
   tables are left free to flow across the page break like any other table
   in these exports; only the heading (via break-after:avoid) and the
   diagram figure (via .sub-block-figure below) are kept from being split
   away from what immediately follows them. */
.sub-block { margin-bottom:22px; }
/* Each target's block within a repeated section (Ego Network, Pattern of
   Life) starts on its own page rather than flowing straight into the next
   target's — but not the first one, which already starts on a fresh page
   because the section itself does. */
.sub-block + .sub-block { page-break-before:always; break-before:page; }
/* Wraps the sub-heading + diagram together (Ego Network only) so a
   diagram — which can't split gracefully the way a table can — is never
   separated from its own heading. */
.sub-block-figure { break-inside:avoid-page; page-break-inside:avoid; }
/* A package carries one diagram per target, so cap each one — left to scale
   with the page width a single wide graph would run over a whole page. */
.sub-block svg { max-height:520px; }

/* Nothing trails the last section — no closing footer band, no trailing
   note. Every page already carries the PROTECTED marking and "Page n of m"
   from the @page margin boxes above, so a document-level footer would be
   duplicate marking whose only other effect is to spill onto a page of its
   own when the last section happens to end near a page boundary. */
.pkg-section:last-of-type { padding-bottom:0; }
.pkg-section:last-of-type .sub-block:last-child,
.pkg-section:last-of-type .section:last-child { margin-bottom:0; }

@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header, .pkg-section-head { background:${PKG_BLUE_DARK} !important; } .section-title, .chip, .numbered-list li::before, .data-table th { background:${PKG_BLUE_LIGHT} !important; } }
`;

export function buildPackageDocument(params: {
  /** Browser tab / document title. */
  docTitle: string;
  /** Big cover heading, e.g. "Intelligence Package". */
  coverTitle: string;
  /** Operation or target name. */
  coverSubject: string;
  /** Scope line under the subject. */
  coverMeta: string;
  /** At-a-glance figures for the cover page's Package Summary panel. */
  summaryRows?: PackageSummaryRow[];
  /** Officer building the package, e.g. "J Smith (CIN 1234)". */
  preparedBy?: string | null;
  sections: PackageSection[];
}): string {
  const {
    docTitle,
    coverTitle,
    coverSubject,
    coverMeta,
    summaryRows = [],
    preparedBy,
    sections,
  } = params;
  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  // The cover used to be the banner plus a bare contents list, which left
  // most of page one empty. It now carries the figures a reader would
  // otherwise have to total up by hand from the sections themselves.
  const summaryPanel = summaryRows.length
    ? `<div class="section">
    <div class="section-title">Package Summary</div>
    <div class="section-body"><div class="detail-grid">${summaryRows
      .map(
        r =>
          `<div class="detail-label">${escHtml(r.label)}</div><div class="detail-value">${escHtml(r.value)}</div>`
      )
      .join("")}</div></div>
  </div>`
    : "";

  const contents = sections.length
    ? `<div class="section">
    <div class="section-title">Contents</div>
    <div class="section-body"><ol class="contents-list">${sections.map(s => `<li>${escHtml(s.title)}</li>`).join("")}</ol></div>
  </div>`
    : "";

  const body = sections
    .map(
      s =>
        `<div class="pkg-section${s.pageBreak === false ? "" : " page-break"}">
      <div class="pkg-section-head">${escHtml(s.title)}</div>
      ${s.html}
    </div>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escHtml(docTitle)}</title>
<style>${PACKAGE_CSS}</style></head><body>
<div class="cover-header">
  <div class="brand-row"><div class="brand-dot"></div><span class="brand-label">RunLog</span></div>
  <div class="main-title">${escHtml(coverTitle)}</div>
  <div class="op-date-line">${escHtml(coverSubject)}</div>
  <div class="sheet-name">${escHtml(coverMeta)}</div>
</div>
<div class="cover-body">
  ${summaryPanel}
  ${contents}
  <div class="cover-foot"><span>${preparedBy ? `Prepared by: ${escHtml(preparedBy)}` : ""}</span><span>Generated: ${generatedAt}</span></div>
</div>
${body}
${buildExportPreviewCloseBar()}
</body></html>`;
}

/**
 * Opens a print preview window. Returns false when the pop-up was blocked so
 * the caller can surface that to the officer rather than silently doing
 * nothing.
 */
export function openPrintPreview(html: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
  return true;
}
