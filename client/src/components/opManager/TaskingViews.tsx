import { isBlendDay, isBlendTeam } from "@shared/taskingBlend";
import { useIsMobile } from "@/hooks/useMobile";
import { readableOn } from "@shared/teamColours";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BreachItem } from "@shared/taskingBreaches";
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
  SHIFT_PRESETS,
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

/** What an admin can do in edit mode, in every layout: change a shift, pick the
 * operations, combine or split Team 1 and Team 2, and (Timeline) slide a bar to
 * another time. Absent (or `editable` false) the calendar is read-only. */
export interface TimelineEdit {
  editable: boolean;
  /** A shift was chosen: "" (none), "RDO" or a range "HHMM-HHMM". */
  onShift: (teamId: string, dayIndex: number, shift: string) => void;
  /** The second (S) operation was chosen; the same values as `onOp`. */
  onSecond: (
    teamId: string,
    dayIndex: number,
    op: string,
    other?: string
  ) => void;
  /** Operation names offered by the menu. */
  ops: readonly string[];
  /** A bar was slid; `shift` is the new "HHMM-HHMM". */
  onSlide: (teamId: string, dayIndex: number, shift: string) => void;
  /** An operation was picked from a bar's menu. "Other" comes with the typed
   * description in `other`; "Admin" and the operations are plain names. */
  onOp: (teamId: string, dayIndex: number, op: string, other?: string) => void;
  /** Create a new operation from the menu; resolves with its name (to set on
   * the bar) or null when it could not be created. */
  onCreateOp: (name: string) => Promise<string | null>;
  /** Split a blended day back into Team 1 and Team 2. */
  onSplit: (dayIndex: number) => void;
  /** Cells (`team-day`) with a change not saved yet. */
  changed: ReadonlySet<string>;
}

interface Ctx {
  edit?: TimelineEdit;
  counts?: Record<string, { onDuty: number; min: number } | undefined>;
  week: Record<string, DayCell[]>;
  days: ReturnType<typeof weekDays>;
  today: number;
  teams: readonly TaskingTeam[];
  focus: string | null;
  dim: (c: DayCell) => string;
  warn: (teamId: string, dayIndex: number, primary: string) => ReactNode;
  /** Opens the editor for a team-day (edit mode only). */
  openMenu: (t: BarMenuTarget) => void;
  /** The red EA-breach dot for a team-day, or null when there is none. */
  breach: (
    teamId: string,
    dayIndex: number,
    slot?: "top" | "bottom"
  ) => ReactNode;
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

/**
 * The red dot on a team-day where someone on duty has an EA breach on the
 * roster. Same alert as the roster's own dot; click for what and who. Stops
 * the press so it never starts a slide or opens a bar's menu.
 */
function BreachDot({
  items,
  heading,
  dayName,
  onOpenRoster,
  className = "",
}: {
  items: BreachItem[];
  heading: string;
  dayName: string;
  onOpenRoster?: () => void;
  className?: string;
}) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`tcv-breach ${items.length > 1 ? "n" : ""} ${className}`}
          aria-label={`${items.length} EA breach${items.length !== 1 ? "es" : ""}, ${heading}`}
          title={`${items.length} EA breach${items.length !== 1 ? "es" : ""}`}
          data-testid="tasking-breach-dot"
          onPointerDown={stop}
          onMouseDown={stop}
          onClick={stop}
          onKeyDown={stop}
        >
          {items.length > 1 ? items.length : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 max-w-[calc(100vw-24px)] p-0"
        align="end"
        data-testid="tasking-breach-popover"
        onPointerDown={stop}
        onMouseDown={stop}
        onKeyDown={stop}
        onClick={stop}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2 bg-red-500/10">
          <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">
              EA compliance issue{items.length !== 1 ? "s" : ""}
            </div>
            <div className="text-xs text-foreground/70">{heading}</div>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y">
          {items.map(b => (
            <div key={b.id} className="px-3 py-2 text-sm">
              <div className="font-semibold">{b.ruleTitle}</div>
              {b.eaReference && (
                <div className="text-xs text-foreground/70">
                  {b.eaReference}
                </div>
              )}
              <div className="mt-1 text-xs">
                {b.detail.startsWith(b.memberName) ? (
                  <>
                    <span className="font-semibold">{b.memberName}</span>
                    {b.detail.slice(b.memberName.length)}
                  </>
                ) : (
                  <>
                    <span className="font-semibold">{b.memberName}:</span>{" "}
                    {b.detail}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        {onOpenRoster && (
          <div className="border-t px-3 py-2">
            <button
              type="button"
              className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
              onClick={onOpenRoster}
            >
              Open {dayName} on the roster
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** "0600-1500" whatever way it was typed (07:00-15:00, an en dash, spaces). */
function canonShift(shift: string): string {
  const a = shiftStart(shift);
  const l = shiftLength(shift);
  if (a === null || l === null) return shift.trim();
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, "0")}${String(m % 60).padStart(2, "0")}`;
  return `${hhmm(a)}-${hhmm(a + l)}`;
}
const hoursOf = (shift: string) => {
  const l = shiftLength(shift);
  return l === null ? "" : `${l / 60} h`;
};
const cellLabel = (t: TaskingTeam, days: Ctx["days"], i: number) =>
  `${t.ab} · ${days[i].name}`;

/** The shift as a drop-down, like the edit page's. "Custom…" opens the editor. */
function ShiftSelect({
  team,
  i,
  shift,
  edit,
  openMenu,
  days,
}: {
  team: TaskingTeam;
  i: number;
  shift: string;
  edit: TimelineEdit;
  openMenu: Ctx["openMenu"];
  days: Ctx["days"];
}) {
  const cur = canonShift(shift);
  const presets = SHIFT_PRESETS as readonly string[];
  const extra = cur && cur !== "RDO" && !presets.includes(cur) ? cur : "";
  return (
    <select
      className="tcv-sel"
      aria-label={`Shift ${cellLabel(team, days, i)}`}
      value={cur}
      onChange={e => {
        const v = e.target.value;
        if (v === "__custom") {
          openMenu({
            teamId: team.id,
            dayIndex: i,
            label: cellLabel(team, days, i),
            rect: e.target.getBoundingClientRect(),
            full: true,
          });
        } else edit.onShift(team.id, i, v);
      }}
    >
      <option value="">— none —</option>
      <option value="RDO">RDO</option>
      {presets.map(p => (
        <option key={p} value={p}>
          {formatShiftText(p)} · {hoursOf(p)}
        </option>
      ))}
      {extra && (
        <option value={extra}>
          {formatShiftText(extra)} · {hoursOf(extra)}
        </option>
      )}
      <option value="__custom">Custom…</option>
    </select>
  );
}

/** P or S as a button that opens the operation menu. */
function OpButton({
  team,
  i,
  slot,
  value,
  days,
  openMenu,
}: {
  team: TaskingTeam;
  i: number;
  slot: "p" | "s";
  value: string;
  days: Ctx["days"];
  openMenu: Ctx["openMenu"];
}) {
  return (
    <button
      type="button"
      className="tcv-opbtn"
      aria-label={`${slot === "p" ? "Primary operation" : "Secondary operation"} ${cellLabel(team, days, i)}`}
      onClick={e =>
        openMenu({
          teamId: team.id,
          dayIndex: i,
          label: cellLabel(team, days, i),
          rect: e.currentTarget.getBoundingClientRect(),
          slot,
        })
      }
    >
      <i className={`tcv-tag ${slot === "s" ? "s" : ""}`}>
        {slot === "p" ? "P" : "S"}
      </i>
      <span className={value ? "" : "none"}>{value || "None"}</span>
    </button>
  );
}

/** Small "Split" for a combined day, in the layouts that show both teams. */
function SplitBtn({ edit, i }: { edit: TimelineEdit; i: number }) {
  return (
    <button
      type="button"
      className="tcv-splitbtn"
      onClick={() => edit.onSplit(i)}
    >
      Split
    </button>
  );
}

/** Banded columns */
function PanelBanded({
  week,
  days,
  today,
  teams,
  dim,
  warn,
  breach,
  edit,
  openMenu,
}: Ctx) {
  const ed = !!edit?.editable;
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
                    className={`tcv-pa-col ${i > 4 ? "wk" : ""} ${bl ? "bl" : ""} ${dim(c)} ${ed && edit!.changed.has(`${t.id}-${i}`) ? "tcv-changed-cell" : ""}`}
                  >
                    <div className={`tcv-pa-day ${i === today ? "today" : ""}`}>
                      {d.name}
                      <small>
                        {String(d.day).padStart(2, "0")} {d.month}
                      </small>
                    </div>
                    <div className="tcv-pa-shift">
                      {ed ? (
                        <ShiftSelect
                          team={t}
                          i={i}
                          shift={c.shift}
                          edit={edit!}
                          openMenu={openMenu}
                          days={days}
                        />
                      ) : c.shift ? (
                        <span className={`tcv-shift ${c.off ? "off" : ""}`}>
                          {formatShiftText(c.shift)}
                        </span>
                      ) : (
                        <span className="tcv-none">—</span>
                      )}
                      {bl && !c.off && <BlendTag />}
                      {ed && bl && <SplitBtn edit={edit!} i={i} />}
                      {warn(t.id, i, c.primary)}
                      {breach(t.id, i)}
                    </div>
                    {ed ? (
                      !c.off && (
                        <>
                          <div className="tcv-pa-task">
                            <OpButton
                              team={t}
                              i={i}
                              slot="p"
                              value={c.primary}
                              days={days}
                              openMenu={openMenu}
                            />
                          </div>
                          <div className="tcv-pa-task sec">
                            <OpButton
                              team={t}
                              i={i}
                              slot="s"
                              value={c.secondary}
                              days={days}
                              openMenu={openMenu}
                            />
                          </div>
                        </>
                      )
                    ) : (
                      <>
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
                        <div
                          className={`tcv-pa-task sec ${c.off ? "hide" : ""}`}
                        >
                          <i className="tcv-tag s">S</i>
                          <span className="v">
                            {c.secondary ? (
                              <Op name={c.secondary} />
                            ) : (
                              <span className="tcv-none">—</span>
                            )}
                          </span>
                        </div>
                      </>
                    )}
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
function PanelTables({
  week,
  days,
  teams,
  dim,
  warn,
  breach,
  edit,
  openMenu,
}: Ctx) {
  const ed = !!edit?.editable;
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
                    className={`${i > 4 ? "wk" : ""} ${bl ? "bl" : ""} ${dim(c)} ${ed && edit!.changed.has(`${t.id}-${i}`) ? "tcv-changed-cell" : ""}`}
                  >
                    <td className="d">
                      {d.name}
                      <small>{String(d.day).padStart(2, "0")}</small>
                    </td>
                    {ed ? (
                      <>
                        <td className="sh">
                          <ShiftSelect
                            team={t}
                            i={i}
                            shift={c.shift}
                            edit={edit!}
                            openMenu={openMenu}
                            days={days}
                          />
                          {bl && <BlendTag />}
                          {bl && <SplitBtn edit={edit!} i={i} />}
                          {warn(t.id, i, c.primary)}
                          {breach(t.id, i)}
                        </td>
                        <td>
                          {!c.off && (
                            <OpButton
                              team={t}
                              i={i}
                              slot="p"
                              value={c.primary}
                              days={days}
                              openMenu={openMenu}
                            />
                          )}
                        </td>
                        <td className="s">
                          {!c.off && (
                            <OpButton
                              team={t}
                              i={i}
                              slot="s"
                              value={c.secondary}
                              days={days}
                              openMenu={openMenu}
                            />
                          )}
                        </td>
                      </>
                    ) : c.off ? (
                      <td colSpan={3} className="off">
                        Rostered day off
                        {breach(t.id, i)}
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
                          {breach(t.id, i)}
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
function DayTiles({
  week,
  days,
  today,
  teams,
  dim,
  warn,
  breach,
  edit,
  openMenu,
}: Ctx) {
  const ed = !!edit?.editable;
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
                className={`tcv-tl ${bl ? "tcv-blend merged" : "tcv-team"} ${c.off ? "off" : ""} ${dim(c)} ${ed ? "tcv-tl-edit" : ""} ${ed && (edit!.changed.has(`${t.id}-${i}`) || (bl && edit!.changed.has(`surv2-${i}`))) ? "tcv-changed-cell" : ""}`}
                style={bl ? undefined : teamStyle(t)}
                {...(ed
                  ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-label": `Edit ${bl ? "Team 1 + Team 2" : t.label} ${d.name}`,
                      // Capture: the tap opens the editor and does not also
                      // highlight the operation whose name was under the finger.
                      onClickCapture: (e: ReactMouseEvent<HTMLDivElement>) => {
                        if ((e.target as HTMLElement).closest(".tcv-breach"))
                          return;
                        e.stopPropagation();
                        openMenu({
                          teamId: t.id,
                          dayIndex: i,
                          label: bl
                            ? `T1 + T2 · ${d.name}`
                            : cellLabel(t, days, i),
                          rect: e.currentTarget.getBoundingClientRect(),
                          full: true,
                        });
                      },
                      onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openMenu({
                            teamId: t.id,
                            dayIndex: i,
                            label: bl
                              ? `T1 + T2 · ${d.name}`
                              : cellLabel(t, days, i),
                            rect: e.currentTarget.getBoundingClientRect(),
                            full: true,
                          });
                        }
                      },
                    }
                  : {})}
              >
                <i />
                <div className="tcv-tl-body">
                  <div className="tcv-tl-team">
                    <span>{bl ? "T1 + T2 combined" : t.label}</span>
                    {breach(t.id, i)}
                    {bl && breach("surv2", i)}
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
  /** Which operation list opens first (default the primary one). */
  slot?: "p" | "s";
  /** The whole editor (shift, both operations, split) rather than one list. */
  full?: boolean;
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
      openMenu({
        teamId,
        dayIndex,
        label,
        rect: el.getBoundingClientRect(),
        full: true,
      });
  };
  /** A press starts at x. Shared by the mouse / pen (pointer events) and a
   * finger (touch events, below). */
  const begin = (x: number) => {
    const el = ref.current;
    if (!canEdit || !el) return;
    drag.current = {
      x0: x,
      s0: start ?? 0,
      w: el.parentElement?.getBoundingClientRect().width || 1,
      moved: false,
      next: null,
      left: el.style.left,
      width: el.style.width,
      start: start ?? 0,
    };
  };
  const track = (x: number) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || !canSlide || start === null || len === null) return;
    const dx = x - d.x0;
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
  /** The press ended: a click, a slide to hand over, or (cancelled) put back. */
  const finish = (cancelled: boolean) => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!d || !el) return;
    if (cancelled) {
      restore(el, d);
      return;
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
  // Mouse and pen: pointer events with the pointer captured. A finger is left
  // to the touch events below (pointer events from a finger are cancelled as
  // soon as the browser starts to scroll, which on an iPhone / iPad is most
  // drags: the bar was "grabbed" but never moved).
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    ref.current?.setPointerCapture(e.pointerId);
    begin(e.clientX);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") track(e.clientX);
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    try {
      ref.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    finish(false);
  };
  const pointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") finish(true);
  };

  // A finger: touch events, so the slide does not depend on how the browser
  // treats `touch-action`. The direction is decided from the first few pixels:
  // sideways slides the bar (and stops the page scrolling, which needs a
  // non-passive listener); up or down is left to scroll the page; a tap opens
  // the operation menu.
  const live = useRef({ begin, track, finish });
  live.current = { begin, track, finish };
  useEffect(() => {
    const el = ref.current;
    if (!el || !canEdit) return;
    let t: { id: number; x: number; y: number; intent: "" | "x" | "y" } | null =
      null;
    const onStart = (e: globalThis.TouchEvent) => {
      if (e.touches.length !== 1) {
        if (t && t.intent !== "y") live.current.finish(true);
        t = null;
        return;
      }
      const p = e.touches[0];
      t = { id: p.identifier, x: p.clientX, y: p.clientY, intent: "" };
      live.current.begin(p.clientX);
    };
    const onMove = (e: globalThis.TouchEvent) => {
      if (!t || t.intent === "y") return;
      const p = Array.from(e.touches).find(q => q.identifier === t!.id);
      if (!p) return;
      if (!t.intent) {
        const dx = p.clientX - t.x;
        const dy = p.clientY - t.y;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        t.intent = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (t.intent === "y") {
          live.current.finish(true); // scrolling the page, not sliding
          return;
        }
      }
      if (e.cancelable) e.preventDefault(); // no page scroll while sliding
      live.current.track(p.clientX);
    };
    const onEnd = (e: globalThis.TouchEvent) => {
      if (!t) return;
      const was = t;
      t = null;
      if (was.intent === "y") return;
      // Handled here: no second (mouse) click after the finger lifts.
      if (e.cancelable && e.type === "touchend") e.preventDefault();
      live.current.finish(e.type === "touchcancel");
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [canEdit]);

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
            onPointerCancel: pointerCancel,
            // No browser text selection or drag image while sliding.
            onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
            onDragStart: (e: React.DragEvent) => e.preventDefault(),
            onKeyDown: key,
            // A click on the operation's name opens this menu, it does not
            // also highlight the operation.
            // (Not for an EA breach dot or its popover, which have their own click.)
            onClickCapture: (e: React.MouseEvent) => {
              const t = e.target as HTMLElement;
              if (!e.currentTarget.contains(t) || t.closest(".tcv-breach"))
                return;
              e.stopPropagation();
            },
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
  const full = !!target.full;
  const [slot, setSlot] = useState<"p" | "s">(target.slot ?? "p");
  const cell = week[target.teamId]?.[target.dayIndex];
  const current = (slot === "p" ? cell?.primary : cell?.secondary) ?? "";
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
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [customShift, setCustomShift] = useState("");
  const [badShift, setBadShift] = useState(false);
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
      ?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", scrolled, true);
    };
  }, [onClose]);
  const width = full ? 300 : 232;
  const height = full ? 520 : 340;
  const left = Math.max(
    8,
    Math.min(
      window.innerWidth - width - 8,
      target.rect.left + target.rect.width / 2 - width / 2
    )
  );
  const below = target.rect.bottom + 6;
  const top =
    below + height > window.innerHeight
      ? Math.max(8, target.rect.top - height - 6)
      : below;
  const pick = (op: string, other?: string) => {
    (slot === "p" ? edit.onOp : edit.onSecond)(
      target.teamId,
      target.dayIndex,
      op,
      other
    );
    onClose();
  };
  const shiftNow = canonShift(cell?.shift ?? "");
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
      className={`tcv-menu${full ? " tcv-menu-full" : ""}`}
      role="menu"
      aria-label={`Operation for ${target.label}`}
      style={{ left, top, maxHeight: `min(${height}px, calc(100vh - 16px))` }}
    >
      <div className="tcv-menu-h">
        {full ? target.label : `Operation · ${target.label}`}
      </div>
      {full && (
        <div className="tcv-menu-sec" role="group" aria-label="Shift">
          <div className="tcv-menu-lbl">
            Shift
            {hoursOf(shiftNow) && (
              <span> · {hoursOf(shiftNow).replace(" h", " hours")}</span>
            )}
          </div>
          <div className="tcv-chips">
            {["RDO", ...(SHIFT_PRESETS as readonly string[])].map(v => (
              <button
                key={v}
                type="button"
                aria-pressed={shiftNow === v}
                onClick={() => edit.onShift(target.teamId, target.dayIndex, v)}
              >
                {v === "RDO" ? "RDO" : formatShiftText(v)}
                <small>{v === "RDO" ? "Day off" : hoursOf(v)}</small>
              </button>
            ))}
          </div>
          <form
            className="tcv-menu-other"
            onSubmit={e => {
              e.preventDefault();
              const v = customShift.trim();
              if (shiftLength(v) === null) {
                setBadShift(true);
                return;
              }
              setBadShift(false);
              edit.onShift(target.teamId, target.dayIndex, canonShift(v));
              setCustomShift("");
            }}
          >
            <input
              value={customShift}
              onChange={e => {
                setCustomShift(e.target.value);
                setBadShift(false);
              }}
              placeholder="Custom, e.g. 0800-1600"
              aria-label="Custom shift"
            />
            <button type="submit">Apply</button>
          </form>
          {badShift && (
            <p className="tcv-menu-bad">
              Use a start and finish such as 0800-1600.
            </p>
          )}
          <div
            className="tcv-menu-tabs"
            role="group"
            aria-label="Which operation"
          >
            <button
              type="button"
              aria-pressed={slot === "p"}
              onClick={() => setSlot("p")}
            >
              Operation
            </button>
            <button
              type="button"
              aria-pressed={slot === "s"}
              onClick={() => setSlot("s")}
            >
              Second operation
            </button>
          </div>
        </div>
      )}
      {creating ? (
        <form
          className="tcv-menu-other"
          onSubmit={e => {
            e.preventDefault();
            const v = newName.trim();
            if (!v || busy) return;
            setBusy(true);
            void edit.onCreateOp(v).then(made => {
              setBusy(false);
              if (made) pick(made);
            });
          }}
        >
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New operation name…"
            aria-label="New operation name"
          />
          <button type="submit" disabled={!newName.trim() || busy}>
            Create
          </button>
        </form>
      ) : (
        <button
          type="button"
          role="menuitem"
          className="tcv-menu-create"
          onClick={() => {
            setCreating(true);
            setTyping(false);
          }}
        >
          + Create operation…
        </button>
      )}
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
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setTyping(true);
            setCreating(false);
          }}
        >
          Other (free text)…
        </button>
      )}
      {item("None", current === "", () => pick(""))}
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
      {full && (
        <>
          <hr />
          <button type="button" className="tcv-menu-done" onClick={onClose}>
            Done
          </button>
        </>
      )}
    </div>,
    document.body
  );
}

/** "4/5" at the end of a Timeline bar: the team's people rostered on duty that
 * day (counted the way Outlook does) over its minimum; red below the minimum. */
function TeamCount({
  counts,
  teamId,
  dayIndex,
  prefix = "",
}: {
  counts?: Ctx["counts"];
  teamId: string;
  dayIndex: number;
  prefix?: string;
}) {
  const c = counts?.[`${teamId}-${dayIndex}`];
  if (!c) return null;
  return (
    <span className={`tcv-count${c.onDuty < c.min ? " short" : ""}`}>
      {prefix}
      {c.onDuty}/{c.min}
    </span>
  );
}

/** The counts as words for a bar's tooltip. */
function countTitle(
  counts: Ctx["counts"],
  teamIds: string[],
  dayIndex: number
): string {
  const parts = teamIds
    .map(id => {
      const c = counts?.[`${id}-${dayIndex}`];
      return c ? `${c.onDuty} of ${c.min} on duty` : "";
    })
    .filter(Boolean);
  return parts.length ? `. ${parts.join(", ")}` : "";
}

/** Timeline (hours across, a lane for each team) */
function Timeline({
  week,
  days,
  today,
  teams,
  dim,
  warn,
  breach,
  edit,
  counts,
  openMenu,
}: Ctx) {
  const [lo, hi0] = timelineSpan(week);
  // Editable: always reach midnight, so a bar slid to a 23:00 start has room.
  const hi = edit?.editable ? Math.max(hi0, 24 * 60) : hi0;
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
            breach={breach}
            edit={edit}
            counts={counts}
            openMenu={openMenu}
          />
        ))}
      </div>
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
  breach,
  edit,
  counts,
  openMenu,
}: {
  counts?: Ctx["counts"];
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
  breach: Ctx["breach"];
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
              className={`tcv-bar ${bl ? "tcv-blend merged" : "tcv-team"} ${dim(c)}${breach(t.id, i) || (bl && breach("surv2", i)) ? " has-breach" : ""}`}
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
              title={`${bl ? "Team 1 + Team 2" : t.label} ${formatShiftText(c.shift)}${countTitle(counts, bl ? ["surv1", "surv2"] : [t.id], i)}`}
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
                  {breach("surv1", i, "top")}
                  {breach("surv2", i, "bottom")}
                  <span className="tcv-count-pair">
                    <TeamCount
                      counts={counts}
                      teamId="surv1"
                      dayIndex={i}
                      prefix="T1 "
                    />
                    <TeamCount
                      counts={counts}
                      teamId="surv2"
                      dayIndex={i}
                      prefix="T2 "
                    />
                  </span>
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
                  <TeamCount counts={counts} teamId={t.id} dayIndex={i} />
                  {breach(t.id, i)}
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
  counts,
  breaches,
  breachCount = 0,
  onOpenRoster,
  toolbarAction,
}: {
  /** A button for the Highlight line, on the right beside the view picker
   * (the page puts Edit Tasking here). */
  toolbarAction?: ReactNode;
  /** EA breaches by `team-day` (see shared/taskingBreaches.ts); shown to
   * everyone who can see the calendar. Screen only, not in the PDF. */
  breaches?: Record<string, BreachItem[] | undefined>;
  /** How many distinct EA breaches the week has (the header chip). */
  breachCount?: number;
  /** Open the roster at a day of this week. */
  onOpenRoster?: (dayIndex: number) => void;
  /** Admin editing on the Timeline (slide a bar, pick an operation). */
  edit?: TimelineEdit;
  /** People rostered on duty against the team's minimum for each `team-day`
   * (as Outlook counts them); the Timeline shows it at the end of each bar. */
  counts?: Record<string, { onDuty: number; min: number } | undefined>;
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
  const [menu, setMenu] = useState<BarMenuTarget | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const editable = !!edit?.editable;
  useEffect(() => {
    if (!editable) setMenu(null);
  }, [editable]);

  const ids = useMemo(() => teams.map(t => t.id), [teams]);
  const week = useMemo(() => readWeek(grid, ids), [grid, ids]);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const today = todayIndex(weekStart, localISO());
  const ops = useMemo(() => weekOps(week), [week]);
  const focus = focusRaw && ops.includes(focusRaw) ? focusRaw : null;

  const toggle = (name: string) => setFocus(f => (f === name ? null : name));
  const ctx: Ctx = {
    edit,
    openMenu: setMenu,
    counts,
    week,
    days,
    today,
    teams,
    focus,
    dim: c => (focus && !cellHasOp(c, focus) ? "tcv-dim" : ""),
    warn: renderWarning,
    breach: (teamId, dayIndex, slot) => {
      const items = breaches?.[`${teamId}-${dayIndex}`];
      if (!items || items.length === 0) return null;
      const team = teams.find(t => t.id === teamId);
      const d = days[dayIndex];
      return (
        <BreachDot
          items={items}
          heading={`${team?.label ?? teamId} · ${d.name} ${String(d.day).padStart(2, "0")} ${d.month}`}
          dayName={d.name}
          className={slot ? `slot-${slot}` : ""}
          onOpenRoster={onOpenRoster ? () => onOpenRoster(dayIndex) : undefined}
        />
      );
    },
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
          {breachCount > 0 && (
            <Badge
              variant="outline"
              className="gap-1 text-red-600 border-red-500/40 bg-red-500/5"
              data-testid="tasking-breach-chip"
            >
              <ShieldAlert className="h-3 w-3" />
              {breachCount} EA breach{breachCount !== 1 ? "es" : ""}
            </Badge>
          )}
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
      </div>

      {/* The Highlight line: the operation chips on the left; Edit Tasking and
          the view picker on the right (one equal-height row; on a phone the
          picker takes the rest of the width beside the button). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {ops.length > 0 ? (
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
        ) : (
          <span />
        )}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {toolbarAction}
          <div className="min-w-0 flex-1 sm:w-[270px] sm:flex-none">
            <Select
              value={view}
              onValueChange={v => {
                if (isTaskingView(v)) setView(v);
              }}
            >
              <SelectTrigger className="w-full" aria-label="Calendar view">
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
        </div>
      </div>
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
          05:00 to 23:00). Click a bar to change its shift, operations or
          blending.
        </p>
      )}

      <ToggleOp.Provider value={toggle}>
        {view === "panel-banded" && <PanelBanded {...ctx} />}
        {view === "panel-tables" && <PanelTables {...ctx} />}
        {view === "tile-days" && <DayTiles {...ctx} />}
        {view === "cal-timeline" && <Timeline {...ctx} />}
      </ToggleOp.Provider>
      {edit?.editable && menu && (
        <BarMenu target={menu} week={week} edit={edit} onClose={closeMenu} />
      )}
    </section>
  );
}
