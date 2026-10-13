/**
 * Small building blocks for the Add Target to Registry dialog's tabs: the tab
 * bar, a titled section panel with a status chip, the "nothing to add" box
 * and the "Add another" button. Layout/colour comes from the form kit
 * (lib/formKit.ts) — panels are neutral, so Name / Addresses / Vehicles read
 * as separate sections without competing colours.
 */

import type { ReactNode } from "react";
import { Check, Lock, Minus, Plus } from "lucide-react";
import { FORM_HINT, FORM_TONES, type FormTone } from "@/lib/formKit";
import { cn } from "@/lib/utils";
import type { SectionStatus, StepKey } from "@/lib/addTargetSteps";

/** What a tab or section shows: its status, or locked (an earlier tab isn't done). */
export type TabMark = SectionStatus | "locked";

/** The round mark next to a tab name / section title. */
export function StatusMark({ mark }: { mark: TabMark }) {
  if (mark === "done")
    return (
      <span
        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-emerald-700 text-white"
        aria-label="Done"
      >
        <Check className="h-3 w-3" strokeWidth={3.5} />
      </span>
    );
  if (mark === "none")
    return (
      <span
        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-card text-muted-foreground ring-2 ring-inset ring-muted-foreground"
        aria-label="None recorded"
      >
        <Minus className="h-3 w-3" strokeWidth={3.5} />
      </span>
    );
  if (mark === "locked")
    return (
      <span
        className="grid h-[18px] w-[18px] shrink-0 place-items-center text-muted-foreground"
        aria-label="Locked"
      >
        <Lock className="h-3.5 w-3.5" />
      </span>
    );
  return (
    <span
      className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-destructive text-[11px] font-extrabold leading-none text-white"
      aria-label="Needs filling in"
    >
      !
    </span>
  );
}

/** Done / None recorded, as a pill. A section that still needs doing shows no
 * chip: the red line above the buttons already says what is missing. */
export function StatusChip({ status }: { status: SectionStatus }) {
  if (status === "done")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold normal-case tracking-normal text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        <Check className="h-3 w-3" strokeWidth={3.5} /> Done
      </span>
    );
  if (status === "none")
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-bold normal-case tracking-normal text-muted-foreground">
        None recorded
      </span>
    );
  return null;
}

export interface TabSpec {
  key: StepKey;
  label: string;
  icon: ReactNode;
  mark: TabMark;
}

/** The four tabs, in equal columns (2 × 2 on a phone). A locked tab can't be
 * opened — pressing it tells the person which earlier tab to finish. */
export function StepTabs({
  tabs,
  current,
  onSelect,
}: {
  tabs: TabSpec[];
  current: StepKey;
  onSelect: (key: StepKey) => void;
}) {
  return (
    <div
      role="tablist"
      className="grid shrink-0 grid-cols-2 border-b border-border bg-muted/60 sm:grid-cols-4"
    >
      {tabs.map((t, i) => {
        const isCurrent = t.key === current;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            onClick={() => onSelect(t.key)}
            className={cn(
              "flex h-12 items-center justify-center gap-2 border-b-[3px] px-1 text-xs font-extrabold uppercase tracking-wide transition-colors",
              // Dividers between equal cells (not after the last in a row).
              "border-r border-r-border",
              i % 2 === 1 && "max-sm:border-r-0",
              i === tabs.length - 1 && "sm:border-r-0",
              i < 2 && "max-sm:border-b-border",
              isCurrent
                ? "border-b-primary bg-card text-primary"
                : "border-b-transparent text-foreground hover:bg-muted",
              t.mark === "locked" && "text-muted-foreground"
            )}
          >
            <span className="hidden lg:inline-flex">{t.icon}</span>
            <span>{t.label}</span>
            <StatusMark mark={t.mark} />
          </button>
        );
      })}
    </div>
  );
}

/** A titled section: card with a header band (title on the left, status chip
 * on the right) in the entity's colour — person rose, address emerald,
 * vehicle amber, and so on (see lib/formKit.ts). */
export function SectionPanel({
  icon,
  title,
  status,
  count,
  tone = "neutral",
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  status?: SectionStatus;
  count?: number;
  tone?: FormTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        FORM_TONES[tone].panel,
        "p-3 flex flex-col gap-3",
        className
      )}
    >
      <div className={cn(FORM_TONES[tone].band, "mb-0 justify-between")}>
        <span className="flex items-center gap-2">
          {icon}
          {title}
          {!!count && (
            <span className="rounded-full border border-border bg-card px-2 text-xs font-bold normal-case tracking-normal text-muted-foreground">
              {count}
            </span>
          )}
        </span>
        {status && status !== "todo" && <StatusChip status={status} />}
      </div>
      {children}
    </section>
  );
}

/** The "nothing to add" box that completes a section with no entries. */
export function NoneBox({
  checked,
  onChange,
  title,
  hint,
  locked,
  lockedHint = "Clear the entries below to tick this.",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  hint: string;
  /** Something is typed in the section, so "none" can't be ticked. */
  locked?: boolean;
  lockedHint?: string;
  /** No longer styled (the red line above the buttons says what is missing);
   * kept so existing callers still type-check. */
  needed?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={locked && !checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors",
        checked ? "border-emerald-600" : "border-border",
        locked && !checked
          ? "cursor-not-allowed opacity-50"
          : "hover:bg-muted/50"
      )}
    >
      <span
        className={cn(
          "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border-2",
          checked
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-input bg-background"
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-bold">{title}</span>
        <span className={FORM_HINT}>
          {locked && !checked ? lockedHint : hint}
        </span>
      </span>
    </button>
  );
}

/** Full-width dashed "Add another …" button at the bottom of a section. */
export function AddAnotherButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-card text-sm font-bold text-foreground transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <Plus className="h-4 w-4" />
      {children}
    </button>
  );
}

/** The line above the buttons: red with what is missing, or green when done. */
export function StepNote({
  problem,
  doneText,
  flash,
}: {
  problem: string | null;
  doneText: string | null;
  /** Called attention to (Next pressed while blocked): underlined. */
  flash?: boolean;
}) {
  if (!problem && !doneText) return null;
  return (
    <p
      role={problem ? "alert" : "status"}
      className={cn(
        "flex items-center gap-2 px-1 text-[13px] font-bold",
        problem
          ? "text-red-700 dark:text-red-400"
          : "text-emerald-700 dark:text-emerald-400",
        flash && problem && "underline decoration-2 underline-offset-4"
      )}
    >
      <StatusMark mark={problem ? "todo" : "done"} />
      <span>{problem ?? doneText}</span>
    </p>
  );
}
