import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { UcoGuideReadOnlyContent } from "@/components/UcoGuideReadOnlyContent";
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
  Eye,
  Check,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  Map as MapIcon,
} from "lucide-react";

export default function UcoGuideListPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: guides, isLoading } = trpc.ucoGuide.list.useQuery();
  const { data: operations } = trpc.operation.list.useQuery();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const deleteMutation = trpc.ucoGuide.delete.useMutation({
    onSuccess: () => {
      toast.success("Guide deleted");
      utils.ucoGuide.list.invalidate();
    },
    onError: e => toast.error(e.message ?? "Failed to delete"),
  });

  const operationName = (operationId: number) =>
    (operations as any[] | undefined)?.find(o => o.id === operationId)?.name ??
    `Operation #${operationId}`;

  const confirmDeleteGuide = guides?.find(g => g.id === confirmDeleteId);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span>Administration</span>
              <span>/</span>
              <span className="text-foreground font-medium">UCO Guide</span>
            </div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Eye className="h-5 w-5 text-amber-500" />
              UCO Surveillance Deployment Guide
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Notify a deployment's guide to a chosen set of users — they
              acknowledge it from their notifications.
            </p>
          </div>
          {user?.role === "admin" && (
            <Button
              onClick={() => setLocation("/administration/uco-guide/new")}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Guide
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !guides || guides.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No UCO guides yet.
          </div>
        ) : (
          <div className="space-y-2">
            {guides.map(g => (
              <UcoGuideRow
                key={g.id}
                guide={g}
                operationName={operationName(g.operationId)}
                isAdmin={user?.role === "admin"}
                isExpanded={expandedId === g.id}
                onToggleExpand={() =>
                  setExpandedId(current => (current === g.id ? null : g.id))
                }
                onEdit={() =>
                  setLocation(`/administration/uco-guide/${g.id}/edit`)
                }
                onOpenOnMap={() =>
                  setLocation(`/intelligence/mapping?ucoGuide=${g.id}`)
                }
                onDelete={() => setConfirmDeleteId(g.id)}
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
            <AlertDialogTitle>Delete this guide?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteGuide?.status === "posted"
                ? "This guide was posted and notified its recipients — deleting it only removes it from this list, it does not un-notify anyone. This cannot be undone."
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

type UcoGuideListItem =
  inferRouterOutputs<AppRouter>["ucoGuide"]["list"][number];

// A hook (the on-demand detail fetch) lives per row, so it gets its own
// component rather than being called conditionally inside the list's map —
// same shape as SmeacBriefingRow on the SMEAC Briefings page.
function UcoGuideRow({
  guide: g,
  operationName,
  isAdmin,
  isExpanded,
  onToggleExpand,
  onEdit,
  onOpenOnMap,
  onDelete,
}: {
  guide: UcoGuideListItem;
  operationName: string;
  isAdmin: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onOpenOnMap: () => void;
  onDelete: () => void;
}) {
  const utils = trpc.useUtils();
  const detail = trpc.ucoGuide.getById.useQuery(
    { id: g.id },
    { enabled: isExpanded }
  );
  const setLevel = trpc.ucoGuide.setLevel.useMutation({
    onSuccess: () => {
      utils.ucoGuide.getById.invalidate({ id: g.id });
      utils.ucoGuide.list.invalidate();
    },
    onError: e => toast.error(e.message ?? "Failed to update level"),
  });

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="flex items-start gap-2 hover:bg-accent/50 transition-colors">
        <button
          onClick={onToggleExpand}
          aria-expanded={isExpanded}
          className="flex-1 min-w-0 text-left flex items-start gap-3 p-3.5"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-x-2 gap-y-1 flex-wrap mb-0.5">
              <p className="text-sm font-semibold">{operationName}</p>
              <StatusBadge status={g.status} />
              <span className="text-[10px] font-mono text-muted-foreground">
                Rev {g.revision}
              </span>
              <span className="text-[11px] text-muted-foreground ml-auto">
                {g.postedAt
                  ? format(new Date(g.postedAt), "d MMM, h:mm a")
                  : format(new Date(g.createdAt), "d MMM, h:mm a")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              Level {g.currentLevel} · {g.recipientCins.length} notified
            </p>
          </div>
        </button>
        {isAdmin && (
          <div className="flex items-center gap-0.5 shrink-0 mr-2">
            <button
              onClick={onDelete}
              className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Delete guide"
              title="Delete guide"
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
              Guide not found.
            </p>
          ) : (
            <UcoGuideReadOnlyContent
              guide={detail.data}
              onSetLevel={level =>
                setLevel.mutate({ id: detail.data!.id, level })
              }
              headerActions={
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={onEdit}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                  )}
                  {g.status === "posted" && (
                    <Button variant="outline" size="sm" onClick={onOpenOnMap}>
                      <MapIcon className="h-3.5 w-3.5 mr-1.5" />
                      Open on map
                    </Button>
                  )}
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
