import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Plus, Eye, Check, Trash2, Pencil } from "lucide-react";

export default function UcoGuideListPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: guides, isLoading } = trpc.ucoGuide.list.useQuery();
  const { data: operations } = trpc.operation.list.useQuery();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

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
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
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
              <div
                key={g.id}
                className="flex items-center gap-2 rounded-xl bg-card border border-border hover:bg-accent/50 transition-colors"
              >
                <button
                  onClick={() =>
                    setLocation(`/administration/uco-guide/${g.id}`)
                  }
                  className="flex-1 min-w-0 text-left flex items-center gap-3 p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold truncate">
                        {operationName(g.operationId)}
                      </p>
                      <StatusBadge status={g.status} />
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        Rev {g.revision}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      Level {g.currentLevel} · {g.recipientCins.length} notified
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {g.postedAt
                      ? format(new Date(g.postedAt), "d MMM, h:mm a")
                      : format(new Date(g.createdAt), "d MMM, h:mm a")}
                  </span>
                </button>
                <div className="flex items-center gap-0.5 shrink-0 mr-2">
                  {user?.role === "admin" && (
                    <>
                      <button
                        onClick={() =>
                          setLocation(`/administration/uco-guide/${g.id}/edit`)
                        }
                        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        aria-label="Edit guide"
                        title="Edit guide"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(g.id)}
                        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        aria-label="Delete guide"
                        title="Delete guide"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
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
