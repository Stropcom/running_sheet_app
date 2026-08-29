/**
 * Searchable "which operation is this for" dropdown — every new target now
 * requires one (see AddTargetDialog). Lists current operations plus an
 * "Add new operation" entry that opens CreateOperationDialog inline and
 * auto-selects the result, so picking or creating an operation never
 * leaves the Add Target flow.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CreateOperationDialog } from "@/components/CreateOperationDialog";
import { ChevronDown, Check, Plus, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: { id: number; name: string } | null;
  onChange: (operation: { id: number; name: string }) => void;
  disabled?: boolean;
}

export function OperationPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: operations, isLoading } = trpc.operation.list.useQuery();

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border-2 border-border bg-background hover:bg-accent/50 active:scale-[0.98] transition-all text-left disabled:opacity-50 disabled:pointer-events-none"
          >
            <span
              className={cn(
                "text-sm truncate flex-1",
                value ? "text-foreground font-medium" : "text-muted-foreground"
              )}
            >
              {value ? value.name : "Select an operation…"}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search operations…" />
            <CommandList>
              <CommandEmpty>
                {isLoading ? "Loading…" : "No operations found."}
              </CommandEmpty>
              <CommandGroup>
                {operations?.map(op => (
                  <CommandItem
                    key={op.id}
                    value={op.name}
                    onSelect={() => {
                      onChange({ id: op.id, name: op.name });
                      setOpen(false);
                    }}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span className="flex-1 truncate">{op.name}</span>
                    {value?.id === op.id && <Check className="w-3.5 h-3.5" />}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    setCreateOpen(true);
                  }}
                  className="text-primary font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add new operation
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <CreateOperationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={onChange}
      />
    </>
  );
}
