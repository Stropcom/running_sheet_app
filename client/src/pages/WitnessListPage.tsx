import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Users,
  Download,
  ChevronRight,
  Calendar,
  CheckSquare,
  Square,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadBase64(base64: string, filename: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatDateShort(ts: number) {
  return format(new Date(ts), "d MMM yyyy");
}

// ─── Step badge ───────────────────────────────────────────────────────────────

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

export default function WitnessListPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const [selectedOpId, setSelectedOpId] = useState<number | null>(null);
  const [selectedSheetIds, setSelectedSheetIds] = useState<number[]>([]);
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

  const generateMutation = trpc.witnessList.generate.useMutation({
    onError: (e) => {
      toast.error(e.message);
      setGenerating(false);
    },
    onSuccess: (data) => {
      setGenerating(false);
      downloadBase64(
        data.base64,
        data.filename,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      toast.success("Witness list downloaded");
    },
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  const step = selectedOpId === null ? 1 : 2;
  const canGenerate = selectedSheetIds.length > 0 && selectedOp !== null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const toggleSheet = (id: number) => {
    setSelectedSheetIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleAllSheets = () => {
    if (!sheets) return;
    if (selectedSheetIds.length === sheets.length) {
      setSelectedSheetIds([]);
    } else {
      setSelectedSheetIds(sheets.map((s) => s.id));
    }
  };

  const handleGenerate = () => {
    if (!selectedOp || !canGenerate) return;
    setGenerating(true);
    generateMutation.mutate({
      sheetIds: selectedSheetIds,
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
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Produce Witness List</h1>
            <p className="text-sm text-muted-foreground">
              Generate a primary and secondary witness list for selected running sheets
            </p>
          </div>
        </div>

        {/* Explanation card */}
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground flex flex-col gap-1">
          <p>
            <span className="font-semibold text-foreground">Primary witnesses</span> — operatives
            with substantive observations (excludes Travelled Via and Surveillance
            Commenced/Ceased entries).
          </p>
          <p>
            <span className="font-semibold text-foreground">Secondary witnesses</span> — operatives
            whose entries are limited to Travelled Via and/or Surveillance Commenced/Ceased rows
            only (on duty, no substantive observations).
          </p>
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
              <StepBadge n={2} active={step === 2} done={false} />
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

        {/* ── Generate button ── */}
        {canGenerate && (
          <div className="flex justify-end">
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {generating ? "Generating…" : `Generate Witness List (${selectedSheetIds.length} sheet${selectedSheetIds.length !== 1 ? "s" : ""})`}
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
