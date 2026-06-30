import { useState, useMemo } from "react";
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

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Intel Profile — ${esc(entity.shortForm)}</title>
<style>
  body { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.7; margin: 20mm; color: #000; }
  h1 { font-size: 15px; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 12px; }
  h2 { font-size: 12px; border-bottom: 1px solid #666; padding-bottom: 2px; margin: 16px 0 8px; text-transform: uppercase; }
  .meta { margin-bottom: 12px; }
  .meta p { margin: 2px 0; }
  .entry { margin-bottom: 8px; padding-left: 12px; border-left: 2px solid #ccc; }
  .tag { display: inline-block; border: 1px solid #999; padding: 1px 6px; border-radius: 10px; font-size: 10px; margin-right: 4px; }
  @page { margin: 20mm; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>INTELLIGENCE PROFILE — ${esc(entity.shortForm)}</h1>
<div class="meta">
  <p><strong>TYPE:</strong> ${esc(TYPE_LABELS[entity.type])}</p>
  <p><strong>GENERATED:</strong> ${new Date().toLocaleString()}</p>
  <p><strong>TOTAL APPEARANCES:</strong> ${entity.occurrences.length} observation(s) across ${sheets.length} running sheet(s)</p>
  ${firstSeen ? `<p><strong>FIRST SEEN:</strong> ${esc(firstSeen.operationName)} — ${esc(firstSeen.sheetTitle)}</p>` : ""}
  ${lastSeen && lastSeen.sheetId !== firstSeen?.sheetId ? `<p><strong>LAST SEEN:</strong> ${esc(lastSeen.operationName)} — ${esc(lastSeen.sheetTitle)}</p>` : ""}
  ${entity.occurrences[0]?.fullDescription ? `<p><strong>DESCRIPTION:</strong> ${esc(entity.occurrences[0].fullDescription)}</p>` : ""}
</div>`;

  html += `<h2>Running Sheets</h2>`;
  for (const sheet of sheets) {
    const sheetOccs = entity.occurrences.filter((o) => o.sheetId === sheet.sheetId);
    html += `<div class="entry"><p><strong>${esc(sheet.sheetTitle)}</strong> — ${esc(sheet.operationName)}</p>`;
    for (const occ of sheetOccs) {
      const t = formatTime(occ.timeMinutes);
      html += `<p>${t ? `[${esc(t)}] ` : ""}${esc(occ.observationSnippet)}</p>`;
    }
    html += `</div>`;
  }

  if (relatedVehicles.length > 0) {
    html += `<h2>Associated Vehicles</h2>`;
    for (const v of relatedVehicles) {
      const desc = v.occurrences[0]?.fullDescription ?? "";
      html += `<div class="entry"><p><strong>${esc(v.shortForm)}</strong>${desc ? ` — ${esc(desc)}` : ""} <span class="tag">×${v.occurrences.length}</span></p></div>`;
    }
  }

  if (relatedAddresses.length > 0) {
    html += `<h2>Associated Addresses</h2>`;
    for (const a of relatedAddresses) {
      const desc = a.occurrences[0]?.fullDescription ?? "";
      html += `<div class="entry"><p><strong>${esc(a.shortForm)}</strong>${desc ? ` — ${esc(desc)}` : ""} <span class="tag">×${a.occurrences.length}</span></p></div>`;
    }
  }

  if (relatedPersons.length > 0) {
    html += `<h2>Associated Persons</h2>`;
    for (const p of relatedPersons) {
      const desc = p.occurrences[0]?.fullDescription ?? "";
      html += `<div class="entry"><p><strong>${esc(p.shortForm)}</strong>${desc ? ` — ${esc(desc)}` : ""} <span class="tag">×${p.occurrences.length}</span></p></div>`;
    }
  }

  if (relatedBusinesses.length > 0) {
    html += `<h2>Associated Businesses</h2>`;
    for (const b of relatedBusinesses) {
      const desc = b.occurrences[0]?.fullDescription ?? "";
      html += `<div class="entry"><p><strong>${esc(b.shortForm)}</strong>${desc ? ` — ${esc(desc)}` : ""} <span class="tag">×${b.occurrences.length}</span></p></div>`;
    }
  }

  html += `<hr style="margin-top:20px"><p style="font-size:10px;color:#666">END OF PROFILE</p></body></html>`;
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
}: {
  entity: Entity;
  allEntities: Entity[];
  onClose: () => void;
}) {
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
            <span className="font-mono text-lg">{entity.shortForm}</span>
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

        {/* Full description */}
        {entity.occurrences[0]?.fullDescription && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Full Description (first occurrence)</p>
            <p className="text-foreground">{entity.occurrences[0].fullDescription}</p>
          </div>
        )}

        <Separator />

        {/* Running sheets detail */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Running Sheets</p>
          <div className="space-y-2">
            {sheets.map((sheet) => {
              const sheetOccs = entity.occurrences.filter((o) => o.sheetId === sheet.sheetId);
              return (
                <div key={sheet.sheetId} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-start gap-2 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">{sheet.sheetTitle}</p>
                      <p className="text-xs text-muted-foreground">{sheet.operationName}</p>
                    </div>
                  </div>
                  {sheetOccs.map((occ, i) => (
                    <p key={i} className="text-xs text-muted-foreground mt-1 pl-5">
                      {occ.timeMinutes !== null && (
                        <span className="font-mono mr-1">[{formatTime(occ.timeMinutes)}]</span>
                      )}
                      {occ.observationSnippet}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Vehicles */}
        {relatedVehicles.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Associated Vehicles</p>
            <div className="flex flex-wrap gap-2">
              {relatedVehicles.map((v) => (
                <span key={v.shortForm} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${TYPE_COLORS.vehicle}`}>
                  <Car className="w-3 h-3" />{v.shortForm}<span className="opacity-60">×{v.occurrences.length}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Addresses */}
        {relatedAddresses.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Associated Addresses</p>
            <div className="flex flex-wrap gap-2">
              {relatedAddresses.map((a) => (
                <span key={a.shortForm} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${TYPE_COLORS.address}`}>
                  <MapPin className="w-3 h-3" />{a.shortForm}<span className="opacity-60">×{a.occurrences.length}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Associated Persons */}
        {relatedPersons.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Associated Persons</p>
            <div className="flex flex-wrap gap-2">
              {relatedPersons.map((p) => (
                <span key={p.shortForm} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${TYPE_COLORS.person}`}>
                  <User className="w-3 h-3" />{p.shortForm}<span className="opacity-60">×{p.occurrences.length}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Businesses */}
        {relatedBusinesses.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Associated Businesses</p>
            <div className="flex flex-wrap gap-2">
              {relatedBusinesses.map((b) => (
                <span key={b.shortForm} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${TYPE_COLORS.business}`}>
                  <Building2 className="w-3 h-3" />{b.shortForm}<span className="opacity-60">×{b.occurrences.length}</span>
                </span>
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
                                <p className="font-mono text-xs font-medium text-foreground truncate">{entity.shortForm}</p>
                                {entity.occurrences[0]?.fullDescription && (
                                  <p className="text-xs text-muted-foreground truncate">{entity.occurrences[0].fullDescription}</p>
                                )}
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
  const [search, setSearch]         = useState("");
  const [activeTab, setActiveTab]   = useState<TabView>("operations");
  const [selected, setSelected]     = useState<Entity | null>(null);

  // Date filter state
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");

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

        {/* Search bar (shown for entity tabs, not operations) */}
        {activeTab !== "operations" && (
          <div className="relative mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search entities, descriptions, observations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
                {filteredByTab
                  .sort((a, b) => b.occurrences.length - a.occurrences.length)
                  .map((entity, idx) => {
                    const iconColor = entity.isTarget ? TYPE_COLORS.person : TYPE_COLORS[entity.type];
                    const icon = entity.type === "address" || entity.type === "business"
                      ? <MapPin className="w-3.5 h-3.5" />
                      : TYPE_ICONS[entity.type];
                    return (
                      <button
                        key={`${entity.isTarget ? "target" : entity.type}::${entity.shortForm}`}
                        onClick={() => setSelected(entity)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/10 transition-colors ${
                          idx < filteredByTab.length - 1 ? "border-b border-border/40" : ""
                        }`}
                      >
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border ${iconColor} shrink-0`}>
                          {icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-sm font-medium text-foreground truncate">{entity.shortForm}</p>
                            {entity.tgtAlias && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                                TGT: {entity.tgtAlias}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {entity.occurrences[0]?.fullDescription ?? ""}
                          </p>
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
        />
      )}
    </DashboardLayout>
  );
}
