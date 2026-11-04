/**
 * Blended days in the CTO Weekly Tasking: a day where Surveillance Team 1 and
 * Team 2 work as one combined team.
 *
 * It is stored as two ordinary cells with a flag. The "surv1" and "surv2" cells
 * of the day both carry `blended` and the same shift and tasks, so everything
 * that reads a team's day (the roster minimum check, the summaries, the posted
 * notice) still sees each team tasked as before. A day only counts as blended
 * when BOTH cells carry the flag. Pure and tested (server/taskingBlend.test.ts);
 * used by the edit grid, the calendar layouts and the PDF alike.
 */
import type { DayCell, TaskingCellInput } from "./taskingView";

/** The two teams that can be blended, in the order they are shown. */
export const BLEND_TEAMS = ["surv1", "surv2"] as const;
export type BlendTeam = (typeof BLEND_TEAMS)[number];

export const isBlendTeam = (id: string): id is BlendTeam =>
  (BLEND_TEAMS as readonly string[]).includes(id);

/** The other team of the pair. */
export const blendPartner = (id: BlendTeam): BlendTeam =>
  id === "surv1" ? "surv2" : "surv1";

/** The shift a cell is on: its custom time when "Custom" is picked. */
export function cellShift(cell: TaskingCellInput | undefined): string {
  if (!cell) return "";
  const s =
    cell.shiftTime === "Custom" ? (cell.customTime ?? "") : cell.shiftTime;
  return (s ?? "").trim();
}

/** True when day `i` is blended for the week (both teams flagged). */
export function isBlendDay(week: Record<string, DayCell[]>, i: number) {
  return week.surv1?.[i]?.blended === true && week.surv2?.[i]?.blended === true;
}

/**
 * Whether to ask "blend the teams?" after a shift was set: both teams are on the
 * same working shift (not RDO, not blank), the day is not already blended, and
 * the answer was not already No for this very shift.
 */
export function shouldAskBlend(input: {
  surv1: TaskingCellInput | undefined;
  surv2: TaskingCellInput | undefined;
  /** The shift the supervisor already said No to for this day, if any. */
  declinedShift: string | null;
}): boolean {
  const { surv1, surv2, declinedShift } = input;
  if (surv1?.blended === true && surv2?.blended === true) return false;
  const a = cellShift(surv1);
  const b = cellShift(surv2);
  if (!a || a !== b || a === "RDO") return false;
  return declinedShift !== a;
}

/** The tasks the two teams would carry if blended, to show the choice. */
export function tasksDiffer(
  a: TaskingCellInput | undefined,
  b: TaskingCellInput | undefined
): boolean {
  const t = (c: TaskingCellInput | undefined) =>
    [
      c?.primaryTask === "Other" ? c.primaryOther : c?.primaryTask,
      c?.secondaryTask === "Other" ? c.secondaryOther : c?.secondaryTask,
    ].map(x => (x ?? "").trim());
  const x = t(a);
  const y = t(b);
  return x[0] !== y[0] || x[1] !== y[1];
}

/** The fields a blended day shares, copied from the cell that is kept. */
export function blendFields(source: TaskingCellInput | undefined) {
  return {
    shiftTime: source?.shiftTime ?? null,
    customTime: source?.customTime ?? undefined,
    primaryTask: source?.primaryTask ?? null,
    primaryOther: source?.primaryOther ?? undefined,
    secondaryTask: source?.secondaryTask ?? null,
    secondaryOther: source?.secondaryOther ?? undefined,
  };
}
