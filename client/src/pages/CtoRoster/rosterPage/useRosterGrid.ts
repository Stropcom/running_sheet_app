// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): scrolling, zoom, the date window, drag-to-scroll and month navigation.
// The page used to be one 1,900-line function; its state, effects and handlers are now step
// hooks (called in order by useRosterScreen) and its layout is RosterView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import {} from "@/components/roster/RosterTeamFrame";
import {
  getRosterZoom,
  setRosterZoom,
  subscribeRosterZoom,
  useCollapsedTeams,
} from "@/lib/rosterZoomPref";
import { useTeamColour } from "@/lib/teams";
import {
  WINDOW_BLOCK,
  dateWindowFor,
  dayIndexAtScroll,
  scrollLeftForDay,
  labelsHidden,
  stepZoom,
  windowSpacers,
} from "@shared/rosterZoom";
import { useAuth } from "@/_core/hooks/useAuth";
import { useIsMobile } from "@/hooks/useMobile";
import {
  registerRosterToday,
  setRosterFullscreen,
  useRosterFullscreen,
} from "@/lib/rosterFullscreen";
import { format } from "date-fns";
import { safeFormat } from "./helpers";
import {
  MONTHS,
  ROSTER_START_DATE,
  ROSTER_END_DATE,
  ALL_DATES,
  TOTAL_DAYS,
} from "./gridConstants";

export function useRosterGrid(s: {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isMobile = useIsMobile();
  const fullscreen = useRosterFullscreen();

  // Single scroll container ref — both axes scroll here
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Zoom (100% = the grid as it always was). It is applied straight to the
  // grid (applyZoom below), not through React state: the grid is thousands of
  // cells and re-rendering it on every step took seconds. The team colours come
  // from User Management → Teams, and some teams can be folded down to totals.
  const [collapsedTeams, toggleTeam] = useCollapsedTeams();
  const teamColourOf = useTeamColour();
  // The grid's content, which the zoom is applied to.
  const gridContentRef = useRef<HTMLDivElement>(null);

  // Only the date columns near the screen are drawn (the roster runs for about
  // 230 days; drawing them all made every scroll and zoom slow). The rest are
  // empty space of the same width, so the scroll bar and positions are the same.
  const [dateWindow, setDateWindow] = useState(() => ({
    start: 0,
    end: Math.min(TOTAL_DAYS, WINDOW_BLOCK * 6),
  }));
  const updateDateWindow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = dateWindowFor(
      el.scrollLeft,
      el.clientWidth,
      getRosterZoom(),
      TOTAL_DAYS
    );
    setDateWindow(prev =>
      prev.start === next.start && prev.end === next.end ? prev : next
    );
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollLeft(el.scrollLeft);
    updateDateWindow();
  }, [updateDateWindow]);

  // Applies the zoom to the grid and the scroller, keeping the same dates in
  // view (the scroll position is in screen pixels, so it is rescaled).
  const appliedZoomRef = useRef(1);
  const applyZoom = useCallback(
    (z: number, rescale: boolean) => {
      const box = scrollRef.current;
      const content = gridContentRef.current;
      if (content) content.style.zoom = String(z);
      if (box) {
        // One screen pixel in the zoomed grid, for sizes that must not shrink
        // with the zoom (the team cards' corners; RosterTeamFrame.tsx).
        box.style.setProperty("--rpx", `${1 / z}px`);
        box.classList.toggle("roster-zoomed-out", labelsHidden(z));
        box.dataset.rosterZoomedOut = z < 1 ? "true" : "false";
        const before = appliedZoomRef.current;
        if (rescale && before !== z) {
          box.scrollLeft = (box.scrollLeft * z) / before;
          box.scrollTop = (box.scrollTop * z) / before;
        }
      }
      appliedZoomRef.current = z;
      updateDateWindow();
    },
    [updateDateWindow]
  );
  // A grid that has just appeared (after loading, or the mobile and desktop
  // layouts swapping) gets the current zoom straight away.
  useLayoutEffect(() => {
    const content = gridContentRef.current;
    const z = getRosterZoom();
    if (content && content.style.zoom !== String(z)) applyZoom(z, false);
  });
  useEffect(() => subscribeRosterZoom(z => applyZoom(z, true)), [applyZoom]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateDateWindow());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateDateWindow]);
  const windowDates = useMemo(
    () => ALL_DATES.slice(dateWindow.start, dateWindow.end),
    [dateWindow]
  );
  const spacers = useMemo(
    () => windowSpacers(dateWindow, TOTAL_DAYS),
    [dateWindow]
  );

  // Drag-to-scroll (mouse/pointer drag on the grid background)
  const dragScrollRef = useRef<{
    startX: number;
    startScrollLeft: number;
    active: boolean;
  }>({
    startX: 0,
    startScrollLeft: 0,
    active: false,
  });
  const handleGridPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only activate on the grid background (not on shift cells or buttons)
      const target = e.target as HTMLElement;
      if (
        target.closest("[data-no-dnd]") ||
        target.closest("button") ||
        target.closest('[role="button"]')
      )
        return;
      if (!scrollRef.current) return;
      dragScrollRef.current = {
        startX: e.clientX,
        startScrollLeft: scrollRef.current.scrollLeft,
        active: true,
      };
      try {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      } catch {
        /* iOS Safari may not support setPointerCapture on all elements */
      }
      e.currentTarget.style.cursor = "grabbing";
    },
    []
  );
  const handleGridPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragScrollRef.current.active || !scrollRef.current) return;
      const dx = e.clientX - dragScrollRef.current.startX;
      scrollRef.current.scrollLeft = dragScrollRef.current.startScrollLeft - dx;
    },
    []
  );
  const handleGridPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragScrollRef.current.active = false;
      e.currentTarget.style.cursor = "";
    },
    []
  );

  const scrollToDate = useCallback((dateStr: string) => {
    const idx = ALL_DATES.findIndex(d => format(d, "yyyy-MM-dd") === dateStr);
    if (idx < 0) return;
    const target = scrollLeftForDay(idx, getRosterZoom());
    if (scrollRef.current) scrollRef.current.scrollLeft = target;
    setScrollLeft(target);
  }, []);

  const today = format(new Date(), "yyyy-MM-dd");
  // scrolledToToday ref — the actual effect is placed after shiftsData is declared (line ~680)
  const scrolledToToday = useRef(false);

  // Full screen: the header's Today button scrolls this grid; Esc leaves it
  // (unless a dialog is open, where Esc closes the dialog first); leaving the
  // roster always puts the page back to normal.
  useEffect(
    () => registerRosterToday(() => scrollToDate(today)),
    [scrollToDate, today]
  );
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]'))
        return;
      setRosterFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);
  useEffect(() => () => setRosterFullscreen(false), []);

  // Month navigation
  const visibleMonthIndex = useMemo(() => {
    if (ALL_DATES.length === 0) return 0;
    const visibleDayIdx = dayIndexAtScroll(scrollLeft, getRosterZoom());
    const visibleDate =
      ALL_DATES[Math.min(Math.max(0, visibleDayIdx), ALL_DATES.length - 1)];
    if (!visibleDate) return 0;
    const monthStr = safeFormat(visibleDate, "MMM yyyy");
    if (!monthStr) return 0;
    const idx = MONTHS.findIndex(m => m === monthStr);
    return idx >= 0 ? idx : 0;
  }, [scrollLeft]);

  // Ctrl + scroll and a two-finger pinch zoom the grid (the scroll container
  // is a callback-less ref, so these are attached by hand, not as props: the
  // browser needs them non-passive to stop the page zooming instead).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setRosterZoom(stepZoom(getRosterZoom(), e.deltaY < 0 ? 1 : -1));
    };
    let pinch: { dist: number; zoom: number } | null = null;
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2)
        pinch = { dist: dist(e.touches), zoom: getRosterZoom() };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      setRosterZoom((pinch.zoom * dist(e.touches)) / pinch.dist);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const goToPrevMonth = () => {
    const newIdx = Math.max(0, visibleMonthIndex - 1);
    const [mon, yr] = MONTHS[newIdx].split(" ");
    const mIdx = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(mon);
    const d = new Date(parseInt(yr), mIdx, 1);
    scrollToDate(
      format(d < ROSTER_START_DATE ? ROSTER_START_DATE : d, "yyyy-MM-dd")
    );
  };

  const goToNextMonth = () => {
    const newIdx = Math.min(MONTHS.length - 1, visibleMonthIndex + 1);
    const [mon, yr] = MONTHS[newIdx].split(" ");
    const mIdx = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(mon);
    const d = new Date(parseInt(yr), mIdx, 1);
    scrollToDate(
      format(d > ROSTER_END_DATE ? ROSTER_END_DATE : d, "yyyy-MM-dd")
    );
  };

  return {
    isAdmin,
    isMobile,
    fullscreen,
    scrollRef,
    scrollLeft,
    setScrollLeft,
    collapsedTeams,
    toggleTeam,
    teamColourOf,
    gridContentRef,
    handleScroll,
    windowDates,
    spacers,
    handleGridPointerDown,
    handleGridPointerMove,
    handleGridPointerUp,
    scrollToDate,
    today,
    scrolledToToday,
    visibleMonthIndex,
    goToPrevMonth,
    goToNextMonth,
  };
}

export type RosterGridState = ReturnType<typeof useRosterGrid>;
