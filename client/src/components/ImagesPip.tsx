import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Maximize2,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatAttachmentBanner } from "@/lib/attachmentBanner";

const MIN_WIDTH = 220;
const MIN_HEIGHT = 170;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Picture-in-picture photo viewer — opened from a map marker's info window
// "Images" button, which only appears when photos are already linked to
// that address (see the auto-link at upload time in server/attachmentUpload.ts,
// server/db.ts's autoLinkAttachmentToRowAddresses). Same draggable/resizable
// shell as StreetViewPip, with a photo carousel instead of a panorama.
export function ImagesPip({
  label,
  onClose,
  personPhotos,
}: {
  label: string;
  onClose: () => void;
  /** Hand-uploaded profile / baseball-card photos of the people living at
   * this address, shown after the running-sheet photos with the person's
   * name on the banner. Optional — without it this behaves exactly as the
   * running-sheet-only viewer. */
  personPhotos?: Array<{
    id: number;
    url: string;
    personLabel: string;
    createdAt: string | number | Date | null;
  }>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const { data } = trpc.attachment.byEntity.useQuery({
    category: "location",
    entityLabel: label,
  });
  const rowPhotos = (data ?? []) as Array<{
    id: number;
    url: string;
    rowDate: string | null;
    rowTime: string | null;
    memberCINs: string[];
    isManualUpload: boolean;
    createdAt: string | number | Date | null;
    personLabel?: string;
  }>;
  const rowPhotoIds = new Set(rowPhotos.map(p => p.id));
  const photos = [
    ...rowPhotos,
    ...(personPhotos ?? [])
      .filter(p => !rowPhotoIds.has(p.id))
      .map(p => ({
        id: p.id,
        url: p.url,
        rowDate: null,
        rowTime: null,
        memberCINs: [] as string[],
        isManualUpload: true,
        createdAt: p.createdAt,
        personLabel: p.personLabel,
      })),
  ];
  const count = photos.length;

  useEffect(() => {
    if (index >= count) setIndex(count > 0 ? count - 1 : 0);
  }, [count, index]);

  const goTo = (i: number) => {
    if (count === 0) return;
    setIndex(((i % count) + count) % count);
  };

  // Keyboard left/right while this panel exists.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goTo(index - 1);
      if (e.key === "ArrowRight") goTo(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count]);

  // Swipe support on the photo area.
  const swipeStartX = useRef<number | null>(null);
  const onBodyPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-pip-nav]")) return;
    swipeStartX.current = e.clientX;
  };
  const onBodyPointerUp = (e: React.PointerEvent) => {
    if (swipeStartX.current === null) return;
    const dx = e.clientX - swipeStartX.current;
    if (dx > 40) goTo(index - 1);
    else if (dx < -40) goTo(index + 1);
    swipeStartX.current = null;
  };

  // Initial position/size + drag + resize, all via direct style mutation —
  // identical mechanism to StreetViewPip, kept self-contained here rather
  // than shared, so each panel stays a simple standalone component.
  useEffect(() => {
    const panel = panelRef.current;
    const header = headerRef.current;
    const handle = resizeHandleRef.current;
    if (!panel || !header || !handle) return;
    const container = panel.parentElement;
    if (!container) return;

    // Top-left, just below the map's own search bar + centre-on-me/follow
    // button row (those sit at top:10px/60px, left:10px — see
    // IntelligenceMapping.tsx) — clamp is only a safety bound for a
    // container too small to fit the panel there at all.
    const placeDefault = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      panel.style.left = `${clamp(10, 8, Math.max(8, cw - w - 8))}px`;
      panel.style.top = `${clamp(110, 8, Math.max(8, ch - h - 8))}px`;
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

  const current = photos[index];

  return (
    <div
      ref={panelRef}
      className="absolute w-[320px] h-[240px] max-w-[calc(100%-16px)] max-h-[calc(100%-16px)] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col z-30"
      style={{ width: 320, height: 240 }}
    >
      <div
        ref={headerRef}
        className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold leading-tight truncate">Photos</p>
          <p className="text-[10.5px] text-muted-foreground truncate">
            {label}
          </p>
        </div>
        <button
          type="button"
          data-pip-close
          onClick={onClose}
          aria-label="Close photos"
          className="w-6 h-6 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:bg-accent/20 hover:text-foreground transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div
        className="relative flex-1 min-h-0 bg-black"
        onPointerDown={onBodyPointerDown}
        onPointerUp={onBodyPointerUp}
      >
        {count === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground bg-muted">
            <ImageOff className="w-5 h-5 opacity-50" />
            Loading photos…
          </div>
        ) : (
          <>
            <img
              key={current?.id}
              src={current?.url}
              alt="Location photograph"
              className="absolute inset-0 w-full h-full object-contain bg-black"
              draggable={false}
            />
            {count > 1 && (
              <>
                <button
                  type="button"
                  data-pip-nav
                  onClick={() => goTo(index - 1)}
                  aria-label="Previous photo"
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/55 border border-white/15 text-white flex items-center justify-center hover:bg-black/75 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  data-pip-nav
                  onClick={() => goTo(index + 1)}
                  aria-label="Next photo"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/55 border border-white/15 text-white flex items-center justify-center hover:bg-black/75 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <div className="absolute top-1.5 right-1.5 bg-black/55 border border-white/15 text-white text-[9.5px] font-bold px-2 py-0.5 rounded-full tabular-nums">
                  {index + 1} / {count}
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 bottom-1.5 flex gap-1">
                  {photos.map((p, i) => (
                    <span
                      key={p.id}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        i === index ? "bg-white" : "bg-white/35"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
            {current && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 pt-4 pb-1.5 text-[10px] text-white/90 truncate pointer-events-none">
                {current.personLabel
                  ? `${current.personLabel} · ${formatAttachmentBanner(current)}`
                  : formatAttachmentBanner(current)}
              </div>
            )}
          </>
        )}
      </div>

      <div
        ref={resizeHandleRef}
        className="absolute right-1 bottom-1 z-10 w-8 h-8 cursor-nwse-resize touch-none flex items-center justify-center rounded-md border border-border bg-card/90 backdrop-blur-sm shadow-md text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors"
        aria-label="Resize photos panel"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </div>
    </div>
  );
}
