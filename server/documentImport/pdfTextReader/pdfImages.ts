// Part of the PDF reader (server/documentImport/pdfTextReader.ts): reading the images embedded in a PDF page, with the caption under each.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { OPS, ImageKind } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import {
  matchWholeLinePersonName,
  stripPhotoCaptionLabel,
} from "../freeTextEntityScan";
import { isLikelyPhoto, isPhotoShapedSize } from "../imagePhotoFilter";
import type { ExtractedDocumentImage } from "../documentReadResult";
import { type PositionedItem, LINE_LABELS } from "./pdfShared";

/** Reads every page's text from a PDF's bytes, reconstructing labelled
 * lines as synthetic table rows and everything else as paragraph text
 * (see the module comment). Returns an empty result (not a thrown error)
 * for a corrupt, unreadable, or password-protected file, or one with no
 * text layer at all (a scanned image) — the caller surfaces that as
 * "couldn't read this file" rather than a crash, the same tolerant-
 * failure pattern docxTableReader.ts uses. */
// Size / banner-shape / flat-graphic filtering lives in imagePhotoFilter.ts
// (shared with docxTableReader.ts).

// Minimal duck-typed surface of PDFPageProxy actually used below, following
// the same pattern as RawTextItem above — pdfjs-dist's public type
// entrypoint doesn't cleanly re-export PDFPageProxy from this module path.
interface PdfObjStore {
  get(objId: string, callback: (data: unknown) => void): unknown;
}
interface PageImageSource {
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  objs: PdfObjStore;
  commonObjs: PdfObjStore;
}

/** How long to wait for one image object before giving up on that image. */
export const PDF_IMAGE_WAIT_MS = 5_000;

/**
 * Fetches a decoded image from pdf.js. An image that is used on more than one
 * page (a template's repeated icon bar, a logo, a legend) is kept by pdf.js in
 * the document-wide store, `commonObjs`, under an id starting "g_" — asking the
 * page's own `objs` for it never answers, so the read used to wait forever (the
 * import then died as the web server's 504 page). Two guards: pick the store by
 * the id, and never wait longer than PDF_IMAGE_WAIT_MS for any one image (a
 * skipped image is a smaller result, never a hung import).
 */
export function getPdfObject(
  page: Pick<PageImageSource, "objs" | "commonObjs">,
  objId: string,
  waitMs: number = PDF_IMAGE_WAIT_MS
): Promise<unknown> {
  const store = objId.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise<unknown>(resolve => {
    const timer = setTimeout(() => resolve(undefined), waitMs);
    try {
      store.get(objId, data => {
        clearTimeout(timer);
        resolve(data);
      });
    } catch {
      clearTimeout(timer);
      resolve(undefined);
    }
  });
}

interface RawPdfImage {
  width: number;
  height: number;
  kind: number;
  data: Uint8Array | Uint8ClampedArray;
}

function isRawPdfImage(v: unknown): v is RawPdfImage {
  const r = v as RawPdfImage | null;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.width === "number" &&
    typeof r.height === "number" &&
    // pdf.js's Node (non-canvas) fallback path decodes an RGB_24BPP/
    // RGBA_32BPP image into a Uint8ClampedArray, not a plain Uint8Array —
    // this interface's own field type already said so (see RawPdfImage
    // above), but this guard only ever checked the plain-Uint8Array case,
    // so every real photo silently failed the check and got skipped as if
    // it weren't an image at all. Real regression: found against two
    // actual training PDFs (each with one genuine embedded photo) that
    // both decoded this way, extracting zero images from either.
    (r.data instanceof Uint8Array || r.data instanceof Uint8ClampedArray)
  );
}

// ── Photo captions ─────────────────────────────────────────────────────────
type Matrix = [number, number, number, number, number, number];

/** PDF "cm": the new CTM is M applied in the CURRENT user space, i.e.
 * M × CTM (row-vector convention, as the PDF spec writes it). */
function multiplyMatrix(m: Matrix, ctm: Matrix): Matrix {
  return [
    m[0] * ctm[0] + m[1] * ctm[2],
    m[0] * ctm[1] + m[1] * ctm[3],
    m[2] * ctm[0] + m[3] * ctm[2],
    m[2] * ctm[1] + m[3] * ctm[3],
    m[4] * ctm[0] + m[5] * ctm[2] + ctm[4],
    m[4] * ctm[1] + m[5] * ctm[3] + ctm[5],
  ];
}

interface ImageBox {
  x0: number;
  x1: number;
  bottom: number;
  top: number;
}

/** The page-space box an image occupies: PDF paints every image into the unit
 * square, scaled/placed by the current transformation matrix. */
function imageBoxFromCtm(ctm: Matrix): ImageBox {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [ux, uy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    xs.push(ctm[0] * ux + ctm[2] * uy + ctm[4]);
    ys.push(ctm[1] * ux + ctm[3] * uy + ctm[5]);
  }
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    bottom: Math.min(...ys),
    top: Math.max(...ys),
  };
}

// How far below a photo's bottom edge a caption may sit, and the largest
// line-to-line step still counted as the same wrapped caption.
const CAPTION_MAX_DROP = 40;
const CAPTION_MAX_LINE_STEP = 14;
const CAPTION_X_SLACK = 6;

/** The person's name printed directly beneath a photo, or undefined. Only text
 * whose own centre sits within the photo's horizontal span counts (so a
 * neighbouring photo's caption on the same line is never picked up), and the
 * result must read as a whole-line person name — a heading or label
 * ("Associates:") that merely happens to sit below a photo is rejected. A
 * caption wrapped onto a second line ("Sophia Marie" / "D'ANGELO") is tried
 * both on its own first line and joined. */
function captionBelowImage(
  box: ImageBox,
  items: PositionedItem[]
): string | undefined {
  const below = items.filter(it => {
    if (!it.str.trim()) return false;
    const cx = it.x + it.width / 2;
    return (
      it.y <= box.bottom + 2 &&
      box.bottom - it.y <= CAPTION_MAX_DROP &&
      cx >= box.x0 - CAPTION_X_SLACK &&
      cx <= box.x1 + CAPTION_X_SLACK
    );
  });
  if (below.length === 0) return undefined;
  const lines: { y: number; items: PositionedItem[] }[] = [];
  for (const it of below.sort((a, b) => b.y - a.y)) {
    const line = lines.find(l => Math.abs(l.y - it.y) <= 2);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  const lineText = (l: { items: PositionedItem[] }) =>
    l.items
      .sort((a, b) => a.x - b.x)
      .map(i => i.str.trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  const first = lines[0];
  const second =
    lines[1] && first.y - lines[1].y <= CAPTION_MAX_LINE_STEP
      ? lines[1]
      : undefined;
  const attempts = [lineText(first)];
  if (second) attempts.push(`${lineText(first)} ${lineText(second)}`);
  // "Photograph: Jane SMITH" captions name the person after a label.
  return attempts.map(stripPhotoCaptionLabel).find(t => {
    const person = matchWholeLinePersonName(t);
    // "Marcus Andrew" + the next column's "ROLE" label reads as a name shape;
    // a known field label is never a surname.
    return (
      person !== null &&
      !LINE_LABELS.some(l => l.toUpperCase() === person.surname.toUpperCase())
    );
  });
}

/** Pulls every embedded photo out of one PDF page's own content stream. A
 * PDF has no separate "media" folder like a .docx (see the module comment)
 * — an image is one of the drawing operators making up the page itself, so
 * this walks the compiled operator list pdf.js already builds for text
 * extraction, looking for paintImageXObject/paintImageXObjectRepeat calls,
 * then resolves each one's decoded pixel data via page.objs (pdf.js decodes
 * the image's own encoding — JPEG/FlateDecode/etc — into this raw form
 * itself; nothing here re-implements image decoding). Running in Node (no
 * OffscreenCanvas global) keeps pdf.js on its plain-object fallback path —
 * {width, height, kind, data} — rather than the browser-only ImageBitmap
 * path, so this never depends on a canvas library. Best-effort: one bad
 * image, or a page whose operator list can't be walked, is skipped rather
 * than failing the whole read. */
export async function extractPdfPageImages(
  page: PageImageSource,
  textItems: PositionedItem[],
  sharedSeen: Set<string> = new Set()
): Promise<ExtractedDocumentImage[]> {
  const images: ExtractedDocumentImage[] = [];
  try {
    const opList = await page.getOperatorList();
    const seen = new Set<string>();
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    const ctmStack: Matrix[] = [];
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      if (fn === OPS.save) {
        ctmStack.push(ctm);
        continue;
      }
      if (fn === OPS.restore) {
        ctm = ctmStack.pop() ?? ctm;
        continue;
      }
      if (fn === OPS.transform) {
        const m = opList.argsArray[i] as unknown as number[] | undefined;
        if (m && m.length >= 6)
          ctm = multiplyMatrix(m as unknown as Matrix, ctm);
        continue;
      }
      if (fn !== OPS.paintImageXObject && fn !== OPS.paintImageXObjectRepeat)
        continue;
      const imageBox = imageBoxFromCtm(ctm);
      const objId = opList.argsArray[i]?.[0];
      if (typeof objId !== "string" || seen.has(objId)) continue;
      seen.add(objId);
      // An image shared between pages ("g_" ids) is the same picture every
      // time it comes up: read it once, on the first page that has it.
      if (objId.startsWith("g_")) {
        if (sharedSeen.has(objId)) continue;
        sharedSeen.add(objId);
      }
      try {
        const raw = await getPdfObject(page, objId);
        if (!isRawPdfImage(raw)) continue;
        if (!isPhotoShapedSize(raw.width, raw.height)) continue;
        const channels =
          raw.kind === ImageKind.RGBA_32BPP
            ? 4
            : raw.kind === ImageKind.RGB_24BPP
              ? 3
              : null;
        // GRAYSCALE_1BPP (bit-packed) or unrecognised — skip rather than
        // risk mis-decoding raw bytes with the wrong channel count.
        if (channels === null) continue;
        const decoded = sharp(Buffer.from(raw.data), {
          raw: { width: raw.width, height: raw.height, channels },
        });
        // Flat graphics (icon bars, legends) pass the size/shape check but
        // aren't photographs — see imagePhotoFilter.ts.
        if (!(await isLikelyPhoto(decoded, raw.width, raw.height))) continue;
        const png = await decoded.png().toBuffer();
        const captionName = captionBelowImage(imageBox, textItems);
        images.push({
          dataBase64: png.toString("base64"),
          mimeType: "image/png",
          width: raw.width,
          height: raw.height,
          ...(captionName ? { captionName } : {}),
        });
      } catch {
        // One undecodable image shouldn't drop the rest of the page.
      }
    }
  } catch {
    // Operator list couldn't be built for this page — no images from it.
  }
  return images;
}
