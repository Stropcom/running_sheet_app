import type { PasskeyStatus } from "@shared/passkeyRules";

const TONE: Record<PasskeyStatus["tone"], string> = {
  off: "border-border bg-muted text-muted-foreground",
  exempt: "border-border bg-muted text-muted-foreground",
  set: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300",
  counting:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
  locked:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
};

export function PasskeyStatusPill({ status }: { status: PasskeyStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE[status.tone]}`}
    >
      {status.label}
    </span>
  );
}
