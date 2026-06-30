import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/DashboardLayout";
import { ClipboardCheck, AlertTriangle, CheckCircle2, ChevronRight, FolderOpen } from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

export default function GovernanceListPage() {
  const [, navigate] = useLocation();

  // Fetch all operations and their sheets
  const { data: operations, isLoading } = trpc.operation.list.useQuery(undefined);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-3xl mx-auto space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Governance</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select a running sheet to review its write-off checklist
            </p>
          </div>
        </div>

        {/* Operations list */}
        {!operations || operations.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No operations found.</p>
            <p className="text-xs mt-1">Create an operation and running sheet first.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {operations.map((op) => (
              <OperationGroup key={op.id} operationId={op.id} operationName={op.name} onNavigate={navigate} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function OperationGroup({
  operationId,
  operationName,
  onNavigate,
}: {
  operationId: number;
  operationName: string;
  onNavigate: (path: string) => void;
}) {
  const { data: sheets, isLoading } = trpc.sheet.listByOperation.useQuery({ operationId });

  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }
  if (!sheets || sheets.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border/30">
        <FolderOpen className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {operationName}
        </span>
        <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">
          {sheets.length} sheet{sheets.length !== 1 ? "s" : ""}
        </Badge>
      </div>
      <div className="divide-y divide-border/20">
        {sheets.map((sheet) => (
          <button
            key={sheet.id}
            onClick={() => onNavigate(`/governance/${sheet.id}`)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{sheet.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sheet.createdAt ? format(new Date(sheet.createdAt), "dd MMM yyyy") : ""}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
