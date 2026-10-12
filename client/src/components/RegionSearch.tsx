/**
 * Region Search — a small button in the Intelligence Folder header (where
 * Merge Entities used to be) that opens a search across every Command.
 *
 * Everyone signed in sees the same matches and details. The one difference
 * is "Open in Intelligence": an operation marked Restricted can only be
 * opened from its own Command (or by an all-region admin). The match and its
 * details still show, with a "Contact <Command>" line instead.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Lock, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";
import { COMMAND_CHIP_CLASS } from "@/lib/commandStyle";
import {
  COMMAND_CODES,
  COMMAND_LABELS,
  COMMAND_SHORT,
  type CommandCode,
} from "@shared/commands";
import type { RegionEntityType, RegionResult } from "@shared/regionSearch";

const TYPE_LABEL: Record<RegionEntityType, string> = {
  person: "Person",
  vehicle: "Vehicle",
  address: "Address",
};

const TYPE_FILTERS: Array<{ value: RegionEntityType | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "person", label: "People" },
  { value: "vehicle", label: "Vehicles" },
  { value: "address", label: "Addresses" },
];

function CommandChip({ command }: { command: CommandCode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${COMMAND_CHIP_CLASS[command]}`}
    >
      {COMMAND_SHORT[command]}
    </span>
  );
}

function FilterRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground mr-1">{label}</span>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
            value === o.value
              ? "border-primary bg-primary/10 font-semibold text-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent/40"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function openPath(r: RegionResult): string {
  if (r.isTarget && r.targetId) return `/intelligence/target/${r.targetId}`;
  if (r.type === "vehicle")
    return `/intelligence/vehicle/${encodeURIComponent(r.label)}`;
  if (r.type === "address")
    return `/intelligence/location/${encodeURIComponent(r.label)}`;
  return `/intelligence/associate/${encodeURIComponent(r.label)}`;
}

function displayLabel(r: RegionResult): string {
  if (r.type === "vehicle") return formatIntelVehicle(r.label);
  if (r.type === "address") return formatIntelAddress(r.label);
  return r.label;
}

export function RegionSearchButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<RegionEntityType | "">("");
  const [command, setCommand] = useState<CommandCode | "">("");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const myCommand = user?.command as CommandCode | undefined;

  // Search as the officer types, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const enabled = open && query.length >= 2;
  const { data, isFetching } = trpc.intelligence.regionSearch.useQuery(
    {
      query,
      type: type || undefined,
      command: command || undefined,
    },
    { enabled }
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Search className="w-3.5 h-3.5" />
        Region Search
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Region Search</DialogTitle>
            <DialogDescription>
              Search every Command at once for a person, vehicle or address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Name, registration or address"
              aria-label="Search all Commands"
            />
            <div className="flex flex-col gap-2">
              <FilterRow
                label="Type"
                value={type}
                options={TYPE_FILTERS}
                onChange={setType}
              />
              <FilterRow
                label="Command"
                value={command}
                options={[
                  { value: "" as const, label: "All" },
                  ...COMMAND_CODES.map(c => ({
                    value: c,
                    label: COMMAND_SHORT[c],
                  })),
                ]}
                onChange={setCommand}
              />
            </div>

            {!enabled ? (
              <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                Type at least two letters. Every Command is searched at once.
              </p>
            ) : isFetching && !data ? (
              <div className="flex justify-center p-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : !data || data.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                Nothing matches “{query}”. Try fewer letters.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm">
                  <b>
                    {data.length} result{data.length === 1 ? "" : "s"}
                  </b>{" "}
                  for “{query}”
                </p>
                {data.map(r => (
                  <div
                    key={r.key}
                    className={`overflow-hidden rounded-xl border bg-card ${
                      r.hits.length > 1
                        ? "border-foreground/60"
                        : "border-border"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-muted/30 px-4 py-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {TYPE_LABEL[r.type]}
                      </span>
                      <span className="font-semibold">{displayLabel(r)}</span>
                      {r.hits.length > 1 && (
                        <span className="ml-auto rounded-full border border-foreground/60 bg-card px-2.5 py-0.5 text-xs font-semibold">
                          Held by {r.hits.length} Commands — possible overlap
                        </span>
                      )}
                    </div>
                    {r.hits.map(h => {
                      const restricted = h.operations.some(o => o.restricted);
                      return (
                        <div
                          key={h.command}
                          className="grid grid-cols-1 gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[120px_minmax(0,1fr)_auto]"
                        >
                          <div className="flex flex-wrap items-start gap-1.5 sm:flex-col">
                            <CommandChip command={h.command} />
                            {h.command === myCommand && (
                              <span className="rounded bg-primary/10 px-2 py-0.5 text-[11.5px] font-semibold text-primary">
                                Your Command
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
                            <Fact label="Role">
                              <span
                                className={`rounded px-2 py-0.5 text-[11.5px] font-semibold ${
                                  h.role === "Target"
                                    ? "bg-foreground text-background"
                                    : "border border-border bg-muted/40 text-muted-foreground"
                                }`}
                              >
                                {h.role}
                              </span>
                            </Fact>
                            <Fact label="Operations">
                              <span className="flex flex-wrap gap-1.5">
                                {h.operations.map(o => (
                                  <span
                                    key={o.id}
                                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11.5px] font-semibold ${
                                      o.restricted
                                        ? "bg-foreground text-background"
                                        : "border border-border bg-muted/40 text-muted-foreground"
                                    }`}
                                  >
                                    {o.restricted && (
                                      <Lock className="h-2.5 w-2.5" />
                                    )}
                                    {o.name}
                                  </span>
                                ))}
                              </span>
                            </Fact>
                            <Fact label="Contact">
                              <span className="text-sm">
                                Contact {COMMAND_LABELS[h.command]}
                              </span>
                            </Fact>
                          </div>
                          <div className="flex flex-col items-start gap-1.5 sm:max-w-[200px] sm:items-end sm:text-right">
                            {h.canOpen ? (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setOpen(false);
                                  navigate(openPath(r));
                                }}
                              >
                                Open in Intelligence
                              </Button>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" disabled>
                                  <Lock className="h-3 w-3" />
                                  Open in Intelligence
                                </Button>
                                {restricted && (
                                  <span className="text-xs text-muted-foreground">
                                    Restricted operation. Contact{" "}
                                    {COMMAND_LABELS[h.command]}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
