/**
 * A photo on a running sheet row with a drag handle in its bottom-right corner.
 * Drag to make it bigger or smaller (the picture keeps its shape); double-click
 * the handle to put it back to the normal size. The size is remembered for that
 * photo on this device only and changes how it looks on screen — the printed
 * export keeps its own fixed size, and nothing is saved to the sheet.
 */
import { useRef, useState, type ReactNode } from "react";
import {
  PHOTO_DEFAULT_MAX_WIDTH,
  PHOTO_MIN_WIDTH,
  clampPhotoWidth,
  parseStoredPhotoWidth,
  photoWidthKey,
} from "@shared/photoSize";

function readWidth(photoId: number): number | null {
  try {
    return parseStoredPhotoWidth(localStorage.getItem(photoWidthKey(photoId)));
  } catch {
    return null;
  }
}

function writeWidth(photoId: number, width: number | null) {
  try {
    if (width == null) localStorage.removeItem(photoWidthKey(photoId));
    else localStorage.setItem(photoWidthKey(photoId), String(width));
  } catch {
    /* storage blocked: the size just isn't remembered */
  }
}

export function ResizablePhoto({
  photoId,
  children,
}: {
  photoId: number;
  /** Receives the handle, to place inside the element that wraps the <img>. */
  children: (handle: ReactNode) => ReactNode;
}) {
  const [width, setWidth] = useState<number | null>(() => readWidth(photoId));
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  const available = () => frame.current?.parentElement?.clientWidth ?? 0;

  const handle = (
    <button
      type="button"
      aria-label="Drag to resize this photo. Double-click to reset."
      title="Drag to resize · double-click to reset"
      className="absolute bottom-1 right-1 z-10 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded border border-border bg-background/90 text-muted-foreground opacity-70 shadow-sm hover:opacity-100 hover:text-foreground group-hover:opacity-100 touch-none"
      onPointerDown={e => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = {
          startX: e.clientX,
          startW:
            frame.current?.getBoundingClientRect().width ?? PHOTO_MIN_WIDTH,
        };
      }}
      onPointerMove={e => {
        if (!drag.current) return;
        setWidth(
          clampPhotoWidth(
            drag.current.startW + (e.clientX - drag.current.startX),
            available()
          )
        );
      }}
      onPointerUp={e => {
        if (!drag.current) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        drag.current = null;
        if (frame.current)
          writeWidth(
            photoId,
            clampPhotoWidth(
              frame.current.getBoundingClientRect().width,
              available()
            )
          );
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => {
        e.stopPropagation();
        setWidth(null);
        writeWidth(photoId, null);
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M2 10 10 2M6 10l4-4" />
      </svg>
    </button>
  );

  return (
    <div
      ref={frame}
      className="relative group"
      style={
        width == null
          ? {
              width: "33%",
              minWidth: PHOTO_MIN_WIDTH,
              maxWidth: PHOTO_DEFAULT_MAX_WIDTH,
            }
          : { width, maxWidth: "100%" }
      }
    >
      {children(handle)}
    </div>
  );
}
