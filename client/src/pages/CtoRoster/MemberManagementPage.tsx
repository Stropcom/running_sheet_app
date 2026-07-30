import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  UserPlus,
  Trash2,
  AlertCircle,
  ArrowRightLeft,
  Users,
  FolderPlus,
  Pencil,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";
import { toast } from "sonner";

// Shift codes that are "personal" and may need to stay when changing teams
const PERSONAL_SHIFT_OPTIONS = [
  { code: "l", label: "Leave" },
  { code: "tt", label: "Training" },
  { code: "dep", label: "Deployment" },
  { code: "c", label: "Court" },
];

type Team = { id: number; name: string; sortOrder: number };
type Member = {
  id: number;
  cin: string;
  name: string;
  teamId: number;
  sortOrder: number;
  excludedFromCounts: boolean;
};
type Secondment = {
  id: number;
  memberId: number;
  destinationTeamId: number;
  destinationTeamName: string;
  startDate: string;
  endDate: string;
};

// ── Add Member Dialog ─────────────────────────────────────────────────────────
// Unlike the source app, a roster member is always an existing RunLog user
// (picked by CIN) — there's no free-text name entry, since every roster
// member is already a real RunLog account (see the merge plan).
function AddMemberDialog({
  open,
  onClose,
  teams,
  members,
}: {
  open: boolean;
  onClose: () => void;
  teams: Team[];
  members: Member[];
}) {
  const utils = trpc.useUtils();
  const { data: allUsers } = trpc.users.listForCin.useQuery(undefined, {
    enabled: open,
  });
  const [cin, setCin] = useState("");
  const [teamId, setTeamId] = useState<string>("");

  const availableUsers = useMemo(() => {
    const rosterCins = new Set(members.map(m => m.cin));
    return (allUsers ?? [])
      .filter(u => !rosterCins.has(u.cin))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allUsers, members]);

  const addMember = trpc.ctoRoster.members.add.useMutation({
    onSuccess: () => {
      utils.ctoRoster.members.list.invalidate();
      toast.success("Member added to the roster");
      onClose();
      setCin("");
      setTeamId("");
    },
    onError: e => toast.error(`Failed to add member: ${e.message}`),
  });

  const handleSubmit = () => {
    if (!cin) {
      toast.error("Please select a person");
      return;
    }
    if (!teamId) {
      toast.error("Please select a team");
      return;
    }
    addMember.mutate({ cin, teamId: parseInt(teamId) });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            Add to Roster
          </DialogTitle>
          <DialogDescription>
            Add an existing RunLog user to the CTO Roster.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Person <span className="text-destructive">*</span>
            </Label>
            <Select value={cin} onValueChange={setCin}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    availableUsers.length === 0
                      ? "No users available"
                      : "Select a person"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map(u => (
                  <SelectItem key={u.cin} value={u.cin}>
                    {u.name} ({u.cin})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableUsers.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Every RunLog user is already on the roster.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Team <span className="text-destructive">*</span>
            </Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a team" />
              </SelectTrigger>
              <SelectContent>
                {teams.map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {teams.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No teams yet — close this dialog and use "Manage Teams" to
                create one first.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={addMember.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={addMember.isPending}>
            {addMember.isPending ? "Adding…" : "Add to Roster"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Change Team Dialog ────────────────────────────────────────────────────────
function ChangeTeamDialog({
  open,
  onClose,
  member,
  teams,
  existingSecondment,
}: {
  open: boolean;
  onClose: () => void;
  member: Member | null;
  teams: Team[];
  existingSecondment?: Secondment;
}) {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"permanent" | "temporary">("permanent");
  const [newTeamId, setNewTeamId] = useState<string>("");
  const [keepCodes, setKeepCodes] = useState<Set<string>>(
    new Set(["l", "tt", "dep", "c"])
  );
  const [keepAllShifts, setKeepAllShifts] = useState(false);
  const [secDestTeamId, setSecDestTeamId] = useState<string>("");
  const [secStartDate, setSecStartDate] = useState<string>("");
  const [secEndDate, setSecEndDate] = useState<string>("");

  // Reset every time the dialog is opened for a (possibly different)
  // member — pre-fill the temporary tab from their existing secondment,
  // if they have one, since dates get adjusted often in practice.
  // Note: this dialog's `open` is entirely externally controlled (the
  // parent flips it via state, there's no <DialogTrigger> inside it), so
  // Radix's onOpenChange never fires for the true->false transition that
  // happens when it's opened — only for dialog-initiated closes (Escape,
  // overlay click). A plain effect on `open` is what actually catches it.
  useEffect(() => {
    if (!open) return;
    setMode(existingSecondment ? "temporary" : "permanent");
    setNewTeamId("");
    setKeepAllShifts(false);
    setKeepCodes(new Set(["l", "tt", "dep", "c"]));
    setSecDestTeamId(
      existingSecondment ? String(existingSecondment.destinationTeamId) : ""
    );
    setSecStartDate(existingSecondment?.startDate ?? "");
    setSecEndDate(existingSecondment?.endDate ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member?.id]);

  const changeTeam = trpc.ctoRoster.members.changeTeam.useMutation({
    onSuccess: () => {
      utils.ctoRoster.members.list.invalidate();
      toast.success(
        `${member?.name} moved to ${teams.find(t => t.id === parseInt(newTeamId))?.name}`
      );
      onClose();
    },
    onError: e => toast.error(`Failed: ${e.message}`),
  });

  const createSecondment = trpc.ctoRoster.secondments.create.useMutation({
    onSuccess: () => {
      utils.ctoRoster.secondments.list.invalidate();
      toast.success(`${member?.name} seconded`);
      onClose();
    },
    onError: e => toast.error(`Failed: ${e.message}`),
  });

  const updateSecondment = trpc.ctoRoster.secondments.update.useMutation({
    onSuccess: () => {
      utils.ctoRoster.secondments.list.invalidate();
      toast.success("Secondment updated");
      onClose();
    },
    onError: e => toast.error(`Failed: ${e.message}`),
  });

  const secondmentPending =
    createSecondment.isPending || updateSecondment.isPending;

  const toggleCode = (code: string) => {
    setKeepCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSubmit = () => {
    if (!member) return;
    if (mode === "permanent") {
      if (!newTeamId) {
        toast.error("Please select a new team");
        return;
      }
      changeTeam.mutate({
        memberId: member.id,
        newTeamId: parseInt(newTeamId),
        keepShiftCodes: Array.from(keepCodes),
        keepAllShifts,
      });
      return;
    }
    // Temporary secondment
    if (!secDestTeamId || !secStartDate || !secEndDate) {
      toast.error("Please select a destination team and both dates");
      return;
    }
    if (existingSecondment) {
      updateSecondment.mutate({
        id: existingSecondment.id,
        destinationTeamId: parseInt(secDestTeamId),
        startDate: secStartDate,
        endDate: secEndDate,
      });
    } else {
      createSecondment.mutate({
        memberId: member.id,
        destinationTeamId: parseInt(secDestTeamId),
        startDate: secStartDate,
        endDate: secEndDate,
      });
    }
  };

  const currentTeam = teams.find(t => t.id === member?.teamId);

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            Change Team
          </DialogTitle>
          <DialogDescription>
            <strong>{member?.name}</strong> is substantively on{" "}
            <strong>{currentTeam?.name ?? "—"}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
          <button
            onClick={() => setMode("permanent")}
            className={cn(
              "flex-1 text-sm rounded-md py-1.5 transition-colors",
              mode === "permanent"
                ? "bg-card shadow-sm font-medium"
                : "text-muted-foreground"
            )}
          >
            Permanent move
          </button>
          <button
            onClick={() => setMode("temporary")}
            className={cn(
              "flex-1 text-sm rounded-md py-1.5 transition-colors",
              mode === "temporary"
                ? "bg-card shadow-sm font-medium"
                : "text-muted-foreground"
            )}
          >
            Temporary (acting)
          </button>
        </div>

        {mode === "permanent" ? (
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Future shifts (from today) will be cleared unless you choose to
              keep them below.
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                New Team <span className="text-destructive">*</span>
              </Label>
              <Select value={newTeamId} onValueChange={setNewTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select destination team" />
                </SelectTrigger>
                <SelectContent>
                  {teams
                    .filter(t => t.id !== member?.teamId)
                    .map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer rounded-lg border border-border bg-muted/30 p-3">
              <Checkbox
                id="keep-all-shifts"
                checked={keepAllShifts}
                onCheckedChange={v => setKeepAllShifts(v === true)}
              />
              <span className="text-sm font-medium">
                Keep and copy all shifts
              </span>
            </label>
            <p className="text-xs text-muted-foreground -mt-2">
              {keepAllShifts
                ? "Every shift stays exactly as-is — nothing is cleared."
                : "Otherwise, pick which shift types to keep below; everything else is cleared from today forward."}
            </p>

            {!keepAllShifts && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Keep these shifts when changing teams
                </Label>
                <p className="text-xs text-muted-foreground">
                  Checked shift types will be preserved from today forward.
                  Unchecked types will be removed.
                </p>
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
                  {PERSONAL_SHIFT_OPTIONS.map(opt => (
                    <label
                      key={opt.code}
                      className="flex items-center gap-2.5 cursor-pointer"
                    >
                      <Checkbox
                        id={`keep-${opt.code}`}
                        checked={keepCodes.has(opt.code)}
                        onCheckedChange={() => toggleCode(opt.code)}
                      />
                      <span className="text-sm">{opt.label}</span>
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 px-1.5 ml-auto font-mono"
                      >
                        {opt.code}
                      </Badge>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  All other shift types (Day, Afternoon, Rest, On-Call, etc.)
                  will be cleared from today forward.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              {member?.name} keeps showing on {currentTeam?.name ?? "—"} as
              normal. For the dates below, their shifts belong to the
              destination team instead, and they get an extra "Acting" row
              there. Reverts automatically once the finish date passes.
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Destination Team <span className="text-destructive">*</span>
              </Label>
              <Select value={secDestTeamId} onValueChange={setSecDestTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select destination team" />
                </SelectTrigger>
                <SelectContent>
                  {teams
                    .filter(t => t.id !== member?.teamId)
                    .map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Start <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={secStartDate}
                  onChange={e => setSecStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Finish <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={secEndDate}
                  onChange={e => setSecEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={changeTeam.isPending || secondmentPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              changeTeam.isPending ||
              secondmentPending ||
              (mode === "permanent" ? !newTeamId : false)
            }
          >
            {mode === "permanent"
              ? changeTeam.isPending
                ? "Moving…"
                : "Move Member"
              : secondmentPending
                ? "Saving…"
                : existingSecondment
                  ? "Update Secondment"
                  : "Second Member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirmation ───────────────────────────────────────────────────────
function DeleteMemberDialog({
  open,
  onClose,
  member,
}: {
  open: boolean;
  onClose: () => void;
  member: Member | null;
}) {
  const utils = trpc.useUtils();
  const [deleteShifts, setDeleteShifts] = useState(true);

  const deleteMember = trpc.ctoRoster.members.delete.useMutation({
    onSuccess: () => {
      utils.ctoRoster.members.list.invalidate();
      toast.success(`${member?.name} removed from roster`);
      onClose();
    },
    onError: e => toast.error(`Failed: ${e.message}`),
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {member?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove <strong>{member?.name}</strong> from the CTO
            Roster. Their RunLog account is unaffected — this only removes them
            from the roster.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <Checkbox
              id="delete-shifts"
              checked={deleteShifts}
              onCheckedChange={v => setDeleteShifts(!!v)}
              className="mt-0.5"
            />
            <div>
              <span className="text-sm font-medium">
                Also delete all their shifts
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Uncheck to keep shift records in the database (member will no
                longer appear on the roster).
              </p>
            </div>
          </label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (member)
                deleteMember.mutate({ memberId: member.id, deleteShifts });
            }}
          >
            {deleteMember.isPending ? "Removing…" : "Remove Member"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Manage Teams Dialog ────────────────────────────────────────────────────────
// The live roster's teams aren't seeded automatically — this is the only place
// to create the first team before members can be added.
function ManageTeamsDialog({
  open,
  onClose,
  teams,
}: {
  open: boolean;
  onClose: () => void;
  teams: Team[];
}) {
  const utils = trpc.useUtils();
  const [newTeamName, setNewTeamName] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const invalidate = () => utils.ctoRoster.teams.list.invalidate();

  const addTeam = trpc.ctoRoster.teams.add.useMutation({
    onSuccess: () => {
      invalidate();
      setNewTeamName("");
      toast.success("Team added");
    },
    onError: e => toast.error(`Failed to add team: ${e.message}`),
  });
  const renameTeam = trpc.ctoRoster.teams.rename.useMutation({
    onSuccess: () => {
      invalidate();
      setRenamingId(null);
      toast.success("Team renamed");
    },
    onError: e => toast.error(`Failed to rename team: ${e.message}`),
  });
  const deleteTeam = trpc.ctoRoster.teams.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Team deleted");
    },
    onError: e => toast.error(`Failed to delete team: ${e.message}`),
  });
  const reorderTeams = trpc.ctoRoster.teams.reorder.useMutation({
    onSuccess: () => invalidate(),
    onError: e => toast.error(`Failed to reorder teams: ${e.message}`),
  });

  // teams is already sorted by sortOrder ascending (server-side) — moving a
  // team up/down just swaps its sortOrder with its neighbour's.
  const moveTeam = (index: number, direction: -1 | 1) => {
    const other = index + direction;
    if (other < 0 || other >= teams.length) return;
    reorderTeams.mutate([
      { id: teams[index].id, sortOrder: teams[other].sortOrder },
      { id: teams[other].id, sortOrder: teams[index].sortOrder },
    ]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-primary" />
            Manage Teams
          </DialogTitle>
          <DialogDescription>
            Teams group members on the roster grid — create at least one before
            adding members.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Team 1"
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && newTeamName.trim())
                  addTeam.mutate({ name: newTeamName.trim() });
              }}
            />
            <Button
              onClick={() => addTeam.mutate({ name: newTeamName.trim() })}
              disabled={!newTeamName.trim() || addTeam.isPending}
            >
              Add
            </Button>
          </div>

          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teams yet.</p>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border">
              {teams.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex flex-col -my-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0"
                      onClick={() => moveTeam(i, -1)}
                      disabled={i === 0 || reorderTeams.isPending}
                      title="Move up"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0"
                      onClick={() => moveTeam(i, 1)}
                      disabled={
                        i === teams.length - 1 || reorderTeams.isPending
                      }
                      title="Move down"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {renamingId === t.id ? (
                    <>
                      <Input
                        className="h-8 flex-1"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && renameValue.trim())
                            renameTeam.mutate({
                              teamId: t.id,
                              name: renameValue.trim(),
                            });
                        }}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="h-8"
                        onClick={() =>
                          renameValue.trim() &&
                          renameTeam.mutate({
                            teamId: t.id,
                            name: renameValue.trim(),
                          })
                        }
                        disabled={renameTeam.isPending}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => setRenamingId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium">
                        {t.name}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          setRenamingId(t.id);
                          setRenameValue(t.name);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => deleteTeam.mutate({ teamId: t.id })}
                        disabled={deleteTeam.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MemberManagementPage() {
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();
  const { data: teamsData, isLoading: teamsLoading } =
    trpc.ctoRoster.teams.list.useQuery();
  const { data: membersData, isLoading: membersLoading } =
    trpc.ctoRoster.members.list.useQuery();
  const { data: secondmentsData } = trpc.ctoRoster.secondments.list.useQuery();

  const setExcludedFromCounts =
    trpc.ctoRoster.members.setExcludedFromCounts.useMutation({
      onSuccess: () => utils.ctoRoster.members.list.invalidate(),
      onError: e => toast.error(`Failed to update: ${e.message}`),
    });
  const deleteSecondment = trpc.ctoRoster.secondments.delete.useMutation({
    onSuccess: () => {
      utils.ctoRoster.secondments.list.invalidate();
      toast.success("Secondment cancelled");
    },
    onError: e => toast.error(`Failed to cancel: ${e.message}`),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [showManageTeams, setShowManageTeams] = useState(false);
  const [changeTeamMember, setChangeTeamMember] = useState<Member | null>(null);
  const [deleteMemberTarget, setDeleteMemberTarget] = useState<Member | null>(
    null
  );

  const teams = (teamsData as Team[] | undefined) ?? [];
  const members = (membersData as Member[] | undefined) ?? [];
  const secondments = (secondmentsData as Secondment[] | undefined) ?? [];
  const secondmentByMemberId = new Map(secondments.map(s => [s.memberId, s]));
  const isLoading = teamsLoading || membersLoading;

  if (currentUser?.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-full py-24 text-center">
          <AlertCircle className="h-12 w-12 text-destructive/40 mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Access Denied
          </h2>
          <p className="text-sm text-muted-foreground">
            You need admin privileges to view this page.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <Users className="w-5 h-5 text-purple-500" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground">
              CTO Roster Members
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Add, remove, or move members between teams
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowManageTeams(true)}
            className="gap-1.5"
          >
            <FolderPlus className="h-4 w-4" />
            Manage Teams
          </Button>
          <Button onClick={() => setShowAdd(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            Add Member
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-4 space-y-2"
              >
                <Skeleton className="h-5 w-24" />
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-10 w-full" />
                ))}
              </div>
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center">
            <FolderPlus className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">No teams yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Create at least one team before adding members to the roster.
            </p>
            <Button
              variant="outline"
              onClick={() => setShowManageTeams(true)}
              className="gap-1.5"
            >
              <FolderPlus className="h-4 w-4" />
              Manage Teams
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {teams.map(team => {
              const teamMembers = members.filter(m => m.teamId === team.id);
              return (
                <div
                  key={team.id}
                  className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
                >
                  <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">
                      {team.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {teamMembers.length} member
                      {teamMembers.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  {teamMembers.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      No members in this team.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-semibold">
                            Name
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-right">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamMembers.map(member => (
                          <TableRow key={member.id}>
                            <TableCell className="font-medium text-sm">
                              {member.name}
                              {member.excludedFromCounts && (
                                <Badge
                                  variant="outline"
                                  className="ml-2 text-[10px] font-normal text-muted-foreground"
                                >
                                  Excluded from counts
                                </Badge>
                              )}
                              {secondmentByMemberId.has(member.id) && (
                                <Badge
                                  variant="outline"
                                  className="ml-2 text-[10px] font-normal text-primary border-primary/40 gap-1"
                                >
                                  Acting:{" "}
                                  {
                                    secondmentByMemberId.get(member.id)!
                                      .destinationTeamName
                                  }{" "}
                                  until{" "}
                                  {format(
                                    new Date(
                                      secondmentByMemberId.get(member.id)!
                                        .endDate + "T00:00:00"
                                    ),
                                    "d MMM"
                                  )}
                                  <button
                                    onClick={() =>
                                      deleteSecondment.mutate({
                                        id: secondmentByMemberId.get(member.id)!
                                          .id,
                                      })
                                    }
                                    disabled={deleteSecondment.isPending}
                                    title="Cancel secondment"
                                    className="hover:text-destructive"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-3">
                                <label
                                  className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none"
                                  title="When checked, this member's shifts don't count toward the team's ON DUTY / ON CALL totals (roster grid and Outlook)"
                                >
                                  <input
                                    type="checkbox"
                                    checked={member.excludedFromCounts}
                                    onChange={e =>
                                      setExcludedFromCounts.mutate({
                                        memberId: member.id,
                                        excluded: e.target.checked,
                                      })
                                    }
                                    className="h-3.5 w-3.5 accent-muted-foreground cursor-pointer"
                                  />
                                  Exclude from counts
                                </label>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs"
                                  onClick={() => setChangeTeamMember(member)}
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5" />
                                  Change Team
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteMemberTarget(member)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Remove
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <AddMemberDialog
          open={showAdd}
          onClose={() => setShowAdd(false)}
          teams={teams}
          members={members}
        />
        <ManageTeamsDialog
          open={showManageTeams}
          onClose={() => setShowManageTeams(false)}
          teams={teams}
        />
        <ChangeTeamDialog
          open={!!changeTeamMember}
          onClose={() => setChangeTeamMember(null)}
          member={changeTeamMember}
          teams={teams}
          existingSecondment={
            changeTeamMember
              ? secondmentByMemberId.get(changeTeamMember.id)
              : undefined
          }
        />
        <DeleteMemberDialog
          open={!!deleteMemberTarget}
          onClose={() => setDeleteMemberTarget(null)}
          member={deleteMemberTarget}
        />
      </div>
    </DashboardLayout>
  );
}
