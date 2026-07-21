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
