import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, FileDown, User, Car, MapPin, FileText, ChevronRight } from "lucide-react";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";
import { buildPhotoGridHtml, formatAttachmentBanner, toAbsolutePhotoUrl, type RowAttachmentLike } from "@/lib/attachmentBanner";

// ─── Types (mirrors server IntelOperationProfile) ──────────────────────────
type ProfilePhoto = RowAttachmentLike & { id: number; url: string };
interface IntelProfileEntity { id: string; label: string; type: string; rowCount: number; sheetIds: number[]; operationIds: number[]; photos?: ProfilePhoto[] }
interface OperationTarget {
  targetId: number; name: string; tgt: string | null;
  hbf: string | null; v1f: string | null; v2f: string | null; dep: string | null; arr: string | null;
  linkedSheets: Array<{ id: number; title: string }>;
  assocPersons: IntelProfileEntity[]; assocVehicles: IntelProfileEntity[]; assocLocations: IntelProfileEntity[];
  photos: ProfilePhoto[];
}
interface IntelOperationProfile {
  operationId: number; operationName: string;
  promisNumber: string | null; imsNumber: string | null; investigationUnit: string | null;
  linkedSheets: Array<{ id: number; title: string; targetId: number | null; targetName: string | null }>;
  targets: OperationTarget[];
}

// ─── Colour palette ────────────────────────────────────────────────────────
const CHIP: Record<string, string> = {
  person:   "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
  vehicle:  "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  address:  "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  business: "bg-purple-500/10 text-purple-600 border-purple-500/30 dark:text-purple-400",
  target:   "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
};

// Compact thumbnail row for photos linked to a target or a set of associated
// entities. `entityLabel` (when set per-photo) shows which entity a photo
// belongs to, since this strip can aggregate photos across several chips.
function PhotoStrip({ photos, size = "w-16 h-16" }: { photos: Array<ProfilePhoto & { entityLabel?: string }>; size?: string }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {photos.map(p => (
          <button
            key={p.id}
            onClick={() => setLightbox(p.url)}
            title={p.entityLabel ? `${p.entityLabel} — ${formatAttachmentBanner(p)}` : formatAttachmentBanner(p)}
            className={`${size} rounded-md overflow-hidden border border-border/60 shrink-0 hover:opacity-80 transition-opacity`}
          >
            <img src={p.url} alt="Linked photograph" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Linked photograph" className="max-w-full max-h-full rounded shadow-2xl" />
        </div>
      )}
    </>
  );
}

// Pairs a chip with its own photos directly beneath it, so which photo
// belongs to which entity is unambiguous even when several entities in the
// same category (e.g. two associated persons) each have photos of their own.
function EntityWithPhotos({ item, onClick }: { item: IntelProfileEntity; onClick?: () => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <EntityChip item={item} onClick={onClick} />
      {(item.photos ?? []).length > 0 && (
        <div className="pl-1">
          <PhotoStrip photos={item.photos!} size="w-14 h-14" />
        </div>
      )}
    </div>
  );
}

function EntityChip({ item, onClick }: { item: IntelProfileEntity; onClick?: () => void }) {
  const cls = CHIP[item.type] ?? "bg-muted text-muted-foreground border-border";
  const icon = item.type === "vehicle" ? <Car className="w-3 h-3" /> : item.type === "address" || item.type === "business" ? <MapPin className="w-3 h-3" /> : <User className="w-3 h-3" />;
  const label = item.type === "vehicle"
    ? formatIntelVehicle(item.label)
    : (item.type === "address" || item.type === "business")
    ? formatIntelAddress(item.label)
    : item.label;
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity hover:opacity-80 ${cls}`}>
      {icon}{label}<span className="opacity-60">×{item.rowCount}</span>
    </button>
  );
}

// ─── PDF export ────────────────────────────────────────────────────────────
function buildOperationProfileHtml(profile: IntelOperationProfile) {
  const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const BLUE_DARK = "#1e3a8a"; const BLUE_MID = "#93c5fd"; const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT = "#1e293b"; const GREY_BORDER = "#e2e8f0";
  const chipHtml = (label: string, type: string, count: number) => {
    const colors: Record<string, string> = {
      person: "background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd",
      vehicle: "background:#fef3c7;color:#d97706;border:1px solid #fcd34d",
      address: "background:#d1fae5;color:#059669;border:1px solid #6ee7b7",
      business: "background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd",
      target: "background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd",
    };
    const style = colors[type] ?? "background:#f1f5f9;color:#475569;border:1px solid #cbd5e1";
    const displayLabel = type === "vehicle"
      ? formatIntelVehicle(label)
      : (type === "address" || type === "business")
      ? formatIntelAddress(label)
      : label;
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:9999px;font-size:10px;font-weight:600;${style};margin:2px">${esc(displayLabel)} <span style="opacity:0.6">×${count}</span></span>`;
  };
  // Fixed-size thumbnail row for photos linked to a set of associated
  // entities (persons/vehicles/locations), each captioned with which entity
  // it belongs to. Slightly smaller than the target's own photo grid since
  // these are secondary, per-association thumbnails.
  const ENTITY_PHOTO_PX = 80;
  const entityPhotoGridHtml = (items: IntelProfileEntity[]): string => {
    const cells = items.flatMap(i => (i.photos ?? []).map(p => `<div style="width:${ENTITY_PHOTO_PX}px;border:1px solid ${GREY_BORDER};border-radius:6px;overflow:hidden">
      <img src="${esc(toAbsolutePhotoUrl(p.url))}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block" />
      <div style="background:#000;color:#fff;font-size:6px;padding:2px 3px;line-height:1.3">
        <div style="font-weight:600">${esc(i.label)}</div>
        <div>${esc(formatAttachmentBanner(p))}</div>
      </div>
    </div>`));
    if (!cells.length) return "";
    return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${cells.join("")}</div>`;
  };
  const generatedAt = new Date().toLocaleString("en-AU", { dateStyle: "long", timeStyle: "short" });
  const totalAssoc = profile.targets.reduce((s, t) => s + t.assocPersons.length + t.assocVehicles.length + t.assocLocations.length, 0);
  const targetsHtml = profile.targets.map(t => `
    <div style="margin-bottom:20px;border:1px solid ${GREY_BORDER};border-radius:8px;overflow:hidden">
      <div style="background:${BLUE_LIGHT};padding:8px 14px;border-bottom:1px solid ${GREY_BORDER}">
        <strong style="font-size:12px;color:${BLUE_DARK}">${esc(t.name)}</strong>${t.tgt ? ` <span style="font-size:10px;color:#64748b;margin-left:8px">TGT: ${esc(t.tgt)}</span>` : ""}
      </div>
      <div style="padding:10px 14px">
        ${t.photos.length ? `<p style="font-size:10px;color:#64748b;margin-bottom:4px;font-weight:600">Photos (${t.photos.length}):</p>${buildPhotoGridHtml(t.photos, 95)}` : ""}
        ${t.hbf ? `<p style="font-size:10px;margin-bottom:4px;margin-top:8px"><span style="color:#64748b;font-weight:600">Home:</span> ${esc(formatIntelAddress(t.hbf))}</p>` : ""}
        ${t.v1f ? `<p style="font-size:10px;margin-bottom:4px"><span style="color:#64748b;font-weight:600">Vehicle 1:</span> ${esc(formatIntelVehicle(t.v1f))}</p>` : ""}
        ${t.v2f ? `<p style="font-size:10px;margin-bottom:4px"><span style="color:#64748b;font-weight:600">Vehicle 2:</span> ${esc(formatIntelVehicle(t.v2f))}</p>` : ""}
        ${t.linkedSheets.length ? `<p style="font-size:10px;color:#64748b;margin-top:6px;margin-bottom:4px;font-weight:600">Running Sheets:</p>${t.linkedSheets.map(s => `<p style="font-size:10px;padding-left:12px">• ${esc(s.title)}</p>`).join("")}` : ""}
        ${t.assocPersons.length ? `<p style="font-size:10px;color:#64748b;margin-top:8px;margin-bottom:4px;font-weight:600">Associated Persons:</p><div style="display:flex;flex-wrap:wrap;gap:4px">${t.assocPersons.map(p => chipHtml(p.label, p.type, p.rowCount)).join("")}</div>${entityPhotoGridHtml(t.assocPersons)}` : ""}
        ${t.assocVehicles.length ? `<p style="font-size:10px;color:#64748b;margin-top:8px;margin-bottom:4px;font-weight:600">Associated Vehicles:</p><div style="display:flex;flex-wrap:wrap;gap:4px">${t.assocVehicles.map(v => chipHtml(v.label, v.type, v.rowCount)).join("")}</div>${entityPhotoGridHtml(t.assocVehicles)}` : ""}
        ${t.assocLocations.length ? `<p style="font-size:10px;color:#64748b;margin-top:8px;margin-bottom:4px;font-weight:600">Associated Locations:</p><div style="display:flex;flex-wrap:wrap;gap:4px">${t.assocLocations.map(l => chipHtml(l.label, l.type, l.rowCount)).join("")}</div>${entityPhotoGridHtml(t.assocLocations)}` : ""}
      </div>
    </div>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RunLog — Operation Profile: ${esc(profile.operationName)}</title>
<style>* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; } body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:28px 32px 22px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID} !important; margin-bottom:14px; }
.entity-name { font-size:22px; font-weight:700; } .entity-sub { font-size:11px; opacity:0.7; margin-top:4px; } .gen-time { font-size:9px; opacity:0.6; margin-top:12px; }
.stats-row { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding:16px 32px; background:${BLUE_LIGHT} !important; border-bottom:2px solid ${BLUE_MID}; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.stat-box { text-align:center; } .stat-num { font-size:20px; font-weight:700; color:${BLUE_DARK} !important; } .stat-label { font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; }
.content { padding:20px 32px; } .section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin-bottom:12px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.footer { margin-top:32px; padding-top:12px; border-top:1px solid ${GREY_BORDER}; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .stats-row { background:${BLUE_LIGHT} !important; } .section-title { background:${BLUE_LIGHT} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-label">RunLog Intelligence Profile — Operation</div>
  <div class="entity-name">${esc(profile.operationName)}</div>
  ${profile.promisNumber ? `<div class="entity-sub">PROMIS: ${esc(profile.promisNumber)}</div>` : ""}
  ${profile.imsNumber ? `<div class="entity-sub">IMS: ${esc(profile.imsNumber)}</div>` : ""}
  ${profile.investigationUnit ? `<div class="entity-sub">Unit: ${esc(profile.investigationUnit)}</div>` : ""}
  <div class="gen-time">Generated: ${generatedAt}</div>
</div>
<div class="stats-row">
  <div class="stat-box"><div class="stat-num">${profile.targets.length}</div><div class="stat-label">Targets</div></div>
  <div class="stat-box"><div class="stat-num">${profile.linkedSheets.length}</div><div class="stat-label">Running Sheets</div></div>
  <div class="stat-box"><div class="stat-num">${totalAssoc}</div><div class="stat-label">Total Associations</div></div>
</div>
<div class="content">
  <div class="section-title">Target Intelligence Profiles</div>
  ${targetsHtml}
  <div class="footer"><span>RunLog — Operation Intelligence Profile</span><span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span></div>
</div></body></html>`;
}

// ─── Page component ────────────────────────────────────────────────────────
export default function IntelligenceOperationProfile() {
  const [, params] = useRoute("/intelligence/operation/:id");
  const [, navigate] = useLocation();
  const operationId = parseInt(params?.id ?? "0", 10);
  const { data: profile, isLoading, error } = trpc.intelligence.operationProfile.useQuery(
    { operationId }, { enabled: operationId > 0 }
  );
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
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <button onClick={() => window.history.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {isLoading && <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>}
        {error && <div className="text-center py-16 text-muted-foreground"><p className="text-sm">Profile not found.</p></div>}

        {typedProfile && (
          <>
            {/* Header */}
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden mb-5">
              <div className="bg-gradient-to-r from-blue-900 to-blue-800 px-6 py-5 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/30 mb-3">Operation</span>
                    <h1 className="text-2xl font-bold tracking-tight">{typedProfile.operationName}</h1>
                    <div className="flex flex-wrap gap-3 mt-2 text-sm opacity-75">
                      {typedProfile.promisNumber && <span>PROMIS: {typedProfile.promisNumber}</span>}
                      {typedProfile.imsNumber && <span>IMS: {typedProfile.imsNumber}</span>}
                      {typedProfile.investigationUnit && <span>Unit: {typedProfile.investigationUnit}</span>}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportPdf} className="bg-white/10 border-white/30 text-white hover:bg-white/20 shrink-0">
                    <FileDown className="w-4 h-4 mr-1.5" /> Export PDF
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-y sm:divide-y-0 divide-border/60 bg-blue-50/50 dark:bg-blue-950/20">
                {[
                  { label: "Targets", value: typedProfile.targets.length },
                  { label: "Running Sheets", value: typedProfile.linkedSheets.length },
                  { label: "Total Associations", value: typedProfile.targets.reduce((s, t) => s + t.assocPersons.length + t.assocVehicles.length + t.assocLocations.length, 0) },
                ].map(stat => (
                  <div key={stat.label} className="px-4 py-3 text-center">
                    <p className="text-xl font-bold text-blue-900 dark:text-blue-300">{stat.value}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Target profiles */}
            <div className="space-y-3">
              {typedProfile.targets.map(target => {
                const isExpanded = expandedTargetId === target.targetId;
                const totalAssoc = target.assocPersons.length + target.assocVehicles.length + target.assocLocations.length;
                return (
                  <div key={target.targetId} className="rounded-xl border border-border/60 bg-card overflow-hidden">
                    <button
                      onClick={() => setExpandedTargetId(isExpanded ? null : target.targetId)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/10 transition-colors"
                    >
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 shrink-0">
                        <User className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{target.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {target.linkedSheets.length} sheet{target.linkedSheets.length !== 1 ? "s" : ""} · {totalAssoc} association{totalAssoc !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/intelligence/target/${target.targetId}`); }}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0 mr-2"
                      >
                        Full Profile
                      </button>
                      <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-3">
                        {target.photos.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Photos ({target.photos.length})</p>
                            <PhotoStrip photos={target.photos} />
                            <Separator className="mt-3" />
                          </div>
                        )}
                        {(target.hbf || target.v1f || target.v2f) && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Registered Details</p>
                            <div className="space-y-1 text-xs">
                              {target.hbf && <div className="flex gap-2"><span className="text-muted-foreground w-20 shrink-0">Home</span><span className="font-mono">{formatIntelAddress(target.hbf)}</span></div>}
                              {target.v1f && <div className="flex gap-2"><span className="text-muted-foreground w-20 shrink-0">Vehicle 1</span><span className="font-mono">{formatIntelVehicle(target.v1f)}</span></div>}
                              {target.v2f && <div className="flex gap-2"><span className="text-muted-foreground w-20 shrink-0">Vehicle 2</span><span className="font-mono">{formatIntelVehicle(target.v2f)}</span></div>}
                            </div>
                            <Separator className="mt-3" />
                          </div>
                        )}
                        {target.linkedSheets.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Running Sheets</p>
                            <div className="space-y-1">
                              {target.linkedSheets.map(s => (
                                <button key={s.id} onClick={() => navigate(`/sheet/${s.id}`)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent/10 transition-colors text-left">
                                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-xs font-medium text-foreground flex-1 truncate">{s.title}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {totalAssoc > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Operational Associations</p>
                            {target.assocPersons.length > 0 && (
                              <div className="mb-2">
                                <p className="text-xs text-muted-foreground mb-1">Persons</p>
                                <div className="flex flex-col gap-2">
                                  {target.assocPersons.map(p => (
                                    <EntityWithPhotos key={p.id} item={p} onClick={() => navigate(`/intelligence/associate/${encodeURIComponent(p.label)}`)} />
                                  ))}
                                </div>
                              </div>
                            )}
                            {target.assocVehicles.length > 0 && (
                              <div className="mb-2">
                                <p className="text-xs text-muted-foreground mb-1">Vehicles</p>
                                <div className="flex flex-col gap-2">
                                  {target.assocVehicles.map(v => (
                                    <EntityWithPhotos key={v.id} item={v} onClick={() => navigate(`/intelligence/vehicle/${encodeURIComponent(v.label)}`)} />
                                  ))}
                                </div>
                              </div>
                            )}
                            {target.assocLocations.length > 0 && (
                              <div className="mb-2">
                                <p className="text-xs text-muted-foreground mb-1">Locations</p>
                                <div className="flex flex-col gap-2">
                                  {target.assocLocations.map(l => (
                                    <EntityWithPhotos key={l.id} item={l} onClick={() => navigate(`/intelligence/location/${encodeURIComponent(l.label)}`)} />
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
    </DashboardLayout>
  );
}
