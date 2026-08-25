/**
 * Administration → Intel Export — hands running-sheet content and its mined
 * intelligence to another agency's system as plain JSON/CSV data files
 * (never PDF — the point is another database can parse this, not a human
 * reading it). Deliberately independent of the Court module: nothing here
 * is built from Statement/Witness List/WIPC output, and any CIN that
 * matches a registered WIPC member is redacted server-side before this
 * page ever sees it (see getIntelExportData in server/db.ts).
 *
 * Same Operation → Running Sheet(s) picker pattern as WitnessListPage, plus
 * two more selections: which document(s) to include (Running Sheet /
 * Extracted Intelligence) and which format(s) (JSON / CSV) — one file per
 * selected content×format combination.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { downloadTextFile } from "@/lib/downloadFile";
import { format } from "date-fns";
import {
  ArrowLeft,
  Database,
  ChevronRight,
  Calendar,
  CheckSquare,
  Square,
  ClipboardList,
  ScanSearch,
  FileJson,
  FileSpreadsheet,
  Download,
  Loader2,
} from "lucide-react";

function formatDateShort(ts: number) {
  return format(new Date(ts), "d MMM yyyy");
}

function StepBadge({
  n,
  active,
  done,
}: {
  n: number;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
        done
          ? "bg-emerald-500 text-white"
          : active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
      }`}
    >
      {done ? "✓" : n}
    </div>
  );
}

// ── CSV serialization (client-side, from the same structured data JSON uses) ──

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
function csvRow(fields: (string | number | boolean | null)[]): string {
  return fields.map(f => csvEscape(f === null ? "" : String(f))).join(",");
}

// Mirrors server/db.ts's IntelExportRunningSheet / IntelExportEntity.
interface RunningSheetDoc {
  operation: {
    id: number;
    name: string;
    promisNumber: string | null;
    imsNumber: string | null;
    investigationUnit: string | null;
  } | null;
  sheet: {
    id: number;
    title: string;
    sheetDate: string | null;
    status: "open" | "closed";
    closedAt: number | null;
    closedByCIN: string | null;
    targetId: number | null;
    targetName: string | null;
    roster: { cin: string; isTeamLeader: boolean }[];
  };
  rows: {
    rowNumber: number;
    date: string | null;
    time: string | null;
    observation: string | null;
    membersPresent: string[];
    certifications: { cin: string; certifiedAt: string }[];
    isLocked: boolean;
  }[];
}
interface IntelEntityDoc {
  type: "person" | "vehicle" | "address" | "business" | "unknown";
  shortForm: string;
  isRegisteredTarget: boolean;
  registryId: number | null;
  occurrences: {
    sheetId: number;
    sheetTitle: string;
    rowNumber: number | null;
    time: string | null;
    snippet: string;
  }[];
}

function runningSheetsToCsv(sheets: RunningSheetDoc[]): string {
  const lines = [
    csvRow([
      "operation_name",
      "sheet_title",
      "sheet_date",
      "row_number",
      "date",
      "time",
      "observation",
      "members_present",
      "certified_by_cin_at",
      "is_locked",
    ]),
  ];
  for (const s of sheets) {
    for (const row of s.rows) {
      lines.push(
        csvRow([
          s.operation?.name ?? "",
          s.sheet.title,
          s.sheet.sheetDate,
          row.rowNumber,
          row.date,
          row.time,
          row.observation,
          row.membersPresent.join(";"),
          row.certifications.map(c => `${c.cin}@${c.certifiedAt}`).join(";"),
          row.isLocked,
        ])
      );
    }
  }
  return lines.join("\n");
}

function intelEntitiesToCsv(entities: IntelEntityDoc[]): string {
  const lines = [
    csvRow([
      "entity_type",
      "short_form",
      "is_registered_target",
      "registry_id",
      "sheet_titles",
      "row_numbers",
      "times",
    ]),
  ];
  for (const e of entities) {
    lines.push(
      csvRow([
        e.type,
        e.shortForm,
        e.isRegisteredTarget,
        e.registryId,
        Array.from(new Set(e.occurrences.map(o => o.sheetTitle))).join(";"),
        e.occurrences.map(o => o.rowNumber ?? "").join(";"),
        e.occurrences.map(o => o.time ?? "").join(";"),
      ])
    );
  }
  return lines.join("\n");
}

export default function IntelExportPage() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();

  const [selectedOpId, setSelectedOpId] = useState<number | null>(null);
  const [selectedSheetIds, setSelectedSheetIds] = useState<number[]>([]);
  const [includeRunningSheet, setIncludeRunningSheet] = useState(true);
  const [includeIntel, setIncludeIntel] = useState(true);
  const [formatJson, setFormatJson] = useState(true);
  const [formatCsv, setFormatCsv] = useState(false);
  const [exporting, setExporting] = useState(false);

  const utils = trpc.useUtils();
  const { data: operations, isLoading: opsLoading } =
    trpc.operation.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: sheets, isLoading: sheetsLoading } =
    trpc.sheet.listByOperation.useQuery(
      { operationId: selectedOpId ?? 0 },
      { enabled: !!selectedOpId }
    );

  const toggleSheet = (id: number) => {
    setSelectedSheetIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };
  const toggleAllSheets = () => {
    if (!sheets) return;
    setSelectedSheetIds(
      selectedSheetIds.length === sheets.length ? [] : sheets.map(s => s.id)
    );
  };

  const step = selectedOpId === null ? 1 : 2;
  const canExport =
    selectedSheetIds.length > 0 &&
    (includeRunningSheet || includeIntel) &&
    (formatJson || formatCsv);

  const selectedOp = (operations as any[] | undefined)?.find(
    o => o.id === selectedOpId
  );

  const handleExport = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const data = await utils.export.intelExportData.fetch({
        sheetIds: selectedSheetIds,
      });
      const opSlug = (selectedOp?.name ?? "Operation").replace(
        /[^a-zA-Z0-9]/g,
        "_"
      );
      const dateStr = new Date().toISOString().slice(0, 10);

      if (includeRunningSheet && formatJson) {
        downloadTextFile(
          JSON.stringify(
            {
              exportType: "running_sheet",
              ...{ runningSheets: data.runningSheets },
            },
            null,
            2
          ),
          `RunningSheet_${opSlug}_${dateStr}.json`,
          "application/json"
        );
      }
      if (includeRunningSheet && formatCsv) {
        downloadTextFile(
          runningSheetsToCsv(data.runningSheets),
          `RunningSheet_${opSlug}_${dateStr}.csv`,
          "text/csv"
        );
      }
      if (includeIntel && formatJson) {
        downloadTextFile(
          JSON.stringify(
            {
              exportType: "intelligence_extract",
              ...{ entities: data.intelEntities },
            },
            null,
            2
          ),
          `IntelExtract_${opSlug}_${dateStr}.json`,
          "application/json"
        );
      }
      if (includeIntel && formatCsv) {
        downloadTextFile(
          intelEntitiesToCsv(data.intelEntities),
          `IntelExtract_${opSlug}_${dateStr}.csv`,
          "text/csv"
        );
      }
      toast.success("Export ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to export.");
    } finally {
      setExporting(false);
    }
  };

  if (!isAuthenticated) return null;

  const header = (
    <div className="flex items-center gap-3">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={() => navigate("/")}
      >
        <ArrowLeft className="w-4 h-4" />
      </Button>
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Database className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-foreground">Intel Export</h1>
        <p className="text-sm text-muted-foreground">
          Running sheets and their mined intelligence, as JSON/CSV for another
          agency's system to ingest
        </p>
      </div>
    </div>
  );

  if (user?.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-6">
          {header}
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground text-center">
            Intel Export is admin-only — this data is meant to leave the
            organisation, so only an admin can produce it.
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-8">
        {header}

        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Nothing from the Court module (Statements, Witness Lists, WIPC
          requests) is included. Any CIN registered for WIPC protection is
          redacted wherever it appears.
        </div>

        {/* Step 1: Operation */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <StepBadge n={1} active={step === 1} done={step > 1} />
            <h2 className="font-semibold text-foreground">Choose Operation</h2>
          </div>
          {opsLoading ? (
            <div className="flex flex-col gap-2 pl-10">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="pl-10 flex flex-col gap-1.5">
              {((operations as any[] | undefined) ?? []).map(op => (
                <button
                  key={op.id}
                  onClick={() => {
                    setSelectedOpId(op.id);
                    setSelectedSheetIds([]);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors ${
                    selectedOpId === op.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card hover:bg-muted/40 text-foreground"
                  }`}
                >
                  <span className="font-medium">{op.name}</span>
                  {selectedOpId === op.id && (
                    <ChevronRight className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
              {((operations as any[] | undefined) ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground italic pl-1">
                  No operations found.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Step 2: Running Sheet(s) */}
        {selectedOpId !== null && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <StepBadge n={2} active={step === 2} done={false} />
              <h2 className="font-semibold text-foreground">
                Choose Running Sheet(s)
              </h2>
            </div>
            {sheetsLoading ? (
              <div className="flex flex-col gap-2 pl-10">
                {[1, 2].map(i => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="pl-10 flex flex-col gap-2">
                {(sheets ?? []).length > 1 && (
                  <button
                    onClick={toggleAllSheets}
                    className="flex items-center gap-2 text-sm text-primary hover:underline w-fit"
                  >
                    {selectedSheetIds.length === (sheets ?? []).length ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    {selectedSheetIds.length === (sheets ?? []).length
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                )}
                {(sheets ?? []).map(sheet => (
                  <label
                    key={sheet.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedSheetIds.includes(sheet.id)
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:bg-muted/40"
                    }`}
                  >
                    <Checkbox
                      checked={selectedSheetIds.includes(sheet.id)}
                      onCheckedChange={() => toggleSheet(sheet.id)}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-sm text-foreground truncate">
                        {sheet.title}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDateShort(
                          sheet.sheetDate
                            ? new Date(`${sheet.sheetDate}T00:00:00`).getTime()
                            : new Date(sheet.createdAt).getTime()
                        )}
                      </span>
                    </div>
                  </label>
                ))}
                {(sheets ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    No running sheets for this operation.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Step 3: What to include */}
        {selectedSheetIds.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <StepBadge n={3} active={step === 2} done={false} />
              <h2 className="font-semibold text-foreground">What to include</h2>
            </div>
            <div className="pl-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  includeRunningSheet
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <Checkbox
                  checked={includeRunningSheet}
                  onCheckedChange={v => setIncludeRunningSheet(!!v)}
                />
                <ClipboardList className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-sm text-foreground">
                    Running Sheet
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Rows, members, certifications
                  </span>
                </div>
              </label>
              <label
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  includeIntel
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <Checkbox
                  checked={includeIntel}
                  onCheckedChange={v => setIncludeIntel(!!v)}
                />
                <ScanSearch className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-sm text-foreground">
                    Extracted Intelligence
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Persons/vehicles/addresses mined from the text
                  </span>
                </div>
              </label>
            </div>

            <div className="pl-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  formatJson
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <Checkbox
                  checked={formatJson}
                  onCheckedChange={v => setFormatJson(!!v)}
                />
                <FileJson className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm text-foreground">
                  JSON
                </span>
              </label>
              <label
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  formatCsv
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <Checkbox
                  checked={formatCsv}
                  onCheckedChange={v => setFormatCsv(!!v)}
                />
                <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm text-foreground">CSV</span>
              </label>
            </div>
          </section>
        )}

        {canExport && (
          <div className="flex justify-end">
            <Button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {exporting
                ? "Preparing…"
                : `Export (${selectedSheetIds.length} sheet${selectedSheetIds.length !== 1 ? "s" : ""})`}
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
