// Part of the Intelligence page (client/src/pages/Intelligence.tsx): the printable profile page (only the profile dialog uses it).
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { formatIntelVehicle } from "@/lib/addressFormat";
import type { Entity } from "./types";
import { placeLabel, TYPE_LABELS, uniqueSheets } from "./helpers";

// ─── PDF Export ───────────────────────────────────────────────────────────────

function buildProfileHtml(entity: Entity, allEntities: Entity[]) {
  const mySheetIds = new Set(entity.occurrences.map(o => o.sheetId));

  const relatedVehicles = allEntities.filter(
    e =>
      e.type === "vehicle" && e.occurrences.some(o => mySheetIds.has(o.sheetId))
  );
  const relatedAddresses = allEntities.filter(
    e =>
      e.type === "address" && e.occurrences.some(o => mySheetIds.has(o.sheetId))
  );
  const relatedBusinesses = allEntities.filter(
    e =>
      e.type === "business" &&
      e.occurrences.some(o => mySheetIds.has(o.sheetId))
  );
  const relatedPersons = allEntities.filter(
    e =>
      e.type === "person" &&
      e.shortForm !== entity.shortForm &&
      e.occurrences.some(o => mySheetIds.has(o.sheetId))
  );

  const sheets = uniqueSheets(entity.occurrences);
  const firstSeen = entity.occurrences[0];
  const lastSeen = entity.occurrences[entity.occurrences.length - 1];
  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Blue palette for RunLog Intelligence Profile
  const BLUE = "#1d4ed8"; // primary blue
  const BLUE_DARK = "#1e3a8a"; // dark blue for header bg
  const BLUE_LIGHT = "#dbeafe"; // very light blue for section header bg
  const BLUE_MID = "#93c5fd"; // mid blue for accent borders
  const GREY_TEXT = "#1e293b"; // body text (darker for readability)
  const GREY_LIGHT = "#f8fafc"; // alternate row bg
  const GREY_BORDER = "#e2e8f0"; // subtle borders
  // Aliases so the rest of the template uses the same variable names
  const TEAL = BLUE;
  const TEAL_DARK = BLUE_DARK;
  const TEAL_LIGHT = BLUE_LIGHT;
  const TEAL_MID = BLUE_MID;

  const typeLabel = esc(TYPE_LABELS[entity.type]);
  // Strip leading 'a ' or 'A ' from vehicle descriptions
  const stripVehicleA = (s: string, type: string) =>
    type === "vehicle" ? s.replace(/^[aA]\s+/, "") : s;
  const entityName = esc(
    entity.type === "vehicle"
      ? formatIntelVehicle(
          entity.shortForm,
          entity.occurrences[0]?.fullDescription
        )
      : entity.type === "address" || entity.type === "business"
        ? placeLabel(entity.shortForm)
        : entity.shortForm
  );

  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>RunLog Intelligence Profile — ${entityName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
    font-size: 11px;
    line-height: 1.6;
    color: ${GREY_TEXT};
    background: #fff;
  }

  /* ── Cover header ── */
  .cover-header {
    background: ${TEAL_DARK};
    color: #fff;
    padding: 28px 32px 22px;
    position: relative;
    overflow: hidden;
  }
  .cover-header::after {
    content: '';
    position: absolute;
    right: -30px; top: -30px;
    width: 160px; height: 160px;
    border-radius: 50%;
    background: rgba(255,255,255,0.06);
  }
  .cover-header::before {
    content: '';
    position: absolute;
    right: 40px; bottom: -40px;
    width: 100px; height: 100px;
    border-radius: 50%;
    background: rgba(255,255,255,0.04);
  }
  .brand-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
    opacity: 0.85;
  }
  .brand-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    background: ${TEAL_MID};
  }
  .brand-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${TEAL_MID};
  }
  .brand-divider {
    flex: 1;
    height: 1px;
    background: rgba(255,255,255,0.15);
  }
  .brand-date {
    font-size: 9px;
    color: rgba(255,255,255,0.55);
    letter-spacing: 0.05em;
  }
  .entity-type-pill {
    display: inline-block;
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3);
    color: #fff;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 10px;
    border-radius: 20px;
    margin-bottom: 8px;
  }
  .entity-name {
    font-size: 22px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.01em;
    line-height: 1.2;
    margin-bottom: 4px;
    word-break: break-word;
  }
  .entity-sub {
    font-size: 10px;
    color: rgba(255,255,255,0.65);
  }

  /* ── Stats bar ── */
  .stats-bar {
    display: flex;
    background: #172554;
    color: #fff;
    border-bottom: 3px solid ${BLUE};
  }
  .stat-item {
    flex: 1;
    padding: 12px 20px;
    border-right: 1px solid rgba(255,255,255,0.12);
    text-align: left;
  }
  .stat-item:last-child { border-right: none; }
  .stat-value {
    font-size: 26px;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 4px;
    color: #ffffff;
    letter-spacing: -0.5px;
  }
  .stat-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: ${BLUE_MID};
  }

  /* ── Body ── */
  .body-content { padding: 24px 32px 32px; }

  /* ── Meta info grid ── */
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 20px;
    background: ${GREY_LIGHT};
    border: 1px solid ${GREY_BORDER};
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 22px;
  }
  .meta-item { display: flex; flex-direction: column; gap: 1px; }
  .meta-key {
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: ${TEAL_DARK};
  }
  .meta-val { font-size: 10.5px; color: ${GREY_TEXT}; font-weight: 500; }

  /* ── Section headings ── */
  .section-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 20px 0 10px;
  }
  .section-heading-bar {
    width: 4px;
    height: 16px;
    border-radius: 2px;
    background: ${TEAL};
    flex-shrink: 0;
  }
  .section-heading-text {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: ${TEAL_DARK};
  }
  .section-heading-count {
    font-size: 9px;
    background: ${TEAL_LIGHT};
    color: ${TEAL_DARK};
    border: 1px solid ${TEAL_MID};
    border-radius: 10px;
    padding: 1px 7px;
    font-weight: 600;
  }
  .section-rule {
    flex: 1;
    height: 1px;
    background: ${GREY_BORDER};
  }

  /* ── Running sheet entries ── */
  .sheet-block {
    border: 1px solid ${GREY_BORDER};
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  .sheet-header {
    background: ${TEAL_LIGHT};
    border-bottom: 1px solid ${TEAL_MID};
    padding: 8px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .sheet-title {
    font-size: 10.5px;
    font-weight: 700;
    color: ${TEAL_DARK};
  }
  .sheet-op {
    font-size: 9px;
    color: ${TEAL};
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .obs-row {
    padding: 6px 14px;
    font-size: 10px;
    border-bottom: 1px solid ${GREY_BORDER};
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .obs-row:last-child { border-bottom: none; }
  .obs-row:nth-child(even) { background: ${GREY_LIGHT}; }
  .obs-time {
    font-size: 9px;
    font-weight: 700;
    color: ${TEAL};
    white-space: nowrap;
    min-width: 36px;
    padding-top: 1px;
  }
  .obs-text { flex: 1; color: ${GREY_TEXT}; }

  /* ── Association chips ── */
  .assoc-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 4px;
  }
  .assoc-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid ${TEAL_MID};
    background: ${TEAL_LIGHT};
    color: ${TEAL_DARK};
    border-radius: 20px;
    padding: 3px 10px;
    font-size: 9.5px;
    font-weight: 600;
  }
  .chip-count {
    background: ${TEAL};
    color: #fff;
    border-radius: 10px;
    padding: 0 5px;
    font-size: 8.5px;
    font-weight: 700;
  }

  /* ── Footer ── */
  .doc-footer {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 2px solid ${TEAL_LIGHT};
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .footer-brand {
    font-size: 9px;
    font-weight: 700;
    color: ${TEAL};
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .footer-note {
    font-size: 8.5px;
    color: #9ca3af;
  }

  @page { margin: 0; size: A4; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<!-- Cover Header -->
<div class="cover-header">
  <div class="brand-row">
    <div class="brand-dot"></div>
    <span class="brand-label">RunLog Intelligence Profile</span>
    <div class="brand-divider"></div>
    <span class="brand-date">Generated: ${generatedAt}</span>
  </div>
  <div class="entity-type-pill">${typeLabel}</div>
  <div class="entity-name">${entityName}</div>
</div>

<!-- Stats Banner -->
<div class="stats-bar">
  <div class="stat-item">
    <div class="stat-value">${entity.occurrences.length}</div>
    <div class="stat-label">Observations</div>
  </div>
  <div class="stat-item">
    <div class="stat-value">${sheets.length}</div>
    <div class="stat-label">Running Sheets</div>
  </div>
  <div class="stat-item">
    <div class="stat-value">${relatedPersons.length + relatedVehicles.length + relatedAddresses.length + relatedBusinesses.length}</div>
    <div class="stat-label">Associations</div>
  </div>
  <div class="stat-item">
    <div class="stat-value">${Array.from(new Set(entity.occurrences.map(o => o.operationId))).length}</div>
    <div class="stat-label">Operations</div>
  </div>
</div>

<!-- Body -->
<div class="body-content">

<div class="meta-grid">
  <div class="meta-item"><span class="meta-key">Entity Type</span><span class="meta-val">${typeLabel}</span></div>
  <div class="meta-item"><span class="meta-key">Profile Generated</span><span class="meta-val">${generatedAt}</span></div>
</div>
`;

  // Operations section — list unique operations this entity appears in
  const uniqueOps = Array.from(
    entity.occurrences
      .reduce((map, o) => {
        if (!map.has(o.operationId)) map.set(o.operationId, o.operationName);
        return map;
      }, new Map<number, string>())
      .values()
  );
  html += `
<div class="section-heading">
  <div class="section-heading-bar"></div>
  <span class="section-heading-text">Operations</span>
  <span class="section-heading-count">${uniqueOps.length}</span>
  <div class="section-rule"></div>
</div>
<div class="assoc-list">
${uniqueOps.map(op => `<span class="assoc-chip">${esc(op)}</span>`).join("\n")}
</div>
`;

  // Running sheets section — show sheet titles only (no observation rows)
  html += `
<div class="section-heading">
  <div class="section-heading-bar"></div>
  <span class="section-heading-text">Running Sheets</span>
  <span class="section-heading-count">${sheets.length}</span>
  <div class="section-rule"></div>
</div>
<div class="assoc-list">
${sheets.map(sheet => `<span class="assoc-chip">${esc(sheet.sheetTitle)}</span>`).join("\n")}
</div>
`;

  if (relatedVehicles.length > 0) {
    html += `
<div class="section-heading">
  <div class="section-heading-bar"></div>
  <span class="section-heading-text">Associated Vehicles</span>
  <span class="section-heading-count">${relatedVehicles.length}</span>
  <div class="section-rule"></div>
</div>
<div class="assoc-list">`;
    for (const v of relatedVehicles) {
      html += `<span class="assoc-chip">${esc(formatIntelVehicle(v.shortForm))}<span class="chip-count">×${v.occurrences.length}</span></span>`;
    }
    html += `</div>`;
  }

  if (relatedAddresses.length > 0) {
    html += `
<div class="section-heading">
  <div class="section-heading-bar"></div>
  <span class="section-heading-text">Associated Addresses</span>
  <span class="section-heading-count">${relatedAddresses.length}</span>
  <div class="section-rule"></div>
</div>
<div class="assoc-list">`;
    for (const a of relatedAddresses) {
      html += `<span class="assoc-chip">${esc(placeLabel(a.shortForm))}<span class="chip-count">×${a.occurrences.length}</span></span>`;
    }
    html += `</div>`;
  }

  if (relatedPersons.length > 0) {
    html += `
<div class="section-heading">
  <div class="section-heading-bar"></div>
  <span class="section-heading-text">Associated Persons</span>
  <span class="section-heading-count">${relatedPersons.length}</span>
  <div class="section-rule"></div>
</div>
<div class="assoc-list">`;
    for (const p of relatedPersons) {
      html += `<span class="assoc-chip">${esc(p.shortForm)}<span class="chip-count">×${p.occurrences.length}</span></span>`;
    }
    html += `</div>`;
  }

  if (relatedBusinesses.length > 0) {
    html += `
<div class="section-heading">
  <div class="section-heading-bar"></div>
  <span class="section-heading-text">Associated Businesses</span>
  <span class="section-heading-count">${relatedBusinesses.length}</span>
  <div class="section-rule"></div>
</div>
<div class="assoc-list">`;
    for (const b of relatedBusinesses) {
      html += `<span class="assoc-chip">${esc(placeLabel(b.shortForm))}<span class="chip-count">×${b.occurrences.length}</span></span>`;
    }
    html += `</div>`;
  }

  html += `
<div class="doc-footer">
  <span class="footer-brand">RunLog · Intelligence Profile</span>
  <span class="footer-note">SENSITIVE — FOR AUTHORISED USE ONLY · ${generatedAt}</span>
</div>

</div><!-- /body-content -->
</body></html>`;
  return html;
}

export function printProfilePdf(entity: Entity, allEntities: Entity[]) {
  const html = buildProfileHtml(entity, allEntities);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.onload = () => {
      win.print();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
  }
}
