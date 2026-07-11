import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, FileDown, User, Car, MapPin, Building2, FileText, Folder,
} from "lucide-react";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";

// ─── Colour palette (matches Intelligence.tsx) ─────────────────────────────
const CHIP = {
  person:   "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
  vehicle:  "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  address:  "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  business: "bg-purple-500/10 text-purple-600 border-purple-500/30 dark:text-purple-400",
  target:   "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
};

type EntityItem = { id: string; label: string; type: string; rowCount: number };

function EntityChip({ item, onClick }: { item: EntityItem; onClick?: () => void }) {
  const cls = CHIP[item.type as keyof typeof CHIP] ?? "bg-muted text-muted-foreground border-border";
  const icon = item.type === "vehicle"
    ? <Car className="w-3 h-3" />
    : item.type === "address" || item.type === "business"
    ? <MapPin className="w-3 h-3" />
    : <User className="w-3 h-3" />;
  const label = item.type === "vehicle"
    ? formatIntelVehicle(item.label)
    : (item.type === "address" || item.type === "business")
    ? formatIntelAddress(item.label)
    : item.label;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity hover:opacity-80 ${cls}`}
    >
      {icon}{label}<span className="opacity-60">×{item.rowCount}</span>
    </button>
  );
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{count}</span>
    </div>
  );
}

// ─── PDF export ────────────────────────────────────────────────────────────
function buildTargetProfileHtml(profile: NonNullable<ReturnType<typeof useTargetProfile>["data"]>) {
  const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const BLUE_DARK  = "#1e3a8a";
  const BLUE_MID   = "#93c5fd";
  const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT  = "#1e293b";
  const GREY_BORDER= "#e2e8f0";
  const GREY_LIGHT = "#f8fafc";

  const chipHtml = (label: string, type: string, count: number) => {
    const colors: Record<string, string> = {
      person:   "background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd",
      vehicle:  "background:#fef3c7;color:#d97706;border:1px solid #fcd34d",
      address:  "background:#d1fae5;color:#059669;border:1px solid #6ee7b7",
      business: "background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd",
      target:   "background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd",
    };
    const style = colors[type] ?? "background:#f1f5f9;color:#475569;border:1px solid #cbd5e1";
    const displayLabel = type === "vehicle" ? formatIntelVehicle(label) : label;
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:9999px;font-size:10px;font-weight:600;${style};margin:2px">${esc(displayLabel)} <span style="opacity:0.6">×${count}</span></span>`;
  };

  const sectionHtml = (title: string, items: EntityItem[]) => {
    if (!items.length) return "";
    return `
      <div style="margin-bottom:16px">
        <p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px;border-bottom:1px solid ${GREY_BORDER};padding-bottom:4px">${esc(title)}</p>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${items.map(i => chipHtml(i.label, i.type, i.rowCount)).join("")}</div>
      </div>`;
  };

  const generatedAt = new Date().toLocaleString("en-AU", { dateStyle: "long", timeStyle: "short" });

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
  <div class="entity-name">${esc(profile.name)}</div>
  ${profile.tgt ? `<div class="entity-sub">TGT Alias: ${esc(profile.tgt)}</div>` : ""}
  <div class="gen-time">Generated: ${generatedAt}</div>
</div>
<div class="stats-row">
  <div class="stat-box"><div class="stat-num">${profile.observationCount}</div><div class="stat-label">Observations</div></div>
  <div class="stat-box"><div class="stat-num">${profile.linkedSheets.length}</div><div class="stat-label">Running Sheets</div></div>
  <div class="stat-box"><div class="stat-num">${profile.assocPersons.length + profile.assocVehicles.length + profile.assocLocations.length}</div><div class="stat-label">Associations</div></div>
  <div class="stat-box"><div class="stat-num">${profile.operations.length}</div><div class="stat-label">Operations</div></div>
</div>
<div class="content">
  <div class="section">
    <div class="section-title">Operations</div>
    <div class="ops-list">${profile.operations.map(o => `<span class="op-badge">${esc(o.name)}</span>`).join("")}</div>
  </div>

  ${(profile.hbf || profile.v1f || profile.v2f) ? `
  <div class="section">
    <div class="section-title">Registered Details</div>
    <div class="detail-grid">
      ${profile.hbf ? `<span class="detail-label">Home Address</span><span class="detail-value">${esc(profile.hbf)}${profile.hb ? ` (${esc(profile.hb)})` : ""}</span>` : ""}
      ${profile.v1f ? `<span class="detail-label">Vehicle 1</span><span class="detail-value">${esc(profile.v1f)}${profile.v1 ? ` (${esc(profile.v1)})` : ""}</span>` : ""}
      ${profile.v2f ? `<span class="detail-label">Vehicle 2</span><span class="detail-value">${esc(profile.v2f)}${profile.v2 ? ` (${esc(profile.v2)})` : ""}</span>` : ""}
    </div>
  </div>` : ""}

  <div class="section">
    <div class="section-title">Running Sheets</div>
    <div style="border:1px solid ${GREY_BORDER};border-radius:6px;overflow:hidden">
      ${profile.linkedSheets.map(s => `<div class="sheet-item"><div class="sheet-dot"></div><span style="flex:1">${esc(s.title)}</span><span style="color:#64748b">${esc(s.operationName)}</span></div>`).join("") || `<div class="sheet-item"><span style="color:#94a3b8">No linked running sheets</span></div>`}
    </div>
  </div>

  ${profile.assocPersons.length || profile.assocVehicles.length || profile.assocLocations.length ? `
  <div class="section">
    <div class="section-title">Operational Associations</div>
    ${sectionHtml("Associated Persons", profile.assocPersons)}
    ${sectionHtml("Associated Vehicles", profile.assocVehicles)}
    ${sectionHtml("Associated Locations", profile.assocLocations)}
  </div>` : ""}

  <div class="footer">
    <span>RunLog — Intelligence Profile</span>
    <span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span>
  </div>
</div>
</body></html>`;
}

function useTargetProfile(targetId: number) {
  return trpc.intelligence.targetProfile.useQuery({ targetId }, { enabled: targetId > 0 });
}

export default function IntelligenceTargetProfile() {
  const [, params] = useRoute("/intelligence/target/:id");
  const [, navigate] = useLocation();
  const targetId = parseInt(params?.id ?? "0", 10);
  const { data: profile, isLoading, error } = useTargetProfile(targetId);

  function exportPdf() {
    if (!profile) return;
    const html = buildTargetProfileHtml(profile);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Back button */}
        <button
          onClick={() => navigate("/intelligence")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" /> Intelligence Folder
        </button>

        {isLoading && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
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
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/30 mb-3">
                      <User className="w-3 h-3" /> Person — Target
                    </span>
                    <h1 className="text-2xl font-bold tracking-tight">{profile.name}</h1>
                    {profile.tgt && <p className="text-sm opacity-75 mt-1">TGT Alias: {profile.tgt}</p>}
                  </div>
                  <Button variant="outline" size="sm" onClick={exportPdf} className="bg-white/10 border-white/30 text-white hover:bg-white/20 shrink-0">
                    <FileDown className="w-4 h-4 mr-1.5" /> Export PDF
                  </Button>
                </div>
              </div>
              {/* Stats */}
              <div className="grid grid-cols-4 divide-x divide-border/60 bg-blue-50/50 dark:bg-blue-950/20">
                {[
                  { label: "Observations", value: profile.observationCount },
                  { label: "Running Sheets", value: profile.linkedSheets.length },
                  { label: "Associations", value: profile.assocPersons.length + profile.assocVehicles.length + profile.assocLocations.length },
                  { label: "Operations", value: profile.operations.length },
                ].map(stat => (
                  <div key={stat.label} className="px-4 py-3 text-center">
                    <p className="text-xl font-bold text-blue-900 dark:text-blue-300">{stat.value}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Operations */}
            <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
              <SectionHeading label="Operations" count={profile.operations.length} />
              <div className="flex flex-wrap gap-2">
                {profile.operations.map(op => (
                  <button
                    key={op.id}
                    onClick={() => navigate(`/intelligence/operation/${op.id}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors"
                  >
                    <Folder className="w-3 h-3" />{op.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Registered Details */}
            {(profile.hbf || profile.v1f || profile.v2f) && (
              <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
                <SectionHeading label="Registered Details" count={[profile.hbf, profile.v1f, profile.v2f].filter(Boolean).length} />
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {profile.hbf && (
                    <div className="flex gap-3 items-start">
                      <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">Home Address</span>
                      <span className="font-mono text-xs text-foreground">{formatIntelAddress(profile.hbf)}</span>
                    </div>
                  )}
                  {profile.v1f && (
                    <div className="flex gap-3 items-start">
                      <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">Vehicle 1</span>
                      <span className="font-mono text-xs text-foreground">{profile.v1f}{profile.v1 ? ` (${profile.v1})` : ""}</span>
                    </div>
                  )}
                  {profile.v2f && (
                    <div className="flex gap-3 items-start">
                      <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">Vehicle 2</span>
                      <span className="font-mono text-xs text-foreground">{profile.v2f}{profile.v2 ? ` (${profile.v2})` : ""}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Running Sheets */}
            <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
              <SectionHeading label="Running Sheets" count={profile.linkedSheets.length} />
              {profile.linkedSheets.length === 0 ? (
                <p className="text-xs text-muted-foreground">(no linked sheets)</p>
              ) : (
                <div className="space-y-1">
                  {profile.linkedSheets.map(s => (
                    <button
                      key={s.id}
                      onClick={() => navigate(`/sheet/${s.id}`)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent/10 transition-colors text-left"
                    >
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium text-foreground flex-1 truncate">{s.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{s.operationName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Operational Associations */}
            {(profile.assocPersons.length > 0 || profile.assocVehicles.length > 0 || profile.assocLocations.length > 0) && (
              <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Operational Associations</p>
                  <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                    {profile.assocPersons.length + profile.assocVehicles.length + profile.assocLocations.length}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3 italic">
                  Entities observed in the same running sheet rows as this target
                </p>
                <Separator className="mb-3" />

                {profile.assocPersons.length > 0 && (
                  <div className="mb-3">
                    <SectionHeading label="Associated Persons" count={profile.assocPersons.length} />
                    <div className="flex flex-wrap gap-2">
                      {profile.assocPersons.map(p => (
                        <EntityChip
                          key={p.id} item={p}
                          onClick={() => navigate(p.type === "target" && p.id.includes("target") ? `/intelligence/target/${p.id.split("::")[1]}` : `/intelligence/associate/${encodeURIComponent(p.label)}`)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {profile.assocVehicles.length > 0 && (
                  <div className="mb-3">
                    <SectionHeading label="Associated Vehicles" count={profile.assocVehicles.length} />
                    <div className="flex flex-wrap gap-2">
                      {profile.assocVehicles.map(v => (
                        <EntityChip key={v.id} item={v} onClick={() => navigate(`/intelligence/vehicle/${encodeURIComponent(v.label)}`)} />
                      ))}
                    </div>
                  </div>
                )}

                {profile.assocLocations.length > 0 && (
                  <div className="mb-3">
                    <SectionHeading label="Associated Locations" count={profile.assocLocations.length} />
                    <div className="flex flex-wrap gap-2">
                      {profile.assocLocations.map(l => (
                        <EntityChip key={l.id} item={l} onClick={() => navigate(`/intelligence/location/${encodeURIComponent(l.label)}`)} />
                      ))}
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
