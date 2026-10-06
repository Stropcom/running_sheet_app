/**
 * Continuity cards — the running sheet's "where things stand" band, drawn
 * between the target chips and the rows. One card per vehicle or group of
 * people that something is still open for (a parked vehicle, a vehicle that
 * left with no arrival logged, people on foot), each showing where it is and
 * only the actions that apply to it. These replace the old block of pink
 * continuity chips; the pending data and the sentences they insert are the
 * same, only the layout differs.
 *
 * The card holding the TARGET (isTarget) leads the band, larger, as a
 * tracker: where he is now, who is with him, and his next steps as actions.
 * Everything else sits under it as "Others on the sheet". Continuity exists to
 * track the target, so he is never hidden by a dismissal.
 *
 * Layout adapts to the room the band actually has (container queries, not
 * device sniffing): one or two cards on a wide band go panoramic, three or
 * more sit side by side, and on a narrow band they swipe sideways.
 *
 * Tapping an action does not just fill in text: the caller adds it to the
 * running sheet as a new row stamped with the current time, which can be
 * edited like any other row (see onAction). Buttons are disabled while one is
 * being saved so a double tap cannot log it twice.
 *
 * A card can be dismissed with ×. That is purely a display choice, shared by
 * everyone on the sheet (stored on the sheet, see
 * sheet.setContinuityDismissal) — it never touches row text — and the card
 * returns by itself if a newer row about the same vehicle/people is logged.
 */
import { useRef, useState } from "react";
import { X } from "lucide-react";

export interface ContinuityAction {
  key: string;
  label: string;
  text: string;
  /** Kept for callers that fall back to inserting text instead of adding a
   * row (offline, or a sheet that isn't for today): "inline" appends to the
   * current text, "paragraph" opens its own paragraph. */
  mode?: "inline" | "paragraph";
}

export interface ContinuityCardData {
  /** Stable id for dismissal, e.g. "veh-1HIB84". */
  key: string;
  title: string;
  pill: string;
  /** Amber styling for something that still needs logging. */
  attn?: boolean;
  /** Who/what, e.g. "BAIG, JORDAN in the car". */
  who: string;
  /** Where/since, e.g. "193b Stock Road · since 12:04". */
  state: string;
  actions: ContinuityAction[];
  /** Highest row id that contributed to this card — a newer one revives a
   * dismissed card. */
  latestRowId: number;
  /** Capitalised surname tokens of the people this card is about — used to
   * find the card that holds the target. */
  holds?: string[];
  /** Display names of those people. */
  people?: string[];
  /** Where whoever is in this card is, for when it leads the band as the
   * target's tracker: a headline ("Inside Melville Fish & Chips") and a
   * supporting line ("On foot · since 10:41 AM"). */
  locus?: { headline: string; sub: string };
  /** This card holds the target. */
  isTarget?: boolean;
  /** Others with the target, e.g. "JORDAN". */
  companions?: string;
}

// Whether the band is folded away is a per-person view preference, unlike
// dismissal below, which is shared.
const COLLAPSE_KEY = "runsheet_continuity_cards_collapsed";

export function ContinuityCards({
  targetCode,
  cards,
  dismissed,
  onDismiss,
  onRestore,
  onAction,
  busy = false,
}: {
  /** The target's code, e.g. "BAIG". */
  targetCode?: string;
  cards: ContinuityCardData[];
  /** { cardKey: rowIdAtDismissal } for this sheet, shared by everyone. */
  dismissed: Record<string, number>;
  onDismiss: (key: string, rowId: number) => void;
  onRestore: (key: string) => void;
  /** Called when an action is tapped — adds the sentence to the sheet. */
  onAction: (text: string, mode?: "inline" | "paragraph") => void;
  /** True while an action is being saved. */
  busy?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [activeDot, setActiveDot] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isHidden = (c: ContinuityCardData) =>
    !c.isTarget &&
    dismissed[c.key] !== undefined &&
    c.latestRowId <= dismissed[c.key];
  const live = cards.filter(c => !isHidden(c));
  const gone = cards.filter(isHidden);
  const targetCard = live.find(c => c.isTarget);
  const others = live.filter(c => !c.isTarget);

  if (live.length === 0 && gone.length === 0) return null;

  const untracked =
    gone.length > 0 ? (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>Not tracking:</span>
        {gone.map(c => (
          <button
            key={c.key}
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => onRestore(c.key)}
            aria-label={`Track ${c.title} again`}
            className="rounded-full border border-dashed border-border px-2.5 py-0.5 font-mono text-[11px] hover:border-solid hover:text-foreground"
          >
            {c.title} · track again
          </button>
        ))}
      </div>
    ) : null;

  if (live.length === 0) {
    return <div className="mt-2">{untracked}</div>;
  }

  // Panoramic when there is room: a lone card from a medium-wide band, two
  // cards from a wide one. Static class strings so Tailwind can see them.
  const pano =
    others.length === 1 ? "one" : others.length === 2 ? "two" : "none";
  const gridCls =
    pano === "one"
      ? "grid gap-2 grid-cols-1"
      : pano === "two"
        ? "grid gap-2 grid-cols-[repeat(auto-fit,minmax(200px,1fr))] @3xl:grid-cols-1"
        : "grid gap-2 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]";
  const cardCls =
    pano === "one"
      ? "@lg:flex-row @lg:items-center @lg:flex-wrap @lg:gap-x-5 @lg:pr-12"
      : pano === "two"
        ? "@3xl:flex-row @3xl:items-center @3xl:flex-wrap @3xl:gap-x-5 @3xl:pr-12"
        : "";
  const actsCls =
    pano === "one"
      ? "@lg:mt-0 @lg:grid-flow-col @lg:auto-cols-fr @lg:flex-[2_1_340px]"
      : pano === "two"
        ? "@3xl:mt-0 @3xl:grid-flow-col @3xl:auto-cols-fr @3xl:flex-[2_1_340px]"
        : "";

  // The info block only claims a share of the row when the card is laid out
  // as a row (panoramic). In a stacked card a flex-basis would be read as a
  // HEIGHT and balloon the card.
  const infoCls =
    pano === "one"
      ? "@lg:flex-1 @lg:basis-[200px]"
      : pano === "two"
        ? "@3xl:flex-1 @3xl:basis-[200px]"
        : "";
  const idCls =
    pano === "one"
      ? "@lg:min-w-[150px]"
      : pano === "two"
        ? "@3xl:min-w-[150px]"
        : "";

  return (
    <div className="@container mt-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Where now
          </span>
          <span className="rounded-full bg-pink-500 px-1.5 text-[10px] font-semibold text-white">
            {live.length}
          </span>
          <span className="text-[10px] text-muted-foreground">
            Tap adds to the open cell, or as a new row now
          </span>
        </div>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            const next = !collapsed;
            setCollapsed(next);
            try {
              localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
            } catch {
              /* ignore */
            }
          }}
          aria-expanded={!collapsed}
          className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {!collapsed && targetCard && (
        <div
          className={`overflow-hidden rounded-xl border border-l-[6px] ${
            targetCard.attn
              ? "border-amber-500/40 border-l-amber-500 bg-amber-500/10"
              : "border-border border-l-emerald-500 bg-card"
          }`}
        >
          <div className="grid gap-x-4 gap-y-1 p-3 @lg:grid-cols-[auto_1fr]">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Target
              </span>
              <span className="font-mono text-[15px] font-semibold tracking-wide">
                {targetCode ?? targetCard.title}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="break-words text-lg font-semibold leading-tight">
                {targetCard.locus?.headline ?? targetCard.who}
              </div>
              {(targetCard.locus?.sub || targetCard.state) && (
                <div className="text-xs text-muted-foreground">
                  {targetCard.locus?.sub ?? targetCard.state}
                </div>
              )}
              {targetCard.companions && (
                <div className="text-xs">With {targetCard.companions}</div>
              )}
            </div>
          </div>
          {targetCard.actions.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-1.5 border-t border-border/60 p-3">
              {targetCard.actions.map((a, i) => (
                <button
                  key={a.key}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => onAction(a.text, a.mode)}
                  disabled={busy}
                  title={a.text}
                  className={`cursor-pointer rounded-md border px-2.5 py-2 text-left font-mono text-xs font-semibold transition-all active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 ${
                    i === 0
                      ? "border-pink-500 bg-pink-500 text-white hover:bg-pink-500/90"
                      : "border-pink-500/30 bg-pink-500/5 text-pink-500 hover:bg-pink-500/15"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!collapsed && targetCard && others.length > 0 && (
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Others on the sheet
        </span>
      )}

      {!collapsed && others.length > 0 && (
        <>
          <div
            ref={scrollRef}
            onScroll={e => {
              const el = e.currentTarget;
              const first = el.firstElementChild as HTMLElement | null;
              if (!first) return;
              setActiveDot(
                Math.round(
                  el.scrollLeft / (first.getBoundingClientRect().width + 8)
                )
              );
            }}
            className={`${gridCls} @max-md:flex @max-md:snap-x @max-md:snap-mandatory @max-md:overflow-x-auto @max-md:pb-1`}
          >
            {others.map(c => (
              <div
                key={c.key}
                className={`relative flex min-w-0 flex-col gap-2 rounded-lg border p-2.5 @max-md:shrink-0 @max-md:basis-[84%] @max-md:snap-start ${
                  c.attn
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-border bg-card"
                } ${cardCls}`}
              >
                <div className={`flex items-center gap-2 pr-8 ${idCls}`}>
                  <span className="font-mono text-[13px] font-semibold break-all">
                    {c.title}
                  </span>
                  <span
                    className={`whitespace-nowrap rounded-full px-2 text-[10px] font-bold ${
                      c.attn
                        ? "border border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {c.pill}
                  </span>
                </div>
                <div
                  className={`min-w-0 text-[11.5px] leading-snug ${infoCls}`}
                >
                  <div>{c.who}</div>
                  <div className="text-muted-foreground">{c.state}</div>
                </div>
                <div className={`mt-auto grid gap-1.5 ${actsCls}`}>
                  {c.actions.map(a => (
                    <button
                      key={a.key}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => onAction(a.text, a.mode)}
                      disabled={busy}
                      title={a.text}
                      className="cursor-pointer disabled:cursor-wait disabled:opacity-60 rounded-md border border-pink-500/30 bg-pink-500/5 px-2.5 py-1.5 text-left font-mono text-[11px] font-semibold text-pink-500 transition-all hover:bg-pink-500/15 active:scale-[0.98] @max-xl:py-2 @max-xl:text-xs"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => onDismiss(c.key, c.latestRowId)}
                  aria-label={`Stop tracking ${c.title}`}
                  title={`Stop tracking ${c.title}`}
                  className={`absolute right-1 grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${
                    pano === "one"
                      ? "top-1 @lg:top-1/2 @lg:-translate-y-1/2"
                      : pano === "two"
                        ? "top-1 @3xl:top-1/2 @3xl:-translate-y-1/2"
                        : "top-1"
                  }`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {others.length > 1 && (
            <div
              className="hidden justify-center gap-1.5 @max-md:flex"
              aria-hidden
            >
              {others.map((c, i) => (
                <i
                  key={c.key}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i === activeDot ? "bg-emerald-500" : "bg-border"
                  }`}
                />
              ))}
            </div>
          )}
        </>
      )}
      {untracked}
    </div>
  );
}
