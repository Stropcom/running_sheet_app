import {
  ProfileDropdownRow,
  IntelEntityDropdown,
} from "@/components/ProfileDropdown";
import { RegistryPersonRow } from "@/components/RegistryPersonRow";
import {
  RegisteredDetailPanels,
  targetDetailEntries,
} from "@/components/RegisteredDetailPanels";
import {
  formatBail,
  formatSpecialProjects,
  mdlLabel,
} from "@shared/targetStatus";
import {
  sharedLinkChipText,
  sharedLinkSentence,
  type CrossLinkVia,
} from "@/lib/crossLinkText";
import { useState } from "react";
import { useLocation } from "wouter";
import { HereProvider, isHere, useHere } from "@/lib/currentProfiles";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  FileDown,
  User,
  Users,
  FileText,
  ChevronRight,
  AlertTriangle,
  Folder,
  ExternalLink,
} from "lucide-react";
import { formatIntelAddress, formatIntelVehicle } from "@/lib/addressFormat";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import {
  buildPhotoGridHtml,
  buildEntityListWithPhotosHtml,
  type RowAttachmentLike,
} from "@/lib/attachmentBanner";
import { buildProfileTargetBlockHtml } from "@/lib/profileSection";
import {
  IntelPhotoStrip,
  type IntelAssocEntity,
} from "@/components/IntelEntityChip";
import { IndicesBadge } from "@/components/IndicesBadge";
import {
  ImportedDocumentCard,
  isParsedDocumentImport,
  type DocumentImportRow,
} from "@/components/ImportedDocumentCard";
import { SectionHeading } from "@/components/ProfileSectionHeading";
import {
  BackgroundCard,
  JumpBar,
  Photoboard,
  ProfileCard,
  SheetsCard,
  displayPersonName,
  fetchFirstPhotoUrl,
  splitPersonName,
  surnameOnly,
  type PhotoboardRow,
} from "@/components/ProfileKit";
import { registryPersonAddresses } from "@/lib/profileSection";

// ─── Types (mirrors server IntelOperationProfile) ──────────────────────────
type ProfilePhoto = RowAttachmentLike & { id: number; url: string };
type IntelProfileEntity = IntelAssocEntity;
interface OperationTarget {
  targetId: number;
  name: string;
  tgt: string | null;
  hbf: string | null;
  v1f: string | null;
  v2f: string | null;
  extraVehicles: string | null;
  extraAddresses: string | null;
  dep: string | null;
  arr: string | null;
  linkedSheets: Array<{ id: number; title: string }>;
  mdlStatus: string | null;
  bailStatus: string | null;
  bailConditions: string | null;
  bailConditionsText: string | null;
  specialProjects: string | null;
  registryBackground: string | null;
  registryBackgroundUpdatedAt: number | null;
  registryBackgroundUpdatedByCIN: string | null;
  registryAssociates: Array<{
    id: number;
    name: string;
    tgt: string | null;
    hbf: string | null;
    hb: string | null;
    v1f: string | null;
    v1: string | null;
    extraAddresses?: string | null;
    isIndicesOnly: boolean;
    relationship?: string;
  }>;
  assocPersons: IntelProfileEntity[];
  assocVehicles: IntelProfileEntity[];
  assocLocations: IntelProfileEntity[];
  photos: ProfilePhoto[];
  isIndicesOnly: boolean;
}
interface IntelOperationProfile {
  operationId: number;
  operationName: string;
  promisNumber: string | null;
  imsNumber: string | null;
  investigationUnit: string | null;
  linkedSheets: Array<{
    id: number;
    title: string;
    targetId: number | null;
    targetName: string | null;
  }>;
  targets: OperationTarget[];
  crossOperationLinks: Array<{
    targetId: number;
    targetName: string;
    otherOperationId: number;
    otherOperationName: string;
    via: CrossLinkVia;
    sharedValue: string;
  }>;
}

// ─── PDF export ────────────────────────────────────────────────────────────
type PdfBoardRow = {
  tag: string;
  heading: string;
  people: Array<{
    given: string;
    sur: string;
    role: "target" | "associate" | "resident";
    url: string | null;
  }>;
};

function buildOperationProfileHtml(
  profile: IntelOperationProfile,
  board: PdfBoardRow[] = []
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
  const totalAssoc = profile.targets.reduce(
    (s, t) =>
      s +
      t.assocPersons.length +
      t.assocVehicles.length +
      t.assocLocations.length,
    0
  );
  const targetsHtml = profile.targets
    .map(t => buildProfileTargetBlockHtml(t))
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RunLog — Operation Profile: ${esc(profile.operationName)}</title>
<style>* { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; } body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; font-size:11px; line-height:1.6; color:${GREY_TEXT}; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.cover-header { background:${BLUE_DARK} !important; color:#fff !important; padding:28px 32px 22px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.brand-label { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:${BLUE_MID} !important; margin-bottom:14px; }
.entity-name { font-size:22px; font-weight:700; } .entity-sub-row { display:flex; flex-wrap:wrap; gap:12px; margin-top:4px; } .entity-sub { font-size:11px; opacity:0.7; } .gen-time { font-size:9px; opacity:0.6; margin-top:12px; }
.stats-row { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding:16px 32px; background:${BLUE_LIGHT} !important; border-bottom:2px solid ${BLUE_MID}; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.stat-box { text-align:center; } .stat-num { font-size:20px; font-weight:700; color:${BLUE_DARK} !important; } .stat-label { font-size:9px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; }
.content { padding:20px 32px; } .section-title { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${BLUE_DARK} !important; padding:6px 10px; background:${BLUE_LIGHT} !important; border-left:3px solid ${BLUE_MID}; margin-bottom:12px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.pb-label { display:flex; gap:8px; align-items:baseline; margin:10px 0 6px; font-size:11px; } .pb-label span { font-size:9px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; border:1px solid #e11d48; background:#ffe4ea !important; color:#9f1239; border-radius:4px; padding:1px 6px; }
.pb-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:8px; margin-bottom:8px; }
.pb-tile { border:2px solid ${GREY_BORDER}; border-radius:6px; overflow:hidden; background:#fff; break-inside:avoid; }
.pb-tile.target { border-color:#e11d48; background:#ffe4ea !important; } .pb-tile.resident { border-color:#0284c7; }
.pb-tile img, .pb-none { width:100%; aspect-ratio:4/5; object-fit:cover; object-position:top; display:block; }
.pb-none { display:flex; align-items:center; justify-content:center; background:#f1f5f9; color:#64748b; font-size:9px; font-weight:600; }
.pb-name { padding:3px 4px 5px; text-align:center; font-size:9px; line-height:1.25; } .pb-name b { display:block; font-size:10px; }
.footer { margin-top:32px; padding-top:12px; border-top:1px solid ${GREY_BORDER}; display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
@media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } .cover-header { background:${BLUE_DARK} !important; } .stats-row { background:${BLUE_LIGHT} !important; } .section-title { background:${BLUE_LIGHT} !important; } }
</style></head><body>
<div class="cover-header">
  <div class="brand-label">RunLog Intelligence Profile — Operation</div>
  <div class="entity-name">${esc(profile.operationName)}</div>
  ${
    profile.promisNumber || profile.imsNumber || profile.investigationUnit
      ? `<div class="entity-sub-row">
    ${profile.promisNumber ? `<span class="entity-sub">PROMIS: ${esc(profile.promisNumber)}</span>` : ""}
    ${profile.imsNumber ? `<span class="entity-sub">IMS: ${esc(profile.imsNumber)}</span>` : ""}
    ${profile.investigationUnit ? `<span class="entity-sub">Unit: ${esc(profile.investigationUnit)}</span>` : ""}
  </div>`
      : ""
  }
  <div class="gen-time">Generated: ${generatedAt}</div>
</div>
<div class="stats-row">
  <div class="stat-box"><div class="stat-num">${profile.targets.length}</div><div class="stat-label">Targets</div></div>
  <div class="stat-box"><div class="stat-num">${profile.linkedSheets.length}</div><div class="stat-label">Running Sheets</div></div>
  <div class="stat-box"><div class="stat-num">${totalAssoc}</div><div class="stat-label">Total Associations</div></div>
</div>
<div class="content">
  ${
    profile.crossOperationLinks.length
      ? `<div style="margin-bottom:16px"><div class="section-title">Cross-Operation Links</div>
    <p style="font-size:10px;font-weight:600;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:4px;padding:6px 8px;margin-bottom:8px">${profile.crossOperationLinks.length} target${profile.crossOperationLinks.length !== 1 ? "s" : ""} in this operation also reach into another operation — worth checking for a connection.</p>
    ${profile.crossOperationLinks.map(l => `<p style="font-size:10px;padding:3px 0;border-bottom:1px solid ${GREY_BORDER}"><strong>${esc(l.targetName)}</strong> ${esc(sharedLinkSentence(l.via, l.sharedValue))} — with a target on <strong>${esc(l.otherOperationName)}</strong></p>`).join("")}
  </div>`
      : ""
  }
  ${
    board.length
      ? `<div style="margin-bottom:16px"><div class="section-title">Photoboard</div>${board
          .map(
            r =>
              `<div class="pb-label"><span>${esc(r.tag)}</span><b>${esc(r.heading)}</b></div><div class="pb-grid">${r.people
                .map(
                  p =>
                    `<div class="pb-tile ${p.role}">${p.url ? `<img src="${esc(p.url)}" alt="">` : `<div class="pb-none">No photo</div>`}<div class="pb-name">${esc(p.given)}<b>${esc(p.sur)}</b></div></div>`
                )
                .join("")}</div>`
          )
          .join("")}</div>`
      : ""
  }
  <div class="section-title">Target Intelligence Profiles</div>
  ${targetsHtml}
  <div class="footer"><span>RunLog — Operation Intelligence Profile</span><span>SENSITIVE — FOR OFFICIAL USE ONLY — ${generatedAt}</span></div>
</div>
${buildExportPreviewCloseBar()}
</body></html>`;
}

function useOperationProfile(operationId: number) {
  return trpc.intelligence.operationProfile.useQuery(
    { operationId },
    { enabled: operationId > 0 }
  );
}

// ─── Imported Documents ─────────────────────────────────────────────────────
// Every "Import from Document" upload recorded against this operation, across
// all its targets — shown exactly as parsed and confirmed by the officer, not
// re-derived from a target's live (possibly since-edited) fields. A target
// re-imported for this operation gets a new row each time it's saved, so
// grouping by target and numbering within that group doubles as version
// history — see targetDocumentImports in schema.ts.

function ImportedDocumentsSection({ operationId }: { operationId: number }) {
  const { data: imports } =
    trpc.target.registry.documentImportsForOperation.useQuery({
      operationId,
    });
  if (!imports || imports.length === 0) return null;

  const byTarget = new Map<number, DocumentImportRow[]>();
  for (const row of imports as DocumentImportRow[]) {
    const list = byTarget.get(row.targetId) ?? [];
    list.push(row);
    byTarget.set(row.targetId, list);
  }

  return (
    <ProfileCard
      id="imported-documents"
      label="Imported Documents"
      count={imports.length}
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Every target-profile document uploaded for this operation, verbatim as
        parsed.
      </p>
      <div className="flex flex-col gap-2">
        {Array.from(byTarget.values()).flatMap(rows => {
          const totalParsed = rows.filter(isParsedDocumentImport).length;
          let parsedCount = 0;
          let lastParsedRow: DocumentImportRow | null = null;
          return rows.map(row => {
            const parsed = isParsedDocumentImport(row);
            if (parsed) parsedCount++;
            const card = (
              <ImportedDocumentCard
                key={row.id}
                row={row}
                version={parsed ? parsedCount : 0}
                isCurrent={parsed && parsedCount === totalParsed}
                previous={parsed ? lastParsedRow : null}
              />
            );
            if (parsed) lastParsedRow = row;
            return card;
          });
        })}
      </div>
    </ProfileCard>
  );
}

// ─── One target's block ─────────────────────────────────────────────────────
// A collapsible block per target: Registered Details, Status, Background,
// Registered Associates, Operational Associations, then Running Sheets.
function TargetBlock({
  target,
  index,
  total,
  operationName,
  open,
  onToggle,
  embedded,
}: {
  target: OperationTarget;
  index: number;
  total: number;
  operationName: string;
  open: boolean;
  onToggle: () => void;
  embedded: boolean;
}) {
  const [, navigate] = useLocation();
  const residents = target.registryAssociates.filter(
    a => a.relationship === "resident"
  );
  const associates = target.registryAssociates.filter(
    a => a.relationship !== "resident"
  );
  const totalAssoc =
    target.assocPersons.length +
    target.assocVehicles.length +
    target.assocLocations.length;
  const entries = targetDetailEntries(target);
  const hasStatus =
    target.mdlStatus ||
    target.bailStatus ||
    formatSpecialProjects(target.specialProjects);
  const bodyId = `tb-${target.targetId}`;
  const personRow = (
    a: OperationTarget["registryAssociates"][number],
    kind: "resident" | "associate"
  ) => (
    <RegistryPersonRow
      key={a.id}
      name={a.name}
      isIndicesOnly={a.isIndicesOnly}
      kind={kind}
      sub={registryPersonAddresses(a.hbf, a.extraAddresses).join("\n")}
      anchorId={embedded ? undefined : `p-t${target.targetId}-${a.id}`}
    />
  );
  return (
    <div
      id={`t-${target.targetId}`}
      className="flex scroll-mt-20 flex-col gap-3"
    >
      <div className="flex items-stretch overflow-hidden rounded-xl border-2 border-rose-600 bg-rose-100 text-rose-950 dark:bg-rose-950/50 dark:text-rose-100">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-primary"
        >
          <ChevronRight
            className={`h-[18px] w-[18px] shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="rounded-md border border-rose-600 bg-white/60 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide dark:bg-white/10">
            {total > 1 ? `Target ${index + 1} of ${total}` : "Target"}
          </span>
          <span className="min-w-[12ch] flex-1 break-words text-base font-extrabold">
            {displayPersonName(target.name)}
          </span>
          {target.isIndicesOnly && <IndicesBadge />}
        </button>
        <button
          type="button"
          onClick={() => navigate(`/intelligence/target/${target.targetId}`)}
          className="shrink-0 border-l border-rose-600/40 px-3 text-xs font-bold hover:bg-white/40 dark:hover:bg-white/10"
        >
          Full Profile
        </button>
      </div>

      {open && (
        <div id={bodyId} className="flex flex-col">
          {target.photos.length > 1 && (
            <ProfileCard
              label={`Photos of ${surnameOnly(target.name)}`}
              count={target.photos.length}
            >
              <IntelPhotoStrip photos={target.photos} size="medium" />
            </ProfileCard>
          )}
          {entries.length > 0 && (
            <ProfileCard
              id={`p-t${target.targetId}`}
              label="Registered Details"
              count={entries.length}
            >
              <RegisteredDetailPanels entries={entries} />
            </ProfileCard>
          )}
          {entries.length === 0 && (
            <div id={`p-t${target.targetId}`} className="scroll-mt-20" />
          )}
          {hasStatus && (
            <ProfileCard label="Status">
              <div className="grid grid-cols-1 gap-2 text-sm">
                {target.mdlStatus && (
                  <div className="flex items-start gap-3">
                    <span className="w-28 shrink-0 pt-0.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                      MDL
                    </span>
                    <span>{mdlLabel(target.mdlStatus)}</span>
                  </div>
                )}
                {target.bailStatus && (
                  <div className="flex items-start gap-3">
                    <span className="w-28 shrink-0 pt-0.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                      Bail
                    </span>
                    <span>{formatBail(target)}</span>
                  </div>
                )}
                {formatSpecialProjects(target.specialProjects) && (
                  <div className="flex items-start gap-3">
                    <span className="w-28 shrink-0 pt-0.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                      Special Projects
                    </span>
                    <span>{formatSpecialProjects(target.specialProjects)}</span>
                  </div>
                )}
              </div>
            </ProfileCard>
          )}
          <BackgroundCard
            id={`bg-${target.targetId}`}
            text={target.registryBackground}
            updatedAt={target.registryBackgroundUpdatedAt}
            updatedByCIN={target.registryBackgroundUpdatedByCIN}
          />
          {residents.length > 0 && (
            <ProfileCard
              label="Other Home Address Residents"
              count={residents.length}
            >
              <div className="flex flex-col gap-2">
                {residents.map(a => personRow(a, "resident"))}
              </div>
            </ProfileCard>
          )}
          {associates.length > 0 && (
            <ProfileCard
              label="Registered Associates"
              count={associates.length}
            >
              <div className="flex flex-col gap-2">
                {associates.map(a => personRow(a, "associate"))}
              </div>
            </ProfileCard>
          )}
          {totalAssoc > 0 && (
            <ProfileCard label="Operational Associations" count={totalAssoc}>
              <p className="mb-3 text-xs italic text-muted-foreground">
                Entities observed in the same running sheet rows as this target
              </p>
              <div className="flex flex-col gap-4">
                {target.assocPersons.length > 0 && (
                  <div>
                    <SectionHeading
                      sub
                      label="Associated Persons"
                      count={target.assocPersons.length}
                    />
                    <div className="flex flex-col gap-2">
                      {target.assocPersons.map(p => (
                        <IntelEntityDropdown key={p.id} item={p} />
                      ))}
                    </div>
                  </div>
                )}
                {target.assocVehicles.length > 0 && (
                  <div>
                    <SectionHeading
                      sub
                      label="Associated Vehicles"
                      count={target.assocVehicles.length}
                    />
                    <div className="flex flex-col gap-2">
                      {target.assocVehicles.map(v => (
                        <IntelEntityDropdown key={v.id} item={v} />
                      ))}
                    </div>
                  </div>
                )}
                {target.assocLocations.length > 0 && (
                  <div>
                    <SectionHeading
                      sub
                      label="Associated Locations"
                      count={target.assocLocations.length}
                    />
                    <div className="flex flex-col gap-2">
                      {target.assocLocations.map(l => (
                        <IntelEntityDropdown key={l.id} item={l} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ProfileCard>
          )}
          {target.linkedSheets.length > 0 && (
            <SheetsCard
              id={`sheets-${target.targetId}`}
              assigned={target.linkedSheets.map(s => ({
                ...s,
                operationName,
              }))}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Self-contained operation profile document — fetches its own data by
 * operationId and renders identically wherever it's mounted (standalone
 * page or embedded pane view), mirroring TargetProfileContent.tsx.
 */
export function OperationProfileContent({
  operationId,
  embedded = false,
}: {
  operationId: number;
  /** Inside a drop-down on another profile: no banner, and an "Open full
   * profile" button at the end. */
  embedded?: boolean;
}) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: profile, isLoading, error } = useOperationProfile(operationId);
  const here = useHere("operation", operationId);
  // Which target blocks are open. They start closed; after that the officer's
  // last choice is remembered on this device, per operation.
  const openKey = `runlog_op_profile_open_${operationId}`;
  const [openIds, setOpenIdsState] = useState<Set<number>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(openKey) ?? "[]");
      return new Set<number>(
        Array.isArray(saved) ? saved.filter(n => typeof n === "number") : []
      );
    } catch {
      return new Set<number>();
    }
  });
  const setOpenIds = (next: Set<number>) => {
    setOpenIdsState(next);
    try {
      localStorage.setItem(openKey, JSON.stringify(Array.from(next)));
    } catch {
      /* storage unavailable — the choice just isn't remembered */
    }
  };

  async function exportPdf() {
    if (!profile) return;
    // Open the window first (inside the click) so the browser doesn't block
    // it, then fill it once each person's photo has been looked up.
    const win = window.open("", "_blank");
    if (!win) return;
    const board: PdfBoardRow[] = await Promise.all(
      photoboardRows.map(async row => ({
        tag: row.tag,
        heading: row.heading,
        people: await Promise.all(
          row.people.map(async p => {
            const url = await fetchFirstPhotoUrl(utils, p.photo);
            const [given, sur] = splitPersonName(p.name);
            return { given, sur, role: p.role, url };
          })
        ),
      }))
    );
    const html = buildOperationProfileHtml(
      profile as IntelOperationProfile,
      board
    );
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  const typedProfile = profile as IntelOperationProfile | undefined;
  // A target we're already inside isn't offered as a link to itself.
  const crossLinks = (typedProfile?.crossOperationLinks ?? []).filter(
    l => !isHere(here, "target", l.targetId)
  );

  const isOpen = (id: number) => openIds.has(id);
  const toggleTarget = (id: number) => {
    const next = new Set(openIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenIds(next);
  };
  const openTarget = (id: number) => {
    if (openIds.has(id)) return;
    const next = new Set(openIds);
    next.add(id);
    setOpenIds(next);
  };

  // Photoboard: one row per target — the target first, then their registered
  // associates and residents, each linked to their card in that block.
  const photoboardRows: PhotoboardRow[] = (typedProfile?.targets ?? []).map(
    (t, i, all) => {
      const people = t.registryAssociates;
      return {
        tag: all.length > 1 ? `Target ${i + 1}` : "Target",
        heading: displayPersonName(t.name),
        sub: `${people.length} registered ${people.length === 1 ? "person" : "people"}`,
        people: [
          {
            key: `t${t.targetId}`,
            name: t.name,
            role: "target" as const,
            anchor: `p-t${t.targetId}`,
            photo: { category: "target" as const, targetId: t.targetId },
          },
          ...people.map(a => ({
            key: `t${t.targetId}-${a.id}`,
            name: a.name,
            role:
              a.relationship === "resident"
                ? ("resident" as const)
                : ("associate" as const),
            anchor: `p-t${t.targetId}-${a.id}`,
            photo: { category: "associate" as const, label: a.name },
          })),
        ],
      };
    }
  );
  const jumpItems = [
    { id: "photoboard", label: "Photoboard" },
    ...(typedProfile?.targets ?? []).map(t => ({
      id: `t-${t.targetId}`,
      label: surnameOnly(t.name),
      before: () => openTarget(t.targetId),
    })),
    { id: "imported-documents", label: "Documents" },
  ];

  return (
    <HereProvider value={here}>
      <div className={embedded ? "pt-1" : "px-6 lg:px-8 py-6"}>
        {isLoading && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        )}

        {error && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">Profile not found or could not be loaded.</p>
          </div>
        )}

        {typedProfile && (
          <>
            {/* Header */}
            {!embedded && (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm mb-5">
                <div className="bg-gradient-to-r from-blue-900 to-blue-800 px-6 py-5 text-white">
                  <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap sm:gap-4">
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/30 mb-3">
                        Operation
                      </span>
                      <h1 className="text-lg sm:text-2xl leading-snug font-bold tracking-tight break-words">
                        {typedProfile.operationName}
                      </h1>
                      <div className="flex flex-wrap gap-3 mt-2 text-sm opacity-75">
                        {typedProfile.promisNumber && (
                          <span>PROMIS: {typedProfile.promisNumber}</span>
                        )}
                        {typedProfile.imsNumber && (
                          <span>IMS: {typedProfile.imsNumber}</span>
                        )}
                        {typedProfile.investigationUnit && (
                          <span>Unit: {typedProfile.investigationUnit}</span>
                        )}
                      </div>
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
                <div className="grid grid-cols-3 divide-x divide-y sm:divide-y-0 divide-border/60 bg-blue-50/50 dark:bg-blue-950/20">
                  {[
                    { label: "Targets", value: typedProfile.targets.length },
                    {
                      label: "Running Sheets",
                      value: typedProfile.linkedSheets.length,
                    },
                    {
                      label: "Associations",
                      value: typedProfile.targets.reduce(
                        (s, t) =>
                          s +
                          t.assocPersons.length +
                          t.assocVehicles.length +
                          t.assocLocations.length,
                        0
                      ),
                    },
                  ].map(stat => (
                    <div
                      key={stat.label}
                      className="px-2 py-3 text-center sm:px-4"
                    >
                      <p className="text-xl font-bold text-blue-900 dark:text-blue-300">
                        {stat.value}
                      </p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide sm:tracking-wider">
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {crossLinks.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm mb-4">
                <SectionHeading
                  label="Cross-operation links"
                  count={crossLinks.length}
                />
                <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    {crossLinks.length} target
                    {crossLinks.length !== 1 ? "s" : ""} in this operation also
                    reach into another operation — worth checking for a
                    cross-operation connection.
                  </p>
                </div>
                <div className="space-y-1">
                  {crossLinks.map(l => (
                    <ProfileDropdownRow
                      key={`${l.targetId}-${l.otherOperationId}-${l.via}`}
                      kind="target"
                      refId={l.targetId}
                    >
                      <User className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      {/* Name and link side by side from sm up; stacked on a
                        phone so the name never gets squeezed to a sliver. */}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                        <span className="text-xs font-medium text-foreground min-w-0 break-words sm:flex-1">
                          {l.targetName}
                        </span>
                        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-amber-700 dark:text-amber-400">
                          <Folder className="w-3 h-3 shrink-0" />
                          <span className="font-semibold">
                            {l.otherOperationName}
                          </span>
                          <span className="text-xs uppercase tracking-wide opacity-70">
                            {sharedLinkChipText(l.via, l.sharedValue)}
                          </span>
                        </span>
                      </span>
                    </ProfileDropdownRow>
                  ))}
                </div>
              </div>
            )}

            {!embedded && typedProfile.targets.length > 0 && (
              <JumpBar items={jumpItems} />
            )}

            {!embedded && typedProfile.targets.length > 0 && (
              <Photoboard
                rows={photoboardRows}
                onBeforeGo={(_, rowIndex) =>
                  openTarget(typedProfile.targets[rowIndex].targetId)
                }
              />
            )}

            <div className="flex flex-col gap-4">
              {typedProfile.targets.map((target, i) => (
                <TargetBlock
                  key={target.targetId}
                  target={target}
                  index={i}
                  total={typedProfile.targets.length}
                  operationName={typedProfile.operationName}
                  open={isOpen(target.targetId)}
                  onToggle={() => toggleTarget(target.targetId)}
                  embedded={embedded}
                />
              ))}
            </div>

            <ImportedDocumentsSection operationId={operationId} />
            {embedded && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(`/intelligence/operation/${operationId}`)
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
