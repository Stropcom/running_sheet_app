import {
  createContext,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
} from "@/lib/taskingViewPref";
import {
  cellHasOp,
  formatShiftText,
  readWeek,
  timelineSpan,
  todayIndex,
  weekDays,
  weekOps,
  weekSummary,
  type DayCell,
  type TaskingCellInput,
} from "@shared/taskingView";
import "./taskingViews.css";

export interface TaskingTeam {
  id: string;
  label: string;
  /** Short form for pills: T1, T2, PTT, CAP. */
  ab: string;
  colour: string;
}

interface Ctx {
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
                return (
                  <div
                    key={i}
                    className={`tcv-pa-col ${i > 4 ? "wk" : ""} ${dim(c)}`}
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
                return (
                  <tr key={i} className={`${i > 4 ? "wk" : ""} ${dim(c)}`}>
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
            return (
              <div
                key={t.id}
                className={`tcv-tl tcv-team ${c.off ? "off" : ""} ${dim(c)}`}
                style={teamStyle(t)}
              >
                <i />
                <div className="tcv-tl-body">
                  <div className="tcv-tl-team">{t.label}</div>
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

/** Timeline (hours across, a lane for each team) */
function Timeline({ week, days, today, teams, dim, warn }: Ctx) {
  const [lo, hi] = timelineSpan(week);
  const ticks: number[] = [];
  for (let m = lo; m <= hi; m += 120) ticks.push(m);
  const pct = (m: number) => ((m - lo) / (hi - lo)) * 100;
  return (
    <div className="tcv-card tcv-scroll">
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
            dim={dim}
            warn={warn}
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
  dim,
  warn,
}: {
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
          const top = 8 + li * 21;
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
            <div
              key={t.id}
              className={`tcv-bar tcv-team ${dim(c)}`}
              style={{
                ...teamStyle(t),
                left: `${pct(c.range[0])}%`,
                width: `${pct(c.range[1]) - pct(c.range[0])}%`,
                top,
              }}
              title={`${t.label} ${formatShiftText(c.shift)}`}
            >
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
            </div>
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
}: {
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
  const [view, setView] = useTaskingView();
  const [focusRaw, setFocus] = useState<string | null>(null);

  const ids = useMemo(() => teams.map(t => t.id), [teams]);
  const week = useMemo(() => readWeek(grid, ids), [grid, ids]);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const today = todayIndex(weekStart, localISO());
  const ops = useMemo(() => weekOps(week), [week]);
  const focus = focusRaw && ops.includes(focusRaw) ? focusRaw : null;

  const toggle = (name: string) => setFocus(f => (f === name ? null : name));
  const ctx: Ctx = {
    week,
    days,
    today,
    teams,
    focus,
    dim: c => (focus && !cellHasOp(c, focus) ? "tcv-dim" : ""),
    warn: renderWarning,
  };

  return (
    <section className="space-y-3">
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
            {TASKING_VIEWS.map(v => (
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

      <ToggleOp.Provider value={toggle}>
        {view === "panel-banded" && <PanelBanded {...ctx} />}
        {view === "panel-tables" && <PanelTables {...ctx} />}
        {view === "tile-days" && <DayTiles {...ctx} />}
        {view === "cal-timeline" && <Timeline {...ctx} />}
      </ToggleOp.Provider>
    </section>
  );
}
