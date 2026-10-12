import type { ReactNode } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_COUNT } from "@/lib/pageKit";

/**
 * Shared pieces of the three To-Do pages (Certify, Link Images, RS
 * Governance) so they read as one family: a solid white operation card with a
 * grey titled band, each sheet its own bordered row inside it, and a tone
 * colour (red / amber / blue) that marks which list you are on. Colours use a
 * dark `-700` shade on the light theme — the old `-400` shades washed out on
 * white.
 */
export type TodoTone = "red" | "amber" | "blue";

export const TODO_TONES: Record<
  TodoTone,
  {
    iconBox: string;
    icon: string;
    pill: string;
    rowHover: string;
    tile: string;
    chevron: string;
    opIcon: string;
  }
> = {
  red: {
    iconBox:
      "border-red-300 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10",
    icon: "text-red-600 dark:text-red-400",
    pill: "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
    rowHover:
      "hover:border-red-400 hover:bg-red-50/60 dark:hover:bg-red-500/10",
    tile: "border-red-300 hover:border-red-500",
    chevron: "text-red-500/70 group-hover:text-red-600",
    opIcon: "text-red-600 dark:text-red-400",
  },
  amber: {
    iconBox:
      "border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
    icon: "text-amber-600 dark:text-amber-400",
    pill: "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
    rowHover:
      "hover:border-amber-400 hover:bg-amber-50/60 dark:hover:bg-amber-500/10",
    tile: "border-amber-300 hover:border-amber-500",
    chevron: "text-amber-500/70 group-hover:text-amber-600",
    opIcon: "text-amber-600 dark:text-amber-400",
  },
  blue: {
    iconBox:
      "border-blue-300 bg-blue-50 dark:border-blue-400/30 dark:bg-blue-400/10",
    icon: "text-blue-600 dark:text-blue-400",
    pill: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-300",
    rowHover:
      "hover:border-blue-400 hover:bg-blue-50/60 dark:hover:bg-blue-400/10",
    tile: "border-blue-300 hover:border-blue-500",
    chevron: "text-blue-500/70 group-hover:text-blue-600",
    opIcon: "text-blue-600 dark:text-blue-400",
  },
};

/** Page title row: tinted icon, title + subtitle, solid count pill. */
export function TodoHeader({
  tone,
  icon,
  title,
  subtitle,
  count,
}: {
  tone: TodoTone;
  icon: ReactNode;
  title: string;
  subtitle: string;
  count: number;
}) {
  const t = TODO_TONES[tone];
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className={cn("rounded-xl border-2 p-2.5", t.iconBox)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-foreground/70">{subtitle}</p>
      </div>
      {count > 0 && (
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold",
            t.pill
          )}
        >
          {count} sheet{count !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

/** One operation: white card, grey titled band, rows inside with a gap. */
export function TodoGroup({
  tone,
  name,
  count,
  children,
}: {
  tone: TodoTone;
  name: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/70 px-4 py-2.5">
        <Building2
          className={cn("h-4 w-4 shrink-0", TODO_TONES[tone].opIcon)}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold uppercase tracking-wide text-foreground">
          {name}
        </span>
        <span className={SECTION_COUNT}>{count}</span>
      </div>
      <div className="flex flex-col gap-2 p-3">{children}</div>
    </div>
  );
}

/** A clickable sheet row inside a TodoGroup — its own bordered tile. */
export function TodoRow({
  tone,
  onClick,
  icon,
  children,
  trailing,
}: {
  tone: TodoTone;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  trailing: ReactNode;
}) {
  const t = TODO_TONES[tone];
  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background px-3 py-3 shadow-sm transition-colors",
        t.rowHover
      )}
    >
      <div className={cn("shrink-0 rounded-lg border p-2", t.iconBox)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="mt-2 shrink-0">{trailing}</div>
    </div>
  );
}

/** A clickable sheet tile for the tile view. */
export function TodoTile({
  tone,
  onClick,
  children,
}: {
  tone: TodoTone;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex cursor-pointer flex-col gap-3 rounded-xl border-2 bg-card p-5 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md",
        TODO_TONES[tone].tile
      )}
    >
      {children}
    </div>
  );
}

/** Pill used for "N rows to certify" / "N photos not linked" etc. */
export function TodoPill({
  tone,
  children,
}: {
  tone: TodoTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
        TODO_TONES[tone].pill
      )}
    >
      {children}
    </span>
  );
}
