import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  FileText,
  Download,
  ChevronRight,
  ChevronDown,
  Users,
  Calendar,
  Camera,
  PenLine,
  CheckSquare,
  Square,
  Loader2,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function downloadBase64(base64: string, filename: string, mime: string) {
  const link = document.createElement("a");
  link.href = `data:${mime};base64,${base64}`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function formatDateShort(ts: number) {
  return format(new Date(ts), "d MMM yyyy");
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StatementsPage() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const isAdmin = user?.role === "admin";

  // Step 1: choose operation
  const [selectedOpId, setSelectedOpId] = useState<number | null>(null);

  // Step 2: choose sheets
  const [selectedSheetIds, setSelectedSheetIds] = useState<number[]>([]);

  // Step 3: choose CINs (admin only; non-admin auto-selects own CIN)
  const [selectedCins, setSelectedCins] = useState<string[]>([]);

  // Generating state
  const [generating, setGenerating] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: operations, isLoading: opsLoading } = trpc.operation.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const selectedOp = useMemo(
    () => operations?.find((o) => o.id === selectedOpId) ?? null,
    [operations, selectedOpId]
  );

  const { data: sheets, isLoading: sheetsLoading } = trpc.sheet.listByOperation.useQuery(
    { operationId: selectedOpId ?? 0 },
    { enabled: !!selectedOpId }
  );

  const { data: previewData, isLoading: previewLoading } = trpc.statement.previewData.useQuery(
    { sheetIds: selectedSheetIds },
    { enabled: selectedSheetIds.length > 0 }
  );

  const generateMutation = trpc.statement.generate.useMutation({
    onError: (e) => {
      toast.error(e.message);
      setGenerating(false);
    },
    onSuccess: (data) => {
      setGenerating(false);
      // Notify about any skipped CINs
      if (data.skipped && data.skipped.length > 0) {
        for (const s of data.skipped) {
          toast.warning(`CIN ${s.cin} skipped: ${s.reason}`);
        }
      }
      if (data.results.length === 0) {
        // All requested CINs were skipped
        return;
      }
      if (data.results.length === 1) {
        // Single statement — download directly
        downloadBase64(
          data.results[0].base64,
          data.results[0].filename,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        toast.success(`Statement for CIN ${data.results[0].cin} downloaded`);
      } else if (data.zipBase64) {
        // Multiple — download ZIP
        const zipName = `Statements_${data.operationName.replace(/[^a-zA-Z0-9]/g, "_")}_${format(new Date(data.producedAt), "yyyyMMdd")}.zip`;
        downloadBase64(data.zipBase64, zipName, "application/zip");
        toast.success(`${data.results.length} statements downloaded as ZIP`);
      }
    },
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  const step = selectedOpId === null ? 1 : selectedSheetIds.length === 0 ? 2 : 3;

  // For non-admin, auto-filter previewData to own CIN
  // Split into qualifying (can generate) and excluded (no statement possible)
  const { availableCins, excludedCins } = useMemo(() => {
    if (!previewData) return { availableCins: [], excludedCins: [] };
    let filtered = previewData;
    if (!isAdmin) {
      const myCin = user?.cin?.toUpperCase() ?? "";
      filtered = previewData.filter((d) => d.cin === myCin);
    }
    return {
      availableCins: filtered.filter((d) => !d.excludedReason),
      excludedCins: filtered.filter((d) => !!d.excludedReason),
    };
  }, [previewData, isAdmin, user?.cin]);

  // Auto-select own CIN for non-admin when previewData loads
  useMemo(() => {
    if (!isAdmin && availableCins.length > 0) {
      setSelectedCins(availableCins.map((d) => d.cin));
    }
  }, [availableCins, isAdmin]);

  const canGenerate =
    selectedSheetIds.length > 0 &&
    selectedCins.length > 0 &&
    selectedOp !== null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const toggleSheet = (id: number) => {
    setSelectedSheetIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
    setSelectedCins([]);
  };

  const toggleAllSheets = () => {
    if (!sheets) return;
    if (selectedSheetIds.length === sheets.length) {
      setSelectedSheetIds([]);
    } else {
      setSelectedSheetIds(sheets.map((s) => s.id));
    }
    setSelectedCins([]);
  };

  const toggleCin = (cin: string) => {
    setSelectedCins((prev) =>
      prev.includes(cin) ? prev.filter((c) => c !== cin) : [...prev, cin]
    );
  };

  const toggleAllCins = () => {
    if (selectedCins.length === availableCins.length) {
      setSelectedCins([]);
    } else {
      setSelectedCins(availableCins.map((d) => d.cin));
    }
  };

  const handleGenerate = () => {
    if (!selectedOp || !canGenerate) return;
    setGenerating(true);
    generateMutation.mutate({
      sheetIds: selectedSheetIds,
      cins: selectedCins,
      operationName: selectedOp.name,
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!isAuthenticated) return null;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-8">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Produce Statement</h1>
            <p className="text-sm text-muted-foreground">
              Generate a court-ready surveillance statement per officer CIN
            </p>
          </div>
        </div>

        {/* ── Step 1: Choose Operation ── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <StepBadge n={1} active={step === 1} done={step > 1} />
            <h2 className="font-semibold text-foreground">Choose Operation</h2>
          </div>

          {opsLoading ? (
            <div className="flex flex-col gap-2 pl-10">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="pl-10 flex flex-col gap-1.5">
              {(operations ?? []).map((op) => (
                <button
                  key={op.id}
                  onClick={() => {
                    setSelectedOpId(op.id);
                    setSelectedSheetIds([]);
                    setSelectedCins([]);
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
              {(operations ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground italic pl-1">No operations found.</p>
              )}
            </div>
          )}
        </section>

        {/* ── Step 2: Choose Running Sheets ── */}
        {selectedOpId !== null && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <StepBadge n={2} active={step === 2} done={step > 2} />
              <h2 className="font-semibold text-foreground">Choose Running Sheet(s)</h2>
            </div>

            {sheetsLoading ? (
              <div className="flex flex-col gap-2 pl-10">
                {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
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
                    {selectedSheetIds.length === (sheets ?? []).length ? "Deselect all" : "Select all"}
                  </button>
                )}
                {(sheets ?? []).map((sheet) => (
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
                      <span className="font-medium text-sm text-foreground truncate">{sheet.title}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDateShort(new Date(sheet.createdAt).getTime())}
                      </span>
                    </div>
                  </label>
                ))}
                {(sheets ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No running sheets for this operation.</p>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Step 3: Choose CINs ── */}
        {selectedSheetIds.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <StepBadge n={3} active={step === 3} done={false} />
              <h2 className="font-semibold text-foreground">
                {isAdmin ? "Choose CIN(s) to produce statements for" : "Confirm your CIN"}
              </h2>
            </div>

            <div className="pl-10 flex flex-col gap-2">
              {previewLoading ? (
                <div className="flex flex-col gap-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : availableCins.length === 0 && excludedCins.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {isAdmin
                    ? "No CINs found in the selected running sheets."
                    : "Your CIN does not appear in the selected running sheets."}
                </div>
              ) : (
                <>
                  {/* Qualifying CINs (can generate statements) */}
                  {availableCins.length === 0 && excludedCins.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      No qualifying observation rows found — all CINs are excluded (see below).
                    </div>
                  )}
                  {isAdmin && availableCins.length > 1 && (
                    <button
                      onClick={toggleAllCins}
                      className="flex items-center gap-2 text-sm text-primary hover:underline w-fit"
                    >
                      {selectedCins.length === availableCins.length ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                      {selectedCins.length === availableCins.length ? "Deselect all" : "Select all"}
                    </button>
                  )}
                  {availableCins.map((cinData) => (
                    <label
                      key={cinData.cin}
                      className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors ${
                        isAdmin ? "cursor-pointer" : "cursor-default"
                      } ${
                        selectedCins.includes(cinData.cin)
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:bg-muted/40"
                      }`}
                    >
                      {isAdmin && (
                        <Checkbox
                          checked={selectedCins.includes(cinData.cin)}
                          onCheckedChange={() => toggleCin(cinData.cin)}
                          className="mt-0.5"
                        />
                      )}
                      {!isAdmin && (
                        <div className="w-4 h-4 mt-0.5 rounded-sm bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                          <span className="text-[10px] text-primary font-bold">✓</span>
                        </div>
                      )}
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-foreground">{cinData.cin}</span>
                          <span className="text-sm text-muted-foreground">{cinData.name}</span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {cinData.surveillanceDates.length} surveillance day{cinData.surveillanceDates.length !== 1 ? "s" : ""}
                          </span>
                          {cinData.authorDates.length > 0 && (
                            <span className="flex items-center gap-1 text-sky-400">
                              <PenLine className="w-3 h-3" />
                              RS Author: {cinData.authorDates.map(formatDateShort).join(", ")}
                            </span>
                          )}
                          {cinData.imageDates.length > 0 && (
                            <span className="flex items-center gap-1 text-amber-400">
                              <Camera className="w-3 h-3" />
                              Images: {cinData.imageDates.map(formatDateShort).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}

                  {/* Excluded CINs — no statement can be generated */}
                  {excludedCins.length > 0 && (
                    <div className="mt-2 flex flex-col gap-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Excluded — no statement generated
                      </p>
                      {excludedCins.map((cinData) => (
                        <div
                          key={cinData.cin}
                          className="flex items-start gap-3 px-4 py-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 opacity-70"
                        >
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-sm text-foreground">{cinData.cin}</span>
                              <span className="text-sm text-muted-foreground">{cinData.name}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-500 border border-amber-400/30">
                                {cinData.excludedReason}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* ── Generate button ── */}
        {selectedSheetIds.length > 0 && availableCins.length > 0 && (
          <div className="pl-10">
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className="gap-2"
              size="lg"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  {selectedCins.length === 1
                    ? `Download Statement for CIN ${selectedCins[0]}`
                    : `Download ${selectedCins.length} Statements as ZIP`}
                </>
              )}
            </Button>
            {selectedCins.length > 1 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Multiple statements will be packaged into a single ZIP file.
              </p>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
