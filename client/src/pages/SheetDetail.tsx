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
  Table2,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
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

function exportToCSV(sheetTitle: string, rows: ExportRow[]) {
  const escape = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Row Number", "Time", "Observation", "Member", "Certified", "Certified By", "Certified At"];
  const dataRows: string[][] = [];
  for (const row of rows) {
    if (row.members.length === 0) {
      dataRows.push([String(row.rowNumber), row.time ?? "", row.observation ?? "", "", "", "", ""]);
    } else {
      for (const member of row.members) {
        const cert = row.certifications.find((c) => c.memberId === member.id && c.isActive);
        dataRows.push([
          String(row.rowNumber),
          row.time ?? "",
          row.observation ?? "",
          member.memberName,
          cert ? "Yes" : "No",
          cert ? cert.certifiedByName : "",
          cert ? format(new Date(cert.certifiedAt), "yyyy-MM-dd HH:mm:ss") : "",
        ]);
      }
    }
  }
  const csv = [header, ...dataRows].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sheetTitle.replace(/[^a-z0-9]/gi, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportToPDF(sheetTitle: string, rows: ExportRow[]) {
  const certColor = "#22c55e";
  const lockedBg = "#0f2a1a";
  const tableRows = rows
    .map((row) => {
      const memberBlocks = row.members.length === 0
        ? `<td colspan="3" style="color:#6b7280;font-style:italic">No members</td>`
        : row.members
            .map((m) => {
              const cert = row.certifications.find((c) => c.memberId === m.id && c.isActive);
              return `<tr style="background:${row.isLocked ? lockedBg : "transparent"}">
                <td></td><td></td><td></td>
                <td style="padding:4px 8px;border-bottom:1px solid #1e293b">${m.memberName}</td>
                <td style="padding:4px 8px;border-bottom:1px solid #1e293b;color:${cert ? certColor : "#ef4444"}">
                  ${cert ? "&#10003; Certified" : "Pending"}
                </td>
                <td style="padding:4px 8px;border-bottom:1px solid #1e293b;font-size:11px;color:#94a3b8">
                  ${cert ? `${cert.certifiedByName}<br/><span style="font-size:10px">${format(new Date(cert.certifiedAt), "yyyy-MM-dd HH:mm")}</span>` : ""}
                </td>
              </tr>`;
            })
            .join("");
      const firstMember = row.members[0];
      const firstCert = firstMember ? row.certifications.find((c) => c.memberId === firstMember.id && c.isActive) : undefined;
      const rowBg = row.isLocked ? lockedBg : "transparent";
      const firstRow = `<tr style="background:${rowBg}">
        <td style="padding:6px 8px;border-bottom:1px solid #1e293b;text-align:center;font-weight:600">${row.rowNumber}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #1e293b;font-family:monospace;font-size:12px">${row.time ?? ""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #1e293b;max-width:280px">${row.observation ?? ""}</td>
        ${row.members.length === 0
          ? `<td colspan="3" style="padding:6px 8px;border-bottom:1px solid #1e293b;color:#6b7280;font-style:italic">No members</td>`
          : `<td style="padding:6px 8px;border-bottom:1px solid #1e293b">${firstMember?.memberName ?? ""}</td>
             <td style="padding:6px 8px;border-bottom:1px solid #1e293b;color:${firstCert ? certColor : "#ef4444"}">${firstCert ? "&#10003; Certified" : "Pending"}</td>
             <td style="padding:6px 8px;border-bottom:1px solid #1e293b;font-size:11px;color:#94a3b8">${firstCert ? `${firstCert.certifiedByName}<br/><span style="font-size:10px">${format(new Date(firstCert.certifiedAt), "yyyy-MM-dd HH:mm")}</span>` : ""}</td>`
        }
      </tr>`;
      const extraRows = row.members.slice(1).map((m) => {
        const cert = row.certifications.find((c) => c.memberId === m.id && c.isActive);
        return `<tr style="background:${rowBg}">
          <td style="padding:4px 8px;border-bottom:1px solid #1e293b"></td>
          <td style="padding:4px 8px;border-bottom:1px solid #1e293b"></td>
          <td style="padding:4px 8px;border-bottom:1px solid #1e293b"></td>
          <td style="padding:4px 8px;border-bottom:1px solid #1e293b">${m.memberName}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #1e293b;color:${cert ? certColor : "#ef4444"}">${cert ? "&#10003; Certified" : "Pending"}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #1e293b;font-size:11px;color:#94a3b8">${cert ? `${cert.certifiedByName}<br/><span style="font-size:10px">${format(new Date(cert.certifiedAt), "yyyy-MM-dd HH:mm")}</span>` : ""}</td>
        </tr>`;
      }).join("");
      return firstRow + extraRows;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>${sheetTitle}</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0a0f1a;color:#e2e8f0;margin:0;padding:24px}
    h1{font-size:20px;font-weight:700;margin-bottom:4px;color:#f8fafc}
    .meta{font-size:12px;color:#64748b;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#1e293b;color:#94a3b8;font-weight:600;padding:8px;text-align:left;border-bottom:2px solid #334155}
    td{vertical-align:top;word-break:break-word}
    .locked-badge{display:inline-block;background:#0f2a1a;color:#22c55e;border:1px solid #166534;border-radius:4px;padding:1px 6px;font-size:11px;margin-left:8px}
  </style></head><body>
  <h1>${sheetTitle}</h1>
  <div class="meta">Exported ${format(new Date(), "MMMM d, yyyy 'at' HH:mm")} &nbsp;&bull;&nbsp; ${rows.length} rows</div>
  <table>
    <thead><tr>
      <th style="width:60px">Row #</th>
      <th style="width:90px">Time</th>
      <th>Observation</th>
      <th style="width:140px">Member</th>
      <th style="width:110px">Certify</th>
      <th style="width:160px">Certified By / At</th>
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
}: {
  row: SheetRow;
  canCertify: boolean;
  canEdit: boolean;
  onCertify: (rowId: number, memberId: number) => void;
  onUncertify: (rowId: number, memberId: number) => void;
  onAddMember: (rowId: number, name: string) => void;
  onRemoveMember: (memberId: number, rowId: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) return;
    onAddMember(row.id, newName.trim());
    setNewName("");
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-2 min-w-[200px]">
      {row.members.map((member) => {
        const cert = row.certifications.find((c) => c.memberId === member.id && c.isActive);
        return (
          <div
            key={member.id}
            className="flex items-center gap-2 group/member"
          >
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-medium ${cert ? "text-[var(--certified-color)]" : "text-foreground"}`}>
                {member.memberName}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {cert ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-[var(--certified-color)]" />
                      {canCertify && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 opacity-0 group-hover/member:opacity-100 text-muted-foreground hover:text-destructive"
                          onClick={() => onUncertify(row.id, member.id)}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">Certified by {cert.certifiedByName}</span>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(cert.certifiedAt), "MMM d, yyyy HH:mm:ss")}
                      </span>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div className="flex items-center gap-1">
                  {canCertify && !row.isLocked && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 text-muted-foreground hover:text-[var(--certified-color)]"
                          onClick={() => onCertify(row.id, member.id)}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">Certify this member</TooltipContent>
                    </Tooltip>
                  )}
                  {canEdit && !row.isLocked && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 opacity-0 group-hover/member:opacity-100 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemoveMember(member.id, row.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
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
          <div className="flex items-center gap-1.5 mt-1">
            <Input
              autoFocus
              placeholder="Member name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
              className="h-7 text-xs px-2"
            />
            <Button size="icon" className="h-7 w-7 shrink-0" onClick={handleAdd} disabled={!newName.trim()}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mt-0.5 w-fit"
          >
            <UserPlus className="w-3 h-3" />
            Add member
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
  onUncertifyAll,
  onDeleteRow,
}: {
  row: SheetRow;
  canCertify: boolean;
  onUncertifyAll: (rowId: number) => void;
  onDeleteRow?: (rowId: number) => void;
}) {
  const total = row.members.length;
  const certified = row.certifications.filter((c) => c.isActive).length;

  if (total === 0) {
    return <span className="text-xs text-muted-foreground italic">No members</span>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {row.isLocked ? (
          <Badge variant="outline" className="gap-1.5 text-[var(--certified-color)] border-[var(--locked-border)] bg-[var(--locked-bg)] text-xs">
            <Lock className="w-3 h-3" />
            Locked
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {certified}/{total} certified
          </span>
        )}
      </div>
      {row.isLocked && canCertify && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10"
              onClick={() => onUncertifyAll(row.id)}
            >
              <Unlock className="w-3 h-3" />
              Uncertify
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
      <span className="text-sm text-muted-foreground">
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
      className="text-sm cursor-text hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 min-h-[1.75rem] transition-colors"
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

  const { data: rows, isLoading: rowsLoading } = trpc.row.listBySheet.useQuery(
    { sheetId },
    { enabled: isAuthenticated && !!sheetId, refetchInterval: 10000 }
  );

  const invalidateRows = useCallback(() => utils.row.listBySheet.invalidate({ sheetId }), [utils, sheetId]);

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

  const canEdit = user?.role === "certifier" || user?.role === "admin" || user?.role === "observer";
  const canCertify = user?.role === "certifier" || user?.role === "admin";

  const [pendingExportType, setPendingExportType] = useState<"csv" | "pdf" | null>(null);
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
      if (pendingExportType === "csv") exportToCSV(sheet.title, exportData.rows);
      else exportToPDF(sheet.title, exportData.rows);
      setPendingExportType(null);
    }
  }, [exportData, pendingExportType, sheet]);

  const handleExport = useCallback((type: "csv" | "pdf") => {
    if (!sheet) return;
    if (exportData && !exportFetching) {
      // Data already cached — re-fetch to get latest then export
      setPendingExportType(type);
      refetchExport();
      return;
    }
    setPendingExportType(type);
    setExportEnabled(true);
  }, [sheet, exportData, exportFetching, refetchExport]);

  if (!isAuthenticated) return null;

  const isLoading = sheetLoading || rowsLoading;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            {sheetLoading ? (
              <Skeleton className="h-7 w-64" />
            ) : (
              <>
                <h1 className="text-xl font-semibold text-foreground truncate">{sheet?.title}</h1>
                {sheet?.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">{sheet.description}</p>
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
                  onClick={() => handleExport("csv")}
                >
                  <Table2 className="w-4 h-4 text-emerald-400" />
                  Download CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onClick={() => handleExport("pdf")}
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
                    <th className="w-16 text-center">Row Number</th>
                    <th className="w-36">Time</th>
                    <th>Observation</th>
                    <th className="w-56">Member</th>
                    <th className="w-44">Certify</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={row.isLocked ? "row-locked" : "hover:bg-accent/20"}
                    >
                      {/* Row Number */}
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {row.isLocked && <Lock className="w-3 h-3 text-[var(--certified-color)] shrink-0" />}
                          <span className="font-mono text-sm font-medium">{row.rowNumber}</span>
                        </div>
                      </td>

                      {/* Time */}
                      <td>
                        <EditableCell
                          value={row.time}
                          locked={row.isLocked}
                          placeholder="HH:MM"
                          onSave={(val) => updateRow.mutate({ id: row.id, time: val })}
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
                          onRemoveMember={(memberId, rowId) => removeMember.mutate({ memberId, rowId })}
                        />
                      </td>

                      {/* Certify */}
                      <td>
                        <CertifyCell
                          row={row}
                          canCertify={canCertify}
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
    </DashboardLayout>
  );
}
