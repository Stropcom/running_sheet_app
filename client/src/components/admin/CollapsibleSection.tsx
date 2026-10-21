/**
 * A titled card on Access Management whose body opens and closes — so the long
 * page can be folded down to its headings and scrolled to the one wanted.
 * Same look as the Passkey login card: the grey titled band is the toggle
 * (chevron, optional icon, title, optional count, optional status on the right),
 * and everything under it shows only while open. The open / closed choice is
 * remembered per section on this device; `defaultOpen` is what a first visit
 * sees.
 */
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
  SECTION_BAND,
  SECTION_CARD,
  SECTION_COUNT,
  SECTION_TITLE,
} from "@/lib/pageKit";

const KEY_PREFIX = "runlog_admin_section_";

function readOpen(id: string, defaultOpen: boolean): boolean {
  try {
    const v = localStorage.getItem(KEY_PREFIX + id);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* storage unavailable: use the default */
  }
  return defaultOpen;
}

export function CollapsibleSection({
  id,
  title,
  icon,
  count,
  status,
  actions,
  defaultOpen = false,
  children,
}: {
  /** Stable key for remembering whether it is open. */
  id: string;
  title: string;
  icon?: ReactNode;
  /** A small pill after the title, e.g. "5 people". */
  count?: string;
  /** Shown at the right of the band (a status pill). Part of the toggle. */
  status?: ReactNode;
  /** Controls at the right of the band that are NOT part of the toggle (a
   * button such as "+ Team") — they work whether the section is open or not. */
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen));
  const toggle = () =>
    setOpen(o => {
      try {
        localStorage.setItem(KEY_PREFIX + id, o ? "0" : "1");
      } catch {
        /* the choice just won't be remembered */
      }
      return !o;
    });
  const titleId = `section-${id}-title`;
  // Closed, the band is the whole card: no rule under it and no gap below.
  const band = open
    ? SECTION_BAND
    : SECTION_BAND.replace("mb-3", "-mb-4").replace("border-b ", "");

  return (
    <section className={SECTION_CARD} aria-labelledby={titleId}>
      <div className={`${band} flex-wrap hover:bg-muted`}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={`-my-2.5 -ml-4 flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-2.5 pl-4 text-left ${actions ? "" : "-mr-4 pr-4"}`}
        >
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-foreground/70 transition-transform ${open ? "rotate-90" : ""}`}
          />
          {icon}
          <span id={titleId} className={`${SECTION_TITLE} whitespace-nowrap`}>
            {title}
          </span>
          {count && (
            <span className={`${SECTION_COUNT} whitespace-nowrap`}>
              {count}
            </span>
          )}
          {status && (
            <span className="ml-auto flex items-center">{status}</span>
          )}
        </button>
        {actions}
      </div>
      {open && children}
    </section>
  );
}
