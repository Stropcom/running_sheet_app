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
@page{ margin:16mm 12mm; @top-center{content:'PROTECTED';font-family:'Roboto',sans-serif;font-size:12px;font-weight:700;color:#dc2626;letter-spacing:0.08em} @bottom-center{content:"Page " counter(page) " of " counter(pages);font-family:'Roboto',sans-serif;font-size:11px;font-weight:700;color:${PKG_BLUE_DARK};letter-spacing:0.04em} }
body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${PKG_GREY_TEXT}; background:#fff; }

/* ── Cover ── */
.cover-header { background:${PKG_BLUE_DARK} !important; color:#fff !important; padding:30px 32px 26px; text-align:center; }
.brand-row { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:14px; opacity:0.85; }
.brand-dot { width:10px; height:10px; border-radius:50%; background:${PKG_BLUE_MID}; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${PKG_BLUE_MID}; }
.main-title { font-size:27px; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; line-height:1.2; }
.op-date-line { font-size:16px; font-weight:600; margin-top:8px; }
.sheet-name { font-size:11px; opacity:0.7; margin-top:6px; }

/* ── Contents ── */
.contents { padding:20px 32px 4px; }
.contents-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${PKG_BLUE_DARK}; margin-bottom:8px; }
.contents-list { list-style:none; counter-reset:sec; border:1px solid ${PKG_GREY_BORDER}; border-radius:8px; overflow:hidden; }
.contents-list li { counter-increment:sec; font-size:11px; padding:7px 14px; border-bottom:1px solid ${PKG_GREY_BORDER}; }
.contents-list li:last-child { border-bottom:none; }
.contents-list li:nth-child(odd) { background:#f8fafc; }
.contents-list li::before { content:counter(sec) ". "; font-weight:700; color:${PKG_BLUE_DARK}; }

/* ── Section framing ── */
.pkg-section { padding:0 32px 18px; }
.pkg-section-head { background:${PKG_BLUE_DARK} !important; color:#fff !important; padding:9px 16px; margin:0 -32px 16px; font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; }
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

/* ── Sub-heading used between repeated blocks (e.g. one per target) ── */
.sub-head { font-size:13px; font-weight:700; color:${PKG_GREY_TEXT}; margin:0 0 10px; padding-bottom:6px; border-bottom:2px solid ${PKG_BLUE_MID}; }
.sub-block { margin-bottom:22px; break-inside:avoid-page; }

/* ── Footer ── */
.footer-note { margin:10px 32px 0; padding:12px 0 18px; border-top:1px solid ${PKG_GREY_BORDER}; font-size:9px; color:#94a3b8; }
.footer-band { background:${PKG_BLUE_DARK} !important; color:#fff !important; padding:8px 32px; display:grid; grid-template-columns:1fr 1fr 1fr; align-items:center; font-size:9px; font-weight:700; letter-spacing:0.04em; }
.footer-band span:first-child { text-align:left; }
.footer-band span:last-child { text-align:right; color:rgba(255,255,255,0.85); text-transform:uppercase; }
.footer-protected { text-align:center; font-weight:800; letter-spacing:0.14em; color:#f87171; text-transform:uppercase; }

@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header, .pkg-section-head, .footer-band { background:${PKG_BLUE_DARK} !important; } .section-title, .chip, .numbered-list li::before, .data-table th { background:${PKG_BLUE_LIGHT} !important; } }
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
  sections: PackageSection[];
}): string {
  const { docTitle, coverTitle, coverSubject, coverMeta, sections } = params;
  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const contents = sections.length
    ? `<div class="contents">
    <div class="contents-title">Contents</div>
    <ol class="contents-list">${sections.map(s => `<li>${escHtml(s.title)}</li>`).join("")}</ol>
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
${contents}
${body}
<div class="footer-note">Generated: ${generatedAt}</div>
<div class="footer-band"><span></span><span class="footer-protected">Protected</span><span>RunLog</span></div>
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
