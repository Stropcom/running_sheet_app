// Builds the small picture used for a marker in the 3D "Fly" view: the same
// icon the flat map shows, with the entity-count badge and the photo pill
// drawn onto it (the 3D map's markers only take an image, not our HTML
// markers). Results are cached by their inputs, so redrawing every few
// seconds is cheap.

export interface FlyIconSpec {
  /** Icon image (data URL or same-origin path) — e.g. getMarkerIconUrl(). */
  iconUrl: string;
  rotation?: number;
  /** Entity count badge (top right); 0/undefined = none. */
  count?: number;
  countColour?: string;
  /** Photo pill (bottom centre): green half running-sheet, blue half profile. */
  runningSheetPhotos?: boolean;
  profilePhotos?: boolean;
}

const SIZE = 64;
const dataUrlCache = new Map<string, string>();
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Portrait glyph (head and shoulders in a frame) centred on (cx, cy). */
function drawPortrait(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 1.4;
  roundRect(ctx, cx - 6, cy - 6, 12, 12, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - 1.5, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy + 5);
  ctx.quadraticCurveTo(cx, cy, cx + 4, cy + 5);
  ctx.stroke();
  ctx.restore();
}

/** Photo glyph (landscape in a frame) centred on (cx, cy). */
function drawPhoto(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 1.4;
  roundRect(ctx, cx - 6.5, cy - 5, 13, 10, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - 2.5, cy - 1.5, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 5.5, cy + 4);
  ctx.lineTo(cx - 1.5, cy);
  ctx.lineTo(cx + 1, cy + 2.5);
  ctx.lineTo(cx + 3, cy + 0.5);
  ctx.lineTo(cx + 5.5, cy + 4);
  ctx.stroke();
  ctx.restore();
}

export async function composeFlyIcon(spec: FlyIconSpec): Promise<string> {
  const key = JSON.stringify(spec);
  const cached = dataUrlCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return spec.iconUrl;

  const img = await loadImage(spec.iconUrl);
  const box = 44;
  const cx = SIZE / 2;
  const cy = SIZE / 2 - 1;
  if (img) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((spec.rotation ?? 0) * Math.PI) / 180);
    ctx.drawImage(img, -box / 2, -box / 2, box, box);
    ctx.restore();
  } else {
    ctx.fillStyle = spec.countColour ?? "#7c3aed";
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  if (spec.count && spec.count > 0) {
    const bx = SIZE - 12;
    const by = 12;
    ctx.fillStyle = spec.countColour ?? "#7c3aed";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(spec.count), bx, by + 0.5);
  }

  if (spec.runningSheetPhotos || spec.profilePhotos) {
    const both = spec.runningSheetPhotos && spec.profilePhotos;
    const h = 18;
    const w = both ? 40 : 24;
    const x = cx - w / 2;
    const y = SIZE - h - 1;
    const half = both ? w / 2 : w;
    ctx.save();
    roundRect(ctx, x, y, w, h, 9);
    ctx.clip();
    let hx = x;
    if (spec.profilePhotos) {
      ctx.fillStyle = "#2563eb";
      ctx.fillRect(hx, y, half, h);
      drawPortrait(ctx, hx + half / 2, y + h / 2);
      hx += half;
    }
    if (spec.runningSheetPhotos) {
      ctx.fillStyle = "#10b981";
      ctx.fillRect(hx, y, half, h);
      drawPhoto(ctx, hx + half / 2, y + h / 2);
    }
    ctx.restore();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, 9);
    ctx.stroke();
  }

  let out: string;
  try {
    out = canvas.toDataURL("image/png");
  } catch {
    // Tainted canvas (cross-origin icon without CORS) — fall back to the
    // plain icon rather than losing the marker.
    out = spec.iconUrl;
  }
  dataUrlCache.set(key, out);
  return out;
}

/** A coloured puck for a live team member. */
export function composeFlyTeamIcon(colour: string): string {
  const key = `team:${colour}`;
  const cached = dataUrlCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = colour;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const out = canvas.toDataURL("image/png");
  dataUrlCache.set(key, out);
  return out;
}
