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

function exportToPDF(sheetTitle: string, rows: ExportRow[]) {
  const certColor = "#22c55e";
  const lockedBg = "#0f2a1a";
  const cb = "border-right:1px solid #334155"; // column border
  const bb = "border-bottom:1px solid #1e293b"; // row border

  const tableRows = rows.map((row) => {
    const rowBg = row.isLocked ? lockedBg : "transparent";

    // Build per-member combined cert cell: "Name — ✓ By / date" or "Name — Pending"
    const memberLines = row.members.length === 0
      ? [
          { time: row.time ?? "", member: "<em style='color:#6b7280'>No members</em>", cert: "" },
        ]
      : row.members.map((m) => {
          const cert = row.certifications.find((c) => c.memberId === m.id && c.isActive);
          const certCell = cert
            ? `<span style='color:${certColor};white-space:nowrap'>&#10003; ${cert.certifiedByName}</span><br/><span style='font-size:10px;color:#94a3b8;white-space:nowrap'>${format(new Date(cert.certifiedAt), "dd MMM yy HH:mm")}</span>`
            : `<span style='color:#ef4444'>Pending</span>`;
          return { time: row.time ?? "", member: m.memberName, cert: certCell };
        });

    const stack = (items: string[]) =>
      items.map(s => `<div style='padding:1px 0;line-height:1.4'>${s}</div>`).join("");

    return `<tr style="background:${rowBg}">
      <td style="padding:5px 6px;${bb};${cb};font-family:monospace;font-size:11px;white-space:nowrap">${row.time ?? ""}</td>
      <td style="padding:5px 6px;${bb};${cb}">${row.observation ?? ""}</td>
      <td style="padding:5px 6px;${bb};${cb};white-space:nowrap">${stack(memberLines.map(l => l.member))}</td>
      <td style="padding:5px 6px;${bb};font-size:11px">${stack(memberLines.map(l => l.cert))}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>${sheetTitle}</title>
  <style>
    @page{margin:15mm}
    body{font-family:system-ui,sans-serif;background:#0a0f1a;color:#e2e8f0;margin:0;padding:0;font-size:12px}
    h1{font-size:16px;font-weight:700;margin:0 0 2px;color:#f8fafc}
    .meta{font-size:11px;color:#64748b;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #334155}
    col.c-time{width:70px}
    col.c-obs{width:auto}
    col.c-member{width:110px}
    col.c-cert{width:140px}
    th{background:#1e293b;color:#94a3b8;font-weight:600;padding:6px;text-align:left;
       border-bottom:2px solid #334155;border-right:1px solid #334155;overflow:hidden}
    th:last-child,td:last-child{border-right:none}
    td{vertical-align:top;word-break:break-word;overflow:hidden}
  </style></head><body>
  <h1>${sheetTitle}</h1>
  <div class="meta">Exported ${format(new Date(), "d MMM yyyy, HH:mm")} &bull; ${rows.length} rows</div>
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
      <th>Member</th>
      <th>Certified</th>
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
      exportToPDF(sheet.title, exportData.rows);
      setPendingExportType(null);
    }
  }, [exportData, pendingExportType, sheet]);

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

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => sheet ? navigate(`/operation/${sheet.operationId}`) : navigate("/")}>
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
                    <th className="w-56">Member</th>
                    <th className="w-32">Certify</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={row.isLocked ? "row-locked" : "hover:bg-accent/20"}
                    >
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
