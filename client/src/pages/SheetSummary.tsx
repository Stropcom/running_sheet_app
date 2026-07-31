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
  X,
  Plus,
  Trash2,
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
  | "location"
  | "ioSupport"
  | "intelSupport"
  | "specialProjects"
  | "ioContactTiming"
  | "ioContactMethod"
  | "objectives"
  | "criticalDecisions"
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
  location: "",
  ioSupport: "",
  intelSupport: "",
  specialProjects: "",
  ioContactTiming: "",
  ioContactMethod: "",
  objectives: "",
  criticalDecisions: "",
  issues: "",
};

const SPECIAL_PROJECT_OPTIONS = ["LBS", "SEEK", "CAD", "TI", "Tracker", "LD"];
const IO_CONTACT_TIMING_OPTIONS = [
  "Day prior",
  "Day of — pre set-up",
  "Day of — post set-up",
];
const IO_CONTACT_METHOD_OPTIONS = ["Phone call", "Text"];

interface SpecialProjectEntry {
  key: string;
  detail: string;
}

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Field row helpers ──────────────────────────────────────────────────────

function FieldInput({
  label,
  value,
  onChange,
  disabled,
  listOptions,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  listOptions?: string[];
}) {
  const listId = listOptions
    ? `list-${label.replace(/\W+/g, "-").toLowerCase()}`
    : undefined;
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
        list={listId}
      />
      {listOptions && (
        <datalist id={listId}>
          {listOptions.map(opt => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
      )}
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium text-muted-foreground mb-1.5">
      {children}
    </p>
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
  const operationId = (sheet as { operationId?: number } | undefined)
    ?.operationId;

  const { data: record, isLoading } = trpc.summary.getBySheet.useQuery(
    { sheetId },
    { enabled: !!sheetId }
  );

  const { data: vehicles } = trpc.summary.getVehicles.useQuery(
    { sheetId },
    { enabled: !!sheetId }
  );

  const { data: ioSupportHistory } = trpc.summary.getSupportHistory.useQuery(
    { operationId: operationId ?? 0, field: "ioSupport" },
    { enabled: !!operationId }
  );
  const { data: intelSupportHistory } = trpc.summary.getSupportHistory.useQuery(
    { operationId: operationId ?? 0, field: "intelSupport" },
    { enabled: !!operationId }
  );

  const { data: entries } = trpc.summary.getEntries.useQuery(
    { sheetId },
    { enabled: !!sheetId }
  );

  const updateMutation = trpc.summary.update.useMutation({
    onSuccess: () => utils.summary.getBySheet.invalidate({ sheetId }),
    onError: () => toast.error("Failed to save change"),
  });

  const dismissVehicleMutation = trpc.summary.dismissVehicle.useMutation({
    onSuccess: () => utils.summary.getVehicles.invalidate({ sheetId }),
    onError: () => toast.error("Failed to remove vehicle"),
  });

  const updateEntryMutation = trpc.summary.updateEntry.useMutation({
    onError: () => toast.error("Failed to save summary line"),
  });
  const deleteEntryMutation = trpc.summary.deleteEntry.useMutation({
    onSuccess: () => utils.summary.getEntries.invalidate({ sheetId }),
    onError: () => toast.error("Failed to delete summary line"),
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
      location: record.location ?? "",
      ioSupport: record.ioSupport ?? "",
      intelSupport: record.intelSupport ?? "",
      specialProjects: record.specialProjects ?? "",
      ioContactTiming: record.ioContactTiming ?? "",
      ioContactMethod: record.ioContactMethod ?? "",
      objectives: record.objectives ?? "",
      criticalDecisions: record.criticalDecisions ?? "",
      issues: record.issues ?? "",
    });
  }, [record]);

  function handleChange(key: FieldKey, value: string, debounce = true) {
    if (isClosed) return;
    setForm(prev => ({ ...prev, [key]: value }));
    const timeouts = timeoutsRef.current;
    if (timeouts[key]) clearTimeout(timeouts[key]);
    if (debounce) {
      timeouts[key] = setTimeout(() => {
        updateMutation.mutate({ sheetId, [key]: value });
      }, 800);
    } else {
      updateMutation.mutate({ sheetId, [key]: value });
    }
  }

  // ── Special Projects (checklist + per-item detail) ────────────────────────
  const specialProjects = parseJsonArray<SpecialProjectEntry>(
    form.specialProjects
  );
  function toggleSpecialProject(key: string) {
    const exists = specialProjects.some(p => p.key === key);
    const next = exists
      ? specialProjects.filter(p => p.key !== key)
      : [...specialProjects, { key, detail: "" }];
    handleChange("specialProjects", JSON.stringify(next), false);
  }
  function setSpecialProjectDetail(key: string, detail: string) {
    const next = specialProjects.map(p =>
      p.key === key ? { ...p, detail } : p
    );
    handleChange("specialProjects", JSON.stringify(next));
  }

  // ── Objectives (dynamic single-line list) ──────────────────────────────────
  const objectives = parseJsonArray<string>(form.objectives);
  function addObjective() {
    handleChange("objectives", JSON.stringify([...objectives, ""]), false);
  }
  function setObjective(idx: number, value: string) {
    const next = objectives.map((o, i) => (i === idx ? value : o));
    handleChange("objectives", JSON.stringify(next));
  }
  function removeObjective(idx: number) {
    const next = objectives.filter((_, i) => i !== idx);
    handleChange("objectives", JSON.stringify(next), false);
  }

  // ── Critical Decisions (dynamic multi-line list) ───────────────────────────
  const criticalDecisions = parseJsonArray<string>(form.criticalDecisions);
  function addCriticalDecision() {
    handleChange(
      "criticalDecisions",
      JSON.stringify([...criticalDecisions, ""]),
      false
    );
  }
  function setCriticalDecision(idx: number, value: string) {
    const next = criticalDecisions.map((d, i) => (i === idx ? value : d));
    handleChange("criticalDecisions", JSON.stringify(next));
  }
  function removeCriticalDecision(idx: number) {
    const next = criticalDecisions.filter((_, i) => i !== idx);
    handleChange("criticalDecisions", JSON.stringify(next), false);
  }

  // ── Summary entries (per-RS-row, append-only sync) ─────────────────────────
  const [entryDrafts, setEntryDrafts] = useState<Record<number, string>>({});
  const entryTimeoutsRef = useRef<
    Record<number, ReturnType<typeof setTimeout>>
  >({});
  function handleEntryChange(id: number, value: string) {
    if (isClosed) return;
    setEntryDrafts(prev => ({ ...prev, [id]: value }));
    if (entryTimeoutsRef.current[id])
      clearTimeout(entryTimeoutsRef.current[id]);
    entryTimeoutsRef.current[id] = setTimeout(() => {
      updateEntryMutation.mutate({ id, text: value });
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
                label="Location"
                value={form.location}
                onChange={v => handleChange("location", v)}
                disabled={isClosed}
              />

              {/* Vehicle — always computed live, never stored; dismiss removes an entry */}
              <div>
                <SectionLabel>Vehicle</SectionLabel>
                {vehicles && vehicles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {vehicles.map(v => (
                      <span
                        key={v.key}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 pl-3 pr-1.5 py-1 text-sm"
                      >
                        {v.label}
                        {!isClosed && (
                          <button
                            type="button"
                            onClick={() =>
                              dismissVehicleMutation.mutate({
                                sheetId,
                                key: v.key,
                              })
                            }
                            className="rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                            aria-label={`Remove ${v.label}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground/70 italic">
                    No vehicles found in the Target Registry or running sheet
                    text.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
              <FieldInput
                label="IO Support"
                value={form.ioSupport}
                onChange={v => handleChange("ioSupport", v)}
                disabled={isClosed}
                listOptions={ioSupportHistory}
              />
              <FieldInput
                label="Intel Support"
                value={form.intelSupport}
                onChange={v => handleChange("intelSupport", v)}
                disabled={isClosed}
                listOptions={intelSupportHistory}
              />

              {/* Special Projects — checklist, each checked item gets its own detail field */}
              <div>
                <SectionLabel>Special Projects</SectionLabel>
                <div className="flex flex-wrap gap-x-5 gap-y-2 mb-2">
                  {SPECIAL_PROJECT_OPTIONS.map(opt => {
                    const checked = specialProjects.some(p => p.key === opt);
                    return (
                      <label
                        key={opt}
                        className="flex items-center gap-1.5 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isClosed}
                          onChange={() => toggleSpecialProject(opt)}
                          className="w-4 h-4 rounded border-border"
                        />
                        {opt}
                      </label>
                    );
                  })}
                </div>
                {specialProjects.length > 0 && (
                  <div className="space-y-2">
                    {specialProjects.map(p => (
                      <div key={p.key} className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">
                          {p.key}
                        </span>
                        <Input
                          value={p.detail}
                          onChange={e =>
                            setSpecialProjectDetail(p.key, e.target.value)
                          }
                          disabled={isClosed}
                          placeholder="Details"
                          className="text-sm"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* IO Communication */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <SectionLabel>When contacted</SectionLabel>
                  <select
                    value={form.ioContactTiming}
                    disabled={isClosed}
                    onChange={e =>
                      handleChange("ioContactTiming", e.target.value, false)
                    }
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value=""></option>
                    {IO_CONTACT_TIMING_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <SectionLabel>Method</SectionLabel>
                  <select
                    value={form.ioContactMethod}
                    disabled={isClosed}
                    onChange={e =>
                      handleChange("ioContactMethod", e.target.value, false)
                    }
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value=""></option>
                    {IO_CONTACT_METHOD_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-5">
              {/* Objectives — dynamic single-line list */}
              <div>
                <SectionLabel>
                  Objectives
                  <span className="font-normal opacity-70">
                    {" "}
                    — list specifically, not generic lifestyle or pattern of
                    life
                  </span>
                </SectionLabel>
                <div className="space-y-2">
                  {objectives.map((o, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={o}
                        onChange={e => setObjective(idx, e.target.value)}
                        disabled={isClosed}
                        className="text-sm"
                      />
                      {!isClosed && (
                        <button
                          type="button"
                          onClick={() => removeObjective(idx)}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          aria-label="Remove objective"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {!isClosed && (
                  <button
                    type="button"
                    onClick={addObjective}
                    className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Objective
                  </button>
                )}
              </div>

              {/* Critical Decisions — dynamic multi-line list */}
              <div>
                <SectionLabel>
                  Critical Decisions
                  <span className="font-normal opacity-70">
                    {" "}
                    — list deviations from objective, overtime, change of target
                  </span>
                </SectionLabel>
                <div className="space-y-2">
                  {criticalDecisions.map((d, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <Textarea
                        value={d}
                        onChange={e => setCriticalDecision(idx, e.target.value)}
                        disabled={isClosed}
                        rows={2}
                        className="text-sm resize-none"
                      />
                      {!isClosed && (
                        <button
                          type="button"
                          onClick={() => removeCriticalDecision(idx)}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-1.5"
                          aria-label="Remove critical decision"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {!isClosed && (
                  <button
                    type="button"
                    onClick={addCriticalDecision}
                    className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Critical Decision
                  </button>
                )}
              </div>

              {/* Summary — one editable/deletable line per RS row, append-only synced */}
              <div>
                <SectionLabel>Summary</SectionLabel>
                <div className="space-y-2">
                  {(entries ?? []).map(entry => (
                    <div key={entry.id} className="flex items-start gap-2">
                      <Textarea
                        value={entryDrafts[entry.id] ?? entry.text}
                        onChange={e =>
                          handleEntryChange(entry.id, e.target.value)
                        }
                        disabled={isClosed}
                        rows={2}
                        className="text-sm resize-none"
                      />
                      {!isClosed && (
                        <button
                          type="button"
                          onClick={() =>
                            deleteEntryMutation.mutate({ id: entry.id })
                          }
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-1.5"
                          aria-label="Remove summary line"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {entries && entries.length === 0 && (
                    <p className="text-sm text-muted-foreground/70 italic">
                      No running sheet rows yet.
                    </p>
                  )}
                </div>
              </div>

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
