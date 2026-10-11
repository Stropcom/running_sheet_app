/**
 * "Members" of Visiting from Commands: the people from other Commands this
 * Command has shared operations with, what they can open, and — the part that
 * matters day to day — which of THIS Command's teams they work in (a
 * Western team or a newly made one). Their own Command's team is untouched.
 */

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CommandChip } from "@/components/admin/CommandChip";
import { LevelPill } from "@/components/admin/LevelPill";
import { COMMAND_LABELS, type CommandCode } from "@shared/commands";
import type { OperationShareRow } from "@shared/operationAccess";
import { NO_TEAM_COLOUR, type TeamRow } from "@/lib/teams";

const OPEN_KEY = "runlog.accessVisitingMembers.open";
const NEW_TEAM = "__new";
const NO_TEAM = "__none";

const HEAD =
  "text-xs uppercase tracking-wider text-foreground/70 font-semibold";

/** Everyone from another Command this Command has shared with, by person. */
export function visitingPeople(
  shares: OperationShareRow[],
  viewCommand: CommandCode
): OperationShareRow[][] {
  const by = new Map<number, OperationShareRow[]>();
  for (const s of shares) {
    if (s.fromCommand === viewCommand && s.userCommand !== viewCommand) {
      by.set(s.userId, [...(by.get(s.userId) ?? []), s]);
    }
  }
  return Array.from(by.values()).sort((a, b) =>
    a[0].userName.localeCompare(b[0].userName)
  );
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function VisitingMembers({
  viewCommand,
  people,
  teams,
  visitorTeams,
  isAllRegions,
  onOpen,
  onNewTeam,
}: {
  viewCommand: CommandCode;
  people: OperationShareRow[][];
  /** This Command's teams, in display order. */
  teams: TeamRow[];
  visitorTeams: Array<{ userId: number; teamId: number }>;
  isAllRegions: boolean;
  onOpen: (id: number) => void;
  /** Open the new-team dialog; the new team is then given to this person. */
  onNewTeam: (userId: number) => void;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(readOpen);
  const toggle = () =>
    setOpen(o => {
      try {
        localStorage.setItem(OPEN_KEY, o ? "0" : "1");
      } catch {
        /* storage unavailable: the choice just won't be remembered */
      }
      return !o;
    });

  const refresh = () => {
    utils.admin.listShares.invalidate();
    utils.admin.userShares.invalidate();
    utils.admin.listVisitorTeams.invalidate();
    utils.users.listForCin.invalidate();
    utils.operation.list.invalidate();
  };
  const revoke = trpc.admin.revokeShare.useMutation();
  const setTeam = trpc.admin.setVisitorTeam.useMutation({
    onSuccess: refresh,
    onError: e => toast.error(e.message),
  });

  const revokePerson = async (items: OperationShareRow[]) => {
    try {
      for (const s of items) await revoke.mutateAsync({ id: s.id });
      toast.success(
        `${items[0].userName}'s access removed. Anything already logged stays.`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove access.");
    } finally {
      refresh();
    }
  };

  const teamOf = (userId: number) =>
    visitorTeams.find(v => v.userId === userId)?.teamId ?? null;

  const list = people;

  const teamPicker = (v: OperationShareRow) => {
    const teamId = teamOf(v.userId);
    return (
      <Select
        value={teamId != null ? String(teamId) : NO_TEAM}
        onValueChange={val => {
          if (val === NEW_TEAM) return onNewTeam(v.userId);
          setTeam.mutate({
            userId: v.userId,
            teamId: val === NO_TEAM ? null : Number(val),
            command: isAllRegions ? viewCommand : undefined,
          });
        }}
        disabled={setTeam.isPending}
      >
        <SelectTrigger
          className="h-9 w-full"
          aria-label={`${v.userName}'s ${COMMAND_LABELS[viewCommand]} team`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TEAM}>No team</SelectItem>
          {teams.map(t => (
            <SelectItem key={t.id} value={String(t.id)}>
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                  style={{
                    backgroundColor: t.colour ?? NO_TEAM_COLOUR,
                  }}
                  aria-hidden
                />
                {t.name}
              </span>
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={NEW_TEAM}>+ New team…</SelectItem>
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5 bg-muted/70 px-4 py-3 text-left hover:bg-muted"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 text-foreground/70 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="flex min-w-0 items-center gap-3">
          <span className="text-base font-semibold">Members</span>
          <span className="hidden text-xs text-foreground/70 sm:inline">
            Who is visiting, and which {COMMAND_LABELS[viewCommand]} team they
            are in
          </span>
        </span>
        <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground/70">
          {list.length} {list.length === 1 ? "person" : "people"}
        </span>
      </button>
      {open && (
        <div className="hidden overflow-x-auto border-t border-border md:block">
          <Table className="min-w-[720px] table-fixed">
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className={`${HEAD} w-[19%]`}>Name</TableHead>
                <TableHead className={`${HEAD} w-[8%]`}>CIN</TableHead>
                <TableHead className={`${HEAD} w-[11%]`}>Home</TableHead>
                <TableHead className={`${HEAD} w-[20%]`}>Can open</TableHead>
                <TableHead className={`${HEAD} w-[12%]`}>Access</TableHead>
                <TableHead className={`${HEAD} w-[20%]`}>
                  {COMMAND_LABELS[viewCommand]} team
                </TableHead>
                <TableHead className={`${HEAD} w-[10%]`}>
                  <span className="sr-only">Revoke</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-4 text-sm text-foreground/70"
                  >
                    Nobody outside {COMMAND_LABELS[viewCommand]} has been given
                    access yet. Use Share above.
                  </TableCell>
                </TableRow>
              ) : (
                list.map(items => {
                  const v = items[0];
                  const teamId = teamOf(v.userId);
                  return (
                    <TableRow
                      key={v.userId}
                      className="border-border align-top hover:bg-accent/10"
                    >
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => onOpen(v.userId)}
                          className="text-left font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {v.userName}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-foreground/80">
                        {v.userCIN ?? "—"}
                      </TableCell>
                      <TableCell>
                        <CommandChip command={v.userCommand} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {items.map(s => (
                          <div key={s.id}>
                            {s.operationName ??
                              `Every ${COMMAND_LABELS[s.fromCommand]} operation`}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          {items.map(s => (
                            <LevelPill key={s.id} level={s.level} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{teamPicker(v)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          disabled={revoke.isPending}
                          title={`Remove all of ${v.userName}'s access to ${COMMAND_LABELS[viewCommand]}`}
                          onClick={() => revokePerson(items)}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {open && (
        <div className="flex flex-col gap-2 border-t border-border p-3 md:hidden">
          {list.length === 0 && (
            <p className="text-sm text-foreground/70">
              Nobody outside {COMMAND_LABELS[viewCommand]} has been given access
              yet. Use Share above.
            </p>
          )}
          {list.map(items => {
            const v = items[0];
            return (
              <div
                key={v.userId}
                className="space-y-2.5 rounded-lg border border-border bg-background p-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(v.userId)}
                    className="min-w-0 truncate text-left font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    {v.userName}
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-sm text-foreground/80">
                      {v.userCIN ?? "—"}
                    </span>
                    <CommandChip command={v.userCommand} />
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  {items.map(s => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0 truncate">
                        {s.operationName ??
                          `Every ${COMMAND_LABELS[s.fromCommand]} operation`}
                      </span>
                      <LevelPill level={s.level} />
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                    {COMMAND_LABELS[viewCommand]} team
                  </p>
                  {teamPicker(v)}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-destructive"
                  disabled={revoke.isPending}
                  onClick={() => revokePerson(items)}
                >
                  Revoke access
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
