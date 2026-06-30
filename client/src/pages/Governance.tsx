import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import DashboardLayout from "@/components/DashboardLayout";
import {
  CheckCircle2,
  Circle,
  ArrowLeft,
  ClipboardCheck,
  AlertTriangle,
  Camera,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImageryEntry {
  name: string;
  cellTime: string;
  type: "photo" | "video" | "";
  saved: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseImagery(raw: string | null | undefined): ImageryEntry[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as ImageryEntry[]; } catch { return []; }
}

function completionPercent(fields: boolean[]): number {
  if (fields.length === 0) return 0;
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

// ─── CheckRow ─────────────────────────────────────────────────────────────────

function CheckRow({
  label,
  checked,
  onToggle,
  info,
  disabled,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  info?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors cursor-pointer select-none ${
        checked
          ? "bg-emerald-500/10 border-emerald-500/30 text-foreground"
          : "bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/40"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      onClick={disabled ? undefined : onToggle}
    >
      {checked ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
      ) : (
        <Circle className="w-5 h-5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {info && <p className="text-xs text-muted-foreground mt-0.5">{info}</p>}
      </div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
  percent,
  expanded,
  onToggle,
}: {
  title: string;
  subtitle?: string;
  percent: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color =
    percent === 100
      ? "text-emerald-500"
      : percent >= 50
      ? "text-amber-500"
      : "text-rose-500";
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-3 bg-card/60 border border-border/50 rounded-xl hover:bg-card/80 transition-colors"
    >
      <div className="flex-1 text-left">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <span className={`text-xs font-bold ${color}`}>{percent}%</span>
      {expanded ? (
        <ChevronUp className="w-4 h-4 text-muted-foreground" />
      ) : (
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      )}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GovernancePage() {
  const params = useParams<{ sheetId: string }>();
  const sheetId = parseInt(params.sheetId ?? "0", 10);
  const [, navigate] = useLocation();

  // Fetch sheet info (for header display)
  const { data: exportData } = trpc.export.sheetData.useQuery({ id: sheetId }, { enabled: !!sheetId });

  // Fetch governance record (auto-created on first load)
  const { data: gov, isLoading } = trpc.governance.getBySheet.useQuery(
    { sheetId },
    { enabled: !!sheetId }
  );

  const utils = trpc.useUtils();
  const updateMutation = trpc.governance.update.useMutation({
    onSuccess: () => {
      utils.governance.getBySheet.invalidate({ sheetId });
    },
    onError: () => toast.error("Failed to save change"),
  });

  // Local imagery state (managed separately for add/remove/edit)
  const [imagery, setImagery] = useState<ImageryEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notesTimeout, setNotesTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Section expand state
  const [tlExpanded, setTlExpanded] = useState(true);
  const [opExpanded, setOpExpanded] = useState(true);
  const [imgExpanded, setImgExpanded] = useState(true);

  // Sync local state from server record
  useEffect(() => {
    if (!gov) return;
    setImagery(parseImagery(gov.imageryEntries));
    setNotes(gov.notes ?? "");
    if (gov.dueDate) {
      setDueDate(format(new Date(gov.dueDate), "yyyy-MM-dd"));
    }
  }, [gov]);

  // ── Derived data from sheet ──
  const sheet = exportData?.sheet;
  const sheetCins: Array<{ cin: string; isTeamLeader?: boolean; isAuthor?: boolean }> =
    useMemo(() => {
      try { return JSON.parse(sheet?.sheetCins ?? "[]"); } catch { return []; }
    }, [sheet?.sheetCins]);
  const teamLeader = sheetCins.find((c) => c.isTeamLeader);
  const author = sheetCins.find((c) => c.isAuthor);
  const allSigned = useMemo(() => {
    if (!exportData) return false;
    const rows = exportData.rows ?? [];
    return rows.every((r) =>
      (r.members ?? []).every((m: { id: number }) =>
        (r.certifications ?? []).some((c: { memberId: number; isActive: boolean }) => c.memberId === m.id && c.isActive)
      )
    );
  }, [exportData]);

  // ── Toggle helper ──
  type BoolField = "isurv" | "sentToIO" | "savedAsWord" | "savedAsPdf" | "uploadedToPromis" | "linked" | "savedInOpFolder" | "imageryTaken" | "coverPage";
  function toggle(field: BoolField) {
    if (!gov) return;
    updateMutation.mutate({ sheetId, [field]: !gov[field] });
  }

  // ── Save notes (debounced) ──
  function handleNotesChange(val: string) {
    setNotes(val);
    if (notesTimeout) clearTimeout(notesTimeout);
    setNotesTimeout(
      setTimeout(() => {
        updateMutation.mutate({ sheetId, notes: val });
      }, 800)
    );
  }

  // ── Save due date ──
  function handleDueDateChange(val: string) {
    setDueDate(val);
    const ms = val ? new Date(val).getTime() : null;
    updateMutation.mutate({ sheetId, dueDate: ms });
  }

  // ── Imagery helpers ──
  function saveImagery(entries: ImageryEntry[]) {
    setImagery(entries);
    updateMutation.mutate({ sheetId, imageryEntries: entries });
  }
  function addImageryRow() {
    saveImagery([...imagery, { name: "", cellTime: "", type: "", saved: false }]);
  }
  function removeImageryRow(idx: number) {
    saveImagery(imagery.filter((_, i) => i !== idx));
  }
  function updateImageryRow(idx: number, patch: Partial<ImageryEntry>) {
    const next = imagery.map((e, i) => (i === idx ? { ...e, ...patch } : e));
    saveImagery(next);
  }

  // ── Completion percentages ──
  const tlPercent = gov
    ? completionPercent([gov.isurv, gov.sentToIO])
    : 0;
  const opPercent = gov
    ? completionPercent([
        allSigned,
        gov.savedAsWord,
        gov.savedAsPdf,
        gov.uploadedToPromis,
        gov.linked,
        gov.savedInOpFolder,
      ])
    : 0;
  const imgPercent = gov
    ? completionPercent([
        gov.imageryTaken,
        gov.coverPage,
        ...(imagery.map((e) => e.saved)),
      ])
    : 0;
  const overallPercent = gov
    ? completionPercent([
        gov.isurv,
        gov.sentToIO,
        allSigned,
        gov.savedAsWord,
        gov.savedAsPdf,
        gov.uploadedToPromis,
        gov.linked,
        gov.savedInOpFolder,
        gov.imageryTaken,
        gov.coverPage,
      ])
    : 0;

  const isOverdue =
    gov?.dueDate != null && Date.now() > gov.dueDate && overallPercent < 100;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-3xl mx-auto space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Back nav */}
        <button
          onClick={() => navigate(`/operation/${sheet?.operationId ?? ""}`)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Operation
        </button>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">RS Governance</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sheet?.title ?? "Loading…"}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              {isOverdue && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> OVERDUE
                </Badge>
              )}
              <span
                className={`text-2xl font-bold ${
                  overallPercent === 100
                    ? "text-emerald-500"
                    : overallPercent >= 50
                    ? "text-amber-500"
                    : "text-rose-500"
                }`}
              >
                {overallPercent}%
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">complete</p>
          </div>
        </div>

        {/* Meta info row */}
        <div className="grid grid-cols-2 gap-3 mb-5 text-xs">
          <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-muted-foreground mb-0.5">Operation</p>
            <p className="font-medium text-foreground">{exportData?.operation?.name ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-muted-foreground mb-0.5">Target</p>
            <p className="font-medium text-foreground">{exportData?.targetFullName ?? sheet?.targetName ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-muted-foreground mb-0.5">Team Leader</p>
            <p className="font-medium text-foreground">{teamLeader?.cin ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-muted-foreground mb-0.5">RS Author</p>
            <p className="font-medium text-foreground">{author?.cin ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-muted-foreground mb-0.5">Sheet Date</p>
            <p className="font-medium text-foreground">
              {sheet?.createdAt ? format(new Date(sheet.createdAt), "dd MMM yyyy") : "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-muted-foreground mb-1">Due Date</p>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => handleDueDateChange(e.target.value)}
              className="w-full bg-transparent text-foreground font-medium text-xs outline-none"
            />
          </div>
        </div>

        {/* ── Team Leader Section ── */}
        <div className="mb-3">
          <SectionHeader
            title="Team Leader"
            subtitle="iSurv summary and IO notification"
            percent={tlPercent}
            expanded={tlExpanded}
            onToggle={() => setTlExpanded((v) => !v)}
          />
          {tlExpanded && gov && (
            <div className="mt-2 space-y-2">
              <CheckRow
                label="iSurv summary completed"
                checked={gov.isurv}
                onToggle={() => toggle("isurv")}
              />
              <CheckRow
                label="Sent to IO"
                checked={gov.sentToIO}
                onToggle={() => toggle("sentToIO")}
              />
            </div>
          )}
        </div>

        {/* ── Operative / RS Author Section ── */}
        <div className="mb-3">
          <SectionHeader
            title="Operative — Running Sheet"
            subtitle="Author tasks and document management"
            percent={opPercent}
            expanded={opExpanded}
            onToggle={() => setOpExpanded((v) => !v)}
          />
          {opExpanded && gov && (
            <div className="mt-2 space-y-2">
              <CheckRow
                label="Signed by all team members"
                checked={allSigned}
                onToggle={() => {}}
                info={
                  allSigned
                    ? "All CINs have certified their rows"
                    : "Some rows still have uncertified CINs"
                }
                disabled
              />
              <CheckRow
                label="Saved as Word document"
                checked={gov.savedAsWord}
                onToggle={() => toggle("savedAsWord")}
              />
              <CheckRow
                label="Saved as PDF"
                checked={gov.savedAsPdf}
                onToggle={() => toggle("savedAsPdf")}
              />
              <CheckRow
                label="Uploaded to PROMIS"
                checked={gov.uploadedToPromis}
                onToggle={() => toggle("uploadedToPromis")}
              />
              <CheckRow
                label="Linked in PROMIS"
                checked={gov.linked}
                onToggle={() => toggle("linked")}
              />
              <CheckRow
                label="Saved in Operation folder"
                checked={gov.savedInOpFolder}
                onToggle={() => toggle("savedInOpFolder")}
              />
            </div>
          )}
        </div>

        {/* ── Imagery Section ── */}
        <div className="mb-3">
          <SectionHeader
            title="Imagery"
            subtitle="Photos and videos taken during surveillance"
            percent={imgPercent}
            expanded={imgExpanded}
            onToggle={() => setImgExpanded((v) => !v)}
          />
          {imgExpanded && gov && (
            <div className="mt-2 space-y-2">
              <CheckRow
                label="Imagery taken during surveillance"
                checked={gov.imageryTaken}
                onToggle={() => toggle("imageryTaken")}
              />
              <CheckRow
                label="Cover page attached"
                checked={gov.coverPage}
                onToggle={() => toggle("coverPage")}
              />

              {/* Sheet cell reference */}
              <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Sheet cell reference</p>
                <Input
                  value={gov.sheetCell ?? ""}
                  onChange={(e) =>
                    updateMutation.mutate({ sheetId, sheetCell: e.target.value || null })
                  }
                  placeholder="e.g. Row 14"
                  className="h-8 text-xs"
                />
              </div>

              {/* Imagery entries table */}
              {imagery.length > 0 && (
                <div className="rounded-lg border border-border/40 overflow-hidden">
                  <div className="grid grid-cols-[1fr_100px_90px_60px_32px] gap-0 text-[10px] font-semibold text-muted-foreground bg-muted/30 px-3 py-2 border-b border-border/30">
                    <span>NAME / DESCRIPTION</span>
                    <span>CELL TIME</span>
                    <span>TYPE</span>
                    <span>SAVED</span>
                    <span />
                  </div>
                  {imagery.map((entry, idx) => (
                    <div
                      key={idx}
                      className={`grid grid-cols-[1fr_100px_90px_60px_32px] gap-0 items-center px-3 py-2 ${
                        idx < imagery.length - 1 ? "border-b border-border/20" : ""
                      }`}
                    >
                      <input
                        value={entry.name}
                        onChange={(e) => updateImageryRow(idx, { name: e.target.value })}
                        placeholder="Description"
                        className="bg-transparent text-xs text-foreground outline-none w-full pr-2"
                      />
                      <input
                        value={entry.cellTime}
                        onChange={(e) => updateImageryRow(idx, { cellTime: e.target.value })}
                        placeholder="e.g. 14:32"
                        className="bg-transparent text-xs text-foreground outline-none w-full pr-2"
                      />
                      <select
                        value={entry.type}
                        onChange={(e) =>
                          updateImageryRow(idx, { type: e.target.value as "photo" | "video" | "" })
                        }
                        className="bg-transparent text-xs text-foreground outline-none border border-border/40 rounded px-1 py-0.5"
                      >
                        <option value="">—</option>
                        <option value="photo">Photo</option>
                        <option value="video">Video</option>
                      </select>
                      <button
                        onClick={() => updateImageryRow(idx, { saved: !entry.saved })}
                        className="flex items-center justify-center"
                      >
                        {entry.saved ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Circle className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                      <button
                        onClick={() => removeImageryRow(idx)}
                        className="flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={addImageryRow}
                disabled={imagery.length >= 10}
                className="w-full text-xs gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {imagery.length >= 10 ? "Maximum 10 entries reached" : "Add Imagery Entry"}
              </Button>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="mb-6">
          <p className="text-xs font-medium text-muted-foreground mb-2">Notes</p>
          <Textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Any additional notes for this running sheet write-off…"
            rows={3}
            className="text-sm resize-none"
          />
        </div>

        {/* Completion bar */}
        <div className="rounded-xl border border-border/50 bg-card/40 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-foreground">Overall completion</p>
            <p
              className={`text-sm font-bold ${
                overallPercent === 100
                  ? "text-emerald-500"
                  : overallPercent >= 50
                  ? "text-amber-500"
                  : "text-rose-500"
              }`}
            >
              {overallPercent}%
            </p>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                overallPercent === 100
                  ? "bg-emerald-500"
                  : overallPercent >= 50
                  ? "bg-amber-500"
                  : "bg-rose-500"
              }`}
              style={{ width: `${overallPercent}%` }}
            />
          </div>
          {overallPercent === 100 && (
            <p className="text-xs text-emerald-500 mt-2 text-center font-medium">
              ✓ All governance checks complete — ready for write-off
            </p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
