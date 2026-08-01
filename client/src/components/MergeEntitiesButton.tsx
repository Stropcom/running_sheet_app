import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { GitMerge, User, Car, MapPin, Briefcase, X } from "lucide-react";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";
import {
  EntityDuplicateDialog,
  type DedupType,
} from "@/components/EntityDuplicateDialog";

// Manual counterpart to the auto-detected duplicate prompt — for cases the
// fuzzy matcher doesn't catch on its own. Search and pick two entities of the
// same type, then reuse the same "which one survives" confirm dialog.

const TYPE_OPTIONS: Array<{
  value: DedupType;
  label: string;
  icon: React.ReactNode;
}> = [
  { value: "person", label: "Person", icon: <User className="w-3.5 h-3.5" /> },
  { value: "vehicle", label: "Vehicle", icon: <Car className="w-3.5 h-3.5" /> },
  {
    value: "address",
    label: "Address",
    icon: <MapPin className="w-3.5 h-3.5" />,
  },
  {
    value: "business",
    label: "Business",
    icon: <Briefcase className="w-3.5 h-3.5" />,
  },
];

function displayLabel(type: DedupType, label: string): string {
  if (type === "vehicle") return formatIntelVehicle(label);
  if (type === "address") return formatIntelAddress(label);
  return label;
}

interface EntityPick {
  label: string;
  rowCount: number;
}

function EntitySearchField({
  type,
  placeholder,
  excludeLabel,
  value,
  onChange,
}: {
  type: DedupType;
  placeholder: string;
  excludeLabel?: string;
  value: EntityPick | null;
  onChange: (pick: EntityPick | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const { data: results } = trpc.intelligence.searchEntities.useQuery(
    { type, query },
    { enabled: focused && !value }
  );
  const filtered = (results ?? []).filter(r => r.label !== excludeLabel);

  if (value) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/40 bg-primary/5">
        <span className="text-sm font-medium text-foreground flex-1 truncate">
          {displayLabel(type, value.label)}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          {value.rowCount} obs.
        </span>
        <button
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
      />
      {focused && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-popover shadow-md max-h-56 overflow-y-auto">
          {filtered.map(r => (
            <button
              key={r.key}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent/50 flex items-center justify-between gap-2"
              onMouseDown={e => {
                e.preventDefault();
                onChange({ label: r.label, rowCount: r.rowCount });
                setQuery("");
              }}
            >
              <span className="truncate">{displayLabel(type, r.label)}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {r.rowCount} obs.
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MergeEntitiesButton() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [type, setType] = useState<DedupType>("person");
  const [entityA, setEntityA] = useState<EntityPick | null>(null);
  const [entityB, setEntityB] = useState<EntityPick | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function resetPicker() {
    setEntityA(null);
    setEntityB(null);
  }

  function changeType(next: DedupType) {
    setType(next);
    resetPicker();
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setPickerOpen(true)}
        className="gap-1.5"
      >
        <GitMerge className="w-3.5 h-3.5" /> Merge
      </Button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Merge Entities</DialogTitle>
            <DialogDescription>
              Combine two entities the app didn't automatically flag as possible
              duplicates.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex gap-1.5">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => changeType(opt.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    type === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                First entity
              </label>
              <EntitySearchField
                type={type}
                placeholder={`Search ${TYPE_OPTIONS.find(o => o.value === type)?.label.toLowerCase()}s…`}
                excludeLabel={entityB?.label}
                value={entityA}
                onChange={setEntityA}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Second entity
              </label>
              <EntitySearchField
                type={type}
                placeholder={`Search ${TYPE_OPTIONS.find(o => o.value === type)?.label.toLowerCase()}s…`}
                excludeLabel={entityA?.label}
                value={entityB}
                onChange={setEntityB}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!entityA || !entityB}
              onClick={() => {
                setPickerOpen(false);
                setConfirmOpen(true);
              }}
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {entityA && entityB && (
        <EntityDuplicateDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          type={type}
          mode="manual"
          candidate={entityA}
          existing={entityB}
          onResolved={() => resetPicker()}
        />
      )}
    </>
  );
}
