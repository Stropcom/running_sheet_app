/**
 * The Command and Restricted fields on the New / Edit Operation forms.
 * Restricted: other Commands still see this operation's matches in Region
 * Search, with all the details, but can't open it in Intelligence.
 * Only admins can change either field — the server enforces that too.
 */

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMMAND_CODES,
  COMMAND_LABELS,
  type CommandCode,
} from "@shared/commands";

interface Props {
  command: CommandCode;
  restricted: boolean;
  /** Admins only. Everyone else sees the Command as a plain line and no tick. */
  canEdit: boolean;
  /** Allow choosing a different Command (the edit form); the new-operation
   * form shows the creator's own Command as a plain line. */
  commandEditable?: boolean;
  onCommand?: (c: CommandCode) => void;
  onRestricted: (v: boolean) => void;
}

export function OperationRegionFields({
  command,
  restricted,
  canEdit,
  commandEditable,
  onCommand,
  onRestricted,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label className="text-sm font-medium text-foreground mb-1.5 block">
          Command
        </Label>
        {canEdit && commandEditable ? (
          <Select
            value={command}
            onValueChange={v => onCommand?.(v as CommandCode)}
          >
            <SelectTrigger>
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
        ) : (
          <div className="h-9 px-3 flex items-center rounded-md border border-input bg-muted/40 text-sm text-muted-foreground">
            {COMMAND_LABELS[command]}
          </div>
        )}
      </div>
      {canEdit && (
        <label className="flex items-start gap-2.5 rounded-md border border-input p-3 cursor-pointer">
          <Checkbox
            checked={restricted}
            onCheckedChange={v => onRestricted(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-medium">Restricted operation</span>
            <span className="block text-xs text-muted-foreground">
              Other Commands will still see this operation’s matches in Region
              Search, with all the details, but can’t open it in Intelligence.
              They’re pointed to a Contact line for your Command instead.
            </span>
          </span>
        </label>
      )}
    </div>
  );
}
