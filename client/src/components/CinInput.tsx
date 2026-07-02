/**
 * CinInput — a controlled text input that validates the entered CIN against
 * the list of registered users fetched from the server.
 *
 * - Shows a dropdown of matching users as the user types
 * - Turns red with an error message if a non-registered CIN is submitted
 * - Calls onValidCin(cin, user) when a valid CIN is confirmed
 * - Calls onInvalidCin() when the value is cleared or invalid
 */
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useRef, useState, useCallback } from "react";
import { Check, AlertCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type CinUser = {
  cin: string;
  name: string;
  unit: string;
  team: string;
};

type Props = {
  value: string;
  onChange: (raw: string) => void;
  onValidCin?: (cin: string, user: CinUser) => void;
  onInvalidCin?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** If true, show validation state inline (green tick / red cross) */
  showValidation?: boolean;
  autoFocus?: boolean;
};

export default function CinInput({
  value,
  onChange,
  onValidCin,
  onInvalidCin,
  placeholder = "Enter CIN…",
  className,
  disabled,
  showValidation = true,
  autoFocus,
}: Props) {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: users = [] } = trpc.users.listForCin.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });

  const upper = value.trim().toUpperCase();

  const matched = users.find((u) => u.cin.toUpperCase() === upper);
  const isValid = upper.length > 0 && !!matched;
  const isInvalid = touched && upper.length > 0 && !matched;

  // Filtered suggestions
  const suggestions = upper.length === 0
    ? []
    : users.filter((u) => u.cin.toUpperCase().startsWith(upper) && u.cin.toUpperCase() !== upper).slice(0, 8);

  // Notify parent of validity changes
  useEffect(() => {
    if (isValid && matched) {
      onValidCin?.(matched.cin, matched);
    } else if (!isValid) {
      onInvalidCin?.();
    }
  }, [isValid, matched?.cin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value.toUpperCase());
    setOpen(true);
    setTouched(false);
  };

  const handleBlur = () => {
    setTouched(true);
    // Slight delay so click on suggestion registers first
    setTimeout(() => setOpen(false), 150);
  };

  const handleSelect = useCallback((user: CinUser) => {
    onChange(user.cin);
    setOpen(false);
    setTouched(true);
    onValidCin?.(user.cin, user);
  }, [onChange, onValidCin]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={() => { if (value.length > 0) setOpen(true); }}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            "w-full h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
            "placeholder:text-muted-foreground focus:outline-none focus:ring-1",
            isValid && showValidation
              ? "border-emerald-500/60 focus:ring-emerald-500/40 pr-8"
              : isInvalid && showValidation
              ? "border-red-500/60 focus:ring-red-500/40 pr-8"
              : "border-input focus:ring-ring pr-3",
            disabled && "opacity-50 cursor-not-allowed",
            className
          )}
        />
        {showValidation && upper.length > 0 && (
          <span className="absolute right-2.5 pointer-events-none">
            {isValid ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : isInvalid ? (
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            ) : null}
          </span>
        )}
      </div>

      {/* Validation message */}
      {isInvalid && showValidation && (
        <p className="mt-1 text-[11px] text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          CIN not found — only registered users can be added
        </p>
      )}

      {/* Autocomplete dropdown */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden text-sm">
          {suggestions.map((u) => (
            <li key={u.cin}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(u); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-left"
              >
                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground">{u.cin}</span>
                <span className="text-muted-foreground truncate">{u.name}</span>
                {u.unit && (
                  <span className="ml-auto text-[10px] text-muted-foreground/70 shrink-0">{u.unit}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
