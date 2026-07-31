import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ScrollText,
  Search,
  ShieldCheck,
  Unlock,
  FilePen,
  UserPlus,
  UserMinus,
  FileText,
  Trash2,
  Download,
} from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

const ACTION_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  certified: { label: "Certified", icon: ShieldCheck, color: "text-emerald-400" },
  uncertified: { label: "Uncertified", icon: Unlock, color: "text-amber-400" },
  row_created: { label: "Row Created", icon: FilePen, color: "text-blue-400" },
  row_updated: { label: "Row Updated", icon: FilePen, color: "text-blue-300" },
  row_deleted: { label: "Row Deleted", icon: Trash2, color: "text-red-400" },
  member_added: { label: "Member Added", icon: UserPlus, color: "text-violet-400" },
  member_removed: { label: "Member Removed", icon: UserMinus, color: "text-orange-400" },
  sheet_created: { label: "Sheet Created", icon: FileText, color: "text-sky-400" },
  sheet_updated: { label: "Sheet Updated", icon: FileText, color: "text-sky-300" },
  sheet_deleted: { label: "Sheet Deleted", icon: Trash2, color: "text-red-400" },
};

type AuditLog = {
  id: number;
  sheetId: number | null;
  userId: number;
  userName: string;
  userCIN?: string | null;
  action: string;
  details: string | null;
  createdAt: Date;
};

function exportAuditToPDF(sheetTitle: string, logs: AuditLog[]) {
  const colBorder = "border-right:1px solid #334155";
  const borderBottom = "border-bottom:1px solid #1e293b";

  const tableRows = logs.map((log) => {
    const config = ACTION_CONFIG[log.action];
    const actionLabel = config?.label ?? log.action;
    const actionColor = config?.color?.replace("text-", "") ?? "94a3b8";
    // Convert tailwind color class to hex approximation for inline HTML
    const colorMap: Record<string, string> = {
      "emerald-400": "#34d399",
      "amber-400": "#fbbf24",
      "blue-400": "#60a5fa",
      "blue-300": "#93c5fd",
      "red-400": "#f87171",
      "violet-400": "#a78bfa",
      "orange-400": "#fb923c",
      "sky-400": "#38bdf8",
      "sky-300": "#7dd3fc",
    };
    const colorKey = config?.color?.replace("text-", "") ?? "";
    const hexColor = colorMap[colorKey] ?? "#94a3b8";

    return `<tr>
      <td style="padding:5px 8px;${borderBottom};${colBorder};font-family:monospace;font-size:11px;color:#94a3b8">
        ${format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss")}
      </td>
      <td style="padding:5px 8px;${borderBottom};${colBorder};color:${hexColor};font-weight:500">
        ${actionLabel}
      </td>
      <td style="padding:5px 8px;${borderBottom};${colBorder};font-family:monospace;font-size:12px">
        ${(log as any).userCIN ?? log.userName}
      </td>
      <td style="padding:5px 8px;${borderBottom};color:#94a3b8;font-size:12px">
        ${log.details ?? "—"}
      </td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>Audit Log — ${sheetTitle}</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0a0f1a;color:#e2e8f0;margin:0;padding:24px}
    h1{font-size:20px;font-weight:700;margin-bottom:2px;color:#f8fafc}
    .meta{font-size:12px;color:#64748b;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;font-size:13px;border:1px solid #334155}
    th{background:#1e293b;color:#94a3b8;font-weight:600;padding:8px;text-align:left;
       border-bottom:2px solid #334155;border-right:1px solid #334155}
    th:last-child{border-right:none}
    td{vertical-align:top;word-break:break-word}
  </style></head><body>
  <h1>Audit Log — ${sheetTitle}</h1>
  <div class="meta">Exported ${format(new Date(), "MMMM d, yyyy 'at' HH:mm")} &nbsp;&bull;&nbsp; ${logs.length} events</div>
  <table>
    <thead><tr>
      <th style="width:160px">Timestamp</th>
      <th style="width:140px">Action</th>
      <th style="width:140px">CIN</th>
      <th>Details</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  ${buildExportPreviewCloseBar()}
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) { alert("Pop-up blocked. Please allow pop-ups and try again."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

export default function AuditLogPage() {
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedSheetId, setSelectedSheetId] = useState<string>("all");

  // Load all sheets and operations for the grouped selector
  const { data: sheets } = trpc.sheet.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: operations } = trpc.operation.list.useQuery(undefined, { enabled: isAuthenticated });

  // Load logs — all or per-sheet depending on selection
  const sheetIdNum = selectedSheetId !== "all" ? parseInt(selectedSheetId, 10) : null;

  const { data: allLogs, isLoading: allLoading } = trpc.auditLog.all.useQuery(undefined, {
    enabled: isAuthenticated && selectedSheetId === "all",
    refetchInterval: 15000,
  });

  const { data: sheetLogs, isLoading: sheetLoading } = trpc.auditLog.bySheet.useQuery(
    { sheetId: sheetIdNum! },
    {
      enabled: isAuthenticated && selectedSheetId !== "all" && sheetIdNum !== null,
      refetchInterval: 15000,
    }
  );

  const isLoading = selectedSheetId === "all" ? allLoading : sheetLoading;
  const logs = (selectedSheetId === "all" ? allLogs : sheetLogs) as AuditLog[] | undefined;

  const filtered = logs?.filter((log) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      ((log as any).userCIN ?? log.userName).toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.details ?? "").toLowerCase().includes(q)
    );
  });

  const selectedSheet = sheets?.find((s) => s.id === sheetIdNum);

  const handleExportPDF = () => {
    if (!filtered || filtered.length === 0) return;
    const title = selectedSheet?.title ?? "All Sheets";
    exportAuditToPDF(title, filtered);
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Audit Log</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Complete record of all certifications, edits, and system events
            </p>
          </div>
          {filtered && filtered.length > 0 && selectedSheetId !== "all" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={handleExportPDF}
            >
              <Download className="w-4 h-4" />
              Export PDF
            </Button>
          )}
        </div>

        {/* Filters row */}
        <div className="flex gap-3 mb-5">
          {/* Sheet selector */}
          <Select value={selectedSheetId} onValueChange={setSelectedSheetId}>
            <SelectTrigger className="w-56 shrink-0">
              <SelectValue placeholder="All running sheets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All running sheets</SelectItem>
              {operations?.map((op) => {
                const opSheets = sheets?.filter((s) => s.operationId === op.id) ?? [];
                if (opSheets.length === 0) return null;
                return (
                  <div key={op.id}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {op.name}
                    </div>
                    {opSheets.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)} className="pl-5">
                        {s.title}
                      </SelectItem>
                    ))}
                  </div>
                );
              })}
              {/* Sheets not linked to any known operation */}
              {sheets?.filter((s) => !operations?.some((op) => op.id === s.operationId)).map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Text search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by user, action, or details…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Log table */}
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          {isLoading ? (
            <div className="p-6 flex flex-col gap-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : !filtered || filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-3 rounded-xl bg-muted/50 mb-3">
                <ScrollText className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">
                {search ? "No matching log entries." : "No audit events recorded yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="running-sheet-table w-full">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="w-44">Timestamp</th>
                    <th className="w-36">Action</th>
                    <th className="w-36">CIN</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => {
                    const config = ACTION_CONFIG[log.action] ?? { label: log.action, icon: ScrollText, color: "text-muted-foreground" };
                    const Icon = config.icon;
                    return (
                      <tr key={log.id} className="stagger-item hover:bg-accent/20">
                        <td>
                          <span className="font-mono text-xs text-muted-foreground">
                            {format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
                          </span>
                        </td>
                        <td>
                          <div className={`flex items-center gap-1.5 text-sm font-medium ${config.color}`}>
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            {config.label}
                          </div>
                        </td>
                        <td>
                          <span className="text-sm font-mono text-foreground">{(log as any).userCIN ?? log.userName}</span>
                        </td>
                        <td>
                          <span className="text-sm text-muted-foreground">{log.details ?? "—"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {filtered && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3 text-right">
            Showing {filtered.length} of {logs?.length ?? 0} events
            {selectedSheet ? ` for "${selectedSheet.title}"` : ""}
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
