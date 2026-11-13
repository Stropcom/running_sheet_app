// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): the editor for one priority row.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState } from "react";
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
import { Plus, Trash2 } from "lucide-react";
import type { PriorityRow } from "./types";
import { CATEGORIES, REQUEST_TYPES } from "./constants";

// ─── PriorityRowEditor ────────────────────────────────────────────────────────
export function PriorityRowEditor({
  row,
  idx,
  onChange,
  onRemove,
  opOptions,
  onCreateOp,
}: {
  row: PriorityRow;
  idx: number;
  onChange: (patch: Partial<PriorityRow>) => void;
  onRemove: () => void;
  opOptions: { id: number; name: string }[];
  onCreateOp: (
    name: string,
    onCreated: (id: number, name: string) => void
  ) => void;
}) {
  const [addingOp, setAddingOp] = useState(false);
  const [newOpName, setNewOpName] = useState("");
  const reqTypes = row.requestType
    ? row.requestType
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
    : [];

  const toggleReqType = (rt: string) => {
    const next = reqTypes.includes(rt)
      ? reqTypes.filter(r => r !== rt)
      : [...reqTypes, rt];
    onChange({ requestType: next.join(", ") });
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Select
          value={String(row.priority || idx + 1)}
          onValueChange={v => onChange({ priority: Number(v) })}
        >
          <SelectTrigger className="h-8 text-xs w-16 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2].map(n => (
              <SelectItem key={n} value={String(n)}>
                #{n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={row.category}
          onValueChange={v => onChange({ category: v })}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {/* Operation */}
      <div className="space-y-1">
        <Select
          value={row.operationName ?? "__none__"}
          onValueChange={v => {
            if (v === "__none__") {
              onChange({ operationId: null, operationName: null });
            } else if (v === "__add__") {
              setAddingOp(true);
            } else {
              const op = opOptions.find(o => o.name === v);
              onChange({ operationId: op?.id ?? null, operationName: v });
            }
          }}
        >
          <SelectTrigger className="h-8 text-xs w-full">
            <SelectValue placeholder="Select operation…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {opOptions.map(op => (
              <SelectItem key={op.id} value={op.name}>
                {op.name}
              </SelectItem>
            ))}
            <SelectItem value="__add__" className="text-primary">
              + Add Operation
            </SelectItem>
          </SelectContent>
        </Select>
        {addingOp && (
          <div className="flex gap-1">
            <Input
              className="h-8 text-xs flex-1"
              placeholder="Operation name…"
              value={newOpName}
              onChange={e => setNewOpName(e.target.value)}
              autoFocus
            />
            <Button
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                onCreateOp(newOpName, (id, name) =>
                  onChange({ operationId: id, operationName: name })
                );
                setNewOpName("");
                setAddingOp(false);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      {/* Team */}
      <Input
        className="h-8 text-xs"
        placeholder="Team (e.g. Surv 1)"
        value={row.team ?? ""}
        onChange={e => onChange({ team: e.target.value })}
      />
      {/* Request Type multi-select */}
      <div className="flex flex-wrap gap-3">
        {REQUEST_TYPES.map(rt => (
          <label
            key={rt}
            className="flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <Checkbox
              checked={reqTypes.includes(rt)}
              onCheckedChange={() => toggleReqType(rt)}
            />
            {rt}
          </label>
        ))}
      </div>
    </div>
  );
}
