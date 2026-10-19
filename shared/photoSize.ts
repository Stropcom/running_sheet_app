// The size an officer drags a photo to on the running sheet (display only —
// the export keeps its own fixed size). Kept per photo, per device. The rules
// are here so the handle and its tests agree: never smaller than a thumbnail,
// never wider than the row it sits in, and a junk stored value is ignored.

export const PHOTO_MIN_WIDTH = 90;
/** The default cap on the live sheet; a dragged photo may go past it. */
export const PHOTO_DEFAULT_MAX_WIDTH = 160;
/** However wide the row, a photo is never dragged past this. */
export const PHOTO_ABSOLUTE_MAX_WIDTH = 900;

/** The width to use while dragging: `wanted` kept between the minimum and the
 * room there is (the row's width, at most the absolute cap). */
export function clampPhotoWidth(
  wanted: number,
  availableWidth: number
): number {
  const max = Math.max(
    PHOTO_MIN_WIDTH,
    Math.min(
      availableWidth > 0 ? availableWidth : PHOTO_ABSOLUTE_MAX_WIDTH,
      PHOTO_ABSOLUTE_MAX_WIDTH
    )
  );
  if (!Number.isFinite(wanted)) return PHOTO_MIN_WIDTH;
  return Math.round(Math.min(max, Math.max(PHOTO_MIN_WIDTH, wanted)));
}

/** A stored width, or null when there is none or it isn't a usable number. */
export function parseStoredPhotoWidth(
  raw: string | null | undefined
): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < PHOTO_MIN_WIDTH || n > PHOTO_ABSOLUTE_MAX_WIDTH) return null;
  return Math.round(n);
}

export const photoWidthKey = (photoId: number) => `runlog_photo_w_${photoId}`;
