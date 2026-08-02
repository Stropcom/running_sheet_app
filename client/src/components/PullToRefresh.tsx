/**
 * PullToRefresh
 *
 * Wraps page content with a touch-driven pull-to-refresh gesture for mobile
 * and tablet. Only active on touch-capable viewports up to 1024px wide —
 * desktop/mouse users are unaffected. Pulling down past the threshold while
 * scrolled to the top of the page invalidates all active tRPC queries (and
 * kicks off an offline-draft sync) so the current view re-fetches fresh data.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useOffline } from "@/contexts/OfflineContext";

const PULL_THRESHOLD = 64; // px of visual pull distance needed to trigger a refresh
const MAX_PULL = 100; // px cap on visual pull distance (rubber-band limit)
const PULL_RESISTANCE = 0.5; // fraction of raw finger movement applied to the indicator
const MIN_REFRESH_MS = 500; // keep the spinner up at least this long so it doesn't just flash

interface Props {
  children: React.ReactNode;
  /** Disable the gesture — e.g. on the full-screen map, where a downward drag
   * from the top needs to pan the map, not trigger a refresh. */
  disabled?: boolean;
}

export function PullToRefresh({ children, disabled }: Props) {
  const queryClient = useQueryClient();
  const { triggerSync } = useOffline();
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [isTouchViewport, setIsTouchViewport] = useState(false);
  const startYRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1024px)");
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const update = () => setIsTouchViewport(hasTouch && mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    const started = Date.now();
    try {
      await Promise.all([
        triggerSync().catch(() => {}),
        queryClient.invalidateQueries().catch(() => {}),
      ]);
    } finally {
      const elapsed = Date.now() - started;
      if (elapsed < MIN_REFRESH_MS) {
        await new Promise(r => setTimeout(r, MIN_REFRESH_MS - elapsed));
      }
      setRefreshing(false);
      setPullDistance(0);
    }
  }, [queryClient, triggerSync]);

  useEffect(() => {
    if (!isTouchViewport || disabled) return;
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing || e.touches.length !== 1) {
        startYRef.current = null;
        return;
      }
      if (window.scrollY > 0) {
        startYRef.current = null;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      draggingRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || refreshing) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0 || window.scrollY > 0) {
        if (draggingRef.current) {
          draggingRef.current = false;
          setPullDistance(0);
        }
        return;
      }
      draggingRef.current = true;
      e.preventDefault();
      setPullDistance(Math.min(delta * PULL_RESISTANCE, MAX_PULL));
    };

    const onTouchEnd = () => {
      startYRef.current = null;
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setPullDistance(current => {
        if (current >= PULL_THRESHOLD) {
          void doRefresh();
          return current;
        }
        return 0;
      });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [isTouchViewport, disabled, refreshing, doRefresh]);

  if (!isTouchViewport || disabled) {
    return <>{children}</>;
  }

  const indicatorHeight = refreshing ? 56 : pullDistance;
  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);

  return (
    <div ref={containerRef}>
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{
          height: indicatorHeight,
          transition: draggingRef.current ? "none" : "height 200ms ease-out",
        }}
      >
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {refreshing ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <ArrowDown
              className="h-4 w-4 transition-transform"
              style={{ transform: `rotate(${progress * 180}deg)` }}
            />
          )}
          <span>
            {refreshing
              ? "Refreshing…"
              : progress >= 1
                ? "Release to refresh"
                : "Pull to refresh"}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}
