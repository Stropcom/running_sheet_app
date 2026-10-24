/**
 * Places Report (Intelligence → Reports): where a target goes — home, work,
 * gym, cafe… — and how often, how long, and on which days.
 *
 * Every rule that decides what a place is called or how long a visit lasted is
 * a pure function here, so it is tested directly (server/placesReport.test.ts)
 * and runs the same on the server (which builds the visits) and in the page
 * (which filters them by period). Deterministic and offline — no AI, no
 * guessing: a place nothing recognises stays "Other".
 */
import { placeSignOfName, PLACE_SIGN_ICONS } from "./placeSigns";
import type { PlaceSignIcon } from "./placeSigns";
import { transitSignIconOf } from "./transitPlace";

// ── Kinds of place ───────────────────────────────────────────────────────────

export const PLACE_KINDS = [
  { id: "home", label: "Home" },
  { id: "work", label: "Work" },
  { id: "gym", label: "Gym" },
  { id: "food", label: "Cafe & food" },
  { id: "shop", label: "Shopping" },
  { id: "travel", label: "Travel" },
  { id: "leisure", label: "Stay & leisure" },
  { id: "services", label: "Bank & post" },
  { id: "registered", label: "Registered address" },
  { id: "other", label: "Other" },
] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number]["id"];
export const PLACE_KIND_IDS = PLACE_KINDS.map(k => k.id) as [
  PlaceKind,
  ...PlaceKind[],
];
/** Kinds an officer may pick when labelling a place ("registered" is only ever
 * a registry address that nothing else names). */
export const LABELLABLE_KINDS = PLACE_KINDS.filter(
  k => k.id !== "registered"
).map(k => k.id) as [PlaceKind, ...PlaceKind[]];

export function placeKindLabel(kind: PlaceKind): string {
  return PLACE_KINDS.find(k => k.id === kind)?.label ?? "Other";
}

/** Where the kind came from — shown on the row so nobody has to wonder. */
export type PlaceKindSource =
  | "registry-home" // the target's registered home address
  | "registry-label" // a registered address with a label an officer typed
  | "registry-generic" // a registered address still called "Address N"
  | "sign" // the place's name (or the sign saved for it from Google)
  | "officer" // an officer labelled it on this report
  | "none"; // nothing recognises it

const SIGN_KIND: Record<
  PlaceSignIcon | "bus_stop" | "train_station",
  PlaceKind
> = {
  place_bank: "services",
  place_post_office: "services",
  place_pub: "leisure",
  place_hotel: "leisure",
  place_gym: "gym",
  place_shopping_centre: "shop",
  place_supermarket: "shop",
  place_hardware: "shop",
  place_park: "leisure",
  place_cafe: "food",
  place_restaurant: "food",
  place_fast_food: "food",
  place_airport: "travel",
  bus_stop: "travel",
  train_station: "travel",
};

/**
 * What a place's name says it is. A sign saved for the place (Google's type,
 * picked from the address suggestions, or an officer's own choice) wins; else
 * the same name rules the map signs use. null when neither says.
 */
export function kindOfPlaceName(
  name: string,
  savedSign?: string | null
): PlaceKind | null {
  if (savedSign && (PLACE_SIGN_ICONS as string[]).includes(savedSign)) {
    return SIGN_KIND[savedSign as PlaceSignIcon];
  }
  const sign = placeSignOfName(name);
  if (sign) return SIGN_KIND[sign];
  const transit = transitSignIconOf(name);
  return transit ? SIGN_KIND[transit] : null;
}

// ── Registered addresses ─────────────────────────────────────────────────────

/** "Address 2", "Additional Address 3", "" — a label nobody chose. */
export function isGenericAddressLabel(label: string | null | undefined) {
  const t = (label ?? "").trim();
  return t === "" || /^(?:additional\s+)?address\s*\d*$/i.test(t);
}

/** What an officer's own label on a registered address means, when it plainly
 * names a kind ("Work", "Workplace", "Office", "Gym"…). A label that is
 * something else ("Girlfriend's", "Safehouse") means nothing here and is shown
 * as written. */
export function kindOfRegisteredLabel(label: string): PlaceKind | null {
  const t = label.trim().toLowerCase();
  if (/^(?:work|workplace|work address|office|place of work|employer)$/.test(t))
    return "work";
  if (/^(?:home|home address|residence|primary)$/.test(t)) return "home";
  if (/^gym$/.test(t)) return "gym";
  return null;
}

export interface RegisteredAddressRef {
  /** "home" = the target's own address (HBF); "extra" = Address 2, 3… */
  slot: "home" | "extra";
  /** Number as printed on the card: 2, 3… (extra only). */
  number?: number;
  /** What the officer typed for an extra address; "" when nothing. */
  label: string;
}

export interface PlaceClassification {
  kind: PlaceKind;
  source: PlaceKindSource;
  /** What the registry calls it ("Work", "Address 3") — shown as its own
   * pill when it differs from the kind. null when not registered. */
  registeredAs: string | null;
}

/**
 * The one rule for "what is this place called?":
 *  1. An officer's label on this report wins — it is a deliberate choice.
 *  2. The target's registered home address is Home.
 *  3. A registered address an officer gave a label keeps that label ("Work"
 *     counts as Work; "Girlfriend's" stays as written, under Registered).
 *  4. A registered address still called "Address N" gives way to a name the
 *     place has — if Google or the name rules know it as a Gym, it is a Gym —
 *     and only stays "Address N" when nothing names it.
 *  5. Any other place is what its name says, else Other.
 */
export function classifyPlace(input: {
  name: string;
  savedSign?: string | null;
  registered?: RegisteredAddressRef | null;
  officerKind?: PlaceKind | null;
}): PlaceClassification {
  const { name, savedSign, registered, officerKind } = input;
  const registeredAs = registered
    ? registered.slot === "home"
      ? "Home"
      : isGenericAddressLabel(registered.label)
        ? `Address ${registered.number ?? ""}`.trim()
        : registered.label.trim()
    : null;
  if (officerKind) {
    return { kind: officerKind, source: "officer", registeredAs };
  }
  if (registered?.slot === "home") {
    return { kind: "home", source: "registry-home", registeredAs };
  }
  const named = kindOfPlaceName(name, savedSign);
  if (registered) {
    if (!isGenericAddressLabel(registered.label)) {
      return {
        kind: kindOfRegisteredLabel(registered.label) ?? "registered",
        source: "registry-label",
        registeredAs,
      };
    }
    if (named) return { kind: named, source: "sign", registeredAs };
    return { kind: "registered", source: "registry-generic", registeredAs };
  }
  if (named) return { kind: named, source: "sign", registeredAs: null };
  return { kind: "other", source: "none", registeredAs: null };
}

// ── Visits ───────────────────────────────────────────────────────────────────

export type VisitDirection = "arrived" | "departed" | "neutral";

/** One row of a sheet that puts the target at a place. */
export interface PlaceMention {
  placeKey: string;
  sheetId: number;
  sheetTitle: string;
  /** Position of the row on its sheet — rows are read in this order. */
  order: number;
  rowId: number;
  /** YYYY-MM-DD (Perth) the row happened on. */
  dateISO: string;
  timeMinutes: number;
  direction: VisitDirection;
}

export interface PlaceVisit {
  placeKey: string;
  sheetId: number;
  sheetTitle: string;
  rowId: number;
  dateISO: string;
  /** Minutes after midnight the target arrived; null when the sheet starts
   * with them already leaving (no arrival was logged). */
  startMinutes: number | null;
  /** Minutes after midnight they left, only when a row at that place says so;
   * null = no departure logged. */
  endMinutes: number | null;
  /** Whole days after the start day the departure fell on (0 = same day). */
  endDayOffset: number;
  /** Time there in minutes — only when both ends are logged. */
  dwellMinutes: number | null;
}

function dayNumber(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Turns the rows that put the target at places into visits. Same idea as the
 * Heat Map's visit collapsing (entityAttribution.collapseToVisits): within a
 * sheet, in row order, consecutive rows at the same place are one visit, and a
 * different place in between starts a new one.
 *
 * Time there is only counted when the sheet says the target left: a row at
 * that place reading "departed / left / exited". If it doesn't, the visit
 * stands but its time is left blank — a gap is shown as a gap, never filled
 * with a guess. A row that reads as both arriving and leaving is "neutral" and
 * is never used as either end.
 */
export function buildVisits(mentions: readonly PlaceMention[]): PlaceVisit[] {
  const bySheet = new Map<number, PlaceMention[]>();
  for (const m of mentions) {
    if (!bySheet.has(m.sheetId)) bySheet.set(m.sheetId, []);
    bySheet.get(m.sheetId)!.push(m);
  }
  const visits: PlaceVisit[] = [];
  for (const sheetMentions of Array.from(bySheet.values())) {
    const ordered = [...sheetMentions].sort((a, b) => a.order - b.order);
    let run: PlaceMention[] = [];
    const flush = () => {
      if (!run.length) return;
      const first = run[0];
      const startKnown = first.direction !== "departed";
      // The departure: the first "departed" row after the arrival (or the
      // first row itself when the run opens with them leaving).
      const leaving = run.find(
        (m, i) => m.direction === "departed" && (i > 0 || !startKnown)
      );
      let dwell: number | null = null;
      let endDayOffset = 0;
      if (startKnown && leaving) {
        const startAbs = dayNumber(first.dateISO) * 1440 + first.timeMinutes;
        const endAbs = dayNumber(leaving.dateISO) * 1440 + leaving.timeMinutes;
        if (endAbs >= startAbs) {
          dwell = endAbs - startAbs;
          endDayOffset = dayNumber(leaving.dateISO) - dayNumber(first.dateISO);
        }
      }
      visits.push({
        placeKey: first.placeKey,
        sheetId: first.sheetId,
        sheetTitle: first.sheetTitle,
        rowId: first.rowId,
        dateISO: first.dateISO,
        startMinutes: startKnown ? first.timeMinutes : null,
        endMinutes:
          leaving && (dwell !== null || !startKnown)
            ? leaving.timeMinutes
            : null,
        endDayOffset,
        dwellMinutes: dwell,
      });
      run = [];
    };
    for (const m of ordered) {
      if (run.length && run[0].placeKey !== m.placeKey) flush();
      run.push(m);
    }
    flush();
  }
  return visits;
}

// ── Summaries (what the page shows) ──────────────────────────────────────────

export interface PlaceRecord {
  placeKey: string;
  name: string;
  kind: PlaceKind;
  source: PlaceKindSource;
  registeredAs: string | null;
  visits: PlaceVisit[];
}

export interface PlaceSummary {
  placeKey: string;
  name: string;
  kind: PlaceKind;
  source: PlaceKindSource;
  registeredAs: string | null;
  visits: PlaceVisit[];
  /** Visits with a logged departure — only these have a time. */
  timedVisits: number;
  noDeparture: number;
  totalMinutes: number;
  averageMinutes: number | null;
  /** Visits per weekday, Monday first (index 0 = Mon … 6 = Sun). */
  week: number[];
  /** Weekdays that carry at least 40% of the busiest day's visits. */
  usualDays: number[];
  /** Median arrival, minutes after midnight; null when no arrival is logged. */
  usualMinutes: number | null;
  firstDateISO: string;
  lastDateISO: string;
  /** First seen inside the last 7 days of the report's period. */
  isNew: boolean;
}

export function weekdayIndex(dateISO: string): number {
  // 1970-01-01 was a Thursday; Monday = 0.
  return (((dayNumber(dateISO) + 3) % 7) + 7) % 7;
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date((dayNumber(dateISO) + days) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Summarises places for a period. `sinceISO` is the first day included (null =
 * everything) and `todayISO` is the last day of the report, from which "new
 * this week" is measured.
 */
export function summarisePlaces(
  places: readonly PlaceRecord[],
  opts: { sinceISO: string | null; todayISO: string }
): PlaceSummary[] {
  const newFrom = addDaysISO(opts.todayISO, -6);
  const out: PlaceSummary[] = [];
  for (const p of places) {
    const visits = p.visits
      .filter(v => (opts.sinceISO ? v.dateISO >= opts.sinceISO : true))
      .sort(
        (a, b) =>
          a.dateISO.localeCompare(b.dateISO) ||
          (a.startMinutes ?? -1) - (b.startMinutes ?? -1)
      );
    if (!visits.length) continue;
    const timed = visits.filter(v => v.dwellMinutes !== null);
    const total = timed.reduce((s, v) => s + (v.dwellMinutes ?? 0), 0);
    const week = [0, 0, 0, 0, 0, 0, 0];
    for (const v of visits) week[weekdayIndex(v.dateISO)]++;
    const peak = Math.max(...week);
    const usualDays = week
      .map((n, i) => (n > 0 && n >= peak * 0.4 ? i : -1))
      .filter(i => i >= 0);
    const starts = visits
      .map(v => v.startMinutes)
      .filter((m): m is number => m !== null)
      .sort((a, b) => a - b);
    const first = visits.reduce(
      (m, v) => (v.dateISO < m ? v.dateISO : m),
      visits[0].dateISO
    );
    const last = visits.reduce(
      (m, v) => (v.dateISO > m ? v.dateISO : m),
      visits[0].dateISO
    );
    // "New" means the very first visit on record falls in the last 7 days —
    // judged on all of the place's visits, not just this period's.
    const everFirst = p.visits.reduce(
      (m, v) => (v.dateISO < m ? v.dateISO : m),
      p.visits[0].dateISO
    );
    out.push({
      placeKey: p.placeKey,
      name: p.name,
      kind: p.kind,
      source: p.source,
      registeredAs: p.registeredAs,
      visits,
      timedVisits: timed.length,
      noDeparture: visits.filter(
        v => v.dwellMinutes === null && v.endMinutes === null
      ).length,
      totalMinutes: total,
      averageMinutes: timed.length ? Math.round(total / timed.length) : null,
      week,
      usualDays,
      usualMinutes: starts.length
        ? starts[Math.floor(starts.length / 2)]
        : null,
      firstDateISO: first,
      lastDateISO: last,
      isNew: everFirst >= newFrom,
    });
  }
  return out;
}

export type PlaceSort = "visits" | "time" | "recent" | "first";

export function sortPlaces(
  list: PlaceSummary[],
  sort: PlaceSort
): PlaceSummary[] {
  const by: Record<PlaceSort, (a: PlaceSummary, b: PlaceSummary) => number> = {
    visits: (a, b) =>
      b.visits.length - a.visits.length || b.totalMinutes - a.totalMinutes,
    time: (a, b) =>
      b.totalMinutes - a.totalMinutes || b.visits.length - a.visits.length,
    recent: (a, b) =>
      b.lastDateISO.localeCompare(a.lastDateISO) ||
      b.visits.length - a.visits.length,
    first: (a, b) => b.firstDateISO.localeCompare(a.firstDateISO),
  };
  return [...list].sort(
    (a, b) => by[sort](a, b) || a.name.localeCompare(b.name)
  );
}

// ── Display helpers (shared by the page and its PDF) ─────────────────────────

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatDwell(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")} min` : `${h} h`;
}

export function formatClock(minutes: number): string {
  const t = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
