/**
 * My Profile sections: every titled card on the page is a drop-down that is
 * closed the first time, and then stays the way the officer left it (kept in
 * this browser, per section — a convenience, not an account setting).
 */
import { useCallback, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const STORAGE_KEY = "runlog_profile_sections";

function readOpen(id: string): boolean {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return all?.[id] === true;
  } catch {
    return false;
  }
}

function writeOpen(id: string, open: boolean) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...(all && typeof all === "object" ? all : {}),
        [id]: open,
      })
    );
  } catch {
    // Storage blocked or full: the section still opens and closes, it just
    // isn't remembered.
  }
}

/** Open/closed for one section — closed until the officer opens it. */
export function useRememberedOpen(id: string): [boolean, () => void] {
  const [open, setOpen] = useState(() => readOpen(id));
  const toggle = useCallback(() => {
    setOpen(prev => {
      writeOpen(id, !prev);
      return !prev;
    });
  }, [id]);
  return [open, toggle];
}

export function SectionChevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      aria-hidden
      className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
        open ? "rotate-180" : ""
      }`}
    />
  );
}

/**
 * The titled card. The body stays mounted while closed (hidden), so a half-
 * typed password or an open scan result isn't lost by closing the section.
 */
export function ProfileSection({
  id,
  icon,
  title,
  badge,
  className = "mb-6",
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [open, toggle] = useRememberedOpen(id);
  const bodyId = `profile-section-${id}`;
  return (
    <div
      className={`overflow-hidden rounded-xl border border-border bg-card shadow-sm ${className}`}
      data-testid={`profile-section-${id}`}
    >
      <h2 className={open ? "border-b border-border" : ""}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-center gap-2 bg-muted/70 px-6 py-2.5 text-left text-[13px] font-bold uppercase tracking-wide text-foreground transition-colors hover:bg-muted"
        >
          {icon}
          {title}
          {badge}
          <SectionChevron open={open} />
        </button>
      </h2>
      <div id={bodyId} hidden={!open} className="px-6 pb-6 pt-4">
        {children}
      </div>
    </div>
  );
}
