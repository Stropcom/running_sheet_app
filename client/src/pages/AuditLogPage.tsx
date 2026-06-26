import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import DashboardLayout from "@/components/DashboardLayout";
import { ScrollText, Search, ShieldCheck, Unlock, FilePen, UserPlus, UserMinus, FileText, Trash2 } from "lucide-react";
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

export default function AuditLogPage() {
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState("");

  const { data: logs, isLoading } = trpc.auditLog.all.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 15000,
  });

  const filtered = logs?.filter((log) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      log.userName.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.details ?? "").toLowerCase().includes(q)
    );
  });

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
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by user, action, or details…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
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
                    <th className="w-36">User</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log, i) => {
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
                          <span className="text-sm text-foreground">{log.userName}</span>
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
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
