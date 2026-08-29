/**
 * "New Operation" form — extracted out of Home.tsx so it can also be
 * launched from the operation picker in AddTargetDialog (every new target
 * now requires an operation; officers who don't have one yet create it
 * inline instead of leaving the Add Target flow). Only Operation Name is
 * required — PROMIS/IMS/Investigation Unit stay optional, matching Home.tsx's
 * original form exactly.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires once the operation is created — id + name for the caller to
   * auto-select it (e.g. in a picker) without a separate refetch. */
  onCreated: (operation: { id: number; name: string }) => void;
}

export function CreateOperationDialog({
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [promis, setPromis] = useState("");
  const [ims, setIms] = useState("");
  const [unit, setUnit] = useState("");
  const utils = trpc.useUtils();

  const createOp = trpc.operation.create.useMutation({
    onSuccess: ({ id }) => {
      utils.operation.list.invalidate();
      toast.success("Operation created");
      const createdName = name.trim();
      setName("");
      setPromis("");
      setIms("");
      setUnit("");
      onOpenChange(false);
      onCreated({ id, name: createdName });
    },
    onError: e => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!name.trim()) return;
    createOp.mutate({
      name: name.trim(),
      promisNumber: promis.trim() || undefined,
      imsNumber: ims.trim() || undefined,
      investigationUnit: unit.trim() || undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={o => !createOp.isPending && onOpenChange(o)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Operation</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Operation Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              PROMIS Number{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </label>
            <Input value={promis} onChange={e => setPromis(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              IMS Number{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </label>
            <Input value={ims} onChange={e => setIms(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Investigation Unit{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </label>
            <Input
              value={unit}
              onChange={e => setUnit(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createOp.isPending}
          >
            {createOp.isPending ? "Creating…" : "Create Operation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
