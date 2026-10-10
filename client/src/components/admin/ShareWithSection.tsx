/**
 * "Share": give named people in other Commands access to some of this
 * Command's operations, at the same levels as the usual access (Investigator,
 * Observer, Full Access, Full Access + User Management).
 */

import { useMemo, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
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
import { PersonPicker } from "@/components/admin/PersonPicker";
import type { AdminUserRow } from "@/components/admin/UserAccessGroups";
import { COMMAND_LABELS, type CommandCode } from "@shared/commands";
import {
  SHARE_LEVELS,
  shareLevelText,
  type ShareLevel,
} from "@shared/operationAccess";

const OPEN_KEY = "runlog.accessShare.open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function ShareWithSection({
  viewCommand,
  users,
  isAllRegions,
}: {
  viewCommand: CommandCode;
  users: AdminUserRow[];
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
  const ready = people.length > 0 && opIds.length > 0;
  // Rarely used, so it starts closed; the choice is remembered on this device.
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

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5 bg-muted/60 px-4 py-3 text-left hover:bg-muted"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="text-base font-semibold">Share</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Give people in other Commands access to{" "}
            {COMMAND_LABELS[viewCommand]} operations
          </span>
        </button>
        {open && (
          <div className="space-y-4 border-t border-border p-4">
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
                Operations
              </h3>
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
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Access level
              </h3>
              <Select
                value={level}
                onValueChange={v => setLevel(v as ShareLevel)}
              >
                <SelectTrigger className="sm:max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHARE_LEVELS.map(l => (
                    <SelectItem key={l} value={l}>
                      {shareLevelText(l)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                You can revoke this at any time. Everything already logged
                stays.
              </span>
              <Button
                disabled={!ready || create.isPending}
                onClick={() =>
                  create.mutate({
                    userIds: people,
                    scope: "operations",
                    operationIds: opIds,
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
        )}
      </div>
    </div>
  );
}
