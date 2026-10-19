/**
 * IntelDetailInput
 *
 * A free-text box that suggests what Intelligence already knows — vehicles,
 * addresses and businesses — as you type, for fields that can hold any of them
 * (the Summary's LD box: "Vehicle Residence Business details"). Picking a
 * suggestion fills it in the short wording the Intelligence folder shows
 * ("1FAT001 red Holden Monaro coupe", "57 Howe Street, OSBORNE PARK"). The
 * field is never locked: anything typed is kept as typed.
 */
import { useRef, useState } from "react";
import { Building2, Car, MapPin } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

type Suggestion = {
  key: string;
  kind: "vehicle" | "address" | "business";
  shown: string;
  rowCount: number;
};

const GROUP_LABEL: Record<Suggestion["kind"], string> = {
  vehicle: "Vehicles",
  address: "Addresses",
  business: "Businesses",
};
const ICON = { vehicle: Car, address: MapPin, business: Building2 } as const;

export function IntelDetailInput({
  value,
  onChange,
  placeholder,
  className = "",
  inputClassName = "",
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const enabled = open && query.trim().length > 0;

  const vehicles = trpc.intelligence.searchEntities.useQuery(
    { type: "vehicle", query, excludeTargets: false },
    { enabled }
  );
  const addresses = trpc.intelligence.searchEntities.useQuery(
    { type: "address", query, excludeTargets: false },
    { enabled }
  );
  const businesses = trpc.intelligence.searchEntities.useQuery(
    { type: "business", query, excludeTargets: false },
    { enabled }
  );

  const suggestions: Suggestion[] = [
    ...(vehicles.data ?? []).map(s => ({
      key: `v-${s.key}`,
      kind: "vehicle" as const,
      shown: formatIntelVehicle(s.label),
      rowCount: s.rowCount,
    })),
    ...(addresses.data ?? []).map(s => ({
      key: `a-${s.key}`,
      kind: "address" as const,
      shown: formatIntelAddress(s.label),
      rowCount: s.rowCount,
    })),
    ...(businesses.data ?? []).map(s => ({
      key: `b-${s.key}`,
      kind: "business" as const,
      shown: formatIntelAddress(s.label),
      rowCount: s.rowCount,
    })),
  ];
  // Each kind keeps its few best matches; the same wording is never listed twice.
  const seen = new Set<string>();
  const shownList = (["vehicle", "address", "business"] as const).flatMap(k =>
    suggestions
      .filter(s => s.kind === k && !seen.has(s.shown.toLowerCase()))
      .slice(0, 6)
      .map(s => {
        seen.add(s.shown.toLowerCase());
        return s;
      })
  );

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

  return (
    <div
      ref={wrapperRef}
      className={`relative ${className}`}
      onBlur={e => {
        if (!wrapperRef.current?.contains(e.relatedTarget as Node))
          setOpen(false);
      }}
    >
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => {
          if (query.trim()) setOpen(true);
        }}
        onKeyDown={e => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${inputClassName}`}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {open && shownList.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
          style={{ maxHeight: "280px", overflowY: "auto" }}
        >
          {(["vehicle", "address", "business"] as const).map(k => {
            const group = shownList.filter(s => s.kind === k);
            if (group.length === 0) return null;
            const Icon = ICON[k];
            return (
              <div key={k}>
                <div className="border-b border-border bg-muted/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  {GROUP_LABEL[k]}
                </div>
                {group.map(s => (
                  <button
                    key={s.key}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5 text-left text-sm text-popover-foreground transition-colors last:border-0 hover:bg-accent hover:text-accent-foreground"
                    onMouseDown={e => {
                      // mousedown fires before the input's blur
                      e.preventDefault();
                      onChange(s.shown);
                      setOpen(false);
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate leading-snug">{s.shown}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {s.rowCount} obs.
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
