// Per-target intelligence profile block, shared by the Operation Profile
// export and the Intelligence Package.
//
// Deliberately styled inline rather than with classes: the same block is
// dropped into two documents whose stylesheets both define generic names
// like .section and .detail-grid differently, so class-based markup would
// silently pick up whichever host it landed in.

import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";
import {
  groupDetailEntries,
  targetDetailEntries,
} from "@/lib/registeredDetails";
import {
  extraAddressHeading,
  parseExtraAddresses,
  withAddressLabel,
} from "@shared/extraAddresses";
import {
  buildPhotoGridHtml,
  buildEntityListWithPhotosHtml,
  type RowAttachmentLike,
} from "@/lib/attachmentBanner";
import {
  formatBail,
  specialProjectsOrNone,
  mdlLabel,
} from "@shared/targetStatus";

const BLUE_DARK = "#1e3a8a";
const BLUE_MID = "#93c5fd";
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
  /** JSON [{full, short}] — Address 2, 3, … */
  extraAddresses?: string | null;
  /** JSON [{full, short}] — further vehicles, numbered from 2 as on the Target Profile. */
  extraVehicles?: string | null;
  mdlStatus?: string | null;
  bailStatus?: string | null;
  bailConditions?: string | null;
  bailConditionsText?: string | null;
  /** JSON [{key, detail}] — TI / LBS / SEEK / CAD. */
  specialProjects?: string | null;
  /** Freeform Background written in the Target Registry. */
  registryBackground?: string | null;
  registryAssociates?: Array<{
    id: number;
    name: string;
    hbf: string | null;
    extraAddresses?: string | null;
    isIndicesOnly: boolean;
    relationship?: string;
  }>;
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

/** A section heading bar, matching the standalone Target Profile export. */
const sectionTitle = (label: string) =>
  `<div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BLUE_DARK};padding:5px 9px;background:${BLUE_LIGHT};border-left:3px solid ${BLUE_MID};margin:12px 0 7px;break-after:avoid;break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact">${esc(label)}</div>`;

/** Label / value rows, two columns, as in the Target Profile export. */
const detailGrid = (rows: Array<[string, string]>) =>
  `<div style="display:grid;grid-template-columns:110px 1fr;gap:3px 12px;font-size:10px;padding:0 4px">${rows
    .map(
      ([k, v]) =>
        `<span style="color:#64748b">${esc(k)}</span><span>${esc(v)}</span>`
    )
    .join("")}</div>`;

/** Every address on an associate / resident registry record, main first. */
export function registryPersonAddresses(
  hbf: string | null | undefined,
  extraAddresses: string | null | undefined
): string[] {
  // Extras carry their label in front ("Work — …") so it shows with them.
  const extras = parseExtraAddresses(extraAddresses).map(a =>
    a.value ? withAddressLabel(a.label, a.value) : ""
  );
  return [hbf?.trim() || "", ...extras].filter(Boolean);
}

const parseExtras = (json: string | null | undefined): string[] => {
  if (!json) return [];
  try {
    const list: Array<{ full?: string; short?: string }> = JSON.parse(json);
    return list.map(x => x.full?.trim() || x.short?.trim() || "");
  } catch {
    return [];
  }
};

const registryList = (
  people: NonNullable<ProfileTargetBlock["registryAssociates"]>
) =>
  `<div style="border:1px solid ${GREY_BORDER};border-radius:6px;overflow:hidden">${people
    .map(
      a =>
        `<div style="display:flex;gap:8px;align-items:center;padding:4px 9px;font-size:10px;border-bottom:1px solid ${GREY_BORDER}"><span style="flex:1">${esc(a.name)}${a.isIndicesOnly ? ` <span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;font-size:9px;font-weight:700;letter-spacing:0.04em;background:#e0e7ff;border:1px solid #c7d2fe;color:#4338ca">INDICES</span>` : ""}</span><span style="color:#64748b;text-align:right">${registryPersonAddresses(a.hbf, a.extraAddresses).map(esc).join("<br>")}</span></div>`
    )
    .join("")}</div>`;

export function buildProfileTargetBlockHtml(t: ProfileTargetBlock): string {
  // Same sections, in the same order, as the target's drop-down on the
  // Operation Profile and the standalone Target Profile.
  //
  // Deliberately no break-inside:avoid-page on the outer card: a target with
  // several photos and associations easily runs taller than a full page, and
  // forcing a tall block to stay in one piece just pushes it whole onto the
  // next page — leaving a large blank gap under whatever fit above it. Left
  // to flow naturally instead; only the header bar is kept from being
  // orphaned alone at the bottom of a page via break-after:avoid.
  const detailGroups = groupDetailEntries(targetDetailEntries(t));

  const status: Array<[string, string]> = [];
  if (t.mdlStatus) status.push(["MDL", mdlLabel(t.mdlStatus)]);
  if (t.bailStatus) status.push(["Bail", formatBail(t)]);
  status.push(["Special Projects", specialProjectsOrNone(t.specialProjects)]);

  const residents = (t.registryAssociates ?? []).filter(
    a => a.relationship === "resident"
  );
  const associates = (t.registryAssociates ?? []).filter(
    a => a.relationship !== "resident"
  );
  const hasAssoc =
    t.assocPersons.length || t.assocVehicles.length || t.assocLocations.length;
  const subTitle = (label: string) =>
    `<p style="font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin:6px 0 4px;padding-bottom:3px;border-bottom:1px solid ${GREY_BORDER}">${label}</p>`;

  return `
    <div style="margin-bottom:20px;border:1px solid ${GREY_BORDER};border-radius:8px;overflow:hidden">
      <div style="background:${BLUE_LIGHT};padding:8px 14px;border-bottom:1px solid ${GREY_BORDER};break-after:avoid;break-inside:avoid">
        <strong style="font-size:12px;color:${BLUE_DARK}">${esc(t.name)}</strong>${t.tgt ? ` <span style="font-size:10px;color:#64748b;margin-left:8px">TGT: ${esc(t.tgt)}</span>` : ""}${t.isIndicesOnly ? ` <span style="display:inline-block;margin-left:8px;padding:1px 7px;border-radius:999px;font-size:9px;font-weight:700;letter-spacing:0.04em;background:#e0e7ff;border:1px solid #c7d2fe;color:#4338ca">INDICES</span>` : ""}
      </div>
      <div style="padding:2px 14px 10px">
        ${t.photos.length ? `${sectionTitle(`Photos (${t.photos.length})`)}${buildPhotoGridHtml(t.photos)}` : ""}
        ${detailGroups.length ? `${sectionTitle("Registered Details")}${detailGroups.map(g => `${subTitle(g.title)}${detailGrid(g.items.map(e => [e.label, e.value] as [string, string]))}`).join("")}` : ""}
        ${sectionTitle("Status")}${detailGrid(status)}
        ${t.registryBackground?.trim() ? `${sectionTitle("Background")}<div style="white-space:pre-wrap;font-size:10.5px;line-height:1.6;overflow-wrap:anywhere;padding:2px 4px">${esc(t.registryBackground)}</div>` : ""}
        ${residents.length ? `${sectionTitle("Other Home Address Residents")}${registryList(residents)}` : ""}
        ${associates.length ? `${sectionTitle("Registered Associates")}${registryList(associates)}` : ""}
        ${
          hasAssoc
            ? `${sectionTitle("Operational Associations")}
        ${t.assocPersons.length ? `${subTitle("Persons")}${buildEntityListWithPhotosHtml(t.assocPersons)}` : ""}
        ${t.assocVehicles.length ? `${subTitle("Vehicles")}${buildEntityListWithPhotosHtml(t.assocVehicles)}` : ""}
        ${t.assocLocations.length ? `${subTitle("Locations")}${buildEntityListWithPhotosHtml(t.assocLocations)}` : ""}`
            : ""
        }
        ${t.linkedSheets.length ? `${sectionTitle("Running Sheets")}${t.linkedSheets.map(s => `<p style="font-size:10px;padding:2px 4px">• ${esc(s.title)}</p>`).join("")}` : ""}
      </div>
    </div>`;
}
