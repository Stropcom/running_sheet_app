/** Printed on every exported Supervisor Summary (and the roll-up export): a
 * summary is a working digest, not the certified record. */
export const SUMMARY_DISCLAIMER =
  "This summary document is not a certified running sheet. All information should be checked and verified against the certified corresponding running sheet.";

/** CSS for the disclaimer notice and the repeating footer line. */
export const SUMMARY_DISCLAIMER_CSS = `
.disclaimer { margin:14px 32px 0; padding:9px 14px; border:1.5px solid #b45309; border-radius:6px; background:#fff7e6 !important; color:#7c2d12; font-size:10.5px; font-weight:700; line-height:1.45; text-align:center; break-inside:avoid; }
.disclaimer-foot { padding:4px 32px 5px; font-size:8px; font-weight:600; color:#7c2d12; text-align:center; line-height:1.35; border-top:1px solid #e2e8f0; background:#fff; }
@media print { .disclaimer { background:#fff7e6 !important; } }
`;

/** Printed on every exported intelligence report (profiles, Ego Network, Heat
 * Map, Places, Day Route, Pattern of Life, Weekly Surveillance Report and the
 * Intelligence Package): not an evidentiary document. */
export const INTEL_REPORT_DISCLAIMER =
  "This document is not a certified evidentiary document. All information should be checked and verified against the certified evidentiary running sheets.";

/** A self-contained boxed notice (inline styles, so it works in any export's
 * own stylesheet). `class="disclaimer"` is for tests. */
export function disclaimerBoxHtml(
  text: string,
  margin = "14px 32px 0"
): string {
  const safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div class="disclaimer" style="margin:${margin};padding:9px 14px;border:1.5px solid #b45309;border-radius:6px;background:#fff7e6;color:#7c2d12;font-size:10.5px;font-weight:700;line-height:1.45;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-inside:avoid;">${safe}</div>`;
}
