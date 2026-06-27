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
  targetName?: string | null,
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

  // ── Cover page ────────────────────────────────────────────────────────────────────────────
  const metaRow = (label: string, value: string) =>
    `<tr><td style="padding:5px 10px;font-weight:600;color:#94a3b8;white-space:nowrap;width:160px">${label}</td><td style="padding:5px 10px;color:#e2e8f0">${value}</td></tr>`;

  const cinRosterHtml = cinRoster.length > 0
    ? `<table style="border-collapse:collapse;margin-top:14px;width:auto;border:1px solid #334155">
        <thead><tr>
          <th style="padding:5px 10px;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:2px solid #334155;border-right:1px solid #334155;text-align:left">CIN</th>
          <th style="padding:5px 10px;background:#1e293b;color:#94a3b8;font-weight:600;border-bottom:2px solid #334155;text-align:left">Images Taken</th>
        </tr></thead>
        <tbody>${cinRoster.map(c => {
          const icons = (c.isTeamLeader ? '<span style="color:#eab308;margin-right:4px">★</span>' : '') + (c.isAuthor ? '<span style="color:#38bdf8;margin-right:4px">✏</span>' : '');
          return `<tr><td style="padding:5px 10px;border-bottom:1px solid #1e293b;border-right:1px solid #334155;font-family:monospace;font-weight:${c.isTeamLeader ? '700' : '400'}">${icons}${c.cin}</td><td style="padding:5px 10px;border-bottom:1px solid #1e293b;color:${c.hasImages ? certColor : '#ef4444'}">${c.hasImages ? '&#10003; Yes' : '&#10007; No'}</td></tr>`;
        }).join('')}</tbody>
      </table>`
    : `<p style="color:#64748b;font-style:italic;margin-top:8px">No TEAM recorded.</p>`;

  const coverPage = `
    <div style="page-break-after:always;padding-bottom:20px">
      <div style="border-bottom:2px solid #334155;padding-bottom:12px;margin-bottom:16px">
        <div style="font-size:10px;font-weight:600;letter-spacing:0.1em;color:#64748b;text-transform:uppercase;margin-bottom:4px">RUNNING SHEET</div>
        <h1 style="font-size:22px;font-weight:700;margin:0 0 4px;color:#f8fafc">${sheetTitle}</h1>
        ${targetName ? `<div style="font-size:13px;color:#94a3b8;margin-bottom:2px">Target: <span style="color:#e2e8f0;font-weight:600">${targetName}</span></div>` : ""}
        <div style="font-size:11px;color:#64748b">Sheet Date: ${format(new Date(sheetCreatedAt), "EEEE d MMMM yyyy")}</div>
      </div>

      ${operation ? `
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;margin-bottom:8px">Operation Details</div>
        <table style="border-collapse:collapse;width:100%;border:1px solid #334155">
          <tbody>
            ${metaRow("Operation Name", operation.name)}
            ${operation.promisNumber ? metaRow("PROMIS Number", operation.promisNumber) : ""}
            ${operation.imsNumber ? metaRow("IMS Number", operation.imsNumber) : ""}
            ${operation.investigationUnit ? metaRow("Investigation Unit", operation.investigationUnit) : ""}
          </tbody>
        </table>
      </div>` : ""}

      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;margin-bottom:8px">TEAM</div>
        ${cinRosterHtml}
      </div>

      <div style="margin-top:20px;font-size:10px;color:#475569">
        Exported: ${format(new Date(), "d MMM yyyy, HH:mm")} &bull; ${rows.length} log entries
      </div>
    </div>`;

  // ── Running sheet table ──────────────────────────────────────────────────────
  const tableRows = rows.map((row) => {
    const rowBg = row.isLocked ? lockedBg : "transparent";
    if (row.members.length === 0) {
      return `<tr style="background:${rowBg}">
        <td style="padding:5px 6px;${bb};${cb};font-family:monospace;font-size:11px;white-space:nowrap" rowspan="1">${row.time ?? ""}</td>
        <td style="padding:5px 6px;${bb};${cb}" rowspan="1">${row.observation ?? ""}</td>
        <td style="padding:5px 6px;${bb};${cb};white-space:nowrap"><em style='color:#6b7280'>No members</em></td>
        <td style="padding:5px 6px;${bb};font-size:11px"></td>
      </tr>`;
    }
    // Render one <tr> per member so CIN and Certified columns align perfectly
    return row.members.map((m, idx) => {
      const cert = row.certifications.find((c) => c.memberId === m.id && c.isActive);
      const certCell = cert
        ? `<span style='color:${certColor};white-space:nowrap'>&#10003; ${'certifiedByCIN' in cert ? (cert as any).certifiedByCIN || cert.certifiedByName : cert.certifiedByName} &nbsp; <span style='color:#94a3b8;font-size:10px'>${format(new Date(cert.certifiedAt), "dd/MM/yy h:mmaaa")}</span></span>`
        : `<span style='color:#ef4444'>Pending</span>`;
      const isFirst = idx === 0;
      const rowspan = row.members.length;
      const timeTd = isFirst
        ? `<td style="padding:5px 6px;${bb};${cb};font-family:monospace;font-size:11px;white-space:nowrap" rowspan="${rowspan}">${row.time ?? ""}</td>`
        : "";
      const obsTd = isFirst
        ? `      <td style="padding:5px 6px;${bb};${cb}" rowspan="${rowspan}">${(row.observation ?? "").replace(/\n/g, "<br/>")}</td>`
        : "";
      // Only draw bottom border on the last member row; no inner lines between members
      const isLast = idx === row.members.length - 1;
      const memberBb = isLast ? bb : "border-bottom:none";
      // Reduce top padding for non-first rows so members sit tight together
      const pt = isFirst ? "5px" : "1px";
      const pb = isLast ? "5px" : "1px";
      return `<tr style="background:${rowBg}">
        ${timeTd}${obsTd}
        <td style="padding:${pt} 6px ${pb} 6px;${memberBb};${cb};white-space:nowrap;font-family:monospace;font-size:11px">${m.memberName}</td>
        <td style="padding:${pt} 6px ${pb} 6px;${memberBb};font-size:11px">${certCell}</td>
      </tr>`;
    }).join("");
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>${sheetTitle}</title>
  <style>
    @page{margin:15mm}
    body{font-family:system-ui,sans-serif;background:#0a0f1a;color:#e2e8f0;margin:0;padding:0;font-size:12px}
    table{width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #334155}
    col.c-time{width:70px}
    col.c-obs{width:auto}
    col.c-member{width:50px}
    col.c-cert{width:160px}
    th{background:#1e293b;color:#94a3b8;font-weight:600;padding:6px;text-align:left;
       border-bottom:2px solid #334155;border-right:1px solid #334155;overflow:hidden}
    th:last-child,td:last-child{border-right:none}
    td{vertical-align:top;word-break:break-word;overflow:hidden}
  </style></head><body>
  ${coverPage}
  <table>
    <colgroup>
      <col class="c-time"/>
      <col class="c-obs"/>
      <col class="c-member"/>
      <col class="c-cert"/>
    </colgroup>
    <thead><tr>
      <th>Time</th>
      <th>Observation</th>
      <th>CIN</th>
      <th>Certified (CIN)</th>
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
  canCertify,
  canEdit,
  onCertify,
  onUncertify,
  onAddMember,
  onRemoveMember,
  rosterCins,
}: {
  row: SheetRow;
  canCertify: boolean;
  canEdit: boolean;
  onCertify: (rowId: number, memberId: number) => void;
  onUncertify: (rowId: number, memberId: number) => void;
  onAddMember: (rowId: number, name: string) => void;
  onRemoveMember: (memberId: number, rowId: number) => void;
  rosterCins?: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

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
    <div className="flex flex-col min-w-[100px]">
      {row.members.map((member) => {
        const cert = row.certifications.find((c) => c.memberId === member.id && c.isActive);
        return (
          <div
            key={member.id}
            className={`flex items-center gap-2 group/member ${ROW_H}`}
          >
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-medium ${cert ? "text-[var(--certified-color)]" : "text-foreground"}`}>
                {member.memberName}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {cert ? (
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ShieldCheck className="w-4 h-4 text-emerald-500 cursor-default shrink-0" />
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
                  {canCertify && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 opacity-0 group-hover/member:opacity-100 text-muted-foreground hover:text-amber-400"
                          onClick={(e) => { e.stopPropagation(); onUncertify(row.id, member.id); }}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Uncertify this member</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  {canCertify && !row.isLocked ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 text-red-500 hover:text-emerald-500 hover:bg-emerald-500/10"
                          onClick={() => onCertify(row.id, member.id)}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Certify this member</TooltipContent>
                    </Tooltip>
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  )}
                  {canEdit && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 opacity-0 group-hover/member:opacity-100 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemoveMember(member.id, row.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Remove this CIN</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
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
              /* Free-text mode: no roster defined */
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  placeholder="Enter CIN"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
                  className="h-7 text-xs px-2"
                />
                <Button size="icon" className="h-7 w-7 shrink-0" onClick={handleAdd} disabled={!newName.trim()}>
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
  onUncertify,
  onUncertifyAll,
  onDeleteRow,
}: {
  row: SheetRow;
  canCertify: boolean;
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
    <div className="flex flex-col">
      {/* One row per member — same fixed height as MemberCell member rows */}
          {row.members.map((m) => {
        const cert = row.certifications.find((c) => c.memberId === m.id && c.isActive);
        return (
          <div key={m.id} className={`flex items-center gap-1.5 group/certrow ${ROW_H}`}>
            {cert ? (
              <>
                <span className="text-xs font-mono font-medium text-emerald-500 flex-1 truncate">
                  {(cert as any).certifiedByCIN || cert.certifiedByName}
                </span>
                {canCertify && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-5 h-5 opacity-0 group-hover/certrow:opacity-100 text-muted-foreground hover:text-amber-400 shrink-0"
                        onClick={() => onUncertify(row.id, m.id)}
                      >
                        <XCircle className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Uncertify {m.memberName}</TooltipContent>
                  </Tooltip>
                )}
              </>
            ) : (
              <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            )}
          </div>
        );
      })}

      {/* Summary — at the bottom so the first CIN aligns with the first observation line */}
      <div className="flex items-center gap-1.5 mt-1">
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
}: {
  value: string | null;
  locked: boolean;
  multiline?: boolean;
  placeholder?: string;
  onSave: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const commit = () => {
    if (draft !== (value ?? "")) onSave(draft);
    setEditing(false);
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
          onKeyDown={(e) => { if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
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

  const canEdit = user?.role === "certifier" || user?.role === "admin" || user?.role === "observer";
  const canCertify = user?.role === "certifier" || user?.role === "admin";

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

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortReversed, setSortReversed] = useState(false);

  // Edit sheet state
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editTargetName, setEditTargetName] = useState("");

  // Edit roster state
  const [editRosterOpen, setEditRosterOpen] = useState(false);
  const [rosterList, setRosterList] = useState<CinEntry[]>([]);
  const [rosterInput, setRosterInput] = useState("");

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
        exportData.sheet.targetName ?? null,
      );
      setPendingExportType(null);
    }
  }, [exportData, pendingExportType, sheet]);

  const openEditSheet = () => {
    setEditTitle(sheet?.title ?? "");
    setEditTargetName(sheet?.targetName ?? "");
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

  const handleAddRosterCin = () => {
    const trimmed = rosterInput.trim();
    if (!trimmed) return;
    if (rosterList.some((c) => c.cin.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("CIN already in team");
      return;
    }
    setRosterList((prev) => [...prev, { cin: trimmed, hasImages: false, isTeamLeader: false, isAuthor: false }]);
    setRosterInput("");
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
                  {sheet?.targetName && (
                    <p className="text-sm text-muted-foreground truncate">Target: <span className="font-medium text-foreground">{sheet.targetName}</span></p>
                  )}
                </div>
                {sheet && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={openEditSheet}
                      title="Edit sheet title"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                      onClick={openEditRoster}
                      title="Edit TEAM"
                    >
                      <Users className="w-3 h-3" />
                      Edit TEAM
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
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

            {/* Add row */}
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
          </div>
        </div>

        {/* Daily Roster Panel with Certify All */}
        {parsedRoster.length > 0 && canCertify && (
          <div className="mb-4 rounded-lg border border-border bg-card/60 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">TEAM — Certify All Rows</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {parsedRoster.map((entry) => (
                <button
                  key={entry.cin}
                  onClick={() => certifyAllForCin.mutate({ sheetId, cin: entry.cin })}
                  disabled={certifyAllForCin.isPending}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 text-xs font-mono font-medium text-foreground transition-colors disabled:opacity-50"
                  title={`Certify all rows for CIN ${entry.cin}${entry.isTeamLeader ? " (Team Leader)" : ""}${entry.isAuthor ? " (Author)" : ""}`}
                >
                  <ShieldCheck className="w-3 h-3 text-primary" />
                  {entry.isTeamLeader && <span className="text-yellow-400" title="Team Leader">★</span>}
                  {entry.isAuthor && <span className="text-sky-400" title="Running Sheet Author">✏️</span>}
                  {entry.cin}
                  {entry.hasImages && <Camera className="w-3 h-3 text-amber-400" />}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Click a CIN to certify all uncertified rows for that member across this sheet. ★ = Team Leader  ✏ = Author</p>
          </div>
        )}

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
                        />
                      </td>

                      {/* Member */}
                      <td>
                        <MemberCell
                          row={row}
                          canCertify={canCertify}
                          canEdit={canEdit}
                          onCertify={(rowId, memberId) => certify.mutate({ rowId, memberId })}
                          onUncertify={(rowId, memberId) => uncertify.mutate({ rowId, memberId })}
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
              <label className="text-sm font-medium text-foreground mb-1.5 block">Target Name</label>
              <Input
                value={editTargetName}
                onChange={(e) => setEditTargetName(e.target.value)}
                placeholder="e.g. John Smith"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSheetOpen(false)}>Cancel</Button>
            <Button
              onClick={() => updateSheet.mutate({ id: sheetId, title: editTitle.trim(), targetName: editTargetName.trim() || null })}
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
            <div className="flex gap-2">
              <Input
                placeholder="Enter CIN and press Add"
                value={rosterInput}
                onChange={(e) => setRosterInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddRosterCin(); } }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRosterCin}
                disabled={!rosterInput.trim()}
                className="gap-1.5 shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
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
