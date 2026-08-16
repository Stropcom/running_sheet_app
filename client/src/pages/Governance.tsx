import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import DashboardLayout from "@/components/DashboardLayout";
import {
  CheckCircle2,
  Circle,
  ArrowLeft,
  ClipboardCheck,
  AlertTriangle,
  Lock,
  ChevronDown,
  ChevronUp,
  FileText,
  Link2,
  Link2Off,
  NotebookText,
} from "lucide-react";
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImageryEntry {
  cin: string;
  rowTime: string;
  type: "photo" | "video" | "";
  saved: boolean;
}

// Derived (never persisted) — entity-link status for a CIN's imagery, used to
// gate the Saved tick until every photo is linked to an Intelligence entity.
interface DisplayImageryEntry extends ImageryEntry {
  attachmentCount: number;
  linkedCount: number;
  allLinked: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseImagery(raw: string | null | undefined): ImageryEntry[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ImageryEntry[];
  } catch {
    return [];
  }
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
  cin,
  tickedByName,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  info?: string;
  disabled?: boolean;
  cin?: string | null;
  tickedByName?: string | null;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors select-none ${
        checked
          ? "bg-emerald-500/10 border-emerald-500/30 text-foreground"
          : "bg-muted/20 border-border/40 text-muted-foreground"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-muted/40"}`}
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
      {checked && (cin || tickedByName) && (
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          {cin && (
            <span className="text-xs font-mono font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
              {cin}
            </span>
          )}
          {tickedByName && (
            <span className="text-[10px] text-emerald-400/70 font-medium">
              {tickedByName}
            </span>
          )}
        </div>
      )}
      {disabled && !checked && (
        <Lock className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
      )}
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
        ? "text-cyan-500"
        : "text-rose-500";
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-3 bg-card/60 border border-border/50 rounded-xl hover:bg-card/80 transition-colors"
    >
      <div className="flex-1 text-left">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
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

// Photo-trigger phrases
const PHOTO_PHRASES = [
  "PHOTOGRAPHS TAKEN",
  "PHOTOGRAPH TAKEN",
  "PHOTOGRAPH/S TAKEN",
];

export default function GovernancePage() {
  const params = useParams<{ sheetId: string }>();
  const sheetId = parseInt(params.sheetId ?? "0", 10);
  const [, navigate] = useLocation();

  // Fetch full sheet/rows data
  const { data: exportData } = trpc.export.sheetData.useQuery(
    { id: sheetId },
    { enabled: !!sheetId }
  );

  // Fetch sheet to check closed state
  const { data: sheetData } = trpc.sheet.get.useQuery(
    { id: sheetId },
    { enabled: !!sheetId }
  );
  const isClosed = !!(sheetData as { closedAt?: number | null } | undefined)
    ?.closedAt;

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

  // Local state
  const [imagery, setImagery] = useState<ImageryEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notesTimeout, setNotesTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Section expand state
  const [tlExpanded, setTlExpanded] = useState(true);
  const [opExpanded, setOpExpanded] = useState(true);
  const [imgExpanded, setImgExpanded] = useState(true);

  // Track previous allSigned value to detect transitions
  const prevAllSignedRef = React.useRef<boolean | null>(null);

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

  const sheetCins: Array<{
    cin: string;
    isTeamLeader?: boolean;
    isAuthor?: boolean;
    hasImages?: boolean;
  }> = useMemo(() => {
    try {
      return JSON.parse(sheet?.sheetCins ?? "[]");
    } catch {
      return [];
    }
  }, [sheet?.sheetCins]);

  const teamLeader = sheetCins.find(c => c.isTeamLeader);
  const author = sheetCins.find(c => c.isAuthor);

  // Determine if all CINs in every row are certified
  const allSigned = useMemo(() => {
    if (!exportData) return false;
    const rows = exportData.rows ?? [];
    if (rows.length === 0) return false;
    return rows.every(r => {
      const members = r.members ?? [];
      if (members.length === 0) return true; // row with no members is not blocking
      return members.every((m: { id: number }) =>
        (r.certifications ?? []).some(
          (c: { memberId: number; isActive: boolean }) =>
            c.memberId === m.id && c.isActive
        )
      );
    });
  }, [exportData]);

  // When allSigned transitions true → false, reset operative fields in DB
  useEffect(() => {
    if (!gov) return;
    const prev = prevAllSignedRef.current;
    prevAllSignedRef.current = allSigned;
    if (prev === true && allSigned === false) {
      updateMutation.mutate({
        sheetId,
        savedInOpFolder: false,
        savedInInvestigatorTransferDrive: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSigned]);

  // Auto-derive imagery entries:
  //   Start with all CINs that have hasImages=true from team details.
  //   Then enrich each CIN with rowTime + type from rows containing PHOTOGRAPH phrases.
  //   Sort by rowTime ascending.
  const autoImagery = useMemo<ImageryEntry[]>(() => {
    const rows = exportData?.rows ?? [];

    // Build a map: cin -> { rowTime, type } from photo-phrase rows
    const photoRowMap = new Map<
      string,
      { rowTime: string; type: "photo" | "video" | "" }
    >();
    for (const row of rows) {
      const obs = (row.observation ?? "").toUpperCase();
      const hasPhrase = PHOTO_PHRASES.some(p => obs.includes(p));
      if (!hasPhrase) continue;
      const rowCins = (row.members ?? []).map(
        (m: { memberName: string }) => m.memberName
      );
      const time = row.time ?? "";
      // Detect video vs photo
      const isVideo = obs.includes("VIDEO");
      const type: "photo" | "video" = isVideo ? "video" : "photo";
      if (rowCins.length === 0) {
        // No CIN on row — store under "Unknown"
        if (!photoRowMap.has("Unknown")) {
          photoRowMap.set("Unknown", { rowTime: time, type });
        }
      } else {
        for (const cin of rowCins) {
          if (!photoRowMap.has(cin)) {
            photoRowMap.set(cin, { rowTime: time, type });
          }
        }
      }
    }

    // Start with all hasImages CINs from team details
    const imageCins = sheetCins.filter(c => c.hasImages).map(c => c.cin);

    // Also include any CINs found in photo rows not already in the list
    for (const cin of Array.from(photoRowMap.keys())) {
      if (!imageCins.includes(cin)) imageCins.push(cin);
    }

    // Build entries, enriching with row data where available
    const entries: ImageryEntry[] = imageCins.map(cin => {
      const rowData = photoRowMap.get(cin);
      return {
        cin,
        rowTime: rowData?.rowTime ?? "",
        type: rowData?.type ?? "",
        saved: false,
      };
    });

    // Sort by rowTime ascending (empty times go to end)
    entries.sort((a, b) => {
      if (!a.rowTime && !b.rowTime) return 0;
      if (!a.rowTime) return 1;
      if (!b.rowTime) return -1;
      return a.rowTime.localeCompare(b.rowTime);
    });

    return entries;
  }, [exportData, sheetCins]);

  // On load / when autoImagery changes: sync stored imagery with current autoImagery
  // - Add new entries not yet stored
  // - Remove stale entries whose CIN+rowTime no longer exists in autoImagery
  // - Preserve saved flags for entries that still exist
  useEffect(() => {
    if (!gov) return;
    const existing = parseImagery(gov.imageryEntries);
    if (autoImagery.length === 0) {
      // No imagery at all now — clear any stale stored entries
      if (existing.length > 0) {
        saveImagery([]);
      }
      return;
    }
    const autoKeys = new Set(autoImagery.map(e => e.cin + "||" + e.rowTime));
    const existingKeys = new Set(existing.map(e => e.cin + "||" + e.rowTime));
    // Remove stale entries (removed from team list / observations)
    const pruned = existing.filter(e => autoKeys.has(e.cin + "||" + e.rowTime));
    // Add new entries not yet stored
    const newEntries = autoImagery.filter(
      e => !existingKeys.has(e.cin + "||" + e.rowTime)
    );
    const merged = [...pruned, ...newEntries];
    // Only save if something changed
    const changed = pruned.length !== existing.length || newEntries.length > 0;
    if (changed) {
      saveImagery(merged);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gov?.id, JSON.stringify(autoImagery.map(e => e.cin + e.rowTime))]);

  // ── Toggle helper ──
  type BoolField =
    | "sentToIO"
    | "summaryNotification"
    | "savedInOpFolder"
    | "savedInInvestigatorTransferDrive"
    | "imageryTaken"
    | "coverPage";

  function toggle(field: BoolField) {
    if (!gov || isClosed) return;
    const newValue = !(gov as Record<string, unknown>)[field];
    updateMutation.mutate({
      sheetId,
      [field]: newValue,
      toggledField: field,
      toggledValue: newValue,
    });
  }

  // ── Save notes (debounced) ──
  function handleNotesChange(val: string) {
    if (isClosed) return;
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
    if (isClosed) return;
    setDueDate(val);
    const ms = val ? new Date(val).getTime() : null;
    updateMutation.mutate({ sheetId, dueDate: ms });
  }

  // ── Imagery helpers ──
  function saveImagery(entries: ImageryEntry[]) {
    if (isClosed) return;
    setImagery(entries);
    updateMutation.mutate({ sheetId, imageryEntries: entries });
  }
  function updateImageryRow(idx: number, patch: Partial<ImageryEntry>) {
    // Match by key (cin + rowTime) because displayImagery order may differ from imagery array
    const target = displayImagery[idx];
    if (!target) return;
    const key = target.cin + "||" + target.rowTime;
    const existingIdx = imagery.findIndex(
      e => e.cin + "||" + e.rowTime === key
    );
    let next: ImageryEntry[];
    if (existingIdx >= 0) {
      next = imagery.map((e, i) =>
        i === existingIdx ? { ...e, ...patch } : e
      );
    } else {
      // Entry not yet in stored imagery — append it (strip derived-only fields;
      // only cin/rowTime/type/saved are persisted)
      next = [
        ...imagery,
        {
          cin: target.cin,
          rowTime: target.rowTime,
          type: target.type,
          saved: target.saved,
          ...patch,
        },
      ];
    }
    saveImagery(next);
  }

  // Derive imageryTaken from team details (hasImages flag) — not a stored boolean
  const hasAnyImagery = sheetCins.some(c => c.hasImages);

  // ── Completion percentages ──
  // TL section: 2 items
  const tlPercent = gov
    ? completionPercent([
        ((gov as Record<string, unknown>).summaryNotification as boolean) ??
          false,
        gov.sentToIO,
      ])
    : 0;

  // Operative section: 2 items — all blocked (false) until allSigned
  const opPercent = gov
    ? completionPercent([
        allSigned && gov.savedInOpFolder,
        allSigned && gov.savedInInvestigatorTransferDrive,
      ])
    : 0;

  // Imagery section:
  // - If no imagery flagged AND no autoImagery rows AND no stored rows: 100% (N/A)
  // - Otherwise: percentage of rows marked as saved
  //   Use autoImagery as the source of truth for CINs; merge saved flags from stored imagery.
  const imageryTakenChecked = !!(gov as Record<string, unknown> | undefined)
    ?.imageryTaken;

  // Per-CIN photo/entity-link stats — pooled across every row that CIN appears
  // on, since the auto-derived imagery entry only tracks the first
  // photo-phrase row's time per CIN while the actual attachments can sit on
  // any row that CIN is a member of.
  const cinPhotoStats = useMemo(() => {
    const rows = exportData?.rows ?? [];
    const map = new Map<
      string,
      { attachmentCount: number; linkedCount: number }
    >();
    for (const row of rows) {
      const atts = (row.attachments ?? []) as Array<{ linkedCount?: number }>;
      if (atts.length === 0) continue;
      const rowCins = (row.members ?? []).map(
        (m: { memberName: string }) => m.memberName
      );
      for (const cin of rowCins) {
        const stat = map.get(cin) ?? { attachmentCount: 0, linkedCount: 0 };
        stat.attachmentCount += atts.length;
        stat.linkedCount += atts.filter(a => (a.linkedCount ?? 0) > 0).length;
        map.set(cin, stat);
      }
    }
    return map;
  }, [exportData]);

  // Build display imagery: autoImagery is the source of truth for which entries exist;
  // merge saved flags from stored imagery, and entity-link stats from cinPhotoStats.
  // If autoImagery is empty, no imagery to show.
  const displayImagery = useMemo<DisplayImageryEntry[]>(() => {
    if (autoImagery.length === 0) return [];
    const savedMap = new Map(imagery.map(e => [e.cin + e.rowTime, e.saved]));
    return autoImagery.map(e => {
      const stat = cinPhotoStats.get(e.cin);
      const attachmentCount = stat?.attachmentCount ?? 0;
      const linkedCount = stat?.linkedCount ?? 0;
      return {
        ...e,
        saved: savedMap.get(e.cin + e.rowTime) ?? false,
        attachmentCount,
        linkedCount,
        allLinked: attachmentCount > 0 && linkedCount === attachmentCount,
      };
    });
  }, [autoImagery, imagery, cinPhotoStats]);
  const hasAnyImageryData =
    hasAnyImagery || autoImagery.length > 0 || imagery.length > 0;
  // A row only counts toward completion once it's both marked saved AND every
  // one of its photos is linked to an entity.
  const imgPercent = hasAnyImageryData
    ? completionPercent(displayImagery.map(e => e.saved && e.allLinked))
    : 100;

  // Overall: TL (2) + Operative (4) + Imagery rows (only if any imagery data)
  const overallPercent = gov
    ? completionPercent([
        ((gov as Record<string, unknown>).summaryNotification as boolean) ??
          false,
        gov.sentToIO,
        allSigned && gov.savedInOpFolder,
        allSigned && gov.savedInInvestigatorTransferDrive,
        ...(hasAnyImageryData
          ? displayImagery.map(e => e.saved && e.allLinked)
          : []),
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
          onClick={() => window.history.back()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-5 border-b border-border">
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate(`/sheet/${sheetId}`, { replace: true })}
          >
            <FileText className="w-4 h-4" />
            Running Sheet
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate(`/summary/${sheetId}`, { replace: true })}
          >
            <NotebookText className="w-4 h-4" />
            Summary
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground border-b-2 border-primary -mb-px transition-colors">
            <ClipboardCheck className="w-4 h-4" />
            Governance
          </button>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                RS Governance
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sheet?.title ?? "Loading…"}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              {isOverdue && (
                <Badge
                  variant="destructive"
                  className="text-[10px] px-1.5 py-0.5 flex items-center gap-1"
                >
                  <AlertTriangle className="w-3 h-3" /> OVERDUE
                </Badge>
              )}
              <span
                className={`text-2xl font-bold ${
                  overallPercent === 100
                    ? "text-emerald-500"
                    : overallPercent >= 50
                      ? "text-cyan-500"
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
            <p className="font-medium text-foreground">
              {exportData?.operation?.name ?? "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-muted-foreground mb-0.5">Target</p>
            <p className="font-medium text-foreground">
              {exportData?.targetFullName ?? sheet?.targetName ?? "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-muted-foreground mb-0.5">Team Leader</p>
            <p className="font-medium text-foreground">
              {teamLeader?.cin ?? "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-muted-foreground mb-0.5">RS Author</p>
            <p className="font-medium text-foreground">{author?.cin ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-muted-foreground mb-0.5">Sheet Date</p>
            <p className="font-medium text-foreground">
              {sheet?.sheetDate
                ? format(new Date(`${sheet.sheetDate}T00:00:00`), "dd MMM yyyy")
                : sheet?.createdAt
                  ? format(new Date(sheet.createdAt), "dd MMM yyyy")
                  : "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-muted-foreground mb-1">Due Date</p>
            <input
              type="date"
              value={dueDate}
              onChange={e => handleDueDateChange(e.target.value)}
              disabled={isClosed}
              className="w-full bg-transparent text-foreground font-medium text-xs outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* ── Team Leader Section ── */}
        <div className="mb-3">
          <SectionHeader
            title="Team Leader"
            subtitle="Summary notification and IO sign-off"
            percent={tlPercent}
            expanded={tlExpanded}
            onToggle={() => setTlExpanded(v => !v)}
          />
          {tlExpanded && gov && (
            <div className="mt-2 space-y-2">
              <CheckRow
                label="Summary complete"
                checked={
                  ((gov as Record<string, unknown>)
                    .summaryNotification as boolean) ?? false
                }
                onToggle={() => toggle("summaryNotification")}
                cin={(gov as Record<string, unknown>).isurvCIN as string | null}
                tickedByName={
                  (gov as Record<string, unknown>).isurvName as string | null
                }
              />
              <CheckRow
                label="Sent to IO"
                checked={gov.sentToIO}
                onToggle={() => toggle("sentToIO")}
                cin={
                  (gov as Record<string, unknown>).sentToIOCIN as string | null
                }
                tickedByName={
                  (gov as Record<string, unknown>).sentToIOName as string | null
                }
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
            onToggle={() => setOpExpanded(v => !v)}
          />
          {opExpanded && gov && (
            <div className="mt-2 space-y-2">
              {/* Certification status — always shown, not toggleable */}
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
                  allSigned
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-rose-500/10 border-rose-500/30"
                }`}
              >
                {allSigned ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${allSigned ? "text-foreground" : "text-rose-400"}`}
                  >
                    Signed by all team members
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {allSigned
                      ? "All CINs have certified their rows"
                      : "Sheet must be fully certified before the rest of this section can be completed"}
                  </p>
                </div>
              </div>

              {/* Remaining operative checks — locked until allSigned */}
              {!allSigned && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/30">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Complete certification of all rows to unlock the remaining
                    checks
                  </p>
                </div>
              )}

              <CheckRow
                label="Saved in Operation folder"
                checked={allSigned && gov.savedInOpFolder}
                onToggle={() => toggle("savedInOpFolder")}
                disabled={!allSigned}
                cin={
                  (gov as Record<string, unknown>).savedInOpFolderCIN as
                    | string
                    | null
                }
                tickedByName={
                  (gov as Record<string, unknown>).savedInOpFolderName as
                    | string
                    | null
                }
              />
              <CheckRow
                label="Saved in Investigator transfer drive"
                checked={allSigned && gov.savedInInvestigatorTransferDrive}
                onToggle={() => toggle("savedInInvestigatorTransferDrive")}
                disabled={!allSigned}
                cin={
                  (gov as Record<string, unknown>)
                    .savedInInvestigatorTransferDriveCIN as string | null
                }
                tickedByName={
                  (gov as Record<string, unknown>)
                    .savedInInvestigatorTransferDriveName as string | null
                }
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
            onToggle={() => setImgExpanded(v => !v)}
          />
          {imgExpanded && gov && (
            <div className="mt-2 space-y-2">
              {/* Imagery taken — colour reflects save + link status */}
              {(() => {
                const allCompleteImg =
                  displayImagery.length > 0 &&
                  displayImagery.every(e => e.saved && e.allLinked);
                const someSavedImg = displayImagery.some(
                  e => e.saved && e.allLinked
                );
                const unlinkedCount = displayImagery.filter(
                  e => !e.allLinked
                ).length;
                const bannerClass = !hasAnyImagery
                  ? "bg-rose-500/10 border-rose-500/30"
                  : allCompleteImg
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-cyan-500/10 border-cyan-500/30";
                const iconEl = !hasAnyImagery ? (
                  <span className="text-rose-500 text-lg shrink-0 leading-none">
                    ✗
                  </span>
                ) : allCompleteImg ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-cyan-500 shrink-0" />
                );
                const titleColor = !hasAnyImagery
                  ? "text-rose-400"
                  : allCompleteImg
                    ? "text-foreground"
                    : "text-cyan-500";
                const subText = !hasAnyImagery
                  ? "No imagery flagged on team details — no imagery taken"
                  : allCompleteImg
                    ? "All imagery saved and linked to an entity"
                    : unlinkedCount > 0
                      ? `${unlinkedCount} row${unlinkedCount === 1 ? "" : "s"} need photos linked to an entity before they can be marked saved`
                      : someSavedImg
                        ? "Some imagery not yet saved"
                        : "Imagery flagged — not yet saved";
                return (
                  <div
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${bannerClass}`}
                  >
                    {iconEl}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${titleColor}`}>
                        Imagery taken during surveillance
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {subText}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Imagery entries table — auto-populated from rows */}
              {displayImagery.length > 0 && (
                <div className="rounded-lg border border-border/40 overflow-hidden">
                  <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-semibold text-muted-foreground bg-muted/30 px-3 py-2 border-b border-border/30">
                    <span>CIN</span>
                    <span>TIME</span>
                    <span>TYPE</span>
                    <span>LINKED</span>
                    <span>SAVED</span>
                  </div>
                  {displayImagery.map((entry, idx) => {
                    const operationId = exportData?.operation?.id;
                    const goLinkPhotos = () => {
                      if (operationId)
                        navigate(`/images/${operationId}/${sheetId}`);
                    };
                    return (
                      <div
                        key={idx}
                        className={`grid grid-cols-5 gap-1 items-center px-3 py-2 transition-colors ${
                          entry.saved ? "bg-emerald-500/10" : ""
                        } ${
                          idx < displayImagery.length - 1
                            ? "border-b border-border/20"
                            : ""
                        }`}
                      >
                        <span className="text-xs text-foreground font-medium truncate text-center justify-self-center">
                          {entry.cin || "—"}
                        </span>
                        <span className="text-xs text-muted-foreground text-center justify-self-center">
                          {entry.rowTime || "—"}
                        </span>
                        <select
                          value={entry.type}
                          onChange={e =>
                            updateImageryRow(idx, {
                              type: e.target.value as "photo" | "video" | "",
                            })
                          }
                          className="justify-self-center bg-transparent text-xs text-foreground outline-none border border-border/40 rounded px-1 py-0.5"
                        >
                          <option value="">—</option>
                          <option value="photo">Photo</option>
                          <option value="video">Video</option>
                        </select>
                        {entry.allLinked ? (
                          <span className="justify-self-center inline-flex items-center gap-1 text-[10px] font-medium text-emerald-500 truncate">
                            <Link2 className="w-3 h-3 shrink-0" /> Linked
                          </span>
                        ) : (
                          <button
                            onClick={goLinkPhotos}
                            disabled={!operationId}
                            title={
                              entry.attachmentCount === 0
                                ? "No photo uploaded for this CIN yet — click to open the Images gallery"
                                : `${entry.linkedCount}/${entry.attachmentCount} photos linked — click to finish linking`
                            }
                            className="justify-self-center inline-flex items-center gap-1 text-[10px] font-medium text-amber-500 hover:text-amber-400 truncate text-center disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Link2Off className="w-3 h-3 shrink-0" />
                            {entry.attachmentCount === 0
                              ? "No photo"
                              : `${entry.linkedCount}/${entry.attachmentCount} linked`}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (!entry.saved && !entry.allLinked) {
                              toast.warning(
                                entry.attachmentCount === 0
                                  ? "Upload and link a photo to an entity before marking this saved."
                                  : "Link every photo to an entity before marking this saved."
                              );
                              return;
                            }
                            updateImageryRow(idx, { saved: !entry.saved });
                          }}
                          className="justify-self-center flex items-center justify-center"
                        >
                          {entry.saved ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Circle className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {imagery.length === 0 && (
                <p className="text-xs text-muted-foreground px-1 py-2">
                  No imagery entries detected. Rows containing "PHOTOGRAPH/S
                  TAKEN" or team members with imagery flagged will appear here
                  automatically.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="mb-6">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Notes
          </p>
          <Textarea
            value={notes}
            onChange={e => handleNotesChange(e.target.value)}
            placeholder="Any additional notes for this running sheet write-off…"
            rows={3}
            disabled={isClosed}
            className="text-sm resize-none"
          />
        </div>

        {/* Completion bar */}
        <div className="rounded-xl border border-border/50 bg-card/40 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-foreground">
              Overall completion
            </p>
            <p
              className={`text-sm font-bold ${
                overallPercent === 100
                  ? "text-emerald-500"
                  : overallPercent >= 50
                    ? "text-cyan-500"
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
                    ? "bg-cyan-500"
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
