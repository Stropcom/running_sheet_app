import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { FileText, Pencil, User } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { SECTION_CARD } from "@/lib/pageKit";
import { SectionHeading } from "@/components/ProfileSectionHeading";

/**
 * Shared pieces of the five Intelligence profiles (Operation, Target,
 * Vehicle, Location — and the Target Registry's Background that feeds them):
 * the sticky "Jump to" bar, the photoboard, person rows with a photo, the
 * Running Sheets card and the Background card. Page-kit styling throughout
 * (solid white cards, grey titled bands, nothing under 12px).
 */

/** "Adrian Paul KENNEDY" → ["Adrian Paul", "KENNEDY"]. A name with no
 * UPPERCASE surname comes back whole in the first slot. */
export function splitPersonName(name: string): [string, string] {
  const t = name.trim().split(/\s+/);
  const i = t.findIndex(w => /^[A-Z'’-]{2,}$/.test(w));
  return i < 0 ? [name, ""] : [t.slice(0, i).join(" "), t.slice(i).join(" ")];
}

/** Scrolls to a section/card by element id and flashes it briefly. */
export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  el.classList.remove("profile-flash");
  void el.offsetWidth;
  el.classList.add("profile-flash");
  window.setTimeout(() => el.classList.remove("profile-flash"), 1700);
}

/** The id a person's card carries, so photoboard tiles can scroll to it. */
export const personCardId = (key: string) =>
  `p-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

/** Sticky chip row that jumps to each section of a long profile. */
export function JumpBar({
  items,
}: {
  /** `before` runs first (e.g. to open a collapsed block), then the scroll. */
  items: Array<{ id: string; label: string; before?: () => void }>;
}) {
  return (
    <nav
      aria-label="Jump to"
      className="sticky top-14 z-30 -mx-1 mb-4 flex items-center gap-2 overflow-x-auto border-b border-border bg-background/95 px-1 py-2 backdrop-blur md:top-0 md:flex-wrap md:overflow-visible"
    >
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-foreground/70">
        Jump to
      </span>
      {items.map(i => (
        <button
          key={i.id}
          type="button"
          onClick={() => {
            if (i.before) {
              i.before();
              window.setTimeout(() => scrollToSection(i.id), 60);
            } else scrollToSection(i.id);
          }}
          className="shrink-0 rounded-full border border-blue-600/60 bg-blue-100 px-3 py-1 text-xs font-bold text-blue-950 hover:bg-blue-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:bg-blue-950/50 dark:text-blue-100 dark:hover:bg-blue-900/60"
        >
          {i.label}
        </button>
      ))}
    </nav>
  );
}

/** A section card with the page kit's grey titled band and a scroll anchor. */
export function ProfileCard({
  id,
  label,
  count,
  right,
  children,
  className,
}: {
  id?: string;
  label: string;
  count?: number;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-label={label}
      className={cn(
        SECTION_CARD,
        "mb-4 scroll-mt-28 md:scroll-mt-16",
        className
      )}
    >
      {right ? (
        <div className="-mx-4 -mt-4 mb-3 flex items-center gap-2 border-b border-border bg-muted/70 px-4 py-2.5">
          <p className="text-[13px] font-bold uppercase tracking-wide text-foreground">
            {label}
          </p>
          {count !== undefined && (
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {count}
            </span>
          )}
          <span className="ml-auto">{right}</span>
        </div>
      ) : (
        <SectionHeading label={label} count={count} />
      )}
      {children}
    </section>
  );
}

type PhotoRef = {
  category: "target" | "associate" | "vehicle" | "location";
  targetId?: number;
  /** Entity label for associate / vehicle / location photos. */
  label?: string;
};

/** The first photo linked to an entity (null while loading / none). */
export function useFirstPhoto(ref: PhotoRef): {
  url: string | null;
  loading: boolean;
} {
  const { data, isLoading } = trpc.attachment.byEntity.useQuery(
    {
      category: ref.category,
      targetId: ref.targetId,
      entityLabel: ref.label,
    },
    { enabled: ref.targetId != null || !!ref.label, staleTime: 60_000 }
  );
  const first = (data as Array<{ url: string }> | undefined)?.[0];
  return { url: first?.url ?? null, loading: isLoading };
}

/** A person's photo (or a grey silhouette with "No photo"). */
export function PersonThumb({
  photo,
  name,
  className,
  imgClassName,
  showLabel = false,
}: {
  photo: PhotoRef;
  name: string;
  className?: string;
  imgClassName?: string;
  showLabel?: boolean;
}) {
  const { url } = useFirstPhoto(photo);
  return (
    <span
      className={cn(
        "flex items-center justify-center overflow-hidden bg-muted",
        className
      )}
    >
      {url ? (
        <img
          src={url}
          alt={`Photo of ${name}`}
          className={cn("h-full w-full object-cover object-top", imgClassName)}
          loading="lazy"
        />
      ) : (
        <span className="flex flex-col items-center gap-1 text-muted-foreground">
          <User className="h-1/2 w-1/2 opacity-60" aria-hidden />
          {showLabel && <span className="text-xs font-semibold">No photo</span>}
        </span>
      )}
    </span>
  );
}

export type PhotoboardPerson = {
  key: string;
  name: string;
  role: "target" | "associate" | "resident";
  photo: PhotoRef;
  /** Element id to scroll to; defaults to this person's card id. */
  anchor?: string;
};

export type PhotoboardRow = {
  tag: string;
  heading: string;
  sub?: string;
  people: PhotoboardPerson[];
};

const TILE_BORDER: Record<PhotoboardPerson["role"], string> = {
  target:
    "border-blue-600 bg-blue-100 text-blue-950 dark:bg-blue-950/50 dark:text-blue-100",
  associate: "border-border bg-card text-foreground",
  resident: "border-rose-500 bg-card text-foreground dark:border-rose-400",
};

/** Photos of the people on this profile, named and linked to their card.
 * One row per target — the target first, then their associates — each tile
 * scrolling to that person's details. */
export function Photoboard({
  rows,
  onBeforeGo,
}: {
  rows: PhotoboardRow[];
  /** Runs before a tile scrolls (e.g. to expand the block it points into). */
  onBeforeGo?: (person: PhotoboardPerson, rowIndex: number) => void;
}) {
  const total = rows.reduce((n, r) => n + r.people.length, 0);
  const hasResident = rows.some(r => r.people.some(p => p.role === "resident"));
  return (
    <ProfileCard
      id="photoboard"
      label="Photoboard"
      count={total}
      right={
        <span className="flex flex-wrap items-center gap-3 text-xs text-foreground/80">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3.5 w-3.5 rounded border-2 border-blue-600 bg-blue-100 dark:bg-blue-950/50" />
            Target
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3.5 w-3.5 rounded border-2 border-border bg-card" />
            Associate
          </span>
          {hasResident && (
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-3.5 w-3.5 rounded border-2 border-rose-500 bg-card" />
              Resident
            </span>
          )}
        </span>
      }
    >
      <div className="flex flex-col gap-5">
        {rows.map((row, rowIndex) => (
          <div key={row.tag + row.heading}>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="rounded-md border border-blue-600 bg-blue-100 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-blue-950 dark:bg-blue-950/50 dark:text-blue-100">
                {row.tag}
              </span>
              <b className="text-sm text-foreground">{row.heading}</b>
              {row.sub && (
                <span className="text-xs text-muted-foreground">{row.sub}</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2.5 min-[900px]:grid-cols-6">
              {row.people.map(p => {
                const [given, sur] = splitPersonName(p.name);
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      const id = p.anchor ?? personCardId(p.key);
                      if (onBeforeGo) {
                        onBeforeGo(p, rowIndex);
                        window.setTimeout(() => scrollToSection(id), 60);
                      } else scrollToSection(id);
                    }}
                    aria-label={`${p.name}, ${p.role}. Show details`}
                    className={cn(
                      "flex min-w-0 flex-col overflow-hidden rounded-lg border-2 text-center transition-shadow hover:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_35%,transparent)] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-primary",
                      TILE_BORDER[p.role]
                    )}
                  >
                    <PersonThumb
                      photo={p.photo}
                      name={p.name}
                      showLabel
                      className="aspect-[4/5] w-full"
                    />
                    <span className="px-1.5 pb-2 pt-1.5 text-xs leading-tight">
                      {given}
                      {sur && <b className="block text-[13px]">{sur}</b>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ProfileCard>
  );
}

export type SheetLink = {
  id: number;
  title: string;
  operationName?: string | null;
};

/** The Running Sheets card: sheets assigned to the entity, then (when there
 * are any) sheets that only mention it. */
export function SheetsCard({
  assigned,
  mentioned = [],
  assignedLabel = "Assigned",
  id = "sheets",
}: {
  assigned: SheetLink[];
  mentioned?: SheetLink[];
  assignedLabel?: string;
  id?: string;
}) {
  const [, navigate] = useLocation();
  const row = (s: SheetLink, mentionedRow: boolean) => (
    <button
      key={`${mentionedRow ? "m" : "a"}-${s.id}`}
      type="button"
      onClick={() => navigate(`/sheet/${s.id}`)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
        mentionedRow ? "border-dashed border-border" : "border-border"
      )}
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-semibold text-foreground">
          {s.title}
        </span>
        {s.operationName && (
          <span className="block text-xs text-muted-foreground">
            Operation {s.operationName}
          </span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 rounded-md border px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide",
          mentionedRow
            ? "border-border bg-card text-foreground/70"
            : "border-emerald-600/60 bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
        )}
      >
        {mentionedRow ? "Mentioned" : assignedLabel}
      </span>
    </button>
  );
  return (
    <ProfileCard
      id={id}
      label="Running Sheets"
      count={assigned.length + mentioned.length}
    >
      <div className="flex flex-col gap-4">
        <div>
          <SectionHeading sub label="Assigned" count={assigned.length} />
          {assigned.length === 0 ? (
            <p className="text-xs text-muted-foreground">(no linked sheets)</p>
          ) : (
            <div className="flex flex-col gap-2">
              {assigned.map(s => row(s, false))}
            </div>
          )}
        </div>
        {mentioned.length > 0 && (
          <div>
            <SectionHeading
              sub
              label="Mentioned on other sheets"
              count={mentioned.length}
            />
            <p className="mb-2 text-xs italic text-muted-foreground">
              Not assigned here, but the observation text names them.
            </p>
            <div className="flex flex-col gap-2">
              {mentioned.map(s => row(s, true))}
            </div>
          </div>
        )}
      </div>
    </ProfileCard>
  );
}

/** The Target Registry's freeform Background, read-only on a profile. */
export function BackgroundCard({
  text,
  updatedAt,
  updatedByCIN,
  id = "background",
}: {
  text: string | null;
  updatedAt: number | null;
  updatedByCIN: string | null;
  id?: string;
}) {
  const [, navigate] = useLocation();
  return (
    <ProfileCard
      id={id}
      label="Background"
      right={
        <span className="rounded-md border border-amber-600/50 bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-950 dark:bg-amber-950/40 dark:text-amber-200">
          From Target Registry
        </span>
      }
    >
      {text?.trim() ? (
        <p className="max-w-[84ch] whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {text}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">
          Nothing written yet.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate("/target-registry")}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold text-primary hover:bg-muted/60"
        >
          <Pencil className="h-3 w-3" /> Edit in Target Registry
        </button>
        {updatedAt ? (
          <span className="text-xs text-muted-foreground">
            Last edited by CIN {updatedByCIN ?? "unknown"} ·{" "}
            {new Date(updatedAt).toLocaleDateString("en-AU", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        ) : null}
      </div>
    </ProfileCard>
  );
}

/** Looks up the first photo of an entity, for the PDF exports (which build
 * plain HTML in a new window and so can't use the hook). */
export async function fetchFirstPhotoUrl(
  utils: ReturnType<typeof trpc.useUtils>,
  ref: PhotoRef
): Promise<string | null> {
  try {
    const list = (await utils.attachment.byEntity.fetch({
      category: ref.category,
      targetId: ref.targetId,
      entityLabel: ref.label,
    })) as Array<{ url: string }>;
    return list[0]?.url ?? null;
  } catch {
    return null;
  }
}

/** Styles for pdfPersonRowHtml. */
export const PDF_PERSON_ROW_CSS =
  ".pr { display:flex; gap:10px; align-items:center; border:1px solid #e2e8f0; border-radius:6px; padding:6px 8px; margin-bottom:6px; break-inside:avoid; } .pr .pp { width:44px; height:56px; border-radius:4px; overflow:hidden; border:2px solid #cbd5e1; background:#f1f5f9; flex-shrink:0; } .pr.target .pp { border-color:#1d4ed8; } .pr .pp img { width:100%; height:100%; object-fit:cover; object-position:top; display:block; } .pr .pn { flex:1; font-size:11px; font-weight:700; } .pr .pn small { display:block; font-size:9px; font-weight:400; color:#64748b; } .pr .pt { font-size:9px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; border:1px solid #cbd5e1; border-radius:4px; padding:1px 6px; } .pr.target .pt { border-color:#1d4ed8; background:#dbeafe !important; color:#1e3a8a; }";

/** A person row for the PDF exports: photo, name, quiet line, tag. */
export function pdfPersonRowHtml(p: {
  name: string;
  sub?: string | null;
  tag: string;
  tone: "target" | "associate";
  url: string | null;
}): string {
  return `<div class="pr ${p.tone}"><div class="pp">${
    p.url ? `<img src="${escHtml(p.url)}" alt="">` : ""
  }</div><div class="pn">${escHtml(p.name)}${
    p.sub ? `<small>${escHtml(p.sub)}</small>` : ""
  }</div><span class="pt">${escHtml(p.tag)}</span></div>`;
}

/** Escapes text for the HTML the PDF exports build. */
export function escHtml(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
