// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): the editor for one on-call entry.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnCallEntry } from "./types";
import { ON_CALL_ROLES, DAYS } from "./constants";

// ─── OnCallEntryEditor ────────────────────────────────────────────────────────
export function OnCallEntryEditor({
  entry,
  onChange,
  onRemove,
  users,
}: {
  entry: OnCallEntry;
  onChange: (patch: Partial<OnCallEntry>) => void;
  onRemove: () => void;
  users: {
    id: number;
    name: string;
    cin: string | null;
    phone?: string | null;
  }[];
}) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Select value={entry.role} onValueChange={v => onChange({ role: v })}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ON_CALL_ROLES.map(r => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive shrink-0"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Select
        value={entry.userId ? String(entry.userId) : "__none__"}
        onValueChange={v => {
          const uid_val = v === "__none__" ? null : Number(v);
          const selectedUser = uid_val
            ? users.find(u => u.id === uid_val)
            : null;
          onChange({
            userId: uid_val,
            mobile: selectedUser?.phone ?? entry.mobile ?? null,
          });
        }}
      >
        <SelectTrigger className="h-8 text-xs w-full">
          <SelectValue placeholder="Select user…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— None —</SelectItem>
          {users.map(u => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.name}
              {u.cin ? ` (${u.cin})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-8 text-xs"
        placeholder="Mobile number"
        value={entry.mobile ?? ""}
        onChange={e => onChange({ mobile: e.target.value })}
      />
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground">Day:</span>
        {["full", ...DAYS].map(d => (
          <button
            key={d}
            onClick={() => onChange({ dayScope: d })}
            className={cn(
              "text-xs px-2 py-0.5 rounded border transition-colors",
              entry.dayScope === d
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted"
            )}
          >
            {d === "full" ? "Full Week" : d}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-xs">
        <Checkbox
          checked={entry.isOnCall}
          onCheckedChange={v => onChange({ isOnCall: !!v })}
        />
        On-Call
      </label>
    </div>
  );
}
