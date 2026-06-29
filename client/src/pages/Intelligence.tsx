import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
  FileText,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityType = "person" | "vehicle" | "address" | "business" | "unknown";

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
  occurrences: Occurrence[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<EntityType, string> = {
  person: "Person",
  vehicle: "Vehicle",
  address: "Address",
  business: "Business",
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
  person: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
  vehicle: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  address: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  business: "bg-purple-500/10 text-purple-600 border-purple-500/30 dark:text-purple-400",
  unknown: "bg-muted text-muted-foreground border-border",
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

function buildProfilePdf(
  entity: Entity,
  allEntities: Entity[],
  sections: Record<string, boolean>
) {
  // Find related entities from the same sheets
  const mySheetIds = new Set(entity.occurrences.map((o) => o.sheetId));

  const relatedVehicles = allEntities.filter(
    (e) => e.type === "vehicle" && e.occurrences.some((o) => mySheetIds.has(o.sheetId))
  );
  const relatedAddresses = allEntities.filter(
    (e) => e.type === "address" && e.occurrences.some((o) => mySheetIds.has(o.sheetId))
  );
  const relatedBusinesses = allEntities.filter(
    (e) => e.type === "business" && e.occurrences.some((o) => mySheetIds.has(o.sheetId))
  );
  const relatedPersons = allEntities.filter(
    (e) =>
      e.type === "person" &&
      e.shortForm !== entity.shortForm &&
      e.occurrences.some((o) => mySheetIds.has(o.sheetId))
  );

  const sheets = uniqueSheets(entity.occurrences);
  const firstSeen = entity.occurrences[0];
  const lastSeen = entity.occurrences[entity.occurrences.length - 1];

  const lines: string[] = [];

  // Header
  lines.push("INTELLIGENCE PROFILE");
  lines.push("=".repeat(60));
  lines.push(`SUBJECT: ${entity.shortForm}`);
  lines.push(`TYPE: ${TYPE_LABELS[entity.type]}`);
  lines.push(`GENERATED: ${new Date().toLocaleString()}`);
  lines.push(`TOTAL APPEARANCES: ${entity.occurrences.length} observation(s) across ${sheets.length} running sheet(s)`);
  if (firstSeen) lines.push(`FIRST SEEN: ${firstSeen.operationName} — ${firstSeen.sheetTitle}`);
  if (lastSeen && lastSeen.sheetId !== firstSeen?.sheetId) lines.push(`LAST SEEN: ${lastSeen.operationName} — ${lastSeen.sheetTitle}`);
  lines.push("");

  // Running Sheets
  if (sections.sheets) {
    lines.push("RUNNING SHEETS");
    lines.push("-".repeat(60));
    for (const sheet of sheets) {
      const sheetOccurrences = entity.occurrences.filter((o) => o.sheetId === sheet.sheetId);
      lines.push(`  Operation: ${sheet.operationName}`);
      lines.push(`  Sheet: ${sheet.sheetTitle}`);
      for (const occ of sheetOccurrences) {
        const t = formatTime(occ.timeMinutes);
        lines.push(`    ${t ? `[${t}] ` : ""}${occ.observationSnippet}`);
      }
      lines.push("");
    }
  }

  // Vehicles
  if (sections.vehicles && relatedVehicles.length > 0) {
    lines.push("ASSOCIATED VEHICLES");
    lines.push("-".repeat(60));
    for (const v of relatedVehicles) {
      const desc = v.occurrences[0]?.fullDescription ?? "";
      lines.push(`  ${v.shortForm}${desc ? ` — ${desc}` : ""}`);
      lines.push(`  Appearances: ${v.occurrences.length}`);
      lines.push("");
    }
  }

  // Addresses
  if (sections.addresses && relatedAddresses.length > 0) {
    lines.push("ASSOCIATED ADDRESSES");
    lines.push("-".repeat(60));
    for (const a of relatedAddresses) {
      const desc = a.occurrences[0]?.fullDescription ?? "";
      lines.push(`  ${a.shortForm}${desc ? ` — ${desc}` : ""}`);
      lines.push(`  Appearances: ${a.occurrences.length}`);
      lines.push("");
    }
  }

  // Associated Persons
  if (sections.persons && relatedPersons.length > 0) {
    lines.push("ASSOCIATED PERSONS");
    lines.push("-".repeat(60));
    for (const p of relatedPersons) {
      const desc = p.occurrences[0]?.fullDescription ?? "";
      lines.push(`  ${p.shortForm}${desc ? ` — ${desc}` : ""}`);
      lines.push(`  Appearances: ${p.occurrences.length}`);
      lines.push("");
    }
  }

  // Businesses
  if (sections.businesses && relatedBusinesses.length > 0) {
    lines.push("ASSOCIATED BUSINESSES");
    lines.push("-".repeat(60));
    for (const b of relatedBusinesses) {
      const desc = b.occurrences[0]?.fullDescription ?? "";
      lines.push(`  ${b.shortForm}${desc ? ` — ${desc}` : ""}`);
      lines.push(`  Appearances: ${b.occurrences.length}`);
      lines.push("");
    }
  }

  lines.push("=".repeat(60));
  lines.push("END OF PROFILE");

  return lines.join("\n");
}

function downloadTextAsPdf(text: string, filename: string) {
  // Build a simple HTML page and print it as PDF via the browser's print dialog
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${filename}</title>
<style>
  body { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.6; margin: 20mm; color: #000; }
  pre { white-space: pre-wrap; word-wrap: break-word; }
  @page { margin: 20mm; }
</style>
</head>
<body><pre>${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body>
</html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
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
  const [sections, setSections] = useState({
    sheets: true,
    vehicles: true,
    addresses: true,
    persons: true,
    businesses: true,
  });

  const mySheetIds = useMemo(
    () => new Set(entity.occurrences.map((o) => o.sheetId)),
    [entity]
  );

  const relatedVehicles = useMemo(
    () => allEntities.filter((e) => e.type === "vehicle" && e.occurrences.some((o) => mySheetIds.has(o.sheetId))),
    [allEntities, mySheetIds]
  );
  const relatedAddresses = useMemo(
    () => allEntities.filter((e) => e.type === "address" && e.occurrences.some((o) => mySheetIds.has(o.sheetId))),
    [allEntities, mySheetIds]
  );
  const relatedBusinesses = useMemo(
    () => allEntities.filter((e) => e.type === "business" && e.occurrences.some((o) => mySheetIds.has(o.sheetId))),
    [allEntities, mySheetIds]
  );
  const relatedPersons = useMemo(
    () => allEntities.filter((e) => e.type === "person" && e.shortForm !== entity.shortForm && e.occurrences.some((o) => mySheetIds.has(o.sheetId))),
    [allEntities, mySheetIds, entity.shortForm]
  );

  const sheets = useMemo(() => uniqueSheets(entity.occurrences), [entity]);

  const toggle = (key: keyof typeof sections) =>
    setSections((s) => ({ ...s, [key]: !s[key] }));

  const handleExport = () => {
    const text = buildProfilePdf(entity, allEntities, sections);
    downloadTextAsPdf(text, `Intel_${entity.shortForm.replace(/\s+/g, "_")}.pdf`);
  };

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

        {/* Summary */}
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

        {/* First full description */}
        {entity.occurrences[0]?.fullDescription && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Full Description (first occurrence)</p>
            <p className="text-foreground">{entity.occurrences[0].fullDescription}</p>
          </div>
        )}

        <Separator />

        {/* Export section selector */}
        <div>
          <p className="text-sm font-medium text-foreground mb-3">Select sections to include in PDF export:</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "sheets" as const, label: "Running Sheets", icon: <FileText className="w-3.5 h-3.5" />, count: sheets.length },
              { key: "vehicles" as const, label: "Vehicles", icon: <Car className="w-3.5 h-3.5" />, count: relatedVehicles.length },
              { key: "addresses" as const, label: "Addresses", icon: <MapPin className="w-3.5 h-3.5" />, count: relatedAddresses.length },
              { key: "persons" as const, label: "Associated Persons", icon: <User className="w-3.5 h-3.5" />, count: relatedPersons.length },
              { key: "businesses" as const, label: "Businesses", icon: <Building2 className="w-3.5 h-3.5" />, count: relatedBusinesses.length },
            ].map(({ key, label, icon, count }) => (
              <label
                key={key}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  sections[key]
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60 bg-muted/20 opacity-60"
                }`}
              >
                <Checkbox
                  checked={sections[key]}
                  onCheckedChange={() => toggle(key)}
                />
                <span className="text-muted-foreground">{icon}</span>
                <span className="text-sm text-foreground flex-1">{label}</span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </label>
            ))}
          </div>
        </div>

        <Button onClick={handleExport} className="w-full gap-2">
          <FileDown className="w-4 h-4" />
          Export Profile to PDF
        </Button>

        <Separator />

        {/* Running sheets detail */}
        {sections.sheets && (
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
        )}

        {/* Vehicles */}
        {sections.vehicles && relatedVehicles.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Associated Vehicles</p>
            <div className="flex flex-wrap gap-2">
              {relatedVehicles.map((v) => (
                <span key={v.shortForm} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${TYPE_COLORS.vehicle}`}>
                  <Car className="w-3 h-3" />
                  {v.shortForm}
                  <span className="opacity-60">×{v.occurrences.length}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Addresses */}
        {sections.addresses && relatedAddresses.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Associated Addresses</p>
            <div className="flex flex-wrap gap-2">
              {relatedAddresses.map((a) => (
                <span key={a.shortForm} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${TYPE_COLORS.address}`}>
                  <MapPin className="w-3 h-3" />
                  {a.shortForm}
                  <span className="opacity-60">×{a.occurrences.length}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Associated Persons */}
        {sections.persons && relatedPersons.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Associated Persons</p>
            <div className="flex flex-wrap gap-2">
              {relatedPersons.map((p) => (
                <span key={p.shortForm} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${TYPE_COLORS.person}`}>
                  <User className="w-3 h-3" />
                  {p.shortForm}
                  <span className="opacity-60">×{p.occurrences.length}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Businesses */}
        {sections.businesses && relatedBusinesses.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Associated Businesses</p>
            <div className="flex flex-wrap gap-2">
              {relatedBusinesses.map((b) => (
                <span key={b.shortForm} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${TYPE_COLORS.business}`}>
                  <Building2 className="w-3 h-3" />
                  {b.shortForm}
                  <span className="opacity-60">×{b.occurrences.length}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TYPE_FILTER_OPTIONS: Array<{ value: EntityType | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "person", label: "Persons" },
  { value: "vehicle", label: "Vehicles" },
  { value: "address", label: "Addresses" },
  { value: "business", label: "Businesses" },
];

export default function IntelligencePage() {
  const { data: entities, isLoading } = trpc.intelligence.getEntities.useQuery();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntityType | "all">("all");
  const [selected, setSelected] = useState<Entity | null>(null);

  const filtered = useMemo(() => {
    if (!entities) return [];
    return entities.filter((e) => {
      const matchesType = typeFilter === "all" || e.type === typeFilter;
      const matchesSearch =
        !search ||
        e.shortForm.toLowerCase().includes(search.toLowerCase()) ||
        e.occurrences.some((o) =>
          o.observationSnippet.toLowerCase().includes(search.toLowerCase()) ||
          o.fullDescription.toLowerCase().includes(search.toLowerCase())
        );
      return matchesType && matchesSearch;
    });
  }, [entities, search, typeFilter]);

  // Group by type for display
  const grouped = useMemo(() => {
    const groups: Partial<Record<EntityType, Entity[]>> = {};
    for (const e of filtered) {
      if (!groups[e.type]) groups[e.type] = [];
      groups[e.type]!.push(e);
    }
    // Sort each group by occurrence count desc
    for (const g of Object.values(groups)) {
      g!.sort((a, b) => b.occurrences.length - a.occurrences.length);
    }
    return groups;
  }, [filtered]);

  const totalEntities = entities?.length ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Search className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Intelligence Folder</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : `${totalEntities} entities extracted from observation records`}
            </p>
          </div>
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search entities, descriptions, observations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {TYPE_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTypeFilter(opt.value as EntityType | "all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  typeFilter === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted/70"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {search || typeFilter !== "all"
                ? "No entities match your search."
                : "No entities found. Entities are extracted automatically from observation text using the (ShortForm) convention."}
            </p>
          </div>
        )}

        {/* Entity groups */}
        {!isLoading && (
          <div className="space-y-6">
            {(["person", "vehicle", "address", "business", "unknown"] as EntityType[]).map((type) => {
              const group = grouped[type];
              if (!group || group.length === 0) return null;
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLORS[type]}`}>
                      {TYPE_ICONS[type]}
                      {TYPE_LABELS[type]}s
                    </span>
                    <span className="text-xs text-muted-foreground">{group.length} unique</span>
                  </div>
                  <div className="rounded-xl border border-border/60 overflow-hidden bg-card/50">
                    {group.map((entity, idx) => (
                      <button
                        key={`${entity.type}::${entity.shortForm}`}
                        onClick={() => setSelected(entity)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/10 transition-colors ${
                          idx < group.length - 1 ? "border-b border-border/40" : ""
                        }`}
                      >
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border ${TYPE_COLORS[type]} shrink-0`}>
                          {TYPE_ICONS[type]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm font-medium text-foreground truncate">{entity.shortForm}</p>
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
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
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
