import {
  ProfileDropdownRow,
  IntelEntityDropdown,
} from "@/components/ProfileDropdown";
import { RegistryPersonRow } from "@/components/RegistryPersonRow";
import {
  RegisteredDetailPanels,
  targetDetailEntries,
} from "@/components/RegisteredDetailPanels";
import {
  formatBail,
  formatSpecialProjects,
  mdlLabel,
} from "@shared/targetStatus";
import {
  sharedLinkChipText,
  sharedLinkSentence,
  type CrossLinkVia,
} from "@/lib/crossLinkText";
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  FileDown,
  User,
  Users,
  FileText,
  ChevronRight,
  AlertTriangle,
  Folder,
  ExternalLink,
} from "lucide-react";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import {
  buildPhotoGridHtml,
  buildEntityListWithPhotosHtml,
  type RowAttachmentLike,
} from "@/lib/attachmentBanner";
import { buildProfileTargetBlockHtml } from "@/lib/profileSection";
import {
  IntelPhotoStrip,
  type IntelAssocEntity,
} from "@/components/IntelEntityChip";
import { IndicesBadge } from "@/components/IndicesBadge";
import {
  ImportedDocumentCard,
  isParsedDocumentImport,
  type DocumentImportRow,
} from "@/components/ImportedDocumentCard";
import { SectionHeading } from "@/components/ProfileSectionHeading";

// ─── Types (mirrors server IntelOperationProfile) ──────────────────────────
type ProfilePhoto = RowAttachmentLike & { id: number; url: string };
type IntelProfileEntity = IntelAssocEntity;
interface OperationTarget {
  targetId: number;
  name: string;
  tgt: string | null;
  hbf: string | null;
  v1f: string | null;
  v2f: string | null;
  extraVehicles: string | null;
  extraAddresses: string | null;
  dep: string | null;
  arr: string | null;
  linkedSheets: Array<{ id: number; title: string }>;
  mdlStatus: string | null;
  bailStatus: string | null;
  bailConditions: string | null;
  bailConditionsText: string | null;
  specialProjects: string | null;
  registryAssociates: Array<{
    id: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    hb: string | null;
    v1f: string | null;
    v1: string | null;
    extraAddresses?: string | null;
    isIndicesOnly: boolean;
    relationship?: string;
  }>;
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
  photos: ProfilePhoto[];
  isIndicesOnly: boolean;
}
interface IntelOperationProfile {
  operationId: number;
  operationName: string;
  promisNumber: string | null;
  imsNumber: string | null;
  investigationUnit: string | null;
  linkedSheets: Array<{
    id: number;
    title: string;
    targetId: number | null;
    targetName: string | null;
  }>;
  targets: OperationTarget[];
  crossOperationLinks: Array<{
    targetId: number;
    targetName: string;
    otherOperationId: number;
    otherOperationName: string;
    via: CrossLinkVia;
    sharedValue: string;
  }>;
}

// ─── PDF export ────────────────────────────────────────────────────────────
function buildOperationProfileHtml(profile: IntelOperationProfile) {
  const esc = (s: string | null | undefined) =>
    (s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const BLUE_DARK = "#1e3a8a";
  const BLUE_MID = "#93c5fd";
  const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT = "#1e293b";
  const GREY_BORDER = "#e2e8f0";
  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const totalAssoc = profile.targets.reduce(
    (s, t) =>
      s +
      t.assocPersons.length +
      t.assocVehicles.length +
      t.assocLocations.length,
    0
  );
  const targetsHtml = profile.targets
    .map(t => buildProfileTargetBlockHtml(t))
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RunLog — Operation Profile: ${esc(profile.operationName)}</title>
<style>* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; } body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:28px 32px 22px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID} !important; margin-bottom:14px; }
.entity-name { font-size:22px; font-weight:700; } .entity-sub-row { display:flex; flex-wrap:wrap; gap:12px; margin-top:4px; } .entity-sub { font-size:11px; opacity:0.7; } .gen-time { font-size:9px; opacity:0.6; margin-top:12px; }
.stats-row { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding:16px 32px; background:${BLUE_LIGHT} !important; border-bottom:2px solid ${BLUE_MID}; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.stat-box { text-align:center; } .stat-num { font-size:20px; font-weight:700; color:${BLUE_DARK} !important; } .stat-label { font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; }
.content { padding:20px 32px; } .section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin-bottom:12px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.footer { margin-top:32px; padding-top:12px; border-top:1px solid ${GREY_BORDER}; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .stats-row { background:${BLUE_LIGHT} !important; } .section-title { background:${BLUE_LIGHT} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-label">RunLog Intelligence Profile — Operation</div>
  <div class="entity-name">${esc(profile.operationName)}</div>
  ${
    profile.promisNumber || profile.imsNumber || profile.investigationUnit
      ? `<div class="entity-sub-row">
    ${profile.promisNumber ? `<span class="entity-sub">PROMIS: ${esc(profile.promisNumber)}</span>` : ""}
    ${profile.imsNumber ? `<span class="entity-sub">IMS: ${esc(profile.imsNumber)}</span>` : ""}
    ${profile.investigationUnit ? `<span class="entity-sub">Unit: ${esc(profile.investigationUnit)}</span>` : ""}
  </div>`
      : ""
  }
  <div class="gen-time">Generated: ${generatedAt}</div>
</div>
<div class="stats-row">
  <div class="stat-box"><div class="stat-num">${profile.targets.length}</div><div class="stat-label">Targets</div></div>
  <div class="stat-box"><div class="stat-num">${profile.linkedSheets.length}</div><div class="stat-label">Running Sheets</div></div>
  <div class="stat-box"><div class="stat-num">${totalAssoc}</div><div class="stat-label">Total Associations</div></div>
</div>
<div class="content">
  ${
    profile.crossOperationLinks.length
      ? `<div style="margin-bottom:16px"><div class="section-title">Cross-Operation Links</div>
    <p style="font-size:10px;font-weight:600;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:4px;padding:6px 8px;margin-bottom:8px">${profile.crossOperationLinks.length} target${profile.crossOperationLinks.length !== 1 ? "s" : ""} in this operation also reach into another operation — worth checking for a connection.</p>
    ${profile.crossOperationLinks.map(l => `<p style="font-size:10px;padding:3px 0;border-bottom:1px solid ${GREY_BORDER}"><strong>${esc(l.targetName)}</strong> ${esc(sharedLinkSentence(l.via, l.sharedValue))} — with a target on <strong>${esc(l.otherOperationName)}</strong></p>`).join("")}
  </div>`
      : ""
  }
  <div class="section-title">Target Intelligence Profiles</div>
  ${targetsHtml}
  <div class="footer"><span>RunLog — Operation Intelligence Profile</span><span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span></div>
</div>
${buildExportPreviewCloseBar()}
</body></html>`;
}

function useOperationProfile(operationId: number) {
  return trpc.intelligence.operationProfile.useQuery(
    { operationId },
    { enabled: operationId > 0 }
  );
}

// ─── Imported Documents ─────────────────────────────────────────────────────
// Every "Import from Document" upload recorded against this operation, across
// all its targets — shown exactly as parsed and confirmed by the officer, not
// re-derived from a target's live (possibly since-edited) fields. A target
// re-imported for this operation gets a new row each time it's saved, so
// grouping by target and numbering within that group doubles as version
// history — see targetDocumentImports in schema.ts.

function ImportedDocumentsSection({ operationId }: { operationId: number }) {
  const { data: imports } =
    trpc.target.registry.documentImportsForOperation.useQuery({
      operationId,
    });
  if (!imports || imports.length === 0) return null;

  const byTarget = new Map<number, DocumentImportRow[]>();
  for (const row of imports as DocumentImportRow[]) {
    const list = byTarget.get(row.targetId) ?? [];
    list.push(row);
    byTarget.set(row.targetId, list);
  }

  return (
    <div className="mb-4 flex flex-col gap-2">
      {/* Full-width heading bar; each document is its own full-width card. */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-300/70 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
            Imported Documents
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every target-profile document uploaded for this operation, verbatim
            as parsed.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-xs font-bold text-violet-700 dark:text-violet-300 tabular-nums">
          {imports.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {Array.from(byTarget.values()).flatMap(rows => {
          const totalParsed = rows.filter(isParsedDocumentImport).length;
          let parsedCount = 0;
          let lastParsedRow: DocumentImportRow | null = null;
          return rows.map(row => {
            const parsed = isParsedDocumentImport(row);
            if (parsed) parsedCount++;
            const card = (
              <ImportedDocumentCard
                key={row.id}
                row={row}
                version={parsed ? parsedCount : 0}
                isCurrent={parsed && parsedCount === totalParsed}
                previous={parsed ? lastParsedRow : null}
              />
            );
            if (parsed) lastParsedRow = row;
            return card;
          });
        })}
      </div>
    </div>
  );
}

/**
 * Self-contained operation profile document — fetches its own data by
 * operationId and renders identically wherever it's mounted (standalone
 * page or embedded pane view), mirroring TargetProfileContent.tsx.
 */
export function OperationProfileContent({
  operationId,
  embedded = false,
}: {
  operationId: number;
  /** Inside a drop-down on another profile: no banner, and an "Open full
   * profile" button at the end. */
  embedded?: boolean;
}) {
  const [, navigate] = useLocation();
  const { data: profile, isLoading, error } = useOperationProfile(operationId);
  const [expandedTargetId, setExpandedTargetId] = useState<number | null>(null);

  function exportPdf() {
    if (!profile) return;
    const html = buildOperationProfileHtml(profile as IntelOperationProfile);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  const typedProfile = profile as IntelOperationProfile | undefined;

  return (
    <div className={embedded ? "pt-1" : "px-6 lg:px-8 py-6"}>
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">Profile not found or could not be loaded.</p>
        </div>
      )}

      {typedProfile && (
        <>
          {/* Header */}
          {!embedded && (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm mb-5">
              <div className="bg-gradient-to-r from-blue-900 to-blue-800 px-6 py-5 text-white">
                <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap sm:gap-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/30 mb-3">
                      Operation
                    </span>
                    <h1 className="text-lg sm:text-2xl leading-snug font-bold tracking-tight break-words">
                      {typedProfile.operationName}
                    </h1>
                    <div className="flex flex-wrap gap-3 mt-2 text-sm opacity-75">
                      {typedProfile.promisNumber && (
                        <span>PROMIS: {typedProfile.promisNumber}</span>
                      )}
                      {typedProfile.imsNumber && (
                        <span>IMS: {typedProfile.imsNumber}</span>
                      )}
                      {typedProfile.investigationUnit && (
                        <span>Unit: {typedProfile.investigationUnit}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportPdf}
                    className="bg-white/10 border-white/30 text-white hover:bg-white/20 shrink-0"
                  >
                    <FileDown className="w-4 h-4 mr-1.5" /> Export PDF
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-y sm:divide-y-0 divide-border/60 bg-blue-50/50 dark:bg-blue-950/20">
                {[
                  { label: "Targets", value: typedProfile.targets.length },
                  {
                    label: "Running Sheets",
                    value: typedProfile.linkedSheets.length,
                  },
                  {
                    label: "Total Associations",
                    value: typedProfile.targets.reduce(
                      (s, t) =>
                        s +
                        t.assocPersons.length +
                        t.assocVehicles.length +
                        t.assocLocations.length,
                      0
                    ),
                  },
                ].map(stat => (
                  <div key={stat.label} className="px-4 py-3 text-center">
                    <p className="text-xl font-bold text-blue-900 dark:text-blue-300">
                      {stat.value}
                    </p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {typedProfile.crossOperationLinks.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm mb-4">
              <SectionHeading
                label="Cross-operation links"
                count={typedProfile.crossOperationLinks.length}
              />
              <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {typedProfile.crossOperationLinks.length} target
                  {typedProfile.crossOperationLinks.length !== 1 ? "s" : ""} in
                  this operation also reach into another operation — worth
                  checking for a cross-operation connection.
                </p>
              </div>
              <div className="space-y-1">
                {typedProfile.crossOperationLinks.map(l => (
                  <ProfileDropdownRow
                    key={`${l.targetId}-${l.otherOperationId}-${l.via}`}
                    kind="target"
                    refId={l.targetId}
                  >
                    <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="text-xs font-medium text-foreground flex-1 min-w-0 break-words">
                      {l.targetName}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 shrink-0">
                      <Folder className="w-3 h-3" />
                      {l.otherOperationName}
                      <span className="text-xs uppercase tracking-wide opacity-70">
                        {sharedLinkChipText(l.via, l.sharedValue)}
                      </span>
                    </span>
                  </ProfileDropdownRow>
                ))}
              </div>
            </div>
          )}

          <ImportedDocumentsSection operationId={operationId} />

          {/* Target profiles — a full-width heading bar, then each target as
              its own full-width card. */}
          {typedProfile.targets.length > 0 && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-blue-300/70 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 px-4 py-2.5">
              <p className="text-xs font-extrabold text-blue-800 dark:text-blue-300 uppercase tracking-wider">
                Targets
              </p>
              <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-xs font-bold text-blue-800 dark:text-blue-300 tabular-nums">
                {typedProfile.targets.length}
              </span>
            </div>
          )}
          <div className="space-y-2">
            {typedProfile.targets.map(target => {
              const isExpanded = expandedTargetId === target.targetId;
              const totalAssoc =
                target.assocPersons.length +
                target.assocVehicles.length +
                target.assocLocations.length;
              return (
                <div
                  key={target.targetId}
                  className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                >
                  <button
                    onClick={() =>
                      setExpandedTargetId(isExpanded ? null : target.targetId)
                    }
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/10 transition-colors"
                  >
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 shrink-0">
                      <User className="w-3.5 h-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {/* Phones: the whole name on its own line (wraps);
                            larger screens keep one truncating line. */}
                        <p className="text-sm font-semibold text-foreground sm:truncate">
                          {target.name}
                        </p>
                        {target.isIndicesOnly && (
                          <span className="hidden sm:contents">
                            <IndicesBadge />
                          </span>
                        )}
                      </div>
                      <p className="hidden sm:block text-xs text-muted-foreground">
                        {target.linkedSheets.length} sheet
                        {target.linkedSheets.length !== 1 ? "s" : ""} ·{" "}
                        {totalAssoc} association{totalAssoc !== 1 ? "s" : ""}
                      </p>
                      {/* Phone second line: Indices icon, then Full Profile. */}
                      <div className="sm:hidden flex items-center gap-2 mt-0.5">
                        {target.isIndicesOnly && <IndicesBadge />}
                        <span
                          role="link"
                          tabIndex={0}
                          onClick={e => {
                            e.stopPropagation();
                            navigate(`/intelligence/target/${target.targetId}`);
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              e.preventDefault();
                              navigate(
                                `/intelligence/target/${target.targetId}`
                              );
                            }
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 font-medium"
                        >
                          Full Profile
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        navigate(`/intelligence/target/${target.targetId}`);
                      }}
                      className="hidden sm:inline text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0 mr-2"
                    >
                      Full Profile
                    </button>
                    <ChevronRight
                      className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                      {target.photos.length > 0 && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-foreground/80 mb-2">
                            Photos ({target.photos.length})
                          </p>
                          <IntelPhotoStrip photos={target.photos} />
                          <Separator className="mt-3" />
                        </div>
                      )}
                      {(() => {
                        const entries = targetDetailEntries(target);
                        if (!entries.length) return null;
                        return (
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-foreground/80 mb-2">
                              Registered Details
                            </p>
                            <RegisteredDetailPanels entries={entries} />
                            <Separator className="mt-3" />
                          </div>
                        );
                      })()}
                      {/* Status — MDL, bail and special projects, as on the
                          target's own profile. */}
                      {(target.mdlStatus ||
                        target.bailStatus ||
                        formatSpecialProjects(target.specialProjects)) && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-foreground/80 mb-2">
                            Status
                          </p>
                          <div className="space-y-1 text-xs">
                            {target.mdlStatus && (
                              <div className="flex gap-2">
                                <span className="font-semibold uppercase tracking-wide text-foreground/70 w-28 shrink-0">
                                  MDL
                                </span>
                                <span>{mdlLabel(target.mdlStatus)}</span>
                              </div>
                            )}
                            {target.bailStatus && (
                              <div className="flex gap-2">
                                <span className="font-semibold uppercase tracking-wide text-foreground/70 w-28 shrink-0">
                                  Bail
                                </span>
                                <span>{formatBail(target)}</span>
                              </div>
                            )}
                            {formatSpecialProjects(target.specialProjects) && (
                              <div className="flex gap-2">
                                <span className="font-semibold uppercase tracking-wide text-foreground/70 w-28 shrink-0">
                                  Special Projects
                                </span>
                                <span>
                                  {formatSpecialProjects(
                                    target.specialProjects
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                          <Separator className="mt-3" />
                        </div>
                      )}
                      {target.registryAssociates.filter(
                        a => a.relationship === "resident"
                      ).length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-foreground/80">
                              Other Home Address Residents
                            </p>
                            <span className="text-xs text-muted-foreground border border-border bg-background px-2 py-0.5 rounded-full">
                              {
                                target.registryAssociates.filter(
                                  a => a.relationship === "resident"
                                ).length
                              }
                            </span>
                          </div>
                          <div className="flex flex-col gap-2">
                            {target.registryAssociates
                              .filter(a => a.relationship === "resident")
                              .map(a => (
                                <RegistryPersonRow
                                  key={a.id}
                                  name={a.name}
                                  isIndicesOnly={a.isIndicesOnly}
                                  kind="resident"
                                />
                              ))}
                          </div>
                          <Separator className="mt-3" />
                        </div>
                      )}
                      {target.registryAssociates.filter(
                        a => a.relationship !== "resident"
                      ).length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-foreground/80">
                              Registered Associates
                            </p>
                            <span className="text-xs text-muted-foreground border border-border bg-background px-2 py-0.5 rounded-full">
                              {
                                target.registryAssociates.filter(
                                  a => a.relationship !== "resident"
                                ).length
                              }
                            </span>
                          </div>
                          <div className="flex flex-col gap-2">
                            {target.registryAssociates
                              .filter(a => a.relationship !== "resident")
                              .map(a => (
                                <RegistryPersonRow
                                  key={a.id}
                                  name={a.name}
                                  isIndicesOnly={a.isIndicesOnly}
                                  kind="associate"
                                />
                              ))}
                          </div>
                          <Separator className="mt-3" />
                        </div>
                      )}
                      {target.linkedSheets.length > 0 && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-foreground/80 mb-2">
                            Running Sheets
                          </p>
                          <div className="space-y-1">
                            {target.linkedSheets.map(s => (
                              <button
                                key={s.id}
                                onClick={() => navigate(`/sheet/${s.id}`)}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background hover:bg-accent/10 transition-colors text-left"
                              >
                                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-xs font-medium text-foreground flex-1 truncate">
                                  {s.title}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {totalAssoc > 0 && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-foreground/80 mb-2">
                            Operational Associations
                          </p>
                          {target.assocPersons.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs text-muted-foreground mb-1">
                                Persons
                              </p>
                              <div className="flex flex-col gap-2">
                                {target.assocPersons.map(p => (
                                  <IntelEntityDropdown key={p.id} item={p} />
                                ))}
                              </div>
                            </div>
                          )}
                          {target.assocVehicles.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs text-muted-foreground mb-1">
                                Vehicles
                              </p>
                              <div className="flex flex-col gap-2">
                                {target.assocVehicles.map(v => (
                                  <IntelEntityDropdown key={v.id} item={v} />
                                ))}
                              </div>
                            </div>
                          )}
                          {target.assocLocations.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs text-muted-foreground mb-1">
                                Locations
                              </p>
                              <div className="flex flex-col gap-2">
                                {target.assocLocations.map(l => (
                                  <IntelEntityDropdown key={l.id} item={l} />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {embedded && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/intelligence/operation/${operationId}`)}
              className="text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open full profile
            </Button>
          )}
        </>
      )}
    </div>
  );
}
