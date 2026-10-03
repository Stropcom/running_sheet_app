import { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { DivIconOverlay } from "@/lib/divIconOverlay";

const MIN_WIDTH = 220;
const MIN_HEIGHT = 160;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Picture-in-picture Street View panel. The panorama is created ONCE per map
// and bound to it with map.setStreetView(), so Google's own Street View
// "little man" (turned on in components/Map.tsx) drops straight into this
// floating panel instead of taking over the whole map. A marker popup's
// Street View button feeds the same panorama through `request` (an InfoWindow's
// content is raw HTML via setContent(), not React, so it reaches this
// component through a window.__*OpenStreetView bridge that sets page state).
//
// While the panel is open, a small blue dot with a view cone sits on the map
// at the panorama's position, rotating with where it is facing — Google only
// draws that itself in its own full-screen mode.
//
// Deliberately never `class X extends google.maps.*` at module scope (see
// CLAUDE.md's map-drift note on divIconOverlay.ts for why that crashed the
// whole app on load): the panorama and the cone overlay are only built inside
// an effect, after the map exists.
//
// Drag and resize mutate the panel's own style directly via refs rather
// than React state, so dragging doesn't re-render on every pointermove —
// same reasoning as the app's other drag interactions (DivIconOverlay).
export function StreetViewPip({
  map,
  request,
  onClose,
}: {
  map: google.maps.Map | null;
  /** A marker popup's Street View click; a new object each click. */
  request: { lat: number; lng: number; label: string } | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const panoDivRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const requestedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [panoStatus, setPanoStatus] = useState<"loading" | "ok" | "none">(
    "loading"
  );

  // Create the panorama (and the on-map view cone) once the map exists.
  useEffect(() => {
    if (!map || !panoDivRef.current || !window.google?.maps) return;
    const panorama = new google.maps.StreetViewPanorama(panoDivRef.current, {
      visible: false,
      addressControl: false,
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
      linksControl: true,
      panControl: false,
      enableCloseButton: false,
      // Off, not just repositioned — Street View's default zoom control
      // sits in the bottom-right corner, the same spot our own resize
      // handle needs (see the handle's placement below for why that
      // corner is otherwise unusable).
      zoomControl: false,
    });
    panoramaRef.current = panorama;
    map.setStreetView(panorama);

    // View cone: a dot plus a wedge, rotated to the panorama's heading
    // (relative to the map's own rotation).
    const cone = document.createElement("div");
    cone.style.cssText = "width:64px;height:64px;pointer-events:none;";
    cone.innerHTML =
      '<svg width="64" height="64" viewBox="-32 -32 64 64" style="display:block;overflow:visible">' +
      '<g data-cone><path d="M0 0 L-16 -27 A31 31 0 0 1 16 -27 Z" fill="rgba(66,133,244,0.40)" stroke="rgba(66,133,244,0.9)" stroke-width="1.5" stroke-linejoin="round"/></g>' +
      '<circle r="6.5" fill="#4285f4" stroke="#fff" stroke-width="2.5"/></svg>';
    const coneRotor = cone.querySelector("[data-cone]") as SVGGElement;
    const coneOverlay = new DivIconOverlay({
      map: null,
      position: map.getCenter()?.toJSON() ?? { lat: 0, lng: 0 },
      content: cone,
      zIndex: 5,
    });
    const syncCone = () => {
      const pos = panorama.getPosition();
      if (pos) coneOverlay.position = { lat: pos.lat(), lng: pos.lng() };
      const heading =
        (panorama.getPov().heading ?? 0) - (map.getHeading() ?? 0);
      coneRotor.setAttribute("transform", `rotate(${heading})`);
    };

    const listeners: google.maps.MapsEventListener[] = [
      panorama.addListener("status_changed", () => {
        setPanoStatus(
          panorama.getStatus() === google.maps.StreetViewStatus.OK
            ? "ok"
            : "none"
        );
      }),
      panorama.addListener("visible_changed", () => {
        const visible = panorama.getVisible();
        setOpen(visible);
        coneOverlay.map = visible ? map : null;
        if (visible) {
          // Opened by the pegman drop (a popup request sets its own label).
          if (!requestedRef.current) setLabel("Dropped position");
          requestedRef.current = false;
          syncCone();
          // The panel was hidden (but laid out) until now.
          google.maps.event.trigger(panorama, "resize");
        } else {
          setLabel("");
          onCloseRef.current();
        }
      }),
      panorama.addListener("position_changed", syncCone),
      panorama.addListener("pov_changed", syncCone),
      map.addListener("heading_changed", syncCone),
    ];
    return () => {
      listeners.forEach(l => l.remove());
      coneOverlay.map = null;
      panorama.setVisible(false);
      map.setStreetView(null);
      panoramaRef.current = null;
    };
  }, [map]);

  // A marker popup's Street View button: point the panorama there and show it.
  useEffect(() => {
    const panorama = panoramaRef.current;
    if (!request || !panorama) return;
    requestedRef.current = !panorama.getVisible();
    setLabel(request.label);
    setPanoStatus("loading");
    panorama.setPosition({ lat: request.lat, lng: request.lng });
    panorama.setVisible(true);
  }, [request, map]);

  const closePanel = () => {
    panoramaRef.current?.setVisible(false);
  };

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
      className={`absolute w-[320px] h-[230px] max-w-[calc(100%-16px)] max-h-[calc(100%-16px)] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col z-30 ${
        open ? "" : "invisible pointer-events-none"
      }`}
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
          onClick={closePanel}
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

      {/* Sits above Street View's own bottom-right corner, not flush
        against it — Google renders a "Report a problem" / copyright
        strip there that it keeps clickable on top of anything else in
        the panorama, so a handle placed right at bottom-0/right-0 never
        receives its own pointerdown. Given a visible chip (not just a
        cursor change) plus a larger hit area so it reads as grabbable
        rather than blending into the video feed underneath it. */}
      <div
        ref={resizeHandleRef}
        className="absolute right-1 bottom-6 z-10 w-8 h-8 cursor-nwse-resize touch-none flex items-center justify-center rounded-md border border-border bg-card/90 backdrop-blur-sm shadow-md text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors"
        aria-label="Resize Street View panel"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </div>
    </div>
  );
}
