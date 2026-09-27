import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const MIN_WIDTH = 220;
const MIN_HEIGHT = 160;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Picture-in-picture Street View panel — opened from a map marker's info
// window "Street View" button (see the window.__*OpenStreetView bridge
// functions in IntelligenceMapping.tsx/RSMapping.tsx; an InfoWindow's
// content is raw HTML via setContent(), not React, so it can't call this
// component directly). Renders google.maps.StreetViewPanorama over the map
// itself instead of the previous <a target="_blank"> link that took the
// officer out of the app to a separate Google Maps tab.
//
// Deliberately never `class X extends google.maps.*` at module scope (see
// CLAUDE.md's map-drift note on divIconOverlay.ts for why that crashed the
// whole app on load) — this only ever calls `new google.maps.
// StreetViewPanorama(...)` inside an effect, which by construction can't
// run before this component is even mounted, which itself only happens
// after a marker's info window (which needs the map already loaded) has
// been clicked.
//
// Drag and resize mutate the panel's own style directly via refs rather
// than React state, so dragging doesn't re-render on every pointermove —
// same reasoning as the app's other drag interactions (DivIconOverlay).
export function StreetViewPip({
  lat,
  lng,
  label,
  onClose,
}: {
  lat: number;
  lng: number;
  label: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const panoDivRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [panoStatus, setPanoStatus] = useState<"loading" | "ok" | "none">(
    "loading"
  );

  // Create the panorama once on mount.
  useEffect(() => {
    if (!panoDivRef.current || !window.google?.maps) return;
    const panorama = new google.maps.StreetViewPanorama(panoDivRef.current, {
      position: { lat, lng },
      addressControl: false,
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
      linksControl: true,
      panControl: false,
      zoomControl: true,
    });
    panoramaRef.current = panorama;
    const listener = panorama.addListener("status_changed", () => {
      setPanoStatus(
        panorama.getStatus() === google.maps.StreetViewStatus.OK ? "ok" : "none"
      );
    });
    return () => {
      listener.remove();
      panoramaRef.current = null;
    };
    // Mount-only — position updates for an already-open panel are handled
    // by the effect below instead of recreating the panorama each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-point an already-open panel at a newly clicked marker.
  useEffect(() => {
    if (!panoramaRef.current) return;
    setPanoStatus("loading");
    panoramaRef.current.setPosition({ lat, lng });
  }, [lat, lng]);

  // Initial position/size + drag + resize, all via direct style mutation.
  useEffect(() => {
    const panel = panelRef.current;
    const header = headerRef.current;
    const handle = resizeHandleRef.current;
    if (!panel || !header || !handle) return;
    const container = panel.parentElement;
    if (!container) return;

    const placeDefault = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      panel.style.left = `${clamp(cw * 0.56, 8, Math.max(8, cw - w - 8))}px`;
      panel.style.top = `${clamp(ch * 0.3, 8, Math.max(8, ch - h - 8))}px`;
    };
    placeDefault();

    let drag: {
      startX: number;
      startY: number;
      left: number;
      top: number;
    } | null = null;
    const onHeaderDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-pip-close]")) return;
      const cRect = container.getBoundingClientRect();
      const pRect = panel.getBoundingClientRect();
      drag = {
        startX: e.clientX,
        startY: e.clientY,
        left: pRect.left - cRect.left,
        top: pRect.top - cRect.top,
      };
      panel.classList.add("ring-2", "ring-sky-500/50");
      header.setPointerCapture(e.pointerId);
    };
    const onHeaderMove = (e: PointerEvent) => {
      if (!drag) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const left = clamp(
        drag.left + (e.clientX - drag.startX),
        0,
        Math.max(0, cw - panel.offsetWidth)
      );
      const top = clamp(
        drag.top + (e.clientY - drag.startY),
        0,
        Math.max(0, ch - panel.offsetHeight)
      );
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };
    const onHeaderUp = (e: PointerEvent) => {
      drag = null;
      panel.classList.remove("ring-2", "ring-sky-500/50");
      try {
        header.releasePointerCapture(e.pointerId);
      } catch {
        // already released
      }
    };
    header.addEventListener("pointerdown", onHeaderDown);
    header.addEventListener("pointermove", onHeaderMove);
    header.addEventListener("pointerup", onHeaderUp);
    header.addEventListener("pointercancel", onHeaderUp);

    let resize: {
      startX: number;
      startY: number;
      w: number;
      h: number;
    } | null = null;
    const onHandleDown = (e: PointerEvent) => {
      e.stopPropagation();
      resize = {
        startX: e.clientX,
        startY: e.clientY,
        w: panel.offsetWidth,
        h: panel.offsetHeight,
      };
      handle.setPointerCapture(e.pointerId);
    };
    const onHandleMove = (e: PointerEvent) => {
      if (!resize) return;
      const cRect = container.getBoundingClientRect();
      const pRect = panel.getBoundingClientRect();
      const maxW = cRect.width - (pRect.left - cRect.left);
      const maxH = cRect.height - (pRect.top - cRect.top);
      panel.style.width = `${clamp(resize.w + (e.clientX - resize.startX), MIN_WIDTH, maxW)}px`;
      panel.style.height = `${clamp(resize.h + (e.clientY - resize.startY), MIN_HEIGHT, maxH)}px`;
    };
    const onHandleUp = (e: PointerEvent) => {
      resize = null;
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        // already released
      }
    };
    handle.addEventListener("pointerdown", onHandleDown);
    handle.addEventListener("pointermove", onHandleMove);
    handle.addEventListener("pointerup", onHandleUp);
    handle.addEventListener("pointercancel", onHandleUp);

    return () => {
      header.removeEventListener("pointerdown", onHeaderDown);
      header.removeEventListener("pointermove", onHeaderMove);
      header.removeEventListener("pointerup", onHeaderUp);
      header.removeEventListener("pointercancel", onHeaderUp);
      handle.removeEventListener("pointerdown", onHandleDown);
      handle.removeEventListener("pointermove", onHandleMove);
      handle.removeEventListener("pointerup", onHandleUp);
      handle.removeEventListener("pointercancel", onHandleUp);
    };
  }, []);

  return (
    <div
      ref={panelRef}
      className="absolute w-[320px] h-[230px] max-w-[calc(100%-16px)] max-h-[calc(100%-16px)] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col z-30"
      style={{ width: 320, height: 230 }}
    >
      <div
        ref={headerRef}
        className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
      >
        <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold leading-tight truncate">
            Street View
          </p>
          <p className="text-[10.5px] text-muted-foreground truncate">
            {label}
          </p>
        </div>
        <button
          type="button"
          data-pip-close
          onClick={onClose}
          aria-label="Close Street View"
          className="w-6 h-6 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:bg-accent/20 hover:text-foreground transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 bg-muted">
        <div ref={panoDivRef} className="absolute inset-0" />
        {panoStatus === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted text-xs text-muted-foreground pointer-events-none">
            Loading Street View…
          </div>
        )}
        {panoStatus === "none" && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted text-xs text-muted-foreground text-center px-4 pointer-events-none">
            No Street View imagery available here.
          </div>
        )}
      </div>

      <div
        ref={resizeHandleRef}
        className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize touch-none"
        aria-label="Resize Street View panel"
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          className="absolute right-1 bottom-1 text-muted-foreground/60"
        >
          <path
            d="M7 1 1 7M7 4.5 4.5 7M7 7.8 7.8 7"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
      </div>
    </div>
  );
}
