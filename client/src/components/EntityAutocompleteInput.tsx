/**
 * EntityAutocompleteInput
 *
 * A drop-in replacement for <Input> that suggests existing Intelligence
 * entities (people/vehicles already known to the system) as the user types —
 * same interaction pattern as AddressAutocompleteInput, but sourced from
 * trpc.intelligence.searchEntities instead of Google Places. Selecting a
 * suggestion just fills the text (it does not lock the field), since a new
 * Target is often a person/vehicle that isn't in the system yet.
 */

import { useRef, useState, type FocusEvent } from "react";
import { User, Car } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatIntelVehicle } from "@/lib/addressFormat";

interface Props {
  value: string;
  onChange: (val: string) => void;
  entityType: "person" | "vehicle";
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}

function displayLabel(entityType: "person" | "vehicle", label: string): string {
  return entityType === "vehicle" ? formatIntelVehicle(label) : label;
}

export function EntityAutocompleteInput({
  value,
  onChange,
  entityType,
  onBlur,
  placeholder,
  className = "",
  inputClassName = "",
  autoFocus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: results } = trpc.intelligence.searchEntities.useQuery(
    { type: entityType, query, excludeTargets: false },
    { enabled: open && query.trim().length > 0 }
  );
  const suggestions = results ?? [];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setQuery("");
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setQuery(val);
      setOpen(true);
    }, 300);
  };

  const Icon = entityType === "vehicle" ? Car : User;

  return (
    <div
      ref={wrapperRef}
      className={`relative ${className}`}
      onBlur={e => {
        // Close on blur unless focus moved to a suggestion inside this wrapper.
        if (!wrapperRef.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        onFocus={() => { if (query.trim()) setOpen(true); }}
        onKeyDown={e => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${inputClassName}`}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {open && suggestions.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
          style={{ maxHeight: "240px", overflowY: "auto" }}
        >
          {suggestions.map(s => (
            <button
              key={s.key}
              type="button"
              className="w-full text-left px-3 py-2.5 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground border-b border-border/50 last:border-0 flex items-center justify-between gap-2 transition-colors"
              onMouseDown={e => {
                // Use mousedown so it fires before the input's blur
                e.preventDefault();
                onChange(displayLabel(entityType, s.label));
                setOpen(false);
              }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="leading-snug truncate">
                  {displayLabel(entityType, s.label)}
                </span>
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {s.rowCount} obs.
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
