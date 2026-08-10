// Per-target intelligence profile block, shared by the Operation Profile
// export and the Intelligence Package.
//
// Deliberately styled inline rather than with classes: the same block is
// dropped into two documents whose stylesheets both define generic names
// like .section and .detail-grid differently, so class-based markup would
// silently pick up whichever host it landed in.

import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";
import {
  buildPhotoGridHtml,
  buildEntityListWithPhotosHtml,
  type RowAttachmentLike,
} from "@/lib/attachmentBanner";

const BLUE_DARK = "#1e3a8a";
const BLUE_LIGHT = "#dbeafe";
const GREY_BORDER = "#e2e8f0";

type ProfilePhoto = RowAttachmentLike & { id: number; url: string };

/** Shape of one entry in IntelOperationProfile.targets. */
export interface ProfileTargetBlock {
  targetId: number;
  name: string;
  tgt: string | null;
  hbf: string | null;
  v1f: string | null;
  v2f: string | null;
  linkedSheets: Array<{ id: number; title: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assocPersons: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assocVehicles: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assocLocations: any[];
  photos: ProfilePhoto[];
  isIndicesOnly: boolean;
}

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildProfileTargetBlockHtml(t: ProfileTargetBlock): string {
  // Deliberately no break-inside:avoid-page on the outer card: a target with
  // several photos and associations easily runs taller than a full page, and
  // forcing a tall block to stay in one piece just pushes it whole onto the
  // next page — leaving a large blank gap under whatever fit above it. Left
  // to flow naturally instead; only the header bar is kept from being
  // orphaned alone at the bottom of a page via break-after:avoid.
  return `
    <div style="margin-bottom:20px;border:1px solid ${GREY_BORDER};border-radius:8px;overflow:hidden">
      <div style="background:${BLUE_LIGHT};padding:8px 14px;border-bottom:1px solid ${GREY_BORDER};break-after:avoid;break-inside:avoid">
        <strong style="font-size:12px;color:${BLUE_DARK}">${esc(t.name)}</strong>${t.tgt ? ` <span style="font-size:10px;color:#64748b;margin-left:8px">TGT: ${esc(t.tgt)}</span>` : ""}${t.isIndicesOnly ? ` <span style="display:inline-block;margin-left:8px;padding:1px 7px;border-radius:999px;font-size:9px;font-weight:700;letter-spacing:0.04em;background:#e0e7ff;border:1px solid #c7d2fe;color:#4338ca">INDICES</span>` : ""}
      </div>
      <div style="padding:10px 14px">
        ${t.photos.length ? `<p style="font-size:10px;color:#64748b;margin-bottom:4px;font-weight:600">Photos (${t.photos.length}):</p>${buildPhotoGridHtml(t.photos, 95)}` : ""}
        ${t.hbf || t.v1f || t.v2f ? `<p style="font-size:10px;color:#64748b;margin-top:8px;margin-bottom:4px;font-weight:600">Registered Details:</p>` : ""}
        ${t.hbf ? `<p style="font-size:10px;margin-bottom:4px"><span style="color:#64748b;font-weight:600">Home:</span> ${esc(formatIntelAddress(t.hbf))}</p>` : ""}
        ${t.v1f ? `<p style="font-size:10px;margin-bottom:4px"><span style="color:#64748b;font-weight:600">Vehicle 1:</span> ${esc(formatIntelVehicle(t.v1f))}</p>` : ""}
        ${t.v2f ? `<p style="font-size:10px;margin-bottom:4px"><span style="color:#64748b;font-weight:600">Vehicle 2:</span> ${esc(formatIntelVehicle(t.v2f))}</p>` : ""}
        ${t.linkedSheets.length ? `<p style="font-size:10px;color:#64748b;margin-top:6px;margin-bottom:4px;font-weight:600">Running Sheets:</p>${t.linkedSheets.map(s => `<p style="font-size:10px;padding-left:12px">• ${esc(s.title)}</p>`).join("")}` : ""}
        ${t.assocPersons.length ? `<p style="font-size:10px;color:#64748b;margin-top:8px;margin-bottom:4px;font-weight:600">Associated Persons:</p>${buildEntityListWithPhotosHtml(t.assocPersons)}` : ""}
        ${t.assocVehicles.length ? `<p style="font-size:10px;color:#64748b;margin-top:8px;margin-bottom:4px;font-weight:600">Associated Vehicles:</p>${buildEntityListWithPhotosHtml(t.assocVehicles)}` : ""}
        ${t.assocLocations.length ? `<p style="font-size:10px;color:#64748b;margin-top:8px;margin-bottom:4px;font-weight:600">Associated Locations:</p>${buildEntityListWithPhotosHtml(t.assocLocations)}` : ""}
      </div>
    </div>`;
}
