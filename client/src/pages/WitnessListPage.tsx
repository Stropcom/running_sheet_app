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
  FileDown,
  ChevronRight,
  Calendar,
  CheckSquare,
  Square,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { downloadBase64File } from "@/lib/downloadFile";

function formatDateShort(ts: number) {
  return format(new Date(ts), "d MMM yyyy");
}

function formatDayDate(ts: number) {
  return format(new Date(ts), "EEEE, d MMMM yyyy");
}

interface WitnessListPdfData {
  operationName: string;
  overallPrimary: string[];
  overallSecondary: string[];
  sheets: { sheetTitle: string; sheetDate: number; primary: string[]; secondary: string[] }[];
  producedAt: number;
  certifierCin: string;
}

// ─── PDF export ─────────────────────────────────────────────────────────────
// Same "RunLog product" visual language as the Intelligence profile PDF
// exports (see TargetProfileContent.tsx's buildTargetProfileHtml) — dark-blue
// letterhead band, colored stat tiles, colored section-title bars — rather
// than the plain AFP letterhead look of the .docx export, which stays as-is.
function buildWitnessListPdfHtml(data: WitnessListPdfData) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const BLUE_DARK = "#1e3a8a";
  const BLUE_MID = "#93c5fd";
  const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT = "#1e293b";
  const GREY_BORDER = "#e2e8f0";

  const cinLabel = (cin: string) => `CIN${cin}`;
  const producedDateStr = formatDateShort(data.producedAt);
  const generatedAt = new Date(data.producedAt).toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const witnessBox = (cins: string[], emptyLabel: string) => `
    <div style="border:1px solid ${GREY_BORDER};border-radius:6px;overflow:hidden">
      ${
        cins.length
          ? cins
              .map(
                (cin, i) =>
                  `<div class="sheet-item"><div class="sheet-dot"></div><span style="flex:1">${i + 1}. ${esc(cinLabel(cin))}</span></div>`
              )
              .join("")
          : `<div class="sheet-item"><span style="color:#94a3b8;font-style:italic">${esc(emptyLabel)}</span></div>`
      }
    </div>`;

  const combinedSection =
    data.sheets.length > 1
      ? `
  <div class="section">
    <div class="section-title">Combined Witness List</div>
    <p style="font-size:10px;color:#475569;margin-bottom:10px">The following is a combined Primary and Secondary witness list for all selected running sheets under Operation ${esc(data.operationName)}.</p>
    <div style="margin-bottom:10px">
      <p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px">Primary Witnesses</p>
      <p style="font-size:9px;color:#94a3b8;margin-bottom:6px;font-style:italic">Operatives with substantive observations.</p>
      ${witnessBox(data.overallPrimary, "No primary witnesses.")}
    </div>
    <div>
      <p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px">Secondary Witnesses</p>
      <p style="font-size:9px;color:#94a3b8;margin-bottom:6px;font-style:italic">Operatives who were on duty but whose entries are limited to Travelled Via and/or Surveillance Commenced/Ceased rows only.</p>
      ${witnessBox(data.overallSecondary, "No secondary witnesses.")}
    </div>
  </div>`
      : "";

  const sheetSections = data.sheets.length
    ? `
  <div class="section">
    <div class="section-title">Individual Running Sheet Witness List/s</div>
    <p style="font-size:10px;color:#475569;margin-bottom:10px">The following witness lists are specific to each individual running sheet selected under Operation ${esc(data.operationName)}, presented in date order.</p>
    ${data.sheets
      .map(
        (sheet) => `
    <div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid ${GREY_BORDER}">
      <p style="font-size:11px;font-weight:700;color:${GREY_TEXT}">${esc(sheet.sheetTitle)}</p>
      <p style="font-size:9px;color:#64748b;margin-bottom:8px">${esc(formatDayDate(sheet.sheetDate))}</p>
      <div style="margin-bottom:8px">
        <p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px">Primary Witnesses</p>
        ${witnessBox(sheet.primary, "No primary witnesses.")}
      </div>
      <div>
        <p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px">Secondary Witnesses</p>
        ${witnessBox(sheet.secondary, "No secondary witnesses.")}
      </div>
    </div>`
      )
      .join("")}
  </div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>RunLog Witness List — Operation ${esc(data.operationName)}</title>
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
.sheet-item { display:flex; align-items:center; gap:8px; padding:5px 8px; border-bottom:1px solid ${GREY_BORDER}; font-size:10px; }
.sheet-item:last-child { border-bottom:none; }
.sheet-dot { width:6px; height:6px; border-radius:50%; background:${BLUE_MID}; flex-shrink:0; }
.footer { margin-top:32px; padding-top:12px; border-top:1px solid ${GREY_BORDER}; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .stats-row { background:${BLUE_LIGHT} !important; } .section-title { background:${BLUE_LIGHT} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-row"><div class="brand-dot"></div><span class="brand-label">RunLog Witness List</span></div>
  <div class="entity-type-badge">&#128203; Witness List</div>
  <div class="entity-name">Operation ${esc(data.operationName)}</div>
  <div class="entity-sub">Produced by ${esc(cinLabel(data.certifierCin))} — ${esc(producedDateStr)}</div>
  <div class="gen-time">Generated: ${generatedAt}</div>
</div>
<div class="stats-row">
  <div class="stat-box"><div class="stat-num">${data.sheets.length}</div><div class="stat-label">Running Sheets</div></div>
  <div class="stat-box"><div class="stat-num">${data.overallPrimary.length}</div><div class="stat-label">Primary Witnesses</div></div>
  <div class="stat-box"><div class="stat-num">${data.overallSecondary.length}</div><div class="stat-label">Secondary Witnesses</div></div>
  <div class="stat-box"><div class="stat-num">${data.overallPrimary.length + data.overallSecondary.length}</div><div class="stat-label">Total Witnesses</div></div>
</div>
<div class="content">
  ${combinedSection}
  ${sheetSections}
  <div class="footer">
    <span>RunLog — Witness List — Certified by ${esc(cinLabel(data.certifierCin))} ${esc(producedDateStr)}</span>
    <span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span>
  </div>
</div>
</body></html>`;
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
  const [exportingPdf, setExportingPdf] = useState(false);

  const utils = trpc.useUtils();

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
      downloadBase64File(
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

  const handleExportPdf = async () => {
    if (!selectedOp || !canGenerate) return;
    setExportingPdf(true);
    try {
      const data = await utils.witnessList.getData.fetch({
        sheetIds: selectedSheetIds,
        operationName: selectedOp.name,
      });
      const html = buildWitnessListPdfHtml(data);
      const win = window.open("", "_blank");
      if (!win) {
        toast.error("Couldn't open a new tab — check your browser's popup blocker.");
        return;
      }
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 600);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't generate the PDF.");
    } finally {
      setExportingPdf(false);
    }
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

        {/* ── Generate buttons ── */}
        {canGenerate && (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="flex items-center gap-2"
            >
              {exportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              {exportingPdf ? "Preparing…" : "Export PDF"}
            </Button>
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
