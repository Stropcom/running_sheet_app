/**
 * "Share with": give named people in other Commands access to some or all of
 * this Command's operations, at View, Log or Manage. Below it, what has been
 * shared so far, with Revoke.
 */

import { useMemo, useState } from "react";
import { Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CommandChip } from "@/components/admin/CommandChip";
import { LevelPill } from "@/components/admin/LevelPill";
import { PersonPicker } from "@/components/admin/PersonPicker";
import type { AdminUserRow } from "@/components/admin/UserAccessGroups";
import {
  COMMAND_LABELS,
  COMMAND_SHORT,
  type CommandCode,
} from "@shared/commands";
import {
  SHARE_LEVELS,
  SHARE_LEVEL_HELP,
  SHARE_LEVEL_LABEL,
  type OperationShareRow,
  type ShareLevel,
} from "@shared/operationAccess";

function Choice({
  checked,
  onSelect,
  title,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <label
      className={`grid cursor-pointer grid-cols-[18px_minmax(0,1fr)] items-start gap-2.5 rounded-lg border p-3 ${
        checked
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:bg-accent/30"
      }`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
        className="mt-1"
      />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

export function ShareWithSection({
  viewCommand,
  users,
  shares,
  isAllRegions,
}: {
  viewCommand: CommandCode;
  users: AdminUserRow[];
  shares: OperationShareRow[];
  isAllRegions: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: allOps } = trpc.operation.list.useQuery();
  const ownOps = useMemo(
    () => (allOps ?? []).filter(o => o.command === viewCommand && !o.deletedAt),
    [allOps, viewCommand]
  );
  const candidates = useMemo(
    () => users.filter(u => u.command !== viewCommand && !u.archivedAt),
    [users, viewCommand]
  );

  const [people, setPeople] = useState<number[]>([]);
  // Bumped after a share so the picker starts clean (its search text too).
  const [pickerKey, setPickerKey] = useState(0);
  const [scope, setScope] = useState<"all" | "operations">("all");
  const [opIds, setOpIds] = useState<number[]>([]);
  const [level, setLevel] = useState<ShareLevel>("log");

  const refresh = () => {
    utils.admin.listShares.invalidate();
    utils.admin.userShares.invalidate();
    utils.operation.list.invalidate();
  };
  const create = trpc.admin.createShares.useMutation({
    onSuccess: r => {
      toast.success(
        `Shared. ${r.created} new, ${r.updated} changed${r.skipped ? `, ${r.skipped} skipped` : ""}.`
      );
      setPeople([]);
      setOpIds([]);
      setPickerKey(k => k + 1);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const revoke = trpc.admin.revokeShare.useMutation({
    onSuccess: () => {
      toast.success("Access removed. Anything already logged stays.");
      refresh();
    },
    onError: e => toast.error(e.message),
  });

  const ready = people.length > 0 && (scope === "all" || opIds.length > 0);
  const opText =
    scope === "all"
      ? `every ${COMMAND_SHORT[viewCommand]} operation`
      : opIds
          .map(id => ownOps.find(o => o.id === id)?.name)
          .filter(Boolean)
          .join(", ");

  // What was shared out, grouped by what and at which level.
  const out = shares.filter(s => s.fromCommand === viewCommand);
  const groups = useMemo(() => {
    const m = new Map<string, OperationShareRow[]>();
    for (const s of out) {
      const k = `${s.operationId ?? "all"}|${s.level}`;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return Array.from(m.entries());
  }, [out]);
  const [openGroup, setOpenGroup] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-xl border border-border/60 bg-card/50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Share with</h2>
          <span className="text-xs text-muted-foreground">
            Give people in other Commands access to{" "}
            {COMMAND_LABELS[viewCommand]} operations
          </span>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Who
          </h3>
          <PersonPicker
            candidates={candidates}
            selected={people}
            onChange={setPeople}
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice
              checked={scope === "all"}
              onSelect={() => setScope("all")}
              title="The whole Command"
              hint={`Every ${SHORT(viewCommand)} operation, including new ones`}
            />
            <Choice
              checked={scope === "operations"}
              onSelect={() => setScope("operations")}
              title="Select operations"
              hint="Only the ones you tick"
            />
          </div>
          {scope === "operations" && (
            <div className="grid max-h-56 gap-1.5 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2 sm:grid-cols-2">
              {ownOps.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">
                  No operations yet.
                </p>
              )}
              {ownOps.map(o => (
                <label
                  key={o.id}
                  className={`grid cursor-pointer grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                    opIds.includes(o.id)
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={opIds.includes(o.id)}
                    onChange={() =>
                      setOpIds(ids =>
                        ids.includes(o.id)
                          ? ids.filter(x => x !== o.id)
                          : [...ids, o.id]
                      )
                    }
                  />
                  <span className="truncate font-medium">{o.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Access level
          </h3>
          <Select value={level} onValueChange={v => setLevel(v as ShareLevel)}>
            <SelectTrigger className="sm:max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHARE_LEVELS.map(l => (
                <SelectItem key={l} value={l}>
                  {SHARE_LEVEL_LABEL[l]} — {SHARE_LEVEL_HELP[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg bg-primary/10 px-3 py-2.5 text-sm">
          <span className="rounded border border-foreground/40 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider">
            Preview
          </span>
          <span>
            {ready ? (
              <>
                <b>
                  {people.length} {people.length === 1 ? "person" : "people"}
                </b>{" "}
                will be able to open <b>{opText}</b> at{" "}
                <b>{SHARE_LEVEL_LABEL[level]}</b>.
              </>
            ) : (
              `Choose ${people.length === 0 ? "at least one person" : "at least one operation"} to continue.`
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            You can revoke this at any time. Everything already logged stays.
          </span>
          <Button
            disabled={!ready || create.isPending}
            onClick={() =>
              create.mutate({
                userIds: people,
                scope,
                operationIds: scope === "operations" ? opIds : undefined,
                fromCommand: isAllRegions ? viewCommand : undefined,
                level,
              })
            }
          >
            {create.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Share
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Active shares from {SHORT(viewCommand)} ({out.length})
        </h3>
        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Nothing is shared outside {COMMAND_LABELS[viewCommand]}.
          </p>
        ) : (
          groups.map(([key, rows]) => {
            const first = rows[0];
            const expanded = !!openGroup[key];
            return (
              <div
                key={key}
                className="overflow-hidden rounded-lg border border-border bg-card"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    className="flex min-w-0 flex-wrap items-center gap-2 text-left"
                    aria-expanded={expanded}
                    onClick={() =>
                      setOpenGroup(o => ({ ...o, [key]: !o[key] }))
                    }
                  >
                    <ChevronRight
                      className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
                    />
                    <b className="text-sm">
                      {first.operationName ??
                        `Every ${SHORT(first.fromCommand)} operation`}
                    </b>
                    <LevelPill level={first.level} />
                    <span className="text-xs text-muted-foreground">
                      {rows.length} {rows.length === 1 ? "person" : "people"}
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={revoke.isPending}
                    onClick={async () => {
                      for (const r of rows)
                        await revoke.mutateAsync({ id: r.id });
                    }}
                  >
                    Revoke all
                  </Button>
                </div>
                {expanded && (
                  <div className="divide-y divide-border/60 border-t border-border/60">
                    {rows.map(r => (
                      <div
                        key={r.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          {r.userName}{" "}
                          <span className="font-mono text-xs text-muted-foreground">
                            {r.userCIN}
                          </span>{" "}
                          <CommandChip command={r.userCommand} />
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate({ id: r.id })}
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SHORT(c: CommandCode) {
  return COMMAND_SHORT[c];
}
