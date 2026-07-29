// Attachment photos are for display only, not evidentiary originals, so every
// upload is downscaled/re-encoded client-side to a consistent small JPEG —
// this also sidesteps the iOS HEIC→JPEG-on-share size blowup since
// everything gets normalized regardless of source format.
const ATTACHMENT_MAX_DIMENSION = 1920;
const ATTACHMENT_JPEG_QUALITY = 0.82;

function drawToJpegBlob(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number
): Promise<Blob | null> {
  let width = srcWidth;
  let height = srcHeight;
  if (width > ATTACHMENT_MAX_DIMENSION || height > ATTACHMENT_MAX_DIMENSION) {
    const scale = ATTACHMENT_MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", ATTACHMENT_JPEG_QUALITY));
}

export async function compressAttachmentImage(
  file: File
): Promise<{ blob: Blob; mimeType: string; fileName: string } | null> {
  const fileName = file.name.replace(/\.[^.]+$/, "") + ".jpg";

  // Primary path — fast, works for the vast majority of photos.
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const blob = await drawToJpegBlob(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    if (blob) return { blob, mimeType: "image/jpeg", fileName };
  } catch {
    // fall through to the <img>-based fallback below
  }

  // Fallback — Portrait-mode HEIC photos (embedded depth map, a multi-image
  // container) are known to fail createImageBitmap on iOS Safari even though
  // the browser can still render them fine via a plain <img>. Without this,
  // compression silently gives up and the full-size original (often several
  // MB) gets base64-JSON-uploaded as-is, which is much more likely to fail
  // outright on a weak mobile connection.
  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("image element failed to load"));
        el.src = objectUrl;
      });
      const blob = await drawToJpegBlob(img, img.naturalWidth, img.naturalHeight);
      if (blob) return { blob, mimeType: "image/jpeg", fileName };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    // fall through
  }

  return null; // both paths failed — fall back to uploading the original file untouched
}
