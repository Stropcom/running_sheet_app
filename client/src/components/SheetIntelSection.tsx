import { useState } from "react";
import {
  Banknote,
  Briefcase,
  Eye,
  Handshake,
  Lock,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useOffline } from "@/contexts/OfflineContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SECTION_BAND,
  SECTION_CARD,
  SECTION_COUNT,
  SECTION_TITLE,
} from "@/lib/pageKit";
import { FORM_LABEL } from "@/lib/formKit";
import { NewThisShiftGroups } from "@/components/NewThisShiftGroups";
import {
  CUE_CATEGORY_LABELS,
  INTEL_CATEGORY_ORDER,
  highlightSegments,
  intelByCategory,
  type CueCategory,
  type SheetIntelLine,
} from "@shared/sheetIntel";

// The "New Intelligence" section at the bottom of the Supervisor Summary.
//   - "New this shift": persons, vehicles and locations whose first-ever
//     recorded occurrence is on this sheet.
//   - "Actions and items": the running sheet's own sentences that mention an
//     item carried, a device, money, a meeting or exchange, or behaviour — each
//     with the matched words picked out, a tick (untick = left out of the PDF
//     and the Weekly Report), and a straight count of the same item on this
//     sheet. Officers can add their own lines.
// It is locked while the summary is complete (reopen the summary to change it).

const CATEGORY_ICON: Record<CueCategory, typeof Briefcase> = {
  items: Briefcase,
  devices: Smartphone,
  money: Banknote,
  meetings: Handshake,
  behaviour: Eye,
};

/** Line as the server returns it: the shared line plus whether the signed-in
 * officer may edit or remove it. */
export type IntelLineView = SheetIntelLine & { editable?: boolean };

function timeToMinutes(v: string): number | null {
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins < 1440 ? mins : null;
}

function minutesToTime(m: number | null): string {
  if (m === null || m === undefined) return "";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

interface LineFormValues {
  category: CueCategory;
  heading: string;
  text: string;
  time: string;
}

function LineForm({
  initial,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: LineFormValues;
  saving: boolean;
  submitLabel: string;
  onSubmit: (v: LineFormValues) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const valid = v.heading.trim() !== "" && v.text.trim() !== "";
  return (
    <div
      className="grid gap-3 rounded-lg border border-primary/50 bg-card p-3 sm:grid-cols-2"
      data-testid="intel-line-form"
    >
      <label className="flex flex-col gap-1">
        <span className={FORM_LABEL}>Type</span>
        <Select
          value={v.category}
          onValueChange={c => setV({ ...v, category: c as CueCategory })}
        >
          <SelectTrigger aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTEL_CATEGORY_ORDER.map(c => (
              <SelectItem key={c} value={c}>
                {CUE_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={FORM_LABEL}>Time (optional)</span>
        <Input
          type="time"
          value={v.time}
          onChange={e => setV({ ...v, time: e.target.value })}
          aria-label="Time"
        />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className={FORM_LABEL}>Heading</span>
        <Input
          value={v.heading}
          maxLength={160}
          placeholder="e.g. Black backpack"
          onChange={e => setV({ ...v, heading: e.target.value })}
          aria-label="Heading"
        />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className={FORM_LABEL}>Wording</span>
        <Textarea
          value={v.text}
          rows={3}
          maxLength={2000}
          placeholder="What was seen, in your own words"
          onChange={e => setV({ ...v, text: e.target.value })}
          aria-label="Wording"
        />
      </label>
      <div className="grid grid-cols-2 gap-2 sm:col-span-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => onSubmit(v)}
          disabled={!valid || saving}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function IntelLineRow({
  line,
  locked,
  onToggle,
  onEdit,
  onRemove,
}: {
  line: IntelLineView;
  locked: boolean;
  onToggle: (included: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const manual = line.source === "manual";
  const segments = highlightSegments(line.sentence, line.matched);
  return (
    <div
      className={`grid grid-cols-[1.25rem_4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[1.25rem_4.5rem_minmax(0,1fr)_auto] ${
        line.included ? "" : "opacity-50"
      }`}
      data-testid="intel-line"
      data-key={line.key}
    >
      {manual ? (
        <span aria-hidden className="h-4 w-4" />
      ) : (
        <Checkbox
          checked={line.included}
          disabled={locked}
          onCheckedChange={v => onToggle(v === true)}
          aria-label={`Include "${line.heading}" in the PDF`}
          className="mt-0.5"
        />
      )}
      <span className="pt-0.5 font-mono text-xs text-muted-foreground">
        {line.time ?? "—"}
      </span>
      <div className="min-w-0">
        <p
          className={`text-sm font-semibold [overflow-wrap:anywhere] ${
            line.included ? "" : "line-through"
          }`}
        >
          {line.heading}
        </p>
        <p className="mt-0.5 border-l-2 border-border pl-2 text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
          {segments.map((s, i) =>
            s.hit ? (
              <mark
                key={i}
                className="rounded-sm bg-amber-100 px-0.5 text-foreground dark:bg-amber-500/30"
              >
                {s.text}
              </mark>
            ) : (
              <span key={i}>{s.text}</span>
            )
          )}
        </p>
      </div>
      <div className="col-start-3 flex flex-wrap items-center gap-1.5 sm:col-start-auto sm:flex-col sm:items-end">
        {line.doubtful && (
          <span className="whitespace-nowrap rounded-full border border-amber-600 bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
            {line.doubtWord ?? "May have"}
          </span>
        )}
        {manual && (
          <span className="whitespace-nowrap rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold">
            Added by {line.addedByCIN}
          </span>
        )}
        {manual && line.editable && !locked && (
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={onEdit}
            >
              <Pencil className="mr-1 h-3 w-3" />
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={onRemove}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Remove
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function SheetIntelSection({
  sheetId,
  locked: lockedByScreen,
}: {
  sheetId: number;
  /** The summary or sheet is locked on the screen above. */
  locked: boolean;
}) {
  const { isOnline } = useOffline();
  const utils = trpc.useUtils();
  const { data } = trpc.summary.getIntel.useQuery(
    { sheetId },
    { enabled: !!sheetId, refetchInterval: isOnline ? 10000 : false }
  );
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const refresh = () => utils.summary.getIntel.invalidate({ sheetId });
  const onError = (e: { message: string }) => toast.error(e.message);
  const tick = trpc.summary.setIntelIncluded.useMutation({
    onSuccess: refresh,
    onError,
  });
  const add = trpc.summary.addIntelLine.useMutation({
    onSuccess: () => {
      setAdding(false);
      refresh();
    },
    onError,
  });
  const update = trpc.summary.updateIntelLine.useMutation({
    onSuccess: () => {
      setEditingId(null);
      refresh();
    },
    onError,
  });
  const remove = trpc.summary.removeIntelLine.useMutation({
    onSuccess: refresh,
    onError,
  });

  const locked = lockedByScreen || !!data?.locked;
  const lines = (data?.lines ?? []) as IntelLineView[];
  const groups = intelByCategory(lines);
  const included = lines.filter(l => l.included).length;
  const nw = data?.newThisShift;
  const anyNew =
    !!nw && nw.persons.length + nw.vehicles.length + nw.locations.length > 0;

  function submit(
    v: LineFormValues,
    run: (input: {
      category: CueCategory;
      heading: string;
      text: string;
      timeMinutes: number | null;
    }) => void
  ) {
    run({
      category: v.category,
      heading: v.heading.trim(),
      text: v.text.trim(),
      timeMinutes: timeToMinutes(v.time),
    });
  }

  return (
    <section
      className={SECTION_CARD}
      data-testid="new-intelligence"
      aria-label="New Intelligence"
    >
      <div className={`${SECTION_BAND} flex-wrap justify-between`}>
        <h2 className={SECTION_TITLE}>New Intelligence</h2>
        <div className="flex items-center gap-2">
          {locked && (
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Lock className="h-3 w-3" />
              Locked
            </span>
          )}
          <span className={SECTION_COUNT}>
            {included} of {lines.length} in the PDF
          </span>
        </div>
      </div>

      {!data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* New this shift */}
          <div className="flex flex-col gap-2">
            <p className={FORM_LABEL}>New this shift — first time recorded</p>
            {anyNew ? (
              <NewThisShiftGroups data={nw!} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No person, vehicle or location is recorded for the first time on
                this sheet.
              </p>
            )}
          </div>

          {/* Actions and items */}
          <div className="flex flex-col gap-2">
            <p className={FORM_LABEL}>Actions and items</p>
            <p className="text-xs text-muted-foreground">
              Taken from the running sheet's own wording. Untick a line to leave
              it out of the PDF and the Weekly Report.
            </p>
            {groups.length === 0 && !adding && (
              <p className="text-sm italic text-muted-foreground">
                Nothing on this sheet mentions an item carried, a device, money,
                a meeting or exchange.
              </p>
            )}
            {groups.map(g => {
              const Icon = CATEGORY_ICON[g.category];
              return (
                <div
                  key={g.category}
                  className="overflow-hidden rounded-lg border border-border bg-card"
                  data-testid={`intel-cat-${g.category}`}
                >
                  <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-2 text-xs font-bold uppercase tracking-wide">
                    <Icon className="h-4 w-4 shrink-0" />
                    {g.label}
                    <span className="ml-auto font-semibold tabular-nums text-muted-foreground">
                      {g.lines.length}
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {g.lines.map(l =>
                      editingId === l.manualId && l.source === "manual" ? (
                        <div key={l.key} className="p-3">
                          <LineForm
                            initial={{
                              category: l.category,
                              heading: l.heading,
                              text: l.sentence,
                              time: minutesToTime(l.timeMinutes),
                            }}
                            saving={update.isPending}
                            submitLabel="Save line"
                            onCancel={() => setEditingId(null)}
                            onSubmit={v =>
                              submit(v, input =>
                                update.mutate({
                                  sheetId,
                                  id: l.manualId!,
                                  ...input,
                                })
                              )
                            }
                          />
                        </div>
                      ) : (
                        <IntelLineRow
                          key={l.key}
                          line={l}
                          locked={locked}
                          onToggle={inc =>
                            tick.mutate({
                              sheetId,
                              key: l.key,
                              included: inc,
                            })
                          }
                          onEdit={() => {
                            setAdding(false);
                            setEditingId(l.manualId!);
                          }}
                          onRemove={() => {
                            if (
                              window.confirm(
                                `Remove "${l.heading}" from New Intelligence?`
                              )
                            )
                              remove.mutate({ sheetId, id: l.manualId! });
                          }}
                        />
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {adding ? (
              <LineForm
                initial={{
                  category: "items",
                  heading: "",
                  text: "",
                  time: "",
                }}
                saving={add.isPending}
                submitLabel="Add line"
                onCancel={() => setAdding(false)}
                onSubmit={v =>
                  submit(v, input => add.mutate({ sheetId, ...input }))
                }
              />
            ) : (
              !locked && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setAdding(true);
                  }}
                  className="flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add item
                </button>
              )
            )}

            {data.leftOut.length > 0 && (
              <details className="border-t border-dashed border-border pt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-semibold text-foreground">
                  {data.leftOut.length} sentence
                  {data.leftOut.length === 1 ? "" : "s"} left out on purpose
                  (they say it did not happen, or are quoted speech)
                </summary>
                <ul className="mt-1.5 list-disc space-y-1 pl-5">
                  {data.leftOut.map((l, i) => (
                    <li key={i}>
                      <span className="font-mono">{l.time ?? "—"}</span> —{" "}
                      {l.sentence}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
