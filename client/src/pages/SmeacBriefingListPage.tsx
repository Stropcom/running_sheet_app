import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { SmeacReadOnlyContent } from "@/components/SmeacReadOnlyContent";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  ShieldAlert,
  Check,
  Trash2,
  Pencil,
  FileDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  buildSmeacPdfHtml,
  mapBriefingToExportData,
  openSmeacPdfExport,
} from "@/lib/smeacExport";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type SmeacBriefingListItem = RouterOutputs["smeacBriefing"]["list"][number];

export default function SmeacBriefingListPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: briefings, isLoading } = trpc.smeacBriefing.list.useQuery();
  const { data: operations } = trpc.operation.list.useQuery();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);
  // Accordion — only one briefing's review row open at a time, same as the
  // sidebar's expandable folders. Clicking a row's own banner now reviews it
  // inline instead of navigating away (see SmeacBriefingRow below); the
  // Post notification still links straight to the map overlay unchanged.
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const deleteMutation = trpc.smeacBriefing.delete.useMutation({
    onSuccess: () => {
      toast.success("Briefing deleted");
      utils.smeacBriefing.list.invalidate();
    },
    onError: e => toast.error(e.message ?? "Failed to delete"),
  });

  const handleExportPdf = async (id: number) => {
    setExportingId(id);
    try {
      const briefing = await utils.smeacBriefing.getById.fetch({ id });
      const html = buildSmeacPdfHtml(
        mapBriefingToExportData(briefing, user?.cin ?? "UNKNOWN")
      );
      if (!openSmeacPdfExport(html)) {
        toast.error(
          "Couldn't open a new tab — check your browser's popup blocker."
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to export");
    } finally {
      setExportingId(null);
    }
  };

  const operationName = (operationId: number) =>
    (operations as any[] | undefined)?.find(o => o.id === operationId)?.name ??
    `Operation #${operationId}`;

  const confirmDeleteBriefing = briefings?.find(b => b.id === confirmDeleteId);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span>Administration</span>
              <span>/</span>
              <span className="text-foreground font-medium">
                SMEAC Briefings
              </span>
            </div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              SMEAC Briefings
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Exceptional-use urgent briefings — not a daily tool.
            </p>
          </div>
          {user?.role === "admin" && (
            <Button
              onClick={() => setLocation("/administration/smeac/new")}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Briefing
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !briefings || briefings.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No SMEAC briefings yet.
          </div>
        ) : (
          <div className="space-y-2">
            {briefings.map(b => (
              <SmeacBriefingRow
                key={b.id}
                briefing={b}
                operationName={operationName(b.operationId)}
                isAdmin={user?.role === "admin"}
                isExpanded={expandedId === b.id}
                onToggleExpand={() =>
                  setExpandedId(current => (current === b.id ? null : b.id))
                }
                onEdit={() => setLocation(`/administration/smeac/${b.id}/edit`)}
                onExportPdf={() => handleExportPdf(b.id)}
                isExporting={exportingId === b.id}
                onDelete={() => setConfirmDeleteId(b.id)}
              />
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={open => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this briefing?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteBriefing?.status === "posted"
                ? "This briefing was posted and notified every user — deleting it only removes it from this list, it does not un-notify anyone. This cannot be undone."
                : "This draft will be permanently removed. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteId !== null) {
                  deleteMutation.mutate({ id: confirmDeleteId });
                }
                setConfirmDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

// One briefing's row — a banner that expands inline into a read-only review
// (SmeacReadOnlyContent, the same content the map's docked overlay shows)
// with its own Edit/Export actions, rather than navigating away. Its own
// component (not inlined in the .map() above) because the expanded review
// needs its own data fetch, and hooks can only be called from a component,
// not conditionally inside a loop.
function SmeacBriefingRow({
  briefing: b,
  operationName,
  isAdmin,
  isExpanded,
  onToggleExpand,
  onEdit,
  onExportPdf,
  isExporting,
  onDelete,
}: {
  briefing: SmeacBriefingListItem;
  operationName: string;
  isAdmin: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onExportPdf: () => void;
  isExporting: boolean;
  onDelete: () => void;
}) {
  const detail = trpc.smeacBriefing.getById.useQuery(
    { id: b.id },
    { enabled: isExpanded }
  );

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="flex items-start gap-2 hover:bg-accent/50 transition-colors">
        <button
          onClick={onToggleExpand}
          className="flex-1 min-w-0 text-left flex items-start gap-3 p-3.5"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            {/* One wrapping flex row for name/badge/rev/date — on a narrow
                phone this drops the date (and, if needed, rev/badge) to a
                second line instead of squeezing the operation name down to
                a couple of characters via truncate, which is what a fixed-
                width date sitting beside a min-w-0 name used to do. */}
            <div className="flex items-center gap-x-2 gap-y-1 flex-wrap mb-0.5">
              <p className="text-sm font-semibold">{operationName}</p>
              <StatusBadge status={b.status} />
              <span className="text-[10px] font-mono text-muted-foreground">
                Rev {b.revision}
              </span>
              <span className="text-[11px] text-muted-foreground ml-auto">
                {b.postedAt
                  ? format(new Date(b.postedAt), "d MMM, h:mm a")
                  : format(new Date(b.createdAt), "d MMM, h:mm a")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {b.situation || "No situation summary"}
            </p>
          </div>
        </button>
        {isAdmin && (
          <div className="flex items-center gap-0.5 shrink-0 mr-2">
            <button
              onClick={onDelete}
              className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Delete briefing"
              title="Delete briefing"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="border-t border-border p-4 space-y-4">
          {detail.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-5 w-5" />
            </div>
          ) : !detail.data ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Briefing not found.
            </p>
          ) : (
            <SmeacReadOnlyContent
              briefing={detail.data}
              headerActions={
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={onEdit}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onExportPdf}
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <Spinner className="h-3.5 w-3.5 mr-1.5" />
                    ) : (
                      <FileDown className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Export
                  </Button>
                </div>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "posted") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
        <Check className="h-2.5 w-2.5" />
        Posted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-muted text-muted-foreground">
      Draft
    </span>
  );
}
