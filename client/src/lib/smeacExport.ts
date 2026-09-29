// Shared SMEAC PDF export builder — used by both SmeacBriefingListPage.tsx
// (export from the list) and SmeacBriefingForm.tsx (export from the
// create/edit page itself). Pulled out of the list page so the ~200-line
// HTML template only needs to exist once; both callers fetch the briefing
// via trpc.smeacBriefing.getById (list page: utils.fetch, form: the
// existing useQuery data) and pass it through mapBriefingToExportData.
//
// Same "RunLog product" visual language as the Intelligence profile PDF
// exports and the Witness List PDF export (see TargetProfileContent.tsx's
// buildTargetProfileHtml / WitnessListPage.tsx's buildWitnessListPdfHtml) —
// dark-blue letterhead band, colored stat tiles, colored section-title bars,
// print/save-as-PDF via window.print() — rather than a Word doc download.
// Content/section order mirrors SmeacMapOverlay.tsx's read view exactly, so
// the export matches what officers see on screen.
import { format } from "date-fns";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import { formatIntelVehicle, formatIntelAddress } from "@/lib/addressFormat";

export interface SmeacTeamSlot {
  name: string;
  cin?: string | null;
  vehicle: string;
  foot: string;
  skill: string;
  kit: string;
  isTeamLeader: boolean;
}

export interface SmeacExportData {
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
  mapSnapshotUrl: string | null;
  acknowledgedCount: number;
  producedAt: number;
  certifierCin: string;
}

// Structural shape of a trpc.smeacBriefing.getById result — duck-typed
// rather than importing the router's inferred type, since both callers
// (utils.smeacBriefing.getById.fetch and the form's useQuery data) already
// resolve to that same shape.
export interface SmeacBriefingForExport {
  operationName: string;
  revision: number;
  status: "draft" | "posted";
  postedAt: number | null;
  postedByCIN: string | null;
  target: {
    name: string;
    hbf?: string | null;
    hb?: string | null;
    v1f?: string | null;
    v1?: string | null;
  } | null;
  voiOverride: string | null;
  hbOverride: string | null;
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
  mapSnapshotUrl?: string | null;
  acknowledgedCount: number;
}

export function mapBriefingToExportData(
  briefing: SmeacBriefingForExport,
  certifierCin: string
): SmeacExportData {
  const rawHome =
    briefing.hbOverride || briefing.target?.hbf || briefing.target?.hb;
  const rawVehicle =
    briefing.voiOverride || briefing.target?.v1f || briefing.target?.v1;
  return {
    operationName: briefing.operationName,
    revision: briefing.revision,
    status: briefing.status,
    postedAt: briefing.postedAt,
    postedByCIN: briefing.postedByCIN,
    targetName: briefing.target?.name ?? null,
    voi: rawVehicle ?? null,
    hb: rawHome ?? null,
    extraLocations: briefing.extraLocations,
    backgroundIntel: briefing.backgroundIntel,
    knownRisks: briefing.knownRisks,
    otherAgencies: briefing.otherAgencies,
    mission: briefing.mission,
    overallPlan: briefing.overallPlan,
    actionsOn: briefing.actionsOn,
    situationChange: briefing.situationChange,
    objectives: briefing.objectives,
    teamSlots: briefing.teamSlots,
    legalAuthArrest: briefing.legalAuthArrest,
    afpOrders: briefing.afpOrders,
    warrant: briefing.warrant,
    accoutrements: briefing.accoutrements,
    covertIdentifiers: briefing.covertIdentifiers,
    firstAidAllVehicles: briefing.firstAidAllVehicles,
    firstAidMemberName: briefing.firstAidMemberName,
    locationOfTeamLeader: briefing.locationOfTeamLeader,
    reportingProcedures: briefing.reportingProcedures,
    commsPrimary: briefing.commsPrimary,
    commsSecondary: briefing.commsSecondary,
    mapSnapshotUrl: briefing.mapSnapshotUrl ?? null,
    acknowledgedCount: briefing.acknowledgedCount,
    producedAt: Date.now(),
    certifierCin,
  };
}

export function buildSmeacPdfHtml(data: SmeacExportData) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const BLUE_DARK = "#1e3a8a";
  const BLUE_MID = "#93c5fd";
  const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT = "#1e293b";
  const GREY_BORDER = "#e2e8f0";

  const cinLabel = (cin: string) => `CIN${cin}`;
  const producedDateStr = format(new Date(data.producedAt), "d MMM yyyy");
  const generatedAt = new Date(data.producedAt).toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const chips = (items: string[]) =>
    items.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${items
          .map(
            a =>
              `<span style="padding:3px 10px;border-radius:9999px;font-size:10px;font-weight:600;border:1px solid ${GREY_BORDER};background:#f8fafc">${esc(a)}</span>`
          )
          .join("")}</div>`
      : "";

  const field = (label: string, value: string | null | undefined) =>
    value
      ? `<div style="margin-bottom:8px"><p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:3px">${esc(label)}</p><p style="font-size:11px;color:${GREY_TEXT}">${esc(value)}</p></div>`
      : "";

  // TARGET
  const targetChips: string[] = [];
  if (data.targetName)
    targetChips.push(
      `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:9999px;font-size:10px;font-weight:600;border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3">${esc(data.targetName)}</span>`
    );
  if (data.voi)
    targetChips.push(
      `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:9999px;font-size:10px;font-weight:600;border:1px solid #fde68a;background:#fffbeb;color:#92400e">${esc(formatIntelVehicle(data.voi))}</span>`
    );
  if (data.hb)
    targetChips.push(
      `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:9999px;font-size:10px;font-weight:600;border:1px solid #99f6e4;background:#f0fdfa;color:#115e59">${esc(formatIntelAddress(data.hb))}</span>`
    );
  for (const loc of data.extraLocations)
    targetChips.push(
      `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:9999px;font-size:10px;font-weight:600;border:1px solid #99f6e4;background:#f0fdfa;color:#115e59">${esc(formatIntelAddress(loc))}</span>`
    );
  const targetSection = targetChips.length
    ? `<div class="section"><div class="section-title">Target</div><div style="display:flex;flex-wrap:wrap;gap:6px">${targetChips.join("")}</div></div>`
    : "";

  // S — SITUATION
  const situationBody =
    field("Background / intelligence", data.backgroundIntel) +
    field("Known risks or threats", data.knownRisks) +
    (data.otherAgencies.length
      ? `<div><p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:5px">Other agencies / teams</p>${chips(data.otherAgencies)}</div>`
      : "");
  const situationSection = situationBody
    ? `<div class="section"><div class="section-title">S — Situation</div>${situationBody}</div>`
    : "";

  // M — MISSION
  const missionSection = data.mission
    ? `<div class="section"><div class="section-title">M — Mission</div><p style="font-size:11px;color:${GREY_TEXT}">${esc(data.mission)}</p></div>`
    : "";

  // E — EXECUTION
  const mapSnapshotHtml = data.mapSnapshotUrl
    ? `<div style="margin-bottom:8px;page-break-inside:avoid"><p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:5px">Map snapshot</p><img src="${esc(data.mapSnapshotUrl)}" style="display:block;max-width:100%;border-radius:6px;border:1px solid ${GREY_BORDER}" /></div>`
    : "";
  const objectivesHtml = data.objectives.length
    ? `<div style="margin-bottom:8px"><p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:5px">Objectives</p><ol style="margin:0;padding-left:16px;font-size:11px;color:${GREY_TEXT}">${data.objectives.map(o => `<li style="margin-bottom:3px">${esc(o)}</li>`).join("")}</ol></div>`
    : "";
  const teamSlotField = (label: string, value: string) =>
    value
      ? `<div><span style="color:#94a3b8">${esc(label)}:</span> ${esc(value)}</div>`
      : "";
  const teamSlotsHtml = data.teamSlots.length
    ? `<div><p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:5px">Surveillance team</p>${data.teamSlots
        .map(
          slot =>
            `<div style="border:1px solid ${GREY_BORDER};border-radius:6px;padding:8px 10px;margin-bottom:6px">
              <div style="font-size:11px;font-weight:700;color:${GREY_TEXT};margin-bottom:4px">${esc(slot.name)}${
                slot.isTeamLeader
                  ? ` <span style="font-size:8px;font-weight:700;letter-spacing:0.06em;color:#92400e;background:#fef3c7;padding:1px 5px;border-radius:4px;margin-left:4px">TL</span>`
                  : ""
              }</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;font-size:9px;color:#475569">${teamSlotField("Vehicle", slot.vehicle) + teamSlotField("Foot", slot.foot) + teamSlotField("Skill", slot.skill) + teamSlotField("Kit", slot.kit)}</div>
            </div>`
        )
        .join("")}</div>`
    : "";
  const executionBody =
    mapSnapshotHtml +
    field("Overall plan", data.overallPlan) +
    field("Actions on", data.actionsOn) +
    field("Situation change", data.situationChange) +
    objectivesHtml +
    teamSlotsHtml;
  const executionSection = executionBody
    ? `<div class="section"><div class="section-title">E — Execution</div>${executionBody}</div>`
    : "";

  // A — ADMINISTRATION & LOGISTICS
  const adminGrid =
    data.legalAuthArrest || data.afpOrders || data.warrant
      ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-bottom:8px">${field("Legal auth — arrest", data.legalAuthArrest) + field("AFP Orders", data.afpOrders) + field("Warrant", data.warrant)}</div>`
      : "";
  const adminBody =
    adminGrid +
    (data.accoutrements.length
      ? `<div style="margin-bottom:8px"><p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:5px">Accoutrements</p>${chips(data.accoutrements)}</div>`
      : "") +
    (data.covertIdentifiers.length
      ? `<div style="margin-bottom:8px"><p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:5px">Covert police identifier</p>${chips(data.covertIdentifiers)}</div>`
      : "") +
    `<p style="font-size:11px;color:${GREY_TEXT}">${data.firstAidAllVehicles ? "First aid kit confirmed in all vehicles" : `First aid held by ${esc(data.firstAidMemberName || "—")}`}</p>`;
  const adminSection = `<div class="section"><div class="section-title">A — Administration &amp; Logistics</div>${adminBody}</div>`;

  // C — COMMAND & SIGNAL
  const teamLeader = data.teamSlots.find(s => s.isTeamLeader);
  const commandBody =
    (teamLeader ? field("Team leader", teamLeader.name) : "") +
    field("Location of team leader", data.locationOfTeamLeader) +
    field("Reporting procedures", data.reportingProcedures) +
    (data.commsPrimary || data.commsSecondary
      ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px">${field("Comms Primary", data.commsPrimary) + field("Comms Secondary", data.commsSecondary)}</div>`
      : "");
  const commandSection =
    teamLeader ||
    data.locationOfTeamLeader ||
    data.reportingProcedures ||
    data.commsPrimary ||
    data.commsSecondary
      ? `<div class="section"><div class="section-title">C — Command &amp; Signal</div>${commandBody}</div>`
      : "";

  const statusLabel = data.status === "posted" ? "Posted" : "Draft";
  const postedLine = data.postedAt
    ? `Posted by ${esc(cinLabel(data.postedByCIN ?? "—"))} · ${esc(format(new Date(data.postedAt), "d MMM yyyy, h:mm a"))}`
    : "Not yet posted";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>RunLog Surveillance SMEAC — Operation ${esc(data.operationName)}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:28px 32px 22px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.brand-row { display:flex; align-items:center; gap:10px; margin-bottom:14px; opacity:0.85; }
.brand-dot { width:10px; height:10px; border-radius:50%; background:${BLUE_MID}; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID}; }
.entity-type-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); border-radius:9999px; padding:4px 14px; font-size:10px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:10px; }
.entity-name { font-size:22px; font-weight:700; letter-spacing:-0.01em; line-height:1.2; }
.entity-sub { font-size:12px; opacity:0.75; margin-top:4px; }
.gen-time { font-size:9px; opacity:0.6; margin-top:12px; }
.stats-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; padding:16px 32px; background:${BLUE_LIGHT} !important; border-bottom:2px solid ${BLUE_MID}; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.stat-box { text-align:center; }
.stat-num { font-size:20px; font-weight:700; color:${BLUE_DARK} !important; }
.stat-label { font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; }
.content { padding:20px 32px; }
.section { margin-bottom:20px; }
.section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin-bottom:10px; -webkit-print-color-adjust:exact; print-color-adjust:exact; page-break-after:avoid; break-after:avoid; }
.footer { margin-top:32px; padding-top:12px; border-top:1px solid ${GREY_BORDER}; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .stats-row { background:${BLUE_LIGHT} !important; } .section-title { background:${BLUE_LIGHT} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-row"><div class="brand-dot"></div><span class="brand-label">RunLog Surveillance SMEAC</span></div>
  <div class="entity-type-badge">&#128737; Surveillance SMEAC</div>
  <div class="entity-name">Operation ${esc(data.operationName)}</div>
  <div class="entity-sub">Rev ${data.revision} — ${esc(statusLabel)} — ${esc(postedLine)}</div>
  <div class="gen-time">Generated: ${generatedAt}</div>
</div>
<div class="stats-row">
  <div class="stat-box"><div class="stat-num">${esc(statusLabel)}</div><div class="stat-label">Status</div></div>
  <div class="stat-box"><div class="stat-num">${data.revision}</div><div class="stat-label">Revision</div></div>
  <div class="stat-box"><div class="stat-num">${data.teamSlots.length}</div><div class="stat-label">Team Members</div></div>
  <div class="stat-box"><div class="stat-num">${data.acknowledgedCount}</div><div class="stat-label">Acknowledged</div></div>
</div>
<div class="content">
  ${targetSection}
  ${situationSection}
  ${missionSection}
  ${executionSection}
  ${adminSection}
  ${commandSection}
  <div class="footer">
    <span>RunLog — Surveillance SMEAC — Produced by ${esc(cinLabel(data.certifierCin))} ${esc(producedDateStr)}</span>
    <span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span>
  </div>
</div>
${buildExportPreviewCloseBar()}
</body></html>`;
}

// Opens the print-preview window and kicks off window.print() — returns
// false (rather than throwing) if the popup was blocked, so callers can
// show their own toast.
export function openSmeacPdfExport(html: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 600);
  return true;
}
