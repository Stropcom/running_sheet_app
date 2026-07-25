import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";

const PERTH_TIME_ZONE = "Australia/Perth";

export interface RowAttachmentLike {
  rowDate: string | null;
  rowTime: string | null;
  memberCINs: string[];
}

// Uses the observation row's own date/time and the CINs of members on that
// row — not the upload timestamp/uploader — so the caption reflects when
// and by whom the row was logged, matching the running sheet itself.
export function formatAttachmentBanner(a: RowAttachmentLike): string {
  const parts: string[] = [];
  if (a.rowDate) {
    const d = new Date(`${a.rowDate}T00:00:00+08:00`);
    parts.push(
      new Intl.DateTimeFormat("en-AU", { timeZone: PERTH_TIME_ZONE, day: "2-digit", month: "short" }).format(d)
    );
  }
  if (a.rowTime) parts.push(a.rowTime);
  const when = parts.join(" ") || "Time not set";
  return a.memberCINs.length > 0 ? `${when} · ${a.memberCINs.join(", ")}` : when;
}

export function toAbsolutePhotoUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url, window.location.origin).href;
}

// Builds the <img> grid markup used in printed/exported profile PDFs.
// Fixed pixel `sizePx` keeps thumbnails consistently small regardless of
// page width or how many photos are in the grid (a % grid column would
// stay large when there's only one or two photos).
export function buildPhotoGridHtml(photos: Array<RowAttachmentLike & { id: number; url: string }>, sizePx = 90): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="display:flex;flex-wrap:wrap;gap:6px">
    ${photos
      .map(
        (p) => `<div style="width:${sizePx}px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;break-inside:avoid">
      <img src="${esc(toAbsolutePhotoUrl(p.url))}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block" />
      <div style="background:#000;color:#fff;font-size:7px;padding:2px 4px">${esc(formatAttachmentBanner(p))}</div>
    </div>`
      )
      .join("")}
  </div>`;
}

// ─── Entity chip + grouped photos (PDF export) ─────────────────────────────
// Shared by every Intelligence profile page's PDF export so a printed
// association list matches the web page: each entity's chip is followed
// immediately by its own linked photos, not a flat undifferentiated grid.

const CHIP_PDF_COLORS: Record<string, string> = {
  person: "background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd",
  vehicle: "background:#fef3c7;color:#d97706;border:1px solid #fcd34d",
  address: "background:#d1fae5;color:#059669;border:1px solid #6ee7b7",
  business: "background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd",
  target: "background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd",
};

function escHtml(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface EntityChipLike {
  label: string;
  type: string;
  rowCount: number;
  photos?: Array<RowAttachmentLike & { id: number; url: string }>;
}

export function buildChipHtml(label: string, type: string, count: number): string {
  const style = CHIP_PDF_COLORS[type] ?? "background:#f1f5f9;color:#475569;border:1px solid #cbd5e1";
  const displayLabel = type === "vehicle"
    ? formatIntelVehicle(label)
    : (type === "address" || type === "business")
    ? formatIntelAddress(label)
    : label;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:9999px;font-size:10px;font-weight:600;${style};margin:2px">${escHtml(displayLabel)} <span style="opacity:0.6">×${count}</span></span>`;
}

// One chip + its own photo thumbnails directly beneath it.
export function buildEntityWithPhotosHtml(item: EntityChipLike, photoPx = 70): string {
  const chip = buildChipHtml(item.label, item.type, item.rowCount);
  const photos = item.photos ?? [];
  if (!photos.length) {
    return `<div style="margin-bottom:4px">${chip}</div>`;
  }
  const photoCells = photos.map(p => `<div style="width:${photoPx}px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
      <img src="${escHtml(toAbsolutePhotoUrl(p.url))}" style="width:100%;aspect-ratio:1;object-fit:cover;display:block" />
      <div style="background:#000;color:#fff;font-size:6px;padding:2px 3px">${escHtml(formatAttachmentBanner(p))}</div>
    </div>`).join("");
  return `<div style="margin-bottom:8px">
    <div style="margin-bottom:4px">${chip}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;padding-left:6px">${photoCells}</div>
  </div>`;
}

// A list of entities, each grouped with its own photos — the PDF equivalent
// of stacking <EntityWithPhotos> rows on the web page.
export function buildEntityListWithPhotosHtml(items: EntityChipLike[]): string {
  if (!items.length) return "";
  return `<div style="display:flex;flex-direction:column;gap:2px">${items.map(i => buildEntityWithPhotosHtml(i)).join("")}</div>`;
}
