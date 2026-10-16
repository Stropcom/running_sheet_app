import { useLocation } from "wouter";
import { useRef } from "react";
import { HereProvider, isHere, useHere } from "@/lib/currentProfiles";
import { trpc } from "@/lib/trpc";
import { formatIntelAddress } from "@/lib/addressFormat";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapView } from "@/components/Map";
import {
  ExternalLink,
  FileDown,
  User,
  MapPin,
  FileText,
  Folder,
  AlertTriangle,
} from "lucide-react";
import { EntityPhotosSection } from "@/components/EntityPhotosSection";
import {
  buildPhotoGridHtml,
  buildEntityListWithPhotosHtml,
  type RowAttachmentLike,
} from "@/lib/attachmentBanner";
import { type IntelAssocEntity } from "@/components/IntelEntityChip";
import { IndicesBadge } from "@/components/IndicesBadge";
import {
  ProfileDropdownRow,
  IntelEntityDropdown,
} from "@/components/ProfileDropdown";
import { SectionHeading } from "@/components/ProfileSectionHeading";
import {
  JumpBar,
  PDF_PERSON_ROW_CSS,
  ProfileCard,
  SheetsCard,
  fetchFirstPhotoUrl,
  pdfPersonRowHtml,
  PDF_SECTION_LAYOUT_CSS,
  pdfPageFrameCss,
} from "@/components/ProfileKit";
import { PersonLinkRow } from "@/components/PersonLinkRow";

type ProfilePhoto = RowAttachmentLike & { id: number; url: string };

type IntelProfileEntity = IntelAssocEntity;
export interface IntelLocationProfile {
  label: string;
  fullAddress: string | null;
  linkedTargets: Array<{ targetId: number; name: string }>;
  linkedAssociates: Array<{
    associateId: number;
    name: string;
    targetId: number;
    targetName: string;
  }>;
  linkedOperations: Array<{ id: number; name: string }>;
  linkedSheets: Array<{
    id: number;
    title: string;
    operationId: number;
    operationName: string;
  }>;
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  isPrevious?: boolean;
  isIndicesOnly: boolean;
}

function buildLocationProfileHtml(
  profile: IntelLocationProfile,
  photos: ProfilePhoto[],
  /** First photo of each linked target / associate, by id (null = none). */
  personPhotos: {
    targets: Map<number, string | null>;
    associates: Map<number, string | null>;
  } = { targets: new Map(), associates: new Map() }
) {
  const esc = (s: string | null | undefined) =>
    (s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const BLUE_DARK = "#1e3a8a";
  const BLUE_MID = "#93c5fd";
  const BLUE_LIGHT = "#dbeafe";
  const GREY_TEXT = "#1e293b";
  const GREY_BORDER = "#e2e8f0";
  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RunLog — Location Profile: ${esc(profile.label)}</title>
<style>* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; } body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.cover-header { background:#064e3b !important; color:#fff !important; padding:28px 32px 22px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#6ee7b7 !important; margin-bottom:14px; }
.entity-name { font-size:22px; font-weight:700; } .gen-time { font-size:9px; opacity:0.6; margin-top:12px; }
.stats-row { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding:16px 32px; background:#d1fae5 !important; border-bottom:2px solid #6ee7b7; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.stat-box { text-align:center; } .stat-num { font-size:20px; font-weight:700; color:#064e3b !important; } .stat-label { font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; }
.content { padding:20px 32px; } .section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#064e3b !important; padding:6px 10px; background:#d1fae5 !important; border-left:3px solid #6ee7b7; margin-bottom:10px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.sub-title { font-size:9px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#64748b; margin-bottom:6px; border-bottom:1px solid ${GREY_BORDER}; padding-bottom:4px; }
${PDF_PERSON_ROW_CSS}
.footer { margin-top:32px; padding-top:12px; border-top:1px solid ${GREY_BORDER}; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:#064e3b !important; } .stats-row { background:#d1fae5 !important; } .section-title { background:#d1fae5 !important; } }
${PDF_SECTION_LAYOUT_CSS}
${pdfPageFrameCss("#6ee7b7")}
</style></head><body>
<div class="cover-header">
  <div class="brand-label">RunLog Intelligence Profile — Location</div>
  <div class="entity-name">${esc(profile.label)}${profile.isIndicesOnly ? `<span style="display:inline-block;margin-left:10px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.05em;vertical-align:middle;background:rgba(129,140,248,0.25);border:1px solid rgba(199,210,254,0.5);color:#e0e7ff">INDICES</span>` : ""}</div>
  ${profile.isPrevious ? `<div style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:3px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;background:rgba(255,255,255,0.15);color:#fff">Previous</div>` : ""}
  <div class="gen-time">Generated: ${generatedAt}</div>
</div>
<div class="stats-row">
  <div class="stat-box"><div class="stat-num">${profile.linkedTargets.length}</div><div class="stat-label">Linked Targets</div></div>
  <div class="stat-box"><div class="stat-num">${profile.linkedOperations.length}</div><div class="stat-label">Operations</div></div>
  <div class="stat-box"><div class="stat-num">${profile.linkedSheets.length}</div><div class="stat-label">Running Sheets</div></div>
  <div class="stat-box"><div class="stat-num">${profile.assocPersons.length + profile.assocVehicles.length}</div><div class="stat-label">Associations</div></div>
</div>
<div class="content">
  ${photos.length ? `<div style="margin-bottom:16px"><div class="section-title">Photos (${photos.length})</div>${buildPhotoGridHtml(photos)}</div>` : ""}
  ${
    profile.linkedOperations.length
      ? `<div style="margin-bottom:16px"><div class="section-title">Operations</div>
    ${profile.linkedOperations.length > 1 ? `<p style="font-size:10px;font-weight:600;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:4px;padding:6px 8px;margin-bottom:8px">Seen across ${profile.linkedOperations.length} separate operations — worth checking for a cross-operation connection.</p>` : ""}
    <div style="display:flex;flex-wrap:wrap;gap:6px">${profile.linkedOperations.map(o => `<span style="background:#d1fae5;color:#064e3b;border:1px solid #6ee7b7;border-radius:6px;padding:3px 10px;font-size:10px;font-weight:600">${esc(o.name)}</span>`).join("")}</div>
  </div>`
      : ""
  }
  ${profile.linkedTargets.length ? `<div style="margin-bottom:16px"><div class="section-title">Linked Targets</div>${profile.linkedTargets.map(t => pdfPersonRowHtml({ name: t.name, tag: "Target", tone: "target", url: personPhotos.targets.get(t.targetId) ?? null })).join("")}</div>` : ""}
  ${profile.linkedAssociates.length ? `<div style="margin-bottom:16px"><div class="section-title">Registered Associate${profile.linkedAssociates.length > 1 ? "s" : ""}</div>${profile.linkedAssociates.map(a => pdfPersonRowHtml({ name: a.name, sub: `Associate of ${a.targetName}`, tag: "Associate", tone: "associate", url: personPhotos.associates.get(a.associateId) ?? null })).join("")}</div>` : ""}
  ${
    profile.assocPersons.length || profile.assocVehicles.length
      ? `<div style="margin-bottom:16px"><div class="section-title">Operational Associations</div>
    ${profile.assocPersons.length ? `<div class="sub-title">Persons</div>${buildEntityListWithPhotosHtml(profile.assocPersons)}` : ""}
    ${profile.assocVehicles.length ? `<div class="sub-title">Vehicles</div>${buildEntityListWithPhotosHtml(profile.assocVehicles)}` : ""}
  </div>`
      : ""
  }
  ${profile.linkedSheets.length ? `<div style="margin-bottom:16px"><div class="section-title">Running Sheets</div>${profile.linkedSheets.map(s => `<p style="font-size:10px;padding:3px 0;border-bottom:1px solid ${GREY_BORDER}">${esc(s.title)} <span style="color:#64748b">— ${esc(s.operationName)}</span></p>`).join("")}</div>` : ""}
  <div class="footer"><span>RunLog — Location Intelligence Profile</span><span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span></div>
</div>
${buildExportPreviewCloseBar()}
</body></html>`;
}

/**
 * Self-contained location profile — fetches its own data by label and renders
 * identically wherever it's mounted: the standalone page, or inline inside a
 * drop-down on another profile (`embedded`, which drops the banner and Back
 * button and adds an "Open full profile" button).
 */
export function LocationProfileContent({
  label,
  embedded = false,
}: {
  label: string;
  embedded?: boolean;
}) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const displayLabel = formatIntelAddress(label);
  const { data, isLoading, error } = trpc.intelligence.locationProfile.useQuery(
    { label },
    { enabled: !!label }
  );
  const here = useHere("location", label);
  const rawProfile = data as IntelLocationProfile | undefined;
  // Links to a profile we're already inside are left out.
  const profile = rawProfile && {
    ...rawProfile,
    linkedOperations: rawProfile.linkedOperations.filter(
      o => !isHere(here, "operation", o.id)
    ),
    linkedTargets: rawProfile.linkedTargets.filter(
      t => !isHere(here, "target", t.targetId)
    ),
    linkedAssociates: rawProfile.linkedAssociates.filter(
      a => !isHere(here, "associate", a.name)
    ),
  };
  const { data: photosData } = trpc.attachment.byEntity.useQuery(
    { category: "location", entityLabel: label },
    { enabled: !!label }
  );
  const photos = (photosData ?? []) as ProfilePhoto[];
  const mapRef = useRef<google.maps.Map | null>(null);

  function handleMapReady(map: google.maps.Map) {
    mapRef.current = map;
    if (!label) return;
    const geocoder = new window.google.maps.Geocoder();
    // `label` is often just a business/place name with no street or suburb
    // at all (composeAddress's bracketCode — see shared/addressFormat.ts),
    // which the Geocoding API can't resolve reliably on its own. Prefer the
    // fuller "<street>, SUBURB STATE" form the server recovers from an
    // observation's free text; only fall back to the bare label + a blanket
    // "Western Australia" when no fuller form is available.
    const baseQuery = profile?.fullAddress || label;
    const searchQuery = /\b(WA|NSW|VIC|QLD|SA|TAS|NT|ACT)\b/.test(baseQuery)
      ? `${baseQuery}, Australia`
      : `${baseQuery}, Western Australia, Australia`;
    geocoder.geocode({ address: searchQuery }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const loc = results[0].geometry.location;
        map.setCenter(loc);
        map.setZoom(16);
        new window.google.maps.marker.AdvancedMarkerElement({
          map,
          position: loc,
          title: label,
        });
      }
    });
  }

  const jumpItems = profile
    ? [
        { id: "photos", label: "Photos" },
        ...(profile.linkedOperations.length > 0
          ? [{ id: "operations", label: "Operations" }]
          : []),
        ...(profile.linkedTargets.length > 0
          ? [{ id: "targets", label: "Targets" }]
          : []),
        ...(profile.linkedAssociates.length > 0
          ? [{ id: "associates", label: "Associates" }]
          : []),
        ...(profile.assocPersons.length + profile.assocVehicles.length > 0
          ? [{ id: "associations", label: "Associations" }]
          : []),
        ...(profile.linkedSheets.length > 0
          ? [{ id: "sheets", label: "Sheets" }]
          : []),
        { id: "map", label: "Map" },
      ]
    : [];

  async function exportPdf() {
    if (!profile) return;
    // Open the window first (inside the click) so the browser doesn't block
    // it, then fill it once each person's photo has been looked up.
    const win = window.open("", "_blank");
    if (!win) return;
    const personPhotos = {
      targets: new Map<number, string | null>(),
      associates: new Map<number, string | null>(),
    };
    await Promise.all([
      ...profile.linkedTargets.map(async t =>
        personPhotos.targets.set(
          t.targetId,
          await fetchFirstPhotoUrl(utils, {
            category: "target",
            targetId: t.targetId,
          })
        )
      ),
      ...profile.linkedAssociates.map(async a =>
        personPhotos.associates.set(
          a.associateId,
          await fetchFirstPhotoUrl(utils, {
            category: "associate",
            label: a.name,
          })
        )
      ),
    ]);
    const html = buildLocationProfileHtml(
      { ...profile, label: displayLabel },
      photos,
      personPhotos
    );
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  return (
    <HereProvider value={here}>
      <div className={embedded ? "pt-1" : "px-4 pb-6 pt-5"}>
        {isLoading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        )}
        {error && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">Profile not found.</p>
          </div>
        )}
        {profile && (
          <>
            {!embedded && (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm mb-5">
                <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 px-6 py-5 text-white">
                  <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap sm:gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/30">
                          <MapPin className="w-3 h-3" /> Location
                        </span>
                        {profile.isIndicesOnly && (
                          <IndicesBadge variant="on-dark" size="header" />
                        )}
                      </div>
                      <h1 className="text-lg sm:text-2xl leading-snug font-bold tracking-tight break-words">
                        {displayLabel}
                      </h1>
                      {profile.isPrevious && (
                        <span className="inline-block mt-2 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-white/15 text-white">
                          Previous
                        </span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportPdf}
                      className="bg-white/10 border-white/30 text-white hover:bg-white/20 shrink-0"
                    >
                      <FileDown className="w-4 h-4 mr-1.5" /> Export PDF
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border/60 bg-emerald-50/50 dark:bg-emerald-950/20">
                  {[
                    {
                      label: "Linked Targets",
                      value: profile.linkedTargets.length,
                    },
                    {
                      label: "Operations",
                      value: profile.linkedOperations.length,
                    },
                    {
                      label: "Running Sheets",
                      value: profile.linkedSheets.length,
                    },
                    {
                      label: "Associations",
                      value:
                        profile.assocPersons.length +
                        profile.assocVehicles.length,
                    },
                  ].map(stat => (
                    <div key={stat.label} className="px-4 py-3 text-center">
                      <p className="text-xl font-bold text-emerald-900 dark:text-emerald-300">
                        {stat.value}
                      </p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!embedded && <JumpBar items={jumpItems} />}

            <EntityPhotosSection
              category="location"
              entityLabel={profile.label}
              showEmpty
            />

            {profile.linkedOperations.length > 0 && (
              <ProfileCard
                id="operations"
                label="Operations"
                count={profile.linkedOperations.length}
              >
                {profile.linkedOperations.length > 1 && (
                  <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      This location has been seen across{" "}
                      {profile.linkedOperations.length} separate operations —
                      worth checking for a cross-operation connection.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  {profile.linkedOperations.map(op => (
                    <ProfileDropdownRow
                      key={op.id}
                      kind="operation"
                      refId={op.id}
                    >
                      <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="text-xs font-medium text-foreground flex-1 min-w-0 break-words">
                        {op.name}
                      </span>
                    </ProfileDropdownRow>
                  ))}
                </div>
              </ProfileCard>
            )}

            {profile.linkedTargets.length > 0 && (
              <ProfileCard
                id="targets"
                label="Linked Targets"
                count={profile.linkedTargets.length}
              >
                <div className="space-y-2">
                  {profile.linkedTargets.map(t => (
                    <PersonLinkRow
                      key={t.targetId}
                      kind="target"
                      refId={t.targetId}
                      targetId={t.targetId}
                      name={t.name}
                      tone="target"
                    />
                  ))}
                </div>
              </ProfileCard>
            )}

            {profile.linkedAssociates.length > 0 && (
              <ProfileCard
                id="associates"
                label={
                  profile.linkedAssociates.length > 1
                    ? "Registered Associates"
                    : "Registered Associate"
                }
                count={profile.linkedAssociates.length}
              >
                <div className="space-y-2">
                  {profile.linkedAssociates.map(a => (
                    <PersonLinkRow
                      key={a.associateId}
                      kind="associate"
                      refId={a.name}
                      name={a.name}
                      tone="associate"
                      sub={`Associate of ${a.targetName}`}
                    />
                  ))}
                </div>
              </ProfileCard>
            )}

            {(profile.assocPersons.length > 0 ||
              profile.assocVehicles.length > 0) && (
              <ProfileCard
                id="associations"
                label="Operational Associations"
                count={
                  profile.assocPersons.length + profile.assocVehicles.length
                }
              >
                <p className="mb-3 text-xs italic text-muted-foreground">
                  Entities observed in the same running sheet rows as this
                  location
                </p>
                <div className="flex flex-col gap-4">
                  {profile.assocPersons.length > 0 && (
                    <div>
                      <SectionHeading
                        sub
                        label="Associated Persons"
                        count={profile.assocPersons.length}
                      />
                      <div className="flex flex-col gap-2">
                        {profile.assocPersons.map(p => (
                          <IntelEntityDropdown key={p.id} item={p} />
                        ))}
                      </div>
                    </div>
                  )}
                  {profile.assocVehicles.length > 0 && (
                    <div>
                      <SectionHeading
                        sub
                        label="Associated Vehicles"
                        count={profile.assocVehicles.length}
                      />
                      <div className="flex flex-col gap-2">
                        {profile.assocVehicles.map(v => (
                          <IntelEntityDropdown key={v.id} item={v} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ProfileCard>
            )}

            {profile.linkedSheets.length > 0 && (
              <SheetsCard assigned={profile.linkedSheets} id="sheets" />
            )}

            <div
              id="map"
              className="mb-4 scroll-mt-20 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
              <div className="flex items-center gap-2 border-b border-border bg-muted/70 px-4 py-2.5">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <p className="text-[13px] font-bold uppercase tracking-wide text-foreground">
                  Map
                </p>
              </div>
              <MapView
                className="w-full h-64 rounded-b-xl"
                initialCenter={{ lat: -31.9505, lng: 115.8605 }}
                initialZoom={12}
                onMapReady={handleMapReady}
              />
            </div>
            {embedded && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(
                    `/intelligence/location/${encodeURIComponent(profile.label)}`
                  )
                }
                className="text-xs"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open full
                profile
              </Button>
            )}
          </>
        )}
      </div>
    </HereProvider>
  );
}
