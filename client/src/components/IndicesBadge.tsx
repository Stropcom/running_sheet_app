/**
 * "Indices" badge — flags information that came from a source other than a
 * running sheet observation (e.g. typed directly into the Target Registry)
 * and hasn't yet been independently corroborated by one. Disappears
 * permanently the moment the same entity is mentioned in a real observation
 * row — see IntelligenceEntity.isIndicesOnly in server/db.ts, the single
 * source of truth this badge always reflects.
 */

import { Database } from "lucide-react";

export function IndicesBadge({
  className = "",
  variant = "default",
  size = "sm",
}: {
  className?: string;
  /** "on-dark" for use on a solid/gradient dark header (matches the pill
   * treatment other header badges use there); "default" for normal cards. */
  variant?: "default" | "on-dark";
  /** "header" matches the larger rounded-full pills profile headers use;
   * "sm" (default) matches the compact inline tags used in lists/pills. */
  size?: "sm" | "header";
}) {
  const colors =
    variant === "on-dark"
      ? "bg-indigo-400/20 border-indigo-200/40 text-indigo-100"
      : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30";
  const sizing =
    size === "header"
      ? "gap-1.5 px-2.5 py-1 rounded-full text-xs"
      : "gap-1 px-1.5 py-0.5 rounded text-[10px]";
  return (
    <span
      title="Indices — recorded from a source other than a running sheet observation; not yet corroborated in the field"
      className={`inline-flex items-center font-semibold border shrink-0 ${sizing} ${colors} ${className}`}
    >
      <Database className="w-2.5 h-2.5" />
      Indices
    </span>
  );
}
