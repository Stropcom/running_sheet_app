// Part of the Target Registry page (client/src/pages/TargetRegistry.tsx): the dialog that links a target to an operation.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Link to Operation Dialog ─────────────────────────────────────────────────

export function LinkOperationDialog({
  open,
  onClose,
  targetId,
  targetName,
  linkedOperationIds,
}: {
  open: boolean;
  onClose: () => void;
  targetId: number;
  targetName: string;
  linkedOperationIds: number[];
}) {
  const utils = trpc.useUtils();
  const { data: operations } = trpc.operation.list.useQuery(undefined, {
    enabled: open,
  });
  const link = trpc.target.registry.linkToOperation.useMutation({
    onSuccess: () => {
      utils.target.registry.list.invalidate();
    },
  });
  const unlink = trpc.target.registry.unlinkFromOperation.useMutation({
    onSuccess: () => {
      utils.target.registry.list.invalidate();
    },
  });

  const handleToggle = async (operationId: number, isLinked: boolean) => {
    try {
      if (isLinked) {
        await unlink.mutateAsync({ targetId, operationId });
        toast.success("Unlinked from operation.");
      } else {
        await link.mutateAsync({ targetId, operationId });
        toast.success("Linked to operation.");
      }
    } catch {
      toast.error("Failed to update link.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link Operations — {targetName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Toggle which operations this target is linked to.
        </p>
        <div className="space-y-2 max-h-64 overflow-y-auto py-2">
          {!operations ? (
            <Skeleton className="h-8 w-full" />
          ) : operations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No operations found.
            </p>
          ) : (
            operations.map(op => {
              const isLinked = linkedOperationIds.includes(op.id);
              return (
                <div
                  key={op.id}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                    isLinked
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                  onClick={() => handleToggle(op.id, isLinked)}
                >
                  <span className="text-sm font-medium">{op.name}</span>
                  {isLinked ? (
                    <Badge variant="default" className="text-xs gap-1">
                      <Link2 className="h-3 w-3" /> Linked
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Click to link
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
