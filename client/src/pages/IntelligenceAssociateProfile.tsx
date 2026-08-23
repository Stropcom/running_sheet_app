import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileDown, User, FileText, AlertTriangle, Folder } from "lucide-react";
import { EntityPhotosSection } from "@/components/EntityPhotosSection";
import { buildPhotoGridHtml, buildEntityListWithPhotosHtml, type RowAttachmentLike } from "@/lib/attachmentBanner";
import { IntelEntityWithPhotos, type IntelAssocEntity } from "@/components/IntelEntityChip";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import { IndicesBadge } from "@/components/IndicesBadge";

type ProfilePhoto = RowAttachmentLike & { id: number; url: string };

type IntelProfileEntity = IntelAssocEntity;
interface IntelAssociateProfile {
  label: string; type: "person" | "business";
  linkedTargets: Array<{ targetId: number; name: string; operationId: number; operationName: string }>;
  sharedEntityLinks: Array<{ targetId?: number; targetName?: string; operationId: number; operationName: string; via: "vehicle" | "address"; sharedValue: string }>;
  linkedSheets: Array<{ id: number; title: string; operationId: number; operationName: string }>;
  assocLocations: IntelProfileEntity[]; assocVehicles: IntelProfileEntity[];
  isIndicesOnly: boolean;
  registryAssociateId?: number | null;
  firstNames?: string | null;
  surname?: string | null;
  bornDate?: string | null;
  hbf?: string | null;
  hb?: string | null;
  v1f?: string | null;
  v1?: string | null;
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{count}</span>
    </div>
  );
}

function buildAssociateProfileHtml(profile: IntelAssociateProfile, photos: ProfilePhoto[]) {
  const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const BLUE_DARK = "#1e3a8a"; const BLUE_MID = "#93c5fd"; const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT = "#1e293b"; const GREY_BORDER = "#e2e8f0";
  const generatedAt = new Date().toLocaleString("en-AU", { dateStyle: "long", timeStyle: "short" });
  const linkedOpIds = new Set(profile.linkedTargets.map(t => t.operationId));
  const sharedOnlyOps = Array.from(
    new Map(
      profile.sharedEntityLinks
        .filter(l => !linkedOpIds.has(l.operationId))
        .map(l => [l.operationId, l.operationName])
    ).entries()
  );
  const totalOpsCount = linkedOpIds.size + sharedOnlyOps.length;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RunLog — Associate Profile: ${esc(profile.label)}</title>
<style>* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; } body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:28px 32px 22px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID} !important; margin-bottom:14px; }
.entity-name { font-size:22px; font-weight:700; } .indices-tag { display:inline-block; margin-left:10px; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:700; letter-spacing:0.05em; vertical-align:middle; background:rgba(129,140,248,0.25) !important; border:1px solid rgba(199,210,254,0.5); color:#e0e7ff !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; } .gen-time { font-size:9px; opacity:0.6; margin-top:12px; }
.stats-row { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding:16px 32px; background:${BLUE_LIGHT} !important; border-bottom:2px solid ${BLUE_MID}; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.stat-box { text-align:center; } .stat-num { font-size:20px; font-weight:700; color:${BLUE_DARK} !important; } .stat-label { font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; }
.content { padding:20px 32px; } .section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin-bottom:10px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.sub-title { font-size:9px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#64748b; margin-bottom:6px; border-bottom:1px solid ${GREY_BORDER}; padding-bottom:4px; }
.footer { margin-top:32px; padding-top:12px; border-top:1px solid ${GREY_BORDER}; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .stats-row { background:${BLUE_LIGHT} !important; } .section-title { background:${BLUE_LIGHT} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-label">RunLog Intelligence Profile — Associate</div>
  <div class="entity-name">${esc(profile.label)}${profile.isIndicesOnly ? `<span class="indices-tag">INDICES</span>` : ""}</div>
  <div class="gen-time">Generated: ${generatedAt}</div>
</div>
<div class="stats-row">
  <div class="stat-box"><div class="stat-num">${profile.linkedTargets.length}</div><div class="stat-label">Linked Targets</div></div>
  <div class="stat-box"><div class="stat-num">${profile.linkedSheets.length}</div><div class="stat-label">Running Sheets</div></div>
  <div class="stat-box"><div class="stat-num">${profile.assocVehicles.length + profile.assocLocations.length}</div><div class="stat-label">Associations</div></div>
</div>
<div class="content">
  ${photos.length ? `<div style="margin-bottom:16px"><div class="section-title">Photos (${photos.length})</div>${buildPhotoGridHtml(photos)}</div>` : ""}
  ${profile.registryAssociateId ? `<div style="margin-bottom:16px"><div class="section-title">Registered Details</div>
    ${profile.hbf ? `<p style="font-size:10px;padding:3px 0;border-bottom:1px solid ${GREY_BORDER}"><strong>Home Address</strong> — ${esc(profile.hbf)}</p>` : ""}
    ${profile.v1f ? `<p style="font-size:10px;padding:3px 0;border-bottom:1px solid ${GREY_BORDER}"><strong>Vehicle</strong> — ${esc(profile.v1f)}</p>` : ""}
  </div>` : ""}
  ${totalOpsCount > 1 ? `<p style="font-size:10px;font-weight:600;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:4px;padding:6px 8px;margin-bottom:16px">Linked across ${totalOpsCount} separate operations — worth checking for a cross-operation connection.</p>` : ""}
  ${profile.linkedTargets.length ? `<div style="margin-bottom:16px"><div class="section-title">Linked Targets</div>${profile.linkedTargets.map(t => `<p style="font-size:10px;padding:3px 0;border-bottom:1px solid ${GREY_BORDER}"><strong>${esc(t.name)}</strong> <span style="color:#64748b">— ${esc(t.operationName)}</span></p>`).join("")}</div>` : ""}
  ${profile.sharedEntityLinks.length ? `<div style="margin-bottom:16px"><div class="section-title">Shared Vehicle/Address</div>${profile.sharedEntityLinks.map(l => `<p style="font-size:10px;padding:3px 0;border-bottom:1px solid ${GREY_BORDER}">${l.targetName ? `<strong>${esc(l.targetName)}</strong> shares this ${esc(l.via)} (${esc(l.sharedValue)})` : `This ${esc(l.via)} (${esc(l.sharedValue)}) was also sighted`} <span style="color:#64748b">— ${esc(l.operationName)}</span></p>`).join("")}</div>` : ""}
  ${profile.linkedSheets.length ? `<div style="margin-bottom:16px"><div class="section-title">Running Sheets</div>${profile.linkedSheets.map(s => `<p style="font-size:10px;padding:3px 0;border-bottom:1px solid ${GREY_BORDER}">${esc(s.title)} <span style="color:#64748b">— ${esc(s.operationName)}</span></p>`).join("")}</div>` : ""}
  ${profile.assocVehicles.length || profile.assocLocations.length ? `<div style="margin-bottom:16px"><div class="section-title">Associations</div>
    ${profile.assocVehicles.length ? `<div class="sub-title">Vehicles</div>${buildEntityListWithPhotosHtml(profile.assocVehicles)}` : ""}
    ${profile.assocLocations.length ? `<div class="sub-title">Locations</div>${buildEntityListWithPhotosHtml(profile.assocLocations)}` : ""}
  </div>` : ""}
  <div class="footer"><span>RunLog — Associate Intelligence Profile</span><span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span></div>
</div>
${buildExportPreviewCloseBar()}
</body></html>`;
}

export default function IntelligenceAssociateProfile() {
  const [, params] = useRoute("/intelligence/associate/:label");
  const [, navigate] = useLocation();
  const label = decodeURIComponent(params?.label ?? "");
  const { data, isLoading, error } = trpc.intelligence.associateProfile.useQuery({ label }, { enabled: !!label });
  const profile = data as IntelAssociateProfile | undefined;
  const { data: photosData } = trpc.attachment.byEntity.useQuery(
    { category: "associate", entityLabel: label },
    { enabled: !!label }
  );
  const photos = (photosData ?? []) as ProfilePhoto[];

  const linkedOpIds = new Set(
    (profile?.linkedTargets ?? []).map(t => t.operationId)
  );
  const sharedOnlyOps = Array.from(
    new Map(
      (profile?.sharedEntityLinks ?? [])
        .filter(l => !linkedOpIds.has(l.operationId))
        .map(l => [l.operationId, l.operationName])
    ).entries()
  );
  const totalOpsCount = linkedOpIds.size + sharedOnlyOps.length;

  function exportPdf() {
    if (!profile) return;
    const html = buildAssociateProfileHtml(profile, photos);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <button onClick={() => window.history.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {isLoading && <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>}
        {error && <div className="text-center py-16 text-muted-foreground"><p className="text-sm">Profile not found.</p></div>}
        {profile && (
          <>
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden mb-5">
              <div className="bg-gradient-to-r from-blue-900 to-blue-800 px-6 py-5 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/30">
                        <User className="w-3 h-3" /> Associate
                      </span>
                      {profile.isIndicesOnly && (
                        <IndicesBadge variant="on-dark" size="header" />
                      )}
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">{profile.label}</h1>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportPdf} className="bg-white/10 border-white/30 text-white hover:bg-white/20 shrink-0">
                    <FileDown className="w-4 h-4 mr-1.5" /> Export PDF
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-y sm:divide-y-0 divide-border/60 bg-blue-50/50 dark:bg-blue-950/20">
                {[
                  { label: "Linked Targets", value: profile.linkedTargets.length },
                  { label: "Running Sheets", value: profile.linkedSheets.length },
                  { label: "Associations", value: profile.assocVehicles.length + profile.assocLocations.length },
                ].map(stat => (
                  <div key={stat.label} className="px-4 py-3 text-center">
                    <p className="text-xl font-bold text-blue-900 dark:text-blue-300">{stat.value}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <EntityPhotosSection category="associate" entityLabel={profile.label} />

            {profile.registryAssociateId && (profile.hbf || profile.v1f) && (
              <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
                <SectionHeading label="Registered Details" count={[profile.hbf, profile.v1f].filter(Boolean).length} />
                <div className="space-y-2">
                  {profile.hbf && (
                    <div className="px-3 py-2 rounded-lg border border-border/60 bg-muted/20">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Home Address</p>
                      <p className="text-sm text-foreground">{profile.hbf}</p>
                    </div>
                  )}
                  {profile.v1f && (
                    <div className="px-3 py-2 rounded-lg border border-border/60 bg-muted/20">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Vehicle</p>
                      <p className="text-sm text-foreground">{profile.v1f}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(profile.linkedTargets.length > 0 || sharedOnlyOps.length > 0) && (
              <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
                <SectionHeading label="Linked Targets" count={profile.linkedTargets.length} />
                {totalOpsCount > 1 && (
                  <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      Linked across {totalOpsCount} separate operations — worth checking for a cross-operation connection.
                    </p>
                  </div>
                )}
                <div className="space-y-1">
                  {profile.linkedTargets.map(t => (
                    <button key={`${t.targetId}-${t.operationId}`} onClick={() => navigate(`/intelligence/target/${t.targetId}`)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent/10 transition-colors text-left">
                      <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-xs font-medium text-foreground flex-1 truncate">{t.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{t.operationName}</span>
                    </button>
                  ))}
                </div>
                {profile.sharedEntityLinks.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-1">Shared vehicle / address</p>
                    <div className="flex flex-wrap gap-2">
                      {profile.sharedEntityLinks.map(l => (
                        <button
                          key={`${l.targetId ?? "sighted"}-${l.operationId}-${l.via}`}
                          onClick={() => navigate(`/intelligence/operation/${l.operationId}`)}
                          title={
                            l.targetName
                              ? `Shares a registered ${l.via} (${l.sharedValue}) with ${l.targetName}`
                              : `This ${l.via} (${l.sharedValue}) was also sighted on this operation`
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 transition-colors"
                        >
                          <Folder className="w-3 h-3" />
                          {l.operationName}
                          <span className="text-[9px] uppercase tracking-wide opacity-70">
                            shared {l.via}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {profile.linkedSheets.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
                <SectionHeading label="Running Sheets" count={profile.linkedSheets.length} />
                <div className="space-y-1">
                  {profile.linkedSheets.map(s => (
                    <button key={s.id} onClick={() => navigate(`/sheet/${s.id}`)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent/10 transition-colors text-left">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium text-foreground flex-1 truncate">{s.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{s.operationName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(profile.assocVehicles.length > 0 || profile.assocLocations.length > 0) && (
              <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
                <SectionHeading label="Associations" count={profile.assocVehicles.length + profile.assocLocations.length} />
                {profile.assocVehicles.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground mb-1">Vehicles</p>
                    <div className="flex flex-col gap-2">
                      {profile.assocVehicles.map(v => <IntelEntityWithPhotos key={v.id} item={v} onClick={() => navigate(`/intelligence/vehicle/${encodeURIComponent(v.label)}`)} />)}
                    </div>
                  </div>
                )}
                {profile.assocLocations.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground mb-1">Locations</p>
                    <div className="flex flex-col gap-2">
                      {profile.assocLocations.map(l => <IntelEntityWithPhotos key={l.id} item={l} onClick={() => navigate(`/intelligence/location/${encodeURIComponent(l.label)}`)} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
