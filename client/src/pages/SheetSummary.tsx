import { trpc } from "@/lib/trpc";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowLeft,
  FileText,
  ClipboardCheck,
  NotebookText,
  X,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Download,
  Clock,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";

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

const SPECIAL_PROJECT_OPTIONS = [
  "LBS",
  "SEEK",
  "CAD",
  "TI",
  "Tracker",
  "LD",
  "Coyotes",
  "Other",
];
const SPECIAL_PROJECT_PLACEHOLDERS: Record<string, string> = {
  LBS: "AFP or WAPOL",
  SEEK: "AFP or WAPOL",
  CAD: "AFP or WAPOL",
  TI: "AFP or WAPOL",
  Tracker: "Vehicle details",
  LD: "Vehicle Residence Business details",
  Coyotes: "Location",
  Other: "Specify",
};
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

interface SheetSummaryVehicleLike {
  key: string;
  label: string;
}

interface SheetSummaryEntryLike {
  id: number;
  text: string;
  time?: string | null;
  location?: string | null;
}

interface SheetSummaryRecordLike {
  completedAt?: number | null;
  completedByCIN?: string | null;
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

// ─── Summary line time picker ──────────────────────────────────────────────
// Same trigger-button + Hour/Minute/AM-PM Select popover as the running
// sheet's row time picker and the map's RS Quick Entry — kept for a
// manually-added Summary line since only Hour/Minute/Period apply here (no
// day-offset/date stepper, a Summary line doesn't need one).

function SummaryTimePicker({
  value,
  disabled,
  onSave,
}: {
  value: string | null;
  disabled?: boolean;
  onSave: (display: string, minutes: number) => void;
}) {
  const parsed = (() => {
    const m = (value ?? "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return { hour: "12", minute: "00", period: "AM" };
    return {
      hour: String(parseInt(m[1], 10)),
      minute: m[2],
      period: m[3].toUpperCase(),
    };
  })();

  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState(parsed.period);
  const [selectOpen, setSelectOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHour(parsed.hour);
    setMinute(parsed.minute);
    setPeriod(parsed.period);
  }, [parsed.hour, parsed.minute, parsed.period]);

  useEffect(() => {
    if (!open || selectOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, selectOpen]);

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = Array.from({ length: 60 }, (_, i) =>
    String(i).padStart(2, "0")
  );

  function commit(h: string, m: string, p: string) {
    const display = `${String(parseInt(h, 10)).padStart(2, "0")}:${m} ${p}`;
    const minutesSinceMidnight =
      (parseInt(h, 10) % 12) * 60 + parseInt(m, 10) + (p === "PM" ? 720 : 0);
    onSave(display, minutesSinceMidnight);
  }

  if (disabled) {
    return (
      <span className="text-sm font-mono text-muted-foreground px-1 py-0.5">
        {value || <span className="italic opacity-40">—</span>}
      </span>
    );
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm font-mono hover:bg-accent/50 rounded px-1 py-0.5 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {value || (
          <span className="text-muted-foreground/50 italic text-xs">
            Set time
          </span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-xl p-3">
          <div className="flex items-center gap-1.5 flex-nowrap">
            <Select
              value={hour}
              onOpenChange={setSelectOpen}
              onValueChange={v => {
                setHour(v);
                commit(v, minute, period);
              }}
            >
              <SelectTrigger className="w-16 h-8 text-sm font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hours.map(h => (
                  <SelectItem
                    key={h}
                    value={h}
                    className="font-mono text-foreground"
                  >
                    {String(parseInt(h, 10)).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground font-mono text-lg">:</span>
            <Select
              value={minute}
              onOpenChange={setSelectOpen}
              onValueChange={v => {
                setMinute(v);
                commit(hour, v, period);
              }}
            >
              <SelectTrigger className="w-16 h-8 text-sm font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {minutes.map(m => (
                  <SelectItem
                    key={m}
                    value={m}
                    className="font-mono text-foreground"
                  >
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={period}
              onOpenChange={setSelectOpen}
              onValueChange={v => {
                setPeriod(v);
                commit(hour, minute, v);
              }}
            >
              <SelectTrigger className="w-16 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AM" className="text-foreground">
                  AM
                </SelectItem>
                <SelectItem value="PM" className="text-foreground">
                  PM
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs px-2"
              onClick={() => {
                const now = new Date();
                const h24 = now.getHours();
                const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
                const m = String(now.getMinutes()).padStart(2, "0");
                const p = h24 < 12 ? "AM" : "PM";
                setHour(String(h12));
                setMinute(m);
                setPeriod(p);
                commit(String(h12), m, p);
              }}
            >
              Now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PDF export ─────────────────────────────────────────────────────────────
// Same visual language as the Running Sheet / Intelligence Profile exports:
// dark-blue cover-header banner, light-blue section headers, PROTECTED
// page marking — see SheetDetail.tsx's exportToPDF and
// TargetProfileContent.tsx's buildTargetProfileHtml for the shared convention.

function exportSummaryToPDF(params: {
  sheetTitle: string;
  form: FormState;
  vehicles: SheetSummaryVehicleLike[];
  entries: SheetSummaryEntryLike[];
  record: SheetSummaryRecordLike | null | undefined;
}) {
  const { sheetTitle, form, vehicles, entries, record } = params;
  const esc = (s: string | null | undefined) =>
    (s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const BLUE_DARK = "#1e3a8a";
  const BLUE_MID = "#93c5fd";
  const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT = "#1e293b";
  const GREY_BORDER = "#e2e8f0";

  const specialProjects = parseJsonArray<SpecialProjectEntry>(
    form.specialProjects
  );
  const objectives = parseJsonArray<string>(form.objectives).filter(o =>
    o.trim()
  );
  const criticalDecisions = parseJsonArray<string>(
    form.criticalDecisions
  ).filter(d => d.trim());

  const detailRow = (label: string, value: string) =>
    value.trim()
      ? `<div class="detail-label">${esc(label)}</div><div class="detail-value">${esc(value)}</div>`
      : "";

  const section = (title: string, bodyHtml: string) =>
    bodyHtml
      ? `<div class="section"><div class="section-title">${esc(title)}</div><div class="section-body">${bodyHtml}</div></div>`
      : "";

  // The Summary table already carries its own border/header — kept as a
  // plain flat title bar (the original section style) rather than the card
  // treatment the other sections get, so it stays exactly as it was.
  const plainSection = (title: string, bodyHtml: string) =>
    bodyHtml
      ? `<div class="plain-section"><div class="plain-section-title">${esc(title)}</div>${bodyHtml}</div>`
      : "";

  const vehiclesHtml = vehicles.length
    ? `<div class="chip-list">${vehicles.map(v => `<span class="chip">${esc(v.label)}</span>`).join("")}</div>`
    : `<p class="muted-note">No vehicles found in the Target Registry or running sheet text.</p>`;

  const specialProjectsHtml = specialProjects.length
    ? `<div class="chip-list">${specialProjects
        .map(
          p =>
            `<span class="chip"><strong>${esc(p.key)}</strong>${p.detail.trim() ? `<span class="chip-detail"> — ${esc(p.detail)}</span>` : ""}</span>`
        )
        .join("")}</div>`
    : `<p class="muted-note">None recorded.</p>`;

  const objectivesHtml = objectives.length
    ? `<ol class="numbered-list">${objectives.map(o => `<li>${esc(o)}</li>`).join("")}</ol>`
    : `<p class="muted-note">None recorded.</p>`;

  const criticalDecisionsHtml = criticalDecisions.length
    ? `<ol class="numbered-list">${criticalDecisions.map(d => `<li>${esc(d)}</li>`).join("")}</ol>`
    : `<p class="muted-note">None recorded.</p>`;

  const summaryHtml = entries.length
    ? `<table class="summary-table">
        <thead><tr><th style="width:70px">Time</th><th style="width:28%">Address</th><th>Observation</th></tr></thead>
        <tbody>${entries
          .map(
            e =>
              `<tr><td>${esc(e.time || "—")}</td><td>${esc(e.location || "")}</td><td>${esc(e.text)}</td></tr>`
          )
          .join("")}</tbody>
      </table>`
    : `<p class="muted-note">No running sheet rows yet.</p>`;

  const communicationParts = [
    form.ioContactTiming.trim(),
    form.ioContactMethod.trim(),
  ].filter(Boolean);

  const statusPillHtml = record?.completedAt
    ? `<span class="status-pill status-complete">&#10003; Complete — ${esc(record.completedByCIN ?? "")}</span>`
    : `<span class="status-pill status-open">In progress</span>`;

  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>RunLog Supervisor Summary — ${esc(sheetTitle)}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
@page{ margin:20mm 15mm; @top-center{content:'PROTECTED';font-family:'Roboto',sans-serif;font-size:12px;font-weight:700;color:#dc2626;letter-spacing:0.08em} @bottom-center{content:"Page " counter(page) " of " counter(pages);font-family:'Roboto',sans-serif;font-size:11px;font-weight:700;color:${BLUE_DARK};letter-spacing:0.04em} }
body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:26px 32px 22px; text-align:center; }
.brand-row { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:14px; opacity:0.85; }
.brand-dot { width:10px; height:10px; border-radius:50%; background:${BLUE_MID}; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID}; }
.main-title { font-size:26px; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; line-height:1.2; }
.op-date-line { font-size:16px; font-weight:600; margin-top:8px; }
.sheet-name { font-size:11px; opacity:0.65; margin-top:6px; }
.status-pill{display:inline-flex;align-items:center;gap:4px;padding:4px 11px;border-radius:9999px;font-size:9px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;margin-top:14px}
.status-complete{background:rgba(134,239,172,0.18);color:#86efac;border:1px solid rgba(134,239,172,0.4)}
.status-open{background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.75);border:1px solid rgba(255,255,255,0.28)}
.page-frame { width:100%; border-collapse:collapse; }
.page-frame td { padding:0; border:none; }
tfoot { display:table-footer-group; }
.content { padding:20px 32px 8px; }
.section { margin-bottom:14px; border:1px solid ${GREY_BORDER}; border-radius:8px; overflow:hidden; break-inside:avoid; page-break-inside:avoid; }
.section-title { font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:7px 14px; background:${BLUE_LIGHT} !important; border-bottom:1px solid ${GREY_BORDER}; }
.section-body { padding:12px 14px; }
.plain-section { margin-bottom:18px; }
.plain-section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin-bottom:10px; }
.detail-grid { display:grid; grid-template-columns:130px 1fr; gap:0; font-size:10.5px; }
.detail-grid > div { padding:4px 6px; }
.detail-grid > div:nth-child(4n+1), .detail-grid > div:nth-child(4n+2) { background:#f8fafc; }
.detail-label { color:#64748b; font-weight:600; }
.detail-value { color:${GREY_TEXT}; }
.chip-list { display:flex; flex-wrap:wrap; gap:6px; }
.chip { background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; border:1px solid ${BLUE_MID}; border-radius:6px; padding:4px 10px; font-size:10px; font-weight:600; }
.chip-detail { font-weight:400; color:#475569; }
.numbered-list { list-style:none; counter-reset:item; }
.numbered-list li { counter-increment:item; display:flex; align-items:flex-start; gap:8px; margin-bottom:7px; font-size:10.5px; }
.numbered-list li:last-child { margin-bottom:0; }
.numbered-list li::before { content:counter(item); flex-shrink:0; width:16px; height:16px; border-radius:50%; background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; font-size:9px; font-weight:700; display:flex; align-items:center; justify-content:center; margin-top:1px; }
.muted-note { font-size:10px; color:#94a3b8; font-style:italic; }
.summary-table { width:100%; border-collapse:collapse; border:1.5px solid ${BLUE_DARK}; }
.summary-table th { background:${BLUE_LIGHT} !important; color:${BLUE_DARK} !important; font-weight:700; font-size:9.5px; text-transform:uppercase; letter-spacing:0.04em; text-align:left; padding:6px 8px; border-bottom:2px solid ${BLUE_DARK}; border-right:1px solid #c7d5ee; }
.summary-table th:last-child, .summary-table td:last-child { border-right:none; }
.summary-table td { vertical-align:top; font-size:10.5px; padding:6px 8px; border-bottom:1px solid ${GREY_BORDER}; border-right:1px solid ${GREY_BORDER}; }
.summary-table tbody tr:last-child td { border-bottom:none; }
.footer-note { margin:14px 32px 0; padding:12px 0; border-top:1px solid ${GREY_BORDER}; font-size:9px; color:#94a3b8; }
.footer-band { background:${BLUE_DARK} !important; color:#fff !important; padding:8px 32px; display:grid; grid-template-columns:1fr 1fr 1fr; align-items:center; font-size:9px; font-weight:700; letter-spacing:0.04em; }
.footer-band span:first-child { text-align:left; }
.footer-band span:last-child { text-align:right; color:rgba(255,255,255,0.85); text-transform:uppercase; }
.footer-protected { text-align:center; font-weight:800; letter-spacing:0.14em; color:#f87171; text-transform:uppercase; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .section-title { background:${BLUE_LIGHT} !important; } .plain-section-title { background:${BLUE_LIGHT} !important; } .chip { background:${BLUE_LIGHT} !important; } .numbered-list li::before { background:${BLUE_LIGHT} !important; } .summary-table th { background:${BLUE_LIGHT} !important; } .footer-band { background:${BLUE_DARK} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-row"><div class="brand-dot"></div><span class="brand-label">RunLog</span></div>
  <div class="main-title">Supervisor Summary</div>
  <div class="op-date-line">${esc(form.operationName || "—")}${form.dayDate ? ` &middot; ${esc(form.dayDate)}` : ""}</div>
  <div class="sheet-name">${esc(sheetTitle)}</div>
  ${statusPillHtml}
</div>
<table class="page-frame">
<tfoot><tr><td>
  <div class="footer-band">
    <span></span>
    <span class="footer-protected">Protected</span>
    <span>RunLog</span>
  </div>
</td></tr></tfoot>
<tbody><tr><td>
<div class="content">
  ${section(
    "Deployment",
    `<div class="detail-grid">
      ${detailRow("Team", form.teamLabel)}
      ${detailRow("Team Members CIN", form.teamCins)}
      ${detailRow("Start time", form.startTime)}
      ${detailRow("Finish time", form.finishTime)}
      ${detailRow("Target (TGT)", form.targetName)}
      ${detailRow("Location", form.location)}
    </div>`
  )}
  ${section("Vehicle", vehiclesHtml)}
  ${section(
    "Investigator",
    form.ioSupport.trim() ||
      communicationParts.length ||
      form.intelSupport.trim()
      ? `<div class="detail-grid">
          ${detailRow("Investigator", form.ioSupport)}
          ${communicationParts.length ? detailRow("Contacted", communicationParts.join(" — ")) : ""}
          ${detailRow("Intel Support", form.intelSupport)}
        </div>`
      : `<p class="muted-note">None recorded.</p>`
  )}
  ${section("Special Projects", specialProjectsHtml)}
  ${section("Objectives", objectivesHtml)}
  ${section("Critical Decisions", criticalDecisionsHtml)}
  ${plainSection("Summary", summaryHtml)}
  ${section("Issues", form.issues.trim() ? `<p>${esc(form.issues)}</p>` : "")}
  <div class="footer-note">
    <span>Generated: ${generatedAt}</span>
  </div>
</div>
</td></tr></tbody>
</table>
${buildExportPreviewCloseBar()}
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Pop-up blocked. Please allow pop-ups and try again.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SheetSummaryPage() {
  const { sheetId: sheetIdParam } = useParams<{ sheetId: string }>();
  const sheetId = parseInt(sheetIdParam, 10);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { user } = useAuth();

  const { data: sheet } = trpc.sheet.get.useQuery(
    { id: sheetId },
    { enabled: !!sheetId }
  );
  const sheetIsClosed = !!(sheet as { closedAt?: number | null } | undefined)
    ?.closedAt;
  const operationId = (sheet as { operationId?: number } | undefined)
    ?.operationId;

  const sheetCins: { cin: string; isTeamLeader?: boolean }[] = (() => {
    const raw = (sheet as { sheetCins?: string | null } | undefined)?.sheetCins;
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  })();
  const isTeamLeader = sheetCins.some(
    c =>
      c.isTeamLeader && c.cin.toUpperCase() === (user?.cin ?? "").toUpperCase()
  );
  const canComplete = user?.role === "admin" || isTeamLeader;

  const { data: record, isLoading } = trpc.summary.getBySheet.useQuery(
    { sheetId },
    { enabled: !!sheetId }
  );
  const isComplete = !!record?.completedAt;
  const isLocked = sheetIsClosed || isComplete;

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

  const addEntryMutation = trpc.summary.addEntry.useMutation({
    onSuccess: () => utils.summary.getEntries.invalidate({ sheetId }),
    onError: () => toast.error("Failed to add summary line"),
  });
  const updateEntryMutation = trpc.summary.updateEntry.useMutation({
    onError: () => toast.error("Failed to save summary line"),
  });
  const setEntryTimeMutation = trpc.summary.setEntryTime.useMutation({
    onSuccess: () => utils.summary.getEntries.invalidate({ sheetId }),
    onError: () => toast.error("Failed to set line time"),
  });
  const deleteEntryMutation = trpc.summary.deleteEntry.useMutation({
    onSuccess: () => utils.summary.getEntries.invalidate({ sheetId }),
    onError: () => toast.error("Failed to delete summary line"),
  });

  const completeMutation = trpc.summary.complete.useMutation({
    onSuccess: () => {
      utils.summary.getBySheet.invalidate({ sheetId });
      toast.success("Summary marked complete");
    },
    onError: e => toast.error(e.message || "Failed to complete summary"),
  });
  const reopenMutation = trpc.summary.reopen.useMutation({
    onSuccess: () => {
      utils.summary.getBySheet.invalidate({ sheetId });
      toast.success("Summary reopened");
    },
    onError: e => toast.error(e.message || "Failed to reopen summary"),
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
    if (isLocked) return;
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
    if (isLocked) return;
    setEntryDrafts(prev => ({ ...prev, [id]: value }));
    if (entryTimeoutsRef.current[id])
      clearTimeout(entryTimeoutsRef.current[id]);
    entryTimeoutsRef.current[id] = setTimeout(() => {
      updateEntryMutation.mutate({ sheetId, id, text: value });
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
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
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
          <button
            onClick={() =>
              exportSummaryToPDF({
                sheetTitle: sheet?.title ?? "Running Sheet",
                form,
                vehicles: vehicles ?? [],
                entries: entries ?? [],
                record,
              })
            }
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shrink-0"
          >
            <Download className="w-4 h-4" />
            Export PDF
          </button>
        </div>

        {sheetIsClosed && (
          <div className="mb-4 rounded-lg border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800/60 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              This running sheet is closed — the summary is read-only.
            </p>
          </div>
        )}

        {/* Summary Complete lock */}
        <div className="mb-4 rounded-xl border border-border/60 bg-card p-4 flex items-center justify-between gap-3">
          <div>
            {isComplete ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                <Lock className="w-4 h-4" />
                Summary Complete — CIN {record?.completedByCIN}
                {record?.completedAt && (
                  <span className="font-normal text-muted-foreground">
                    {format(new Date(record.completedAt), "d MMM yyyy h:mmaaa")}
                  </span>
                )}
              </div>
            ) : (
              <label
                className={`flex items-center gap-2 text-sm ${canComplete && !sheetIsClosed ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                title={
                  !canComplete
                    ? "Only the listed Team Leader or an Admin can complete this summary"
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={false}
                  disabled={
                    !canComplete || sheetIsClosed || completeMutation.isPending
                  }
                  onChange={() => completeMutation.mutate({ sheetId })}
                  className="w-4 h-4 rounded border-border"
                />
                Summary Complete
              </label>
            )}
            {!isComplete && record?.reopenedAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Reopened by CIN {record.reopenedByCIN} —{" "}
                {format(new Date(record.reopenedAt), "d MMM yyyy h:mmaaa")}
              </p>
            )}
          </div>
          {isComplete &&
            (user?.role === "member" || user?.role === "admin") && (
              <button
                onClick={() => reopenMutation.mutate({ sheetId })}
                disabled={reopenMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shrink-0"
              >
                <Unlock className="w-3.5 h-3.5" />
                Reopen
              </button>
            )}
        </div>

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
                disabled={isLocked}
              />
              <FieldInput
                label="Team Members CIN"
                value={form.teamCins}
                onChange={v => handleChange("teamCins", v)}
                disabled={isLocked}
              />
              <div className="grid grid-cols-2 gap-4">
                <FieldInput
                  label="Operation"
                  value={form.operationName}
                  onChange={v => handleChange("operationName", v)}
                  disabled={isLocked}
                />
                <FieldInput
                  label="Day / Date"
                  value={form.dayDate}
                  onChange={v => handleChange("dayDate", v)}
                  disabled={isLocked}
                />
                <FieldInput
                  label="Start time"
                  value={form.startTime}
                  onChange={v => handleChange("startTime", v)}
                  disabled={isLocked}
                />
                <FieldInput
                  label="Finish time"
                  value={form.finishTime}
                  onChange={v => handleChange("finishTime", v)}
                  disabled={isLocked}
                />
              </div>
              <FieldInput
                label="Target (TGT)"
                value={form.targetName}
                onChange={v => handleChange("targetName", v)}
                disabled={isLocked}
              />
              <FieldInput
                label="Location"
                value={form.location}
                onChange={v => handleChange("location", v)}
                disabled={isLocked}
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
                        {!isLocked && (
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
                label="Investigator"
                value={form.ioSupport}
                onChange={v => handleChange("ioSupport", v)}
                disabled={isLocked}
                listOptions={ioSupportHistory}
              />

              {/* Investigator Communication — when/how the investigator was contacted */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <SectionLabel>When contacted</SectionLabel>
                  <select
                    value={form.ioContactTiming}
                    disabled={isLocked}
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
                    disabled={isLocked}
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

              <FieldInput
                label="Intel Support"
                value={form.intelSupport}
                onChange={v => handleChange("intelSupport", v)}
                disabled={isLocked}
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
                          disabled={isLocked}
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
                          disabled={isLocked}
                          placeholder={
                            SPECIAL_PROJECT_PLACEHOLDERS[p.key] ?? "Details"
                          }
                          className="text-sm"
                        />
                      </div>
                    ))}
                  </div>
                )}
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
                        disabled={isLocked}
                        className="text-sm"
                      />
                      {!isLocked && (
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
                {!isLocked && (
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
                        disabled={isLocked}
                        rows={2}
                        className="text-sm resize-none"
                      />
                      {!isLocked && (
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
                {!isLocked && (
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
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => addEntryMutation.mutate({ sheetId })}
                    disabled={addEntryMutation.isPending}
                    className="mb-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                )}
                {entries && entries.length > 0 && (
                  <div className="rounded-lg border border-border/60 overflow-hidden">
                    <div className="grid grid-cols-[6.5rem_1fr_2rem] bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/60">
                      <span>Time</span>
                      <span>Text</span>
                      <span />
                    </div>
                    <div className="divide-y divide-border/50">
                      {entries.map(entry => (
                        <div
                          key={entry.id}
                          className="grid grid-cols-[6.5rem_1fr_2rem] items-start gap-2 px-3 py-2"
                        >
                          {entry.rowId == null ? (
                            <SummaryTimePicker
                              value={entry.time ?? null}
                              disabled={isLocked}
                              onSave={(display, minutes) =>
                                setEntryTimeMutation.mutate({
                                  sheetId,
                                  id: entry.id,
                                  time: display,
                                  timeMinutes: minutes,
                                })
                              }
                            />
                          ) : (
                            <span className="text-sm font-mono text-muted-foreground px-1 py-0.5">
                              {entry.time ?? "—"}
                            </span>
                          )}
                          <Textarea
                            value={entryDrafts[entry.id] ?? entry.text}
                            onChange={e =>
                              handleEntryChange(entry.id, e.target.value)
                            }
                            disabled={isLocked}
                            rows={2}
                            className="text-sm resize-none"
                          />
                          {!isLocked && (
                            <button
                              type="button"
                              onClick={() =>
                                deleteEntryMutation.mutate({
                                  sheetId,
                                  id: entry.id,
                                })
                              }
                              className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-1.5"
                              aria-label="Remove summary line"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {entries && entries.length === 0 && (
                  <p className="text-sm text-muted-foreground/70 italic">
                    No running sheet rows yet.
                  </p>
                )}
              </div>

              <FieldTextarea
                label="Issues"
                value={form.issues}
                onChange={v => handleChange("issues", v)}
                disabled={isLocked}
              />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
