import { isBlendDay, isBlendTeam } from "@shared/taskingBlend";
import { useIsMobile } from "@/hooks/useMobile";
import { readableOn } from "@shared/teamColours";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TASKING_VIEWS,
  isTaskingView,
  useTaskingView,
  type TaskingViewId,
} from "@/lib/taskingViewPref";
import {
  cellHasOp,
  formatShiftText,
  readWeek,
  timelineSpan,
  PHONE_VIEWS,
  todayIndex,
  viewOnPhone,
  weekDays,
  weekOps,
  weekSummary,
  type DayCell,
  type TaskingCellInput,
} from "@shared/taskingView";
import {
  SLIDE_STEP,
  shiftLength,
  shiftStart,
  slideShift,
} from "@shared/taskingTimeline";
import "./taskingViews.css";

export interface TaskingTeam {
  id: string;
  label: string;
  /** Short form for pills: T1, T2, PTT, CAP. */
  ab: string;
  colour: string;
}

/** What an admin can do on the Timeline: slide a bar to another time and pick
 * another operation. Absent (or `editable` false) it is read-only. */
export interface TimelineEdit {
  editable: boolean;
  /** Operation names offered by the menu. */
  ops: readonly string[];
  /** A bar was slid; `shift` is the new "HHMM-HHMM". */
  onSlide: (teamId: string, dayIndex: number, shift: string) => void;
  /** An operation was picked from a bar's menu. "Other" comes with the typed
   * description in `other`; "Admin" and the operations are plain names. */
  onOp: (teamId: string, dayIndex: number, op: string, other?: string) => void;
  /** Split a blended day back into Team 1 and Team 2. */
  onSplit: (dayIndex: number) => void;
  /** Cells (`team-day`) with a change not saved yet. */
  changed: ReadonlySet<string>;
}

interface Ctx {
  edit?: TimelineEdit;
  week: Record<string, DayCell[]>;
  days: ReturnType<typeof weekDays>;
  today: number;
  teams: readonly TaskingTeam[];
  focus: string | null;
  dim: (c: DayCell) => string;
  warn: (teamId: string, dayIndex: number, primary: string) => ReactNode;
}

/** Clicking an operation's name highlights that operation. */
const ToggleOp = createContext<(name: string) => void>(() => {});
function Op({ name }: { name: string }) {
  const toggle = useContext(ToggleOp);
  return (
    <span
      className="tcv-op"
      role="button"
      tabIndex={0}
      onClick={() => toggle(name)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle(name);
        }
      }}
    >
      {name}
    </span>
  );
}

/** The pink-and-blue "T1 T2" mark on a blended day. */
function BlendTag() {
  return (
    <span className="tcv-btag" title="Team 1 and Team 2 combined">
      <i>T1</i>
      <i>T2</i>
    </span>
  );
}

/** Day `i` is a blended day for this team (Surveillance Team 1 and 2 working as one). */
const blendedFor = (
  week: Record<string, DayCell[]>,
  teamId: string,
  i: number
) => isBlendTeam(teamId) && isBlendDay(week, i);

const teamStyle = (t: TaskingTeam) => ({ "--tc": t.colour }) as CSSProperties;

function localISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Banded columns */
function PanelBanded({ week, days, today, teams, dim, warn }: Ctx) {
  return (
    <div className="tcv">
      {teams.map(t => (
        <div key={t.id} className="tcv-card tcv-team" style={teamStyle(t)}>
          <div className="tcv-title">
            <span className="tcv-stripe" />
            <b>{t.label}</b>
          </div>
          <div className="tcv-scroll">
            <div className="tcv-pa">
              {days.map((d, i) => {
                const c = week[t.id][i];
                const bl = blendedFor(week, t.id, i);
                return (
                  <div
                    key={i}
                    className={`tcv-pa-col ${i > 4 ? "wk" : ""} ${bl ? "bl" : ""} ${dim(c)}`}
                  >
                    <div className={`tcv-pa-day ${i === today ? "today" : ""}`}>
                      {d.name}
                      <small>
                        {String(d.day).padStart(2, "0")} {d.month}
                      </small>
                    </div>
                    <div className="tcv-pa-shift">
                      {c.shift ? (
                        <span className={`tcv-shift ${c.off ? "off" : ""}`}>
                          {formatShiftText(c.shift)}
                        </span>
                      ) : (
                        <span className="tcv-none">—</span>
                      )}
                      {bl && !c.off && <BlendTag />}
                      {warn(t.id, i, c.primary)}
                    </div>
                    <div className={`tcv-pa-task ${c.off ? "hide" : ""}`}>
                      <i className="tcv-tag">P</i>
                      <span className="v">
                        {c.primary ? (
                          <Op name={c.primary} />
                        ) : (
                          <span className="tcv-none">—</span>
                        )}
                      </span>
                    </div>
                    <div className={`tcv-pa-task sec ${c.off ? "hide" : ""}`}>
                      <i className="tcv-tag s">S</i>
                      <span className="v">
                        {c.secondary ? (
                          <Op name={c.secondary} />
                        ) : (
                          <span className="tcv-none">—</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Schedule tables (two panels across) */
function PanelTables({ week, days, teams, dim, warn }: Ctx) {
  return (
    <div className="tcv-pb">
      {teams.map(t => (
        <div key={t.id} className="tcv-card tcv-team" style={teamStyle(t)}>
          <div className="tcv-title">
            <span className="tcv-stripe" />
            <b>{t.label}</b>
          </div>
          <table className="tcv-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Shift</th>
                <th>Primary</th>
                <th>Secondary</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => {
                const c = week[t.id][i];
                const bl = blendedFor(week, t.id, i);
                return (
                  <tr
                    key={i}
                    className={`${i > 4 ? "wk" : ""} ${bl ? "bl" : ""} ${dim(c)}`}
                  >
                    <td className="d">
                      {d.name}
                      <small>{String(d.day).padStart(2, "0")}</small>
                    </td>
                    {c.off ? (
                      <td colSpan={3} className="off">
                        Rostered day off
                      </td>
                    ) : (
                      <>
                        <td className="sh">
                          {c.shift ? (
                            <span className="tcv-shift">
                              {formatShiftText(c.shift)}
                            </span>
                          ) : (
                            <span className="tcv-none">—</span>
                          )}
                          {bl && <BlendTag />}
                          {warn(t.id, i, c.primary)}
                        </td>
                        <td>
                          {c.primary ? (
                            <b>
                              <Op name={c.primary} />
                            </b>
                          ) : (
                            <span className="tcv-none">—</span>
                          )}
                        </td>
                        <td className="s">
                          {c.secondary ? (
                            <Op name={c.secondary} />
                          ) : (
                            <span className="tcv-none">—</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/** Day tiles (seven days and a week summary: four across, two rows) */
function DayTiles({ week, days, today, teams, dim, warn }: Ctx) {
  const sum = weekSummary(week);
  const ops = Object.keys(sum.primaryByOp);
  return (
    <div className="tcv-ta">
      {days.map((d, i) => (
        <div key={i} className={`tcv-tile ${i === today ? "today" : ""}`}>
          <div className="tcv-tile-h">
            <span className="n">{String(d.day).padStart(2, "0")}</span>
            <span className="w">{d.name}</span>
            {i === today && <span className="td">Today</span>}
            <span className="m">{d.month}</span>
          </div>
          {teams.map(t => {
            const c = week[t.id][i];
            const bl = blendedFor(week, t.id, i);
            // Blended: Team 1 and Team 2 are one lane, drawn once (on Team 1's place).
            if (bl && t.id === "surv2") return null;
            return (
              <div
                key={t.id}
                className={`tcv-tl ${bl ? "tcv-blend merged" : "tcv-team"} ${c.off ? "off" : ""} ${dim(c)}`}
                style={bl ? undefined : teamStyle(t)}
              >
                <i />
                <div className="tcv-tl-body">
                  <div className="tcv-tl-team">
                    {bl ? "T1 + T2 combined" : t.label}
                  </div>
                  {c.off ? (
                    <span className="tcv-rdo" style={{ fontWeight: 600 }}>
                      RDO
                    </span>
                  ) : !c.shift && !c.primary ? (
                    <span className="tcv-none">—</span>
                  ) : (
                    <>
                      <div className="tcv-tl-line">
                        <span className="tcv-tl-time">
                          {formatShiftText(c.shift)}
                        </span>
                        <span className="tcv-tl-op">
                          {c.primary ? <Op name={c.primary} /> : null}
                        </span>
                        {warn(t.id, i, c.primary)}
                        {bl && warn("surv2", i, c.primary)}
                      </div>
                      {c.secondary && (
                        <div className="tcv-tl-sec">
                          + <Op name={c.secondary} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div className="tcv-tile tcv-sum">
        <div className="tcv-tile-h">
          <span className="w">Week summary</span>
          <span className="m">
            {days[0].day} {days[0].month} – {days[6].day} {days[6].month}
          </span>
        </div>
        <div className="stat">
          <span>Shifts worked</span>
          <b>{sum.shifts}</b>
        </div>
        <div className="stat">
          <span>Rostered days off</span>
          <b>{sum.rdo}</b>
        </div>
        <div className="ops">
          {ops.map(o => (
            <div key={o}>
              <span>{o}</span>
              <b>{sum.primaryByOp[o]} primary</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Where a bar's operation menu opens. */
interface BarMenuTarget {
  teamId: string;
  dayIndex: number;
  /** "T1 · Mon", the menu's heading. */
  label: string;
  rect: DOMRect;
}

/**
 * One bar on the Timeline. For an admin (`edit.editable`) it can be slid left
 * or right to another time (the length is kept, steps of 30 minutes, a start
 * from 05:00 to 23:00), clicked (or Enter) to pick another operation, and moved
 * with the arrow keys. A press that barely moves is a click, not a slide. For
 * everyone else it is a plain bar. While sliding the bar is moved directly in
 * the page (not through React) and the new time is handed over on release.
 */
function TimelineBar({
  className,
  style,
  title,
  edit,
  teamId,
  dayIndex,
  label,
  cell,
  span,
  pct,
  openMenu,
  changed,
  children,
}: {
  className: string;
  style: CSSProperties;
  title: string;
  edit?: TimelineEdit;
  teamId: string;
  dayIndex: number;
  label: string;
  cell: DayCell;
  span: [number, number];
  pct: (m: number) => number;
  openMenu: (t: BarMenuTarget) => void;
  changed: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x0: number;
    s0: number;
    w: number;
    moved: boolean;
    next: string | null;
    left: string;
    width: string;
    /** The start of the bar's current time, in minutes. */
    start: number;
  } | null>(null);
  const start = shiftStart(cell.shift);
  const len = shiftLength(cell.shift);
  const canEdit = !!edit?.editable;
  const canSlide = canEdit && start !== null && len !== null;
  // Starts late enough to finish the next morning: the bar stops at midnight.
  const overnight = start !== null && len !== null && start + len > 1440;

  const open = () => {
    const el = ref.current;
    if (el)
      openMenu({ teamId, dayIndex, label, rect: el.getBoundingClientRect() });
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!canEdit || !el || e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    drag.current = {
      x0: e.clientX,
      s0: start ?? 0,
      w: el.parentElement?.getBoundingClientRect().width || 1,
      moved: false,
      next: null,
      left: el.style.left,
      width: el.style.width,
      start: start ?? 0,
    };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || !canSlide || start === null || len === null) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 5) return;
    d.moved = true;
    el.classList.add("sliding");
    const next = slideShift(
      cell.shift,
      d.s0 + (dx / d.w) * (span[1] - span[0])
    );
    if (!next) return;
    d.next = next;
    const ns = shiftStart(next) ?? start;
    // Moved with a transform (its own layer, no layout) rather than by
    // changing `left` on every pointer move; the width only changes when the
    // end reaches the edge of the axis.
    el.style.transform = `translateX(${((ns - d.start) / (span[1] - span[0])) * d.w}px)`;
    el.style.width = `${pct(Math.min(ns + len, span[1])) - pct(ns)}%`;
    const t = el.querySelector(".t");
    if (t) t.textContent = formatShiftText(next);
  };
  /** Puts the bar's own position and time back (a slide that changed nothing,
   * or was cancelled). */
  const restore = (el: HTMLDivElement, d: { left: string; width: string }) => {
    el.classList.remove("sliding");
    el.style.transform = "";
    el.style.left = d.left;
    el.style.width = d.width;
    const t = el.querySelector(".t");
    if (t) t.textContent = formatShiftText(cell.shift);
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!d || !el) return;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (!d.moved) {
      restore(el, d);
      open();
    } else if (d.next && d.next !== cell.shift) {
      // Land on the new place in one step, then hand it over (the page
      // re-draws the bar at the same place).
      const ns = shiftStart(d.next) ?? d.start;
      el.classList.remove("sliding");
      el.style.transform = "";
      el.style.left = `${pct(ns)}%`;
      edit?.onSlide(teamId, dayIndex, d.next);
    } else {
      restore(el, d);
    }
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    } else if (
      canSlide &&
      start !== null &&
      (e.key === "ArrowLeft" || e.key === "ArrowRight")
    ) {
      e.preventDefault();
      const next = slideShift(
        cell.shift,
        start + (e.key === "ArrowLeft" ? -SLIDE_STEP : SLIDE_STEP)
      );
      if (next && next !== cell.shift) edit?.onSlide(teamId, dayIndex, next);
    }
  };

  return (
    <div
      ref={ref}
      className={`${className}${canEdit ? " tcv-edit" : ""}${changed ? " tcv-changed" : ""}`}
      style={style}
      title={title}
      {...(canEdit
        ? {
            tabIndex: 0,
            role: "button",
            "aria-label": `${title}. ${canSlide ? "Slide to change the time. " : ""}Press Enter to change the operation.`,
            onPointerDown: down,
            onPointerMove: move,
            onPointerUp: up,
            onPointerCancel: () => {
              const d = drag.current;
              const el = ref.current;
              drag.current = null;
              if (d && el) restore(el, d);
            },
            // No browser text selection or drag image while sliding.
            onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
            onDragStart: (e: React.DragEvent) => e.preventDefault(),
            onKeyDown: key,
            // A click on the operation's name opens this menu, it does not
            // also highlight the operation.
            onClickCapture: (e: React.MouseEvent) => e.stopPropagation(),
          }
        : {})}
    >
      {canSlide && <span className="tcv-grip" aria-hidden />}
      {children}
      {overnight && (
        <span className="tcv-more" title="Finishes the next morning">
          ›
        </span>
      )}
    </div>
  );
}

/** Timeline bar height and the distance from one team lane to the next, in
 * pixels. Keep taskingViews.css (.tcv-bar height, the lane minimum height) in
 * step. */
const BAR_H = 24;
const BAR_PITCH = 28;

/** The fixed choices the edit grid lists above the operations; here they sit
 * under them. An operation that is itself called Admin or Training is not
 * listed twice. */
const FIXED_TASKS = ["admin", "training"];

/** The operation menu of a clicked bar: the active operations, then Admin and
 * Other (free text) as in the edit grid, and Split on a blended day. */
function BarMenu({
  target,
  week,
  edit,
  onClose,
}: {
  target: BarMenuTarget;
  week: Record<string, DayCell[]>;
  edit: TimelineEdit;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cell = week[target.teamId]?.[target.dayIndex];
  const current = cell?.primary ?? "";
  const blended =
    isBlendTeam(target.teamId) && isBlendDay(week, target.dayIndex);
  const opNames = edit.ops.filter(
    o => !FIXED_TASKS.includes(o.trim().toLowerCase())
  );
  const isAdmin = current.trim().toLowerCase() === "admin";
  // What is on the bar now but is not in the list (a free-text task, Training).
  const custom =
    current && !isAdmin && !opNames.includes(current) ? current : "";
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState(custom);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // The page scrolling closes the menu (it would be left floating); the menu
    // scrolling itself does not (it does when it lists many operations and
    // focus moves to its text box).
    const scrolled = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", scrolled, true);
    ref.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"], button')
      ?.focus();
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", scrolled, true);
    };
  }, [onClose]);
  const left = Math.max(
    8,
    Math.min(
      window.innerWidth - 232,
      target.rect.left + target.rect.width / 2 - 112
    )
  );
  const below = target.rect.bottom + 6;
  const top =
    below + 340 > window.innerHeight
      ? Math.max(8, target.rect.top - 340 - 6)
      : below;
  const pick = (op: string, other?: string) => {
    edit.onOp(target.teamId, target.dayIndex, op, other);
    onClose();
  };
  const item = (label: string, checked: boolean, onPick: () => void) => (
    <button
      key={label}
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onClick={onPick}
    >
      <span>{label}</span>
      {checked && <span aria-hidden>✓</span>}
    </button>
  );
  return createPortal(
    <div
      ref={ref}
      className="tcv-menu"
      role="menu"
      aria-label={`Operation for ${target.label}`}
      style={{ left, top }}
    >
      <div className="tcv-menu-h">Operation · {target.label}</div>
      {opNames.length === 0 && !custom && (
        <div className="tcv-menu-empty">No operations</div>
      )}
      {opNames.map(o => item(o, o === current, () => pick(o)))}
      <hr />
      {item("Admin", isAdmin, () => pick("Admin"))}
      {custom && item(custom, true, onClose)}
      {typing ? (
        <form
          className="tcv-menu-other"
          onSubmit={e => {
            e.preventDefault();
            const v = text.trim();
            if (v) pick("Other", v);
          }}
        >
          <input
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Describe task…"
            aria-label="Describe the task"
          />
          <button type="submit" disabled={!text.trim()}>
            Set
          </button>
        </form>
      ) : (
        <button type="button" role="menuitem" onClick={() => setTyping(true)}>
          Other (free text)…
        </button>
      )}
      {blended && (
        <>
          <hr />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              edit.onSplit(target.dayIndex);
              onClose();
            }}
          >
            Split into Team 1 and Team 2
          </button>
        </>
      )}
    </div>,
    document.body
  );
}

/** Timeline (hours across, a lane for each team) */
function Timeline({ week, days, today, teams, dim, warn, edit }: Ctx) {
  const [lo, hi0] = timelineSpan(week);
  // Editable: always reach midnight, so a bar slid to a 23:00 start has room.
  const hi = edit?.editable ? Math.max(hi0, 24 * 60) : hi0;
  const [menu, setMenu] = useState<BarMenuTarget | null>(null);
  const ticks: number[] = [];
  for (let m = lo; m <= hi; m += 120) ticks.push(m);
  const pct = (m: number) => ((m - lo) / (hi - lo)) * 100;
  return (
    <div
      className={`tcv-card tcv-scroll${edit?.editable ? " tcv-editing" : ""}`}
    >
      <div className="tcv-cb">
        <div className="tcv-cb-corner" />
        <div className="tcv-cb-axis">
          {ticks.map((m, k) => (
            <span
              key={m}
              style={{
                left: `${pct(m)}%`,
                transform:
                  k === 0
                    ? "none"
                    : k === ticks.length - 1
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
              }}
            >
              {String(Math.floor(m / 60) % 24).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {days.map((d, i) => (
          <TimelineRow
            key={i}
            d={d}
            i={i}
            today={today}
            teams={teams}
            week={week}
            ticks={ticks}
            pct={pct}
            span={[lo, hi]}
            dim={dim}
            warn={warn}
            edit={edit}
            openMenu={setMenu}
          />
        ))}
      </div>
      {edit?.editable && menu && (
        <BarMenu
          target={menu}
          week={week}
          edit={edit}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function TimelineRow({
  d,
  i,
  today,
  teams,
  week,
  ticks,
  pct,
  span,
  dim,
  warn,
  edit,
  openMenu,
}: {
  span: [number, number];
  edit?: TimelineEdit;
  openMenu: (t: BarMenuTarget) => void;
  d: ReturnType<typeof weekDays>[number];
  i: number;
  today: number;
  teams: readonly TaskingTeam[];
  week: Record<string, DayCell[]>;
  ticks: number[];
  pct: (m: number) => number;
  dim: Ctx["dim"];
  warn: Ctx["warn"];
}) {
  const wk = i > 4 ? "wk" : "";
  return (
    <>
      <div className={`tcv-cb-day ${wk} ${i === today ? "today" : ""}`}>
        {d.name}
        <small>
          {String(d.day).padStart(2, "0")} {d.month}
        </small>
      </div>
      <div className={`tcv-cb-lane ${wk}`}>
        <div className="tcv-cb-grid">
          {ticks.map(m => (
            <i key={m} style={{ left: `${pct(m)}%` }} />
          ))}
        </div>
        {teams.map((t, li) => {
          const c = week[t.id][i];
          const top = 8 + li * BAR_PITCH;
          const bl = blendedFor(week, t.id, i) && !!c.range;
          // Blended: one tall bar across the Team 1 and Team 2 lanes.
          if (bl && t.id === "surv2") return null;
          if (c.off)
            return (
              <div key={t.id} className="tcv-offtag" style={{ top }}>
                <span className="tcv-ab">{t.ab}</span>RDO
              </div>
            );
          if (!c.range) {
            if (!c.shift && !c.primary) return null;
            return (
              <div
                key={t.id}
                className={`tcv-offtag tcv-team ${dim(c)}`}
                style={{ ...teamStyle(t), top }}
              >
                <span className="tcv-ab">{t.ab}</span>
                {c.shift} {c.primary}
              </div>
            );
          }
          return (
            <TimelineBar
              key={t.id}
              className={`tcv-bar ${bl ? "tcv-blend merged" : "tcv-team"} ${dim(c)}`}
              edit={edit}
              teamId={t.id}
              dayIndex={i}
              label={`${bl ? "T1 + T2" : t.ab} · ${d.name}`}
              cell={c}
              span={span}
              pct={pct}
              openMenu={openMenu}
              changed={
                !!edit?.changed.has(`${t.id}-${i}`) ||
                (bl && !!edit?.changed.has(`surv2-${i}`))
              }
              style={{
                ...(bl ? {} : teamStyle(t)),
                ...(bl ? { height: BAR_PITCH + BAR_H } : {}),
                left: `${pct(c.range[0])}%`,
                width: `${pct(c.range[1]) - pct(c.range[0])}%`,
                top,
              }}
              title={`${bl ? "Team 1 + Team 2" : t.label} ${formatShiftText(c.shift)}`}
            >
              {bl ? (
                <>
                  <span>
                    <span className="ab">T1 + T2</span>
                    {c.primary ? <Op name={c.primary} /> : null}
                    {c.secondary ? (
                      <>
                        {" + "}
                        <Op name={c.secondary} />
                      </>
                    ) : null}
                  </span>
                  <span className="t" style={{ marginLeft: 0 }}>
                    {formatShiftText(c.shift)}
                  </span>
                  {warn("surv1", i, c.primary)}
                  {warn("surv2", i, c.primary)}
                </>
              ) : (
                <>
                  <span className="ab">{t.ab}</span>
                  {c.primary ? <Op name={c.primary} /> : null}
                  {c.secondary ? (
                    <>
                      {" + "}
                      <Op name={c.secondary} />
                    </>
                  ) : null}
                  <span className="t">{formatShiftText(c.shift)}</span>
                  {warn(t.id, i, c.primary)}
                </>
              )}
            </TimelineBar>
          );
        })}
      </div>
    </>
  );
}

/**
 * The Weekly Tasking Calendar of the full view: a dropdown chooses how it is
 * laid out (banded columns, schedule tables, day tiles or a timeline; the
 * choice is remembered on this device) and a row of buttons highlights one
 * operation across it. Read-only; the edit page keeps its own grid.
 */
export function TaskingCalendarViews({
  weekStart,
  teams,
  grid,
  issueCount,
  renderWarning,
  edit,
}: {
  /** Admin editing on the Timeline (slide a bar, pick an operation). */
  edit?: TimelineEdit;
  weekStart: string;
  teams: readonly TaskingTeam[];
  grid: Record<string, TaskingCellInput | undefined>;
  issueCount: number;
  /** The short-of-numbers warning for a tasked cell, or null. */
  renderWarning: (
    teamId: string,
    dayIndex: number,
    primary: string
  ) => ReactNode;
}) {
  const [savedView, setView] = useTaskingView();
  // A phone offers only Day tiles and Timeline (and has no colour / letter key);
  // the saved choice is left alone for the laptop.
  const isMobile = useIsMobile();
  const view = isMobile ? (viewOnPhone(savedView) as TaskingViewId) : savedView;
  const viewChoices = isMobile
    ? TASKING_VIEWS.filter(v => PHONE_VIEWS.includes(v.id))
    : TASKING_VIEWS;
  const [focusRaw, setFocus] = useState<string | null>(null);

  const ids = useMemo(() => teams.map(t => t.id), [teams]);
  const week = useMemo(() => readWeek(grid, ids), [grid, ids]);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const today = todayIndex(weekStart, localISO());
  const ops = useMemo(() => weekOps(week), [week]);
  const focus = focusRaw && ops.includes(focusRaw) ? focusRaw : null;

  const toggle = (name: string) => setFocus(f => (f === name ? null : name));
  const ctx: Ctx = {
    edit,
    week,
    days,
    today,
    teams,
    focus,
    dim: c => (focus && !cellHasOp(c, focus) ? "tcv-dim" : ""),
    warn: renderWarning,
  };

  // The pink-and-blue of a blended day are Team 1's and Team 2's own colours.
  const b1 = teams.find(t => t.id === "surv1")?.colour ?? "#ec4899";
  const b2 = teams.find(t => t.id === "surv2")?.colour ?? "#1976d2";
  const blendVars = {
    "--b1": b1,
    "--b2": b2,
    "--b1t": readableOn(b1),
    "--b2t": readableOn(b2),
  } as CSSProperties;

  return (
    <section className="space-y-3" style={blendVars}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="px-1 flex items-center gap-2">
          <h2 className="text-sm font-bold tracking-widest uppercase text-muted-foreground">
            Weekly Tasking Calendar
          </h2>
          {issueCount > 0 && (
            <Badge
              variant="outline"
              className="gap-1 text-amber-600 border-amber-500/40 bg-amber-500/5"
            >
              <AlertTriangle className="h-3 w-3" />
              {issueCount} tasking issue{issueCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <Select
          value={view}
          onValueChange={v => {
            if (isTaskingView(v)) setView(v);
          }}
        >
          <SelectTrigger
            className="w-full sm:w-[270px]"
            aria-label="Calendar view"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {viewChoices.map(v => (
              <SelectItem key={v.id} value={v.id}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {ops.length > 0 && (
        <div
          className="tcv-focus"
          role="group"
          aria-label="Highlight an operation"
        >
          <span className="lab">Highlight</span>
          <button
            type="button"
            className="tcv-chip"
            aria-pressed={!focus}
            onClick={() => setFocus(null)}
          >
            All
          </button>
          {ops.map(o => (
            <button
              key={o}
              type="button"
              className="tcv-chip"
              aria-pressed={focus === o}
              onClick={() => toggle(o)}
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {!isMobile && (
        <div className="tcv-legend">
          {teams.map(t => (
            <span key={t.id} style={teamStyle(t)}>
              <i />
              {t.label}
            </span>
          ))}
          <span>
            P = primary task, S = secondary task, RDO = rostered day off
          </span>
        </div>
      )}

      {view === "cal-timeline" && edit?.editable && (
        <p className="px-1 text-xs text-muted-foreground">
          Slide a bar to change its time (steps of 30 minutes, a start from
          05:00 to 23:00). Click a bar to change its operation.
        </p>
      )}

      <ToggleOp.Provider value={toggle}>
        {view === "panel-banded" && <PanelBanded {...ctx} />}
        {view === "panel-tables" && <PanelTables {...ctx} />}
        {view === "tile-days" && <DayTiles {...ctx} />}
        {view === "cal-timeline" && <Timeline {...ctx} />}
      </ToggleOp.Provider>
    </section>
  );
}
