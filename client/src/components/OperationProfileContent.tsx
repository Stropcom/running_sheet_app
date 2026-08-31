import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  FileDown,
  User,
  FileText,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Folder,
} from "lucide-react";
import {
  formatIntelAddress,
  formatIntelVehicle,
  composeAddress,
  composeVehicle,
  composeTargetName,
} from "@/lib/addressFormat";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import {
  buildPhotoGridHtml,
  buildEntityListWithPhotosHtml,
  type RowAttachmentLike,
} from "@/lib/attachmentBanner";
import { buildProfileTargetBlockHtml } from "@/lib/profileSection";
import {
  IntelEntityWithPhotos,
  IntelPhotoStrip,
  type IntelAssocEntity,
} from "@/components/IntelEntityChip";
import { IndicesBadge } from "@/components/IndicesBadge";
import type { DocumentImportPrefill } from "@/components/ImportTargetDocumentDialog";

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
  dep: string | null;
  arr: string | null;
  linkedSheets: Array<{ id: number; title: string }>;
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
    via: "vehicle" | "address";
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
    ${profile.crossOperationLinks.map(l => `<p style="font-size:10px;padding:3px 0;border-bottom:1px solid ${GREY_BORDER}"><strong>${esc(l.targetName)}</strong> shares a registered ${esc(l.via)} (${esc(l.sharedValue)}) with a target on <strong>${esc(l.otherOperationName)}</strong></p>`).join("")}
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

interface DocumentImportRow {
  id: number;
  targetId: number;
  targetName: string | null;
  uploadedByCIN: string | null;
  uploadedAt: string | Date;
  sourceFileName: string | null;
  snapshotJson: string;
}

function formatImportDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function ImportedDocumentCard({
  row,
  version,
  isCurrent,
  defaultOpen,
}: {
  row: DocumentImportRow;
  version: number;
  isCurrent: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  let snapshot: DocumentImportPrefill | null = null;
  try {
    snapshot = JSON.parse(row.snapshotJson);
  } catch {
    snapshot = null;
  }
  if (!snapshot) return null;

  const { name } = composeTargetName(snapshot.identity);
  const address = composeAddress(snapshot.address).full;
  const vehicle = composeVehicle(snapshot.vehicle).full;
  const extraAddresses = snapshot.extraAddresses
    .map(a => composeAddress(a).full)
    .filter(Boolean);
  const extraVehicles = snapshot.extraVehicles
    .map(v => composeVehicle(v).full)
    .filter(Boolean);
  const associateNames = snapshot.associates
    .map(a => composeTargetName(a.identity).name)
    .filter(Boolean);
  const background = snapshot.background.trim();

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/10 transition-colors"
      >
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30 shrink-0">
          <FileText className="w-3.5 h-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-foreground truncate">
              Imported for {row.targetName ?? name ?? "Unknown target"}
            </p>
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 ${
                isCurrent
                  ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              Version {version}
              {isCurrent ? " · Current" : ""}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            Uploaded {formatImportDate(row.uploadedAt)}
            {row.uploadedByCIN ? ` · CIN ${row.uploadedByCIN}` : ""}
            {row.sourceFileName ? ` · ${row.sourceFileName}` : ""}
          </p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-3 text-xs">
          <p className="text-[10.5px] text-muted-foreground italic">
            Shown exactly as parsed from the uploaded document — not the
            target's current live details, which may have been edited since.
          </p>
          <div>
            <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Name
            </p>
            <p className="text-foreground">{name || "—"}</p>
          </div>
          {(address || extraAddresses.length > 0) && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Address{extraAddresses.length > 0 ? "es" : ""}
              </p>
              <div className="space-y-0.5">
                {address && (
                  <p className="font-mono text-foreground">
                    {formatIntelAddress(address)}
                  </p>
                )}
                {extraAddresses.map((a, i) => (
                  <p key={i} className="font-mono text-foreground">
                    {formatIntelAddress(a)}
                  </p>
                ))}
              </div>
            </div>
          )}
          {(vehicle || extraVehicles.length > 0) && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Vehicle{extraVehicles.length > 0 ? "s" : ""}
              </p>
              <div className="space-y-0.5">
                {vehicle && (
                  <p className="font-mono text-foreground">
                    {formatIntelVehicle(vehicle)}
                  </p>
                )}
                {extraVehicles.map((v, i) => (
                  <p key={i} className="font-mono text-foreground">
                    {formatIntelVehicle(v)}
                  </p>
                ))}
              </div>
            </div>
          )}
          {associateNames.length > 0 && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Associates mentioned
              </p>
              <div className="flex flex-wrap gap-1.5">
                {associateNames.map((n, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-foreground"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
          {background && (
            <div>
              <p className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Background
              </p>
              <p className="whitespace-pre-wrap text-foreground">
                {background}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
    <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
      <p className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-1">
        Imported Documents
      </p>
      <p className="text-[11px] text-muted-foreground mb-3">
        Every target-profile document uploaded for this operation, verbatim as
        parsed.
      </p>
      <div className="space-y-2">
        {Array.from(byTarget.values()).flatMap(rows =>
          rows.map((row, idx) => (
            <ImportedDocumentCard
              key={row.id}
              row={row}
              version={idx + 1}
              isCurrent={idx === rows.length - 1}
              defaultOpen={rows.length === 1}
            />
          ))
        )}
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
}: {
  operationId: number;
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
    <div className="max-w-3xl mx-auto px-4 py-6">
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
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden mb-5">
            <div className="bg-gradient-to-r from-blue-900 to-blue-800 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/30 mb-3">
                    Operation
                  </span>
                  <h1 className="text-2xl font-bold tracking-tight">
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

          {typedProfile.crossOperationLinks.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
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
                  <button
                    key={`${l.targetId}-${l.otherOperationId}-${l.via}`}
                    onClick={() =>
                      navigate(`/intelligence/target/${l.targetId}`)
                    }
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent/10 transition-colors text-left"
                  >
                    <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="text-xs font-medium text-foreground flex-1 truncate">
                      {l.targetName}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 shrink-0">
                      <Folder className="w-3 h-3" />
                      {l.otherOperationName}
                      <span className="text-[9px] uppercase tracking-wide opacity-70">
                        shared {l.via}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <ImportedDocumentsSection operationId={operationId} />

          {/* Target profiles */}
          <div className="space-y-3">
            {typedProfile.targets.map(target => {
              const isExpanded = expandedTargetId === target.targetId;
              const totalAssoc =
                target.assocPersons.length +
                target.assocVehicles.length +
                target.assocLocations.length;
              return (
                <div
                  key={target.targetId}
                  className="rounded-xl border border-border/60 bg-card overflow-hidden"
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
                        <p className="text-sm font-semibold text-foreground truncate">
                          {target.name}
                        </p>
                        {target.isIndicesOnly && <IndicesBadge />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {target.linkedSheets.length} sheet
                        {target.linkedSheets.length !== 1 ? "s" : ""} ·{" "}
                        {totalAssoc} association{totalAssoc !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        navigate(`/intelligence/target/${target.targetId}`);
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0 mr-2"
                    >
                      Full Profile
                    </button>
                    <ChevronRight
                      className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-3">
                      {target.photos.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Photos ({target.photos.length})
                          </p>
                          <IntelPhotoStrip photos={target.photos} />
                          <Separator className="mt-3" />
                        </div>
                      )}
                      {(target.hbf || target.v1f || target.v2f) && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Registered Details
                          </p>
                          <div className="space-y-1 text-xs">
                            {target.hbf && (
                              <div className="flex gap-2">
                                <span className="text-muted-foreground w-20 shrink-0">
                                  Home
                                </span>
                                <span className="font-mono">
                                  {formatIntelAddress(target.hbf)}
                                </span>
                              </div>
                            )}
                            {target.v1f && (
                              <div className="flex gap-2">
                                <span className="text-muted-foreground w-20 shrink-0">
                                  Vehicle 1
                                </span>
                                <span className="font-mono">
                                  {formatIntelVehicle(target.v1f)}
                                </span>
                              </div>
                            )}
                            {target.v2f && (
                              <div className="flex gap-2">
                                <span className="text-muted-foreground w-20 shrink-0">
                                  Vehicle 2
                                </span>
                                <span className="font-mono">
                                  {formatIntelVehicle(target.v2f)}
                                </span>
                              </div>
                            )}
                          </div>
                          <Separator className="mt-3" />
                        </div>
                      )}
                      {target.linkedSheets.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Running Sheets
                          </p>
                          <div className="space-y-1">
                            {target.linkedSheets.map(s => (
                              <button
                                key={s.id}
                                onClick={() => navigate(`/sheet/${s.id}`)}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent/10 transition-colors text-left"
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
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Operational Associations
                          </p>
                          {target.assocPersons.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs text-muted-foreground mb-1">
                                Persons
                              </p>
                              <div className="flex flex-col gap-2">
                                {target.assocPersons.map(p => (
                                  <IntelEntityWithPhotos
                                    key={p.id}
                                    item={p}
                                    onClick={() =>
                                      navigate(
                                        `/intelligence/associate/${encodeURIComponent(p.label)}`
                                      )
                                    }
                                  />
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
                                  <IntelEntityWithPhotos
                                    key={v.id}
                                    item={v}
                                    onClick={() =>
                                      navigate(
                                        `/intelligence/vehicle/${encodeURIComponent(v.label)}`
                                      )
                                    }
                                  />
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
                                  <IntelEntityWithPhotos
                                    key={l.id}
                                    item={l}
                                    onClick={() =>
                                      navigate(
                                        `/intelligence/location/${encodeURIComponent(l.label)}`
                                      )
                                    }
                                  />
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
        </>
      )}
    </div>
  );
}
