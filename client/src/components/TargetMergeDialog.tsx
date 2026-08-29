import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Merge } from "lucide-react";

// Shown when adding a new target whose name matches an existing one. Unlike
// the Intelligence entity dedup merge (a single label string, see
// EntityDuplicateDialog), a target is a structured record — so instead of
// picking one winner label, each conflicting field is resolved individually.
// Whichever side loses a field is kept as a "Previous" history record on the
// server (see mergeTargetFieldDetails in server/db.ts), never dropped.

type ExtraVehicle = { full: string; short: string };
type WildField = { label: string; value: string };
export type ExtraAddress = {
  id: string;
  label: string;
  businessName: string;
  unitNo: string;
  houseNo: string;
  streetName: string;
  streetType: string;
  suburb: string;
  state: string;
  full: string;
  short: string;
};

const FIELD_LABELS: Record<string, string> = {
  name: "Full Name, Born",
  tgt: "Target (TGT)",
  hbf: "Home Address Full (HBF)",
  hb: "Home (HB)",
  v1f: "Vehicle 1 Full (V1F)",
  v1: "Vehicle (V1)",
  dep: "Depart (DEP)",
  arr: "Arrive (ARR)",
};
const FIELD_ORDER = [
  "name",
  "tgt",
  "hbf",
  "hb",
  "v1f",
  "v1",
  "dep",
  "arr",
] as const;
type FieldName = (typeof FIELD_ORDER)[number];

export interface ExistingTargetLike {
  id: number;
  name: string;
  tgt: string | null;
  hbf: string | null;
  hb: string | null;
  v1f: string | null;
  v1: string | null;
  dep: string | null;
  arr: string | null;
  extraVehicles: string | null; // JSON: ExtraVehicle[]
  extraAddresses: string | null; // JSON: ExtraAddress[]
  wildFields: string | null; // JSON: WildField[]
}

export interface IncomingTargetLike {
  name: string;
  tgt: string;
  hbf: string;
  hb: string;
  v1f: string;
  v1: string;
  dep: string;
  arr: string;
  extraVehicles: ExtraVehicle[];
  extraAddresses: ExtraAddress[];
  wildFields: WildField[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: ExistingTargetLike;
  incoming: IncomingTargetLike;
  onMerged: (targetId: number) => void;
}

function parseJsonArray<T>(json: string | null | undefined): T[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as T[];
  } catch {
    return [];
  }
}

export function TargetMergeDialog({
  open,
  onOpenChange,
  existing,
  incoming,
  onMerged,
}: Props) {
  const mergeMutation = trpc.target.registry.mergeFieldDetails.useMutation();
  const [selections, setSelections] = useState<
    Record<string, "new" | "existing">
  >({});

  const conflicts = useMemo(() => {
    const out: {
      field: FieldName;
      existingVal: string;
      incomingVal: string;
    }[] = [];
    for (const field of FIELD_ORDER) {
      const existingVal = (existing[field] ?? "").trim();
      const incomingVal = (incoming[field] ?? "").trim();
      if (!incomingVal) continue; // nothing new entered — nothing to resolve
      if (existingVal === incomingVal) continue; // identical, no conflict
      if (!existingVal) continue; // existing was blank — just fills in, not a conflict
      out.push({ field, existingVal, incomingVal });
    }
    return out;
  }, [existing, incoming]);

  const autoFills = useMemo(() => {
    const out: { field: FieldName; incomingVal: string }[] = [];
    for (const field of FIELD_ORDER) {
      const existingVal = (existing[field] ?? "").trim();
      const incomingVal = (incoming[field] ?? "").trim();
      if (incomingVal && !existingVal) out.push({ field, incomingVal });
    }
    return out;
  }, [existing, incoming]);

  const existingExtraVehicles = parseJsonArray<ExtraVehicle>(
    existing.extraVehicles
  );
  const existingExtraAddresses = parseJsonArray<ExtraAddress>(
    existing.extraAddresses
  );
  const existingWildFields = parseJsonArray<WildField>(existing.wildFields);
  const newExtraVehicles = incoming.extraVehicles.filter(
    v => v.full.trim() || v.short.trim()
  );
  const newExtraAddresses = incoming.extraAddresses.filter(
    a => a.full.trim() || a.short.trim()
  );
  const newWildFields = incoming.wildFields.filter(w => w.value.trim());
  const addVehicleCount = newExtraVehicles.filter(
    v =>
      !existingExtraVehicles.some(
        e =>
          e.full.trim().toLowerCase() === v.full.trim().toLowerCase() &&
          e.short.trim().toLowerCase() === v.short.trim().toLowerCase()
      )
  ).length;
  const addAddressCount = newExtraAddresses.filter(
    a =>
      !existingExtraAddresses.some(
        e =>
          e.full.trim().toLowerCase() === a.full.trim().toLowerCase() &&
          e.short.trim().toLowerCase() === a.short.trim().toLowerCase()
      )
  ).length;
  const addWildCount = newWildFields.filter(
    w =>
      !existingWildFields.some(
        e =>
          e.label.trim().toLowerCase() === w.label.trim().toLowerCase() &&
          e.value.trim().toLowerCase() === w.value.trim().toLowerCase()
      )
  ).length;

  const getSelection = (field: string) => selections[field] ?? "new";

  const handleMerge = async () => {
    const resolutions: {
      field: FieldName;
      value: string;
      discarded?: string;
    }[] = [
      ...conflicts.map(c => ({
        field: c.field,
        value: getSelection(c.field) === "new" ? c.incomingVal : c.existingVal,
        discarded:
          getSelection(c.field) === "new" ? c.existingVal : c.incomingVal,
      })),
      ...autoFills.map(a => ({ field: a.field, value: a.incomingVal })),
    ];
    try {
      await mergeMutation.mutateAsync({
        targetId: existing.id,
        resolutions,
        appendExtraVehicles: newExtraVehicles,
        appendWildFields: newWildFields,
        appendExtraAddresses: newExtraAddresses,
      });
      toast.success(`Merged into existing target "${existing.name}"`);
      onMerged(existing.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed.");
    }
  };

  const summaryBits = [
    autoFills.length > 0
      ? `${autoFills.length} field${autoFills.length !== 1 ? "s" : ""} will be filled in`
      : null,
    addVehicleCount > 0
      ? `${addVehicleCount} vehicle${addVehicleCount !== 1 ? "s" : ""} added`
      : null,
    addAddressCount > 0
      ? `${addAddressCount} address${addAddressCount !== 1 ? "es" : ""} added`
      : null,
    addWildCount > 0
      ? `${addWildCount} extra field${addWildCount !== 1 ? "s" : ""} added`
      : null,
  ].filter(Boolean);

  return (
    <Dialog
      open={open}
      onOpenChange={v => !mergeMutation.isPending && onOpenChange(v)}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="w-4 h-4 text-primary shrink-0" /> Merge Target
            Details
          </DialogTitle>
          <DialogDescription>
            {conflicts.length === 0
              ? "No conflicting details — the new information will be added to the existing target."
              : 'Some details differ from the existing target. Pick which value stays current for each — the other is kept as a labeled "Previous" record, nothing is lost.'}
          </DialogDescription>
        </DialogHeader>

        {conflicts.length > 0 && (
          <div className="flex flex-col gap-3 py-1">
            {conflicts.map(c => (
              <div key={c.field} className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {FIELD_LABELS[c.field]}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      side: "new" as const,
                      label: "New",
                      value: c.incomingVal,
                    },
                    {
                      side: "existing" as const,
                      label: "Existing",
                      value: c.existingVal,
                    },
                  ].map(opt => (
                    <label
                      key={opt.side}
                      className={`rounded-lg border p-2.5 flex flex-col gap-1 cursor-pointer transition-colors ${
                        getSelection(c.field) === opt.side
                          ? "border-primary bg-primary/5"
                          : "border-border/60"
                      }`}
                      onClick={() =>
                        setSelections(s => ({ ...s, [c.field]: opt.side }))
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {opt.label}
                        </span>
                        <input
                          type="radio"
                          checked={getSelection(c.field) === opt.side}
                          onChange={() =>
                            setSelections(s => ({ ...s, [c.field]: opt.side }))
                          }
                        />
                      </div>
                      <span className="text-xs text-foreground break-words">
                        {opt.value}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {summaryBits.length > 0 && (
          <p className="text-xs text-muted-foreground italic">
            {summaryBits.join(", ")}.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mergeMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={mergeMutation.isPending}>
            <Merge className="w-4 h-4 mr-1.5" /> Merge &amp; Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
