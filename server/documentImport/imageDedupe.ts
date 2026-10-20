// A document often shows the same photograph twice — a photoboard thumbnail
// and again on the person's own card. Offering both gives the officer a second,
// uncaptioned copy of every person to untick (and, because it has no caption,
// one that defaults to "the target"). This drops the repeat, keeping the copy
// that carries the person's name.
//
// "Same photograph" means a 16x16 greyscale fingerprint that differs in at most
// MAX_DIFFERING_BITS of 256 bits, with the same shape. Measured on a real
// 24-photo profile: the twins matched exactly (0 bits) and the two closest
// DIFFERENT people differed by 13 bits, so the cut-off sits well inside the gap.
// A photo is never dropped for being merely similar. Deterministic, no AI.
import sharp from "sharp";
import type { ExtractedDocumentImage } from "./documentReadResult";

export const MAX_DIFFERING_BITS = 4;
const ASPECT_TOLERANCE = 0.03;

async function fingerprint(
  img: ExtractedDocumentImage
): Promise<boolean[] | null> {
  try {
    const data = await sharp(Buffer.from(img.dataBase64, "base64"))
      .greyscale()
      .resize(16, 16, { fit: "fill" })
      .raw()
      .toBuffer();
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    return Array.from(data, v => v >= mean);
  } catch {
    return null;
  }
}

const differingBits = (a: boolean[], b: boolean[]) =>
  a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);

const sameShape = (a: ExtractedDocumentImage, b: ExtractedDocumentImage) => {
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) / Math.max(ra, rb) <= ASPECT_TOLERANCE;
};

/** The images with repeats of the same photograph removed (first copy kept in
 * its place, unless a later copy has a caption and the first doesn't). An image
 * that can't be fingerprinted is always kept. */
export async function dropRepeatedPhotos(
  images: ExtractedDocumentImage[]
): Promise<ExtractedDocumentImage[]> {
  if (images.length < 2) return images;
  const prints = await Promise.all(images.map(fingerprint));
  const kept: Array<{ img: ExtractedDocumentImage; print: boolean[] | null }> =
    [];
  images.forEach((img, i) => {
    const print = prints[i];
    const twin = print
      ? kept.find(
          k =>
            k.print &&
            sameShape(k.img, img) &&
            differingBits(k.print, print) <= MAX_DIFFERING_BITS
        )
      : undefined;
    if (!twin) {
      kept.push({ img, print });
      return;
    }
    // Same photograph: keep the one that says who it is.
    if (!twin.img.captionName && img.captionName) twin.img = img;
  });
  return kept.map(k => k.img);
}
