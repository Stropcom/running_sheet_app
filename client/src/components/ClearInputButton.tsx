import { X } from "lucide-react";

/**
 * The little X at the right end of a search box that empties it. Put it right
 * after the <Input>, inside the box's `relative` wrapper (give the input
 * `pr-8` so text never runs under it). It only shows while there is something
 * to clear, and puts the cursor back in the box.
 */
export function ClearInputButton({
  value,
  onClear,
  label = "Clear search",
  className = "",
}: {
  value: string;
  onClear: () => void;
  label?: string;
  className?: string;
}) {
  if (!value) return null;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={e => e.preventDefault()}
      onClick={e => {
        const box = e.currentTarget.parentElement?.querySelector("input");
        onClear();
        box?.focus();
      }}
      className={`absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${className}`}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
