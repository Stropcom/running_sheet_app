import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

type Props = {
  /** Natural width of the document content in px (e.g. matches the full page's max-w-3xl). */
  contentWidth?: number;
  children: React.ReactNode;
  className?: string;
};

const MAX_SCALE_MULT = 4;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DIST = 24;

function clampAxis(
  pos: number,
  containerSize: number,
  scaledSize: number
): number {
  const minPos = Math.min(0, containerSize - scaledSize);
  const maxPos = Math.max(0, containerSize - scaledSize);
  return Math.min(maxPos, Math.max(minPos, pos));
}

/**
 * Renders `children` at a fixed natural width, fit-scaled to the container on load,
 * then pinch/wheel/drag zoomable and pannable — used to embed a full desktop-width
 * document (e.g. the target profile) inside a narrow side pane at its native layout.
 */
export function DocumentZoomViewer({
  contentWidth = 768,
  children,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  const [fitScale, setFitScale] = useState(1);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const scaleRef = useRef(scale);
  const posRef = useRef(pos);
  scaleRef.current = scale;
  posRef.current = pos;

  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{
    dist: number;
    scale: number;
    mid: { x: number; y: number };
    pos: { x: number; y: number };
  } | null>(null);
  const dragStart = useRef<{
    x: number;
    y: number;
    pos: { x: number; y: number };
  } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const clampPos = useCallback(
    (nextPos: { x: number; y: number }, s: number) => {
      const el = containerRef.current;
      if (!el) return nextPos;
      const rect = el.getBoundingClientRect();
      const innerH = innerRef.current?.offsetHeight ?? rect.height;
      return {
        x: clampAxis(nextPos.x, rect.width, contentWidth * s),
        y: clampAxis(nextPos.y, rect.height, innerH * s),
      };
    },
    [contentWidth]
  );

  const applyFit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const fit = rect.width > 0 ? rect.width / contentWidth : 1;
    setFitScale(fit);
    setScale(fit);
    setPos({ x: 0, y: 0 });
  }, [contentWidth]);

  // Fit to container on mount and on resize
  useEffect(() => {
    applyFit();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => applyFit());
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentWidth]);

  const zoomAround = useCallback(
    (viewportPoint: { x: number; y: number }, nextScaleRaw: number) => {
      const minScale = fitScale;
      const maxScale = fitScale * MAX_SCALE_MULT;
      const nextScale = Math.min(maxScale, Math.max(minScale, nextScaleRaw));
      const s0 = scaleRef.current;
      const p0 = posRef.current;
      const ratio = nextScale / s0;
      const nextPos = {
        x: viewportPoint.x - (viewportPoint.x - p0.x) * ratio,
        y: viewportPoint.y - (viewportPoint.y - p0.y) * ratio,
      };
      setScale(nextScale);
      setPos(clampPos(nextPos, nextScale));
    },
    [fitScale, clampPos]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomAround(cursor, scaleRef.current * factor);
    },
    [zoomAround]
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, pos: posRef.current };
    } else if (pointers.current.size === 2) {
      dragStart.current = null;
      const pts = Array.from(pointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const rect = containerRef.current?.getBoundingClientRect();
      const mid = rect
        ? {
            x: (pts[0].x + pts[1].x) / 2 - rect.left,
            y: (pts[0].y + pts[1].y) / 2 - rect.top,
          }
        : { x: 0, y: 0 };
      pinchStart.current = {
        dist,
        scale: scaleRef.current,
        mid,
        pos: posRef.current,
      };
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2 && pinchStart.current) {
        const pts = Array.from(pointers.current.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (dist > 0) {
          const ratio = dist / pinchStart.current.dist;
          const minScale = fitScale;
          const maxScale = fitScale * MAX_SCALE_MULT;
          const nextScale = Math.min(
            maxScale,
            Math.max(minScale, pinchStart.current.scale * ratio)
          );
          const s0 = pinchStart.current.scale;
          const p0 = pinchStart.current.pos;
          const mid = pinchStart.current.mid;
          const zoomRatio = nextScale / s0;
          const nextPos = {
            x: mid.x - (mid.x - p0.x) * zoomRatio,
            y: mid.y - (mid.y - p0.y) * zoomRatio,
          };
          setScale(nextScale);
          setPos(clampPos(nextPos, nextScale));
        }
      } else if (pointers.current.size === 1 && dragStart.current) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        const nextPos = {
          x: dragStart.current.pos.x + dx,
          y: dragStart.current.pos.y + dy,
        };
        setPos(clampPos(nextPos, scaleRef.current));
      }
    },
    [fitScale, clampPos]
  );

  const endPointer = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      const [remaining] = Array.from(pointers.current.values());
      dragStart.current = {
        x: remaining.x,
        y: remaining.y,
        pos: posRef.current,
      };
      pinchStart.current = null;
    } else if (pointers.current.size === 0) {
      dragStart.current = null;
      pinchStart.current = null;
    }
  }, []);

  const handleTapForDoubleTap = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const now = Date.now();
      const last = lastTap.current;
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      if (
        last &&
        now - last.t < DOUBLE_TAP_MS &&
        Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_DIST
      ) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const target =
          scaleRef.current > fitScale * 1.05 ? fitScale : fitScale * 2;
        zoomAround(point, target);
        lastTap.current = null;
      }
    },
    [fitScale, zoomAround]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const target =
        scaleRef.current > fitScale * 1.05 ? fitScale : fitScale * 2;
      zoomAround(point, target);
    },
    [fitScale, zoomAround]
  );

  const zoomStep = useCallback(
    (mult: number) => {
      const el = containerRef.current;
      const rect = el?.getBoundingClientRect();
      const center = rect
        ? { x: rect.width / 2, y: rect.height / 2 }
        : { x: 0, y: 0 };
      zoomAround(center, scaleRef.current * mult);
    },
    [zoomAround]
  );

  const zoomPct = Math.round((scale / (fitScale || 1)) * 100);

  return (
    <div
      ref={containerRef}
      data-testid="document-zoom-viewer"
      className={`relative overflow-hidden touch-none select-none bg-muted/10 ${className}`}
      onWheel={handleWheel}
      onPointerDown={e => {
        handlePointerDown(e);
        handleTapForDoubleTap(e);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={handleDoubleClick}
    >
      <div
        ref={innerRef}
        style={{
          width: contentWidth,
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
        className="bg-background"
      >
        {children}
      </div>

      {/* Floating zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col items-center gap-1 rounded-xl border-2 border-border bg-card/95 shadow-lg backdrop-blur-sm p-1">
        <button
          onClick={() => zoomStep(1.35)}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent active:scale-95 transition-all"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <span className="text-[9px] font-semibold text-muted-foreground tabular-nums">
          {zoomPct}%
        </span>
        <button
          onClick={() => zoomStep(1 / 1.35)}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent active:scale-95 transition-all"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={applyFit}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent active:scale-95 transition-all"
          title="Reset zoom"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
