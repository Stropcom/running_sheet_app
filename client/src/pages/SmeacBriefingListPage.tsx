import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  ShieldAlert,
  Check,
  Trash2,
  Pencil,
  FileDown,
} from "lucide-react";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import { formatIntelVehicle, formatIntelAddress } from "@/lib/addressFormat";

interface SmeacTeamSlot {
  name: string;
  cin?: string | null;
  vehicle: string;
  foot: string;
  skill: string;
  kit: string;
  isTeamLeader: boolean;
}

// ─── PDF export ─────────────────────────────────────────────────────────────
// Same "RunLog product" visual language as the Intelligence profile PDF
// exports and the Witness List PDF export (see TargetProfileContent.tsx's
// buildTargetProfileHtml / WitnessListPage.tsx's buildWitnessListPdfHtml) —
// dark-blue letterhead band, colored stat tiles, colored section-title bars,
// print/save-as-PDF via window.print() — rather than a Word doc download.
// Content/section order mirrors SmeacMapOverlay.tsx's read view exactly, so
// the export matches what officers see on screen.
interface SmeacExportData {
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
  acknowledgedCount: number;
  producedAt: number;
  certifierCin: string;
}

function buildSmeacPdfHtml(data: SmeacExportData) {
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
.section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin-bottom:10px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
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

export default function SmeacBriefingListPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: briefings, isLoading } = trpc.smeacBriefing.list.useQuery();
  const { data: operations } = trpc.operation.list.useQuery();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);

  const deleteMutation = trpc.smeacBriefing.delete.useMutation({
    onSuccess: () => {
      toast.success("Briefing deleted");
      utils.smeacBriefing.list.invalidate();
    },
    onError: e => toast.error(e.message ?? "Failed to delete"),
  });

  const handleExportPdf = async (id: number) => {
    setExportingId(id);
    try {
      const briefing = await utils.smeacBriefing.getById.fetch({ id });
      const rawHome =
        briefing.hbOverride || briefing.target?.hbf || briefing.target?.hb;
      const rawVehicle =
        briefing.voiOverride || briefing.target?.v1f || briefing.target?.v1;
      const html = buildSmeacPdfHtml({
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
        acknowledgedCount: briefing.acknowledgedCount,
        producedAt: Date.now(),
        certifierCin: user?.cin ?? "UNKNOWN",
      });
      const win = window.open("", "_blank");
      if (!win) {
        toast.error(
          "Couldn't open a new tab — check your browser's popup blocker."
        );
        return;
      }
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 600);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to export");
    } finally {
      setExportingId(null);
    }
  };

  const operationName = (operationId: number) =>
    (operations as any[] | undefined)?.find(o => o.id === operationId)?.name ??
    `Operation #${operationId}`;

  const confirmDeleteBriefing = briefings?.find(b => b.id === confirmDeleteId);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span>Administration</span>
              <span>/</span>
              <span className="text-foreground font-medium">
                SMEAC Briefings
              </span>
            </div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              SMEAC Briefings
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Exceptional-use urgent briefings — not a daily tool.
            </p>
          </div>
          {user?.role === "admin" && (
            <Button
              onClick={() => setLocation("/administration/smeac/new")}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Briefing
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !briefings || briefings.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No SMEAC briefings yet.
          </div>
        ) : (
          <div className="space-y-2">
            {briefings.map(b => (
              <div
                key={b.id}
                className="flex items-center gap-2 rounded-xl bg-card border border-border hover:bg-accent/50 transition-colors"
              >
                <button
                  onClick={() => setLocation(`/administration/smeac/${b.id}`)}
                  className="flex-1 min-w-0 text-left flex items-center gap-3 p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold truncate">
                        {operationName(b.operationId)}
                      </p>
                      <StatusBadge status={b.status} />
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        Rev {b.revision}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {b.situation || "No situation summary"}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {b.postedAt
                      ? format(new Date(b.postedAt), "d MMM, h:mm a")
                      : format(new Date(b.createdAt), "d MMM, h:mm a")}
                  </span>
                </button>
                <div className="flex items-center gap-0.5 shrink-0 mr-2">
                  <button
                    onClick={() => handleExportPdf(b.id)}
                    disabled={exportingId === b.id}
                    className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                    aria-label="Export briefing"
                    title="Export briefing"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                  </button>
                  {user?.role === "admin" && (
                    <>
                      <button
                        onClick={() =>
                          setLocation(`/administration/smeac/${b.id}/edit`)
                        }
                        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        aria-label="Edit briefing"
                        title="Edit briefing"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(b.id)}
                        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        aria-label="Delete briefing"
                        title="Delete briefing"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={open => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this briefing?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteBriefing?.status === "posted"
                ? "This briefing was posted and notified every user — deleting it only removes it from this list, it does not un-notify anyone. This cannot be undone."
                : "This draft will be permanently removed. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteId !== null) {
                  deleteMutation.mutate({ id: confirmDeleteId });
                }
                setConfirmDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "posted") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
        <Check className="h-2.5 w-2.5" />
        Posted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-muted text-muted-foreground">
      Draft
    </span>
  );
}
