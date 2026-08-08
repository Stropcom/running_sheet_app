// Deployment Rollup body rendering, shared by the standalone Rollup export
// on the Operation page and the Intelligence Package.
//
// One block per running sheet — the same set of sections the Supervisor
// Summary export uses (Deployment / Vehicle / Investigator / Special
// Projects / Objectives / Critical Decisions / Summary / Issues). Only the
// body is built here; each document supplies its own cover and shell.

export type RollupExportRow = {
  sheetId: number;
  sheetDate: string | null;
  createdAt: Date | string;
  targetName: string | null;
  teamLabel: string | null;
  teamCins: string | null;
  startTime: string | null;
  finishTime: string | null;
  location: string | null;
  ioSupport: string | null;
  intelSupport: string | null;
  ioContactTiming: string | null;
  ioContactMethod: string | null;
  objectives: string | null;
  specialProjects: string | null;
  criticalDecisions: string | null;
  issues: string | null;
  completedAt: number | null;
  entries: {
    id: number;
    time: string | null;
    location: string | null;
    text: string;
  }[];
  vehicles: { key: string; label: string }[];
};

export function parseRollupJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * sheetDate (when present) is a plain "yyyy-MM-dd" string with no time
 * component — reformatted with a string split rather than round-tripping
 * through `new Date()`, which parses a bare date as UTC midnight and could
 * shift the displayed day depending on the browser's local timezone offset.
 */
export function formatRollupDate(
  sheetDate: string | null,
  createdAt: Date | string
): string {
  const ymd =
    sheetDate ?? new Date(createdAt).toISOString().slice(0, 10);
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${d}-${m}-${y}` : ymd;
}

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Body HTML for a set of rollup rows. Uses the sheet-*, status-pill,
 * section-* and summary-table classes, which both host documents define.
 */
export function buildRollupSheetBlocksHtml(rows: RollupExportRow[]): string {
  const detailRow = (label: string, value: string | null) =>
    value && value.trim()
      ? `<div class="detail-label">${esc(label)}</div><div class="detail-value">${esc(value)}</div>`
      : "";

  const section = (title: string, bodyHtml: string) =>
    bodyHtml
      ? `<div class="section"><div class="section-title">${esc(title)}</div><div class="section-body">${bodyHtml}</div></div>`
      : "";

  return rows
    .map((r, i) => {
      const objectives = parseRollupJsonArray<string>(r.objectives).filter(o =>
        o.trim()
      );
      const specialProjects = parseRollupJsonArray<{
        key: string;
        detail: string;
      }>(r.specialProjects);
      const criticalDecisions = parseRollupJsonArray<string>(
        r.criticalDecisions
      ).filter(c => c.trim());
      const communicationParts = [r.ioContactTiming, r.ioContactMethod].filter(
        (p): p is string => !!p && !!p.trim()
      );
      const isComplete = !!r.completedAt;

      const vehiclesHtml = r.vehicles.length
        ? `<div class="chip-list">${r.vehicles.map(v => `<span class="chip">${esc(v.label)}</span>`).join("")}</div>`
        : `<p class="muted-note">No vehicles found in the Target Registry or running sheet text.</p>`;

      const specialProjectsHtml = specialProjects.length
        ? `<div class="chip-list">${specialProjects
            .map(
              p =>
                `<span class="chip"><strong>${esc(p.key)}</strong>${p.detail?.trim() ? `<span class="chip-detail"> — ${esc(p.detail)}</span>` : ""}</span>`
            )
            .join("")}</div>`
        : `<p class="muted-note">None recorded.</p>`;

      const objectivesHtml = objectives.length
        ? `<ol class="numbered-list">${objectives.map(o => `<li>${esc(o)}</li>`).join("")}</ol>`
        : `<p class="muted-note">None recorded.</p>`;

      const criticalDecisionsHtml = criticalDecisions.length
        ? `<ol class="numbered-list">${criticalDecisions.map(d => `<li>${esc(d)}</li>`).join("")}</ol>`
        : `<p class="muted-note">None recorded.</p>`;

      const summaryHtml = r.entries.length
        ? `<table class="summary-table">
            <thead><tr><th style="width:70px">Time</th><th style="width:28%">Address</th><th>Observation</th></tr></thead>
            <tbody>${r.entries
              .map(
                e =>
                  `<tr><td>${esc(e.time || "—")}</td><td>${esc(e.location || "")}</td><td>${esc(e.text)}</td></tr>`
              )
              .join("")}</tbody>
          </table>`
        : `<p class="muted-note">No running sheet rows yet.</p>`;

      return `<div class="sheet-block${i > 0 ? " page-break" : ""}">
        <div class="sheet-header">
          <div class="sheet-header-main">
            <span class="sheet-date">${esc(formatRollupDate(r.sheetDate, r.createdAt))}</span>
            ${r.teamLabel ? `<span class="sheet-chip">${esc(r.teamLabel)}</span>` : ""}
            ${r.startTime || r.finishTime ? `<span class="sheet-time">${esc(r.startTime ?? "?")}–${esc(r.finishTime ?? "?")}</span>` : ""}
            <span class="status-pill ${isComplete ? "status-complete" : "status-open"}">${isComplete ? "Complete" : "Open"}</span>
          </div>
          ${r.targetName ? `<div class="sheet-target">${esc(r.targetName)}</div>` : ""}
        </div>
        <div class="content">
          ${section(
            "Deployment",
            `<div class="detail-grid">
              ${detailRow("Team", r.teamLabel)}
              ${detailRow("Team Members CIN", r.teamCins)}
              ${detailRow("Start time", r.startTime)}
              ${detailRow("Finish time", r.finishTime)}
              ${detailRow("Target (TGT)", r.targetName)}
              ${detailRow("Location", r.location)}
            </div>`
          )}
          ${section("Vehicle", vehiclesHtml)}
          ${section(
            "Investigator",
            r.ioSupport?.trim() ||
              communicationParts.length ||
              r.intelSupport?.trim()
              ? `<div class="detail-grid">
                  ${detailRow("Investigator", r.ioSupport)}
                  ${communicationParts.length ? detailRow("Contacted", communicationParts.join(" — ")) : ""}
                  ${detailRow("Intel Support", r.intelSupport)}
                </div>`
              : `<p class="muted-note">None recorded.</p>`
          )}
          ${section("Special Projects", specialProjectsHtml)}
          ${section("Objectives", objectivesHtml)}
          ${section("Critical Decisions", criticalDecisionsHtml)}
          ${section("Summary", summaryHtml)}
          ${section("Issues", r.issues?.trim() ? `<p>${esc(r.issues)}</p>` : "")}
        </div>
      </div>`;
    })
    .join("");
}
