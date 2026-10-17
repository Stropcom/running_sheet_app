import { useEffect, useRef } from "react";
import { ArrowLeftRight, Maximize2, X } from "lucide-react";
import {
  clampSplitBox,
  defaultSplitBox,
  SPLIT_MIN_H,
  SPLIT_MIN_W,
  type SplitBox,
} from "@shared/splitView";

/** The four CSS variables that hold the window's box. They are set on the map
 * container (this frame's parent), so the frame and — when Fly is swapped into
 * the window — the 3D map itself both follow it while it is dragged, without
 * React re-rendering the huge Map page on every pointer move. */
export const SPLIT_VARS = {
  left: "--split-left",
  top: "--split-top",
  width: "--split-width",
  height: "--split-height",
} as const;

/** Inline style that makes an element fill the split window's box. */
export const splitBoxStyle: React.CSSProperties = {
  left: `var(${SPLIT_VARS.left}, 10px)`,
  top: `var(${SPLIT_VARS.top}, 108px)`,
  width: `var(${SPLIT_VARS.width}, 300px)`,
  height: `var(${SPLIT_VARS.height}, 225px)`,
  right: "auto",
  bottom: "auto",
};

function writeVars(container: HTMLElement, b: SplitBox) {
  container.style.setProperty(SPLIT_VARS.left, `${b.left}px`);
  container.style.setProperty(SPLIT_VARS.top, `${b.top}px`);
  container.style.setProperty(SPLIT_VARS.width, `${b.width}px`);
  container.style.setProperty(SPLIT_VARS.height, `${b.height}px`);
}

/**
 * The small window of the Fly + Nearmap split view: a title bar you drag to
 * move it, a grip in the bottom right corner you drag to resize it, and Swap /
 * close buttons. It is the same kind of window as the Street View and Photos
 * panels. `children` is its content (the Nearmap map); when `swapped` the
 * window is a frame only — the 3D Fly map is drawn in the same box underneath
 * (see `splitBoxStyle`) and only the title bar and grip take the pointer.
 *
 * Position and size change by direct style / CSS-variable updates (same
 * reasoning as StreetViewPip), and are reported once, when a drag or resize
 * ends, so the caller can remember them per device.
 */
export function SplitViewFrame({
  box,
  title,
  swapped,
  onBoxChange,
  onSwap,
  onClose,
  children,
}: {
  /** The remembered box, or null to start in the top left. */
  box: SplitBox | null;
  title: string;
  swapped: boolean;
  onBoxChange: (box: SplitBox) => void;
  onSwap: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<SplitBox | null>(null);
  const onBoxChangeRef = useRef(onBoxChange);
  onBoxChangeRef.current = onBoxChange;
  const initialBoxRef = useRef(box);

  useEffect(() => {
    const frame = frameRef.current;
    const head = headRef.current;
    const grip = gripRef.current;
    const container = frame?.parentElement;
    if (!frame || !head || !grip || !container) return;
    const size = () => ({
      width: container.clientWidth,
      height: container.clientHeight,
    });
    const apply = (b: SplitBox) => {
      boxRef.current = b;
      writeVars(container, b);
    };
    apply(
      clampSplitBox(initialBoxRef.current ?? defaultSplitBox(size()), size())
    );

    let drag: { x: number; y: number; b: SplitBox } | null = null;
    const onHeadDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-split-btn]")) return;
      if (!boxRef.current) return;
      drag = { x: e.clientX, y: e.clientY, b: boxRef.current };
      head.setPointerCapture(e.pointerId);
    };
    const onHeadMove = (e: PointerEvent) => {
      if (!drag) return;
      apply(
        clampSplitBox(
          {
            ...drag.b,
            left: drag.b.left + e.clientX - drag.x,
            top: drag.b.top + e.clientY - drag.y,
          },
          size()
        )
      );
    };
    const onHeadUp = (e: PointerEvent) => {
      if (!drag) return;
      drag = null;
      try {
        head.releasePointerCapture(e.pointerId);
      } catch {
        // already released
      }
      if (boxRef.current) onBoxChangeRef.current(boxRef.current);
    };
    head.addEventListener("pointerdown", onHeadDown);
    head.addEventListener("pointermove", onHeadMove);
    head.addEventListener("pointerup", onHeadUp);
    head.addEventListener("pointercancel", onHeadUp);

    let rs: { x: number; y: number; b: SplitBox } | null = null;
    const onGripDown = (e: PointerEvent) => {
      e.stopPropagation();
      if (!boxRef.current) return;
      rs = { x: e.clientX, y: e.clientY, b: boxRef.current };
      grip.setPointerCapture(e.pointerId);
    };
    const onGripMove = (e: PointerEvent) => {
      if (!rs) return;
      const s = size();
      apply(
        clampSplitBox(
          {
            ...rs.b,
            width: Math.min(
              Math.max(rs.b.width + e.clientX - rs.x, SPLIT_MIN_W),
              s.width - rs.b.left
            ),
            height: Math.min(
              Math.max(rs.b.height + e.clientY - rs.y, SPLIT_MIN_H),
              s.height - rs.b.top
            ),
          },
          s
        )
      );
    };
    const onGripUp = (e: PointerEvent) => {
      if (!rs) return;
      rs = null;
      try {
        grip.releasePointerCapture(e.pointerId);
      } catch {
        // already released
      }
      if (boxRef.current) onBoxChangeRef.current(boxRef.current);
    };
    grip.addEventListener("pointerdown", onGripDown);
    grip.addEventListener("pointermove", onGripMove);
    grip.addEventListener("pointerup", onGripUp);
    grip.addEventListener("pointercancel", onGripUp);

    // The map got smaller (rotated tablet, resized window): keep it inside.
    const ro = new ResizeObserver(() => {
      if (boxRef.current) apply(clampSplitBox(boxRef.current, size()));
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      head.removeEventListener("pointerdown", onHeadDown);
      head.removeEventListener("pointermove", onHeadMove);
      head.removeEventListener("pointerup", onHeadUp);
      head.removeEventListener("pointercancel", onHeadUp);
      grip.removeEventListener("pointerdown", onGripDown);
      grip.removeEventListener("pointermove", onGripMove);
      grip.removeEventListener("pointerup", onGripUp);
      grip.removeEventListener("pointercancel", onGripUp);
      for (const v of Object.values(SPLIT_VARS))
        container.style.removeProperty(v);
    };
  }, []);

  return (
    <div
      ref={frameRef}
      className={`absolute z-40 rounded-xl border-2 border-sky-600 shadow-2xl overflow-hidden ${
        swapped ? "pointer-events-none bg-transparent" : "bg-neutral-900"
      }`}
      style={splitBoxStyle}
    >
      {!swapped && <div className="absolute inset-0">{children}</div>}
      <div
        ref={headRef}
        className="pointer-events-auto absolute inset-x-0 top-0 z-10 flex items-center gap-1 bg-black/75 py-1 pl-2 pr-1 text-[11px] font-semibold text-white cursor-grab active:cursor-grabbing select-none touch-none"
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <button
          type="button"
          data-split-btn
          onClick={onSwap}
          title="Swap: make this window the big map and the big map this window"
          className="flex items-center gap-1 rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-bold hover:bg-white/30"
        >
          <ArrowLeftRight className="h-3 w-3" /> Swap
        </button>
        <button
          type="button"
          data-split-btn
          onClick={onClose}
          aria-label="Close this window"
          title="Close this window"
          className="flex h-5 w-5 items-center justify-center rounded bg-white/15 hover:bg-white/30"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div
        ref={gripRef}
        title="Drag to resize"
        aria-label="Resize this window"
        className="pointer-events-auto absolute bottom-0 right-0 z-10 flex h-7 w-7 cursor-nwse-resize touch-none items-end justify-end p-1 text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </div>
    </div>
  );
}
