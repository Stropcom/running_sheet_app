import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DashboardLayout from "@/components/DashboardLayout";
import SubObservationBlock from "@/components/SubObservationBlock";
import CinInput from "@/components/CinInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Lock,
  Unlock,
  Plus,
  Trash2,
  UserPlus,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ShieldCheck,
  Clock,
  Download,
  FileText,
  Pencil,
  Camera,
  X,
  Search,
  Users,
  ArrowUpDown,
  Target,
  ClipboardCheck,
  LockKeyhole,
  LockKeyholeOpen,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

type Member = { id: number; rowId: number; memberName: string; createdAt: Date };
type Certification = {
  id: number;
  rowId: number;
  memberId: number;
  certifiedByUserId: number;
  certifiedByName: string;
  certifiedAt: number;
  isActive: boolean;
};
type SheetRow = {
  id: number;
  sheetId: number;
  rowNumber: number;
  time: string | null;
  observation: string | null;
  isLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
  members: Member[];
  certifications: Certification[];
};

// ─── Export Helpers ─────────────────────────────────────────────────────────

type ExportRow = {
  id: number;
  rowNumber: number;
  time: string | null;
  observation: string | null;
  isLocked: boolean;
  members: { id: number; memberName: string }[];
  certifications: { memberId: number; certifiedByName: string; certifiedAt: number; isActive: boolean }[];
};

type OperationMeta = {
  name: string;
  promisNumber?: string | null;
  imsNumber?: string | null;
  investigationUnit?: string | null;
  createdAt: Date;
} | null;

type CinEntry = { cin: string; hasImages: boolean; isTeamLeader?: boolean; isAuthor?: boolean };

function exportToPDF(
  sheetTitle: string,
  rows: ExportRow[],
  operation: OperationMeta,
  sheetCinsRaw: string | null,
  sheetCreatedAt: Date,
  targetFullName?: string | null,
) {
  const certColor = "#22c55e";
  const lockedBg = "#0f2a1a";
  const cb = "border-right:1px solid #334155";
  const bb = "border-bottom:1px solid #1e293b";

  // Parse TEAM roster — sort: TL first, then numerically
  let cinRoster: CinEntry[] = [];
  try {
    const raw: CinEntry[] = sheetCinsRaw ? JSON.parse(sheetCinsRaw) : [];
    cinRoster = [...raw].sort((a, b) => {
      if (a.isTeamLeader && !b.isTeamLeader) return -1;
      if (!a.isTeamLeader && b.isTeamLeader) return 1;
      const aNum = parseInt(a.cin, 10); const bNum = parseInt(b.cin, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.cin.localeCompare(b.cin);
    });
  } catch { cinRoster = []; }

  // ── Page header (repeats on every page) ─────────────────────────────────────
  const operationName = operation?.name ?? "";
  const dateStr = format(new Date(sheetCreatedAt), "d MMMM yyyy");

  // Derive the author CIN from the roster (isAuthor flag)
  const authorEntry = cinRoster.find((c) => c.isAuthor);
  const authorCin = authorEntry?.cin ?? null;

  // Find the most recent active certification belonging to the author CIN
  let preparedByCell = "";
  if (authorCin) {
    let latestCert: { certifiedByCIN?: string; certifiedByName: string; certifiedAt: number } | null = null;
    for (const row of rows) {
      for (const cert of row.certifications) {
        if (!cert.isActive) continue;
        const certCin = ('certifiedByCIN' in cert ? (cert as any).certifiedByCIN : null) || cert.certifiedByName;
        if (certCin === authorCin) {
          if (!latestCert || cert.certifiedAt > latestCert.certifiedAt) {
            latestCert = cert as any;
          }
        }
      }
    }
    if (latestCert) {
      const certCin = ('certifiedByCIN' in latestCert ? (latestCert as any).certifiedByCIN : null) || latestCert.certifiedByName;
      const certTime = format(new Date(latestCert.certifiedAt), "d MMMM yyyy h:mmaaa");
      preparedByCell = `<span style='color:#22c55e;white-space:nowrap'>&#10003; ${certCin} &nbsp;<span style='color:#555;font-size:10px'>${certTime}</span></span>`;
    } else {
      // Author exists but hasn't certified yet — show CIN without tick
      preparedByCell = `<span style='color:#000'>${authorCin}</span>`;
    }
  }

  const pageHeader = `
    <div class="page-header">
      <div class="page-title">WC SURVEILLANCE RUNNING SHEET</div>
      <table class="meta-table">
        <tbody>
          <tr>
            <td class="meta-label">OPERATION:</td>
            <td class="meta-value">${operationName}</td>
          </tr>
          <tr>
            <td class="meta-label">TARGET:</td>
            <td class="meta-value">${targetFullName ?? ""}</td>
          </tr>
          <tr>
            <td class="meta-label">DATE:</td>
            <td class="meta-value">${dateStr}</td>
          </tr>
          ${authorCin ? `<tr>
            <td class="meta-label">PREPARED BY:</td>
            <td class="meta-value">${preparedByCell}</td>
          </tr>` : ""}
        </tbody>
      </table>
    </div>`;

  // ── Running sheet table ──────────────────────────────────────────────────────
  // Spacer row inserted after each log entry for breathing room
  const spacerRow = `<tr><td colspan="3" style="padding:0;height:8px;border:none;background:transparent"></td></tr>`;

  const tableRows = rows.map((row) => {
    const rowBg = row.isLocked ? lockedBg : "transparent";
    // Build sub-observation HTML (indented beneath main obs)
    const subObsHtml = (row as any).subObservations?.length
      ? (row as any).subObservations.map((sub: any) => {
          const subCinCerts = (sub.members ?? []).map((sm: any) => {
            const cert = (sub.certifications ?? []).find((c: any) => c.memberId === sm.id);
            const certStr = cert
              ? `<span style='color:${certColor};white-space:nowrap'>&#10003; ${cert.certifiedByCIN || cert.certifiedByName} <span style='color:#555;font-size:10px'>${format(new Date(cert.certifiedAt), "dd/MM/yy h:mmaaa")}</span></span>`
              : `<span style='color:#ef4444'>${sm.memberName} — Pending</span>`;
            return certStr;
          }).join(" &nbsp;|&nbsp; ");
          return `<div style='margin-top:4px;padding:3px 6px 3px 16px;border-left:2px solid #cbd5e1;font-size:11px;color:#000'>
            <span style='font-style:italic'>${(sub.observation ?? "").replace(/\n/g, "<br/>")}</span>
            ${subCinCerts ? `<div style='margin-top:2px;font-size:10px'>${subCinCerts}</div>` : ""}
          </div>`;
        }).join("")
      : "";

    if (row.members.length === 0) {
      return `<tr style="background:${rowBg}">
        <td style="padding:6px 6px 8px;${bb};${cb};font-family:monospace;font-size:11px;white-space:nowrap">${row.time ?? ""}</td>
        <td style="padding:6px 6px 8px;${bb};${cb}">${row.observation ?? ""}${subObsHtml}</td>
        <td style="padding:6px 6px 8px;${bb};font-size:11px"></td>
      </tr>${spacerRow}`;
    }
    // Render one <tr> per member so CIN and Certified columns align perfectly
    const memberRows = row.members.map((m, idx) => {
      const cert = row.certifications.find((c) => c.memberId === m.id && c.isActive);
      const certCell = cert
        ? `<span style='color:${certColor};white-space:nowrap'>&#10003; ${'certifiedByCIN' in cert ? (cert as any).certifiedByCIN || cert.certifiedByName : cert.certifiedByName} &nbsp; <span style='color:#94a3b8;font-size:10px'>${format(new Date(cert.certifiedAt), "dd/MM/yy h:mmaaa")}</span></span>`
        : `<span style='color:#ef4444'>Pending</span>`;
      const isFirst = idx === 0;
      const rowspan = row.members.length;
      const timeTd = isFirst
        ? `<td style="padding:6px 6px 8px;${bb};${cb};font-family:monospace;font-size:11px;white-space:nowrap" rowspan="${rowspan}">${row.time ?? ""}</td>`
        : "";
      const obsTd = isFirst
        ? `<td style="padding:6px 6px 8px;${bb};${cb}" rowspan="${rowspan}">${(row.observation ?? "").replace(/\n/g, "<br/>")}${subObsHtml}</td>`
        : "";
      // Only draw bottom border on the last member row; no inner lines between members
      const isLast = idx === row.members.length - 1;
      const memberBb = isLast ? bb : "border-bottom:none";
      // Top/bottom padding: generous on first/last, tight on inner member rows
      const pt = isFirst ? "6px" : "2px";
      const pb = isLast ? "8px" : "2px";
      // Build CIN Certified cell: tick + certifier CIN + date only
      const certifierCIN = cert ? ('certifiedByCIN' in cert ? (cert as any).certifiedByCIN || cert.certifiedByName : cert.certifiedByName) : null;
      const cinCertCell = cert
        ? `<span style='color:${certColor};white-space:nowrap'>&#10003; ${certifierCIN} <span style='color:#555;font-size:10px'>${format(new Date(cert.certifiedAt), "dd/MM/yy h:mmaaa")}</span></span>`
        : `<span style='color:#ef4444'>Pending</span>`;
      return `<tr style="background:${rowBg}">
        ${timeTd}${obsTd}
        <td style="padding:${pt} 6px ${pb} 6px;${memberBb};font-size:11px">${cinCertCell}</td>
      </tr>`;
    }).join("");
    return memberRows + spacerRow;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>${sheetTitle}</title>
  <style>
    @page{
      margin:20mm 15mm;
      @top-center{content:'PROTECTED';font-family:system-ui,sans-serif;font-size:12px;font-weight:700;color:#dc2626;letter-spacing:0.08em}
      @bottom-center{content:'PROTECTED';font-family:system-ui,sans-serif;font-size:12px;font-weight:700;color:#dc2626;letter-spacing:0.08em}
    }
    body{font-family:system-ui,sans-serif;background:#fff;color:#000;margin:0;padding:0;font-size:12px}
    .page-header{text-align:left;margin-bottom:10px}
    .page-title{font-size:20px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;text-align:center;margin-bottom:1.2em}
    .meta-table{width:100%;border-collapse:collapse;border:1px solid #334155;margin-bottom:12px;table-layout:auto}
    .meta-label{padding:5px 8px;font-weight:700;font-size:11px;white-space:nowrap;background:#f1f5f9;border:1px solid #cbd5e1;text-transform:uppercase;width:1%;color:#000}
    .meta-value{padding:5px 8px;font-size:11px;border:1px solid #cbd5e1;color:#000}
    table.log-table{width:100%;border-collapse:collapse;table-layout:auto;border:1px solid #334155}
    col.c-time{width:80px}
    col.c-obs{width:auto}
    col.c-cert{width:1%;white-space:nowrap}
    .log-table th{background:#f1f5f9;color:#000;font-weight:700;padding:6px;text-align:left;
       border-bottom:2px solid #334155;border-right:1px solid #334155;overflow:hidden}
    .log-table th:last-child,.log-table td:last-child{border-right:none}
    .log-table td{vertical-align:top;word-break:break-word;overflow:hidden;color:#000}
    .log-table td:last-child{white-space:nowrap;word-break:normal}
  </style></head><body>
  ${pageHeader}
  <table class="log-table">
    <colgroup>
      <col class="c-time"/>
      <col class="c-obs"/>
      <col class="c-cert"/>
    </colgroup>
    <thead><tr>
      <th>Time</th>
      <th>Observation</th>
      <th>CIN Certified</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) { toast.error("Pop-up blocked. Please allow pop-ups and try again."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// ─── Member Cell ──────────────────────────────────────────────────────────────

function MemberCell({
  row,
  canEdit,
  onAddMember,
  onRemoveMember,
  rosterCins,
}: {
  row: SheetRow;
  canEdit: boolean;
  onAddMember: (rowId: number, name: string) => void;
  onRemoveMember: (memberId: number, rowId: number) => void;
  rosterCins?: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNameValid, setNewNameValid] = useState(false);

  const handleAdd = () => {
    if (!newName.trim()) return;
    const val = newName.trim();
    // If user typed 'team' (case-insensitive), expand to all roster CINs
    if (val.toLowerCase() === "team" && rosterCins && rosterCins.length > 0) {
      const existingNames = new Set(row.members.map((m) => m.memberName.toLowerCase()));
      rosterCins
        .filter((cin) => !existingNames.has(cin.toLowerCase()))
        .forEach((cin) => onAddMember(row.id, cin));
      setNewName("");
      setAdding(false);
      return;
    }
    onAddMember(row.id, val);
    setNewName("");
    setAdding(false);
  };

  // Fixed row height — must match CertifyCell's ROW_H
  const ROW_H = "h-8";

  return (
    <div className="flex flex-col min-w-[40px]">
      {row.members.map((member) => {
        const cert = row.certifications.find((c) => c.memberId === member.id && c.isActive);
        return (
          <div
            key={member.id}
            className={`flex items-center gap-1 group/member ${ROW_H}`}
          >
            <span className={`text-sm font-mono font-medium flex-1 min-w-0 ${cert ? "text-[var(--certified-color)]" : "text-foreground"}`}>
              {member.memberName}
            </span>
            {canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6 opacity-0 group-hover/member:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => onRemoveMember(member.id, row.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Remove this CIN</TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      })}

      {/* Add member */}
      {canEdit && !row.isLocked && (
        adding ? (
          <div className="flex flex-col gap-1.5">
            {rosterCins && rosterCins.length > 0 ? (
              /* Dropdown mode: pick from team roster */
              <div className="flex items-center gap-1.5">
                <Select
                  value={newName}
                  onValueChange={(v) => {
                    if (v === "__all__") {
                      const existingNames = new Set(row.members.map((m) => m.memberName.toLowerCase()));
                      rosterCins
                        .filter((cin) => !existingNames.has(cin.toLowerCase()))
                        .forEach((cin) => onAddMember(row.id, cin));
                      setAdding(false);
                    } else {
                      onAddMember(row.id, v);
                      setNewName("");
                      setAdding(false);
                    }
                  }}
                >
                  <SelectTrigger className="h-7 text-xs flex-1 min-w-[120px]">
                    <SelectValue placeholder="Pick a CIN…" />
                  </SelectTrigger>
                  <SelectContent>
                    {rosterCins
                      .filter((cin) => !row.members.some((m) => m.memberName.toLowerCase() === cin.toLowerCase()))
                      .map((cin) => (
                        <SelectItem key={cin} value={cin} className="font-mono text-xs">{cin}</SelectItem>
                      ))}
                    {rosterCins.filter((cin) => !row.members.some((m) => m.memberName.toLowerCase() === cin.toLowerCase())).length > 1 && (
                      <SelectItem value="__all__" className="text-xs font-medium text-primary">
                        ★ Add all team CINs
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => { setAdding(false); setNewName(""); }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              /* Free-text mode: validated against registered users */
              <div className="flex items-center gap-1.5">
                <CinInput
                  autoFocus
                  placeholder="Enter CIN"
                  value={newName}
                  onChange={setNewName}
                  onValidCin={(cin) => { setNewName(cin); setNewNameValid(true); }}
                  onInvalidCin={() => setNewNameValid(false)}
                  showValidation
                  className="h-7 text-xs px-2"
                />
                <Button size="icon" className="h-7 w-7 shrink-0" onClick={handleAdd} disabled={!newNameValid}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mt-0.5 w-fit"
          >
            <UserPlus className="w-3 h-3" />
            Add CIN
          </button>
        )
      )}
    </div>
  );
}

// ─── Certify Column ───────────────────────────────────────────────────────────


function CertifyCell({
  row,
  canCertify,
  onCertify,
  onUncertify,
  onUncertifyAll,
  onDeleteRow,
}: {
  row: SheetRow;
  canCertify: boolean;
  onCertify: (rowId: number, memberId: number) => void;
  onUncertify: (rowId: number, memberId: number) => void;
  onUncertifyAll: (rowId: number) => void;
  onDeleteRow?: (rowId: number) => void;
}) {
  const total = row.members.length;
  const certified = row.certifications.filter((c) => c.isActive).length;

  if (total === 0) {
    return <span className="text-xs text-muted-foreground italic">No members</span>;
  }

  // Height of each member sub-row — must match MemberCell's member row height
  const ROW_H = "h-8";

  return (
    <div className="flex flex-col items-center">
      {/* One row per member — same fixed height as MemberCell member rows */}
      {row.members.map((m) => {
        const cert = row.certifications.find((c) => c.memberId === m.id && c.isActive);
        return (
          <div key={m.id} className={`flex flex-col items-center justify-center ${ROW_H} w-full`}>
            {/* Shield: single certify/uncertify toggle — no cross, just the shield */}
            {cert ? (
              /* Certified: green shield + certifier CIN side by side */
              <div className="flex items-center justify-center gap-1">
                {canCertify && !row.isLocked ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 shrink-0 text-emerald-500 hover:text-red-400 hover:bg-red-400/10"
                        onClick={() => onUncertify(row.id, m.id)}
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Uncertify {m.memberName}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500" />
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs font-mono font-medium text-emerald-500 cursor-default">
                      {(cert as any).certifiedByCIN || cert.certifiedByName}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">Certified by {(cert as any).certifiedByCIN || cert.certifiedByName}</span>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(cert.certifiedAt), "MMM d, yyyy HH:mm:ss")}
                      </span>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : (
              /* Uncertified: red shield centred, "Certify" label below */
              <div className="flex flex-col items-center justify-center gap-0">
                {canCertify && !row.isLocked ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 shrink-0 text-red-500 hover:text-emerald-500 hover:bg-emerald-500/10"
                        onClick={() => onCertify(row.id, m.id)}
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Certify {m.memberName}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <ShieldCheck className="w-4 h-4 shrink-0 text-red-500" />
                )}
                <span className="text-[10px] leading-none text-red-500 font-medium">Certify</span>
              </div>
            )}
          </div>
        );
      })}

      {/* Summary — at the bottom */}
      <div className="flex items-center justify-center gap-1.5 mt-1 w-full">
        {row.isLocked ? (
          <Badge variant="outline" className="gap-1 text-[var(--certified-color)] border-[var(--locked-border)] bg-[var(--locked-bg)] text-xs py-0 px-1.5">
            <Lock className="w-2.5 h-2.5" />
            Locked
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">{certified}/{total} certified</span>
        )}
      </div>

      {/* Footer actions */}
      {row.isLocked && canCertify && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 mt-1"
              onClick={() => onUncertifyAll(row.id)}
            >
              <Unlock className="w-3 h-3" />
              Uncertify All
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Remove all certifications and unlock row</TooltipContent>
        </Tooltip>
      )}
      {!row.isLocked && onDeleteRow && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 mt-1"
          onClick={() => onDeleteRow(row.id)}
        >
          <Trash2 className="w-3 h-3" />
          Delete row
        </Button>
      )}
    </div>
  );
}

// ─── Time Picker Cell ────────────────────────────────────────────────────────

/** Converts "hh:mm AM/PM" display string to minutes-since-midnight (0-1439) */
function timeStringToMinutes(t: string): number {
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const period = m[3].toUpperCase();
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return h * 60 + min;
}

/** Formats minutes-since-midnight to "hh:mm AM/PM" */
function minutesToTimeString(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const min = mins % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${period}`;
}

function TimePickerCell({
  value,
  locked,
  onSave,
}: {
  value: string | null;
  locked: boolean;
  onSave: (display: string, minutes: number) => void;
}) {
  // Parse existing value into hour/minute/period
  const parsed = useMemo(() => {
    if (!value) return { hour: "12", minute: "00", period: "AM" };
    const m = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return { hour: "12", minute: "00", period: "AM" };
    return { hour: String(parseInt(m[1], 10)), minute: m[2].padStart(2, "0"), period: m[3].toUpperCase() };
  }, [value]);

  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState(parsed.period);
  // Track whether any Radix Select dropdown is currently open
  const [selectOpen, setSelectOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync local state when value prop changes (e.g. row refresh)
  useEffect(() => {
    setHour(parsed.hour);
    setMinute(parsed.minute);
    setPeriod(parsed.period);
  }, [parsed.hour, parsed.minute, parsed.period]);

  // Close picker on outside click — but only when no Radix Select is open
  // (Radix portals render outside popoverRef, so we must ignore those clicks)
  useEffect(() => {
    if (!open || selectOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    // Use capture phase with a small delay so Radix can finish its own close logic first
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, selectOpen]);

  const handleDone = useCallback(() => {
    const display = `${String(parseInt(hour, 10)).padStart(2, "0")}:${minute.padStart(2, "0")} ${period}`;
    const mins = timeStringToMinutes(display);
    onSave(display, mins);
    setOpen(false);
  }, [hour, minute, period, onSave]);

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

  if (locked) {
    return (
      <span className="text-sm font-mono text-muted-foreground">
        {value || <span className="italic opacity-40">—</span>}
      </span>
    );
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        className="flex items-center gap-1.5 text-sm font-mono hover:bg-accent/50 rounded px-1 py-0.5 transition-colors min-w-[90px]"
        onClick={() => setOpen((v) => !v)}
      >
        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {value || <span className="text-muted-foreground/50 italic text-xs">Set time</span>}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-xl p-3">
          <div className="flex items-center gap-2 mb-3">
            {/* Hour */}
            <Select
              value={hour}
              onOpenChange={(o) => setSelectOpen(o)}
              onValueChange={(v) => setHour(v)}
            >
              <SelectTrigger className="w-16 h-8 text-sm font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hours.map((h) => (
                  <SelectItem key={h} value={h} className="font-mono">
                    {String(parseInt(h, 10)).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground font-mono text-lg">:</span>
            {/* Minute */}
            <Select
              value={minute}
              onOpenChange={(o) => setSelectOpen(o)}
              onValueChange={(v) => setMinute(v)}
            >
              <SelectTrigger className="w-16 h-8 text-sm font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {minutes.map((m) => (
                  <SelectItem key={m} value={m} className="font-mono">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* AM/PM */}
            <Select
              value={period}
              onOpenChange={(o) => setSelectOpen(o)}
              onValueChange={(v) => setPeriod(v)}
            >
              <SelectTrigger className="w-16 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AM">AM</SelectItem>
                <SelectItem value="PM">PM</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleDone}
          >
            Done
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Editable Cell ────────────────────────────────────────────────────────────

function EditableCell({
  value,
  locked,
  multiline,
  placeholder,
  onSave,
  shortcuts,
}: {
  value: string | null;
  locked: boolean;
  multiline?: boolean;
  placeholder?: string;
  onSave: (val: string) => void;
  shortcuts?: Record<string, string>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const commit = () => {
    if (draft !== (value ?? "")) onSave(draft);
    setEditing(false);
  };

  /** Auto-expand shortcut triggers on Space or Tab */
  const handleShortcutKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!shortcuts || (e.key !== " " && e.key !== "Tab")) return;
    const textarea = e.currentTarget;
    const pos = textarea.selectionStart ?? 0;
    const textBefore = draft.slice(0, pos);
    // Find the last word before the cursor
    const match = textBefore.match(/(\S+)$/);
    if (!match) return;
    const word = match[1].toLowerCase();
    const expansion = shortcuts[word];
    if (!expansion) return;
    e.preventDefault();
    const before = textBefore.slice(0, textBefore.length - match[1].length);
    const after = draft.slice(pos);
    const newText = before + expansion + " " + after;
    setDraft(newText);
    // Restore cursor position after the expansion
    requestAnimationFrame(() => {
      const newPos = before.length + expansion.length + 1;
      textarea.setSelectionRange(newPos, newPos);
    });
  };

  if (locked) {
    return (
      <span className="text-sm text-muted-foreground whitespace-pre-wrap">
        {value || <span className="italic opacity-40">{placeholder}</span>}
      </span>
    );
  }

  if (editing) {
    if (multiline) {
      return (
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            handleShortcutKeyDown(e as React.KeyboardEvent<HTMLTextAreaElement>);
            if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
          }}
          className="text-sm min-h-[60px] resize-none"
          placeholder={placeholder}
        />
      );
    }
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
        className="h-8 text-sm"
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      className="text-sm cursor-text hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 min-h-[1.75rem] transition-colors whitespace-pre-wrap"
      onClick={() => setEditing(true)}
    >
      {value || <span className="text-muted-foreground/50 italic text-xs">{placeholder}</span>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SheetDetail() {
  const { id } = useParams<{ id: string }>();
  const sheetId = parseInt(id ?? "0", 10);
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const utils = trpc.useUtils();

  const { data: sheet, isLoading: sheetLoading } = trpc.sheet.get.useQuery(
    { id: sheetId },
    { enabled: isAuthenticated && !!sheetId }
  );

  const { data: rows, isLoading: rowsLoading } = trpc.row.list.useQuery(
    { sheetId },
    { enabled: isAuthenticated && !!sheetId, refetchInterval: 10000 }
  );

  const invalidateRows = useCallback(() => utils.row.list.invalidate({ sheetId }), [utils, sheetId]);

  const addRow = trpc.row.create.useMutation({
    onSuccess: invalidateRows,
    onError: (e) => toast.error(e.message),
  });

  const updateRow = trpc.row.update.useMutation({
    onSuccess: invalidateRows,
    onError: (e) => toast.error(e.message),
  });

  const deleteRow = trpc.row.delete.useMutation({
    onSuccess: invalidateRows,
    onError: (e) => toast.error(e.message),
  });

  const addMember = trpc.member.add.useMutation({
    onSuccess: invalidateRows,
    onError: (e) => toast.error(e.message),
  });

  const removeMember = trpc.member.remove.useMutation({
    onSuccess: invalidateRows,
    onError: (e) => toast.error(e.message),
  });

  const certify = trpc.certification.certify.useMutation({
    onSuccess: (data) => {
      invalidateRows();
      if (data.rowLocked) toast.success("All members certified — row locked");
      else toast.success("Member certified");
    },
    onError: (e) => toast.error(e.message),
  });

  const uncertify = trpc.certification.uncertify.useMutation({
    onSuccess: () => { invalidateRows(); toast.success("Certification removed — row unlocked"); },
    onError: (e) => toast.error(e.message),
  });

  const uncertifyAll = trpc.certification.uncertifyAll.useMutation({
    onSuccess: () => { invalidateRows(); toast.success("All certifications removed — row unlocked"); },
    onError: (e) => toast.error(e.message),
  });

  const certifyAllForCin = trpc.certification.certifyAllForCin.useMutation({
    onSuccess: (data) => {
      invalidateRows();
      toast.success(`Certified ${data.certifiedCount} row(s) across the sheet`);
    },
    onError: (e) => toast.error(e.message),
  });

  // Fetch governance record to check completion for Close button
  const { data: govRecord } = trpc.governance.getBySheet.useQuery(
    { sheetId },
    { enabled: isAuthenticated && !!sheetId }
  );

  // Close / Reopen mutations
  const closeSheet = trpc.sheet.close.useMutation({
    onSuccess: () => { utils.sheet.get.invalidate({ id: sheetId }); toast.success("Running sheet closed and locked."); },
    onError: (e) => toast.error(e.message),
  });
  const reopenSheet = trpc.sheet.reopen.useMutation({
    onSuccess: () => { utils.sheet.get.invalidate({ id: sheetId }); toast.success("Running sheet reopened."); },
    onError: (e) => toast.error(e.message),
  });

  const isClosed = !!sheet?.closedAt;
  const canManageClose = user?.role === "member" || user?.role === "admin";

  // All rows certified check (same logic as Governance.tsx allSigned)
  const allRowsCertified = useMemo(() => {
    if (!rows || rows.length === 0) return false;
    return rows.every((r) => {
      const members = r.members ?? [];
      if (members.length === 0) return true;
      return members.every((m) =>
        (r.certifications ?? []).some((c) => c.memberId === m.id && c.isActive)
      );
    });
  }, [rows]);

  // Governance complete check
  const govComplete = useMemo(() => {
    if (!govRecord) return false;
    const g = govRecord as Record<string, unknown>;
    const tlDone = !!(g.summaryNotification) && !!(g.sentToIO);
    const opDone = !!(g.savedAsWord) && !!(g.savedAsPdf) && !!(g.uploadedToPromis) && !!(g.savedInOpFolder);
    return tlDone && opDone;
  }, [govRecord]);

  const canCloseSheet = canManageClose && allRowsCertified && govComplete && !isClosed;

  const canEdit = !isClosed && (user?.role === "member" || user?.role === "admin" || user?.role === "observer");
  const canCertify = !isClosed && (user?.role === "member" || user?.role === "admin");

  // Parse daily roster CINs for team expansion and Certify All
  // Sort: Team Leader first, then all others in numeric/alphabetic order
  const parsedRoster = useMemo(() => {
    try {
      const raw = sheet?.sheetCins ? (JSON.parse(sheet.sheetCins) as CinEntry[]) : [];
      return [...raw].sort((a, b) => {
        if (a.isTeamLeader && !b.isTeamLeader) return -1;
        if (!a.isTeamLeader && b.isTeamLeader) return 1;
        // Numeric sort: extract leading digits for comparison
        const aNum = parseInt(a.cin, 10);
        const bNum = parseInt(b.cin, 10);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.cin.localeCompare(b.cin);
      });
    } catch { return []; }
  }, [sheet?.sheetCins]);
  const rosterCinList = useMemo(() => parsedRoster.map((e) => e.cin), [parsedRoster]);

  // Compute which CINs have ALL their rows certified
  const cinFullyCertified = useMemo(() => {
    if (!rows || rows.length === 0) return new Set<string>();
    const certified = new Set<string>();
    for (const entry of parsedRoster) {
      const cin = entry.cin;
      // Find all rows where this CIN is a member
      const relevantRows = rows.filter((r) => r.members.some((m) => m.memberName === cin));
      if (relevantRows.length === 0) continue; // not in any row yet
      const allCertified = relevantRows.every((r) =>
        r.members
          .filter((m) => m.memberName === cin)
          .every((m) => r.certifications.some((c) => c.memberId === m.id && c.isActive))
      );
      if (allCertified) certified.add(cin);
    }
    return certified;
  }, [rows, parsedRoster]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortReversed, setSortReversed] = useState(false);

  // Edit sheet state
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editTargetName, setEditTargetName] = useState("");
  const [editTargetMode, setEditTargetMode] = useState<"none" | "new" | "link">("none");
  const [editNewTargetName, setEditNewTargetName] = useState("");
  const [editSelectedTargetId, setEditSelectedTargetId] = useState<number | null>(null);

  // Target selector
  const { data: operationTargets } = trpc.target.list.useQuery(
    { operationId: sheet?.operationId ?? 0 },
    { enabled: !!sheet?.operationId }
  );
  // All targets across all operations for the cross-op picker
  const { data: allUsers } = trpc.users.listForCin.useQuery(undefined, { enabled: isAuthenticated });

  const { data: allTargetsForSheet } = trpc.target.listAll.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const [editTargetSearch, setEditTargetSearch] = useState("");
  const setSheetTarget = trpc.target.setSheetTarget.useMutation({
    onSuccess: () => { utils.sheet.get.invalidate({ id: sheetId }); toast.success("Target updated"); },
    onError: (e) => toast.error(e.message),
  });

  // Shortcuts: fetch once and build a trigger→expansion map
  const { data: shortcutsData } = trpc.shortcuts.list.useQuery(undefined, { enabled: isAuthenticated });
  // Per-target shortcuts for the sheet's assigned target
  const { data: targetShortcutsData } = trpc.targetShortcuts.listForSheet.useQuery(
    { sheetId: sheetId! },
    { enabled: !!sheetId && isAuthenticated }
  );
  // Fetch the assigned target directly by ID (works for both legacy and registry targets)
  const { data: assignedTarget } = trpc.target.getById.useQuery(
    { id: sheet?.targetId ?? 0 },
    { enabled: !!sheet?.targetId }
  );
  const shortcutMap = useMemo(() => {
    const map: Record<string, string> = {};
    // Global shortcuts from DB
    for (const s of shortcutsData ?? []) map[s.trigger.toLowerCase()] = s.expansion;
    // Target-aware shortcuts: overlay TGT/HBF/HB/V1F/V1/V2F/V2/DEP/ARR from the assigned target
    if (assignedTarget) {
      const t = assignedTarget;
      if (t.tgt) map['tgt'] = t.tgt;
      if (t.hbf) map['hbf'] = t.hbf;
      if (t.hb)  map['hb']  = t.hb;
      if (t.v1f) map['v1f'] = t.v1f;
      if (t.v1)  map['v1']  = t.v1;
      if (t.v2f) map['v2f'] = t.v2f;
      if (t.v2)  map['v2']  = t.v2;
      if (t.dep) map['dep'] = t.dep;
      if (t.arr) map['arr'] = t.arr;
    }
    // Per-target custom shortcuts (override global if same trigger)
    for (const s of targetShortcutsData ?? []) map[s.trigger.toLowerCase()] = s.expansion;
    return map;
  }, [shortcutsData, targetShortcutsData, assignedTarget]);

  // Edit roster state
  const [editRosterOpen, setEditRosterOpen] = useState(false);
  const [rosterList, setRosterList] = useState<CinEntry[]>([]);
  const [rosterInput, setRosterInput] = useState("");
  const [rosterInputValid, setRosterInputValid] = useState(false);

  const updateSheet = trpc.sheet.update.useMutation({
    onSuccess: () => {
      utils.sheet.get.invalidate({ id: sheetId });
      setEditSheetOpen(false);
      setEditRosterOpen(false);
      toast.success("Sheet updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const [pendingExportType, setPendingExportType] = useState<"pdf" | null>(null);
  const [exportEnabled, setExportEnabled] = useState(false);
  const { data: exportData, isFetching: exportFetching, refetch: refetchExport } = trpc.export.sheetData.useQuery(
    { id: sheetId },
    {
      enabled: isAuthenticated && !!sheetId && exportEnabled,
      staleTime: 0,
    }
  );

  // When export data arrives and there is a pending type, trigger the download
  useEffect(() => {
    if (exportData && pendingExportType && sheet) {
      exportToPDF(
        sheet.title,
        exportData.rows,
        exportData.operation ?? null,
        exportData.sheet.sheetCins ?? null,
        exportData.sheet.createdAt,
        exportData.targetFullName ?? null,
      );
      setPendingExportType(null);
    }
  }, [exportData, pendingExportType, sheet]);

  const openEditSheet = () => {
    setEditTitle(sheet?.title ?? "");
    setEditTargetName(sheet?.targetName ?? "");
    setEditTargetMode("none");
    setEditNewTargetName("");
    setEditTargetSearch("");
    setEditSelectedTargetId(sheet?.targetId ?? null);
    setEditSheetOpen(true);
  };

  const openEditRoster = () => {
    const parsed: CinEntry[] = (() => {
      try { return sheet?.sheetCins ? JSON.parse(sheet.sheetCins) : []; }
      catch { return []; }
    })();
    setRosterList(parsed);
    setRosterInput("");
    setEditRosterOpen(true);
  };

  const handleAddRosterTeam = (teamKey: "TEAM1" | "TEAM2" | "PTT") => {
    if (!allUsers) { toast.error("User list not available"); return; }
    const members = allUsers.filter((u) => u.team === teamKey);
    if (members.length === 0) { toast.error("No members found in that team"); return; }
    let added = 0;
    setRosterList((prev) => {
      let updated = [...prev];
      for (const m of members) {
        if (!updated.some((c) => c.cin.toLowerCase() === m.cin.toLowerCase())) {
          updated = [...updated, { cin: m.cin, hasImages: false, isTeamLeader: false, isAuthor: false }];
          added++;
        }
      }
      return updated;
    });
    if (added === 0) toast.info("All team members already added");
    else toast.success(`Added ${added} member${added !== 1 ? "s" : ""} from ${teamKey.replace("TEAM", "TEAM ")}`);
  };

  const handleAddRosterCin = () => {
    const trimmed = rosterInput.trim().toUpperCase();
    if (!trimmed) return;
    // Must be a registered user
    const registeredCins = new Set((allUsers ?? []).map((u) => u.cin.toUpperCase()));
    if (!registeredCins.has(trimmed)) {
      toast.error(`CIN "${trimmed}" is not a registered user`);
      return;
    }
    if (rosterList.some((c) => c.cin.toUpperCase() === trimmed)) {
      toast.error("CIN already in team");
      return;
    }
    setRosterList((prev) => [...prev, { cin: trimmed, hasImages: false, isTeamLeader: false, isAuthor: false }]);
    setRosterInput("");
    setRosterInputValid(false);
  };

  const handleExport = useCallback(() => {
    if (!sheet) return;
    if (exportData && !exportFetching) {
      setPendingExportType("pdf");
      refetchExport();
      return;
    }
    setPendingExportType("pdf");
    setExportEnabled(true);
  }, [sheet, exportData, exportFetching, refetchExport]);

  if (!isAuthenticated) return null;

  const isLoading = sheetLoading || rowsLoading;

  // Filter rows by search query (time, observation, member names)
  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const filtered = !searchQuery.trim() ? rows : rows.filter((row: NonNullable<typeof rows>[0]) => {
      const q = searchQuery.toLowerCase();
      if (row.time?.toLowerCase().includes(q)) return true;
      if (row.observation?.toLowerCase().includes(q)) return true;
      if (row.members?.some((m: { memberName: string }) => m.memberName.toLowerCase().includes(q))) return true;
      return false;
    });
    // Rows with no time set always float to the top (being filled in)
    const withTime = filtered.filter((row: NonNullable<typeof rows>[0]) => !!row.time);
    const noTime = filtered.filter((row: NonNullable<typeof rows>[0]) => !row.time);
    const sorted = sortReversed ? [...withTime].reverse() : withTime;
    return [...noTime, ...sorted];
  }, [rows, searchQuery, sortReversed]);

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => sheet ? navigate(`/operation/${sheet.operationId}`) : navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex items-center gap-2">
            {sheetLoading ? (
              <Skeleton className="h-7 w-64" />
            ) : (
              <>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-foreground truncate">{sheet?.title}</h1>
                </div>
                {sheet && (
                  <>
                    {!isClosed && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-7 h-7 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={openEditSheet}
                        title="Edit sheet title"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {isClosed && (
                      <Badge variant="secondary" className="gap-1.5 bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0">
                        <LockKeyhole className="w-3 h-3" />
                        CLOSED
                      </Badge>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {/* Close / Reopen button */}
            {canManageClose && (
              isClosed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                      onClick={() => reopenSheet.mutate({ id: sheetId })}
                      disabled={reopenSheet.isPending}
                    >
                      <LockKeyholeOpen className="w-4 h-4" />
                      Reopen
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reopen this running sheet for editing</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className={`gap-2 ${
                        canCloseSheet
                          ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                          : "opacity-40 cursor-not-allowed"
                      }`}
                      onClick={() => canCloseSheet && closeSheet.mutate({ id: sheetId })}
                      disabled={!canCloseSheet || closeSheet.isPending}
                    >
                      <LockKeyhole className="w-4 h-4" />
                      Close Sheet
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {canCloseSheet
                      ? "Close and lock this running sheet"
                      : !allRowsCertified
                        ? "All rows must be certified before closing"
                        : !govComplete
                          ? "Governance must be 100% complete before closing"
                          : "Close sheet"}
                  </TooltipContent>
                </Tooltip>
              )
            )}

            {/* Export dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={exportFetching}
                >
                  <Download className="w-4 h-4" />
                  {exportFetching ? "Preparing..." : "Export"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onClick={() => handleExport()}
                >
                  <FileText className="w-4 h-4 text-rose-400" />
                  Print / Save PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Add row — hidden when sheet is closed */}
            {!isClosed && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => addRow.mutate({ sheetId })}
                disabled={addRow.isPending}
              >
                <Plus className="w-4 h-4" />
                Add Row
              </Button>
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-5 border-b border-border">
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground border-b-2 border-primary -mb-px transition-colors"
          >
            <FileText className="w-4 h-4" />
            Running Sheet
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate(`/governance/${sheetId}`)}
          >
            <ClipboardCheck className="w-4 h-4" />
            Governance
          </button>
        </div>

        {/* Closed banner */}
        {isClosed && sheet && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800/60 px-4 py-3">
            <LockKeyhole className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">This running sheet is closed and locked</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Closed by <span className="font-mono font-semibold">{sheet.closedByCIN}</span>
                {" on "}
                {new Date(sheet.closedAt!).toLocaleString()}
              </p>
            </div>
            {canManageClose && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 shrink-0"
                onClick={() => reopenSheet.mutate({ id: sheetId })}
                disabled={reopenSheet.isPending}
              >
                <LockKeyholeOpen className="w-3.5 h-3.5" />
                Reopen
              </Button>
            )}
          </div>
        )}

        {/* Daily Roster Panel with Certify All — always visible so team can be added */}
        {(parsedRoster.length > 0 || true) && (
          <div className="mb-4 rounded-lg border border-border bg-card/60 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">TEAM — Certify All Rows</span>
              {sheet && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-7 px-2 ml-auto"
                  onClick={openEditRoster}
                  title="Edit TEAM"
                >
                  <Users className="w-3 h-3" />
                  Edit TEAM
                </Button>
              )}
            </div>
            {parsedRoster.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {parsedRoster.map((entry) => (
                  <button
                    key={entry.cin}
                    onClick={() => canCertify ? certifyAllForCin.mutate({ sheetId, cin: entry.cin }) : undefined}
                    disabled={certifyAllForCin.isPending || !canCertify}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono font-medium transition-colors disabled:opacity-50 ${
                      cinFullyCertified.has(entry.cin)
                        ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                        : canCertify ? "border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 text-foreground" : "border-border bg-muted/40 text-foreground cursor-default"
                    }`}
                    title={`${canCertify ? "Certify all rows for " : ""}CIN ${entry.cin}${entry.isTeamLeader ? " (Team Leader)" : ""}${entry.isAuthor ? " (Author)" : ""}`}
                  >
                    <ShieldCheck className={`w-3 h-3 ${cinFullyCertified.has(entry.cin) ? "text-emerald-500" : "text-primary"}`} />
                    {entry.isTeamLeader && <span className="text-yellow-400" title="Team Leader">★</span>}
                    {entry.isAuthor && <span className="text-sky-400" title="Running Sheet Author">✏️</span>}
                    {entry.cin}
                    {entry.hasImages && <Camera className="w-3 h-3 text-amber-400" />}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No team members added — click Edit TEAM to add CINs.</p>
            )}
          </div>
        )}

        {/* TARGET Panel — shown when a target is assigned to this sheet */}
        {sheet?.targetId && assignedTarget && (() => {
          const t = assignedTarget;
          const fields: { label: string; value: string | null }[] = [
            { label: "TGT", value: t.tgt },
            { label: "HBF", value: t.hbf },
            { label: "HB",  value: t.hb  },
            { label: "V1F", value: t.v1f },
            { label: "V1",  value: t.v1  },
            { label: "V2F", value: t.v2f },
            { label: "V2",  value: t.v2  },
            { label: "DEP", value: t.dep },
            { label: "ARR", value: t.arr },
          ];
          const hasAnyField = fields.some((f) => f.value);
          return (
            <div className="mb-4 rounded-lg border border-border bg-card/60 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">TARGET — {t.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                  onClick={() => navigate(`/operation/${sheet!.operationId}?tab=target&targetId=${t.id}&fromSheet=${sheetId}`)}
                  title="Edit Target"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </Button>

              </div>
              {hasAnyField && (
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {fields.filter((f) => f.value).map((f) => (
                    <div key={f.label} className="flex items-baseline gap-1.5 text-xs">
                      <span className="font-semibold text-muted-foreground uppercase tracking-wide">{f.label}:</span>
                      <span className="font-mono text-foreground">{f.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Search bar + sort toggle */}
        <div className="mb-4 flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`shrink-0 ${sortReversed ? "border-primary text-primary" : ""}`}
                onClick={() => setSortReversed(v => !v)}
              >
                <ArrowUpDown className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{sortReversed ? "Showing newest first — click to show oldest first" : "Showing oldest first — click to show newest first"}</TooltipContent>
          </Tooltip>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by time, observation, or CIN…"
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-6 flex flex-col gap-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            ) : !rows || rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-muted-foreground text-sm">No rows yet. Click "Add Row" to begin.</p>
              </div>
            ) : (
              <table className="running-sheet-table w-full">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="w-32">Time</th>
                    <th>Observation</th>
                    <th className="w-36">CIN</th>
                    <th className="w-24 text-center">Certify</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 && searchQuery ? (
                    <tr><td colSpan={4} className="py-12 text-center text-sm text-muted-foreground italic">No rows match your search.</td></tr>
                  ) : filteredRows.map((row: NonNullable<typeof rows>[0]) => (
                    <tr
                      key={row.id}
                      className={row.isLocked ? "row-locked" : "hover:bg-accent/20"}
                    >
                      {/* Time */}
                      <td>
                        <TimePickerCell
                          value={row.time}
                          locked={row.isLocked}
                          onSave={(display, mins) => updateRow.mutate({ id: row.id, time: display, timeMinutes: mins })}
                        />
                      </td>

                      {/* Observation */}
                      <td>
                        <EditableCell
                          value={row.observation}
                          locked={row.isLocked}
                          multiline
                          placeholder="Enter observation…"
                          onSave={(val) => updateRow.mutate({ id: row.id, observation: val })}
                          shortcuts={shortcutMap}
                        />
                        {/* Sub-observations */}
                        <SubObservationBlock
                          rowId={row.id}
                          rowLocked={!!row.isLocked}
                          sheetLocked={isClosed}
                          shortcuts={Object.entries(shortcutMap).map(([trigger, expansion]) => ({ trigger, expansion }))}
                        />
                      </td>

                      {/* Member */}
                      <td>
                        <MemberCell
                          row={row}
                          canEdit={canEdit}
                          onAddMember={(rowId, name) => addMember.mutate({ rowId, memberName: name })}
                          onRemoveMember={(id, rowId) => {
                            const rowData = rows?.find((r) => r.id === rowId);
                            if (rowData?.isLocked) {
                              // Row is locked — uncertify all first, then remove
                              uncertifyAll.mutate({ rowId }, {
                                onSuccess: () => removeMember.mutate({ id, rowId }),
                              });
                            } else {
                              removeMember.mutate({ id, rowId });
                            }
                          }}
                          rosterCins={rosterCinList}
                        />
                      </td>

                      {/* Certify */}
                      <td>
                        <CertifyCell
                          row={row}
                          canCertify={canCertify}
                          onCertify={(rowId, memberId) => certify.mutate({ rowId, memberId })}
                          onUncertify={(rowId, memberId) => uncertify.mutate({ rowId, memberId })}
                          onUncertifyAll={(rowId) => uncertifyAll.mutate({ rowId })}
                          onDeleteRow={canCertify ? (rowId) => {
                            if (confirm("Delete this row?")) deleteRow.mutate({ id: rowId });
                          } : undefined}
                        />
                      </td>


                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--certified-color)]" />
            Certified
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[var(--certified-color)]" />
            Row locked (all members certified)
          </div>
          {canCertify && (
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Click to certify a member
            </div>
          )}
        </div>
      </div>
      {/* Edit Sheet Title Dialog */}
      <Dialog open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sheet Details</DialogTitle>
          </DialogHeader>
          <div className="py-2 flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Target</label>
              <div className="flex flex-col gap-2">
                {/* Operation's existing targets — selectable */}
                {(operationTargets ?? []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (editSelectedTargetId === t.id) { setEditSelectedTargetId(null); setEditTargetMode("none"); }
                      else { setEditSelectedTargetId(t.id); setEditTargetMode("link"); setEditNewTargetName(""); }
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors w-full ${
                      editSelectedTargetId === t.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <Target className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{t.name}</span>
                    {editSelectedTargetId === t.id && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  </button>
                ))}

                {/* New Target inline input */}
                {editTargetMode === "new" && (
                  <div className="flex gap-2 items-center">
                    <Input
                      placeholder="Full name, born (e.g. John SMITH, born 1 Jan 1980)"
                      value={editNewTargetName}
                      onChange={(e) => setEditNewTargetName(e.target.value)}
                      autoFocus
                      className="flex-1"
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setEditTargetMode("none"); setEditNewTargetName(""); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}

                {/* Link Existing search panel */}
                {editTargetMode === "link" && editSelectedTargetId === null && (
                  <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <Input
                        autoFocus
                        className="h-8 text-sm"
                        placeholder="Search by name, TGT code or operation…"
                        value={editTargetSearch}
                        onChange={(e) => setEditTargetSearch(e.target.value)}
                      />
                      <Button size="sm" variant="ghost" className="shrink-0" onClick={() => { setEditTargetMode("none"); setEditTargetSearch(""); }}>Cancel</Button>
                    </div>
                    <div className="max-h-52 overflow-y-auto flex flex-col gap-1">
                      {(allTargetsForSheet ?? []).filter(t => {
                        const q = editTargetSearch.toLowerCase();
                        return t.name.toLowerCase().includes(q) || (t.tgt ?? "").toLowerCase().includes(q) || (t.operationName ?? "").toLowerCase().includes(q);
                      }).length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">{editTargetSearch ? "No matching targets" : "Start typing to search"}</p>
                      ) : (
                        (allTargetsForSheet ?? []).filter(t => {
                          const q = editTargetSearch.toLowerCase();
                          return t.name.toLowerCase().includes(q) || (t.tgt ?? "").toLowerCase().includes(q) || (t.operationName ?? "").toLowerCase().includes(q);
                        }).map(t => (
                          <button
                            key={t.id}
                            type="button"
                            className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 text-left transition-colors w-full"
                            onClick={() => { setEditSelectedTargetId(t.id); setEditTargetSearch(""); setEditTargetMode("link"); }}
                          >
                            <Target className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {t.tgt ? <span className="font-mono mr-2">TGT: {t.tgt}</span> : null}
                                {t.operationName ? <span>Op: {t.operationName}</span> : null}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Selected linked target chip (not from operation) */}
                {editTargetMode === "link" && editSelectedTargetId !== null && !(operationTargets ?? []).find(t => t.id === editSelectedTargetId) && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary bg-primary/10 text-primary">
                    <Target className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{(allTargetsForSheet ?? []).find(t => t.id === editSelectedTargetId)?.name}</span>
                    <button type="button" onClick={() => { setEditSelectedTargetId(null); setEditTargetMode("none"); }} className="hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                {/* Action buttons */}
                {editTargetMode !== "new" && !(editTargetMode === "link" && editSelectedTargetId === null) && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => { setEditTargetMode("new"); setEditSelectedTargetId(null); }}>
                      <Plus className="w-3.5 h-3.5" /> New Target
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => { setEditTargetMode("link"); setEditSelectedTargetId(null); setEditTargetSearch(""); }}>
                      <Search className="w-3.5 h-3.5" /> Link Existing
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSheetOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                // Apply target change first if needed
                const currentTargetId = sheet?.targetId ?? null;
                const newTargetId = editTargetMode === "link" ? editSelectedTargetId : null;
                if (editTargetMode === "link" && newTargetId !== currentTargetId) {
                  setSheetTarget.mutate({ sheetId, targetId: newTargetId });
                } else if (editTargetMode === "none" && editSelectedTargetId === null && currentTargetId !== null) {
                  setSheetTarget.mutate({ sheetId, targetId: null });
                }
                updateSheet.mutate({
                  id: sheetId,
                  title: editTitle.trim(),
                  targetName: editTargetMode === "new" ? (editNewTargetName.trim() || null) : null,
                });
              }}
              disabled={!editTitle.trim() || updateSheet.isPending}
            >
              {updateSheet.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Roster Dialog */}
      <Dialog open={editRosterOpen} onOpenChange={setEditRosterOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit TEAM</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <p className="text-xs text-muted-foreground">
              Add or remove CINs from today’s team. Mark the Team Leader and Running Sheet Author. Tick the camera icon if images were taken by that member.
            </p>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <CinInput
                  value={rosterInput}
                  onChange={setRosterInput}
                  onValidCin={(cin) => { setRosterInput(cin); setRosterInputValid(true); }}
                  onInvalidCin={() => setRosterInputValid(false)}
                  placeholder="Enter CIN and press Add"
                  showValidation
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRosterCin}
                disabled={!rosterInputValid}
                className="gap-1.5 shrink-0 mt-0.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
            {allUsers && allUsers.some((u) => u.team) && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Add team:</span>
                {(["TEAM1", "TEAM2", "PTT"] as const).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs font-semibold"
                    onClick={() => handleAddRosterTeam(t)}
                  >
                    {t === "TEAM1" ? "TEAM 1" : t === "TEAM2" ? "TEAM 2" : "PTT"}
                  </Button>
                ))}
              </div>
            )}
            {rosterList.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_40px_40px_40px_32px] px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground">
                  <span className="flex items-center">CIN</span>
                  <span className="flex items-center justify-center" title="Team Leader"><span className="text-yellow-400 text-sm">★</span></span>
                  <span className="flex items-center justify-center" title="Running Sheet Author"><span className="text-sky-400 text-sm">✏</span></span>
                  <span className="flex items-center justify-center" title="Images taken"><Camera className="w-3.5 h-3.5" /></span>
                  <span></span>
                </div>
                {rosterList.map((entry) => (
                  <div
                    key={entry.cin}
                    className="grid grid-cols-[1fr_40px_40px_40px_32px] px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <span className="flex items-center text-sm font-mono font-medium text-foreground">{entry.cin}</span>
                    {/* Team Leader */}
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={!!entry.isTeamLeader}
                        onCheckedChange={() =>
                          setRosterList((prev) =>
                            prev.map((c) => c.cin === entry.cin ? { ...c, isTeamLeader: !c.isTeamLeader } : c)
                          )
                        }
                        className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                      />
                    </div>
                    {/* Author */}
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={!!entry.isAuthor}
                        onCheckedChange={() =>
                          setRosterList((prev) =>
                            prev.map((c) => c.cin === entry.cin ? { ...c, isAuthor: !c.isAuthor } : c)
                          )
                        }
                        className="data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
                      />
                    </div>
                    {/* Images */}
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={entry.hasImages}
                        onCheckedChange={() =>
                          setRosterList((prev) =>
                            prev.map((c) => c.cin === entry.cin ? { ...c, hasImages: !c.hasImages } : c)
                          )
                        }
                        className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                      />
                    </div>
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() => setRosterList((prev) => prev.filter((c) => c.cin !== entry.cin))}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No CINs in team yet.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRosterOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                // Sort before saving: TL first, then numerically
                const sorted = [...rosterList].sort((a, b) => {
                  if (a.isTeamLeader && !b.isTeamLeader) return -1;
                  if (!a.isTeamLeader && b.isTeamLeader) return 1;
                  const aNum = parseInt(a.cin, 10);
                  const bNum = parseInt(b.cin, 10);
                  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                  return a.cin.localeCompare(b.cin);
                });
                updateSheet.mutate({ id: sheetId, sheetCins: sorted });
              }}
              disabled={updateSheet.isPending}
            >
              {updateSheet.isPending ? "Saving…" : "Save TEAM"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
