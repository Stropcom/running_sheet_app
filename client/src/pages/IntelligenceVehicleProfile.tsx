import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileDown, User, Car, MapPin, FileText } from "lucide-react";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";

interface IntelProfileEntity { id: string; label: string; type: string; rowCount: number; sheetIds: number[]; operationIds: number[] }
interface IntelVehicleProfile {
  label: string;
  linkedTarget: { targetId: number; name: string } | null;
  linkedOperations: Array<{ id: number; name: string }>;
  linkedSheets: Array<{ id: number; title: string; operationId: number; operationName: string }>;
  assocPersons: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
}

const CHIP: Record<string, string> = {
  person:   "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
  vehicle:  "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  address:  "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  business: "bg-purple-500/10 text-purple-600 border-purple-500/30 dark:text-purple-400",
  target:   "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
};

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

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{count}</span>
    </div>
  );
}

function buildVehicleProfileHtml(profile: IntelVehicleProfile) {
  const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const BLUE_DARK = "#1e3a8a"; const BLUE_MID = "#93c5fd"; const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT = "#1e293b"; const GREY_BORDER = "#e2e8f0";
  const chipHtml = (label: string, type: string, count: number) => {
    const colors: Record<string, string> = { person: "background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd", vehicle: "background:#fef3c7;color:#d97706;border:1px solid #fcd34d", address: "background:#d1fae5;color:#059669;border:1px solid #6ee7b7", business: "background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd", target: "background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd" };
    const style = colors[type] ?? "background:#f1f5f9;color:#475569;border:1px solid #cbd5e1";
    const displayLabel = type === "vehicle"
      ? formatIntelVehicle(label)
      : (type === "address" || type === "business")
      ? formatIntelAddress(label)
      : label;
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:9999px;font-size:10px;font-weight:600;${style};margin:2px">${esc(displayLabel)} <span style="opacity:0.6">×${count}</span></span>`;
  };
  const generatedAt = new Date().toLocaleString("en-AU", { dateStyle: "long", timeStyle: "short" });
  const displayLabel = formatIntelVehicle(profile.label);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RunLog — Vehicle Profile: ${esc(displayLabel)}</title>
<style>* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; } body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:28px 32px 22px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID} !important; margin-bottom:14px; }
.entity-name { font-size:22px; font-weight:700; } .gen-time { font-size:9px; opacity:0.6; margin-top:12px; }
.stats-row { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding:16px 32px; background:${BLUE_LIGHT} !important; border-bottom:2px solid ${BLUE_MID}; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.stat-box { text-align:center; } .stat-num { font-size:20px; font-weight:700; color:${BLUE_DARK} !important; } .stat-label { font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; }
.content { padding:20px 32px; } .section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin-bottom:10px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.sub-title { font-size:9px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#64748b; margin-bottom:6px; border-bottom:1px solid ${GREY_BORDER}; padding-bottom:4px; }
.footer { margin-top:32px; padding-top:12px; border-top:1px solid ${GREY_BORDER}; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .stats-row { background:${BLUE_LIGHT} !important; } .section-title { background:${BLUE_LIGHT} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-label">RunLog Intelligence Profile — Vehicle</div>
  <div class="entity-name">${esc(displayLabel)}</div>
  ${profile.linkedTarget ? `<div style="font-size:11px;opacity:0.75;margin-top:4px">Registered to: ${esc(profile.linkedTarget.name)}</div>` : ""}
  <div class="gen-time">Generated: ${generatedAt}</div>
</div>
<div class="stats-row">
  <div class="stat-box"><div class="stat-num">${profile.linkedOperations.length}</div><div class="stat-label">Operations</div></div>
  <div class="stat-box"><div class="stat-num">${profile.linkedSheets.length}</div><div class="stat-label">Running Sheets</div></div>
  <div class="stat-box"><div class="stat-num">${profile.assocPersons.length + profile.assocLocations.length}</div><div class="stat-label">Associations</div></div>
</div>
<div class="content">
  ${profile.linkedTarget ? `<div style="margin-bottom:16px"><div class="section-title">Registered Target</div><p style="font-size:11px;font-weight:600">${esc(profile.linkedTarget.name)}</p></div>` : ""}
  ${profile.linkedSheets.length ? `<div style="margin-bottom:16px"><div class="section-title">Running Sheets</div>${profile.linkedSheets.map(s => `<p style="font-size:10px;padding:3px 0;border-bottom:1px solid ${GREY_BORDER}">${esc(s.title)} <span style="color:#64748b">— ${esc(s.operationName)}</span></p>`).join("")}</div>` : ""}
  ${profile.assocPersons.length || profile.assocLocations.length ? `<div style="margin-bottom:16px"><div class="section-title">Associations</div>
    ${profile.assocPersons.length ? `<div class="sub-title">Persons</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">${profile.assocPersons.map(p => chipHtml(p.label, p.type, p.rowCount)).join("")}</div>` : ""}
    ${profile.assocLocations.length ? `<div class="sub-title">Locations</div><div style="display:flex;flex-wrap:wrap;gap:4px">${profile.assocLocations.map(l => chipHtml(l.label, l.type, l.rowCount)).join("")}</div>` : ""}
  </div>` : ""}
  <div class="footer"><span>RunLog — Vehicle Intelligence Profile</span><span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span></div>
</div></body></html>`;
}

export default function IntelligenceVehicleProfile() {
  const [, params] = useRoute("/intelligence/vehicle/:label");
  const [, navigate] = useLocation();
  const label = decodeURIComponent(params?.label ?? "");
  const { data, isLoading, error } = trpc.intelligence.vehicleProfile.useQuery({ label }, { enabled: !!label });
  const profile = data as IntelVehicleProfile | undefined;

  function exportPdf() {
    if (!profile) return;
    const html = buildVehicleProfileHtml(profile);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <button onClick={() => navigate("/intelligence")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
          <ArrowLeft className="w-4 h-4" /> Intelligence Folder
        </button>
        {isLoading && <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>}
        {error && <div className="text-center py-16 text-muted-foreground"><p className="text-sm">Profile not found.</p></div>}
        {profile && (
          <>
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden mb-5">
              <div className="bg-gradient-to-r from-amber-900 to-amber-800 px-6 py-5 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/30 mb-3">
                      <Car className="w-3 h-3" /> Vehicle
                    </span>
                    <h1 className="text-2xl font-bold tracking-tight">{formatIntelVehicle(profile.label)}</h1>
                    {profile.linkedTarget && (
                      <p className="text-sm opacity-75 mt-1">Registered to: {profile.linkedTarget.name}</p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={exportPdf} className="bg-white/10 border-white/30 text-white hover:bg-white/20 shrink-0">
                    <FileDown className="w-4 h-4 mr-1.5" /> Export PDF
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border/60 bg-amber-50/50 dark:bg-amber-950/20">
                {[
                  { label: "Operations", value: profile.linkedOperations.length },
                  { label: "Running Sheets", value: profile.linkedSheets.length },
                  { label: "Associations", value: profile.assocPersons.length + profile.assocLocations.length },
                ].map(stat => (
                  <div key={stat.label} className="px-4 py-3 text-center">
                    <p className="text-xl font-bold text-amber-900 dark:text-amber-300">{stat.value}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {profile.linkedTarget && (
              <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
                <SectionHeading label="Registered Target" count={1} />
                <button onClick={() => navigate(`/intelligence/target/${profile.linkedTarget!.targetId}`)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent/10 transition-colors text-left">
                  <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="text-xs font-medium text-foreground">{profile.linkedTarget.name}</span>
                </button>
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

            {(profile.assocPersons.length > 0 || profile.assocLocations.length > 0) && (
              <div className="rounded-xl border border-border/60 bg-card p-4 mb-4">
                <SectionHeading label="Associations" count={profile.assocPersons.length + profile.assocLocations.length} />
                {profile.assocPersons.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground mb-1">Persons</p>
                    <div className="flex flex-wrap gap-2">
                      {profile.assocPersons.map(p => <EntityChip key={p.id} item={p} onClick={() => navigate(`/intelligence/associate/${encodeURIComponent(p.label)}`)} />)}
                    </div>
                  </div>
                )}
                {profile.assocLocations.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground mb-1">Locations</p>
                    <div className="flex flex-wrap gap-2">
                      {profile.assocLocations.map(l => <EntityChip key={l.id} item={l} onClick={() => navigate(`/intelligence/location/${encodeURIComponent(l.label)}`)} />)}
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
