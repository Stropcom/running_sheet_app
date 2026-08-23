import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { FileDown, User, Folder, FileText, Users } from "lucide-react";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import { EntityPhotosSection } from "@/components/EntityPhotosSection";
import {
  buildPhotoGridHtml,
  buildEntityListWithPhotosHtml,
  type RowAttachmentLike,
} from "@/lib/attachmentBanner";
import {
  IntelEntityWithPhotos,
  type IntelAssocEntity,
} from "@/components/IntelEntityChip";
import { IndicesBadge } from "@/components/IndicesBadge";

type ProfilePhoto = RowAttachmentLike & { id: number; url: string };

type EntityItem = IntelAssocEntity;

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
        {count}
      </span>
    </div>
  );
}

// ─── PDF export ────────────────────────────────────────────────────────────
function buildTargetProfileHtml(
  profile: NonNullable<ReturnType<typeof useTargetProfile>["data"]>,
  photos: ProfilePhoto[],
  fieldHistory: {
    fieldName: string;
    previousValue: string;
    supersededAt: number;
    supersededByCIN: string | null;
  }[] = []
) {
  const esc = (s: string | null | undefined) =>
    (s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const prevHtml = (field: string, variant: "light" | "dark" = "light") => {
    const items = fieldHistory.filter(h => h.fieldName === field);
    if (!items.length) return "";
    const textColor = variant === "dark" ? "rgba(255,255,255,0.75)" : "#92400e";
    const badgeBg = variant === "dark" ? "rgba(255,255,255,0.18)" : "#fef3c7";
    const badgeColor = variant === "dark" ? "#fff" : "#92400e";
    return items
      .map(
        h =>
          `<div style="font-size:9px;color:${textColor};margin-top:2px"><span style="font-weight:700;text-transform:uppercase;letter-spacing:0.05em;background:${badgeBg};color:${badgeColor};border-radius:3px;padding:1px 4px;margin-right:4px">Previous</span>${esc(h.previousValue)} <span style="opacity:0.7">— ${new Date(h.supersededAt).toLocaleDateString("en-AU")}${h.supersededByCIN ? ` (CIN${esc(h.supersededByCIN)})` : ""}</span></div>`
      )
      .join("");
  };
  const BLUE_DARK = "#1e3a8a";
  const BLUE_MID = "#93c5fd";
  const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT = "#1e293b";
  const GREY_BORDER = "#e2e8f0";
  const GREY_LIGHT = "#f8fafc";

  const sectionHtml = (title: string, items: EntityItem[]) => {
    if (!items.length) return "";
    return `
      <div style="margin-bottom:16px">
        <p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px;border-bottom:1px solid ${GREY_BORDER};padding-bottom:4px">${esc(title)}</p>
        ${buildEntityListWithPhotosHtml(items)}
      </div>`;
  };

  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const linkedOpIds = new Set(profile.operations.map(o => o.id));
  const mentionedOnlyOps = Array.from(
    new Map(
      profile.mentionedSheets
        .filter(s => !linkedOpIds.has(s.operationId))
        .map(s => [s.operationId, s.operationName])
    ).entries()
  );

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>RunLog Intelligence Profile — ${esc(profile.name)}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:28px 32px 22px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.brand-row { display:flex; align-items:center; gap:10px; margin-bottom:14px; opacity:0.85; }
.brand-dot { width:10px; height:10px; border-radius:50%; background:${BLUE_MID}; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID}; }
.entity-type-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); border-radius:9999px; padding:4px 14px; font-size:10px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:10px; }
.entity-name { font-size:22px; font-weight:700; letter-spacing:-0.01em; line-height:1.2; }
.indices-tag { display:inline-block; margin-left:10px; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:700; letter-spacing:0.05em; vertical-align:middle; background:rgba(129,140,248,0.25) !important; border:1px solid rgba(199,210,254,0.5); color:#e0e7ff !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.indices-tag-light { display:inline-block; margin-left:6px; padding:1px 6px; border-radius:999px; font-size:9px; font-weight:700; letter-spacing:0.03em; vertical-align:middle; background:#e0e7ff !important; border:1px solid #c7d2fe; color:#4338ca !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.entity-sub { font-size:12px; opacity:0.75; margin-top:4px; }
.gen-time { font-size:9px; opacity:0.6; margin-top:12px; }
.stats-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; padding:16px 32px; background:${BLUE_LIGHT} !important; border-bottom:2px solid ${BLUE_MID}; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.stat-box { text-align:center; }
.stat-num { font-size:20px; font-weight:700; color:${BLUE_DARK} !important; }
.stat-label { font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; }
.content { padding:20px 32px; }
.section { margin-bottom:20px; }
.section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin-bottom:10px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.detail-grid { display:grid; grid-template-columns:120px 1fr; gap:4px 12px; font-size:10px; margin-bottom:8px; }
.detail-label { color:#64748b; font-weight:600; }
.detail-value { color:${GREY_TEXT}; }
.ops-list { display:flex; flex-wrap:wrap; gap:6px; }
.op-badge { background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; border:1px solid ${BLUE_MID}; border-radius:6px; padding:3px 10px; font-size:10px; font-weight:600; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.sheet-item { display:flex; align-items:center; gap:8px; padding:5px 8px; border-bottom:1px solid ${GREY_BORDER}; font-size:10px; }
.sheet-item:last-child { border-bottom:none; }
.sheet-dot { width:6px; height:6px; border-radius:50%; background:${BLUE_MID}; flex-shrink:0; }
.footer { margin-top:32px; padding-top:12px; border-top:1px solid ${GREY_BORDER}; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .stats-row { background:${BLUE_LIGHT} !important; } .section-title { background:${BLUE_LIGHT} !important; } .op-badge { background:${BLUE_LIGHT} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-row"><div class="brand-dot"></div><span class="brand-label">RunLog Intelligence Profile</span></div>
  <div class="entity-type-badge">&#128100; Person — Target</div>
  <div class="entity-name">${esc(profile.name)}${profile.isIndicesOnly ? `<span class="indices-tag">INDICES</span>` : ""}</div>
  ${profile.tgt ? `<div class="entity-sub">TGT Alias: ${esc(profile.tgt)}</div>` : ""}
  ${prevHtml("name", "dark")}
  ${prevHtml("tgt", "dark")}
  <div class="gen-time">Generated: ${generatedAt}</div>
</div>
<div class="stats-row">
  <div class="stat-box"><div class="stat-num">${profile.operations.length + mentionedOnlyOps.length}</div><div class="stat-label">Operations</div></div>
  <div class="stat-box"><div class="stat-num">${profile.linkedSheets.length + profile.mentionedSheets.length}</div><div class="stat-label">Running Sheets</div></div>
  <div class="stat-box"><div class="stat-num">${profile.assocPersons.length + profile.assocVehicles.length + profile.assocLocations.length}</div><div class="stat-label">Associations</div></div>
  <div class="stat-box"><div class="stat-num">${profile.observationCount}</div><div class="stat-label">Observations</div></div>
</div>
<div class="content">
  ${
    photos.length
      ? `<div class="section">
    <div class="section-title">Photos (${photos.length})</div>
    ${buildPhotoGridHtml(photos)}
  </div>`
      : ""
  }

  <div class="section">
    <div class="section-title">Operations</div>
    <div class="ops-list">${profile.operations.map(o => `<span class="op-badge">${esc(o.name)}</span>`).join("")}${mentionedOnlyOps
      .map(
        ([id, name]) =>
          `<span class="op-badge" style="opacity:0.65;border-style:dashed;">${esc(name)} <span style="font-size:8px;text-transform:uppercase;">(mentioned)</span></span>`
      )
      .join("")}</div>
  </div>

  ${
    profile.hbf ||
    profile.v1f ||
    profile.v2f ||
    profile.extraVehicles ||
    profile.extraAddresses
      ? `
  <div class="section">
    <div class="section-title">Registered Details</div>
    <div class="detail-grid">
      ${profile.hbf ? `<span class="detail-label">Home Address</span><span class="detail-value">${esc(formatIntelAddress(profile.hbf))}</span>` : ""}
      ${prevHtml("hbf") ? `<span style="grid-column:1/-1">${prevHtml("hbf")}</span>` : ""}
      ${
        profile.extraAddresses
          ? (() => {
              try {
                const eas: Array<{ full?: string; short?: string }> =
                  JSON.parse(profile.extraAddresses!);
                return eas
                  .map((ea, i) => {
                    const val = ea.full?.trim() || ea.short?.trim() || "";
                    return val
                      ? `<span class="detail-label">Address ${i + 2}</span><span class="detail-value">${esc(formatIntelAddress(val))}</span>`
                      : "";
                  })
                  .join("");
              } catch {
                return "";
              }
            })()
          : ""
      }
      ${profile.v1f ? `<span class="detail-label">Vehicle 1</span><span class="detail-value">${esc(formatIntelVehicle(profile.v1f))}</span>` : ""}
      ${prevHtml("v1f") ? `<span style="grid-column:1/-1">${prevHtml("v1f")}</span>` : ""}
      ${profile.v2f ? `<span class="detail-label">Vehicle 2</span><span class="detail-value">${esc(formatIntelVehicle(profile.v2f))}</span>` : ""}
      ${
        profile.extraVehicles
          ? (() => {
              try {
                const evs: Array<{ full?: string; short?: string }> =
                  JSON.parse(profile.extraVehicles!);
                return evs
                  .map((ev, i) => {
                    const val = ev.full?.trim() || ev.short?.trim() || "";
                    return val
                      ? `<span class="detail-label">Vehicle ${i + 2}</span><span class="detail-value">${esc(formatIntelVehicle(val))}</span>`
                      : "";
                  })
                  .join("");
              } catch {
                return "";
              }
            })()
          : ""
      }
    </div>
  </div>`
      : ""
  }

  ${
    profile.registryAssociates.length
      ? `
  <div class="section">
    <div class="section-title">Registered Associates</div>
    <div style="border:1px solid ${GREY_BORDER};border-radius:6px;overflow:hidden">
      ${profile.registryAssociates
        .map(
          a =>
            `<div class="sheet-item"><div class="sheet-dot"></div><span style="flex:1">${esc(a.name)}${a.isIndicesOnly ? `<span class="indices-tag-light">INDICES</span>` : ""}</span><span style="color:#64748b">${esc(a.hbf ?? "")}</span></div>`
        )
        .join("")}
    </div>
  </div>`
      : ""
  }

  <div class="section">
    <div class="section-title">Running Sheets</div>
    <div style="border:1px solid ${GREY_BORDER};border-radius:6px;overflow:hidden">
      ${profile.linkedSheets.map(s => `<div class="sheet-item"><div class="sheet-dot"></div><span style="flex:1">${esc(s.title)}</span><span style="color:#64748b">${esc(s.operationName)}</span></div>`).join("") || `<div class="sheet-item"><span style="color:#94a3b8">No linked running sheets</span></div>`}
    </div>
  </div>

  ${
    profile.mentionedSheets.length
      ? `
  <div class="section">
    <div class="section-title">Also Mentioned In</div>
    <div style="border:1px dashed ${GREY_BORDER};border-radius:6px;overflow:hidden">
      ${profile.mentionedSheets.map(s => `<div class="sheet-item"><div class="sheet-dot"></div><span style="flex:1">${esc(s.title)}</span><span style="color:#64748b">${esc(s.operationName)}</span></div>`).join("")}
    </div>
  </div>`
      : ""
  }

  ${
    profile.assocPersons.length ||
    profile.assocVehicles.length ||
    profile.assocLocations.length
      ? `
  <div class="section">
    <div class="section-title">Operational Associations</div>
    ${sectionHtml("Associated Persons", profile.assocPersons)}
    ${sectionHtml("Associated Vehicles", profile.assocVehicles)}
    ${sectionHtml("Associated Locations", profile.assocLocations)}
  </div>`
      : ""
  }

  <div class="footer">
    <span>RunLog — Intelligence Profile</span>
    <span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span>
  </div>
</div>
${buildExportPreviewCloseBar()}
</body></html>`;
}

interface FieldHistoryItem {
  previousValue: string;
  supersededAt: number;
  supersededByCIN: string | null;
}

/** Renders any recorded "Previous" values for a field — see mergeTargetFieldDetails in server/db.ts. Nothing is ever deleted on a merge conflict, just superseded, and this is where that history surfaces. */
function PreviousNotes({
  items,
  variant = "light",
}: {
  items: FieldHistoryItem[];
  variant?: "light" | "dark";
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {items.map((h, i) => (
        <p
          key={i}
          className={`text-[11px] ${variant === "dark" ? "text-white/70" : "text-muted-foreground"}`}
        >
          <span
            className={`font-semibold uppercase tracking-wide text-[10px] mr-1.5 px-1.5 py-0.5 rounded ${
              variant === "dark"
                ? "bg-white/15 text-white"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            }`}
          >
            Previous
          </span>
          {h.previousValue}
          <span className="opacity-70">
            {" — "}
            {new Date(h.supersededAt).toLocaleDateString("en-AU")}
            {h.supersededByCIN ? ` (CIN${h.supersededByCIN})` : ""}
          </span>
        </p>
      ))}
    </div>
  );
}

function useTargetProfile(targetId: number) {
  return trpc.intelligence.targetProfile.useQuery(
    { targetId },
    { enabled: targetId > 0 }
  );
}

/**
 * Self-contained target profile document — fetches its own data by targetId and
 * renders identically wherever it's mounted (standalone page or embedded pane view).
 */
export function TargetProfileContent({ targetId }: { targetId: number }) {
  const [, navigate] = useLocation();
  const { data: profile, isLoading, error } = useTargetProfile(targetId);
  const { data: photosData } = trpc.attachment.byEntity.useQuery(
    { category: "target", targetId },
    { enabled: targetId > 0 }
  );
  const photos = (photosData ?? []) as ProfilePhoto[];
  const { data: fieldHistoryData } =
    trpc.target.registry.getFieldHistory.useQuery(
      { targetId },
      { enabled: targetId > 0 }
    );
  const fieldHistory = fieldHistoryData ?? [];
  const historyFor = (field: string) =>
    fieldHistory.filter(h => h.fieldName === field);

  // Operations this target has actually been mentioned in (via
  // mentionedSheets — the same name-matched data backing "Also Mentioned
  // In") but isn't formally linked to via the Registry's own operation
  // links. Kept separate from profile.operations for the same reason
  // mentionedSheets is kept separate from linkedSheets: "formally on this
  // operation" and "seen active during this operation" are different claims.
  const mentionedOnlyOps = profile
    ? Array.from(
        new Map(
          profile.mentionedSheets
            .filter(
              s => !profile.operations.some(op => op.id === s.operationId)
            )
            .map(s => [
              s.operationId,
              { id: s.operationId, name: s.operationName },
            ])
        ).values()
      )
    : [];

  function exportPdf() {
    if (!profile) return;
    const html = buildTargetProfileHtml(profile, photos, fieldHistory);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

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

      {profile && (
        <>
          {/* Header */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden mb-5">
            <div className="bg-gradient-to-r from-blue-900 to-blue-800 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/30">
                      <User className="w-3 h-3" /> Person — Target
                    </span>
                    {profile.isIndicesOnly && (
                      <IndicesBadge variant="on-dark" size="header" />
                    )}
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    {profile.name}
                  </h1>
                  {profile.tgt && (
                    <p className="text-sm opacity-75 mt-1">
                      TGT Alias: {profile.tgt}
                    </p>
                  )}
                  <PreviousNotes items={historyFor("name")} variant="dark" />
                  <PreviousNotes items={historyFor("tgt")} variant="dark" />
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
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border/60 bg-blue-50/50 dark:bg-blue-950/20">
              {[
                {
                  label: "Operations",
                  value: profile.operations.length + mentionedOnlyOps.length,
                },
                {
                  label: "Running Sheets",
                  value:
                    profile.linkedSheets.length +
                    profile.mentionedSheets.length,
                },
                {
                  label: "Associations",
                  value:
                    profile.assocPersons.length +
                    profile.assocVehicles.length +
                    profile.assocLocations.length,
                },
                { label: "Observations", value: profile.observationCount },
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

          <EntityPhotosSection category="target" targetId={targetId} />

          {/* Operations */}
          <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
            <SectionHeading
              label="Operations"
              count={profile.operations.length}
            />
            <div className="flex flex-wrap gap-2">
              {profile.operations.map(op => (
                <button
                  key={op.id}
                  onClick={() => navigate(`/intelligence/operation/${op.id}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors"
                >
                  <Folder className="w-3 h-3" />
                  {op.name}
                </button>
              ))}
              {mentionedOnlyOps.map(op => (
                <button
                  key={`mentioned-${op.id}`}
                  onClick={() => navigate(`/intelligence/operation/${op.id}`)}
                  title="Not formally linked — this target was named in an observation on this operation"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted/20 text-muted-foreground border border-dashed border-border hover:bg-accent/10 transition-colors"
                >
                  <Folder className="w-3 h-3" />
                  {op.name}
                  <span className="text-[9px] uppercase tracking-wide opacity-70">
                    mentioned
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Registered Details */}
          {(profile.hbf ||
            profile.v1f ||
            profile.v2f ||
            profile.extraVehicles ||
            profile.extraAddresses) &&
            (() => {
              const extraVehicleList: Array<{ full?: string; short?: string }> =
                (() => {
                  try {
                    return profile.extraVehicles
                      ? JSON.parse(profile.extraVehicles)
                      : [];
                  } catch {
                    return [];
                  }
                })();
              const extraAddressList: Array<{ full?: string; short?: string }> =
                (() => {
                  try {
                    return profile.extraAddresses
                      ? JSON.parse(profile.extraAddresses)
                      : [];
                  } catch {
                    return [];
                  }
                })();
              const totalCount =
                [profile.hbf, profile.v1f, profile.v2f].filter(Boolean).length +
                extraVehicleList.filter(
                  ev => ev.full?.trim() || ev.short?.trim()
                ).length +
                extraAddressList.filter(
                  ea => ea.full?.trim() || ea.short?.trim()
                ).length;
              return (
                <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
                  <SectionHeading
                    label="Registered Details"
                    count={totalCount}
                  />
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    {profile.hbf && (
                      <div className="flex gap-3 items-start">
                        <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">
                          Home Address
                        </span>
                        <div className="min-w-0">
                          <span className="font-mono text-xs text-foreground">
                            {formatIntelAddress(profile.hbf)}
                          </span>
                          <PreviousNotes items={historyFor("hbf")} />
                        </div>
                      </div>
                    )}
                    {extraAddressList.map((ea, idx) => {
                      const val = ea.full?.trim() || ea.short?.trim() || "";
                      if (!val) return null;
                      return (
                        <div key={idx} className="flex gap-3 items-start">
                          <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">
                            Address {idx + 2}
                          </span>
                          <span className="font-mono text-xs text-foreground">
                            {formatIntelAddress(val)}
                          </span>
                        </div>
                      );
                    })}
                    {profile.v1f && (
                      <div className="flex gap-3 items-start">
                        <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">
                          Vehicle 1
                        </span>
                        <div className="min-w-0">
                          <span className="font-mono text-xs text-foreground">
                            {formatIntelVehicle(profile.v1f)}
                          </span>
                          <PreviousNotes items={historyFor("v1f")} />
                        </div>
                      </div>
                    )}
                    {profile.v2f && (
                      <div className="flex gap-3 items-start">
                        <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">
                          Vehicle 2
                        </span>
                        <span className="font-mono text-xs text-foreground">
                          {formatIntelVehicle(profile.v2f)}
                        </span>
                      </div>
                    )}
                    {extraVehicleList.map((ev, idx) => {
                      const val = ev.full?.trim() || ev.short?.trim() || "";
                      if (!val) return null;
                      return (
                        <div key={idx} className="flex gap-3 items-start">
                          <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">
                            Vehicle {idx + 2}
                          </span>
                          <span className="font-mono text-xs text-foreground">
                            {formatIntelVehicle(val)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

          {/* Running Sheets */}
          <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
            <SectionHeading
              label="Running Sheets"
              count={profile.linkedSheets.length}
            />
            {profile.linkedSheets.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                (no linked sheets)
              </p>
            ) : (
              <div className="space-y-1">
                {profile.linkedSheets.map(s => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/sheet/${s.id}`)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent/10 transition-colors text-left"
                  >
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium text-foreground flex-1 truncate">
                      {s.title}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {s.operationName}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Also Mentioned In — sheets this target isn't formally assigned
              to (no runningSheets.targetId link) but whose observation text
              names them, e.g. as a passenger on someone else's sheet. Kept
              visually distinct from "Running Sheets" so it reads as
              "elsewhere, not yours" rather than duplicating that list. */}
          {profile.mentionedSheets.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
              <SectionHeading
                label="Also Mentioned In"
                count={profile.mentionedSheets.length}
              />
              <p className="text-xs text-muted-foreground mb-2">
                Not formally assigned to this target — named in these sheets'
                observation text.
              </p>
              <div className="space-y-1">
                {profile.mentionedSheets.map(s => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/sheet/${s.id}`)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border/60 bg-muted/10 hover:bg-accent/10 transition-colors text-left"
                  >
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium text-foreground flex-1 truncate">
                      {s.title}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {s.operationName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Registered Associates — recorded directly on this target in the
              Target Registry, a guaranteed link rather than inferred from
              observation-text co-occurrence. */}
          {profile.registryAssociates.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Registered Associates
                </p>
                <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                  {profile.registryAssociates.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {profile.registryAssociates.map(a => (
                  <button
                    key={a.id}
                    onClick={() =>
                      navigate(
                        `/intelligence/associate/${encodeURIComponent(a.name)}`
                      )
                    }
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent/10 transition-colors text-left"
                  >
                    <Users className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-xs font-medium text-foreground flex-1 truncate">
                      {a.name}
                    </span>
                    {a.isIndicesOnly && <IndicesBadge />}
                    {a.hbf && (
                      <span className="text-xs text-muted-foreground shrink-0 truncate max-w-[160px]">
                        {a.hbf}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Operational Associations */}
          {(profile.assocPersons.length > 0 ||
            profile.assocVehicles.length > 0 ||
            profile.assocLocations.length > 0) && (
            <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Operational Associations
                </p>
                <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                  {profile.assocPersons.length +
                    profile.assocVehicles.length +
                    profile.assocLocations.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3 italic">
                Entities observed in the same running sheet rows as this target
              </p>
              <Separator className="mb-3" />

              {profile.assocPersons.length > 0 && (
                <div className="mb-3">
                  <SectionHeading
                    label="Associated Persons"
                    count={profile.assocPersons.length}
                  />
                  <div className="flex flex-col gap-2">
                    {profile.assocPersons.map(p => (
                      <IntelEntityWithPhotos
                        key={p.id}
                        item={p}
                        onClick={() =>
                          navigate(
                            p.type === "target" && p.id.includes("target")
                              ? `/intelligence/target/${p.id.split("::")[1]}`
                              : `/intelligence/associate/${encodeURIComponent(p.label)}`
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {profile.assocVehicles.length > 0 && (
                <div className="mb-3">
                  <SectionHeading
                    label="Associated Vehicles"
                    count={profile.assocVehicles.length}
                  />
                  <div className="flex flex-col gap-2">
                    {profile.assocVehicles.map(v => (
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

              {profile.assocLocations.length > 0 && (
                <div className="mb-3">
                  <SectionHeading
                    label="Associated Locations"
                    count={profile.assocLocations.length}
                  />
                  <div className="flex flex-col gap-2">
                    {profile.assocLocations.map(l => (
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
        </>
      )}
    </div>
  );
}
