/**
 * Pick named people from across the organisation (about 300): one search box
 * that matches name and CIN, Command filter buttons, a scrolling result list
 * capped at 40 so it stays quick, and the picked people as removable chips.
 */

import { useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CommandChip } from "@/components/admin/CommandChip";
import {
  matchesPerson,
  type AdminUserRow,
} from "@/components/admin/UserAccessGroups";
import {
  COMMAND_CODES,
  COMMAND_SHORT,
  type CommandCode,
} from "@shared/commands";

const SHOW = 40;
export function PersonPicker({
  candidates,
  selected,
  onChange,
}: {
  candidates: AdminUserRow[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CommandCode | "">("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const c: Partial<Record<CommandCode, number>> = {};
    for (const u of candidates) c[u.command] = (c[u.command] ?? 0) + 1;
    return c;
  }, [candidates]);

  const matches = useMemo(
    () =>
      candidates
        .filter(
          u => (!filter || u.command === filter) && matchesPerson(u, query)
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [candidates, filter, query]
  );
  const shown = matches.slice(0, SHOW);
  const toggle = (id: number) =>
    onChange(
      selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
    );
  const chosen = selected
    .map(id => candidates.find(u => u.id === id))
    .filter((u): u is AdminUserRow => !!u);
  const commandsPresent = COMMAND_CODES.filter(c => counts[c]);

  return (
    <div
      className="space-y-2"
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <Input
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setHi(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi(h => Math.min(h + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi(h => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (shown[hi]) toggle(shown[hi].id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={`Search ${candidates.length} ${candidates.length === 1 ? "person" : "people"} by name or CIN`}
        aria-label="Find people"
        aria-expanded={open}
        role="combobox"
        aria-controls="person-picker-list"
      />

      {open && (
        <>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Filter by Command"
          >
            {[
              {
                value: "" as const,
                label: `All Commands · ${candidates.length}`,
              },
              ...commandsPresent.map(c => ({
                value: c,
                label: `${COMMAND_SHORT[c]} · ${counts[c]}`,
              })),
            ].map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setFilter(f.value);
                  setHi(0);
                }}
                aria-pressed={filter === f.value}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  filter === f.value
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border bg-card text-muted-foreground hover:bg-accent/40"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div
            id="person-picker-list"
            ref={boxRef}
            role="listbox"
            aria-multiselectable="true"
            className="max-h-72 overflow-y-auto rounded-lg border border-border bg-card"
          >
            {shown.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No one matches “{query}”. Try part of a name, or a CIN.
              </p>
            ) : (
              shown.map((u, i) => {
                const on = selected.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => toggle(u.id)}
                    className={`grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-accent/40 ${
                      on ? "bg-primary/10" : i === hi ? "bg-accent/30" : ""
                    }`}
                  >
                    <span
                      className={`grid h-4 w-4 place-items-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"}`}
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 truncate text-sm">
                      <span className="font-medium">{u.name}</span>{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        {u.cin}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <CommandChip command={u.command} />
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {u.teamName ?? "No team"}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
            <div className="sticky bottom-0 flex justify-between border-t border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              <span>
                {matches.length > SHOW
                  ? `Showing ${SHOW} of ${matches.length} — keep typing to narrow`
                  : `${matches.length} match${matches.length === 1 ? "" : "es"}`}
              </span>
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}

      {chosen.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span>
              <b>{chosen.length} selected</b>
            </span>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          </div>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {chosen.map(u => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs"
              >
                {u.name}{" "}
                <span className="font-mono text-muted-foreground">{u.cin}</span>
                <button
                  type="button"
                  aria-label={`Remove ${u.name}`}
                  onClick={() => toggle(u.id)}
                  className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
