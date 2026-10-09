/**
 * "Shared access" on a person's profile: which Command's operations were
 * shared with them, whole Command or named operations, at what level, who
 * shared and when. An admin sees what their own Command shared (and can
 * remove it), plus anything shared into their Command that reaches this
 * person (read only — that Command's admins manage it). Other Commands'
 * sharing stays private.
 */

import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CommandChip } from "@/components/admin/CommandChip";
import { LevelPill } from "@/components/admin/LevelPill";
import {
  COMMAND_LABELS,
  COMMAND_SHORT,
  type CommandCode,
} from "@shared/commands";

export function SharedAccessCard({
  userId,
  userName,
  userCommand,
  adminCommand,
  allRegions,
}: {
  userId: number;
  userName: string;
  userCommand: CommandCode;
  adminCommand: CommandCode;
  allRegions: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: shares, isLoading } = trpc.admin.userShares.useQuery({
    userId,
  });
  const revoke = trpc.admin.revokeShare.useMutation({
    onSuccess: () => {
      toast.success("Access removed. Anything already logged stays.");
      utils.admin.userShares.invalidate();
      utils.admin.listShares.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const first = userName.split(" ")[0];

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Shared access</p>
        <span className="text-xs text-muted-foreground">
          Operations from other Commands that reach {first}
        </span>
      </div>
      {isLoading ? null : !shares || shares.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Nothing has been shared with {first}. {first} sees{" "}
          {COMMAND_LABELS[userCommand]} operations only.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {shares.map(s => {
            const mine = allRegions || s.fromCommand === adminCommand;
            return (
              <div
                key={s.id}
                className="grid grid-cols-1 items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CommandChip command={s.fromCommand} />
                    <b className="text-sm">
                      {s.operationName ??
                        `Every ${COMMAND_SHORT[s.fromCommand]} operation`}
                    </b>
                    <LevelPill level={s.level} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Shared by CIN {s.sharedByCIN} ·{" "}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {mine ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate({ id: s.id })}
                  >
                    Remove {first}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground sm:text-right">
                    Managed by {COMMAND_SHORT[s.fromCommand]}
                    <br />
                    Command admins
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
