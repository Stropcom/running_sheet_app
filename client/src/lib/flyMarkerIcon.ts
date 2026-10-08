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
  /** Caption pill under the icon — same look as the flat map's marker label
   * (white bold text on the marker's colour, rounded, white edge). */
  label?: string;
  labelColour?: string;
  /** "Label only" marker: just the pill (no icon), standing on the tail. */
  labelOnly?: boolean;
}

/** A finished picture and the size it should be shown at, in pixels. */
export interface FlyIconPicture {
  url: string;
  width: number;
  height: number;
}

const SIZE = 64;
/** The picture is taller than the icon: a short tail ends in a dot at the very
 * bottom. The 3D map pins an image by its bottom centre, so that dot is the
 * true position — the icon floats above it by a fixed number of pixels, and
 * nothing appears to slide off the spot as the camera zooms. */
const TAIL = 22;
const HEIGHT = SIZE + TAIL;
/** Height ÷ width of every picture made here. */
export const FLY_ICON_ASPECT = HEIGHT / SIZE;

/** Stem and dot at the bottom of the picture, marking the exact spot. */
function drawTail(
  ctx: CanvasRenderingContext2D,
  colour: string,
  x: number = SIZE / 2,
  height: number = HEIGHT,
  from: number = SIZE - 2
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, from);
  ctx.lineTo(x, height - 6);
  ctx.stroke();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, from);
  ctx.lineTo(x, height - 6);
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, height - 5, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const LABEL_FONT =
  '700 11px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const LABEL_H = 19;
const LABEL_MAX_W = 200;

/** Measures a caption and trims it with an ellipsis to the flat map's 200 px
 * pill limit. */
function fitLabel(ctx: CanvasRenderingContext2D, text: string) {
  ctx.font = LABEL_FONT;
  let t = text;
  let w = ctx.measureText(t).width;
  const maxText = LABEL_MAX_W - 18;
  if (w > maxText) {
    while (t.length > 1 && ctx.measureText(t + "…").width > maxText)
      t = t.slice(0, -1);
    t += "…";
    w = ctx.measureText(t).width;
  }
  return { text: t, pillW: Math.ceil(w) + 18 };
}

/** The flat map's label pill: marker-coloured, white bold text, white edge. */
function drawLabelPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  pillW: number,
  cx: number,
  y: number,
  colour: string
) {
  const x = cx - pillW / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = colour;
  roundRect(ctx, x, y, pillW, LABEL_H, LABEL_H / 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, x + 0.75, y + 0.75, pillW - 1.5, LABEL_H - 1.5, LABEL_H / 2);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = LABEL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + LABEL_H / 2 + 0.5);
  ctx.restore();
}
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

const pictureCache = new Map<string, FlyIconPicture>();

export async function composeFlyIcon(
  spec: FlyIconSpec
): Promise<FlyIconPicture> {
  const key = JSON.stringify(spec);
  const cached = pictureCache.get(key);
  if (cached) return cached;

  const measure = document.createElement("canvas").getContext("2d");
  const hasLabel = !!spec.label?.trim() && !!measure;
  const fitted = hasLabel ? fitLabel(measure!, spec.label!.trim()) : null;
  const labelColour = spec.labelColour ?? spec.countColour ?? "#2563eb";

  // Wide enough for the caption pill (and its shadow), centred on the
  // anchor so the bottom-centre dot still marks the exact spot.
  const W = fitted ? Math.max(SIZE, fitted.pillW + 12) : SIZE;
  const iconH = spec.labelOnly ? 0 : SIZE;
  const labelBlock = fitted ? LABEL_H + 4 : 0;
  const H = iconH + labelBlock + TAIL + (spec.labelOnly ? 4 : 0);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const fallback = (): FlyIconPicture => ({
    url: spec.iconUrl,
    width: SIZE,
    height: HEIGHT,
  });
  if (!ctx) return fallback();

  const cx = W / 2;
  // Stem first (the caption pill is drawn over it), from under the icon.
  drawTail(ctx, spec.countColour ?? labelColour, cx, H, iconH ? SIZE - 2 : 2);

  if (!spec.labelOnly) {
    const img = await loadImage(spec.iconUrl);
    const box = 44;
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
      const bx = cx + SIZE / 2 - 12;
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
  }

  if (fitted) {
    drawLabelPill(ctx, fitted.text, fitted.pillW, cx, iconH + 2, labelColour);
  }

  let url: string;
  try {
    url = canvas.toDataURL("image/png");
  } catch {
    // Tainted canvas (cross-origin icon without CORS) — fall back to the
    // plain icon rather than losing the marker.
    pictureCache.set(key, fallback());
    return fallback();
  }
  const out = { url, width: W, height: H };
  pictureCache.set(key, out);
  return out;
}

/** A coloured puck for a live team member. */
export function composeFlyTeamIcon(colour: string): string {
  const key = `team:${colour}`;
  const cached = dataUrlCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = colour;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2 - 4, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  drawTail(ctx, colour);
  const out = canvas.toDataURL("image/png");
  dataUrlCache.set(key, out);
  return out;
}

// ── Team member pin (option B): name pill above, state marker on the spot ──

export interface FlyTeamPinSpec {
  name: string;
  colour: string;
  state: "moving" | "short" | "long";
  onFoot: boolean;
  speedKmh: number;
  /** Rotation of the heading shape on screen, degrees clockwise from up. */
  rotation: number;
  /** Heading shape chosen by the officer (arrow, dart, cursor, emoji…). */
  shape: string;
  /** On foot: the figure faces east (mirrored). */
  faceEast: boolean;
}

// The 3D map shows a picture at its own pixel size, so this is drawn at the
// real on-screen size (the same size as the flat map's pill and marker).
const TEAM_SCALE = 1;
const POLYGON_SHAPES: Record<string, string> = {
  arrow: "12 2 19 21 12 17 5 21 12 2",
  dart: "12 1 20 22 12 16 4 22",
  cursor: "5 2 5 20 9.5 15.5 12.5 22 15.5 20.5 12.5 14 19 14",
};
const EMOJI_SHAPES: Record<string, { glyph: string; offset: number }> = {
  finger: { glyph: "☝️", offset: 0 },
  up_arrow_emoji: { glyph: "⬆️", offset: 0 },
  rocket: { glyph: "🚀", offset: 0 },
  airplane: { glyph: "✈️", offset: 0 },
  pizza: { glyph: "🍕", offset: 0 },
};

/** The team pin as one picture, laid out like the flat map's: the state
 * marker (heading shape / green dot / red dot / walking figure) sits over the
 * left end of the officer's name pill. A tail runs down from the marker to a
 * dot at the very bottom of the picture, which is the officer's true ground
 * position. The picture is padded on the left so the marker — and so the
 * tail — is at its horizontal centre, because the 3D map pins a picture by
 * its bottom centre. */
export function composeFlyTeamPin(spec: FlyTeamPinSpec): {
  url: string;
  width: number;
  height: number;
} {
  const key = `teampin2:${JSON.stringify(spec)}`;
  const S = TEAM_SCALE;
  const pillH = 20; // 10px text + 3px padding top and bottom + 1.5px border
  const rowH = 28; // tall enough for the biggest state marker
  const topPad = 3;
  const tail = 24;
  const cssH = topPad + rowH + tail;
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) return { url: "", width: 40, height: cssH };
  measure.font = `800 10px Arial, sans-serif`;
  // Flat map pill: padding 3px 10px 3px 17px, left edge 9px left of the marker
  const textW = measure.measureText(spec.name).width + spec.name.length * 0.6;
  const pillW = Math.ceil(textW + 17 + 10 + 3);
  const right = Math.max(pillW - 9, 22);
  const cssW = Math.ceil(right * 2 + 6);
  const cached = dataUrlCache.get(key);
  if (cached) return { url: cached, width: cssW, height: cssH };

  canvas.width = cssW * S;
  canvas.height = cssH * S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { url: "", width: cssW, height: cssH };
  ctx.scale(S, S);

  const cx = cssW / 2; // marker centre = true position's x
  const cy = topPad + rowH / 2;

  // Name pill, starting 9px left of the marker's centre
  const px = cx - 9;
  const py = cy - pillH / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, px, py, pillW, pillH, pillH / 2);
  ctx.fillStyle = spec.colour;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, px, py, pillW, pillH, pillH / 2);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 10px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(spec.name, px + 17, cy + 0.5);

  // Tail first (so the marker draws over its top): stem down to the ground dot
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 6);
  ctx.lineTo(cx, cssH - 5);
  ctx.stroke();
  ctx.strokeStyle = spec.colour;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 6);
  ctx.lineTo(cx, cssH - 5);
  ctx.stroke();
  ctx.fillStyle = spec.colour;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cssH - 4, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // State marker over the left end of the pill
  if (spec.onFoot) {
    const glyph =
      spec.state === "long" ? "🧍" : spec.speedKmh > 5 ? "🏃" : "🚶";
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(spec.faceEast ? -1 : 1, 1);
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 2;
    ctx.fillText(glyph, 0, 1);
    ctx.restore();
  } else if (spec.state === "moving") {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((spec.rotation * Math.PI) / 180);
    const emoji = EMOJI_SHAPES[spec.shape];
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    if (emoji) {
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji.glyph, 0, 1);
    } else {
      const pts = (POLYGON_SHAPES[spec.shape] ?? POLYGON_SHAPES.arrow)
        .split(" ")
        .map(Number);
      const k = 25 / 24;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        const x = (pts[i] - 12) * k;
        const y = (pts[i + 1] - 12) * k;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = "#16a34a";
      ctx.fill();
    }
    ctx.restore();
  } else {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = spec.state === "short" ? "#22c55e" : "#dc2626";
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  let out = "";
  try {
    out = canvas.toDataURL("image/png");
  } catch {
    out = "";
  }
  dataUrlCache.set(key, out);
  return { url: out, width: cssW, height: cssH };
}

// ── Target location flag ───────────────────────────────────────────────────

export interface FlyTargetFlagSpec {
  /** The state emoji (TARGET_EMOJI), e.g. "🧍". */
  emoji: string;
  /** The wording, e.g. "RAHMAN · inside". */
  text: string;
  /** Dashed border when the target is out of sight. */
  unsure: boolean;
  /** Pixels of empty picture under the flag's stem, so the flag floats clear
   * above the pin picture that stands on the same spot. */
  lift: number;
}

const FLAG_PINK = "#e0338a";
// The 3D map shows a picture at its own pixel size and ignores the width and
// height it is given, so the flag must be drawn at exactly its on-screen size
// (a 2x picture appears twice as big, and twice as high above the pin).
const FLAG_SCALE = 1;

/** The flat map's target flag — white pill, state emoji, pink edge, short
 * stem — drawn as one picture for the 3D map. The 3D map pins a picture by its
 * bottom centre, which is the target's spot; the picture ends in `lift` pixels
 * of transparent space so the flag rides above the pin standing there. */
export function composeFlyTargetFlag(spec: FlyTargetFlagSpec): {
  url: string;
  width: number;
  height: number;
} {
  const key = `targetflag2:${JSON.stringify(spec)}`;
  const S = FLAG_SCALE;
  const font = "700 12px system-ui, -apple-system, 'Segoe UI', sans-serif";
  const emojiFont =
    "16px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return { url: "", width: 40, height: 40 };
  measure.font = font;
  const textW = measure.measureText(spec.text).width;
  measure.font = emojiFont;
  const emojiW = measure.measureText(spec.emoji).width;
  // Flat map pill: 2px border, padding 3px 10px 3px 7px, 6px gap.
  const pillW = Math.ceil(2 + 8 + emojiW + 6 + textW + 11 + 2);
  const pillH = 27;
  const stem = 8;
  const pad = 6; // room for the shadow
  const cssW = pillW + pad * 2;
  const cssH = pad + pillH + stem + Math.max(0, Math.round(spec.lift));
  const cached = dataUrlCache.get(key);
  if (cached) return { url: cached, width: cssW, height: cssH };

  const canvas = document.createElement("canvas");
  canvas.width = cssW * S;
  canvas.height = cssH * S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { url: "", width: cssW, height: cssH };
  ctx.scale(S, S);

  const px = pad;
  const py = pad - 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, px, py, pillW, pillH, pillH / 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = FLAG_PINK;
  ctx.lineWidth = 2;
  if (spec.unsure) ctx.setLineDash([4, 3]);
  roundRect(ctx, px + 1, py + 1, pillW - 2, pillH - 2, (pillH - 2) / 2);
  ctx.stroke();
  ctx.restore();

  const cy = py + pillH / 2;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = emojiFont;
  ctx.fillStyle = "#000000";
  ctx.fillText(spec.emoji, px + 2 + 8, Math.round(cy) + 1);
  ctx.font = font;
  ctx.fillStyle = "#000000";
  ctx.fillText(spec.text, Math.round(px + 2 + 8 + emojiW + 6), Math.round(cy));

  // Stem from the pill down toward the pin.
  ctx.fillStyle = FLAG_PINK;
  roundRect(ctx, cssW / 2 - 1, py + pillH - 1, 2, stem + 1, 1);
  ctx.fill();

  let out = "";
  try {
    out = canvas.toDataURL("image/png");
  } catch {
    out = "";
  }
  dataUrlCache.set(key, out);
  return { url: out, width: cssW, height: cssH };
}
