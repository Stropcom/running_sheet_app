import { useAuth } from "@/_core/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPickedRosterCommand,
  setPickedRosterCommand,
} from "@/lib/rosterCommand";
import { COMMAND_CHIP_CLASS } from "@/lib/commandStyle";
import {
  COMMAND_CODES,
  COMMAND_LABELS,
  DEFAULT_COMMAND,
  isCommandCode,
  type CommandCode,
} from "@shared/commands";

/** Pages that belong to one Command's roster / tasking board. */
export function isRosterPath(path: string): boolean {
  return (
    path.startsWith("/cto-roster") ||
    path === "/operation-manager" ||
    path === "/reports/weekly-tasking"
  );
}

/**
 * Says whose roster / tasking board this is. Each Command has its own, so
 * everyone sees their Command's name; an all-region admin also gets a picker
 * to look at another Command's.
 */
export function RosterCommandBar() {
  const { user } = useAuth();
  if (!user) return null;
  const home: CommandCode = isCommandCode(user.command)
    ? user.command
    : DEFAULT_COMMAND;
  const canPick = user.allRegions === true;
  const current: CommandCode = canPick
    ? (getPickedRosterCommand() ?? home)
    : home;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
          Showing
        </span>
        <span
          className={`rounded-md border px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide ${COMMAND_CHIP_CLASS[current]}`}
        >
          {COMMAND_LABELS[current]}
        </span>
      </div>
      {canPick && (
        <Select
          value={current}
          onValueChange={v => {
            if (!isCommandCode(v)) return;
            setPickedRosterCommand(v === home ? null : v);
            // Everything on screen belongs to the old Command; start clean.
            window.location.reload();
          }}
        >
          <SelectTrigger
            aria-label="Command to show"
            className="h-9 w-full min-w-[12rem] sm:w-56"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMAND_CODES.map(c => (
              <SelectItem key={c} value={c}>
                {COMMAND_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
