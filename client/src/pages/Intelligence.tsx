import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  User,
  Car,
  MapPin,
  Building2,
  HelpCircle,
  FileDown,
  ChevronRight,
  Calendar,
  Folder,
  FileText,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityType = "person" | "vehicle" | "address" | "business" | "unknown";
type TabView = "operations" | "targets" | "associates" | "vehicle" | "locations" | "all";

interface Occurrence {
  sheetId: number;
  sheetTitle: string;
  operationId: number;
  operationName: string;
  rowId: number;
  observationSnippet: string;
  timeMinutes: number | null;
  fullDescription: string;
}

interface Entity {
  shortForm: string;
  type: EntityType;
  isTarget?: boolean;
  tgtAlias?: string | null;
  targetId?: number | null;
  lowConfidence?: boolean;
  occurrences: Occurrence[];
}

interface OperationSummary {
  operationId: number;
  operationName: string;
  entityCount: number;
  sheetCount: number;
  entities: Entity[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<EntityType, string> = {
  person: "Person",
  vehicle: "Vehicle",
  address: "Location",
  business: "Location",
  unknown: "Other",
};

const TYPE_ICONS: Record<EntityType, React.ReactNode> = {
  person: <User className="w-3.5 h-3.5" />,
  vehicle: <Car className="w-3.5 h-3.5" />,
  address: <MapPin className="w-3.5 h-3.5" />,
  business: <Building2 className="w-3.5 h-3.5" />,
  unknown: <HelpCircle className="w-3.5 h-3.5" />,
};

const TYPE_COLORS: Record<EntityType, string> = {
  person:   "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
  vehicle:  "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  address:  "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  business: "bg-purple-500/10 text-purple-600 border-purple-500/30 dark:text-purple-400",
  unknown:  "bg-muted text-muted-foreground border-border",
};

function formatTime(minutes: number | null): string {
  if (minutes === null) return "";
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function uniqueSheets(occurrences: Occurrence[]) {
  const seen = new Set<number>();
  return occurrences.filter((o) => {
    if (seen.has(o.sheetId)) return false;
    seen.add(o.sheetId);
    return true;
  });
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

function buildProfileHtml(entity: Entity, allEntities: Entity[]) {
  const mySheetIds = new Set(entity.occurrences.map((o) => o.sheetId));

  const relatedVehicles   = allEntities.filter((e) => e.type === "vehicle"  && e.occurrences.some((o) => mySheetIds.has(o.sheetId)));
  const relatedAddresses  = allEntities.filter((e) => e.type === "address"  && e.occurrences.some((o) => mySheetIds.has(o.sheetId)));
  const relatedBusinesses = allEntities.filter((e) => e.type === "business" && e.occurrences.some((o) => mySheetIds.has(o.sheetId)));
  const relatedPersons    = allEntities.filter((e) => e.type === "person"   && e.shortForm !== entity.shortForm && e.occurrences.some((o) => mySheetIds.has(o.sheetId)));

  const sheets    = uniqueSheets(entity.occurrences);
  const firstSeen = entity.occurrences[0];
  const lastSeen  = entity.occurrences[entity.occurrences.length - 1];
  const generatedAt = new Date().toLocaleString("en-AU", { dateStyle: "long", timeStyle: "short" });

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Blue palette for RunLog Intelligence Profile
  const BLUE       = "#1d4ed8";  // primary blue
  const BLUE_DARK  = "#1e3a8a";  // dark blue for header bg
  const BLUE_LIGHT = "#dbeafe";  // very light blue for section header bg
  const BLUE_MID   = "#93c5fd";  // mid blue for accent borders
  const GREY_TEXT  = "#1e293b";  // body text (darker for readability)
  const GREY_LIGHT = "#f8fafc";  // alternate row bg
  const GREY_BORDER= "#e2e8f0";  // subtle borders
  // Aliases so the rest of the template uses the same variable names
  const TEAL       = BLUE;
  const TEAL_DARK  = BLUE_DARK;
  const TEAL_LIGHT = BLUE_LIGHT;
  const TEAL_MID   = BLUE_MID;

  const typeLabel = esc(TYPE_LABELS[entity.type]);
  // Strip leading 'a ' or 'A ' from vehicle descriptions
  const stripVehicleA = (s: string, type: string) =>
    type === "vehicle" ? s.replace(/^[aA]\s+/, "") : s;
  const entityName = esc(stripVehicleA(entity.shortForm, entity.type));

  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>RunLog Intelligence Profile — ${entityName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
    font-size: 11px;
    line-height: 1.6;
    color: ${GREY_TEXT};
    background: #fff;
  }

  /* ── Cover header ── */
  .cover-header {
    background: ${TEAL_DARK};
    color: #fff;
    padding: 28px 32px 22px;
    position: relative;
    overflow: hidden;
  }
  .cover-header::after {
    content: '';
    position: absolute;
    right: -30px; top: -30px;
    width: 160px; height: 160px;
    border-radius: 50%;
    background: rgba(255,255,255,0.06);
  }
  .cover-header::before {
    content: '';
    position: absolute;
    right: 40px; bottom: -40px;
    width: 100px; height: 100px;
    border-radius: 50%;
    background: rgba(255,255,255,0.04);
  }
  .brand-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
    opacity: 0.85;
  }
  .brand-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    background: ${TEAL_MID};
  }
  .brand-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${TEAL_MID};
  }
  .brand-divider {
    flex: 1;
    height: 1px;
    background: rgba(255,255,255,0.15);
  }
  .brand-date {
    font-size: 9px;
    color: rgba(255,255,255,0.55);
    letter-spacing: 0.05em;
  }
  .entity-type-pill {
    display: inline-block;
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3);
    color: #fff;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 10px;
    border-radius: 20px;
    margin-bottom: 8px;
  }
  .entity-name {
    font-size: 22px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.01em;
    line-height: 1.2;
    margin-bottom: 4px;
    word-break: break-word;
  }
  .entity-sub {
    font-size: 10px;
    color: rgba(255,255,255,0.65);
  }

  /* ── Stats bar ── */
  .stats-bar {
    display: flex;
    background: #172554;
    color: #fff;
    border-bottom: 3px solid ${BLUE};
  }
  .stat-item {
    flex: 1;
    padding: 12px 20px;
    border-right: 1px solid rgba(255,255,255,0.12);
    text-align: left;
  }
  .stat-item:last-child { border-right: none; }
  .stat-value {
    font-size: 26px;
    font-weight: 800;
    line-height: 1;
    margin-bottom: 4px;
    color: #ffffff;
    letter-spacing: -0.5px;
  }
  .stat-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: ${BLUE_MID};
  }

  /* ── Body ── */
  .body-content { padding: 24px 32px 32px; }

  /* ── Meta info grid ── */
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 20px;
    background: ${GREY_LIGHT};
    border: 1px solid ${GREY_BORDER};
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 22px;
  }
  .meta-item { display: flex; flex-direction: column; gap: 1px; }
  .meta-key {
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: ${TEAL_DARK};
  }
  .meta-val { font-size: 10.5px; color: ${GREY_TEXT}; font-weight: 500; }

  /* ── Section headings ── */
  .section-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 20px 0 10px;
  }
  .section-heading-bar {
    width: 4px;
    height: 16px;
    border-radius: 2px;
    background: ${TEAL};
    flex-shrink: 0;
  }
  .section-heading-text {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: ${TEAL_DARK};
  }
  .section-heading-count {
    font-size: 9px;
    background: ${TEAL_LIGHT};
    color: ${TEAL_DARK};
    border: 1px solid ${TEAL_MID};
    border-radius: 10px;
    padding: 1px 7px;
    font-weight: 600;
  }
  .section-rule {
    flex: 1;
    height: 1px;
    background: ${GREY_BORDER};
  }

  /* ── Running sheet entries ── */
  .sheet-block {
    border: 1px solid ${GREY_BORDER};
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  .sheet-header {
    background: ${TEAL_LIGHT};
    border-bottom: 1px solid ${TEAL_MID};
    padding: 8px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .sheet-title {
    font-size: 10.5px;
    font-weight: 700;
    color: ${TEAL_DARK};
  }
  .sheet-op {
    font-size: 9px;
    color: ${TEAL};
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .obs-row {
    padding: 6px 14px;
    font-size: 10px;
    border-bottom: 1px solid ${GREY_BORDER};
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .obs-row:last-child { border-bottom: none; }
  .obs-row:nth-child(even) { background: ${GREY_LIGHT}; }
  .obs-time {
    font-size: 9px;
    font-weight: 700;
    color: ${TEAL};
    white-space: nowrap;
    min-width: 36px;
    padding-top: 1px;
  }
  .obs-text { flex: 1; color: ${GREY_TEXT}; }

  /* ── Association chips ── */
  .assoc-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 4px;
  }
  .assoc-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid ${TEAL_MID};
    background: ${TEAL_LIGHT};
    color: ${TEAL_DARK};
    border-radius: 20px;
    padding: 3px 10px;
    font-size: 9.5px;
    font-weight: 600;
  }
  .chip-count {
    background: ${TEAL};
    color: #fff;
    border-radius: 10px;
    padding: 0 5px;
    font-size: 8.5px;
    font-weight: 700;
  }

  /* ── Footer ── */
  .doc-footer {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 2px solid ${TEAL_LIGHT};
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .footer-brand {
    font-size: 9px;
    font-weight: 700;
    color: ${TEAL};
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .footer-note {
    font-size: 8.5px;
    color: #9ca3af;
  }

  @page { margin: 0; size: A4; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<!-- Cover Header -->
<div class="cover-header">
  <div class="brand-row">
    <div class="brand-dot"></div>
    <span class="brand-label">RunLog Intelligence Profile</span>
    <div class="brand-divider"></div>
    <span class="brand-date">Generated: ${generatedAt}</span>
  </div>
  <div class="entity-type-pill">${typeLabel}</div>
  <div class="entity-name">${entityName}</div>
</div>

<!-- Stats Banner -->
<div class="stats-bar">
  <div class="stat-item">
    <div class="stat-value">${entity.occurrences.length}</div>
    <div class="stat-label">Observations</div>
  </div>
  <div class="stat-item">
    <div class="stat-value">${sheets.length}</div>
    <div class="stat-label">Running Sheets</div>
  </div>
  <div class="stat-item">
    <div class="stat-value">${relatedPersons.length + relatedVehicles.length + relatedAddresses.length + relatedBusinesses.length}</div>
    <div class="stat-label">Associations</div>
  </div>
  <div class="stat-item">
    <div class="stat-value">${Array.from(new Set(entity.occurrences.map(o => o.operationId))).length}</div>
    <div class="stat-label">Operations</div>
  </div>
</div>

<!-- Body -->
<div class="body-content">

<div class="meta-grid">
  <div class="meta-item"><span class="meta-key">Entity Type</span><span class="meta-val">${typeLabel}</span></div>
  <div class="meta-item"><span class="meta-key">Profile Generated</span><span class="meta-val">${generatedAt}</span></div>
</div>
`;

  // Operations section — list unique operations this entity appears in
  const uniqueOps = Array.from(
    entity.occurrences.reduce((map, o) => {
      if (!map.has(o.operationId)) map.set(o.operationId, o.operationName);
      return map;
    }, new Map<number, string>()).values()
  );
  html += `
<div class="section-heading">
  <div class="section-heading-bar"></div>
  <span class="section-heading-text">Operations</span>
  <span class="section-heading-count">${uniqueOps.length}</span>
  <div class="section-rule"></div>
</div>
<div class="assoc-list">
${uniqueOps.map(op => `<span class="assoc-chip">${esc(op)}</span>`).join("\n")}
</div>
`;

  // Running sheets section — show sheet titles only (no observation rows)
  html += `
<div class="section-heading">
  <div class="section-heading-bar"></div>
  <span class="section-heading-text">Running Sheets</span>
  <span class="section-heading-count">${sheets.length}</span>
  <div class="section-rule"></div>
</div>
<div class="assoc-list">
${sheets.map(sheet => `<span class="assoc-chip">${esc(sheet.sheetTitle)}</span>`).join("\n")}
</div>
`;

  if (relatedVehicles.length > 0) {
    html += `
<div class="section-heading">
  <div class="section-heading-bar"></div>
  <span class="section-heading-text">Associated Vehicles</span>
  <span class="section-heading-count">${relatedVehicles.length}</span>
  <div class="section-rule"></div>
</div>
<div class="assoc-list">`;
    for (const v of relatedVehicles) {
      html += `<span class="assoc-chip">${esc(stripVehicleA(v.shortForm, v.type))}<span class="chip-count">×${v.occurrences.length}</span></span>`;
    }
    html += `</div>`;
  }

  if (relatedAddresses.length > 0) {
    html += `
<div class="section-heading">
  <div class="section-heading-bar"></div>
  <span class="section-heading-text">Associated Addresses</span>
  <span class="section-heading-count">${relatedAddresses.length}</span>
  <div class="section-rule"></div>
</div>
<div class="assoc-list">`;
    for (const a of relatedAddresses) {
      html += `<span class="assoc-chip">${esc(a.shortForm)}<span class="chip-count">×${a.occurrences.length}</span></span>`;
    }
    html += `</div>`;
  }

  if (relatedPersons.length > 0) {
    html += `
<div class="section-heading">
  <div class="section-heading-bar"></div>
  <span class="section-heading-text">Associated Persons</span>
  <span class="section-heading-count">${relatedPersons.length}</span>
  <div class="section-rule"></div>
</div>
<div class="assoc-list">`;
    for (const p of relatedPersons) {
      html += `<span class="assoc-chip">${esc(p.shortForm)}<span class="chip-count">×${p.occurrences.length}</span></span>`;
    }
    html += `</div>`;
  }

  if (relatedBusinesses.length > 0) {
    html += `
<div class="section-heading">
  <div class="section-heading-bar"></div>
  <span class="section-heading-text">Associated Businesses</span>
  <span class="section-heading-count">${relatedBusinesses.length}</span>
  <div class="section-rule"></div>
</div>
<div class="assoc-list">`;
    for (const b of relatedBusinesses) {
      html += `<span class="assoc-chip">${esc(b.shortForm)}<span class="chip-count">×${b.occurrences.length}</span></span>`;
    }
    html += `</div>`;
  }

  html += `
<div class="doc-footer">
  <span class="footer-brand">RunLog · Intelligence Profile</span>
  <span class="footer-note">SENSITIVE — FOR AUTHORISED USE ONLY · ${generatedAt}</span>
</div>

</div><!-- /body-content -->
</body></html>`;
  return html;
}

function printProfilePdf(entity: Entity, allEntities: Entity[]) {
  const html = buildProfileHtml(entity, allEntities);
  const blob = new Blob([html], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank");
  if (win) {
    win.onload = () => {
      win.print();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
  }
}

// ─── Profile Dialog ───────────────────────────────────────────────────────────

function ProfileDialog({
  entity,
  allEntities,
  onClose,
  onNavigate,
}: {
  entity: Entity;
  allEntities: Entity[];
  onClose: () => void;
  onNavigate: (e: Entity) => void;
}) {
  const [, navigate] = useLocation();
  const mySheetIds = useMemo(() => new Set(entity.occurrences.map((o) => o.sheetId)), [entity]);

  const relatedVehicles   = useMemo(() => allEntities.filter((e) => e.type === "vehicle"  && e.occurrences.some((o) => mySheetIds.has(o.sheetId))), [allEntities, mySheetIds]);
  const relatedAddresses  = useMemo(() => allEntities.filter((e) => e.type === "address"  && e.occurrences.some((o) => mySheetIds.has(o.sheetId))), [allEntities, mySheetIds]);
  const relatedBusinesses = useMemo(() => allEntities.filter((e) => e.type === "business" && e.occurrences.some((o) => mySheetIds.has(o.sheetId))), [allEntities, mySheetIds]);
  const relatedPersons    = useMemo(() => allEntities.filter((e) => e.type === "person"   && e.shortForm !== entity.shortForm && e.occurrences.some((o) => mySheetIds.has(o.sheetId))), [allEntities, mySheetIds, entity.shortForm]);

  const sheets = useMemo(() => uniqueSheets(entity.occurrences), [entity]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLORS[entity.type]}`}>
              {TYPE_ICONS[entity.type]}
              {TYPE_LABELS[entity.type]}
            </span>
            <span className="font-mono text-lg">{entity.type === "vehicle" ? entity.shortForm.replace(/^[aA]\s+/, "") : entity.shortForm}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Appearances</p>
            <p className="font-semibold text-foreground">{entity.occurrences.length} observation{entity.occurrences.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Running Sheets</p>
            <p className="font-semibold text-foreground">{sheets.length} sheet{sheets.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Running sheets — clickable titles only, moved up */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Running Sheets</p>
          <div className="space-y-1">
            {sheets.map((sheet) => (
              <button
                key={sheet.sheetId}
                onClick={() => { onClose(); setTimeout(() => navigate(`/sheet/${sheet.sheetId}`), 0); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent/10 transition-colors text-left"
              >
                <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-foreground break-words min-w-0 flex-1">{sheet.sheetTitle}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-auto" />
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Vehicles — clickable pills */}
        {relatedVehicles.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Associated Vehicles</p>
            <div className="flex flex-wrap gap-2">
              {relatedVehicles.map((v) => (
                <button
                  key={v.shortForm}
                  onClick={() => onNavigate(v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${TYPE_COLORS.vehicle}`}
                >
                  <Car className="w-3 h-3" />{v.shortForm.replace(/^[aA]\s+/, "")}<span className="opacity-60">×{v.occurrences.length}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Addresses — clickable pills */}
        {relatedAddresses.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Associated Addresses</p>
            <div className="flex flex-wrap gap-2">
              {relatedAddresses.map((a) => (
                <button
                  key={a.shortForm}
                  onClick={() => onNavigate(a)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${TYPE_COLORS.address}`}
                >
                  <MapPin className="w-3 h-3" />{a.shortForm}<span className="opacity-60">×{a.occurrences.length}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Associated Persons — clickable pills */}
        {relatedPersons.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Associated Persons</p>
            <div className="flex flex-wrap gap-2">
              {relatedPersons.map((p) => (
                <button
                  key={p.shortForm}
                  onClick={() => onNavigate(p)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${TYPE_COLORS.person}`}
                >
                  <User className="w-3 h-3" />{p.shortForm}<span className="opacity-60">×{p.occurrences.length}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Businesses — clickable pills */}
        {relatedBusinesses.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Associated Businesses</p>
            <div className="flex flex-wrap gap-2">
              {relatedBusinesses.map((b) => (
                <button
                  key={b.shortForm}
                  onClick={() => onNavigate(b)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${TYPE_COLORS.business}`}
                >
                  <Building2 className="w-3 h-3" />{b.shortForm}<span className="opacity-60">×{b.occurrences.length}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Single export button at the bottom */}
        <Button onClick={() => printProfilePdf(entity, allEntities)} className="w-full gap-2">
          <FileDown className="w-4 h-4" />
          Export Profile to PDF
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ─── Operations Tab ───────────────────────────────────────────────────────────

function OperationsTab({
  entities,
  search,
}: {
  entities: Entity[];
  search: string;
}) {
  const [expandedOpId, setExpandedOpId] = useState<number | null>(null);
  const [, navigate] = useLocation();

  const operations = useMemo<OperationSummary[]>(() => {
    const opMap = new Map<number, OperationSummary>();
    for (const entity of entities) {
      for (const occ of entity.occurrences) {
        if (!opMap.has(occ.operationId)) {
          opMap.set(occ.operationId, {
            operationId: occ.operationId,
            operationName: occ.operationName,
            entityCount: 0,
            sheetCount: 0,
            entities: [],
          });
        }
        const op = opMap.get(occ.operationId)!;
        // Add entity to this op if not already present
        if (!op.entities.find((e) => e.type === entity.type && e.shortForm === entity.shortForm)) {
          op.entities.push(entity);
          op.entityCount += 1;
        }
      }
    }
    // Compute unique sheet count per operation
    const opList: OperationSummary[] = [];
    opMap.forEach((op) => {
      const sheetIds = new Set<number>();
      for (const e of op.entities) {
        for (const occ of e.occurrences) {
          if (occ.operationId === op.operationId) sheetIds.add(occ.sheetId);
        }
      }
      op.sheetCount = sheetIds.size;
      opList.push(op);
    });
    return opList.sort((a, b) => a.operationName.localeCompare(b.operationName));
  }, [entities]);

  const filtered = useMemo(() => {
    if (!search) return operations;
    const q = search.toLowerCase();
    return operations.filter(
      (op) =>
        op.operationName.toLowerCase().includes(q) ||
        op.entities.some((e) => e.shortForm.toLowerCase().includes(q))
    );
  }, [operations, search]);

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Folder className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No operations found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.map((op) => {
        const isExpanded = expandedOpId === op.operationId;
        // Group entities by type for display
        const byType: Partial<Record<EntityType, Entity[]>> = {};
        for (const e of op.entities) {
          if (!byType[e.type]) byType[e.type] = [];
          byType[e.type]!.push(e);
        }

        return (
          <div key={op.operationId} className="rounded-xl border border-border/60 overflow-hidden bg-card/50">
            <button
              onClick={() => setExpandedOpId(isExpanded ? null : op.operationId)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/10 transition-colors"
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border bg-muted/30 text-muted-foreground shrink-0">
                <Folder className="w-3.5 h-3.5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{op.operationName}</p>
                <p className="text-xs text-muted-foreground">
                  {op.entityCount} {op.entityCount === 1 ? "entity" : "entities"} · {op.sheetCount} {op.sheetCount === 1 ? "sheet" : "sheets"}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/intelligence/operation/${op.operationId}`); }}
                title="View Operation Profile"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors shrink-0"
              >
                <FileText className="w-3 h-3" />
                <span className="hidden sm:inline">Profile</span>
              </button>
              <ChevronRight
                className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
              />
            </button>

            {isExpanded && (
              <div className="border-t border-border/40 px-4 pb-4 pt-3 space-y-3">
                {(["person", "vehicle", "address", "business", "unknown"] as EntityType[]).map((type) => {
                  const group = byType[type];
                  if (!group || group.length === 0) return null;
                  return (
                    <div key={type}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLORS[type]}`}>
                          {TYPE_ICONS[type]}
                          {TYPE_LABELS[type]}s
                        </span>
                        <span className="text-xs text-muted-foreground">{group.length}</span>
                      </div>
                      <div className="rounded-lg border border-border/40 overflow-hidden">
                        {group.map((entity, idx) => {
                          const opOccs = entity.occurrences.filter((o) => o.operationId === op.operationId);
                          const opSheets = uniqueSheets(opOccs);
                          return (
                            <div
                              key={`${entity.type}::${entity.shortForm}`}
                              className={`flex items-center gap-3 px-3 py-2.5 ${idx < group.length - 1 ? "border-b border-border/30" : ""}`}
                            >
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border ${TYPE_COLORS[type]} shrink-0`}>
                                {TYPE_ICONS[type]}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="font-mono text-xs font-medium text-foreground truncate">{entity.type === "vehicle" ? entity.shortForm.replace(/^[aA]\s+/, "") : entity.shortForm}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs font-medium text-foreground">{opOccs.length}×</p>
                                <p className="text-xs text-muted-foreground">{opSheets.length} sheet{opSheets.length !== 1 ? "s" : ""}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Date filter helpers ──────────────────────────────────────────────────────

type DatePreset = "all" | "1w" | "1m" | "3m" | "6m" | "custom";

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: "all",    label: "All time" },
  { value: "1w",     label: "1 week" },
  { value: "1m",     label: "1 month" },
  { value: "3m",     label: "3 months" },
  { value: "6m",     label: "6 months" },
  { value: "custom", label: "Custom range" },
];

function presetToRange(preset: DatePreset, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (preset === "all") return { from: null, to: null };
  if (preset === "1w") { const d = new Date(now); d.setDate(d.getDate() - 7); return { from: d, to: now }; }
  if (preset === "1m") { const d = new Date(now); d.setMonth(d.getMonth() - 1); return { from: d, to: now }; }
  if (preset === "3m") { const d = new Date(now); d.setMonth(d.getMonth() - 3); return { from: d, to: now }; }
  if (preset === "6m") { const d = new Date(now); d.setMonth(d.getMonth() - 6); return { from: d, to: now }; }
  if (preset === "custom") {
    return {
      from: customFrom ? new Date(customFrom) : null,
      to:   customTo   ? new Date(customTo + "T23:59:59") : null,
    };
  }
  return { from: null, to: null };
}

// ─── Tab nav config ───────────────────────────────────────────────────────────

const TAB_OPTIONS: Array<{ value: TabView; label: string; icon: React.ReactNode }> = [
  { value: "operations", label: "Operations", icon: <Folder className="w-3.5 h-3.5" /> },
  { value: "targets",    label: "Targets",    icon: <User className="w-3.5 h-3.5" /> },
  { value: "associates", label: "Associates", icon: <User className="w-3.5 h-3.5" /> },
  { value: "vehicle",    label: "Vehicles",   icon: <Car className="w-3.5 h-3.5" /> },
  { value: "locations",  label: "Locations",  icon: <MapPin className="w-3.5 h-3.5" /> },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const { data: entities, isLoading } = trpc.intelligence.getEntities.useQuery();
  const [, navigate] = useLocation();
  const [search, setSearch]         = useState("");
  const [activeTab, setActiveTab]   = useState<TabView>("operations");
  const [selected, setSelected]     = useState<Entity | null>(null);

  // Date filter state
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");

  // Sort order
  type SortOrder = "frequency" | "az" | "za" | "recent" | "oldest";
  const [sortOrder, setSortOrder] = useState<SortOrder>("frequency");

  const dateRange = useMemo(
    () => presetToRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo]
  );

  // Apply date + search filtering to entities
  const filteredEntities = useMemo(() => {
    if (!entities) return [];
    return entities
      .map((e) => {
        let occs = e.occurrences;
        if (dateRange.from || dateRange.to) {
          occs = occs.filter((o) => {
            const match = o.sheetTitle.match(/^(\d{4})(\d{2})(\d{2})/);
            if (!match) return true;
            const sheetDate = new Date(`${match[1]}-${match[2]}-${match[3]}`);
            if (dateRange.from && sheetDate < dateRange.from) return false;
            if (dateRange.to   && sheetDate > dateRange.to)   return false;
            return true;
          });
        }
        return { ...e, occurrences: occs };
      })
      .filter((e) => e.occurrences.length > 0);
  }, [entities, dateRange]);

  // Sort helper: registry entities (all occurrences from operationId=0 / operationName="(Registry)") pinned to bottom
  const sortedByTab = useMemo(() => {
    const isRegistryOnly = (e: Entity) =>
      e.occurrences.length > 0 && e.occurrences.every((o) => o.operationId === 0 || o.operationName === "(Registry)");
    const getLatestTime = (e: Entity) =>
      Math.max(...e.occurrences.map((o) => o.timeMinutes ?? 0));
    const getLatestSheet = (e: Entity) =>
      e.occurrences.reduce((best, o) => (o.sheetTitle > best ? o.sheetTitle : best), "");

    return (list: Entity[]) => {
      const registry = list.filter(isRegistryOnly);
      const normal   = list.filter((e) => !isRegistryOnly(e));
      const sorted = [...normal].sort((a, b) => {
        if (sortOrder === "az")      return a.shortForm.localeCompare(b.shortForm);
        if (sortOrder === "za")      return b.shortForm.localeCompare(a.shortForm);
        if (sortOrder === "recent")  return getLatestSheet(b).localeCompare(getLatestSheet(a)) || getLatestTime(b) - getLatestTime(a);
        if (sortOrder === "oldest")  return getLatestSheet(a).localeCompare(getLatestSheet(b)) || getLatestTime(a) - getLatestTime(b);
        // default: frequency
        return b.occurrences.length - a.occurrences.length;
      });
      // Registry entries sorted A-Z within themselves, always at bottom
      const sortedRegistry = [...registry].sort((a, b) => a.shortForm.localeCompare(b.shortForm));
      return [...sorted, ...sortedRegistry];
    };
  }, [sortOrder]);

  // For entity-type tabs: also apply search + type filter
  const filteredByTab = useMemo(() => {
    if (activeTab === "operations") return filteredEntities;
    const q = search.toLowerCase();
    const matchesSearch = (e: Entity) =>
      !search ||
      e.shortForm.toLowerCase().includes(q) ||
      (e.tgtAlias ?? "").toLowerCase().includes(q) ||
      e.occurrences.some((o) =>
        o.observationSnippet.toLowerCase().includes(q) ||
        o.fullDescription.toLowerCase().includes(q)
      );
    if (activeTab === "targets")    return filteredEntities.filter((e) => e.isTarget === true && matchesSearch(e));
    if (activeTab === "associates") return filteredEntities.filter((e) => e.type === "person" && !e.isTarget && matchesSearch(e));
    if (activeTab === "vehicle")    return filteredEntities.filter((e) => e.type === "vehicle" && matchesSearch(e));
    if (activeTab === "locations")  return filteredEntities.filter((e) => (e.type === "address" || e.type === "business") && matchesSearch(e));
    return filteredEntities.filter(matchesSearch);
  }, [filteredEntities, activeTab, search]);

  // Counts per tab for badges
  const tabCounts = useMemo(() => {
    const counts: Partial<Record<TabView, number>> = {};
    if (!filteredEntities) return counts;
    const opIds = new Set<number>();
    for (const e of filteredEntities) for (const o of e.occurrences) opIds.add(o.operationId);
    counts["operations"]  = opIds.size;
    counts["targets"]     = filteredEntities.filter((e) => e.isTarget === true).length;
    counts["associates"]  = filteredEntities.filter((e) => e.type === "person" && !e.isTarget).length;
    counts["vehicle"]     = filteredEntities.filter((e) => e.type === "vehicle").length;
    counts["locations"]   = filteredEntities.filter((e) => e.type === "address" || e.type === "business").length;
    return counts;
  }, [filteredEntities]);

  const totalEntities = entities?.length ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Intelligence Folder</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : `${totalEntities} entities extracted from observation records`}
            </p>
          </div>
        </div>

        {/* Date filter */}
        <div className="mb-4">
          <div className="flex gap-1.5 flex-wrap mb-2">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setDatePreset(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  datePreset === p.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted/70"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {datePreset === "custom" && (
            <div className="flex gap-2 items-center mt-2">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="border border-border/60 rounded-md px-2 py-1 text-xs bg-background text-foreground"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="border border-border/60 rounded-md px-2 py-1 text-xs bg-background text-foreground"
              />
            </div>
          )}
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 flex-wrap mb-5 border-b border-border/40 pb-0">
          {TAB_OPTIONS.map((tab) => {
            const count = tabCounts[tab.value];
            const isActive = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {tab.icon}
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search bar + sort control (shown for entity tabs, not operations) */}
        {activeTab !== "operations" && (
          <div className="space-y-2 mb-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search entities, descriptions, observations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground mr-1">Sort:</span>
              {([
                { value: "frequency", label: "Most frequent" },
                { value: "az",        label: "A → Z" },
                { value: "za",        label: "Z → A" },
                { value: "recent",    label: "Most recent" },
                { value: "oldest",    label: "Oldest first" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSortOrder(opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    sortOrder === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted/70"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* Operations tab content */}
        {!isLoading && activeTab === "operations" && (
          <OperationsTab entities={filteredEntities} search={search} />
        )}

        {/* Search bar for operations tab (inline, above results) */}
        {!isLoading && activeTab === "operations" && (
          <div className="relative mt-4 hidden">
            {/* search is handled inside OperationsTab via prop */}
          </div>
        )}

        {/* Entity type tab content */}
        {!isLoading && activeTab !== "operations" && (
          <>
            {filteredByTab.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {search || datePreset !== "all"
                    ? "No entities match your filters."
                    : "No entities found. Entities are extracted automatically from observation text using the (ShortForm) convention."}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 overflow-hidden bg-card/50">
                {sortedByTab(filteredByTab)
                  .map((entity, idx) => {
                    const iconColor = entity.isTarget ? TYPE_COLORS.person : TYPE_COLORS[entity.type];
                    const icon = entity.type === "address" || entity.type === "business"
                      ? <MapPin className="w-3.5 h-3.5" />
                      : TYPE_ICONS[entity.type];
                    // Strip leading 'a ' or 'A ' from vehicle display names
                    const displayShortForm = entity.type === "vehicle"
                      ? entity.shortForm.replace(/^[aA]\s+/, "")
                      : entity.shortForm;
                    return (
                      <button
                        key={`${entity.isTarget ? "target" : entity.type}::${entity.shortForm}`}
                        data-entity={entity.shortForm}
                        onClick={() => {
                          if (entity.isTarget && entity.targetId) {
                            navigate(`/intelligence/target/${entity.targetId}`);
                          } else if (entity.type === "vehicle") {
                            navigate(`/intelligence/vehicle/${encodeURIComponent(entity.shortForm)}`);
                          } else if (entity.type === "address" || entity.type === "business") {
                            navigate(`/intelligence/location/${encodeURIComponent(entity.shortForm)}`);
                          } else {
                            navigate(`/intelligence/associate/${encodeURIComponent(entity.shortForm)}`);
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/10 transition-colors ${
                          idx < filteredByTab.length - 1 ? "border-b border-border/40" : ""
                        }`}
                      >
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border ${iconColor} shrink-0`}>
                          {icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-sm font-medium text-foreground truncate">{displayShortForm}</p>
                            {entity.tgtAlias && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                                TGT: {entity.tgtAlias}
                              </span>
                            )}
                            {entity.lowConfidence && (
                              <span title="Low confidence — classification may need review" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-400/15 text-yellow-600 dark:text-yellow-400 border border-yellow-400/30 shrink-0">
                                ?
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-medium text-foreground">{entity.occurrences.length}×</p>
                          <p className="text-xs text-muted-foreground">{uniqueSheets(entity.occurrences).length} sheet{uniqueSheets(entity.occurrences).length !== 1 ? "s" : ""}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Profile dialog */}
      {selected && entities && (
        <ProfileDialog
          entity={selected}
          allEntities={entities}
          onClose={() => setSelected(null)}
          onNavigate={(e) => setSelected(e)}
        />
      )}
    </DashboardLayout>
  );
}
