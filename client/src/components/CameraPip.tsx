import { useEffect, useRef } from "react";
import { Maximize2, X } from "lucide-react";
import type { DemoCamera } from "@shared/integrationDemo";
import { drawDemoScene, SCENE_H, SCENE_W } from "@/lib/demoCameraScene";

const MIN_WIDTH = 220;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Picture-in-picture live view for a Milestone camera — the same draggable,
// resizable shell as StreetViewPip and ImagesPip. In the integrations demo the
// picture is a drawn SAMPLE scene (lib/demoCameraScene.ts), not video. Drag by
// the title bar; resize from the bottom-right corner (the picture keeps its
// shape, so only the width is dragged and the height follows). Drag and resize
// change the panel's own style directly rather than React state, so they do not
// re-render on every pointermove.
export function CameraPip({
  cameras,
  active,
  onActive,
  time,
  onClose,
}: {
  cameras: DemoCamera[];
  active: DemoCamera;
  onActive: (id: string) => void;
  time: number;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Redraw the picture whenever the demo clock or the camera changes.
  useEffect(() => {
    const g = canvasRef.current?.getContext("2d");
    if (g) drawDemoScene(g, active, time);
  }, [active, time]);

  useEffect(() => {
    const panel = panelRef.current;
    const header = headerRef.current;
    const handle = resizeHandleRef.current;
    const container = panel?.parentElement;
    if (!panel || !header || !handle || !container) return;

    // Just below the map's own search bar row, nudged in so it does not sit
    // exactly on top of a Street View or photo panel opened at the same time.
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    panel.style.left = `${clamp(34, 8, Math.max(8, cw - panel.offsetWidth - 8))}px`;
    panel.style.top = `${clamp(134, 8, Math.max(8, ch - panel.offsetHeight - 8))}px`;

    let drag: { sx: number; sy: number; left: number; top: number } | null =
      null;
    const onHeaderDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-pip-control]")) return;
      const c = container.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      drag = {
        sx: e.clientX,
        sy: e.clientY,
        left: p.left - c.left,
        top: p.top - c.top,
      };
      header.setPointerCapture(e.pointerId);
    };
    const onHeaderMove = (e: PointerEvent) => {
      if (!drag) return;
      panel.style.left = `${clamp(drag.left + e.clientX - drag.sx, 0, Math.max(0, container.clientWidth - panel.offsetWidth))}px`;
      panel.style.top = `${clamp(drag.top + e.clientY - drag.sy, 0, Math.max(0, container.clientHeight - panel.offsetHeight))}px`;
    };
    const onHeaderUp = (e: PointerEvent) => {
      drag = null;
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

    let resize: { sx: number; w: number } | null = null;
    const onHandleDown = (e: PointerEvent) => {
      e.stopPropagation();
      resize = { sx: e.clientX, w: panel.offsetWidth };
      handle.setPointerCapture(e.pointerId);
    };
    const onHandleMove = (e: PointerEvent) => {
      if (!resize) return;
      const c = container.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      // Keep the whole panel inside the map: the picture is 600 × 340, so the
      // room left below fixes the widest the panel can go.
      const chrome =
        panel.offsetHeight - (canvasRef.current?.offsetHeight ?? 0);
      const byHeight =
        ((c.height - (p.top - c.top) - 2 - chrome) * SCENE_W) / SCENE_H;
      const maxW = Math.min(c.width - (p.left - c.left) - 2, byHeight, 640);
      panel.style.width = `${clamp(resize.w + e.clientX - resize.sx, MIN_WIDTH, Math.max(MIN_WIDTH, maxW))}px`;
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
      className="absolute z-30 flex max-w-[calc(100%-16px)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      style={{ width: 320 }}
    >
      <div
        ref={headerRef}
        className="flex shrink-0 cursor-grab touch-none select-none items-center gap-2 border-b border-border bg-card px-2.5 py-1.5 active:cursor-grabbing"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-teal-600" />
        <div
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Cameras"
        >
          {cameras.map(c => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === active.id}
              data-pip-control
              onClick={() => onActive(c.id)}
              className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                c.id === active.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-accent/20"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-pip-control
          onClick={onClose}
          aria-label="Close live view"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/20 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={SCENE_W}
        height={SCENE_H}
        className="block h-auto w-full bg-slate-900"
        aria-label={`Sample live view, ${active.name}`}
      />
      <p className="truncate px-2.5 py-1 pr-11 text-[11px] text-muted-foreground">
        {active.address}
      </p>
      <div
        ref={resizeHandleRef}
        className="absolute bottom-1 right-1 z-10 flex h-8 w-8 cursor-nwse-resize touch-none items-center justify-center rounded-md border border-border bg-card/90 text-muted-foreground shadow-md backdrop-blur-sm hover:bg-accent/20 hover:text-foreground"
        aria-label="Resize live view"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </div>
    </div>
  );
}
