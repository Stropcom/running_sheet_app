// Decides whether an image embedded in an imported document is plausibly a
// PHOTOGRAPH worth offering to the officer, as opposed to template furniture:
// icon bars, section banners, colour legends, logos, dividers. A real agency
// template ("Tactical Profile") repeats a 2365x147 icon bar on every page and
// a flat colour legend, all comfortably above the size floor — so size alone
// let them through as "photos". Three cheap, deterministic checks, no AI:
//   • size floor  — a tiny image is an icon/bullet;
//   • aspect ratio — a banner/legend/rule is far wider or taller than any
//     photograph of a person;
//   • entropy     — a flat graphic has very few distinct tones (measured
//     1.2–2.4 on the template's banners/legend; real photos 6.7+), a
//     photograph, even a dark or low-contrast one, sits well above the floor.
import type { Sharp } from "sharp";

export const MIN_PHOTO_DIMENSION = 120;
export const MAX_PHOTO_ASPECT_RATIO = 4;
export const MIN_PHOTO_ENTROPY = 4;

export function isPhotoShapedSize(width: number, height: number): boolean {
  if (width < MIN_PHOTO_DIMENSION || height < MIN_PHOTO_DIMENSION) return false;
  const aspect = width / height;
  return (
    aspect <= MAX_PHOTO_ASPECT_RATIO && aspect >= 1 / MAX_PHOTO_ASPECT_RATIO
  );
}

/** Size/shape check first (free), then the entropy check on the decoded
 * pixels. Best-effort: if the statistics can't be read, the image is kept —
 * the officer can untick it, which is a cheaper mistake than losing a photo. */
export async function isLikelyPhoto(
  image: Sharp,
  width: number,
  height: number
): Promise<boolean> {
  if (!isPhotoShapedSize(width, height)) return false;
  try {
    const { entropy } = await image.clone().stats();
    return entropy >= MIN_PHOTO_ENTROPY;
  } catch {
    return true;
  }
}
