/**
 * Add or edit a team in a Command: name, map pin colour and optional
 * Assumed Identity phones (shown in the Crash Helper). Editing also offers
 * Delete — the team's members simply become "No team".
 */
import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { COMMAND_LABELS, type CommandCode } from "@shared/commands";
import { TEAM_SWATCHES, type TeamRow } from "@/lib/teams";

export function TeamDialog({
  open,
  onOpenChange,
  command,
  team,
  memberCount = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Command a new team is added to. */
  command: CommandCode;
  /** Set to edit this team; leave out to add one. */
  team?: TeamRow;
  /** Used in the delete warning. */
  memberCount?: number;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [colour, setColour] = useState<string>(TEAM_SWATCHES[0]);
  const [phones, setPhones] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Start from the team being edited (or a clean form) each time it opens.
  useEffect(() => {
    if (!open) return;
    setName(team?.name ?? "");
    setColour(team?.colour ?? TEAM_SWATCHES[0]);
    setPhones(team?.aiPhones.join("\n") ?? "");
  }, [open, team]);

  const refresh = () => {
    utils.users.listTeams.invalidate();
    utils.admin.listUsers.invalidate();
    utils.users.listForCin.invalidate();
  };
  const create = trpc.admin.createTeam.useMutation();
  const update = trpc.admin.updateTeam.useMutation();
  const remove = trpc.admin.deleteTeam.useMutation();
  const busy = create.isPending || update.isPending || remove.isPending;

  const phoneList = phones
    .split(/[\n,]/)
    .map(p => p.trim())
    .filter(Boolean);

  const save = async () => {
    const body = {
      name: name.trim(),
      colour,
      aiPhones: phoneList,
    };
    try {
      if (team) {
        await update.mutateAsync({ id: team.id, ...body });
        toast.success(`${body.name} updated.`);
      } else {
        await create.mutateAsync({ command, ...body });
        toast.success(`${body.name} added to ${COMMAND_LABELS[command]}.`);
      }
      refresh();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the team.");
    }
  };

  const doDelete = async () => {
    if (!team) return;
    try {
      const r = await remove.mutateAsync({ id: team.id });
      toast.success(
        `${team.name} deleted${r.moved ? ` — ${r.moved} ${r.moved === 1 ? "person is" : "people are"} now in No team` : ""}.`
      );
      refresh();
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the team.");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {team ? `Edit ${team.name}` : "Add team"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {COMMAND_LABELS[team?.command ?? command]}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Team 3"
                maxLength={64}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Map colour</Label>
              <div className="flex flex-wrap items-center gap-2">
                {TEAM_SWATCHES.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColour(c)}
                    aria-label={`Colour ${c}`}
                    aria-pressed={colour === c}
                    className={`h-7 w-7 rounded-full border-2 transition ${
                      colour === c
                        ? "border-foreground ring-2 ring-foreground/20"
                        : "border-transparent hover:border-border"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={colour}
                  onChange={e => setColour(e.target.value)}
                  aria-label="Pick any colour"
                  className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Their pins on the live map use this colour.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="team-phones">
                Assumed Identity phones{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="team-phones"
                value={phones}
                onChange={e => setPhones(e.target.value)}
                placeholder={"One per line, e.g.\n0400 000 000"}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Shown to the team in the Crash Helper.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {team ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button onClick={save} disabled={busy || !name.trim()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {team ? "Save" : "Add team"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {team?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberCount > 0
                ? `${memberCount} ${memberCount === 1 ? "person is" : "people are"} in this team. They stay in ${COMMAND_LABELS[team?.command ?? command]} and move to "No team". Running sheets already written are not changed.`
                : "Nobody is in this team. Running sheets already written are not changed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={doDelete}
            >
              Delete team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
