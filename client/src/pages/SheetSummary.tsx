import { trpc } from "@/lib/trpc";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ArrowLeft,
  FileText,
  ClipboardCheck,
  NotebookText,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";

// ─── Field definitions ─────────────────────────────────────────────────────

type FieldKey =
  | "teamLabel"
  | "teamCins"
  | "operationName"
  | "dayDate"
  | "startTime"
  | "finishTime"
  | "targetName"
  | "address"
  | "ioSupport"
  | "intelSupport"
  | "specialProjects"
  | "objectives"
  | "criticalDecisions"
  | "summary"
  | "newIntelForProfile"
  | "issues";

type FormState = Record<FieldKey, string>;

const EMPTY_FORM: FormState = {
  teamLabel: "",
  teamCins: "",
  operationName: "",
  dayDate: "",
  startTime: "",
  finishTime: "",
  targetName: "",
  address: "",
  ioSupport: "",
  intelSupport: "",
  specialProjects: "",
  objectives: "",
  criticalDecisions: "",
  summary: "",
  newIntelForProfile: "",
  issues: "",
};

// ─── Field row helpers ──────────────────────────────────────────────────────

function FieldInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">
        {label}
      </p>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="text-sm"
      />
    </div>
  );
}

function FieldTextarea({
  label,
  hint,
  value,
  onChange,
  disabled,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">
        {label}
        {hint && <span className="font-normal opacity-70"> — {hint}</span>}
      </p>
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        className="text-sm resize-none"
      />
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SheetSummaryPage() {
  const { sheetId: sheetIdParam } = useParams<{ sheetId: string }>();
  const sheetId = parseInt(sheetIdParam, 10);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: sheet } = trpc.sheet.get.useQuery(
    { id: sheetId },
    { enabled: !!sheetId }
  );
  const isClosed = !!(sheet as { closedAt?: number | null } | undefined)
    ?.closedAt;

  const { data: record, isLoading } = trpc.summary.getBySheet.useQuery(
    { sheetId },
    { enabled: !!sheetId }
  );

  const updateMutation = trpc.summary.update.useMutation({
    onSuccess: () => utils.summary.getBySheet.invalidate({ sheetId }),
    onError: () => toast.error("Failed to save change"),
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const timeoutsRef = useRef<
    Partial<Record<FieldKey, ReturnType<typeof setTimeout>>>
  >({});

  // Sync local state from the server record whenever it (re)loads
  useEffect(() => {
    if (!record) return;
    setForm({
      teamLabel: record.teamLabel ?? "",
      teamCins: record.teamCins ?? "",
      operationName: record.operationName ?? "",
      dayDate: record.dayDate ?? "",
      startTime: record.startTime ?? "",
      finishTime: record.finishTime ?? "",
      targetName: record.targetName ?? "",
      address: record.address ?? "",
      ioSupport: record.ioSupport ?? "",
      intelSupport: record.intelSupport ?? "",
      specialProjects: record.specialProjects ?? "",
      objectives: record.objectives ?? "",
      criticalDecisions: record.criticalDecisions ?? "",
      summary: record.summary ?? "",
      newIntelForProfile: record.newIntelForProfile ?? "",
      issues: record.issues ?? "",
    });
  }, [record]);

  function handleChange(key: FieldKey, value: string) {
    if (isClosed) return;
    setForm(prev => ({ ...prev, [key]: value }));
    const timeouts = timeoutsRef.current;
    if (timeouts[key]) clearTimeout(timeouts[key]);
    timeouts[key] = setTimeout(() => {
      updateMutation.mutate({ sheetId, [key]: value });
    }, 800);
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate(`/sheet/${sheetId}`)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-5 border-b border-border">
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate(`/sheet/${sheetId}`)}
          >
            <FileText className="w-4 h-4" />
            Running Sheet
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground border-b-2 border-primary -mb-px transition-colors">
            <NotebookText className="w-4 h-4" />
            Summary
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate(`/governance/${sheetId}`)}
          >
            <ClipboardCheck className="w-4 h-4" />
            Governance
          </button>
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <NotebookText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Supervisor Summary
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {sheet?.title ?? "Loading…"}
            </p>
          </div>
        </div>

        {isClosed && (
          <div className="mb-4 rounded-lg border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800/60 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              This running sheet is closed — the summary is read-only.
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
              <FieldInput
                label="Team"
                value={form.teamLabel}
                onChange={v => handleChange("teamLabel", v)}
                disabled={isClosed}
              />
              <FieldInput
                label="Team Members CIN"
                value={form.teamCins}
                onChange={v => handleChange("teamCins", v)}
                disabled={isClosed}
              />
              <div className="grid grid-cols-2 gap-4">
                <FieldInput
                  label="Operation"
                  value={form.operationName}
                  onChange={v => handleChange("operationName", v)}
                  disabled={isClosed}
                />
                <FieldInput
                  label="Day / Date"
                  value={form.dayDate}
                  onChange={v => handleChange("dayDate", v)}
                  disabled={isClosed}
                />
                <FieldInput
                  label="Start time"
                  value={form.startTime}
                  onChange={v => handleChange("startTime", v)}
                  disabled={isClosed}
                />
                <FieldInput
                  label="Finish time"
                  value={form.finishTime}
                  onChange={v => handleChange("finishTime", v)}
                  disabled={isClosed}
                />
              </div>
              <FieldInput
                label="Target (TGT)"
                value={form.targetName}
                onChange={v => handleChange("targetName", v)}
                disabled={isClosed}
              />
              <FieldInput
                label="Address (HB)"
                value={form.address}
                onChange={v => handleChange("address", v)}
                disabled={isClosed}
              />
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
              <FieldInput
                label="IO Support"
                value={form.ioSupport}
                onChange={v => handleChange("ioSupport", v)}
                disabled={isClosed}
              />
              <FieldInput
                label="Intel Support"
                value={form.intelSupport}
                onChange={v => handleChange("intelSupport", v)}
                disabled={isClosed}
              />
              <FieldInput
                label="Special Projects"
                value={form.specialProjects}
                onChange={v => handleChange("specialProjects", v)}
                disabled={isClosed}
              />
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-5">
              <FieldTextarea
                label="Objectives"
                hint="list specifically — not generic lifestyle or pattern of life"
                value={form.objectives}
                onChange={v => handleChange("objectives", v)}
                disabled={isClosed}
              />
              <FieldTextarea
                label="Critical Decisions"
                hint="list deviations from objective, overtime, change of target"
                value={form.criticalDecisions}
                onChange={v => handleChange("criticalDecisions", v)}
                disabled={isClosed}
              />
              <FieldTextarea
                label="Summary"
                value={form.summary}
                onChange={v => handleChange("summary", v)}
                disabled={isClosed}
                rows={5}
              />
              <FieldTextarea
                label="New Intel for Profile"
                value={form.newIntelForProfile}
                onChange={v => handleChange("newIntelForProfile", v)}
                disabled={isClosed}
              />
              <FieldTextarea
                label="Issues"
                value={form.issues}
                onChange={v => handleChange("issues", v)}
                disabled={isClosed}
              />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
