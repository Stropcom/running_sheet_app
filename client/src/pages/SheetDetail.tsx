import { useMyTeams } from "@/lib/teams";
import { fillRoute } from "@shared/parkingRoute";
import { IMAGERY_PHRASE_PATTERN, cinsWithImagery } from "@shared/rowImagery";
import { seatedOccupantWording, seatsOf } from "@shared/vehicleSeats";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AddressSuggestDropdown,
  addressSuggestInsertText,
  useAddressSuggestions,
  type AddressSuggestItem,
  type AddressSuggestMode,
} from "@/components/AddressSuggestDropdown";
import {
  detectAddressSuggestTrigger,
  detectPlaceSuggestTrigger,
} from "@shared/addressSuggestTrigger";
import { orderRsChips } from "@shared/rsChips";
import {
  justTypedSpaceAfterBracket,
  tidyObservation,
  tidyObservationAtCaret,
} from "@shared/observationTidy";
import { wholeSentenceChips } from "@shared/sentenceJoin";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import { useIsMobile } from "@/hooks/useMobile";
import CinInput from "@/components/CinInput";
import { LinkAttachmentDialog } from "@/components/LinkAttachmentDialog";
import { LinkedEntityPills } from "@/components/LinkedEntityPills";
import { ResizablePhoto } from "@/components/ResizablePhoto";
import { endedContinuityCard } from "@/lib/surveillanceCard";
import { CeaseRowButton } from "@/components/CeaseRowButton";
import { ceasePlaceFor } from "@shared/ceaseRow";
import {
  locateTargetFromPending,
  samePlace,
  targetEmoji,
  vehiclesPeopleCanReach,
} from "@shared/targetPosition";
import {
  alightedWording,
  onTransitCards,
  transitBoardActions,
} from "@/lib/transitCards";
import { shortAddressLabel } from "@shared/markerLink";
import { useTargetTrackingSettings } from "@/lib/targetTrackingSettings";
import { detectUnidentifiedRepeat } from "@shared/unidentified";
import {
  occupantsToVehicle,
  occupantWording,
  vehicleOccupants as sharedVehicleOccupants,
  occupantsStillInVehicle,
  splitPeopleNames,
  surnameTokens,
  isReadAsMovement,
} from "@shared/walkEventPatterns";
import { knownSurnamesOf } from "@shared/companions";
import {
  pickSubjectCardKey,
  resolveTrackedTarget,
  subjectCompanions,
  trackedTargetCode,
} from "@shared/trackedTarget";
import {
  ContinuityCards,
  type ContinuityCardData,
} from "@/components/ContinuityCards";
import { DeletePhotoButton } from "@/components/DeletePhotoButton";
import {
  EntityDuplicateDialog,
  type DedupType,
} from "@/components/EntityDuplicateDialog";
import {
  TargetMatchDialog,
  type TargetMatchCandidate,
} from "@/components/TargetMatchDialog";
import { CheckRunningSheetDialog } from "@/components/CheckRunningSheetDialog";
import { useCommandFeature } from "@/lib/commandFeatures";
import { CrossOperationEntityAlert } from "@/components/CrossOperationEntityAlert";
import { MissingLocationAlert } from "@/components/MissingLocationAlert";
import { VagueVehicleMatchAlert } from "@/components/VagueVehicleMatchAlert";
import { FaceMatchAckDialog } from "@/components/FaceMatchAckDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Lock,
  Unlock,
  Plus,
  Trash2,
  UserPlus,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ShieldCheck,
  Clock,
  Download,
  FileText,
  Pencil,
  Camera,
  X,
  Search,
  Users,
  ArrowUpDown,
  Target,
  ClipboardCheck,
  NotebookText,
  LockKeyhole,
  LockKeyholeOpen,
  ChevronLeft,
  ChevronRight,
  Tag,
  User,
  Car,
  Undo2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useObservationFocus } from "@/contexts/ObservationFocusContext";
import {
  convertGoogleAddresses,
  extractShortAddress,
  formatIntelVehicle,
  expandIntelVehicleToFullForm,
} from "@/lib/addressFormat";
import {
  getCaretPixelPosition,
  detectMentionTrigger,
  detectVehicleMentionTrigger,
  detectAddressSpaceCompletion,
  detectPersonNameSpaceCompletion,
  computeUsedBracketCodes,
  computeUsedVehicleRegos,
  computeUsedAddressLabels,
  extractOccupantNames,
  shortenAlreadyMentionedNames,
  type PersonMentionSuggestion,
} from "@/lib/mentionAutocomplete";
import {
  bracketCodeFromRegisteredName,
  nameWithoutBornClause,
} from "@shared/addressFormat";
import { compressAttachmentImage } from "@/lib/imageCompress";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import { robotoFontFaceCss, whenFontsReady } from "@/lib/exportFonts";
import { setLastActiveContext } from "@/lib/lastActiveContext";
import { useLocation, useParams, useSearch } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";
import { WifiOff, RefreshCw, ChevronDown } from "lucide-react";
import { useOffline } from "@/contexts/OfflineContext";
import {
  AddTargetDialog,
  type RegistryCreatePayload,
} from "@/components/AddTargetDialog";
import {
  saveCachedSheet,
  getCachedSheet,
  addPendingRowToCachedSheet,
  editPendingRowInCachedSheet,
  deletePendingRowInCachedSheet,
  enqueueSyncAction,
  type CachedSheet,
} from "@/lib/offlineStore";

type Member = {
  id: number;
  rowId: number;
  memberName: string;
  sortOrder: number;
  createdAt: Date;
};
type Certification = {
  id: number;
  rowId: number;
  memberId: number;
  certifiedByUserId: number;
  certifiedByName: string;
  certifiedAt: number;
  isActive: boolean;
};
type RowAttachment = {
  id: number;
  rowId: number | null;
  url: string;
  mimeType: string;
  caption: string | null;
  uploadedByCIN: string | null;
  createdAt: Date;
  linkedCount?: number;
  linkedCategories?: string[];
  linkedEntities?: Array<{ category: string; label: string }>;
  faceCount?: number | null;
};

type SheetRow = {
  id: number;
  sheetId: number;
  rowNumber: number;
  time: string | null;
  timeMinutes: number | null;
  dayOffset?: number | null;
  rowDate?: string | null;
  observation: string | null;
  isLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
  members: Member[];
  certifications: Certification[];
  attachments: RowAttachment[];
};

// The imagery phrase list lives in shared/rowImagery.ts (also used for the
// automatic camera in the TEAM strip and the Governance imagery check); it's
// the same list stripImageryPhraseForExport() drops from the exported text.

// ─── Export Helpers ─────────────────────────────────────────────────────────

type ExportRow = {
  id: number;
  rowNumber: number;
  time: string | null;
  timeMinutes: number | null;
  dayOffset?: number | null;
  rowDate?: string | null;
  observation: string | null;
  isLocked: boolean;
  members: { id: number; memberName: string }[];
  certifications: {
    memberId: number;
    certifiedByName: string;
    certifiedAt: number;
    isActive: boolean;
  }[];
  attachments: {
    id: number;
    url: string;
    linkedEntities?: Array<{ category: string; label: string }>;
  }[];
};

// Renders attached photos as inline <img> tags at ~1/3 cell width, matching
// the live table's proportions (see ObservationAttachments). align-items
// must be set explicitly — flex's default "stretch" forces every image in a
// row to the height of its tallest sibling, distorting a landscape photo's
// proportions the moment it sits next to a portrait one. ObservationAttachments
// avoids this with its own "items-end" on the equivalent live container;
// matching that here so a photo prints/exports at its natural aspect ratio,
// same as it already appears on the running sheet itself.
//
// Each photo gets a caption strip joined to its bottom edge, the same width
// as the photo, with "Taken by CIN 484" centred in black (several linked
// CINs read "CIN 484, 503"). A photo not yet linked to a CIN gets the same
// strip left blank, so every photo in a row is the same height and the strips
// line up. Black on light grey, so it reads the same in a black-and-white
// print. Export only — the live sheet keeps its green CIN pills
// (LinkedEntityPills); the link itself is the "member" category link — see
// LinkAttachmentDialog's CIN section / autoLinkAttachmentToRowMemberIfSingle
// in db.ts.
function attachmentImagesHtml(
  attachments: {
    url: string;
    linkedEntities?: Array<{ category: string; label: string }>;
  }[]
): string {
  if (attachments.length === 0) return "";
  // A full blank line before the photos, not just a small margin — matches
  // OBS_TRAILING_SPACE's own "<br/><br/>" convention for a blank line
  // elsewhere in this export: a single <br/> only starts a new line, it
  // takes a second one to actually leave that line empty before the photos.
  return (
    `<br/><br/><div style="margin-top:2px;display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px">` +
    attachments
      .map(a => {
        const cins = (a.linkedEntities ?? [])
          .filter(e => e.category === "member")
          .map(e => e.label);
        const stripHtml =
          `<div style="width:100%;box-sizing:border-box;border:1px solid #ccc;border-top:0;border-radius:0 0 4px 4px;background:#f1f1f1;color:#000;font-size:9px;line-height:1.3;padding:2px 4px;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact">` +
          (cins.length > 0
            ? `Taken by&nbsp;<strong>CIN ${cins.join(", ")}</strong>`
            : "&nbsp;") +
          `</div>`;
        return (
          `<div style="width:calc(50% - 4px);max-width:320px;box-sizing:border-box;display:flex;flex-direction:column;align-items:stretch;break-inside:avoid;page-break-inside:avoid">` +
          `<img src="${a.url}" style="display:block;box-sizing:border-box;width:100%;border:1px solid #ccc;border-radius:4px 4px 0 0" />` +
          stripHtml +
          `</div>`
        );
      })
      .join("") +
    `</div>`
  );
}

type OperationMeta = {
  name: string;
  promisNumber?: string | null;
  imsNumber?: string | null;
  investigationUnit?: string | null;
  createdAt: Date;
} | null;

type CinEntry = {
  cin: string;
  hasImages: boolean;
  isTeamLeader?: boolean;
  isAuthor?: boolean;
};

const PERTH_TIME_ZONE = "Australia/Perth";
const PERTH_OFFSET_SUFFIX = "T00:00:00+08:00";

function ymdToPerthMs(ymd: string) {
  return new Date(`${ymd}${PERTH_OFFSET_SUFFIX}`).getTime();
}

const PERTH_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8 in milliseconds

function addDaysToYmd(ymd: string, days: number) {
  // ymdToPerthMs gives Perth midnight as UTC ms (e.g. 2026-07-19 00:00 AWST = 2026-07-18 16:00 UTC).
  // After adding N days we must shift by +8h before reading UTC date components so that
  // the UTC year/month/day equals the Perth calendar date (otherwise +1 day stays on the same UTC date).
  const perthMs = ymdToPerthMs(ymd) + days * 86400000;
  const d = new Date(perthMs + PERTH_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function formatPerthDateLabel(ymd: string) {
  return new Date(`${ymd}${PERTH_OFFSET_SUFFIX}`)
    .toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: PERTH_TIME_ZONE,
    })
    .toUpperCase();
}

function getTodayPerthYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PERTH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find(p => p.type === "year")?.value ?? "1970";
  const month = parts.find(p => p.type === "month")?.value ?? "01";
  const day = parts.find(p => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function exportToPDF(
  sheetTitle: string,
  rows: ExportRow[],
  operation: OperationMeta,
  sheetCinsRaw: string | null,
  sheetCreatedAt: Date,
  targetFullName?: string | null,
  sheetDate?: string | null
) {
  const lockedBg = "#ffffff"; // White in PDF — dark green is screen-only via CSS class
  const cb = "border-right:1px solid #e2e9f6";
  const bb = "border-bottom:1px solid #eef2fb";
  // Reserves 2 blank lines below the observation text so printed rows read
  // with breathing room, matching the live table's pb-10 Observation cell.
  const OBS_TRAILING_SPACE = "<br/><br/>";

  // Parse TEAM roster — sort: TL first, then numerically
  let cinRoster: CinEntry[] = [];
  try {
    const raw: CinEntry[] = sheetCinsRaw ? JSON.parse(sheetCinsRaw) : [];
    cinRoster = [...raw].sort((a, b) => {
      if (a.isTeamLeader && !b.isTeamLeader) return -1;
      if (!a.isTeamLeader && b.isTeamLeader) return 1;
      const aNum = parseInt(a.cin, 10);
      const bNum = parseInt(b.cin, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.cin.localeCompare(b.cin);
    });
  } catch {
    cinRoster = [];
  }

  // ── Page header (repeats on every page) ─────────────────────────────────────
  const operationName = operation?.name ?? "";
  const dateStr = sheetDate
    ? format(new Date(`${sheetDate}T00:00:00`), "d MMMM yyyy")
    : format(new Date(sheetCreatedAt), "d MMMM yyyy");

  // Derive the author CIN from the roster (isAuthor flag)
  const authorEntry = cinRoster.find(c => c.isAuthor);
  const authorCin = authorEntry?.cin ?? null;

  // Find the most recent active certification belonging to the author CIN.
  // Light-on-dark, used only in the footer band's "Prepared by" — the top
  // banner's meta pill shows the plain CIN with no tick regardless of
  // certification status.
  let preparedByPill = "";
  if (authorCin) {
    let latestCert: {
      certifiedByCIN?: string;
      certifiedByName: string;
      certifiedAt: number;
    } | null = null;
    for (const row of rows) {
      for (const cert of row.certifications) {
        if (!cert.isActive) continue;
        const certCin =
          ("certifiedByCIN" in cert ? (cert as any).certifiedByCIN : null) ||
          cert.certifiedByName;
        if (certCin === authorCin) {
          if (!latestCert || cert.certifiedAt > latestCert.certifiedAt) {
            latestCert = cert as any;
          }
        }
      }
    }
    if (latestCert) {
      const certCin =
        ("certifiedByCIN" in latestCert
          ? (latestCert as any).certifiedByCIN
          : null) || latestCert.certifiedByName;
      const certTime = format(
        new Date(latestCert.certifiedAt),
        "d MMMM yyyy h:mmaaa"
      );
      preparedByPill = `<span style='color:#86efac;white-space:nowrap'>&#10003; ${certCin}</span> <span style='opacity:0.65;font-weight:400;text-transform:none;letter-spacing:0'>${certTime}</span>`;
    } else {
      // Author exists but hasn't certified yet — show CIN without tick
      preparedByPill = authorCin;
    }
  }

  // ── Imagery Taken row data ───────────────────────────────────────────────────
  const IMAGERY_PHRASES = [
    "PHOTOGRAPHS TAKEN",
    "PHOTOGRAPH/S TAKEN",
    "PHOTOGRAPH TAKEN",
    "VIDEO TAKEN",
    "VIDEO FOOTAGE TAKEN",
    "PHOTOS TAKEN",
    "PHOTO TAKEN",
  ];
  const imageryEntries: { cin: string; time: string }[] = [];
  for (const row of rows) {
    const obs = (row.observation ?? "").toUpperCase();
    const hasImagery = IMAGERY_PHRASES.some(p => obs.includes(p));
    if (hasImagery && row.time) {
      for (const m of row.members) {
        if (m.memberName !== "__SPACE__") {
          imageryEntries.push({ cin: m.memberName, time: row.time });
        }
      }
    }
  }
  // Deduplicate by cin+time
  const seenImagery = new Set<string>();
  const uniqueImageryEntries = imageryEntries.filter(e => {
    const key = `${e.cin}|${e.time}`;
    if (seenImagery.has(key)) return false;
    seenImagery.add(key);
    return true;
  });
  const imageryRowHtml =
    uniqueImageryEntries.length > 0
      ? uniqueImageryEntries.map(e => `${e.cin} (${e.time})`).join(", ")
      : "Nil";

  // ── Drop imagery-keyword phrases from the exported observation text ──────────
  // "PHOTOGRAPH/S TAKEN" (and its variants) is needed live — it drives the
  // photo-upload affordance and the Governance imagery check (see
  // IMAGERY_PHRASE_PATTERN above) — but is redundant once printed: the
  // photo(s) and their CIN caption(s) (see attachmentImagesHtml) already say
  // everything the phrase would. Only the phrase text is removed here; any
  // <br/> line breaks around it (already present from the observation's own
  // \n -> <br/> conversion at each call site below) are left as-is, then
  // collapsed/trimmed afterwards so removing the phrase's own line doesn't
  // leave a stray run of blank lines or trailing space before the photos.
  function stripImageryPhraseForExport(text: string): string {
    const pattern =
      /(PHOTOGRAPHS TAKEN|PHOTOGRAPH\/S TAKEN|PHOTOGRAPH TAKEN|VIDEO FOOTAGE TAKEN|VIDEO TAKEN|PHOTOS TAKEN|PHOTO TAKEN)\.?/gi;
    return text
      .replace(pattern, "")
      .replace(/(<br\/>\s*){3,}/g, "<br/><br/>")
      .replace(/(<br\/>\s*)+$/g, "")
      .trim();
  }

  // ── Page headers ────────────────────────────────────────────────────────────
  // Same look as the Supervisor Summary / Weekly Tasking exports (a centred
  // dark-blue banner: brand dot, "RunLog", title) with the details in labelled
  // cells in two equal columns, drawn like the log table beneath it:
  //   Operation | Date
  //   Target    | Prepared by
  //   Imagery taken (full width)
  // With no target, Prepared by takes the whole second row; with no author
  // CIN, Target takes it.
  //
  // Strategy: the full banner (first-page-header) is page 1 — on screen and in
  // print; the compact version lives in the <thead> and repeats at the top of
  // pages 2+ (on page 1 it is covered by the full banner) — see the print
  // strategy comment in the beforeprint script.
  const escHdr = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const detailCell = (label: string, value: string, full = false) =>
    `<div class="dc${full ? " dc-full" : ""}"><div class="dl">${label}</div><div class="dv">${escHdr(value)}</div></div>`;
  const hasTarget = !!targetFullName;
  const detailsHtml = `
    <div class="details">
      ${detailCell("Operation", operationName)}
      ${detailCell("Date", dateStr)}
      ${hasTarget ? detailCell("Target", targetFullName ?? "", !authorCin) : ""}
      ${authorCin ? detailCell("Prepared by", authorCin, !hasTarget) : ""}
      <div class="di"><span class="dl">Imagery taken</span> <b>${imageryRowHtml}</b></div>
    </div>`;

  // Banner + details builder — `compact` is the repeating thead version for
  // pages 2+ (one-line banner, smaller cells); the full one is page 1 and the
  // on-screen preview. The imagery row is in both, so it is on every printed
  // page.
  function coverHeaderHtml(compact: boolean): string {
    return `
      <div class="cover-header${compact ? " compact" : ""}">
        <div class="brand-row"><div class="brand-dot"></div><span class="brand-label">RunLog</span></div>
        <div class="rs-title">WC SURVEILLANCE RUNNING SHEET</div>
      </div>${detailsHtml}`;
  }

  // ── Running sheet table ──────────────────────────────────────────────────────
  // Spacer row inserted after each log entry for breathing room
  const spacerRow = `<tr><td colspan="3" style="padding:0;height:8px;border:none;background:transparent"></td></tr>`;

  // ── Build day-offset map for export rows (rowDate-aware, falls back to inference) ──
  const exportDayOffsetMap = new Map<number, number>();
  {
    const timedByRowNumber = [...rows]
      .filter(r => r.timeMinutes != null)
      .sort((a, b) => a.rowNumber - b.rowNumber);
    const exportRowDates = timedByRowNumber
      .map(r => r.rowDate)
      .filter((d): d is string => !!d);
    const exportMinRowDate =
      exportRowDates.length > 0 ? exportRowDates.slice().sort()[0] : null;
    // First pass: rowDate (highest priority) or stored dayOffset (legacy)
    for (const r of timedByRowNumber) {
      if (r.rowDate && exportMinRowDate) {
        const anchor = ymdToPerthMs(exportMinRowDate);
        const rowDay = ymdToPerthMs(r.rowDate);
        exportDayOffsetMap.set(r.id, Math.round((rowDay - anchor) / 86400000));
      } else if (r.dayOffset && r.dayOffset !== 0) {
        exportDayOffsetMap.set(r.id, r.dayOffset);
      }
    }
    // Second pass: infer for rows with no explicit date/offset
    let day = 0;
    let prevEff = -1;
    for (const r of timedByRowNumber) {
      if (exportDayOffsetMap.has(r.id)) {
        prevEff = r.timeMinutes! + exportDayOffsetMap.get(r.id)! * 1440;
        day = exportDayOffsetMap.get(r.id)!;
        continue;
      }
      const mins = r.timeMinutes!;
      const eff = mins + day * 1440;
      if (prevEff >= 0 && eff < prevEff - 120) {
        day++;
      }
      exportDayOffsetMap.set(r.id, day);
      prevEff = mins + day * 1440;
    }
  }

  const dateDividerRow = (label: string) =>
    `<tr class="date-divider-row"><td colspan="3"><span class="date-divider-pill">${label}</span></td></tr>`;

  const tableRows = (() => {
    let prevDay = -1;
    const parts: string[] = [];
    for (const row of rows) {
      const day = exportDayOffsetMap.get(row.id) ?? 0;
      if (row.timeMinutes != null && day > prevDay && prevDay >= 0) {
        // Prefer an explicit rowDate from a row on that day
        const rowOnDay = rows.find(
          r => (exportDayOffsetMap.get(r.id) ?? 0) === day && r.rowDate
        );
        let divLabel: string;
        if (rowOnDay?.rowDate) {
          divLabel = formatPerthDateLabel(rowOnDay.rowDate);
        } else if (sheetDate) {
          divLabel = formatPerthDateLabel(addDaysToYmd(sheetDate, day));
        } else {
          const divDate = new Date(sheetCreatedAt);
          divDate.setDate(divDate.getDate() + day);
          divLabel = divDate
            .toLocaleDateString("en-AU", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: PERTH_TIME_ZONE,
            })
            .toUpperCase();
        }
        parts.push(dateDividerRow(divLabel));
      }
      if (row.timeMinutes != null) prevDay = day;
      const rowBg = row.isLocked ? lockedBg : "transparent";
      if (row.members.length === 0) {
        const obsHtml =
          stripImageryPhraseForExport(
            (row.observation ?? "").replace(/\n/g, "<br/>")
          ) +
          attachmentImagesHtml(row.attachments) +
          OBS_TRAILING_SPACE;
        parts.push(`<tr style="background:${rowBg}">
          <td style="padding:6px 6px 8px;${bb};${cb};font-variant-numeric:tabular-nums;font-size:12px;white-space:nowrap">${row.time ?? ""}</td>
          <td style="padding:6px 6px 8px;${bb};${cb};font-size:12px">${obsHtml}</td>
          <td style="padding:6px 6px 8px;${bb};font-size:11px"></td>
        </tr>${spacerRow}`);
        continue;
      }
      // Fully-certified row whose members are exactly the full daily roster —
      // collapse to a single "TEAM" pill instead of one row per CIN. The
      // individual CINs are still real data on the row underneath (Witness
      // List generation reads that, not this export), this is display only.
      if (
        row.isLocked &&
        isFullTeamMembers(
          row.members,
          cinRoster.map(c => c.cin)
        )
      ) {
        const obsHtml =
          stripImageryPhraseForExport(
            (row.observation ?? "").replace(/\n/g, "<br/>")
          ) +
          attachmentImagesHtml(row.attachments) +
          OBS_TRAILING_SPACE;
        parts.push(`<tr style="background:${rowBg}">
          <td style="padding:6px 6px 8px;${bb};${cb};font-variant-numeric:tabular-nums;font-size:12px;white-space:nowrap">${row.time ?? ""}</td>
          <td style="padding:6px 6px 8px;${bb};${cb};font-size:12px">${obsHtml}</td>
          <td style="padding:6px 6px 8px;${bb};font-size:11px"><span class="pill pill-certified">&#10003; TEAM</span></td>
        </tr>${spacerRow}`);
        continue;
      }
      // One <tr> per running-sheet row (not one per member) — every
      // member's CIN/Certified pill is stacked into a single flex-column
      // cell instead of one <tr> per member with rowspan on the shared
      // Time/Observation columns. That per-member-<tr> approach depended on
      // the browser's own row-height distribution whenever a photo made the
      // observation cell much taller than the member rows' natural height:
      // vertical-align:top alone wasn't enough to stop it — the pills still
      // ended up spread out down the photo's height instead of stacking
      // tightly like every other row. A single cell with a flex-column
      // stack packs them tightly regardless of how tall the row gets.
      const cinPillsHtml = row.members
        .map(m => {
          if (m.memberName === "__SPACE__") {
            // Invisible placeholder — keeps the roster's visual gap without
            // showing anything, same height as a real pill via the shared
            // .pill class.
            return `<span class="pill" style="visibility:hidden">&nbsp;</span>`;
          }
          const cert = row.certifications.find(
            c => c.memberId === m.id && c.isActive
          );
          const certifierCIN = cert
            ? "certifiedByCIN" in cert
              ? (cert as any).certifiedByCIN || cert.certifiedByName
              : cert.certifiedByName
            : null;
          return cert
            ? `<span class="pill pill-certified">&#10003; ${certifierCIN}</span>`
            : `<span class="pill pill-pending">${m.memberName}</span>`;
        })
        .join("");
      const obsHtml =
        stripImageryPhraseForExport(
          (row.observation ?? "").replace(/\n/g, "<br/>")
        ) +
        attachmentImagesHtml(row.attachments) +
        OBS_TRAILING_SPACE;
      parts.push(`<tr style="background:${rowBg}">
        <td style="padding:6px 6px 8px;${bb};${cb};font-variant-numeric:tabular-nums;font-size:12px;white-space:nowrap;vertical-align:top">${row.time ?? ""}</td>
        <td style="padding:6px 6px 8px;${bb};${cb};vertical-align:top;font-size:12px">${obsHtml}</td>
        <td style="padding:6px 6px 8px;${bb};font-size:11px;vertical-align:top"><div style="display:flex;flex-direction:column;align-items:flex-start;gap:3px">${cinPillsHtml}</div></td>
      </tr>${spacerRow}`);
    }
    return parts.join("");
  })();

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>${sheetTitle}</title>
  <style>
    /* Roboto is served by RunLog itself (lib/exportFonts.ts) — no request to Google. */
    ${robotoFontFaceCss()}
    @page{
      margin:20mm 15mm;
      @top-center{content:'PROTECTED';font-family:'Roboto',sans-serif;font-size:12px;font-weight:700;color:#dc2626;letter-spacing:0.08em}
      @bottom-center{content:"Page " counter(page) " of " counter(pages);font-family:'Roboto',sans-serif;font-size:11px;font-weight:700;color:#1e3a8a;letter-spacing:0.04em}
    }
    /* Force background colours to print — Chrome strips backgrounds by default */
    *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}
    body{font-family:'Roboto',sans-serif;background:#fff;color:#000;margin:0;padding:0;font-size:11px}
    /* Cover-header banner — matches the Intelligence Profile / CTO Weekly
       Tasking export style: full-bleed dark-blue block, brand label, title,
       and meta info as rounded pills instead of a bordered label/value table.
       No border-radius, deliberately — sits flush above the log table so the
       two read as one continuous document block, and a single rectangle
       renders reliably across page breaks with no edge cases. */
    .cover-header{background:#1e3a8a;color:#fff;padding:18px 28px 14px;text-align:center}
    .brand-row{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:10px;opacity:0.9}
    .brand-dot{width:10px;height:10px;border-radius:50%;background:#93c5fd;flex:none}
    .brand-label{font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#93c5fd}
    .rs-title{font-size:22px;font-weight:800;letter-spacing:0.04em;line-height:1.2;text-transform:uppercase}
    /* Compact version (repeats at the top of every printed page): one-line banner */
    .cover-header.compact{padding:8px 28px;display:flex;justify-content:center;align-items:center;gap:14px}
    .cover-header.compact .brand-row{margin:0}
    .cover-header.compact .rs-title{font-size:13px;font-weight:800}
    /* Details — two equal columns of labelled cells, drawn like the log table below.
       On screen the block sits above the table, so it carries the table's blue side
       borders; inside the printed thead the table's own border already runs down both
       sides, so they are dropped there (no doubled line). */
    .details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));background:#f1f6ff;border:1.5px solid #1e3a8a;border-top:none;border-bottom:none}
    .dc{padding:7px 10px;border-right:1px solid #c7d5ee;border-bottom:1px solid #c7d5ee;min-width:0}
    .dc:nth-child(even){border-right:none}
    .dc-full{grid-column:1 / -1;border-right:none}
    .dl{font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;font-weight:600}
    .dv{font-size:12px;font-weight:700;color:#000;line-height:1.3;overflow-wrap:anywhere}
    .di{grid-column:1 / -1;padding:6px 10px;border-bottom:1px solid #c7d5ee;font-size:10.5px}
    .di b{color:#000;font-weight:700}
    .di .dl{margin-right:6px}
    /* The cell is the only (so "last") cell in its row, which would give it the
       no-wrap / 1% width rule meant for the certification column — undo that so the
       compact header wraps like the full one. */
    .log-table td.thead-meta-cell:last-child{white-space:normal;word-break:normal;width:auto;overflow:visible}
    .thead-meta-cell .details{border-left:none;border-right:none}
    .thead-meta-cell .cover-header.compact + .details .dc{padding:4px 10px}
    .thead-meta-cell .cover-header.compact + .details .dl{font-size:8px}
    .thead-meta-cell .cover-header.compact + .details .dv{font-size:10.5px}
    .thead-meta-cell .cover-header.compact + .details .di{padding:3px 10px;font-size:9.5px}
    .thead-meta-cell .cover-header.compact + .details .di .dl{font-size:8px}
    /* Log table — the outer border is a single declaration on the <table> element itself
       (border-collapse:collapse), not assembled from separate per-cell rules. That's what
       guarantees it always renders as one continuous, unbroken, uniform-width rectangle
       regardless of rowspan, spacer rows, or which row happens to be last. */
    table.log-table{width:100%;border:1.5px solid #1e3a8a;border-top:none;border-collapse:collapse;table-layout:auto}
    col.c-time{width:80px}
    col.c-obs{width:auto}
    col.c-cert{width:1%}
    .log-table th{background:#dbeafe;color:#1e3a8a;font-weight:700;padding:6px;text-align:left;
       border-bottom:2px solid #1e3a8a;border-right:1px solid #c7d5ee}
    .log-table th:last-child,.log-table td:last-child{border-right:none}
    .log-table td{vertical-align:top;word-break:break-word;overflow:hidden;color:#000;border-right:1px solid #e2e9f6;border-bottom:1px solid #eef2fb}
    .log-table td:last-child{white-space:nowrap;word-break:normal;width:1%}
    /* thead wrapper cell — no border/padding so the banner floats free of the log table's own border */
    .thead-meta-cell{padding:0 !important;border:none !important}
    /* Footer band — repeats at the bottom of every printed page (display:table-footer-group).
       Same dark blue as the top banner — a plain background fill, no border tricks, so it
       can't run into the per-cell border issues a bordered footer did. */
    tfoot{display:table-footer-group}
    .footer-band td{background:#1e3a8a;padding:8px 14px}
    .footer-grid{display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center}
    .footer-cin{font-size:10px;color:rgba(255,255,255,0.85);font-weight:700;letter-spacing:0.04em;text-transform:uppercase;text-align:right}
    .footer-protected{text-align:center;font-size:11px;font-weight:800;letter-spacing:0.14em;color:#f87171}
    /* Certification pills */
    .pill{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:9999px;font-size:10px;font-weight:700;white-space:nowrap}
    .pill-certified{background:#d1fae5;color:#059669;border:1px solid #6ee7b7}
    .pill-pending{background:#fee2e2;color:#dc2626;border:1px solid #fca5a5}
    /* Date divider — centered pill instead of a full-width bar */
    .date-divider-row td{background:#f1f6ff;text-align:center;padding:6px 0}
    .date-divider-pill{display:inline-block;padding:3px 14px;border-radius:9999px;background:#1e3a8a;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.06em}
    /* Screen: show first-page-header (with imagery); hide print-only blocks.
       No margin-bottom — sits flush against the log table's top edge so the
       banner and table read as one continuous bordered block. */
    .first-page-header{text-align:left}
    .print-only{display:none !important}
    @media print{
      /* Prevent observation rows from splitting across pages */
      .log-table tbody tr{page-break-inside:avoid;break-inside:avoid}
      /* thead repeats on every page */
      thead{display:table-header-group}
      /* Page 1 keeps the FULL header. The compact header in the thead also prints
         on page 1 (a thead repeats on every page, first included), so the full
         header is pulled down over it: --hc is the compact header's height,
         measured in the beforeprint script below, and the full header paints on
         top (opaque, higher z-index) so only the column headings show beneath it. */
      .first-page-header{position:relative;z-index:5;background:#fff;margin-bottom:calc(-1 * var(--hc, 0px))}
    }
  </style>
  <script>
    (function(){
      /*
       * PRINT STRATEGY (browser-compatible, no Prince XML):
       *
       * Screen view: the full header (.first-page-header); print-only blocks hidden.
       *
       * Print: a <thead> repeats on every page — page 1 included — so the compact
       * header lives in the thead and prints at the top of every page. Page 1 is
       * meant to show the FULL header instead, so .first-page-header stays visible
       * and is pulled down over the compact one (see the @media print rule): its
       * negative bottom margin is the compact header's height, measured here at the
       * printed content width (A4 less 15mm margins = 180mm) with the same fonts.
       * Result: page 1 = full header + column headings + rows; pages 2+ = compact
       * header + column headings + rows.
       */
      window.addEventListener('beforeprint', function(){
        var cell = document.querySelector('.thead-meta-cell');
        if (cell) {
          var probe = document.createElement('div');
          probe.className = 'thead-meta-cell';
          probe.style.cssText = 'position:absolute;left:-10000px;top:0;width:180mm;visibility:hidden';
          probe.innerHTML = cell.innerHTML;
          document.body.appendChild(probe);
          var hc = probe.getBoundingClientRect().height;
          document.body.removeChild(probe);
          // 1px short so a measuring rounding error can never leave a sliver showing
          document.documentElement.style.setProperty('--hc', Math.max(0, hc - 1) + 'px');
        }
        document.querySelectorAll('.print-only').forEach(function(el){
          el.style.removeProperty('display');
          el.style.setProperty('display', el.dataset.pd || 'block', 'important');
        });
      });
      window.addEventListener('afterprint', function(){
        document.documentElement.style.removeProperty('--hc');
        document.querySelectorAll('.print-only').forEach(function(el){
          el.style.setProperty('display', 'none', 'important');
        });
      });
    })();
  </script>
  </head><body>
  <!-- SCREEN VIEW: full banner with imagery — hidden during print -->
  <div class="first-page-header" id="first-page-header">
    ${coverHeaderHtml(false)}
  </div>
  <table class="log-table">
    <colgroup>
      <col class="c-time"/>
      <col class="c-obs"/>
      <col class="c-cert"/>
    </colgroup>
    <thead>
      <!-- Compact banner repeats on every page via thead display:table-header-group.
           Hidden on screen (first-page-header shows instead); shown during print by JS. -->
      <tr class="print-only" data-pd="table-row">
        <td colspan="3" class="thead-meta-cell">
          ${coverHeaderHtml(true)}
        </td>
      </tr>
      <tr>
        <th>Time</th>
        <th>Observation</th>
        <th>CIN Certified</th>
      </tr>
    </thead>
    <tfoot>
      <!-- Repeats at the bottom of every printed page. -->
      <tr class="footer-band"><td colspan="3">
        <div class="footer-grid">
          <span></span>
          <span class="footer-protected">Protected</span>
          <span class="footer-cin">${authorCin ? `Prepared by ${preparedByPill}` : ""}</span>
        </div>
      </td></tr>
    </tfoot>
    <tbody>${tableRows}</tbody>
  </table>
  ${buildExportPreviewCloseBar()}
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Pop-up blocked. Please allow pop-ups and try again.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Print only once Roboto has loaded, so the PDF never gets a fallback font.
  void whenFontsReady(win).then(() => {
    setTimeout(() => win.print(), 150);
  });
}

// ─── CIN item helpers ───────────────────────────────────────────────────────

const SPACER = "__SPACE__";

// True when a row's real (non-spacer) members are exactly the full daily
// roster — same CINs, no more, no fewer, duplicates collapsed by set
// equality. Used to collapse a fully-certified row's member list down to a
// single "TEAM" pill in CinCertifyCell — never for a row that merely
// happens to have every member certified, only one that IS the whole team.
function isFullTeamMembers(
  members: { memberName: string }[],
  rosterCins: string[] | undefined
): boolean {
  if (!rosterCins || rosterCins.length === 0) return false;
  const realSet = new Set(
    members
      .map(m => m.memberName)
      .filter(n => n !== SPACER)
      .map(n => n.toUpperCase())
  );
  const rosterSet = new Set(rosterCins.map(c => c.toUpperCase()));
  if (realSet.size !== rosterSet.size) return false;
  return Array.from(rosterSet).every(cin => realSet.has(cin));
}

// A single member row: certify/uncertify shield inline with the CIN, plus
// the remove-CIN control — the merged replacement for the old separate
// CIN and Certify columns (Option A from the column-merge mockup).
function CinCertifyRow({
  row,
  member,
  cert,
  canEdit,
  canCertify,
  isLocked,
  onCertify,
  onUncertify,
  onRemove,
}: {
  row: SheetRow;
  member: Member;
  cert: Certification | undefined;
  canEdit: boolean;
  canCertify: boolean;
  isLocked: boolean;
  onCertify: (rowId: number, memberId: number) => void;
  onUncertify: (rowId: number, memberId: number) => void;
  onRemove: () => void;
}) {
  // On a phone each row is a card and the CINs wrap as chips (see the
  // .running-sheet-cards rules in index.css), so there is no blank space beside
  // a chip to hold: the hold happens on the chip itself instead. Laptop and
  // iPad keep the blank-space hold exactly as before.
  const isPhone = useIsMobile();
  const ROW_H = isPhone ? "h-7" : "h-8";
  const isSpacer = member.memberName === SPACER;
  const canRemove = canEdit && !isLocked;
  const chipHold = isPhone && canRemove && !isSpacer;

  // Removing a CIN (or a spacer) is a press-and-hold, not a tap — a red fill
  // sweeps across the row over HOLD_MS; releasing early cancels. No icon, no
  // reserved space, and much harder to trigger by accident than a plain tap
  // on a legal record. Driven imperatively via a ref (not React state) so
  // the fill animates every frame without re-rendering the row.
  const HOLD_MS = 1000;
  const fillRef = useRef<HTMLDivElement>(null);
  // On a chip the red fill only starts after a short pause so an ordinary tap
  // never flashes red; the removal still lands at HOLD_MS.
  const SHOW_AFTER_MS = chipHold ? 250 : 0;
  const holdRef = useRef<{
    active: boolean;
    start: number;
    raf: number | null;
    x: number;
    y: number;
  }>({ active: false, start: 0, raf: null, x: 0, y: 0 });
  // Set when a hold completes so the click that follows the finger lifting
  // does not also certify the chip that was just removed.
  const heldRef = useRef(false);

  useEffect(() => {
    return () => {
      if (holdRef.current.raf) cancelAnimationFrame(holdRef.current.raf);
    };
  }, []);

  const startHold = (e: React.PointerEvent) => {
    if (!canRemove) return;
    const hold = holdRef.current;
    hold.active = true;
    hold.start = performance.now();
    hold.x = e.clientX;
    hold.y = e.clientY;
    heldRef.current = false;
    if (fillRef.current) {
      fillRef.current.style.transition = "none";
    }
    const step = (now: number) => {
      if (!hold.active) return;
      const elapsed = now - hold.start;
      const pct = Math.min(
        1,
        Math.max(0, (elapsed - SHOW_AFTER_MS) / (HOLD_MS - SHOW_AFTER_MS))
      );
      if (fillRef.current) fillRef.current.style.width = `${pct * 100}%`;
      if (elapsed >= HOLD_MS) {
        hold.active = false;
        heldRef.current = true;
        onRemove();
        return;
      }
      hold.raf = requestAnimationFrame(step);
    };
    hold.raf = requestAnimationFrame(step);
  };

  // A finger that drifts (scrolling the page) is not a hold.
  const moveHold = (e: React.PointerEvent) => {
    const hold = holdRef.current;
    if (!hold.active) return;
    if (Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) cancelHold();
  };

  const cancelHold = () => {
    const hold = holdRef.current;
    if (!hold.active) return;
    // The red fill was already showing, so this was a hold that got let go,
    // not a tap: don't let the click that follows certify the chip.
    if (chipHold && performance.now() - hold.start > SHOW_AFTER_MS) {
      heldRef.current = true;
    }
    hold.active = false;
    if (hold.raf) cancelAnimationFrame(hold.raf);
    if (fillRef.current) {
      fillRef.current.style.transition = "width 0.2s ease";
      fillRef.current.style.width = "0%";
    }
  };

  // Suppresses the native long-press text-selection/"Copy" callout that
  // iOS and Android would otherwise show wherever a press-and-hold gesture
  // lands, including on the plain-text CIN inside the pill below —
  // WebkitTouchCallout is iOS Safari-specific, userSelect covers the rest.
  const noCalloutStyle: React.CSSProperties = {
    WebkitTouchCallout: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
  };

  if (isSpacer) {
    return (
      <div
        className={`relative flex items-center gap-1 ${ROW_H} select-none ${isPhone ? "basis-full w-full" : ""}`}
        style={
          canRemove ? { ...noCalloutStyle, touchAction: "none" } : undefined
        }
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
      >
        {/* Spacer — blank row for visual separation, press-and-hold to remove */}
        {canRemove && (
          <div
            ref={fillRef}
            className="absolute inset-0 bg-destructive/15 pointer-events-none"
            style={{ width: "0%" }}
          />
        )}
        {isPhone && (
          <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
        )}
        <span className="relative z-10 flex-1 min-w-0" />
      </div>
    );
  }

  const canToggle = canCertify && !isLocked;

  // A single rounded chip, sized to fit its content, carries both the CIN
  // and its certify state — a tap anywhere on it certifies/uncertifies.
  // Removing it is a separate 1s press-and-hold in the blank space to the
  // chip's right (same fill-sweep mechanic as the spacer row above), so
  // the two gestures never share a hit target.
  const pillBase = `relative flex items-center gap-1.5 h-full min-w-0 px-2.5 border rounded-full text-xs font-bold ${
    cert
      ? "text-[var(--certified-color)] border-[var(--locked-border)] bg-[var(--locked-bg)]"
      : "text-red-500 border-red-500/35 bg-red-500/5"
  }`;
  const pillContent = (
    <>
      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
      <span className="font-mono truncate">{member.memberName}</span>
    </>
  );

  return (
    <div
      className={`${isPhone ? "inline-flex" : "flex"} items-center ${ROW_H} select-none`}
      style={noCalloutStyle}
    >
      <div
        className={`inline-flex items-stretch h-7 max-w-full rounded-full shrink-0 ${chipHold ? "relative overflow-hidden" : ""}`}
        style={chipHold ? { touchAction: "manipulation" } : undefined}
        onPointerDown={chipHold ? startHold : undefined}
        onPointerUp={chipHold ? cancelHold : undefined}
        onPointerLeave={chipHold ? cancelHold : undefined}
        onPointerCancel={chipHold ? cancelHold : undefined}
        onPointerMove={chipHold ? moveHold : undefined}
        onContextMenu={chipHold ? e => e.preventDefault() : undefined}
      >
        {chipHold && (
          <div
            ref={fillRef}
            className="absolute inset-y-0 left-0 z-10 bg-destructive/30 pointer-events-none"
            style={{ width: "0%" }}
          />
        )}
        {canToggle ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`${pillBase} cursor-pointer`}
                onClick={() => {
                  if (heldRef.current) {
                    heldRef.current = false;
                    return;
                  }
                  if (cert) onUncertify(row.id, member.id);
                  else onCertify(row.id, member.id);
                }}
              >
                {pillContent}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {cert ? (
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    Certified by{" "}
                    {(cert as any).certifiedByCIN || cert.certifiedByName} — tap
                    to uncertify
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {format(new Date(cert.certifiedAt), "MMM d, yyyy HH:mm:ss")}
                  </span>
                </div>
              ) : (
                `Certify ${member.memberName}`
              )}
            </TooltipContent>
          </Tooltip>
        ) : cert ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`${pillBase} cursor-default`}>
                {pillContent}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">
                  Certified by{" "}
                  {(cert as any).certifiedByCIN || cert.certifiedByName}
                </span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(cert.certifiedAt), "MMM d, yyyy HH:mm:ss")}
                </span>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className={`${pillBase} cursor-default`}>{pillContent}</span>
        )}
      </div>

      {/* Hold zone — the blank space to the right of the pill, press-and-hold
          1s to remove. A red fill sweeps across it as visual feedback. */}
      {canRemove && !isPhone && (
        <div
          className="relative flex-1 h-full min-w-[28px]"
          style={{ ...noCalloutStyle, touchAction: "none" }}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
        >
          <div
            ref={fillRef}
            className="absolute inset-0 rounded-md bg-destructive/20 pointer-events-none"
            style={{ width: "0%" }}
          />
        </div>
      )}
    </div>
  );
}

// ─── CIN + Certify Cell ─────────────────────────────────────────────────────
// Merges what used to be two separate columns (CIN, Certify) into one —
// each member's shield sits inline with their CIN (CinCertifyRow above),
// with the same "TEAM" collapse, "Uncertify All", and "Delete row" controls
// as before.

function CinCertifyCell({
  row,
  canEdit,
  canCertify,
  onAddMember,
  onRemoveMember,
  onCertify,
  onUncertify,
  onUncertifyAll,
  onDeleteRow,
  rosterCins,
}: {
  row: SheetRow;
  canEdit: boolean;
  canCertify: boolean;
  onAddMember: (rowId: number, name: string) => void;
  onRemoveMember: (memberId: number, rowId: number) => void;
  onCertify: (rowId: number, memberId: number) => void;
  onUncertify: (rowId: number, memberId: number) => void;
  onUncertifyAll: (rowId: number) => void;
  onDeleteRow?: (rowId: number) => void;
  rosterCins?: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNameValid, setNewNameValid] = useState(false);

  const handleAdd = () => {
    if (!newName.trim()) return;
    const val = newName.trim();
    onAddMember(row.id, val);
    setNewName("");
    setAdding(false);
  };

  // Adds every rostered CIN to this row at once, in roster order (leader
  // first, then ascending CIN), one mutation at a time so order is
  // preserved rather than racing. Two entry points share this: the "★ Add
  // all team CINs" dropdown option below, and the "Team" quick-add button
  // shown next to "+ Add" whenever a roster exists.
  const addAllTeamCins = () => {
    if (!rosterCins || rosterCins.length === 0) return;
    const addSequentially = (cins: string[], idx: number) => {
      if (idx >= cins.length) {
        setAdding(false);
        return;
      }
      onAddMember(row.id, cins[idx]);
      setTimeout(() => addSequentially(cins, idx + 1), 80);
    };
    addSequentially(rosterCins, 0);
  };

  const total = row.members.length;

  // A fully-certified row (isLocked) whose members are exactly the full
  // daily roster collapses to a single green "TEAM" pill instead of every
  // CIN + shield — the individual CINs are still the real data underneath
  // (used by Witness List generation and everywhere else); this is display
  // only. "Uncertify All" below still un-collapses it, same as ever.
  const showTeamCollapse =
    row.isLocked && isFullTeamMembers(row.members, rosterCins);

  const memberItems = showTeamCollapse ? (
    <div className="flex items-center h-8">
      <div className="inline-flex items-center gap-1.5 h-7 px-2.5 border rounded-full text-xs font-bold text-[var(--certified-color)] border-[var(--locked-border)] bg-[var(--locked-bg)]">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        <span className="font-mono">TEAM</span>
      </div>
    </div>
  ) : total === 0 ? null : (
    row.members.map(member => {
      const cert = row.certifications.find(
        c => c.memberId === member.id && c.isActive
      );
      return (
        <CinCertifyRow
          key={member.id}
          row={row}
          member={member}
          cert={cert}
          canEdit={canEdit}
          canCertify={canCertify}
          isLocked={row.isLocked}
          onCertify={onCertify}
          onUncertify={onUncertify}
          onRemove={() => onRemoveMember(member.id, row.id)}
        />
      );
    })
  );

  const addingPanel = (
    <div className="flex flex-col gap-1.5 mt-0.5">
      {rosterCins && rosterCins.length > 0 ? (
        /* Dropdown mode: pick from team roster — Space at top, duplicates allowed */
        <div className="flex items-center gap-1.5">
          <Select
            value={newName}
            onValueChange={v => {
              if (v === "__all__") {
                addAllTeamCins();
              } else {
                onAddMember(row.id, v);
                setNewName("");
                setAdding(false);
              }
            }}
          >
            <SelectTrigger className="h-7 text-xs flex-1 min-w-[120px]">
              <SelectValue placeholder="Pick…" />
            </SelectTrigger>
            <SelectContent>
              {/* Space option always at the top */}
              <SelectItem
                value={SPACER}
                className="text-xs text-muted-foreground italic"
              >
                — Space —
              </SelectItem>
              {rosterCins.map(cin => (
                <SelectItem key={cin} value={cin} className="font-mono text-xs">
                  {cin}
                </SelectItem>
              ))}
              {rosterCins.length > 1 && (
                <SelectItem
                  value="__all__"
                  className="text-xs font-medium text-primary"
                >
                  ★ Add all team CINs
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => {
              setAdding(false);
              setNewName("");
            }}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        /* Free-text mode: validated against registered users — duplicates allowed */
        <div className="flex items-center gap-1.5">
          <CinInput
            autoFocus
            placeholder="Enter CIN"
            value={newName}
            onChange={setNewName}
            onValidCin={cin => {
              setNewName(cin);
              setNewNameValid(true);
            }}
            onInvalidCin={() => setNewNameValid(false)}
            showValidation
            className="h-7 text-xs px-2"
          />
          <Button
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleAdd}
            disabled={!newNameValid}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );

  const isPhone = useIsMobile();

  // Phone: the row is a card (index.css), so the CINs wrap as chips under a
  // small label, with Add / Team / Delete row in one equal row at the bottom.
  if (isPhone) {
    const hasRoster = !!rosterCins && rosterCins.length > 1;
    const actionCount = 1 + (hasRoster ? 1 : 0) + (onDeleteRow ? 1 : 0);
    return (
      <div className="-mx-3 flex flex-col gap-2 border-t border-border px-3 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">{memberItems}</div>

        {canEdit &&
          !row.isLocked &&
          (adding ? (
            addingPanel
          ) : (
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${actionCount}, minmax(0, 1fr))`,
              }}
            >
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-1 px-1.5 text-xs font-semibold"
                onClick={() => setAdding(true)}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add
              </Button>
              {hasRoster && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 gap-1 border-primary px-1.5 text-xs font-semibold text-primary"
                  onClick={addAllTeamCins}
                  title={`Add all ${rosterCins!.length} rostered CINs`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Team
                </Button>
              )}
              {!row.isLocked && onDeleteRow && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 gap-1 px-1.5 text-xs font-semibold text-destructive"
                  onClick={() => onDeleteRow(row.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete row
                </Button>
              )}
            </div>
          ))}

        {row.isLocked && (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1 border-[var(--locked-border)] bg-[var(--locked-bg)] py-0 px-1.5 text-xs text-[var(--certified-color)]"
            >
              <Lock className="w-2.5 h-2.5" />
              Locked
            </Badge>
          </div>
        )}
        {row.isLocked && canCertify && (
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-1 px-1.5 text-[13px] font-semibold text-foreground"
            onClick={() => onUncertifyAll(row.id)}
          >
            <Unlock className="w-3.5 h-3.5" />
            Uncertify all
          </Button>
        )}
        {/* Delete row for a row that is not editable-but-deletable is covered above */}
        {!canEdit && !row.isLocked && onDeleteRow && (
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-1 px-1.5 text-xs font-semibold text-destructive"
            onClick={() => onDeleteRow(row.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete row
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-w-[90px]">
      {memberItems}

      {/* Add button — sits below all CINs */}
      {canEdit &&
        !row.isLocked &&
        (adding ? (
          addingPanel
        ) : (
          <div className="flex flex-col mt-0.5">
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors w-fit"
            >
              <span className="flex w-6 h-6 items-center justify-center shrink-0">
                <UserPlus className="w-3 h-3" />
              </span>
              Add
            </button>
            {rosterCins && rosterCins.length > 1 && (
              <button
                onClick={addAllTeamCins}
                className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors w-fit"
                title={`Add all ${rosterCins.length} rostered CINs`}
              >
                <span className="flex w-6 h-6 items-center justify-center shrink-0">
                  <Users className="w-3 h-3" />
                </span>
                Team
              </button>
            )}
          </div>
        ))}

      {/* Locked badge — the certified count is redundant with the shields */}
      {row.isLocked && (
        <div className="flex items-center gap-1.5 mt-1">
          <Badge
            variant="outline"
            className="gap-1 text-[var(--certified-color)] border-[var(--locked-border)] bg-[var(--locked-bg)] text-xs py-0 px-1.5"
          >
            <Lock className="w-2.5 h-2.5" />
            Locked
          </Badge>
        </div>
      )}

      {/* Footer actions */}
      {row.isLocked && canCertify && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 pl-0 pr-2 gap-1 text-xs text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 mt-1 w-fit"
              onClick={() => onUncertifyAll(row.id)}
            >
              <span className="flex w-6 h-6 items-center justify-center shrink-0">
                <Unlock className="w-3 h-3" />
              </span>
              Uncertify All
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Remove all certifications and unlock row
          </TooltipContent>
        </Tooltip>
      )}
      {!row.isLocked && onDeleteRow && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 pl-0 pr-2 gap-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 mt-1 w-fit"
          onClick={() => onDeleteRow(row.id)}
        >
          <span className="flex w-6 h-6 items-center justify-center shrink-0">
            <Trash2 className="w-3 h-3" />
          </span>
          Delete row
        </Button>
      )}
    </div>
  );
}

// ─── Observation Photo Attachments ─────────────────────────────────────────────
// Shown inline under the observation text whenever it contains an imagery
// phrase (e.g. "PHOTOGRAPH/S TAKEN" from the PT shortcut). Photos render
// directly in the cell at ~1/3 width — same proportion used in the PDF export.

function ObservationAttachments({
  row,
  canEdit,
  onUpload,
  onDelete,
  uploading,
  deletePending,
  operationId,
}: {
  row: SheetRow;
  canEdit: boolean;
  onUpload: (
    rowId: number,
    blob: Blob,
    mimeType: string,
    fileName: string
  ) => Promise<{ id: number; url: string }>;
  onDelete: (id: number) => void;
  uploading: boolean;
  deletePending?: boolean;
  operationId?: number;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  // A photo chosen but not yet uploaded: it opens the "Link photo to entity"
  // window with the photo ready, and only goes up when the officer presses the
  // green Confirm upload at the bottom right of that window.
  const [pendingPhoto, setPendingPhoto] = useState<{
    blob: Blob;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [linking, setLinking] = useState<{ id: number; url: string } | null>(
    null
  );
  // This row's real CINs (excluding the "__SPACE__" spacer) — a single-CIN
  // row gets its photos auto-linked at upload (see
  // autoLinkAttachmentToRowMemberIfSingle in db.ts), so this is only
  // actually used for the badge's "properly linked" check and, on a
  // multi-CIN row, LinkAttachmentDialog's own CIN picker section below.
  const rowCins = row.members
    .map(m => m.memberName)
    .filter(cin => cin !== "__SPACE__");
  const inputRef = useRef<HTMLInputElement>(null);

  if (!IMAGERY_PHRASE_PATTERN.test(row.observation ?? "")) return null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const compressed = await compressAttachmentImage(file);
      const blob: Blob = compressed?.blob ?? file;
      const mimeType = compressed?.mimeType ?? file.type;
      const fileName = compressed?.fileName ?? file.name;

      if (blob.size > 25 * 1024 * 1024) {
        toast.error("Photo must be under 25 MB.");
        return;
      }

      // Staged only — nothing is uploaded until Confirm upload is pressed in
      // the link window.
      setPendingPhoto({ blob, mimeType, fileName });
    } catch {
      toast.error(
        "Couldn't process that photo — try again, or use a different photo."
      );
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      {row.attachments.map(a => (
        <ResizablePhoto key={a.id} photoId={a.id}>
          {handle => (
            <>
              <div className="relative">
                <img
                  src={a.url}
                  alt="Attached photograph"
                  className="w-full rounded border border-border cursor-zoom-in"
                  onClick={() => setLightbox(a.url)}
                />
                {handle}
              </div>
              {canEdit && (
                <DeletePhotoButton
                  pending={deletePending}
                  onConfirm={() => onDelete(a.id)}
                  positionClassName="absolute -top-1.5 -right-1.5"
                  iconSize="h-3.5 w-3.5 sm:h-4 sm:w-4"
                  glyphSize="h-2 w-2 sm:h-2.5 sm:w-2.5"
                />
              )}
              <LinkedEntityPills
                entities={a.linkedEntities}
                faceCount={a.faceCount}
                hasRow
                onClick={() => setLinking({ id: a.id, url: a.url })}
              />
            </>
          )}
        </ResizablePhoto>
      ))}
      {preview && uploading && (
        <div style={{ width: "33%", minWidth: 90, maxWidth: 160 }}>
          <img
            src={preview}
            alt="Uploading…"
            className="w-full rounded border border-border opacity-50"
          />
        </div>
      )}
      {canEdit && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            title="Attach photo"
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
          >
            <Camera className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={handleFile}
          />
        </>
      )}

      {pendingPhoto && operationId != null && (
        <LinkAttachmentDialog
          open
          onOpenChange={o => {
            if (!o) setPendingPhoto(null);
          }}
          currentOperationId={operationId}
          rowCins={row.members
            .map(m => m.memberName)
            .filter(cin => cin !== "__SPACE__")}
          stagedPhoto={{
            ...pendingPhoto,
            operationId,
            upload: async (blob, mimeType, fileName) => {
              // The same row upload as before — it just waits for Confirm.
              setPreview(URL.createObjectURL(blob));
              return onUpload(row.id, blob, mimeType, fileName);
            },
          }}
        />
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Attached photograph"
            className="max-w-full max-h-full rounded shadow-2xl"
          />
        </div>
      )}

      {linking !== null && (
        <LinkAttachmentDialog
          attachmentId={linking.id}
          photoUrl={linking.url}
          open={linking !== null}
          onOpenChange={open => {
            if (!open) setLinking(null);
          }}
          currentOperationId={operationId}
          rowCins={rowCins}
        />
      )}
    </div>
  );
}

// ─── Time Picker Cell ────────────────────────────────────────────────────────

/** Converts "hh:mm AM/PM" display string to minutes-since-midnight (0-1439) */
function timeStringToMinutes(t: string): number {
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return -1;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const period = m[3].toUpperCase();
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return h * 60 + min;
}

/** Formats minutes-since-midnight to "hh:mm AM/PM" */
function minutesToTimeString(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const min = mins % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${period}`;
}

function TimePickerCell({
  value,
  locked,
  dayOffset = 0,
  rowDate,
  inferredRowDate,
  sheetHasCrossedMidnight = false,
  sheetDate,
  sheetCreatedAt,
  onSave,
}: {
  value: string | null;
  locked: boolean;
  dayOffset?: number;
  rowDate?: string | null;
  inferredRowDate?: string | null;
  sheetHasCrossedMidnight?: boolean;
  /** The sheet's picker-set calendar date (YYYY-MM-DD) — the authoritative
   * date for a new row, taking priority over createdAt (when the DB row was
   * inserted, which can differ if the sheet was created for a past/future
   * date). Null only for legacy sheets that predate the date picker. */
  sheetDate?: string | null;
  sheetCreatedAt?: number | null;
  onSave: (
    display: string,
    minutes: number,
    dayOffset: number,
    rowDate?: string
  ) => void;
}) {
  // Default rowDate for a new row: the sheet's picker date first, falling
  // back to its creation date (Perth) only for legacy sheets with no
  // sheetDate — never the other way around, since createdAt is just when
  // the DB row was inserted and can differ from the shift's actual date.
  const sheetCreatedYmd = useMemo(() => {
    if (sheetDate) return sheetDate;
    if (!sheetCreatedAt) return getTodayPerthYmd();
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: PERTH_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(sheetCreatedAt));
  }, [sheetDate, sheetCreatedAt]);

  // Parse existing value into hour/minute/period; default to current time when empty
  const parsed = useMemo(() => {
    if (!value) {
      const now = new Date();
      const h24 = now.getHours();
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return {
        hour: String(h12),
        minute: String(now.getMinutes()).padStart(2, "0"),
        period: h24 < 12 ? "AM" : "PM",
      };
    }
    const m = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return { hour: "12", minute: "00", period: "AM" };
    return {
      hour: String(parseInt(m[1], 10)),
      minute: m[2].padStart(2, "0"),
      period: m[3].toUpperCase(),
    };
  }, [value]);

  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState(parsed.period);
  const [localDayOffset, setLocalDayOffset] = useState(dayOffset);
  // Default to the explicit rowDate, then inferred, then RS creation date
  const [selectedRowDate, setSelectedRowDate] = useState<string>(
    () => rowDate ?? inferredRowDate ?? sheetCreatedYmd
  );
  // Track whether any Radix Select dropdown is currently open
  const [selectOpen, setSelectOpen] = useState(false);
  // Controls visibility of the date stepper (toggled by Date button)
  const [showDateStepper, setShowDateStepper] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync local state when value prop changes (e.g. row refresh)
  useEffect(() => {
    setHour(parsed.hour);
    setMinute(parsed.minute);
    setPeriod(parsed.period);
  }, [parsed.hour, parsed.minute, parsed.period]);

  // Sync dayOffset from prop
  useEffect(() => {
    setLocalDayOffset(dayOffset);
  }, [dayOffset]);

  // Sync explicit/inferred rowDate from props
  useEffect(() => {
    setSelectedRowDate(rowDate ?? inferredRowDate ?? sheetCreatedYmd);
  }, [rowDate, inferredRowDate, sheetCreatedYmd]);

  // Close picker on outside click — but only when no Radix Select is open
  // (Radix portals render outside popoverRef, so we must ignore those clicks)
  useEffect(() => {
    if (!open || selectOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    // Use capture phase with a small delay so Radix can finish its own close logic first
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, selectOpen]);

  const handleDone = useCallback(() => {
    const display = `${String(parseInt(hour, 10)).padStart(2, "0")}:${minute.padStart(2, "0")} ${period}`;
    const mins = timeStringToMinutes(display);
    onSave(display, mins, localDayOffset, selectedRowDate);
    setOpen(false);
  }, [hour, minute, period, localDayOffset, selectedRowDate, onSave]);

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = Array.from({ length: 60 }, (_, i) =>
    String(i).padStart(2, "0")
  );

  if (locked) {
    return (
      <span className="text-sm font-mono text-muted-foreground">
        {value || <span className="italic opacity-40">—</span>}
      </span>
    );
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        className="flex items-center gap-1.5 text-sm font-mono hover:bg-accent/50 rounded px-1 py-0.5 transition-colors min-w-[90px]"
        onClick={() => setOpen(v => !v)}
      >
        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {value || (
          <span className="text-muted-foreground italic text-xs">Set time</span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-xl p-3">
          {/* Time selectors row + Now + Date inline */}
          <div className="flex items-center gap-1.5 mb-2 flex-nowrap">
            {/* Hour */}
            <Select
              value={hour}
              onOpenChange={o => setSelectOpen(o)}
              onValueChange={v => setHour(v)}
            >
              <SelectTrigger className="w-[70px] h-8 text-sm font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hours.map(h => (
                  <SelectItem
                    key={h}
                    value={h}
                    className="font-mono text-foreground"
                  >
                    {String(parseInt(h, 10)).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground font-mono text-lg">:</span>
            {/* Minute */}
            <Select
              value={minute}
              onOpenChange={o => setSelectOpen(o)}
              onValueChange={v => setMinute(v)}
            >
              <SelectTrigger className="w-[70px] h-8 text-sm font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {minutes.map(m => (
                  <SelectItem
                    key={m}
                    value={m}
                    className="font-mono text-foreground"
                  >
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* AM/PM */}
            <Select
              value={period}
              onOpenChange={o => setSelectOpen(o)}
              onValueChange={v => setPeriod(v)}
            >
              <SelectTrigger className="w-[76px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AM" className="text-foreground">
                  AM
                </SelectItem>
                <SelectItem value="PM" className="text-foreground">
                  PM
                </SelectItem>
              </SelectContent>
            </Select>
            {/* Now button — inline */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs px-2"
              onClick={() => {
                const now = new Date();
                const h24 = now.getHours();
                const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
                setHour(String(h12));
                setMinute(String(now.getMinutes()).padStart(2, "0"));
                setPeriod(h24 < 12 ? "AM" : "PM");
              }}
            >
              Now
            </Button>
            {/* Date button — toggles stepper */}
            <Button
              size="sm"
              variant={showDateStepper ? "default" : "outline"}
              className="h-8 text-xs px-2"
              onClick={() => setShowDateStepper(v => !v)}
            >
              Date
            </Button>
          </div>
          {/* Date stepper — only visible when Date button is active */}
          {showDateStepper && (
            <div className="flex items-center justify-between mb-2 px-1 py-1 rounded-md border border-border/70 bg-muted/30">
              <button
                className="px-2 py-0.5 text-base font-bold text-muted-foreground hover:text-foreground transition-colors"
                onClick={() =>
                  setSelectedRowDate(addDaysToYmd(selectedRowDate, -1))
                }
              >
                ◀
              </button>
              <span className="text-xs font-semibold tracking-widest text-foreground font-mono">
                {formatPerthDateLabel(selectedRowDate)}
              </span>
              <button
                className="px-2 py-0.5 text-base font-bold text-muted-foreground hover:text-foreground transition-colors"
                onClick={() =>
                  setSelectedRowDate(addDaysToYmd(selectedRowDate, 1))
                }
              >
                ▶
              </button>
            </div>
          )}
          {/* Done button — full width */}
          <Button size="sm" className="w-full h-7 text-xs" onClick={handleDone}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Editable Cell ────────────────────────────────────────────────────────────

function EditableCell({
  value,
  locked,
  multiline,
  placeholder,
  onSave,
  shortcuts,
  usedBracketCodes,
  usedVehicleRegos,
  usedAddressLabels,
  rowId,
  autoEdit,
  autoEditKeyboard,
  onAutoEdited,
}: {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  value: string | null;
  locked: boolean;
  multiline?: boolean;
  placeholder?: string;
  onSave: (val: string) => void;
  shortcuts?: Record<string, string>;
  /** Bracket codes already used elsewhere in this sheet — enables the
   * inline name-mention autocomplete when provided (multiline only). */
  usedBracketCodes?: Set<string>;
  /** Vehicle regos already used elsewhere in this sheet — enables the
   * inline vehicle-mention autocomplete when provided (multiline only). */
  usedVehicleRegos?: Set<string>;
  /** Address labels already used elsewhere in this sheet — enables the
   * deterministic address-bracket auto-insert (multiline only). */
  usedAddressLabels?: Set<string>;
  /** This cell's row id — tagged onto the textarea so the continuity cards
   * can tell which saved row an open edit replaces. */
  rowId?: number;
  /** Open this cell for editing as soon as it appears (a continuity card has
   * just created the row), so the next tap adds to it as the next paragraph.
   * Opened without the on-screen keyboard until the officer taps into it. */
  autoEdit?: boolean;
  /** With autoEdit: keep the on-screen keyboard (the officer is about to type
   * the rest of the text) and put the caret at the end. */
  autoEditKeyboard?: boolean;
  onAutoEdited?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // The shortcut chips that are whole sentences — the tidy-up puts a full stop
  // between two of them (shared/sentenceJoin.ts).
  const sentenceChips = useMemo(
    () => wholeSentenceChips(Object.values(shortcuts ?? {})),
    [shortcuts]
  );
  // Opened by a card tap: focus it without raising the on-screen keyboard
  // (inputMode "none") until the officer actually taps into the text.
  const [noKeyboard, setNoKeyboard] = useState(false);
  // The caret goes to the end of the text when the cell opens by itself.
  const [caretToEnd, setCaretToEnd] = useState(false);
  useEffect(() => {
    if (autoEdit && !locked && multiline) {
      setNoKeyboard(!autoEditKeyboard);
      setCaretToEnd(true);
      setEditing(true);
      onAutoEdited?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit]);
  const [draft, setDraft] = useState(value ?? "");
  const { notifyObservationFocus, notifyObservationBlur } =
    useObservationFocus();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Inline mention autocomplete ─────────────────────────────────────────
  const [mentionWord, setMentionWord] = useState<{
    word: string;
    wordStart: number;
    wordEnd: number;
  } | null>(null);
  const [mentionAnchor, setMentionAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const mentionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const { data: mentionResults } =
    trpc.intelligence.searchPersonMentions.useQuery(
      { query: mentionQuery },
      { enabled: mentionQuery.trim().length >= 2 }
    );
  const mentionSuggestions: PersonMentionSuggestion[] =
    mentionQuery.trim().length >= 2 ? (mentionResults ?? []) : [];
  // Picking a suggestion here is at least as deliberate a confirmation as
  // clicking "Yes" on the save-time TargetMatchDialog prompt — recording
  // the same decision immediately means that prompt doesn't fire again for
  // a person the officer just identified by name.
  const confirmPersonMatch =
    trpc.intelligence.confirmPersonNameMatch.useMutation();

  function closeMentionDropdown() {
    setMentionWord(null);
    setMentionAnchor(null);
    setMentionQuery("");
    setMentionActiveIndex(0);
    if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current);
  }

  // ── Inline vehicle-mention autocomplete ─────────────────────────────────
  // Mirrors the person-mention block above, but triggers on a rego-shaped
  // token instead of a capitalised name (see detectVehicleMentionTrigger),
  // and searches the same Intelligence entity index the Target Registry's
  // vehicle autocomplete already uses (trpc.intelligence.searchEntities).
  const [vehicleMentionWord, setVehicleMentionWord] = useState<{
    word: string;
    wordStart: number;
    wordEnd: number;
  } | null>(null);
  const [vehicleMentionAnchor, setVehicleMentionAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [vehicleMentionActiveIndex, setVehicleMentionActiveIndex] = useState(0);
  const vehicleMentionDebounceRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [vehicleMentionQuery, setVehicleMentionQuery] = useState("");
  const { data: vehicleMentionResults } =
    trpc.intelligence.searchEntities.useQuery(
      { type: "vehicle", query: vehicleMentionQuery, excludeTargets: false },
      { enabled: vehicleMentionQuery.trim().length >= 2 }
    );
  const vehicleMentionSuggestions = (
    vehicleMentionQuery.trim().length >= 2 ? (vehicleMentionResults ?? []) : []
  ) as { key: string; label: string; rowCount: number }[];

  function closeVehicleMentionDropdown() {
    setVehicleMentionWord(null);
    setVehicleMentionAnchor(null);
    setVehicleMentionQuery("");
    setVehicleMentionActiveIndex(0);
    if (vehicleMentionDebounceRef.current)
      clearTimeout(vehicleMentionDebounceRef.current);
  }

  // ── Inline address suggestions ──────────────────────────────────────────
  // Typing a street number + the start of a street ("13 Den") lists known
  // addresses; once none are known, Google addresses (see
  // AddressSuggestDropdown). Takes precedence over the name trigger, which
  // would otherwise also fire on the capitalised street word.
  const [addressWord, setAddressWord] = useState<{
    text: string;
    start: number;
    end: number;
  } | null>(null);
  const [addressAnchor, setAddressAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [addressActiveIndex, setAddressActiveIndex] = useState(0);
  const [addressQuery, setAddressQuery] = useState("");
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addressMode, setAddressMode] = useState<AddressSuggestMode>("address");
  const addressSuggest = useAddressSuggestions(addressQuery, addressMode);
  const addressItems = addressWord ? addressSuggest.items : [];
  const addressOpen =
    !!addressWord &&
    !!addressAnchor &&
    (addressItems.length > 0 || addressSuggest.offlineNoKnown);

  // While the list is open, keep it glued under the caret as the row or page
  // scrolls and as the on-screen keyboard resizes the visible area.
  useEffect(() => {
    if (!addressOpen) return;
    let raf = 0;
    const update = () => {
      const t = textareaRef.current;
      if (!t) return;
      setAddressAnchor(
        getCaretPixelPosition(t, t.selectionStart ?? t.value.length)
      );
    };
    // Deferred two frames: when the keyboard opens or the visible area pans,
    // the app shell (DashboardLayout's setVh) re-positions itself in its own
    // viewport listener, which runs after this one — measuring straight away
    // reads the caret from the old layout and leaves the list misplaced.
    const refresh = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(update);
      });
    };
    window.addEventListener("scroll", refresh, true);
    window.visualViewport?.addEventListener("resize", refresh);
    window.visualViewport?.addEventListener("scroll", refresh);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", refresh, true);
      window.visualViewport?.removeEventListener("resize", refresh);
      window.visualViewport?.removeEventListener("scroll", refresh);
    };
  }, [addressOpen]);

  function closeAddressDropdown() {
    setAddressWord(null);
    setAddressAnchor(null);
    setAddressQuery("");
    setAddressActiveIndex(0);
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
  }

  async function selectAddressSuggestion(
    item: AddressSuggestItem,
    textarea: HTMLTextAreaElement
  ) {
    if (!addressWord) return;
    const { start, end } = addressWord;
    addressSuggest.endSession();
    closeAddressDropdown();
    const insertText = await addressSuggestInsertText(item);
    // A Google business needs a moment to resolve its street address, so
    // splice into whatever the draft is by then rather than a stale copy.
    setDraft(d => d.slice(0, start) + insertText + d.slice(end));
    const newPos = start + insertText.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  function handleObservationInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    let val = e.target.value;
    let cursorPos = e.target.selectionStart ?? val.length;
    // A space typed right after a bracket tidies what has been typed so far:
    // vehicle lists, one space between words, capitals, a space after commas
    // (shared/observationTidy.ts). The closing full stop waits for the end.
    if (justTypedSpaceAfterBracket(val, cursorPos)) {
      const joined = tidyObservationAtCaret(val, cursorPos, false, {
        sentenceChips,
      });
      if (joined.changed) {
        val = joined.text;
        cursorPos = joined.caret;
        const ta = e.target;
        const caret = joined.caret;
        requestAnimationFrame(() => ta.setSelectionRange(caret, caret));
      }
    }
    setDraft(val);

    if (usedVehicleRegos) {
      const vehicleTrigger = detectVehicleMentionTrigger(
        val,
        cursorPos,
        usedVehicleRegos
      );
      if (vehicleTrigger) {
        closeMentionDropdown();
        setVehicleMentionWord({
          word: vehicleTrigger.word,
          wordStart: vehicleTrigger.wordStart,
          wordEnd: cursorPos,
        });
        setVehicleMentionActiveIndex(0);
        setVehicleMentionAnchor(getCaretPixelPosition(e.target, cursorPos));
        if (vehicleMentionDebounceRef.current)
          clearTimeout(vehicleMentionDebounceRef.current);
        vehicleMentionDebounceRef.current = setTimeout(() => {
          setVehicleMentionQuery(vehicleTrigger.word);
        }, 250);
        return;
      }
      closeVehicleMentionDropdown();
    }

    if (usedAddressLabels) {
      // "@" asks for a place/business by name; otherwise a street number
      // plus the start of a street asks for an address.
      const placeTrigger = detectPlaceSuggestTrigger(val, cursorPos);
      const addrTrigger =
        placeTrigger ?? detectAddressSuggestTrigger(val, cursorPos);
      if (addrTrigger) {
        closeMentionDropdown();
        setAddressMode(placeTrigger ? "place" : "address");
        setAddressWord({
          text: addrTrigger.text,
          start: addrTrigger.start,
          end: cursorPos,
        });
        setAddressActiveIndex(0);
        setAddressAnchor(getCaretPixelPosition(e.target, cursorPos));
        if (addressDebounceRef.current)
          clearTimeout(addressDebounceRef.current);
        addressDebounceRef.current = setTimeout(() => {
          setAddressQuery(addrTrigger.text);
        }, 150);
        return;
      }
      closeAddressDropdown();
    }

    if (!usedBracketCodes) return;
    const trigger = detectMentionTrigger(val, cursorPos, usedBracketCodes);
    if (!trigger) {
      closeMentionDropdown();
      return;
    }
    setMentionWord({
      word: trigger.word,
      wordStart: trigger.wordStart,
      wordEnd: cursorPos,
    });
    setMentionActiveIndex(0);
    setMentionAnchor(getCaretPixelPosition(e.target, cursorPos));
    if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current);
    mentionDebounceRef.current = setTimeout(() => {
      setMentionQuery(trigger.word);
    }, 250);
  }

  function selectMentionSuggestion(
    s: PersonMentionSuggestion,
    textarea: HTMLTextAreaElement
  ) {
    if (!mentionWord) return;
    const insertText = `${s.displayName} (${s.bracketCode})`;
    const newDraft =
      draft.slice(0, mentionWord.wordStart) +
      insertText +
      draft.slice(mentionWord.wordEnd);
    setDraft(newDraft);
    if (s.targetId != null || s.associateId != null) {
      confirmPersonMatch.mutate({
        spelling: s.bracketCode,
        targetId: s.targetId ?? undefined,
        associateId: s.associateId ?? undefined,
        correctSpelling: s.bracketCode,
      });
    }
    closeMentionDropdown();
    const newPos = mentionWord.wordStart + insertText.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  function selectVehicleMentionSuggestion(
    s: { key: string; label: string; rowCount: number },
    textarea: HTMLTextAreaElement
  ) {
    if (!vehicleMentionWord) return;
    // s.label is the rego (Intelligence's stored short-form for a vehicle);
    // expand it back to the full RS narrative convention, same as picking a
    // vehicle in the Target Registry's autocomplete does.
    const insertText = expandIntelVehicleToFullForm(s.label);
    const newDraft =
      draft.slice(0, vehicleMentionWord.wordStart) +
      insertText +
      draft.slice(vehicleMentionWord.wordEnd);
    setDraft(newDraft);
    closeVehicleMentionDropdown();
    const newPos = vehicleMentionWord.wordStart + insertText.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }

  // Sync draft with incoming value prop whenever the cell is not being edited.
  // This ensures that after an external update (e.g. TV auto-fill saving new text),
  // clicking into the cell shows the newly saved content rather than the stale draft.
  useEffect(() => {
    if (!editing) {
      setDraft(value ?? "");
    }
  }, [value, editing]);

  const commit = (finalDraft?: string) => {
    const val = finalDraft !== undefined ? finalDraft : draft;
    // Always call onSave for TV trigger (so it fires even if value hasn't changed)
    if (val !== (value ?? "") || val.trim().toLowerCase() === "tv") onSave(val);
    setEditing(false);
  };

  /** Auto-expand shortcut triggers on Space or Tab, or — on Space only —
   * deterministically complete a fresh vehicle registration, street
   * address, or person's name into its bracket the instant it's typed.
   * Unlike the registry search dropdowns above (which can only suggest an
   * entity already known to Intelligence), these work for something
   * that's never been seen before — exactly the first-sighting case an
   * officer is describing from scratch. */
  const handleShortcutKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key !== " " && e.key !== "Tab") return;
    const textarea = e.currentTarget;
    const pos = textarea.selectionStart ?? 0;
    const textBefore = draft.slice(0, pos);

    // An unidentified person already introduced in full ("unidentified male
    // (UM1)" written earlier) is only ever referred to by the short name:
    // finishing the full wording again becomes "UM1".
    if (e.key === " " && usedBracketCodes) {
      const repeat = detectUnidentifiedRepeat(draft, pos, usedBracketCodes);
      if (repeat) {
        e.preventDefault();
        const newText = `${draft.slice(0, repeat.start)}${repeat.code} ${draft.slice(pos)}`;
        setDraft(newText);
        requestAnimationFrame(() => {
          const newPos = repeat.start + repeat.code.length + 1;
          textarea.setSelectionRange(newPos, newPos);
        });
        return;
      }
    }

    if (shortcuts) {
      // Find the last word before the cursor
      const match = textBefore.match(/(\S+)$/);
      if (match) {
        const word = match[1].toLowerCase();
        const expansion = shortcuts[word];
        if (expansion) {
          e.preventDefault();
          const before = textBefore.slice(
            0,
            textBefore.length - match[1].length
          );
          const after = draft.slice(pos);
          const newText = before + expansion + " " + after;
          setDraft(newText);
          // Restore cursor position after the expansion
          requestAnimationFrame(() => {
            const newPos = before.length + expansion.length + 1;
            textarea.setSelectionRange(newPos, newPos);
          });
          return;
        }
      }
    }

    if (e.key !== " ") return;

    // Reuses the same "does this look like a rego" rule the live
    // registry-search dropdown uses (see detectVehicleMentionTrigger), so
    // a word never triggers one behaviour but not the other. Already
    // bracket-introduced regos are skipped too — a later bare re-mention
    // of the same vehicle shouldn't get a second bracket, matching the
    // running sheet's own "introduce once, refer to bare after" convention.
    const vehicleTrigger = usedVehicleRegos
      ? detectVehicleMentionTrigger(draft, pos, usedVehicleRegos)
      : null;
    if (vehicleTrigger) {
      e.preventDefault();
      const { word, wordStart } = vehicleTrigger;
      const before = draft.slice(0, wordStart);
      const after = draft.slice(pos);
      const bracket = `(Vehicle ${word.toUpperCase()})`;
      const newText = `${before}${word} ${bracket} ${after}`;
      // The bracket is now complete and followed by a space — tidy what has
      // been typed so far (a vehicle listed straight after another gets
      // "and" / a comma and its "a" / "an").
      const joined = tidyObservationAtCaret(
        newText,
        before.length + word.length + 1 + bracket.length + 1,
        false,
        { sentenceChips }
      );
      setDraft(joined.text);
      closeVehicleMentionDropdown();
      requestAnimationFrame(() => {
        textarea.setSelectionRange(joined.caret, joined.caret);
      });
      return;
    }

    // Same idea, for a street address completed by its suburb + state
    // (see detectAddressSpaceCompletion) — "(44 Elvira Street)".
    const addressTrigger = usedAddressLabels
      ? detectAddressSpaceCompletion(draft, pos, usedAddressLabels)
      : null;
    if (addressTrigger) {
      e.preventDefault();
      const bracket = `(${addressTrigger.addressLabel})`;
      const before = draft.slice(0, pos);
      const after = draft.slice(pos);
      const newText = `${before} ${bracket} ${after}`;
      setDraft(newText);
      requestAnimationFrame(() => {
        const newPos = before.length + 1 + bracket.length + 1;
        textarea.setSelectionRange(newPos, newPos);
      });
      return;
    }

    // Same idea, for a fresh person's name completed by its ALL-CAPS
    // surname (see detectPersonNameSpaceCompletion) — "(SURNAME)".
    const personTrigger = usedBracketCodes
      ? detectPersonNameSpaceCompletion(draft, pos, usedBracketCodes)
      : null;
    if (personTrigger) {
      e.preventDefault();
      const bracket = `(${personTrigger.surname.toUpperCase()})`;
      const before = draft.slice(0, pos);
      const after = draft.slice(pos);
      const newText = `${before} ${bracket} ${after}`;
      setDraft(newText);
      closeMentionDropdown();
      requestAnimationFrame(() => {
        const newPos = before.length + 1 + bracket.length + 1;
        textarea.setSelectionRange(newPos, newPos);
      });
    }
  };

  if (locked) {
    return (
      <span className="text-sm text-muted-foreground whitespace-pre-wrap">
        {value || <span className="italic opacity-40">{placeholder}</span>}
      </span>
    );
  }

  if (editing) {
    if (multiline) {
      return (
        <>
          <Textarea
            ref={textareaRef}
            autoFocus
            data-obs-cell="true"
            data-row-id={rowId}
            inputMode={noKeyboard ? "none" : undefined}
            // Tapping into the text is the officer choosing to type, so the
            // keyboard is allowed again.
            onPointerDown={() => setNoKeyboard(false)}
            onFocus={e => {
              notifyObservationFocus();
              // A cell opened by a card tap (or opened by itself on a new first
              // row) starts with the caret at the end, ready for the next
              // paragraph.
              if (noKeyboard || caretToEnd) {
                const len = e.currentTarget.value.length;
                e.currentTarget.setSelectionRange(len, len);
                setCaretToEnd(false);
              }
            }}
            value={draft}
            onChange={handleObservationInput}
            onPaste={e => {
              // Auto-convert Google Maps addresses pasted into the observation field
              const pasted = e.clipboardData.getData("text");
              const converted = convertGoogleAddresses(pasted);
              if (converted !== pasted) {
                e.preventDefault();
                const ta = e.currentTarget;
                const start = ta.selectionStart ?? draft.length;
                const end = ta.selectionEnd ?? draft.length;
                const newText =
                  draft.slice(0, start) + converted + draft.slice(end);
                setDraft(newText);
              }
            }}
            onBlur={() => {
              // A click on a suggestion fires its own onMouseDown (which
              // preventDefault's) before this blur — so by the time blur
              // actually runs here, mentionWord is only still set if focus
              // left for some other reason, in which case the dropdown
              // should just close rather than block the save.
              closeMentionDropdown();
              closeVehicleMentionDropdown();
              closeAddressDropdown();
              notifyObservationBlur();
              // Leaving the field tidies the observation the officer typed:
              // Google addresses to RS format, then the tidy-up pass (vehicle
              // lists, spaces, capitals, closing full stop). A cell opened and
              // left without any change is never touched, so rows made by the
              // chips or the Target Logger stay exactly as they were.
              const edited = draft !== (value ?? "");
              const converted = convertGoogleAddresses(draft);
              const conv = edited
                ? tidyObservation(converted, true, { sentenceChips })
                : converted;
              if (conv !== draft) {
                setDraft(conv);
                commit(conv);
              } else {
                commit(draft);
              }
            }}
            onKeyDown={e => {
              if (addressOpen && addressItems.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setAddressActiveIndex(i => (i + 1) % addressItems.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setAddressActiveIndex(
                    i => (i - 1 + addressItems.length) % addressItems.length
                  );
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  selectAddressSuggestion(
                    addressItems[
                      Math.min(addressActiveIndex, addressItems.length - 1)
                    ],
                    e.currentTarget
                  );
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  closeAddressDropdown();
                  return;
                }
              }
              if (vehicleMentionWord && vehicleMentionSuggestions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setVehicleMentionActiveIndex(
                    i => (i + 1) % vehicleMentionSuggestions.length
                  );
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setVehicleMentionActiveIndex(
                    i =>
                      (i - 1 + vehicleMentionSuggestions.length) %
                      vehicleMentionSuggestions.length
                  );
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  selectVehicleMentionSuggestion(
                    vehicleMentionSuggestions[vehicleMentionActiveIndex],
                    e.currentTarget
                  );
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  closeVehicleMentionDropdown();
                  return;
                }
              }
              if (mentionWord && mentionSuggestions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionActiveIndex(
                    i => (i + 1) % mentionSuggestions.length
                  );
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionActiveIndex(
                    i =>
                      (i - 1 + mentionSuggestions.length) %
                      mentionSuggestions.length
                  );
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  selectMentionSuggestion(
                    mentionSuggestions[mentionActiveIndex],
                    e.currentTarget
                  );
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  closeMentionDropdown();
                  return;
                }
              }
              handleShortcutKeyDown(
                e as React.KeyboardEvent<HTMLTextAreaElement>
              );
              if (e.key === "Escape") {
                setDraft(value ?? "");
                setEditing(false);
              }
            }}
            className="text-sm min-h-[60px] resize-none"
            placeholder={placeholder}
          />
          {addressOpen && addressAnchor && (
            <AddressSuggestDropdown
              anchor={addressAnchor}
              items={addressItems}
              source={addressSuggest.source}
              offlineNoKnown={addressSuggest.offlineNoKnown}
              mode={addressMode}
              activeIndex={addressActiveIndex}
              onActiveIndexChange={setAddressActiveIndex}
              onPick={item => {
                if (textareaRef.current)
                  selectAddressSuggestion(item, textareaRef.current);
              }}
            />
          )}
          {mentionWord && mentionAnchor && mentionSuggestions.length > 0 && (
            <div
              className="fixed z-50 w-64 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
              style={{
                top: mentionAnchor.top,
                left: mentionAnchor.left,
                maxHeight: "220px",
                overflowY: "auto",
              }}
            >
              {mentionSuggestions.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-border/50 last:border-0 transition-colors ${
                    i === mentionActiveIndex
                      ? "bg-accent text-accent-foreground"
                      : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                  onMouseEnter={() => setMentionActiveIndex(i)}
                  onMouseDown={e => {
                    // mousedown fires before the textarea's blur, so this
                    // beats the onBlur close/save above.
                    e.preventDefault();
                    if (textareaRef.current)
                      selectMentionSuggestion(s, textareaRef.current);
                  }}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{s.displayName}</span>
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {s.rowCount} obs.
                  </span>
                </button>
              ))}
            </div>
          )}
          {vehicleMentionWord &&
            vehicleMentionAnchor &&
            vehicleMentionSuggestions.length > 0 && (
              <div
                className="fixed z-50 w-72 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
                style={{
                  top: vehicleMentionAnchor.top,
                  left: vehicleMentionAnchor.left,
                  maxHeight: "220px",
                  overflowY: "auto",
                }}
              >
                {vehicleMentionSuggestions.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 border-b border-border/50 last:border-0 transition-colors ${
                      i === vehicleMentionActiveIndex
                        ? "bg-accent text-accent-foreground"
                        : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                    onMouseEnter={() => setVehicleMentionActiveIndex(i)}
                    onMouseDown={e => {
                      // mousedown fires before the textarea's blur, so this
                      // beats the onBlur close/save above.
                      e.preventDefault();
                      if (textareaRef.current)
                        selectVehicleMentionSuggestion(s, textareaRef.current);
                    }}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">
                        {formatIntelVehicle(s.label)}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {s.rowCount} obs.
                    </span>
                  </button>
                ))}
              </div>
            )}
        </>
      );
    }
    return (
      <Input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={e => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        className="h-8 text-sm"
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      className="text-sm cursor-text hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 min-h-[1.75rem] transition-colors whitespace-pre-wrap"
      onClick={() => setEditing(true)}
    >
      {value || (
        <span className="text-muted-foreground italic text-xs">
          {placeholder}
        </span>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ── ShortcutChip — a quick-insert chip in the target / shortcuts panel ──────
// Fixed in place: the order comes from the Shortcuts page (see
// shared/rsChips.ts), so there is nothing to drag.
function ShortcutChip({
  label,
  value,
  showValue,
  onInsert,
}: {
  label: string;
  value?: string | null;
  showValue: boolean;
  onInsert: () => void;
}) {
  return (
    <button
      onMouseDown={e => e.preventDefault()}
      onClick={onInsert}
      title={`Insert: ${value}`}
      className="flex items-center gap-1 px-2 py-0.5 rounded border border-primary/30 bg-primary/8 hover:bg-primary/15 active:scale-95 transition-all select-none cursor-pointer"
    >
      <span className="text-xs font-bold text-primary uppercase tracking-wide">
        {label}
      </span>
      {showValue && value && (
        <span className="text-xs font-mono text-foreground/80 max-w-[160px] truncate">
          {value}
        </span>
      )}
    </button>
  );
}

export default function SheetDetail({
  sheetIdProp,
  embedded = false,
}: {
  /** Overrides the route param — used when this is rendered inside another
   * page's panel (see the map's RS Actions pane) rather than at its own
   * /sheet/:id route. */
  sheetIdProp?: number;
  /** True when rendered inside another page's panel instead of its own
   * route — hides the page chrome (back arrow, close/export controls, the
   * Summary/Governance tabs that would navigate the whole app away from the
   * host page) since the host page supplies its own header and close
   * control instead. */
  embedded?: boolean;
} = {}) {
  const { id } = useParams<{ id: string }>();
  const sheetId = sheetIdProp ?? parseInt(id ?? "0", 10);
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const utils = trpc.useUtils();
  const { isOnline, syncStatus } = useOffline();
  // Offline-aware local row state — used when offline
  const [offlineRows, setOfflineRows] = useState<typeof rows | null>(null);
  const [hasPendingOfflineChanges, setHasPendingOfflineChanges] =
    useState(false);

  // Per-session manual reorder tracking — suppresses auto-sort for rows the user has dragged
  // (client-only; resets on page reload, which is acceptable since sortOrder is persisted)
  const manuallyReorderedRowsRef = useRef<Set<number>>(new Set());
  const markManualReorder = (rowId: number) =>
    manuallyReorderedRowsRef.current.add(rowId);
  // Ref to the auto-sort function — set after parsedRoster and reorderMember are available
  const autoSortRef = useRef<((rowId: number) => void) | null>(null);

  const { data: sheet, isLoading: sheetLoading } = trpc.sheet.get.useQuery(
    { id: sheetId },
    { enabled: isAuthenticated && !!sheetId }
  );
  // Pre-fills AddTargetDialog's required OperationPicker with this sheet's
  // own operation, without changing the shape of sheet.get.
  const { data: sheetOperation } = trpc.operation.get.useQuery(
    { id: sheet?.operationId ?? 0 },
    { enabled: isAuthenticated && !!sheet?.operationId }
  );

  // Remembers this as the officer's most recent operation/sheet context —
  // used only to pre-fill the New SMEAC Briefing form, nothing else reads it.
  useEffect(() => {
    if (sheet?.operationId) {
      setLastActiveContext({ operationId: sheet.operationId, sheetId });
    }
  }, [sheet?.operationId, sheetId]);

  const { data: rows, isLoading: rowsLoading } = trpc.row.list.useQuery(
    { sheetId },
    {
      enabled: isAuthenticated && !!sheetId && isOnline,
      refetchInterval: isOnline ? 10000 : false,
    }
  );

  // Jumped here from the Audit Log's "Row" column (?highlightRow=<id>) —
  // scroll to and briefly highlight that row, same scroll+highlight
  // handleJumpToCheckRow already does for a "Check Running Sheet" finding,
  // just triggered by a URL param instead of an in-page dialog callback.
  // Waits for `rows` to actually be loaded (the <tr> won't exist in the DOM
  // before then), then strips the param via replace so refreshing the page
  // doesn't re-trigger it and the URL doesn't keep it around.
  const search = useSearch();
  useEffect(() => {
    if (!rows || rowsLoading) return;
    const raw = new URLSearchParams(search).get("highlightRow");
    const highlightRowId = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(highlightRowId)) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`sheet-row-${highlightRowId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("row-check-highlight");
        window.setTimeout(
          () => el.classList.remove("row-check-highlight"),
          2000
        );
      }
      navigate(`/sheet/${sheetId}`, { replace: true });
    }, 150);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rowsLoading, search]);

  const { data: entityChips } = trpc.row.entityChips.useQuery(
    { sheetId },
    {
      enabled: isAuthenticated && !!sheetId && isOnline,
      refetchInterval: isOnline ? 10000 : false,
    }
  );

  // Continuity chips (vehicle arriving/departing, walked in/out) — same
  // sheet-scoped "pending" queries the RS Quick Entry map popup uses (see
  // getPendingVehicleDepartures/Arrivals/WalkIns in server/db.ts). The
  // popup additionally filters these to whichever address pin is open;
  // the full sheet table has no such single-address context, so it shows
  // every pending entry across the sheet instead — see the render block
  // below for how each chip type's text is derived without it.
  const { data: pendingDeparturesBase } =
    trpc.row.pendingVehicleDepartures.useQuery(
      { sheetId },
      {
        enabled: isAuthenticated && !!sheetId && isOnline,
        refetchInterval: isOnline ? 10000 : false,
      }
    );
  const { data: pendingArrivalsBase } =
    trpc.row.pendingVehicleArrivals.useQuery(
      { sheetId },
      {
        enabled: isAuthenticated && !!sheetId && isOnline,
        refetchInterval: isOnline ? 10000 : false,
      }
    );
  const { data: pendingWalkInsBase } = trpc.row.pendingWalkIns.useQuery(
    { sheetId },
    {
      enabled: isAuthenticated && !!sheetId && isOnline,
      refetchInterval: isOnline ? 10000 : false,
    }
  );

  // Has the surveillance ended — every team member ceased and nobody has
  // commenced since (shared/surveillanceState.ts). Ends the Target Logger.
  const { data: surveillance } = trpc.row.surveillanceState.useQuery(
    { sheetId },
    {
      enabled: isAuthenticated && !!sheetId && isOnline,
      refetchInterval: isOnline ? 10000 : false,
    }
  );

  const { data: pendingHeadingToBase } = trpc.row.pendingHeadingTo.useQuery(
    { sheetId },
    {
      enabled: isAuthenticated && !!sheetId && isOnline,
      refetchInterval: isOnline ? 10000 : false,
    }
  );

  const { data: pendingPlacementsBase } = trpc.row.pendingPlacements.useQuery(
    { sheetId },
    {
      enabled: isAuthenticated && !!sheetId && isOnline,
      refetchInterval: isOnline ? 10000 : false,
    }
  );

  // Continuity cards the team has stopped tracking on this sheet (shared).
  const continuityDismissed = useMemo<Record<string, number>>(() => {
    try {
      return sheet?.continuityDismissed
        ? (JSON.parse(sheet.continuityDismissed) as Record<string, number>)
        : {};
    } catch {
      return {};
    }
  }, [sheet?.continuityDismissed]);
  const setContinuityDismissal = trpc.sheet.setContinuityDismissal.useMutation({
    onSuccess: () => utils.sheet.get.invalidate({ id: sheetId }),
  });

  // The text in an observation cell that is open for editing (not yet saved),
  // so the continuity cards can read it as the newest row and follow each
  // sentence as it is written. `rowId` is the saved row it replaces.
  const [openDraft, setOpenDraft] = useState<{
    rowId: number | null;
    text: string;
  } | null>(null);
  const [openDraftDebounced, setOpenDraftDebounced] = useState(openDraft);
  useEffect(() => {
    const t = setTimeout(() => setOpenDraftDebounced(openDraft), 250);
    return () => clearTimeout(t);
  }, [openDraft]);
  const { data: draftPending } = trpc.row.pendingWithDraft.useQuery(
    {
      sheetId,
      draft: openDraftDebounced?.text ?? "",
      excludeRowId: openDraftDebounced?.rowId ?? null,
    },
    {
      enabled:
        isAuthenticated &&
        !!sheetId &&
        isOnline &&
        !!openDraftDebounced?.text.trim(),
      placeholderData: prev => prev,
    }
  );
  const draftActive = !!openDraftDebounced?.text.trim() && !!draftPending;
  const pendingDepartures = draftActive
    ? draftPending!.departures
    : pendingDeparturesBase;
  const pendingArrivals = draftActive
    ? draftPending!.arrivals
    : pendingArrivalsBase;
  const pendingWalkIns = draftActive
    ? draftPending!.walkIns
    : pendingWalkInsBase;
  const pendingHeadingTo = draftActive
    ? draftPending!.headingTo
    : pendingHeadingToBase;
  const pendingPlacements = draftActive
    ? draftPending!.placements
    : pendingPlacementsBase;
  // Target Logger switches (per device, set in the map's right-hand pane).
  const trackingSettings = useTargetTrackingSettings();
  // What the sheet tracks (a person, a vehicle or a location) — the one rule
  // the cards, the map's flag and its popup share. The title alone answers it
  // until the server's answer (from the linked target) arrives or when offline.
  const { data: trackedTargetData } = trpc.sheet.trackedTarget.useQuery(
    { sheetId },
    { enabled: !!sheetId }
  );
  const trackedTarget = useMemo(
    () => trackedTargetData ?? resolveTrackedTarget({ title: sheet?.title }),
    [trackedTargetData, sheet?.title]
  );
  // Where the target is, for marking on the sheet's address chips.
  const targetPosition = useMemo(
    () =>
      trackingSettings.location
        ? locateTargetFromPending({
            subject: trackedTarget,
            arrivals: pendingArrivals ?? [],
            departures: pendingDepartures ?? [],
            walkIns: pendingWalkIns ?? [],
            headingTo: pendingHeadingTo ?? [],
            placements: pendingPlacements ?? [],
            extractNames: extractOccupantNames,
          })
        : null,
    [
      trackingSettings.location,
      trackedTarget,
      pendingArrivals,
      pendingDepartures,
      pendingWalkIns,
      pendingHeadingTo,
      pendingPlacements,
    ]
  );
  // The place for the Cease button's row — worked out when it is pressed,
  // whatever the Target Logger's own switches say: where the Logger has the
  // target (only when he is at a place), else where the team commenced
  // (shared/ceaseRow.ts).
  // It is a chip at the end of the target / shortcuts chips; the toolbar button
  // is only for a sheet that has no chip row showing (no chips, or collapsed).
  const [ceaseChipShown, setCeaseChipShown] = useState(false);
  const ceaseOpenForTyping = (rowId: number) => {
    setJustAddedKeyboard(true);
    setJustAddedRowId(rowId);
    setTimeout(() => setJustAddedRowId(null), 6000);
  };
  const ceasePlace = () =>
    ceasePlaceFor(
      locateTargetFromPending({
        subject: trackedTarget,
        arrivals: pendingArrivals ?? [],
        departures: pendingDepartures ?? [],
        walkIns: pendingWalkIns ?? [],
        headingTo: pendingHeadingTo ?? [],
        placements: pendingPlacements ?? [],
        extractNames: extractOccupantNames,
      }),
      rows ?? []
    );
  // Names already introduced in full anywhere on the sheet — saved rows AND
  // the text open for editing — so a card's inserted sentence refers to
  // someone already introduced by their short name only.
  const usedBracketCodesWithDraft = useMemo(
    () =>
      computeUsedBracketCodes([
        ...(rows ?? []),
        { observation: openDraft?.text },
      ]),
    [rows, openDraft?.text]
  );
  // A row just created by tapping a continuity card: its observation opens
  // for editing so the next tap adds to it (see EditableCell autoEdit).
  const [justAddedRowId, setJustAddedRowId] = useState<number | null>(null);
  // The row opened for typing is the officer's own to type in (the first row of
  // a sheet): keep the on-screen keyboard, unlike a card tap.
  const [justAddedKeyboard, setJustAddedKeyboard] = useState(false);

  const invalidateRows = useCallback(() => {
    utils.row.list.invalidate({ sheetId });
    utils.row.entityChips.invalidate({ sheetId });
    utils.row.pendingVehicleDepartures.invalidate({ sheetId });
    utils.row.pendingVehicleArrivals.invalidate({ sheetId });
    utils.row.pendingWalkIns.invalidate({ sheetId });
    utils.row.pendingHeadingTo.invalidate({ sheetId });
    utils.row.pendingPlacements.invalidate({ sheetId });
    utils.row.surveillanceState.invalidate({ sheetId });
  }, [utils, sheetId]);

  // Cache sheet data to IndexedDB whenever we have fresh data online
  useEffect(() => {
    if (!isOnline || !sheet || !rows || !sheetId) return;
    const cacheData: CachedSheet = {
      serverId: sheetId,
      operationId: sheet.operationId,
      title: sheet.title,
      sheetCins: sheet.sheetCins
        ? (JSON.parse(sheet.sheetCins) as CachedSheet["sheetCins"])
        : [],
      rows: rows.map(r => ({
        id: r.id,
        rowNumber: r.rowNumber,
        time: r.time ?? undefined,
        observation: r.observation ?? undefined,
        members: r.members
          .map(m => m.memberName)
          .filter(n => n !== "__SPACE__"),
      })),
      cachedAt: Date.now(),
    };
    saveCachedSheet(cacheData).catch(() => {});
  }, [isOnline, sheet, rows, sheetId]);

  // When going offline, load cached data from IndexedDB
  useEffect(() => {
    if (isOnline) {
      setOfflineRows(null);
      setHasPendingOfflineChanges(false);
      return;
    }
    getCachedSheet(sheetId)
      .then(cached => {
        if (!cached) return;
        // Convert cached rows back to the expected shape
        const converted = cached.rows.map(r => ({
          id: r.id,
          sheetId,
          rowNumber: r.rowNumber,
          time: r.time ?? null,
          observation: r.observation ?? null,
          timeMinutes: null,
          isLocked: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          members: r.members.map((name, idx) => ({
            id: idx,
            rowId: r.id,
            memberName: name,
            sortOrder: idx,
            createdAt: new Date(),
          })),
          certifications: [] as NonNullable<typeof rows>[0]["certifications"],
        })) as unknown as NonNullable<typeof rows>;
        setOfflineRows(converted);
        const hasPending = cached.rows.some(
          r => r.pendingLocalId || r.pendingEdit || r.pendingDelete
        );
        setHasPendingOfflineChanges(hasPending);
      })
      .catch(() => {});
  }, [isOnline, sheetId]);

  const _addRowOnline = trpc.row.create.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  const _updateRowOnline = trpc.row.update.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  const _deleteRowOnline = trpc.row.delete.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  // Session-scoped undo stack for this officer's own row edits (observation/time),
  // laptop/iPad only. Only ever populated from edits made while online, against
  // rows that were unlocked (not fully certified) at the time of the edit — undo
  // itself re-checks isLocked before applying, since certification can land
  // between the edit and the undo click. Cleared implicitly on page reload; not
  // persisted, since it's a convenience for catching a mis-edit, not part of the
  // record.
  type UndoEntry = {
    rowId: number;
    previous: Omit<RowSaveInput, "id">;
  };
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const pushUndoEntry = (input: RowSaveInput) => {
    if (!isOnline) return;
    const row = rows?.find(r => r.id === input.id);
    if (!row || row.isLocked) return;
    const previous: Omit<RowSaveInput, "id"> = {};
    if (input.observation !== undefined)
      previous.observation = row.observation ?? "";
    if (input.time !== undefined) previous.time = row.time ?? "";
    if (input.timeMinutes !== undefined)
      previous.timeMinutes = row.timeMinutes ?? undefined;
    if (input.dayOffset !== undefined)
      previous.dayOffset = row.dayOffset ?? undefined;
    if (input.rowDate !== undefined)
      previous.rowDate = row.rowDate ?? undefined;
    if (Object.keys(previous).length === 0) return;
    setUndoStack(stack => [...stack.slice(-19), { rowId: input.id, previous }]);
  };

  // Offline-aware wrappers — queue locally when offline, call server when online
  const addRow = useMemo(
    () => ({
      isPending: _addRowOnline.isPending,
      mutate: (input: {
        sheetId: number;
        time?: string;
        timeMinutes?: number;
        observation?: string;
      }) => {
        if (isOnline) {
          _addRowOnline.mutate(input, {
            // The first row comes with "Surveillance commenced in the
            // vicinity of " and the team already on it: open it for typing
            // with the caret after the text, ready for the address.
            onSuccess: created => {
              if (created.autoFilled) {
                setJustAddedKeyboard(true);
                setJustAddedRowId(created.id);
                setTimeout(() => setJustAddedRowId(null), 6000);
              }
            },
          });
        } else {
          addPendingRowToCachedSheet(input.sheetId, {
            rowNumber: Date.now(),
            members: [],
          })
            .then(localId => {
              enqueueSyncAction({
                type: "addRowToServerSheet",
                localId,
                payload: { sheetServerId: input.sheetId, members: [] },
              });
              // Refresh offline rows from cache
              getCachedSheet(input.sheetId).then(cached => {
                if (!cached) return;
                const converted = cached.rows.map(r => ({
                  id: r.id,
                  sheetId: input.sheetId,
                  rowNumber: r.rowNumber,
                  time: r.time ?? null,
                  observation: r.observation ?? null,
                  timeMinutes: null,
                  isLocked: false,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  members: r.members.map((name, idx) => ({
                    id: idx,
                    rowId: r.id,
                    memberName: name,
                    sortOrder: idx,
                    createdAt: new Date(),
                  })),
                  certifications: [] as NonNullable<
                    typeof rows
                  >[0]["certifications"],
                })) as unknown as NonNullable<typeof rows>;
                setOfflineRows(converted);
                setHasPendingOfflineChanges(true);
              });
            })
            .catch(() => toast.error("Failed to save row locally"));
        }
      },
    }),
    [isOnline, _addRowOnline, rows]
  );

  const updateRow = useMemo(
    () => ({
      isPending: _updateRowOnline.isPending,
      mutate: (input: {
        id: number;
        time?: string;
        timeMinutes?: number;
        dayOffset?: number;
        rowDate?: string;
        observation?: string;
      }) => {
        pushUndoEntry(input);
        if (isOnline) {
          _updateRowOnline.mutate(input);
        } else {
          const updates: { time?: string; observation?: string } = {};
          if (input.time !== undefined) updates.time = input.time;
          if (input.observation !== undefined)
            updates.observation = input.observation;
          editPendingRowInCachedSheet(sheetId, input.id, updates)
            .then(async () => {
              // Look up the row's pendingLocalId to determine how to enqueue
              const cached = await getCachedSheet(sheetId);
              if (!cached) return;
              const cachedRow = cached.rows.find(r => r.id === input.id);
              if (input.id > 0) {
                // Existing server row — enqueue direct update
                enqueueSyncAction({
                  type: "updateServerRow",
                  serverId: input.id,
                  payload: updates,
                });
              } else if (cachedRow?.pendingLocalId) {
                // New offline row — enqueue update keyed by pendingLocalId
                enqueueSyncAction({
                  type: "updatePendingRow",
                  pendingLocalId: cachedRow.pendingLocalId,
                  payload: updates,
                });
              }
              // Refresh offline rows display
              const converted = cached.rows.map(r => ({
                id: r.id,
                sheetId,
                rowNumber: r.rowNumber,
                time: r.time ?? null,
                observation: r.observation ?? null,
                timeMinutes: null,
                isLocked: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                members: r.members.map((name, idx) => ({
                  id: idx,
                  rowId: r.id,
                  memberName: name,
                  sortOrder: idx,
                  createdAt: new Date(),
                })),
                certifications: [] as NonNullable<
                  typeof rows
                >[0]["certifications"],
              })) as unknown as NonNullable<typeof rows>;
              setOfflineRows(converted);
              setHasPendingOfflineChanges(true);
            })
            .catch(() => {});
        }
      },
    }),
    [isOnline, _updateRowOnline, sheetId, rows]
  );

  // ── "Check Running Sheet" — jump to / fix a finding ─────────────────────
  // Scrolls to the row (see the "sheet-row-{id}" id added to each <tr>) and
  // briefly highlights it so it's obvious which row the finding was about,
  // rather than just landing there silently.
  const handleJumpToCheckRow = (rowId: number) => {
    setShowCheckSheetDialog(false);
    window.setTimeout(() => {
      const el = document.getElementById(`sheet-row-${rowId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("row-check-highlight");
      window.setTimeout(() => el.classList.remove("row-check-highlight"), 2000);
    }, 150);
  };

  // Applies a "Check Running Sheet" text fix directly — same as editing the
  // row by hand, just a single first-occurrence text replace rather than
  // the whole dupe-check flow (neither a dictionary spelling correction
  // nor removing a duplicated bracket fragment is a new entity to check
  // for duplicates against). Generic despite the name of the thing it's
  // fixing varying by finding category — every category that offers a Fix
  // button (spelling, duplicate-bracket-fragment) reduces to the same
  // "replace this exact substring" operation.
  const handleFixCheckFinding = (
    rowId: number,
    wrong: string,
    correct: string
  ) => {
    const row = rows?.find(r => r.id === rowId);
    if (!row || row.observation == null) return;
    if (!row.observation.includes(wrong)) {
      toast.error(
        "That row's text has changed since the check ran — re-check the sheet."
      );
      return;
    }
    updateRow.mutate({
      id: rowId,
      observation: row.observation.replace(wrong, correct),
    });
  };

  // ── Live possible-duplicate check on observation save ──────────────────────
  // Before an edited observation actually saves, extract its entities the same
  // way the Intelligence folder does and fuzzy-check each one against every
  // existing entity. Any near-miss matches are queued and shown one at a time
  // via EntityDuplicateDialog (other text-mined entities) or TargetMatchDialog
  // (the formal Target/Associate Registry) — the real save only fires once the
  // queue (which may be empty) is drained, so this never silently loses an edit.
  type RowSaveInput = {
    id: number;
    time?: string;
    timeMinutes?: number;
    dayOffset?: number;
    rowDate?: string;
    observation?: string;
  };
  type PendingDupe =
    | {
        kind: "generic";
        type: DedupType;
        label: string;
        match: { label: string; rowCount: number; reason: string };
      }
    | {
        kind: "target";
        /** The exact bracket text as typed, e.g. "LOCKET" — this is what
         * gets replaced in the observation text on confirm. */
        rawShortForm: string;
        match: TargetMatchCandidate;
      }
    | {
        /** Informational only — this exact entity is already a real
         * sighting on a different operation. See checkCrossOperationEntity;
         * deliberately independent of the "generic"/"target" near-duplicate
         * checks above, not a variant of them. */
        kind: "crossOp";
        type: DedupType;
        label: string;
        operationNames: string[];
      }
    | {
        /** A vehicle-presence row ("parked and unattended...") with no
         * location entity of its own — see findMissingLocationSuggestion.
         * An actual decision, not informational: confirm appends the
         * suggested location to the observation before saving. */
        kind: "missingLocation";
        location: string;
        source: string;
      }
    | {
        /** A vehicle with a real registration that might be the same car
         * as an earlier no-rego sighting on this sheet — see
         * findVagueVehicleMatch. Confirm merges the two entities via
         * intelligence.mergeEntities (same mechanism as the Merge Entities
         * tool); this row's own text is never touched. */
        kind: "vagueVehicle";
        loserLabel: string;
        winnerLabel: string;
        reason: string;
      };
  const [dupeQueue, setDupeQueue] = useState<PendingDupe[]>([]);
  const [dupeIndex, setDupeIndex] = useState(0);
  const [dupeDialogOpen, setDupeDialogOpen] = useState(false);
  const [showCheckSheetDialog, setShowCheckSheetDialog] = useState(false);
  // Check Sheet is off by default (shared/commandFeatures.ts): it reads the
  // whole Intelligence list and is far too slow on a large archive.
  const sheetCheckOn = useCommandFeature("sheetCheck");
  // A ref, not state: only ever read/written synchronously within the
  // dedupe-resolution handlers below, never rendered — a ref avoids the
  // stale-closure trap of reading state that was just set in the same tick
  // (e.g. applying a spelling correction, then immediately saving).
  const pendingSaveInputRef = useRef<RowSaveInput | null>(null);
  const [vagueVehicleBusy, setVagueVehicleBusy] = useState(false);
  const mergeEntitiesMut = trpc.intelligence.mergeEntities.useMutation();
  const markEntitiesNotDuplicateMut =
    trpc.intelligence.markEntitiesNotDuplicate.useMutation();

  function applyBracketCorrection(
    text: string,
    rawShortForm: string,
    correctSpelling: string
  ): string {
    // Defensive: a "remembered" correction (getKnownPersonNameCorrection)
    // might still be a full "Name, born DATE (BRACKET)" saved before
    // TargetMatchDialog started reducing it to just the bracket code — never
    // let a bracket nest inside the bracket it's replacing.
    const safeSpelling = correctSpelling.includes("(")
      ? bracketCodeFromRegisteredName(correctSpelling)
      : correctSpelling;
    const escaped = rawShortForm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(
      new RegExp(`\\(${escaped}\\)`, "g"),
      `(${safeSpelling})`
    );
  }

  // Appends " at <location>" to the end of the observation, ahead of any
  // trailing sentence punctuation — used when the officer confirms the
  // MissingLocationAlert prompt. Deliberately WITHOUT brackets, matching
  // the vehicle-arriving chip's "subsequent mention" convention
  // (isAddressAlreadyMentioned in server/db.ts) exactly — a bare mention of
  // an address already bracket-introduced elsewhere in the sheet is picked
  // up by getAllIntelligenceEntities' "Pass B" scan the same way theirs is,
  // and looksLikeUnlocatedVehiclePresenceRow (server/db.ts) knows to check
  // for that bare mention too, so this row correctly stops being flagged
  // without needing its own bracket — see missingLocationSuggestion.test.ts.
  function appendLocationSuggestion(text: string, location: string): string {
    const trimmed = text.trimEnd();
    const trailingPunct = trimmed.match(/([.:])\s*$/);
    if (trailingPunct) {
      return `${trimmed.slice(0, -1)} at ${location}${trailingPunct[1]}`;
    }
    return `${trimmed} at ${location}.`;
  }

  const updateRowWithDupeCheck = useCallback(
    async (input: RowSaveInput) => {
      // Offline, or no meaningful observation text — nothing to fuzzy-check, save directly.
      if (!isOnline || !input.observation || !input.observation.trim()) {
        updateRow.mutate(input);
        return;
      }
      try {
        const extracted = await utils.intelligence.previewEntities.fetch({
          text: input.observation,
        });
        const relevant = extracted.filter(e => e.type !== "unknown");
        const queue: PendingDupe[] = [];
        const seen = new Set<string>();
        let correctedObservation = input.observation;

        for (const e of relevant) {
          const dedupeKey = `${e.type}::${e.shortForm.toLowerCase()}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          // Independent of the near-duplicate checks below (and of whichever
          // branch they take) — always runs, for every entity type: is this
          // exact entity already a real sighting on a different operation?
          // Its own try/catch, deliberately separate from the outer one:
          // a failure here must never skip the person/generic checks below
          // for the rest of this row's entities.
          if (sheet?.operationId) {
            try {
              const crossOp =
                await utils.intelligence.checkCrossOperationEntity.fetch({
                  type: e.type as DedupType,
                  label: e.shortForm,
                  operationId: sheet.operationId,
                });
              if (crossOp) {
                queue.push({
                  kind: "crossOp",
                  type: e.type as DedupType,
                  label: e.shortForm,
                  operationNames: crossOp.operationNames,
                });
              }
            } catch (err) {
              console.warn("checkCrossOperationEntity failed", err);
            }
          }
          if (e.type === "person") {
            // Already confirmed before (the "spellcheck remembers" case) —
            // silently correct the text, no prompt.
            const known =
              await utils.intelligence.getKnownPersonNameCorrection.fetch({
                spelling: e.rawShortForm,
              });
            if (known) {
              correctedObservation = applyBracketCorrection(
                correctedObservation,
                e.rawShortForm,
                known.correctSpelling
              );
              continue;
            }
            // Close-but-not-exact match to an existing Target/Associate —
            // ask, rather than silently linking or silently missing it.
            const targetMatches =
              await utils.intelligence.checkPossibleTargetMatches.fetch({
                label: e.shortForm,
              });
            if (targetMatches.length > 0) {
              queue.push({
                kind: "target",
                rawShortForm: e.rawShortForm,
                match: targetMatches[0],
              });
              continue;
            }
          }

          const matches =
            await utils.intelligence.checkPossibleDuplicates.fetch({
              type: e.type as DedupType,
              label: e.shortForm,
            });
          if (matches.length > 0) {
            queue.push({
              kind: "generic",
              type: e.type as DedupType,
              label: e.shortForm,
              match: matches[0],
            });
          }
        }

        // A vehicle-presence row with no location of its own — see
        // findMissingLocationSuggestion. Checked against the fully
        // corrected text (after any spelling fixes above), and only once
        // sheetId is known.
        if (sheetId) {
          try {
            const missingLocation = await utils.row.checkMissingLocation.fetch({
              sheetId,
              observation: correctedObservation,
              excludeRowId: input.id,
            });
            if (missingLocation) {
              queue.push({
                kind: "missingLocation",
                location: missingLocation.location,
                source: missingLocation.source,
              });
            }
          } catch (err) {
            console.warn("checkMissingLocation failed", err);
          }

          // A vehicle with a real registration that might be the same car
          // as an earlier no-rego sighting on this sheet — see
          // findVagueVehicleMatch. Confirming links the two entities via
          // mergeEntities without touching any row's text.
          try {
            const vagueVehicle = await utils.row.checkVagueVehicleMatch.fetch({
              sheetId,
              observation: correctedObservation,
              excludeRowId: input.id,
            });
            if (vagueVehicle) {
              queue.push({
                kind: "vagueVehicle",
                loserLabel: vagueVehicle.loserLabel,
                winnerLabel: vagueVehicle.winnerLabel,
                reason: vagueVehicle.reason,
              });
            }
          } catch (err) {
            console.warn("checkVagueVehicleMatch failed", err);
          }
        }

        const correctedInput = { ...input, observation: correctedObservation };
        if (queue.length === 0) {
          updateRow.mutate(correctedInput);
          return;
        }
        pendingSaveInputRef.current = correctedInput;
        setDupeQueue(queue);
        setDupeIndex(0);
        setDupeDialogOpen(true);
      } catch {
        // If the duplicate check itself fails for any reason, don't block the save.
        updateRow.mutate(input);
      }
    },
    [isOnline, updateRow, utils, sheet?.operationId, sheetId]
  );

  function handleTargetMatchResolved(
    rawShortForm: string,
    correctSpelling: string | undefined
  ) {
    if (correctSpelling && pendingSaveInputRef.current?.observation) {
      pendingSaveInputRef.current = {
        ...pendingSaveInputRef.current,
        observation: applyBracketCorrection(
          pendingSaveInputRef.current.observation,
          rawShortForm,
          correctSpelling
        ),
      };
    }
    handleDupeDialogResolved();
  }

  function handleMissingLocationResolved(
    addLocation: boolean,
    location: string
  ) {
    if (addLocation && pendingSaveInputRef.current?.observation) {
      pendingSaveInputRef.current = {
        ...pendingSaveInputRef.current,
        observation: appendLocationSuggestion(
          pendingSaveInputRef.current.observation,
          location
        ),
      };
    }
    handleDupeDialogResolved();
  }

  async function handleVagueVehicleResolved(
    confirmed: boolean,
    warning: { loserLabel: string; winnerLabel: string }
  ) {
    setVagueVehicleBusy(true);
    try {
      if (confirmed) {
        await mergeEntitiesMut.mutateAsync({
          type: "vehicle",
          winnerLabel: warning.winnerLabel,
          loserLabel: warning.loserLabel,
        });
      } else {
        await markEntitiesNotDuplicateMut.mutateAsync({
          type: "vehicle",
          labelA: warning.winnerLabel,
          labelB: warning.loserLabel,
        });
      }
    } catch (err) {
      console.warn("vague vehicle match resolution failed", err);
    } finally {
      setVagueVehicleBusy(false);
    }
    handleDupeDialogResolved();
  }

  function handleDupeDialogResolved() {
    const nextIndex = dupeIndex + 1;
    if (nextIndex < dupeQueue.length) {
      setDupeIndex(nextIndex);
      setDupeDialogOpen(true);
    } else {
      setDupeDialogOpen(false);
      setDupeQueue([]);
      setDupeIndex(0);
      if (pendingSaveInputRef.current) {
        updateRow.mutate(pendingSaveInputRef.current);
        pendingSaveInputRef.current = null;
      }
    }
  }

  const deleteRow = useMemo(
    () => ({
      isPending: _deleteRowOnline.isPending,
      mutate: (input: { id: number }) => {
        if (isOnline) {
          _deleteRowOnline.mutate(input);
        } else {
          deletePendingRowInCachedSheet(sheetId, input.id)
            .then(() => {
              if (input.id > 0) {
                enqueueSyncAction({
                  type: "deleteServerRow",
                  serverId: input.id,
                });
              }
              getCachedSheet(sheetId).then(cached => {
                if (!cached) return;
                const converted = cached.rows
                  .filter(r => !r.pendingDelete)
                  .map(r => ({
                    id: r.id,
                    sheetId,
                    rowNumber: r.rowNumber,
                    time: r.time ?? null,
                    observation: r.observation ?? null,
                    timeMinutes: null,
                    isLocked: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    members: r.members.map((name, idx) => ({
                      id: idx,
                      rowId: r.id,
                      memberName: name,
                      sortOrder: idx,
                      createdAt: new Date(),
                    })),
                    certifications: [] as NonNullable<
                      typeof rows
                    >[0]["certifications"],
                  })) as unknown as NonNullable<typeof rows>;
                setOfflineRows(converted);
                setHasPendingOfflineChanges(true);
              });
            })
            .catch(() => {});
        }
      },
    }),
    [isOnline, _deleteRowOnline, sheetId, rows]
  );

  const _addMemberOnline = trpc.member.add.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  const _removeMemberOnline = trpc.member.remove.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  // Offline-aware addMember — updates cached sheet and queues sync action
  const addMember = useMemo(
    () => ({
      isPending: _addMemberOnline.isPending,
      mutate: (input: { rowId: number; memberName: string }) => {
        if (isOnline) {
          // Store rowId for auto-sort after the query refreshes
          const rowIdToSort = input.rowId;
          _addMemberOnline.mutate(input, {
            onSuccess: () => {
              invalidateRows();
              // Auto-sort is triggered via the autoSortRowMembers ref set up below
              setTimeout(() => autoSortRef.current?.(rowIdToSort), 300);
            },
          });
        } else {
          // Update the cached sheet row's members array
          getCachedSheet(sheetId)
            .then(async cached => {
              if (!cached) return;
              const row = cached.rows.find(r => r.id === input.rowId);
              if (!row) return;
              // Add member to cached row
              const updatedRows = cached.rows.map(r =>
                r.id === input.rowId
                  ? { ...r, members: [...r.members, input.memberName] }
                  : r
              );
              await import("@/lib/offlineStore").then(({ saveCachedSheet }) =>
                saveCachedSheet({ ...cached, rows: updatedRows })
              );
              // Enqueue sync action
              if (input.rowId > 0) {
                enqueueSyncAction({
                  type: "addMemberToServerRow",
                  serverId: input.rowId,
                  memberName: input.memberName,
                });
              } else if (row.pendingLocalId) {
                enqueueSyncAction({
                  type: "addMemberToServerRow",
                  serverId: input.rowId,
                  pendingLocalId: row.pendingLocalId,
                  memberName: input.memberName,
                });
              }
              // Refresh display
              const updatedCached = { ...cached, rows: updatedRows };
              const converted = updatedCached.rows.map(r => ({
                id: r.id,
                sheetId,
                rowNumber: r.rowNumber,
                time: r.time ?? null,
                observation: r.observation ?? null,
                timeMinutes: null,
                isLocked: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                members: r.members.map((name, idx) => ({
                  id: idx,
                  rowId: r.id,
                  memberName: name,
                  sortOrder: idx,
                  createdAt: new Date(),
                })),
                certifications: [] as NonNullable<
                  typeof rows
                >[0]["certifications"],
              })) as unknown as NonNullable<typeof rows>;
              setOfflineRows(converted);
              setHasPendingOfflineChanges(true);
            })
            .catch(() => toast.error("Failed to save member locally"));
        }
      },
    }),
    [isOnline, _addMemberOnline, sheetId, rows]
  );

  // Offline-aware removeMember — updates cached sheet and queues sync action
  const removeMember = useMemo(
    () => ({
      isPending: _removeMemberOnline.isPending,
      mutate: (input: { id: number; rowId: number }) => {
        if (isOnline) {
          _removeMemberOnline.mutate(input);
        } else {
          getCachedSheet(sheetId)
            .then(async cached => {
              if (!cached) return;
              const row = cached.rows.find(r => r.id === input.rowId);
              if (!row) return;
              // Remove member at index `input.id` (which we use as the member index offline)
              const updatedRows = cached.rows.map(r => {
                if (r.id !== input.rowId) return r;
                // input.id is the member index (we set idx as id in the converted rows)
                const newMembers = r.members.filter(
                  (_, idx) => idx !== input.id
                );
                return { ...r, members: newMembers };
              });
              await import("@/lib/offlineStore").then(({ saveCachedSheet }) =>
                saveCachedSheet({ ...cached, rows: updatedRows })
              );
              // Enqueue sync — best effort (member removal by name)
              if (input.rowId > 0 && row.members[input.id]) {
                enqueueSyncAction({
                  type: "removeMemberFromServerRow",
                  serverId: input.rowId,
                  memberName: row.members[input.id],
                });
              }
              // Refresh display
              const updatedCached = { ...cached, rows: updatedRows };
              const converted = updatedCached.rows.map(r => ({
                id: r.id,
                sheetId,
                rowNumber: r.rowNumber,
                time: r.time ?? null,
                observation: r.observation ?? null,
                timeMinutes: null,
                isLocked: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                members: r.members.map((name, idx) => ({
                  id: idx,
                  rowId: r.id,
                  memberName: name,
                  sortOrder: idx,
                  createdAt: new Date(),
                })),
                certifications: [] as NonNullable<
                  typeof rows
                >[0]["certifications"],
              })) as unknown as NonNullable<typeof rows>;
              setOfflineRows(converted);
              setHasPendingOfflineChanges(true);
            })
            .catch(() => {});
        }
      },
    }),
    [isOnline, _removeMemberOnline, sheetId, rows]
  );

  const reorderMember = trpc.member.reorder.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  // Uploads go straight to a plain HTTP route as raw bytes rather than
  // through tRPC's base64/JSON path — a several-MB Portrait-mode iPhone
  // photo, base64-encoded into one giant JSON string, was what intermittently
  // failed on weak mobile connections with a cryptic browser error. Raw
  // binary avoids both the ~33% base64 size inflation and that giant string.
  const uploadAttachment = useMutation({
    mutationFn: async ({
      rowId,
      blob,
      mimeType,
      fileName,
    }: {
      rowId: number;
      blob: Blob;
      mimeType: string;
      fileName: string;
    }) => {
      const params = new URLSearchParams({
        rowId: String(rowId),
        fileName,
        mimeType,
      });
      const res = await fetch(
        `/api/attachments/upload-raw?${params.toString()}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": mimeType || "application/octet-stream" },
          body: blob,
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      return res.json() as Promise<{ id: number; url: string }>;
    },
    // Field officers are often on weak signal — retry transient network
    // failures automatically rather than making them re-tap the photo.
    retry: 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 4000),
    onSuccess: invalidateRows,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAttachment = trpc.attachment.delete.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  const certify = trpc.certification.certify.useMutation({
    onSuccess: data => {
      invalidateRows();
      if (data.rowLocked) toast.success("All members certified — row locked");
      else toast.success("Member certified");
    },
    onError: e => toast.error(e.message),
  });

  const uncertify = trpc.certification.uncertify.useMutation({
    onSuccess: () => {
      invalidateRows();
      toast.success("Certification removed — row unlocked");
    },
    onError: e => toast.error(e.message),
  });

  const uncertifyAll = trpc.certification.uncertifyAll.useMutation({
    onSuccess: () => {
      invalidateRows();
      toast.success("All certifications removed — row unlocked");
    },
    onError: e => toast.error(e.message),
  });

  const certifyAllForCin = trpc.certification.certifyAllForCin.useMutation({
    onSuccess: data => {
      invalidateRows();
      toast.success(`Certified ${data.certifiedCount} row(s) across the sheet`);
    },
    onError: e => toast.error(e.message),
  });

  // ─── Travelled Via auto-fill ────────────────────────────────────────────────
  // Tracks which row is currently being auto-filled (shows spinner in that cell)
  const [tvLoadingRowId, setTvLoadingRowId] = useState<number | null>(null);
  const getTravelledViaStreets = trpc.travelledVia.getStreets.useMutation({
    onError: e => {
      setTvLoadingRowId(null);
      toast.error(`TV auto-fill: ${e.message}`);
    },
  });

  // Fetch governance record to check completion for Close button
  const { data: govRecord } = trpc.governance.getBySheet.useQuery(
    { sheetId },
    { enabled: isAuthenticated && !!sheetId }
  );

  // Close / Reopen mutations
  const closeSheet = trpc.sheet.close.useMutation({
    onSuccess: () => {
      utils.sheet.get.invalidate({ id: sheetId });
      toast.success("Running sheet closed and locked.");
    },
    onError: e => toast.error(e.message),
  });
  const reopenSheet = trpc.sheet.reopen.useMutation({
    onSuccess: () => {
      utils.sheet.get.invalidate({ id: sheetId });
      toast.success("Running sheet reopened.");
    },
    onError: e => toast.error(e.message),
  });

  const isClosed = !!sheet?.closedAt;
  // Any member or admin can reopen a sheet
  const canManageClose = user?.role === "member" || user?.role === "admin";
  // Only the Team Leader CIN or admin can close a sheet
  // parsedRoster is defined below but sheet?.sheetCins is available here
  const isCurrentUserTeamLeader = useMemo(() => {
    if (!user?.cin || !sheet?.sheetCins) return false;
    try {
      const raw: CinEntry[] = JSON.parse(sheet.sheetCins);
      return raw.some(
        e => e.isTeamLeader && e.cin.toUpperCase() === user.cin!.toUpperCase()
      );
    } catch {
      return false;
    }
  }, [user?.cin, sheet?.sheetCins]);
  const canCloseByRole = user?.role === "admin" || isCurrentUserTeamLeader;

  // All rows certified check (same logic as Governance.tsx allSigned)
  const allRowsCertified = useMemo(() => {
    if (!rows || rows.length === 0) return false;
    return rows.every(r => {
      const members = r.members ?? [];
      if (members.length === 0) return true;
      return members.every(m =>
        (r.certifications ?? []).some(c => c.memberId === m.id && c.isActive)
      );
    });
  }, [rows]);

  // Governance complete check
  const govComplete = useMemo(() => {
    if (!govRecord) return false;
    const g = govRecord as Record<string, unknown>;
    const tlDone = !!g.summaryNotification && !!g.sentToIO;
    const opDone = !!g.savedInOpFolder && !!g.savedInInvestigatorTransferDrive;
    return tlDone && opDone;
  }, [govRecord]);

  const canCloseSheet =
    canCloseByRole && allRowsCertified && govComplete && !isClosed;

  const canEdit =
    !isClosed && (user?.role === "member" || user?.role === "admin");
  const canCertify =
    !isClosed && (user?.role === "member" || user?.role === "admin");

  // Cease is offered while there is something to cease: open to the officer,
  // online, at least one row, surveillance not ended.
  const ceaseAvailable =
    canEdit &&
    isOnline &&
    !!surveillance &&
    !surveillance.ended &&
    (rows?.length ?? 0) > 0;

  // Parse daily roster CINs for team expansion and Certify All
  // Sort: Team Leader first, then all others in numeric/alphabetic order
  const parsedRoster = useMemo(() => {
    try {
      const raw = sheet?.sheetCins
        ? (JSON.parse(sheet.sheetCins) as CinEntry[])
        : [];
      return [...raw].sort((a, b) => {
        if (a.isTeamLeader && !b.isTeamLeader) return -1;
        if (!a.isTeamLeader && b.isTeamLeader) return 1;
        // Numeric sort: extract leading digits for comparison
        const aNum = parseInt(a.cin, 10);
        const bNum = parseInt(b.cin, 10);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.cin.localeCompare(b.cin);
      });
    } catch {
      return [];
    }
  }, [sheet?.sheetCins]);
  const rosterCinList = useMemo(
    () => parsedRoster.map(e => e.cin),
    [parsedRoster]
  );

  // ─── CIN auto-sort helper ────────────────────────────────────────────────────
  // After any member is added, re-sort the row's CINs: TL first, then ascending CIN number.
  // Spacers keep their relative positions. Skipped if the user has manually dragged this row.
  const autoSortRowMembers = useCallback(
    (rowId: number) => {
      if (manuallyReorderedRowsRef.current.has(rowId)) return; // user has custom order
      const currentRow = rows?.find(r => r.id === rowId);
      if (!currentRow || currentRow.members.length < 2) return;

      // Build canonical CIN order: TL first, then ascending numeric CIN
      const tlCin = parsedRoster.find(e => e.isTeamLeader)?.cin?.toUpperCase();
      const nonSpacers = currentRow.members.filter(
        m => m.memberName !== SPACER
      );
      const spacers = currentRow.members.filter(m => m.memberName === SPACER);

      const sorted = [...nonSpacers].sort((a, b) => {
        const aIsLeader = tlCin && a.memberName.toUpperCase() === tlCin;
        const bIsLeader = tlCin && b.memberName.toUpperCase() === tlCin;
        if (aIsLeader && !bIsLeader) return -1;
        if (!aIsLeader && bIsLeader) return 1;
        const aNum = parseInt(a.memberName, 10);
        const bNum = parseInt(b.memberName, 10);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.memberName.localeCompare(b.memberName);
      });

      // Re-insert spacers at their original relative positions
      const result = [...sorted];
      for (const sp of spacers) {
        const origIdx = currentRow.members.indexOf(sp);
        const clampedIdx = Math.min(origIdx, result.length);
        result.splice(clampedIdx, 0, sp);
      }

      // Only call reorder if the order actually changed
      const changed = result.some((m, i) => m.id !== currentRow.members[i]?.id);
      if (changed) {
        reorderMember.mutate({ rowId, orderedIds: result.map(m => m.id) });
      }
    },
    [rows, parsedRoster, reorderMember]
  );

  // Keep the ref in sync so the addMember useMemo (declared earlier) can call it
  autoSortRef.current = autoSortRowMembers;

  // Compute which CINs have ALL their rows certified
  // CINs on a row with images — an imagery phrase or an attached image — get
  // the camera automatically; no need to tick it in Edit TEAM.
  const autoImageCins = useMemo(() => cinsWithImagery(rows ?? []), [rows]);
  const cinFullyCertified = useMemo(() => {
    if (!rows || rows.length === 0) return new Set<string>();
    const certified = new Set<string>();
    for (const entry of parsedRoster) {
      const cin = entry.cin;
      // Find all rows where this CIN is a member
      const relevantRows = rows.filter(r =>
        r.members.some(m => m.memberName === cin)
      );
      if (relevantRows.length === 0) continue; // not in any row yet
      const allCertified = relevantRows.every(r =>
        r.members
          .filter(m => m.memberName === cin)
          .every(m =>
            r.certifications.some(c => c.memberId === m.id && c.isActive)
          )
      );
      if (allCertified) certified.add(cin);
    }
    return certified;
  }, [rows, parsedRoster]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  // Target panel collapsed state — expanded by default, persisted in localStorage
  const [teamPanelExpanded, setTeamPanelExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem("runsheet_team_panel_expanded") !== "false";
    } catch {
      return true;
    }
  });
  const [targetPanelExpanded, setTargetPanelExpanded] = useState<boolean>(
    () => {
      try {
        return (
          localStorage.getItem("runsheet_target_panel_expanded") !== "false"
        );
      } catch {
        return true;
      }
    }
  );
  // Track the last focused textarea/input so chip taps can insert text even after blur
  const focusedTextareaRef = useRef<
    HTMLTextAreaElement | HTMLInputElement | null
  >(null);
  // Track the last focused textarea/input via document focusin so chip taps can insert even after blur
  useEffect(() => {
    const handler = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        focusedTextareaRef.current = el as
          | HTMLTextAreaElement
          | HTMLInputElement;
      }
    };
    document.addEventListener("focusin", handler, true);
    return () => document.removeEventListener("focusin", handler, true);
  }, []);

  // Mirror the open observation cell's text into state (see openDraft).
  useEffect(() => {
    const onInput = (e: Event) => {
      const el = e.target as HTMLElement;
      if (el.tagName !== "TEXTAREA" || !el.dataset.obsCell) return;
      const ta = el as HTMLTextAreaElement;
      const id = ta.dataset.rowId ? Number(ta.dataset.rowId) : null;
      setOpenDraft({ rowId: Number.isFinite(id) ? id : null, text: ta.value });
    };
    const onFocusIn = (e: Event) => {
      const el = e.target as HTMLElement;
      if (el.tagName !== "TEXTAREA" || !el.dataset.obsCell) return;
      const ta = el as HTMLTextAreaElement;
      const id = ta.dataset.rowId ? Number(ta.dataset.rowId) : null;
      setOpenDraft({ rowId: Number.isFinite(id) ? id : null, text: ta.value });
    };
    const onFocusOut = (e: Event) => {
      const el = e.target as HTMLElement;
      if (el.tagName !== "TEXTAREA" || !el.dataset.obsCell) return;
      // Cleared when focus has really left observation cells.
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || !active.dataset?.obsCell) setOpenDraft(null);
      }, 0);
    };
    // Bubble phase on purpose (NOT capture): React handles a textarea's
    // onChange from a listener on its root, below `document`. A state update
    // from a capture listener on `document` runs first and re-renders the
    // controlled textarea with its OLD value before onChange has seen the
    // keystroke, wiping what was typed — typing stops working.
    document.addEventListener("input", onInput);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("input", onInput);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // Persist sort preference in localStorage so it survives navigation
  const [sortReversed, setSortReversed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("runsheet_sort_reversed") === "true";
    } catch {
      return false;
    }
  });
  const toggleSortReversed = () =>
    setSortReversed(v => {
      const next = !v;
      try {
        localStorage.setItem("runsheet_sort_reversed", String(next));
      } catch {}
      return next;
    });

  // Step back through this officer's own recent edits (see the undo stack
  // built up in pushUndoEntry, above). Re-checks isLocked here rather than
  // trusting the state at capture time, since the row may have been
  // certified in the meantime.
  const handleUndo = () => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    setUndoStack(stack => stack.slice(0, -1));
    const row = rows?.find(r => r.id === entry.rowId);
    if (!row) {
      toast.error("Can't undo — that row no longer exists");
      return;
    }
    if (row.isLocked) {
      toast.error("Can't undo — that row has since been certified");
      return;
    }
    updateRow.mutate({ id: entry.rowId, ...entry.previous });
    toast.success("Last edit undone");
  };

  // Edit sheet state
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editSheetDate, setEditSheetDate] = useState("");
  const [editTargetName, setEditTargetName] = useState("");
  const [editTargetMode, setEditTargetMode] = useState<"none" | "link">("none");
  const [editSelectedTargetId, setEditSelectedTargetId] = useState<
    number | null
  >(null);
  const [editCreateTargetDialogOpen, setEditCreateTargetDialogOpen] =
    useState(false);

  // Target selector
  const { data: operationTargets } = trpc.target.list.useQuery(
    { operationId: sheet?.operationId ?? 0 },
    { enabled: !!sheet?.operationId }
  );
  // All targets across all operations for the cross-op picker
  const { data: allUsers } = trpc.users.listForCin.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const myTeams = useMyTeams();

  const { data: allTargetsForSheet } = trpc.target.listAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [editTargetSearch, setEditTargetSearch] = useState("");
  const setSheetTarget = trpc.target.setSheetTarget.useMutation({
    onSuccess: () => {
      utils.sheet.get.invalidate({ id: sheetId });
      toast.success("Target updated");
    },
    onError: e => toast.error(e.message),
  });

  // Shortcuts: fetch once and build a trigger→expansion map
  const { data: shortcutsData } = trpc.shortcuts.list.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 0,
  });
  // Per-target shortcuts for the sheet's assigned target
  const { data: targetShortcutsData } =
    trpc.targetShortcuts.listForSheet.useQuery(
      { sheetId: sheetId! },
      { enabled: !!sheetId && isAuthenticated }
    );
  // Fetch the assigned target directly by ID (works for both legacy and registry targets)
  const { data: assignedTarget } = trpc.target.getById.useQuery(
    { id: sheet?.targetId ?? 0 },
    { enabled: !!sheet?.targetId }
  );
  const shortcutMap = useMemo(() => {
    const map: Record<string, string> = {};
    // Global shortcuts from DB
    for (const s of shortcutsData ?? [])
      map[s.trigger.toLowerCase()] = s.expansion;
    // Target-aware shortcuts: overlay TGT/HBF/HB/V1F/V1/V2F/V2/DEP/ARR from the assigned target
    if (assignedTarget) {
      const t = assignedTarget;
      if (t.tgt) map["tgt"] = t.tgt;
      if (t.hbf) map["hbf"] = t.hbf;
      if (t.hb) map["hb"] = t.hb;
      if (t.v1f) map["v1f"] = t.v1f;
      if (t.v1) map["v1"] = t.v1;
      if (t.v2f) map["v2f"] = t.v2f;
      if (t.v2) map["v2"] = t.v2;
      if (t.dep) map["dep"] = t.dep;
      if (t.arr) map["arr"] = t.arr;
      // Extra vehicles (V2F/V2, V3F/V3, …)
      try {
        const evs: Array<{ full: string; short: string }> = JSON.parse(
          (t as any).extraVehicles ?? "[]"
        );
        evs.forEach((ev, i) => {
          const num = i + 2;
          if (ev.full) map[`v${num}f`] = ev.full;
          if (ev.short) map[`v${num}`] = ev.short;
        });
      } catch {}
      // Wild fields (#1, #2, …)
      try {
        const wfs: Array<{ label: string; value: string }> = JSON.parse(
          (t as any).wildFields ?? "[]"
        );
        wfs.forEach(wf => {
          if (wf.value) map[wf.label.toLowerCase()] = wf.value;
        });
      } catch {}
    }
    // Per-target custom shortcuts (override global if same trigger)
    for (const s of targetShortcutsData ?? [])
      map[s.trigger.toLowerCase()] = s.expansion;
    return map;
  }, [shortcutsData, targetShortcutsData, assignedTarget]);

  // Bracket codes / vehicle regos already introduced somewhere in this
  // sheet — feeds the observation field's inline mention autocomplete (see
  // EditableCell / detectMentionTrigger / detectVehicleMentionTrigger): a
  // bare re-mention of an already-linked person or vehicle shouldn't keep
  // re-triggering the suggestion dropdown.
  const usedBracketCodes = useMemo(
    () => computeUsedBracketCodes(rows ?? []),
    [rows]
  );
  const usedVehicleRegos = useMemo(
    () => computeUsedVehicleRegos(rows ?? []),
    [rows]
  );
  const usedAddressLabels = useMemo(
    () => computeUsedAddressLabels(rows ?? []),
    [rows]
  );

  // Edit roster state
  const [editRosterOpen, setEditRosterOpen] = useState(false);
  const [rosterList, setRosterList] = useState<CinEntry[]>([]);
  const [rosterInput, setRosterInput] = useState("");
  const [rosterInputValid, setRosterInputValid] = useState(false);

  const updateSheet = trpc.sheet.update.useMutation({
    onSuccess: () => {
      utils.sheet.get.invalidate({ id: sheetId });
      setEditSheetOpen(false);
      setEditRosterOpen(false);
      toast.success("Sheet updated");
    },
    onError: e => toast.error(e.message),
  });

  // New Target from within the "Edit Sheet" dialog — same structured Add
  // Target dialog as everywhere else, linked straight to the sheet's operation.
  const createTargetForEditSheet = trpc.target.registry.create.useMutation({
    onSuccess: () => {
      utils.target.listAll.invalidate();
      if (sheet?.operationId) {
        utils.target.list.invalidate({ operationId: sheet.operationId });
      }
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const createLinkedTargetForEditSheet =
    trpc.target.registry.createLinkedFromAssociate.useMutation({
      onSuccess: () => {
        utils.target.listAll.invalidate();
        if (sheet?.operationId) {
          utils.target.list.invalidate({ operationId: sheet.operationId });
        }
      },
      onError: (e: { message: string }) => toast.error(e.message),
    });

  const deleteSheet = trpc.sheet.delete.useMutation({
    onSuccess: () => {
      setEditSheetOpen(false);
      toast.success("Running sheet moved to Recycle Bin");
      // Navigate back to the operation page
      if (sheet) navigate(`/operation/${sheet.operationId}`);
      else navigate("/");
    },
    onError: e => toast.error(e.message),
  });

  const [pendingExportType, setPendingExportType] = useState<"pdf" | null>(
    null
  );
  const [exportEnabled, setExportEnabled] = useState(false);
  const {
    data: exportData,
    isFetching: exportFetching,
    refetch: refetchExport,
  } = trpc.export.sheetData.useQuery(
    { id: sheetId },
    {
      enabled: isAuthenticated && !!sheetId && exportEnabled,
      staleTime: 0,
    }
  );

  // When export data arrives and there is a pending type, trigger the download
  useEffect(() => {
    if (exportData && pendingExportType === "pdf" && sheet) {
      exportToPDF(
        sheet.title,
        exportData.rows,
        exportData.operation ?? null,
        exportData.sheet.sheetCins ?? null,
        exportData.sheet.createdAt,
        exportData.targetFullName ?? null,
        exportData.sheet.sheetDate ?? null
      );
      setPendingExportType(null);
    }
  }, [exportData, pendingExportType, sheet]);

  const openEditSheet = () => {
    setEditSheetDate(
      (sheet as { sheetDate?: string | null } | undefined)?.sheetDate ??
        new Date().toISOString().slice(0, 10)
    );
    setEditTargetName(sheet?.targetName ?? "");
    setEditTargetMode("none");
    setEditTargetSearch("");
    setEditSelectedTargetId(sheet?.targetId ?? null);
    setEditSheetOpen(true);
  };

  const openEditRoster = () => {
    const parsed: CinEntry[] = (() => {
      try {
        return sheet?.sheetCins ? JSON.parse(sheet.sheetCins) : [];
      } catch {
        return [];
      }
    })();
    setRosterList(parsed);
    setRosterInput("");
    setEditRosterOpen(true);
  };

  const handleAddRosterTeam = (teamId: number) => {
    if (!allUsers) {
      toast.error("User list not available");
      return;
    }
    const members = allUsers.filter(u => u.teamId === teamId);
    if (members.length === 0) {
      toast.error("No members found in that team");
      return;
    }
    let added = 0;
    setRosterList(prev => {
      let updated = [...prev];
      for (const m of members) {
        if (!updated.some(c => c.cin.toLowerCase() === m.cin.toLowerCase())) {
          updated = [
            ...updated,
            {
              cin: m.cin,
              hasImages: false,
              isTeamLeader: false,
              isAuthor: false,
            },
          ];
          added++;
        }
      }
      return updated;
    });
    if (added === 0) toast.info("All team members already added");
    else
      toast.success(
        `Added ${added} member${added !== 1 ? "s" : ""} from ${myTeams.find(t => t.id === teamId)?.name ?? "the team"}`
      );
  };

  const handleAddRosterCin = () => {
    const trimmed = rosterInput.trim().toUpperCase();
    if (!trimmed) return;
    // Must be a registered user
    const registeredCins = new Set(
      (allUsers ?? []).map(u => u.cin.toUpperCase())
    );
    if (!registeredCins.has(trimmed)) {
      toast.error(`CIN "${trimmed}" is not a registered user`);
      return;
    }
    if (rosterList.some(c => c.cin.toUpperCase() === trimmed)) {
      toast.error("CIN already in team");
      return;
    }
    setRosterList(prev => [
      ...prev,
      { cin: trimmed, hasImages: false, isTeamLeader: false, isAuthor: false },
    ]);
    setRosterInput("");
    setRosterInputValid(false);
  };

  const handleExport = useCallback(() => {
    if (!sheet) return;
    if (exportData && !exportFetching) {
      setPendingExportType("pdf");
      refetchExport();
      return;
    }
    setPendingExportType("pdf");
    setExportEnabled(true);
  }, [sheet, exportData, exportFetching, refetchExport]);

  // Use offline cached rows when offline, live rows when online
  const displayRows = !isOnline && offlineRows ? offlineRows : rows;

  // Filter rows by search query (time, observation, member names)
  // NOTE: must be above the early return to satisfy React rules-of-hooks
  // ── Day-offset map: detect midnight rollovers from the time sequence itself ──
  // Scans timed rows in entry order (by rowNumber); when the effective time drops
  // by more than 2 hours it treats that as a midnight rollover and increments the
  // day counter. Shared between the sort and the date-divider render logic.
  const rowDayOffsetMap = useMemo(() => {
    if (!displayRows) return new Map<number, number>();
    // MUST sort by rowNumber (entry order) before scanning for rollovers.
    // displayRows may already be sorted by effective time from the server,
    // so we explicitly re-sort here to get the correct insertion sequence.
    const timedByRowNumber = [...displayRows]
      .filter((r: NonNullable<typeof rows>[0]) => r.timeMinutes != null)
      .sort(
        (a: NonNullable<typeof rows>[0], b: NonNullable<typeof rows>[0]) =>
          a.rowNumber - b.rowNumber
      );
    const map = new Map<number, number>();

    // Find the earliest rowDate among all rows that have one (day-0 anchor)
    const allRowDates = timedByRowNumber
      .map(
        (r: NonNullable<typeof rows>[0]) =>
          (r as any).rowDate as string | null | undefined
      )
      .filter((d): d is string => !!d);
    const minRowDate =
      allRowDates.length > 0 ? allRowDates.slice().sort()[0] : null;

    // First pass: assign offsets from rowDate (highest priority) or stored dayOffset (legacy)
    for (const r of timedByRowNumber) {
      const rd = (r as any).rowDate as string | null | undefined;
      if (rd && minRowDate) {
        // Day index relative to earliest rowDate in this sheet (Perth UTC+8)
        const anchor = new Date(minRowDate + "T00:00:00+08:00").getTime();
        const rowDay = new Date(rd + "T00:00:00+08:00").getTime();
        const dayIdx = Math.round((rowDay - anchor) / 86400000);
        map.set(r.id, dayIdx);
      } else if ((r as any).dayOffset !== 0 && (r as any).dayOffset != null) {
        map.set(r.id, (r as any).dayOffset);
      }
    }
    // Second pass: infer for rows with no explicit date/offset
    let day = 0;
    let prevEff = -1;
    for (const r of timedByRowNumber) {
      if (map.has(r.id)) {
        prevEff = (r.timeMinutes ?? 0) + map.get(r.id)! * 1440;
        day = map.get(r.id)!;
        continue;
      }
      const mins = r.timeMinutes ?? 0;
      const eff = mins + day * 1440;
      if (prevEff >= 0 && eff < prevEff - 120) day++;
      map.set(r.id, day);
      prevEff = mins + day * 1440;
    }
    return map;
  }, [displayRows]);

  // True when any row in this sheet has a day offset > 0 (sheet has crossed midnight)
  const sheetHasCrossedMidnight = useMemo(() => {
    if (!displayRows) return false;
    return Array.from(rowDayOffsetMap.values()).some(v => v > 0);
  }, [displayRows, rowDayOffsetMap]);

  const filteredRows = useMemo(() => {
    if (!displayRows) return [];
    const filtered = !searchQuery.trim()
      ? displayRows
      : displayRows.filter((row: NonNullable<typeof rows>[0]) => {
          const q = searchQuery.toLowerCase();
          if (row.time?.toLowerCase().includes(q)) return true;
          if (row.observation?.toLowerCase().includes(q)) return true;
          if (
            row.members?.some((m: { memberName: string }) =>
              m.memberName.toLowerCase().includes(q)
            )
          )
            return true;
          return false;
        });
    // Rows with no time set ALWAYS float to the top (newest/being filled in)
    const withTime = filtered.filter(
      (row: NonNullable<typeof rows>[0]) => row.timeMinutes != null
    );
    const noTime = filtered.filter(
      (row: NonNullable<typeof rows>[0]) => row.timeMinutes == null
    );
    const effectiveMinutes = (row: NonNullable<typeof rows>[0]) =>
      (row.timeMinutes ?? 0) + (rowDayOffsetMap.get(row.id) ?? 0) * 1440;
    // Sort timed rows by effective (day-offset) timeMinutes, then rowNumber as tie-break
    const sortedWithTime = [...withTime].sort(
      (a: NonNullable<typeof rows>[0], b: NonNullable<typeof rows>[0]) => {
        const timeDiff = effectiveMinutes(a) - effectiveMinutes(b);
        if (timeDiff !== 0) return sortReversed ? -timeDiff : timeDiff;
        return sortReversed
          ? b.rowNumber - a.rowNumber
          : a.rowNumber - b.rowNumber;
      }
    );
    // No-time rows sorted by descending rowNumber (most recently added first)
    const sortedNoTime = [...noTime].sort(
      (a: NonNullable<typeof rows>[0], b: NonNullable<typeof rows>[0]) =>
        b.rowNumber - a.rowNumber
    );
    // No-time rows always at the TOP regardless of sort direction
    return [...sortedNoTime, ...sortedWithTime];
  }, [displayRows, searchQuery, sortReversed, rowDayOffsetMap]);

  if (!isAuthenticated) return null;

  const isLoading = sheetLoading || rowsLoading;

  // The CLOSED badge is the same in both spots — it's a status indicator,
  // not an action button, so it doesn't need to match Close/Export's size.
  const closedBadge = (
    <Badge
      variant="secondary"
      className="gap-1.5 bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0"
    >
      <LockKeyhole className="w-3 h-3" />
      CLOSED
    </Badge>
  );

  // Rendered next to the title on lg+ (single-row header) as a compact
  // icon-only button — there's no Close/Export alongside it there to match.
  const editOrClosedBadgeCompact = (
    <>
      {!isClosed && (
        <Button
          size="icon"
          variant="ghost"
          className="w-7 h-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={openEditSheet}
          title="Edit sheet title"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      )}
      {isClosed && closedBadge}
    </>
  );

  // Rendered on mobile instead, grouped with Close/Export on the header's
  // second row — sized to match those (size="sm" + label) rather than the
  // compact icon button, so the three read as one evenly-matched row.
  const editOrClosedBadgeFull = (
    <>
      {!isClosed && (
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={openEditSheet}
        >
          <Pencil className="w-4 h-4" />
          Edit
        </Button>
      )}
      {isClosed && closedBadge}
    </>
  );

  const Chrome = embedded ? React.Fragment : DashboardLayout;
  return (
    <Chrome>
      <div className={embedded ? "p-4" : "p-6 lg:p-8"}>
        {/* Header — hidden when embedded: the host panel (see the map's RS
            Actions pane) supplies its own title/close control, and the
            back arrow / Summary / Governance tabs here all navigate the
            whole app away from that panel, which would defeat its "stays
            open until explicitly closed" behaviour. */}
        {!embedded && (
          <>
            {/* lg+ (genuine laptop width): one row — back-arrow/title/
                edit-or-badge on the left, Close/Export pushed right by
                lg:ml-auto on the actions row. Below lg: two rows instead.
                This used to switch at sm (640px), which a phone in
                landscape clears easily (most run 700-930px) — landscape
                phones were dropping into the "one row" layout meant for
                real desktop width, and there wasn't room there for both
                Close and Export next to the title, so the action buttons
                wrapped onto their own line anyway, just awkwardly. lg
                (1024px) reliably excludes phones in either orientation and
                iPad portrait (768px), so they all get the deliberate
                two-row treatment instead. Row 1 there is just back-arrow +
                title — the title wraps instead of truncating below lg
                (lg:truncate only kicks in at lg+, where the row has enough
                width that one line is realistic) so the full title is
                always readable, not cut off with "…". The edit-pencil/
                CLOSED badge moves down to sit with Close/Export on row 2,
                sized to match them there (editOrClosedBadgeFull) instead of
                the compact icon button used next to the title on lg+, and
                grouped with them (no gap-widening ml-auto between) so the
                row reads as one evenly-matched set — left-aligned, under
                the back-arrow/title above it, not floating off to the
                right. */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 mb-6">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => window.history.back()}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  {sheetLoading ? (
                    <Skeleton className="h-7 w-64" />
                  ) : (
                    <>
                      <div className="min-w-0">
                        <h1 className="text-base lg:text-xl font-semibold text-foreground lg:truncate">
                          {sheet?.title}
                        </h1>
                      </div>
                      {sheet && (
                        <div className="hidden lg:flex items-center gap-2">
                          {editOrClosedBadgeCompact}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap lg:ml-auto">
                {sheet && !sheetLoading && (
                  <div className="flex lg:hidden items-center gap-2">
                    {editOrClosedBadgeFull}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Offline indicator */}
                  {!isOnline && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-medium">
                          {syncStatus === "syncing" ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <WifiOff className="w-3.5 h-3.5" />
                          )}
                          {hasPendingOfflineChanges
                            ? "Offline — changes queued"
                            : "Offline"}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        No internet connection. Changes are saved locally and
                        will sync automatically when you reconnect.
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {/* Close / Reopen button */}
                  {canManageClose &&
                    (isClosed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                            onClick={() => reopenSheet.mutate({ id: sheetId })}
                            disabled={reopenSheet.isPending}
                          >
                            <LockKeyholeOpen className="w-4 h-4" />
                            Reopen
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Reopen this running sheet for editing
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className={`gap-2 ${
                              canCloseSheet
                                ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                : "opacity-40 cursor-not-allowed"
                            }`}
                            onClick={() =>
                              canCloseSheet &&
                              closeSheet.mutate({ id: sheetId })
                            }
                            disabled={!canCloseSheet || closeSheet.isPending}
                          >
                            <LockKeyhole className="w-4 h-4" />
                            Close
                            <span className="hidden lg:inline"> Sheet</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {canCloseSheet
                            ? "Close and lock this running sheet"
                            : !canCloseByRole
                              ? "Only the Team Leader or Admin can close this sheet"
                              : !allRowsCertified
                                ? "All rows must be certified before closing"
                                : !govComplete
                                  ? "Governance must be 100% complete before closing"
                                  : "Close sheet"}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  {sheetCheckOn && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => setShowCheckSheetDialog(true)}
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      Check
                      <span className="hidden lg:inline"> Sheet</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={exportFetching}
                    onClick={handleExport}
                  >
                    <Download className="w-4 h-4" />
                    {exportFetching ? (
                      "Preparing..."
                    ) : (
                      <>
                        Export<span className="hidden lg:inline"> PDF</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 mb-5 border-b border-border">
              <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground border-b-2 border-primary -mb-px transition-colors">
                <FileText className="w-4 h-4" />
                Running Sheet
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() =>
                  navigate(`/summary/${sheetId}`, { replace: true })
                }
              >
                <NotebookText className="w-4 h-4" />
                Summary
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() =>
                  navigate(`/governance/${sheetId}`, { replace: true })
                }
              >
                <ClipboardCheck className="w-4 h-4" />
                Governance
              </button>
            </div>
          </>
        )}

        {/* Closed banner */}
        {isClosed && sheet && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800/60 px-4 py-3">
            <LockKeyhole className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                This running sheet is closed and locked
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Closed by{" "}
                <span className="font-mono font-semibold">
                  {sheet.closedByCIN}
                </span>
                {" on "}
                {new Date(sheet.closedAt!).toLocaleString()}
              </p>
            </div>
            {canManageClose && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 shrink-0"
                onClick={() => reopenSheet.mutate({ id: sheetId })}
                disabled={reopenSheet.isPending}
              >
                <LockKeyholeOpen className="w-3.5 h-3.5" />
                Reopen
              </Button>
            )}
          </div>
        )}

        {/* Daily Roster Panel with Certify All — collapsible, matching target panel style */}
        {(parsedRoster.length > 0 || true) && (
          <div className="mb-4 rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            {/* Header row — same structure as target panel: collapse button + separate pencil button */}
            <div className="flex items-center">
              <button
                className="flex-1 flex items-center gap-2 px-4 py-3 bg-muted/60 hover:bg-muted active:bg-muted transition-colors select-none text-left min-w-0"
                onClick={() => {
                  const next = !teamPanelExpanded;
                  setTeamPanelExpanded(next);
                  try {
                    localStorage.setItem(
                      "runsheet_team_panel_expanded",
                      String(next)
                    );
                  } catch {}
                }}
              >
                <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-[13px] font-bold uppercase tracking-wide text-foreground truncate flex-1">
                  TEAM — CERTIFY
                </span>
                {/* Certified count badge */}
                {parsedRoster.length > 0 && (
                  <span className="text-xs font-mono text-muted-foreground mr-1">
                    {cinFullyCertified.size}/{parsedRoster.length}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${teamPanelExpanded ? "" : "-rotate-90"}`}
                />
              </button>
              {/* Edit pencil — independent tap zone, doesn't trigger collapse */}
              {sheet && (
                <button
                  className="px-3 py-3 text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 border-l border-border bg-muted/60 hover:bg-muted rounded-tr-lg"
                  onClick={openEditRoster}
                  title="Edit TEAM"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* Collapsible CIN badges */}
            {teamPanelExpanded && (
              <div className="px-4 py-3">
                {parsedRoster.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {parsedRoster.map(entry => (
                      <button
                        key={entry.cin}
                        onClick={() =>
                          canCertify
                            ? certifyAllForCin.mutate({
                                sheetId,
                                cin: entry.cin,
                              })
                            : undefined
                        }
                        disabled={certifyAllForCin.isPending || !canCertify}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono font-medium transition-colors disabled:opacity-50 ${
                          cinFullyCertified.has(entry.cin)
                            ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                            : canCertify
                              ? "border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 text-foreground"
                              : "border-border bg-muted/40 text-foreground cursor-default"
                        }`}
                        title={`${canCertify ? "Certify all rows for " : ""}CIN ${entry.cin}${entry.isTeamLeader ? " (Team Leader)" : ""}${entry.isAuthor ? " (Author)" : ""}`}
                      >
                        <ShieldCheck
                          className={`w-3 h-3 ${cinFullyCertified.has(entry.cin) ? "text-emerald-500" : "text-primary"}`}
                        />
                        {entry.isTeamLeader && (
                          <span className="text-yellow-400" title="Team Leader">
                            ★
                          </span>
                        )}
                        {entry.isAuthor && (
                          <span
                            className="text-sky-400"
                            title="Running Sheet Author"
                          >
                            ✏️
                          </span>
                        )}
                        {entry.cin}
                        {(entry.hasImages || autoImageCins.has(entry.cin)) && (
                          <Camera className="w-3 h-3 text-amber-400" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No team members added — tap the pencil to add CINs.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* TARGET Panel — target card fields (when assigned) plus entity
            chips mined from this sheet's own observations, in one panel so
            officers see every quick-insert chip together. */}
        {((sheet?.targetId && assignedTarget) ||
          (entityChips && entityChips.length > 0) ||
          (pendingArrivals && pendingArrivals.length > 0) ||
          (pendingDepartures && pendingDepartures.length > 0) ||
          (pendingWalkIns && pendingWalkIns.length > 0) ||
          (pendingHeadingTo && pendingHeadingTo.length > 0)) &&
          (() => {
            const t = assignedTarget;
            const hasTarget = !!(sheet?.targetId && t);
            // Build dynamic extra vehicle fields from JSON
            const extraVehicleFields: {
              label: string;
              value: string | null;
            }[] = [];
            if (t) {
              try {
                const evs: Array<{ full: string; short: string }> = JSON.parse(
                  (t as any).extraVehicles ?? "[]"
                );
                evs.forEach((ev, i) => {
                  const num = i + 2;
                  if (ev.full)
                    extraVehicleFields.push({
                      label: `V${num}F`,
                      value: ev.full,
                    });
                  if (ev.short)
                    extraVehicleFields.push({
                      label: `V${num}`,
                      value: ev.short,
                    });
                });
              } catch {}
            }
            const fields: { label: string; value: string | null }[] = t
              ? [
                  { label: "TGT", value: t.tgt },
                  { label: "HBF", value: t.hbf },
                  { label: "HB", value: t.hb },
                  { label: "V1F", value: t.v1f },
                  { label: "V1", value: t.v1 ?? null },
                  ...extraVehicleFields,
                  // All shortcut-folder triggers as chips — only those with showInRs=true, exclude legacy 'D' chip
                  ...(shortcutsData ?? [])
                    .filter(
                      s => s.trigger.toUpperCase() !== "D" && !!s.showInRs
                    )
                    .map(s => ({
                      label: s.trigger.toUpperCase(),
                      value: s.expansion,
                    })),
                ]
              : [];
            const hasAnyField = fields.some(f => f.value);
            // The cards below word names against everything written so far,
            // including the unsaved text.
            const usedBracketCodes = usedBracketCodesWithDraft;
            const hasEntityChips = !!(entityChips && entityChips.length > 0);
            // Continuity chips — same underlying "pending" data as the RS
            // Quick Entry map popup's continuity chips (see the queries
            // above), adapted for a surface with no single selected address:
            // "Vehicle departing" and "Walked in" both use a pending
            // arrival's own already-known address, so they need no
            // placeholder; "Vehicle arriving" has no way to know a
            // not-yet-observed destination, so it uses a literal
            // "[location]" placeholder to type over — the same pattern the
            // popup already uses for "[route]", which is equally unknowable
            // in advance.
            const vehicleArrivingChips = (pendingDepartures ?? []).map(d => ({
              key: `arr-${d.rego}`,
              rego: d.rego,
              text: `Vehicle ${d.rego}, ${shortenAlreadyMentionedNames(d.occupantDesc, usedBracketCodes)}, arrived at [location]`,
            }));
            const vehicleDepartingChips = (pendingArrivals ?? []).map(a => ({
              key: `dep-${a.rego}`,
              rego: a.rego,
              text: `Vehicle ${a.rego}, ${shortenAlreadyMentionedNames(a.occupantDesc, usedBracketCodes)}, departed ${a.address} and continued via:`,
            }));
            const walkedOutChips = (pendingWalkIns ?? []).flatMap(w => {
              const arrivalsHere = (pendingArrivals ?? []).filter(
                a =>
                  a.address.trim().toLowerCase() ===
                  w.location.trim().toLowerCase()
              );
              const names = shortenAlreadyMentionedNames(
                w.names,
                usedBracketCodes
              );
              // w.route is only ever genuine route/path text (e.g. "across
              // the road") — never the destination, which would duplicate
              // the address already stated via w.location. It's empty
              // whenever the walk-in had no separate route content at all.
              return arrivalsHere.map(a => ({
                key: `wo-${w.location}-${a.rego}`,
                rego: a.rego,
                text: w.route
                  ? `${names} exited ${w.location} and walked ${w.route} towards Vehicle ${a.rego}.`
                  : `${names} exited ${w.location} and walked towards Vehicle ${a.rego}.`,
              }));
            });
            // People on foot with no vehicle: someone who walked into a
            // location and hasn't left it can be logged leaving it for
            // another address ("[location]" and "[route]" are literal text
            // to type over, as with "Vehicle arriving"), and someone logged
            // as heading for an address can be logged entering it.
            const leftAddressChips = (pendingWalkIns ?? []).map(w => ({
              key: `la-${w.location}`,
              rego: "",
              label: w.location,
              text: `${shortenAlreadyMentionedNames(w.names, usedBracketCodes)} exited ${w.location} and walked [route] towards [location].`,
            }));
            const enteredChips = (pendingHeadingTo ?? []).map(h => ({
              key: `en-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`,
              rego: "",
              label: h.destination,
              text: `${shortenAlreadyMentionedNames(h.names, usedBracketCodes)} entered ${h.destination} and continued out of sight.`,
            }));
            // ── Continuity cards ────────────────────────────────────────
            // Same pending data and sentences as the chips above, grouped
            // per vehicle / group of people (see ContinuityCards).
            const rowTime = (id: number) =>
              rows?.find(r => r.id === id)?.time ?? null;
            const sinceText = (id: number) => {
              const t = rowTime(id);
              return t ? ` · since ${t}` : "";
            };
            const sameAddr = (a: string, b: string) =>
              a.trim().toLowerCase() === b.trim().toLowerCase();
            const cardAction = (
              chip: { key: string; text: string } | undefined,
              label: string
            ) => (chip ? [{ key: chip.key, label, text: chip.text }] : []);
            const continuityCards: ContinuityCardData[] = [];
            const walkInsAtVehicle = new Set<string>();
            // Everyone currently logged as inside an address or walking
            // somewhere is NOT in a vehicle, whatever the vehicle's arrival
            // row says.
            const onFootNames = [
              ...(pendingWalkIns ?? []).map(w => w.names),
              ...(pendingHeadingTo ?? []).map(h => h.names),
            ];
            // Who is in a vehicle: those its own row names, plus anyone
            // logged walking to / getting into it — and a person is only in
            // the vehicle the most recent row puts them in (see
            // vehicleOccupants).
            const allVehicleRows = [
              ...(pendingArrivals ?? []).map(a => ({
                rego: a.rego,
                rowId: a.rowId,
                names: extractOccupantNames(a.occupantDesc),
              })),
              ...(pendingDepartures ?? []).map(d => ({
                rego: d.rego,
                rowId: d.rowId,
                names: extractOccupantNames(d.occupantDesc),
              })),
            ];
            // Parked vehicles people on foot could walk to: only those at the
            // address their latest vehicle journey ended (see
            // vehiclesPeopleCanReach), not ones left behind earlier.
            const reachableVehicles = (people: string, fallbackPlace: string) =>
              vehiclesPeopleCanReach({
                people,
                arrivals: (pendingArrivals ?? []).map(a => ({
                  ...a,
                  names: extractOccupantNames(a.occupantDesc),
                })),
                placements: pendingPlacements ?? [],
                fallbackPlace,
              });
            const vehicleOccupants = (
              desc: string,
              rego: string,
              rowId: number
            ) =>
              sharedVehicleOccupants(
                { rego, rowId, names: extractOccupantNames(desc) },
                onFootNames,
                pendingPlacements ?? [],
                allVehicleRows
              );
            // Who is out of sight at an address after a vehicle arrived and
            // "continued out of sight" there (and has not since been placed
            // anywhere by a later row).
            const oosPeopleOf = (
              b: NonNullable<typeof pendingArrivals>[number]
            ) => {
              if (!b.outOfSight) return [];
              if (
                (pendingWalkIns ?? []).some(w =>
                  sameAddr(w.location, b.address)
                )
              )
                return [];
              const people = occupantsStillInVehicle(
                extractOccupantNames(b.occupantDesc),
                []
              );
              return people.filter(
                n =>
                  !(pendingPlacements ?? []).some(
                    pl =>
                      pl.rowId > b.rowId &&
                      surnameTokens(n).some(t =>
                        surnameTokens(pl.name).includes(t)
                      )
                  )
              );
            };
            (pendingArrivals ?? []).forEach(a => {
              const insideHere = (pendingWalkIns ?? []).filter(w =>
                sameAddr(w.location, a.address)
              );
              const rego = a.rego;
              const occupants = vehicleOccupants(
                a.occupantDesc,
                a.rego,
                a.rowId
              );
              const inCar = occupants.length > 0;
              // Those a later row only had walking TOWARDS the vehicle — in it
              // or next to it, the row doesn't say.
              const toNames = occupantsToVehicle(
                { rego: a.rego, rowId: a.rowId },
                occupants,
                pendingPlacements ?? []
              );
              const inNames = occupants.filter(o => !toNames.includes(o));
              // Where each sits, when the rows say — "MENON (driver)".
              const seatMap = seatsOf({
                desc: a.occupantDesc,
                descRowId: a.rowId,
                rego,
                occupants,
                placements: pendingPlacements ?? [],
              });
              const withSeat = (n: string) =>
                seatMap.has(n) ? `${n} (${seatMap.get(n)})` : n;
              // People inside this address take over the card only when
              // nobody is left in the vehicle; when some got out and others
              // stayed, the vehicle keeps its own card for those still in it
              // and the people inside get a card of their own.
              const inside = insideHere.length > 0 && !inCar;
              if (inside)
                insideHere.forEach(w => walkInsAtVehicle.add(w.location));
              // "... arrived and continued out of sight": nobody can say
              // whether anyone is still in it until someone is seen again,
              // so no walked-away / walked-in options are offered.
              // The target is then placed at the address, out of sight: the
              // next steps are to walk out to the vehicle, walk somewhere
              // else, or leave in a vehicle. Not once a later row has put
              // those people anywhere.
              const arrivalPeople = occupantsStillInVehicle(
                extractOccupantNames(a.occupantDesc),
                []
              );
              const movedOn = (pendingPlacements ?? []).some(
                pl =>
                  pl.rowId > a.rowId &&
                  arrivalPeople.some(n =>
                    surnameTokens(n).some(t =>
                      surnameTokens(pl.name).includes(t)
                    )
                  )
              );
              const outOfSight = a.outOfSight && !inside && !movedOn;
              const oosNames = shortenAlreadyMentionedNames(
                arrivalPeople.join(" and "),
                usedBracketCodes
              );
              const otherOosPeople = inside
                ? []
                : (pendingArrivals ?? [])
                    .filter(
                      o => o.rego !== a.rego && sameAddr(o.address, a.address)
                    )
                    .flatMap(oosPeopleOf);
              const carNames = shortenAlreadyMentionedNames(
                occupants.join(" and "),
                usedBracketCodes
              );
              // Everyone known to be in it, or "unseen occupant/s" when nobody
              // is — the usual wording for a departure whose occupants
              // weren't seen.
              const departingAction = {
                key: `dep-${rego}`,
                label: "Vehicle Depart",
                // Everyone known to be in it, or "unseen occupant/s" when
                // nobody is — the usual wording for a departure whose
                // occupants weren't seen.
                text: `Vehicle ${rego}, ${
                  inCar && !outOfSight
                    ? shortenAlreadyMentionedNames(
                        occupantWording(a.occupantDesc, occupants) ??
                          // Someone joined after the arrival: say where each
                          // sits when the rows say (driver, front passenger,
                          // rear passenger), else just the names.
                          seatedOccupantWording({
                            desc: a.occupantDesc,
                            descRowId: a.rowId,
                            rego,
                            occupants,
                            placements: pendingPlacements ?? [],
                          }) ??
                          carNames,
                        usedBracketCodes
                      )
                    : "unseen occupant/s"
                }, departed ${a.address} and continued via:`,
              };
              // Most likely next step first: parked with someone in it, the
              // vehicle leaves or they walk in; with someone inside the
              // address, they walk back out to it or on elsewhere.
              const actions = inside
                ? [
                    ...walkedOutChips
                      .filter(c =>
                        insideHere.some(
                          w => c.key === `wo-${w.location}-${rego}`
                        )
                      )
                      .map(c => ({
                        key: c.key,
                        label: "Walked to Vehicle",
                        text: c.text,
                      })),
                    ...insideHere.flatMap(w =>
                      cardAction(
                        leftAddressChips.find(
                          c => c.key === `la-${w.location}`
                        ),
                        "Left address"
                      )
                    ),
                    departingAction,
                  ]
                : outOfSight && arrivalPeople.length > 0
                  ? [
                      {
                        key: `wov-oos-${rego}`,
                        label: "Walked to Vehicle",
                        text: `${oosNames} exited ${a.address} and walked towards Vehicle ${rego}.`,
                      },
                      {
                        key: `la-oos-${rego}`,
                        label: "Walked away",
                        text: `${oosNames} exited ${a.address} and walked [route] towards [location].`,
                      },
                      departingAction,
                    ]
                  : otherOosPeople.length > 0
                    ? [
                        // Someone is out of sight at this address after
                        // arriving in another vehicle: he could just as well
                        // walk out to THIS one.
                        {
                          key: `wov-oos-${rego}`,
                          label: "Walked to Vehicle",
                          text: `${shortenAlreadyMentionedNames(otherOosPeople.join(" and "), usedBracketCodes)} exited ${a.address} and walked towards Vehicle ${rego}.`,
                        },
                        departingAction,
                      ]
                    : [
                        departingAction,
                        ...(inCar && !inside && !outOfSight
                          ? [
                              // Left the vehicle and walked off somewhere other
                              // than here (a car park or street space).
                              {
                                key: `wa-${rego}`,
                                label: "Walked away",
                                rego,
                                text: `${carNames} exited the vehicle and walked [route] towards [location].`,
                              },
                              {
                                key: `wi-${rego}`,
                                label: "Walked in",
                                rego,
                                text: `${carNames} exited the vehicle, walked [route], entered ${a.address} and continued out of sight.`,
                              },
                            ]
                          : []),
                      ];
              continuityCards.push({
                key: `veh-${rego}`,
                title: rego,
                pill: "Parked",
                who: inside
                  ? `${insideHere.map(w => w.names).join("; ")} inside the address`
                  : outOfSight
                    ? inCar
                      ? `${occupants.join(", ")} out of sight at the address`
                      : "Out of sight since arriving"
                    : inCar
                      ? [
                          inNames.length
                            ? `${inNames.map(withSeat).join(", ")} in the vehicle`
                            : "",
                          toNames.length
                            ? `${toNames.join(", ")} to vehicle`
                            : "",
                        ]
                          .filter(Boolean)
                          .join("; ")
                      : "Nobody in the vehicle",
                state: `${a.address}${sinceText(a.rowId)}`,
                actions,
                latestRowId: Math.max(a.rowId, ...insideHere.map(w => w.rowId)),
                holds: [...occupants, ...insideHere.map(w => w.names)].flatMap(
                  n => surnameTokens(n)
                ),
                people: inside
                  ? insideHere.flatMap(w => splitPeopleNames(w.names))
                  : occupants,
                locus: inside
                  ? {
                      headline: `Inside ${a.address}`,
                      sub: `On foot${sinceText(Math.max(...insideHere.map(w => w.rowId)))}`,
                    }
                  : outOfSight
                    ? {
                        headline: `Out of sight at ${a.address}`,
                        sub: `Arrived in ${rego}${sinceText(a.rowId)}`,
                      }
                    : {
                        headline: inCar
                          ? inNames.length
                            ? `In ${rego}`
                            : `To vehicle ${rego}`
                          : `${rego} unattended`,
                        sub: `Parked at ${a.address}${sinceText(a.rowId)}`,
                      },
              });
            });
            // "From <place> · 09:16 PM" for a vehicle that has left and has no
            // arrival logged yet.
            const departedState = (d: {
              fromAddress?: string | null;
              rowId: number;
            }) =>
              [
                d.fromAddress ? `From ${d.fromAddress}` : "",
                rowTime(d.rowId) ?? "",
              ]
                .filter(Boolean)
                .join(" · ") || "No arrival logged yet";
            (pendingDepartures ?? []).forEach(d => {
              const chip = vehicleArrivingChips.find(c => c.rego === d.rego);
              if (!chip) return;
              // A later row saw it on the move ("... HOGAN driver and sole
              // occupant, travelled on Leach Highway ..."): where it is now,
              // on top of where it left from.
              const travelling = d.via
                ? `Travelling on ${d.via}${d.viaRowId ? ` · ${rowTime(d.viaRowId) ?? ""}` : ""}`.replace(
                    / · $/,
                    ""
                  )
                : "";
              const leftFrom = departedState(d);
              const stateLine = travelling
                ? `${travelling} — ${leftFrom.charAt(0).toLowerCase()}${leftFrom.slice(1)}`
                : leftFrom;
              continuityCards.push({
                key: `dep-${d.rego}`,
                title: d.rego,
                pill: "Departed",
                attn: true,
                who: vehicleOccupants(d.occupantDesc, d.rego, d.rowId).length
                  ? vehicleOccupants(d.occupantDesc, d.rego, d.rowId).join(", ")
                  : extractOccupantNames(d.occupantDesc) ||
                    "Occupants not seen",
                state: stateLine,
                actions: cardAction(chip, "Vehicle arriving"),
                latestRowId: Math.max(d.rowId, d.viaRowId ?? 0),
                ...(() => {
                  const inCar = vehicleOccupants(
                    d.occupantDesc,
                    d.rego,
                    d.rowId
                  );
                  return {
                    holds: inCar.flatMap(n => surnameTokens(n)),
                    people: inCar,
                    locus: travelling
                      ? {
                          headline: inCar.length
                            ? `In ${d.rego}`
                            : `Departed in ${d.rego}`,
                          sub: `${travelling} — ${leftFrom.charAt(0).toLowerCase()}${leftFrom.slice(1)}`,
                        }
                      : {
                          headline: `Departed in ${d.rego}`,
                          sub: leftFrom,
                        },
                  };
                })(),
              });
            });
            (pendingWalkIns ?? [])
              .filter(w => !walkInsAtVehicle.has(w.location))
              .forEach(w => {
                const chip = leftAddressChips.find(
                  c => c.key === `la-${w.location}`
                );
                continuityCards.push({
                  key: `foot-${w.location}`,
                  title: w.names,
                  pill: "Inside",
                  who: `Inside ${w.location}`,
                  state: `On foot${sinceText(w.rowId)}`,
                  actions: [
                    ...cardAction(chip, "Left address"),
                    // Logged at a bus stop or train station: boarding.
                    ...transitBoardActions({
                      keyBase: w.location,
                      names: shortenAlreadyMentionedNames(
                        w.names,
                        usedBracketCodes
                      ),
                      place: w.location,
                    }),
                    // Back to a parked vehicle from here.
                    ...reachableVehicles(w.names, w.location).map(a => ({
                      key: `wov-${w.location}-${a.rego}`,
                      label: `Walked to ${a.rego}`,
                      text: `${shortenAlreadyMentionedNames(w.names, usedBracketCodes)} exited ${w.location} and walked towards Vehicle ${a.rego}.`,
                    })),
                  ],
                  latestRowId: w.rowId,
                  holds: surnameTokens(w.names),
                  people: splitPeopleNames(w.names),
                  locus: {
                    headline: `Inside ${w.location}`,
                    sub: `On foot${sinceText(w.rowId)}`,
                  },
                });
              });
            (pendingHeadingTo ?? []).forEach(h => {
              const chip = enteredChips.find(
                c =>
                  c.key ===
                  `en-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`
              );
              if (!chip) return;
              const walkers = shortenAlreadyMentionedNames(
                h.names,
                usedBracketCodes
              );
              const destKnown = !h.destination.includes("[");
              // On foot, the next step is one of: enter where they were
              // heading, walk on to somewhere else, or walk back towards a
              // vehicle that is parked.
              continuityCards.push({
                key: `head-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`,
                title: h.names,
                pill: h.fromTransit
                  ? "Alighted"
                  : h.fromVessel
                    ? "Disembarked"
                    : "Departed on foot",
                attn: true,
                who: destKnown ? `Walking to ${h.destination}` : "On foot",
                state: `${alightedWording(h)?.left ?? `Left ${h.fromVessel ?? h.from}`}${sinceText(h.rowId)}`,
                actions: [
                  ...cardAction(
                    chip,
                    destKnown ? "Entered" : "Entered a location"
                  ),
                  {
                    key: `in-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`,
                    label: "Inside",
                    text: `${walkers} inside ${destKnown ? h.destination : "[location]"} [observation].`,
                  },
                  {
                    key: `wk-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`,
                    label: "Walked to another location",
                    text: `${walkers} walked [route] towards [location].`,
                  },
                  // Heading for, or just got off at, a bus stop or train
                  // station: boarding.
                  ...transitBoardActions({
                    keyBase: `h-${h.destination}-${h.names}`,
                    names: walkers,
                    place: destKnown ? h.destination : h.from,
                  }),
                  ...reachableVehicles(h.names, h.from).map(a => ({
                    key: `wv-${a.rego}`,
                    label: `Walked to ${a.rego}`,
                    text: `${walkers} walked towards Vehicle ${a.rego}.`,
                  })),
                ],
                latestRowId: h.rowId,
                holds: surnameTokens(h.names),
                people: splitPeopleNames(h.names),
                locus: {
                  headline: (() => {
                    const how = h.fromTransit
                      ? "Alighted, on foot"
                      : h.fromVessel
                        ? "Disembarked, on foot"
                        : "Departed on foot";
                    return destKnown ? `${how} to ${h.destination}` : how;
                  })(),
                  sub: `${alightedWording(h)?.left ?? `Left ${h.fromVessel ?? h.from}`}${sinceText(h.rowId)}`,
                },
              });
            });
            // People who got into a vehicle that has no arrival or departure
            // row of its own ("entered a gold BMW ... (Vehicle 1FAB888)"):
            // their position is where they were last logged, until a row
            // says where the vehicle went.
            {
              const logged = new Set(
                [...(pendingArrivals ?? []), ...(pendingDepartures ?? [])].map(
                  v => v.rego.toUpperCase()
                )
              );
              const byRego = new Map<
                string,
                NonNullable<typeof pendingPlacements>
              >();
              for (const p of pendingPlacements ?? []) {
                if (!p.rego || p.inside === false) continue;
                if (logged.has(p.rego.toUpperCase())) continue;
                byRego.set(p.rego, [...(byRego.get(p.rego) ?? []), p]);
              }
              byRego.forEach((ps, rego) => {
                const names = ps.map(p => p.name);
                // A vehicle with a marker on the map is at that marker; else
                // where they were last logged.
                const markerAddr = ps.find(p => p.vehicleMarker?.address)
                  ?.vehicleMarker?.address;
                const at = markerAddr
                  ? shortAddressLabel(markerAddr)
                  : ps.find(p => p.at)?.at;
                const atMarker = !!ps.find(p => p.vehicleMarker);
                const rowId = Math.max(...ps.map(p => p.rowId));
                continuityCards.push({
                  key: `vnl-${rego}`,
                  title: rego,
                  pill: "In vehicle",
                  attn: true,
                  who: `${(() => {
                    const seats = seatsOf({
                      desc: "",
                      descRowId: 0,
                      rego,
                      occupants: names,
                      placements: ps,
                    });
                    return names
                      .map(n => (seats.has(n) ? `${n} (${seats.get(n)})` : n))
                      .join(", ");
                  })()} in the vehicle`,
                  state: `${at ? `${atMarker ? "At" : "Last seen at"} ${at}` : "Position not logged"}${sinceText(rowId)}`,
                  actions: [
                    {
                      key: `vnl-dep-${rego}`,
                      label: "Vehicle departing",
                      text: `Vehicle ${rego}, ${
                        seatedOccupantWording({
                          desc: "",
                          descRowId: 0,
                          rego,
                          occupants: names,
                          placements: ps,
                        }) ?? names.join(", ")
                      }, departed ${at ?? "[location]"} and continued via:`,
                    },
                  ],
                  latestRowId: rowId,
                  holds: names.flatMap(n => surnameTokens(n)),
                  people: names,
                  locus: {
                    headline: `In ${rego}`,
                    sub: `${at ? `${atMarker ? "At" : "Last seen at"} ${at}` : "Position not logged"}${sinceText(rowId)}`,
                  },
                });
              });
            }
            // People aboard a boat or vessel ("boarded a vessel at the end of
            // the jetty"): where it is can't be told from the row, so it is
            // where they were last logged, until a row says they got off.
            {
              const byVessel = new Map<
                string,
                NonNullable<typeof pendingPlacements>
              >();
              for (const p of pendingPlacements ?? []) {
                if (!p.vessel) continue;
                const k = p.vessel.toLowerCase();
                byVessel.set(k, [...(byVessel.get(k) ?? []), p]);
              }
              byVessel.forEach((ps, vk) => {
                const vessel = ps[0].vessel ?? vk;
                const names = ps.map(p => p.name);
                const at = ps.find(p => p.at)?.at;
                const rowId = Math.max(...ps.map(p => p.rowId));
                const where = at
                  ? `Last seen at ${at}${sinceText(rowId)}`
                  : `Position not logged${sinceText(rowId)}`;
                continuityCards.push({
                  key: `vsl-${vk}`,
                  title: names.join(" and "),
                  pill: "On a vessel",
                  attn: true,
                  who: `${names.join(", ")} on ${vessel}`,
                  state: where,
                  actions: [
                    {
                      key: `vsl-off-${vk}`,
                      label: "Disembarked",
                      text: `${shortenAlreadyMentionedNames(names.join(" and "), usedBracketCodes)} disembarked from ${vessel} and walked [route] towards [location].`,
                    },
                  ],
                  latestRowId: rowId,
                  holds: names.flatMap(n => surnameTokens(n)),
                  people: names,
                  locus: { headline: `On ${vessel}`, sub: where },
                });
              });
            }
            // People aboard a bus, train or tram ("boarded a bus at Bus Stop
            // …"): until a row says they got off.
            continuityCards.push(
              ...onTransitCards({
                placements: pendingPlacements ?? [],
                sinceText,
                shorten: n => shortenAlreadyMentionedNames(n, usedBracketCodes),
              })
            );
            // The card holding the TARGET leads the band as its tracker: a
            // person's by surname, a vehicle's by its plate (shared rule:
            // trackedTarget). A location target has nothing that moves.
            const targetCode = trackedTargetCode(trackedTarget);
            const targetWho = trackedTarget?.kind === "vehicle" ? "it" : "he";
            // Safety net for phrasing the position logic doesn't read: the
            // newest row that names the target alongside a movement word
            // but matched none of the known movement phrasings. If it is
            // newer than what the tracker is based on, the position shown
            // may be stale, so say so rather than state it plainly. A row the
            // logic DID read (even one that doesn't change the card, such as
            // walking back towards a vehicle) never triggers this.
            const targetRe = targetCode
              ? new RegExp(`\\b${targetCode}\\b`, "i")
              : null;
            const knownSurnames = knownSurnamesOf(
              (rows ?? []).map(r => r.observation)
            );
            const latestMove =
              targetRe && rows
                ? rows
                    .filter(
                      r =>
                        !!r.observation &&
                        targetRe.test(r.observation) &&
                        !isReadAsMovement(r.observation, knownSurnames) &&
                        /\b(entered|exited|walked|left|arrived|departed|drove|travelled|stopped|parked|inside|seated|sitting|standing|seen|sighted|remains|remained)\b/i.test(
                          r.observation
                        )
                    )
                    .reduce<
                      NonNullable<typeof rows>[number] | null
                    >((a, b) => (!a || b.id > a.id ? b : a), null)
                : null;
            const staleWarn = (basedOnRowId: number) =>
              latestMove && latestMove.id > basedOnRowId
                ? `The ${latestMove.time ?? "latest"} row names ${targetCode} after this, but wasn't read as a move — check where ${targetWho} is.`
                : undefined;
            if (targetCode && continuityCards.length > 0) {
              const targetKey = pickSubjectCardKey(
                continuityCards,
                trackedTarget
              );
              const held = continuityCards.find(c => c.key === targetKey);
              if (held) {
                held.isTarget = true;
                held.warn = staleWarn(held.latestRowId);
                held.companions = subjectCompanions(
                  held.people ?? [],
                  trackedTarget
                ).join(", ");
                // Took over from another sheet: say where the picture came from.
                if (surveillance?.handover && held.locus)
                  held.locus = {
                    ...held.locus,
                    sub: `${held.locus.sub} · Handed over from ${surveillance.handover.title}`,
                  };
              } else {
                // Cards exist but none names him: say so rather than leave
                // the band looking as if it were about someone else.
                continuityCards.push({
                  key: "target-not-located",
                  title: targetCode,
                  pill: "Not located",
                  attn: true,
                  who: "Position not logged",
                  state: `No logged movement names ${targetCode} yet`,
                  actions: [],
                  latestRowId: Number.MAX_SAFE_INTEGER,
                  isTarget: true,
                  warn: staleWarn(0),
                  locus: {
                    headline: "Position not logged",
                    sub: `No logged movement names ${targetCode} yet`,
                  },
                });
              }
            }
            // Every member of the team has ceased: the live cards give way to
            // one grey card saying so, with the last place he was seen.
            if (surveillance?.ended) {
              continuityCards.length = 0;
              continuityCards.push(
                endedContinuityCard({
                  who: targetCode ?? "Team",
                  time: surveillance.endedAtTime,
                  position: targetPosition,
                })
              );
            }
            // Tapping a card action adds the sentence as its own row, stamped
            // with the current (Perth) time — so the time of the event is
            // captured the moment it happens — and it can be edited like any
            // other row afterwards. Falls back to inserting the text (the
            // old behaviour) when that would be wrong: offline (the offline
            // queue doesn't carry observation text) or on a sheet dated for
            // a different day than today.
            // Types text into a controlled textarea so React sees it (same
            // execCommand / native-setter approach insertAtFocused uses).
            const typeInto = (
              el: HTMLTextAreaElement | HTMLInputElement,
              insert: string
            ) => {
              const start = el.selectionStart ?? el.value.length;
              const end = el.selectionEnd ?? el.value.length;
              try {
                document.execCommand("insertText", false, insert);
              } catch {
                const setter =
                  Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    "value"
                  )?.set ||
                  Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    "value"
                  )?.set;
                if (setter) {
                  setter.call(
                    el,
                    el.value.slice(0, start) + insert + el.value.slice(end)
                  );
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }
            };
            // The observation cell that is open for editing right now, if
            // any. focusedTextareaRef also remembers cells that have since
            // closed, so it must still be attached and the active element.
            const openObservationCell = (): HTMLTextAreaElement | null => {
              const el = focusedTextareaRef.current;
              return el &&
                el.tagName === "TEXTAREA" &&
                el.isConnected &&
                document.activeElement === el
                ? (el as HTMLTextAreaElement)
                : null;
            };
            const addContinuityEntry = (text: string) => {
              // Rule 1: a cell is open → the sentence goes into it as the
              // next paragraph, at the end of what's already written.
              const open = openObservationCell();
              if (open) {
                const v = open.value;
                const lead = !v
                  ? ""
                  : v.endsWith("\n\n")
                    ? ""
                    : v.endsWith("\n")
                      ? "\n"
                      : "\n\n";
                open.focus();
                open.setSelectionRange(v.length, v.length);
                typeInto(open, lead + text);
                return;
              }
              // Rule 2: no cell open → it becomes its own row. Vehicles stay
              // written as plain "Vehicle 1ORB419", exactly as the cards
              // phrase them.
              const perth = (opts: Intl.DateTimeFormatOptions) =>
                new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Australia/Perth",
                  ...opts,
                }).formatToParts(new Date());
              const part = (
                parts: Intl.DateTimeFormatPart[],
                type: string
              ): string => parts.find(p => p.type === type)?.value ?? "";
              const d = perth({
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              });
              const todayYmd = `${part(d, "year")}-${part(d, "month")}-${part(d, "day")}`;
              const forToday =
                !sheet?.sheetDate || sheet.sheetDate === todayYmd;
              if (!isOnline || !forToday) {
                insertAtFocused(text);
                if (!forToday) {
                  toast.info(
                    "This sheet is dated for another day, so the text was added to the row you're editing instead."
                  );
                }
                return;
              }
              const t = perth({
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });
              const h24 = parseInt(part(t, "hour"), 10) % 24;
              const min = parseInt(part(t, "minute"), 10);
              const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
              const timeStr = `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
              _addRowOnline
                .mutateAsync({
                  sheetId,
                  time: timeStr,
                  timeMinutes: h24 * 60 + min,
                  observation: text,
                })
                .then(created => {
                  // Leave the new row open, so the next tap adds to it as the
                  // next paragraph.
                  setJustAddedRowId(created.id);
                  // If the row never appears to open (e.g. it is locked), do
                  // not leave the request lying in wait.
                  setTimeout(() => setJustAddedRowId(null), 6000);
                  toast.success(`Added ${timeStr}`, {
                    description: "Edit it any time from the row.",
                    duration: 9000,
                    action: {
                      label: "Undo",
                      onClick: () =>
                        _deleteRowOnline.mutate({ id: created.id }),
                    },
                  });
                })
                .catch(() => {
                  /* the mutation's own onError already showed the message */
                });
            };
            const hasContinuityChips = continuityCards.length > 0;
            const insertAtFocused = (text: string) => {
              const el = focusedTextareaRef.current;
              if (!el) return;
              el.focus();
              const start = el.selectionStart ?? el.value.length;
              const end = el.selectionEnd ?? el.value.length;
              const before = el.value.slice(0, start);
              const after = el.value.slice(end);
              const insert =
                before && !before.endsWith(" ") ? ` ${text}` : text;
              try {
                document.execCommand("insertText", false, insert);
              } catch {
                const nativeInputValueSetter =
                  Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype,
                    "value"
                  )?.set ||
                  Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    "value"
                  )?.set;
                if (nativeInputValueSetter) {
                  nativeInputValueSetter.call(el, before + insert + after);
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }
            };
            const showTargetPanel = !!(
              (sheet?.targetId && assignedTarget) ||
              (entityChips && entityChips.length > 0)
            );
            return (
              <>
                {showTargetPanel && (
                  <div className="mb-4 rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                    {/* Header — always visible. Tapping the main area toggles collapse; pencil navigates to edit */}
                    <div className="flex items-center">
                      <button
                        className="flex-1 flex items-center gap-2 px-4 py-3 bg-muted/60 hover:bg-muted active:bg-muted transition-colors select-none text-left min-w-0"
                        onClick={() =>
                          setTargetPanelExpanded(v => {
                            const next = !v;
                            try {
                              localStorage.setItem(
                                "runsheet_target_panel_expanded",
                                String(next)
                              );
                            } catch {}
                            return next;
                          })
                        }
                      >
                        {hasTarget ? (
                          <Target className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-[13px] font-bold uppercase tracking-wide text-foreground truncate flex-1">
                          {hasTarget ? `TARGET — ${t!.name}` : "SHORTCUTS"}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${targetPanelExpanded ? "" : "-rotate-90"}`}
                        />
                      </button>
                      {/* Edit pencil — independent tap zone, doesn't trigger collapse */}
                      {hasTarget && (
                        <button
                          className="px-3 py-3 text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 border-l border-border bg-muted/60 hover:bg-muted rounded-tr-lg"
                          onClick={() =>
                            navigate(
                              `/operation/${sheet!.operationId}?tab=target&targetId=${t!.id}&fromSheet=${sheetId}`
                            )
                          }
                          title="Edit Target"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {/* Collapsible details */}
                    {targetPanelExpanded &&
                      (() => {
                        // Shortcut chips follow the Shortcuts page order; the
                        // target's own chips (HBF, vehicles, TGT, HB) are a
                        // fixed block straight after SC (shared/rsChips.ts).
                        const orderedFields = orderRsChips(
                          fields.filter(f => f.value),
                          (shortcutsData ?? []).map(s => s.trigger)
                        );
                        return (
                          <div className="px-4 pb-3 border-t border-border/40">
                            {hasAnyField &&
                              (() => {
                                const shortcutFolderLabels = new Set(
                                  (shortcutsData ?? []).map(s =>
                                    s.trigger.toUpperCase()
                                  )
                                );
                                const TRIGGER_ONLY_LABELS = new Set([
                                  "TGT",
                                  "HBF",
                                  "HB",
                                  "V1F",
                                  "V2F",
                                ]);
                                return (
                                  <>
                                    <div className="flex flex-wrap gap-1.5 pt-2">
                                      {orderedFields.map(f => {
                                        const insertIntoFocused = () => {
                                          const el = focusedTextareaRef.current;
                                          if (el) {
                                            el.focus();
                                            const start =
                                              el.selectionStart ??
                                              el.value.length;
                                            const end =
                                              el.selectionEnd ??
                                              el.value.length;
                                            const before = el.value.slice(
                                              0,
                                              start
                                            );
                                            const after = el.value.slice(end);
                                            const insert =
                                              before && !before.endsWith(" ")
                                                ? ` ${f.value!}`
                                                : f.value!;
                                            try {
                                              document.execCommand(
                                                "insertText",
                                                false,
                                                insert
                                              );
                                            } catch {
                                              const nativeInputValueSetter =
                                                Object.getOwnPropertyDescriptor(
                                                  window.HTMLTextAreaElement
                                                    .prototype,
                                                  "value"
                                                )?.set ||
                                                Object.getOwnPropertyDescriptor(
                                                  window.HTMLInputElement
                                                    .prototype,
                                                  "value"
                                                )?.set;
                                              if (nativeInputValueSetter) {
                                                nativeInputValueSetter.call(
                                                  el,
                                                  before + insert + after
                                                );
                                                el.dispatchEvent(
                                                  new Event("input", {
                                                    bubbles: true,
                                                  })
                                                );
                                              }
                                            }
                                          }
                                        };
                                        const isVnShort = /^V\d+$/.test(
                                          f.label
                                        );
                                        const isVnFull = /^V\d+F$/.test(
                                          f.label
                                        );
                                        const isStandard =
                                          !isVnShort &&
                                          (shortcutFolderLabels.has(f.label) ||
                                            TRIGGER_ONLY_LABELS.has(f.label) ||
                                            isVnFull);
                                        return (
                                          <ShortcutChip
                                            key={f.label}
                                            label={f.label}
                                            value={f.value}
                                            showValue={isVnShort || !isStandard}
                                            onInsert={insertIntoFocused}
                                          />
                                        );
                                      })}
                                      {/* Cease — last of the chips, in the same
                                          look. Press it for the ceased row. */}
                                      {ceaseAvailable && (
                                        <CeaseRowButton
                                          variant="chip"
                                          sheetId={sheetId}
                                          getPlace={ceasePlace}
                                          onChanged={invalidateRows}
                                          onOpenForTyping={ceaseOpenForTyping}
                                          onPresence={setCeaseChipShown}
                                        />
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                            {/* Entity chips — quick-insert shortcuts mined from this sheet's own
                        observations (surname / short address / vehicle rego), one line
                        under the fixed chips above, shared across every officer viewing
                        the sheet since they come from the server, not a per-device setting. */}
                            {hasEntityChips && (
                              <div className="flex flex-wrap gap-1.5 pt-2">
                                {entityChips!.map(chip => {
                                  const insertIntoFocused = () => {
                                    const el = focusedTextareaRef.current;
                                    if (!el) return;
                                    el.focus();
                                    const start =
                                      el.selectionStart ?? el.value.length;
                                    const end =
                                      el.selectionEnd ?? el.value.length;
                                    const before = el.value.slice(0, start);
                                    const after = el.value.slice(end);
                                    const insert =
                                      before && !before.endsWith(" ")
                                        ? ` ${chip.insertValue}`
                                        : chip.insertValue;
                                    try {
                                      document.execCommand(
                                        "insertText",
                                        false,
                                        insert
                                      );
                                    } catch {
                                      const nativeInputValueSetter =
                                        Object.getOwnPropertyDescriptor(
                                          window.HTMLTextAreaElement.prototype,
                                          "value"
                                        )?.set ||
                                        Object.getOwnPropertyDescriptor(
                                          window.HTMLInputElement.prototype,
                                          "value"
                                        )?.set;
                                      if (nativeInputValueSetter) {
                                        nativeInputValueSetter.call(
                                          el,
                                          before + insert + after
                                        );
                                        el.dispatchEvent(
                                          new Event("input", { bubbles: true })
                                        );
                                      }
                                    }
                                  };
                                  return (
                                    <button
                                      key={chip.key}
                                      onMouseDown={e => e.preventDefault()}
                                      onClick={insertIntoFocused}
                                      title={`Insert: ${chip.insertValue}`}
                                      className="inline-flex items-center px-2 py-0.5 rounded border border-violet-500/30 bg-violet-500/5 text-violet-400 hover:bg-violet-500/15 active:scale-95 transition-all select-none cursor-pointer"
                                    >
                                      {targetPosition?.place &&
                                        samePlace(
                                          chip.insertValue,
                                          targetPosition.place
                                        ) && (
                                          <span
                                            className="mr-1 text-xs"
                                            title={`Target ${targetPosition.label}`}
                                          >
                                            {targetEmoji(
                                              targetPosition.state,
                                              targetPosition.transitMode
                                            )}
                                          </span>
                                        )}
                                      <span className="text-xs font-mono font-bold max-w-[140px] truncate">
                                        {chip.insertValue}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                  </div>
                )}
                {/* Continuity cards sit between the chip panel and the rows,
                    and show whether or not the panel above is expanded. */}
                {hasContinuityChips && trackingSettings.tracking && (
                  <div className={showTargetPanel ? "mb-4 -mt-2" : "mb-4"}>
                    <ContinuityCards
                      busy={_addRowOnline.isPending}
                      cards={continuityCards}
                      dismissed={continuityDismissed}
                      onDismiss={(key, rowId) =>
                        setContinuityDismissal.mutate({ sheetId, key, rowId })
                      }
                      onRestore={key =>
                        setContinuityDismissal.mutate({
                          sheetId,
                          key,
                          rowId: null,
                        })
                      }
                      onAction={(text, _mode, rego) =>
                        addContinuityEntry(
                          fillRoute(text, rego, [
                            ...[...(rows ?? [])]
                              .sort(
                                (a, b) =>
                                  (a.rowNumber ?? 0) - (b.rowNumber ?? 0)
                              )
                              .map(r => r.observation),
                            // What is typed in the open box right now.
                            openObservationCell()?.value,
                          ])
                        )
                      }
                    />
                  </div>
                )}
              </>
            );
          })()}

        {/* Search bar + sort toggle + add row — stays at the top of the
            screen while the rows scroll underneath (the page's one scroll
            container is <main>, see DashboardLayout). A solid ground and a
            thin line under it keep the rows from showing through. */}
        <div
          data-testid="sheet-toolbar"
          className="sticky top-0 z-30 -mx-1 mb-3 flex items-center gap-2 border-b border-border bg-background px-1 py-2"
        >
          {/* Add Row — moved here, left of sort toggle, hidden when sheet is closed or read-only */}
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2 shrink-0"
              onClick={() => addRow.mutate({ sheetId })}
              disabled={addRow.isPending}
            >
              <Plus className="w-4 h-4" />
              Add<span className="hidden sm:inline"> Row</span>
            </Button>
          )}
          {/* Cease — the ceased row for everyone still on, beside Add Row;
              only while there is something to cease. */}
          {ceaseAvailable && !ceaseChipShown && (
            <CeaseRowButton
              sheetId={sheetId}
              getPlace={ceasePlace}
              onChanged={invalidateRows}
              onOpenForTyping={ceaseOpenForTyping}
            />
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`shrink-0 ${sortReversed ? "border-primary text-primary" : ""}`}
                onClick={toggleSortReversed}
              >
                <ArrowUpDown className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {sortReversed
                ? "Showing newest first — click to show oldest first"
                : "Showing oldest first — click to show newest first"}
            </TooltipContent>
          </Tooltip>
          {/* Undo last edit — laptop/iPad only, hidden on mobile */}
          {canEdit && undoStack.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 hidden sm:inline-flex"
                  onClick={handleUndo}
                >
                  <Undo2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo last edit</TooltipContent>
            </Tooltip>
          )}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by time, observation, or CIN…"
              className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="md:rounded-xl md:border md:border-border overflow-hidden md:bg-card">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-6 flex flex-col gap-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : !rows || rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-muted-foreground text-sm">
                  No rows yet. Click "Add Row" to begin.
                </p>
              </div>
            ) : (
              <table className="running-sheet-table running-sheet-cards w-full">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="w-32">Time</th>
                    <th>Observation</th>
                    <th className="w-28">CIN</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 && searchQuery ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-12 text-center text-sm text-muted-foreground italic"
                      >
                        No rows match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.reduce(
                      (
                        acc: React.ReactNode[],
                        row: NonNullable<typeof rows>[0],
                        idx: number
                      ) => {
                        // ── Date-divider: insert a separator row when the day offset changes ──
                        // In ascending order: divider goes BEFORE the first day-N row.
                        // In reversed order: divider goes AFTER the last day-N row (i.e. before
                        // the current row which belongs to an earlier day).
                        if (row.timeMinutes != null) {
                          const prevTimedRow = [...filteredRows]
                            .slice(0, idx)
                            .reverse()
                            .find(
                              (r: NonNullable<typeof rows>[0]) =>
                                r.timeMinutes != null
                            );
                          if (prevTimedRow) {
                            const prevDay =
                              rowDayOffsetMap.get(prevTimedRow.id) ?? 0;
                            const curDay = rowDayOffsetMap.get(row.id) ?? 0;
                            if (curDay !== prevDay) {
                              // The divider label always shows the HIGHER day (the later calendar day)
                              const laterDay = Math.max(prevDay, curDay);
                              // Prefer an explicit rowDate from a row on that day
                              const rowOnLaterDay = filteredRows.find(
                                (r: NonNullable<typeof rows>[0]) =>
                                  (rowDayOffsetMap.get(r.id) ?? 0) ===
                                    laterDay && (r as any).rowDate
                              );
                              let label: string;
                              if (
                                rowOnLaterDay &&
                                (rowOnLaterDay as any).rowDate
                              ) {
                                label = formatPerthDateLabel(
                                  (rowOnLaterDay as any).rowDate as string
                                );
                              } else if (sheet?.sheetDate) {
                                label = formatPerthDateLabel(
                                  addDaysToYmd(sheet.sheetDate, laterDay)
                                );
                              } else {
                                const sheetStartMs = sheet?.createdAt
                                  ? new Date(sheet.createdAt).getTime()
                                  : Date.now();
                                const labelDate = new Date(
                                  sheetStartMs + laterDay * 24 * 60 * 60 * 1000
                                );
                                label = labelDate
                                  .toLocaleDateString("en-AU", {
                                    weekday: "short",
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                    timeZone: PERTH_TIME_ZONE,
                                  })
                                  .toUpperCase();
                              }
                              const dividerRow = (
                                <tr
                                  key={`divider-${row.id}`}
                                  className="date-divider-row"
                                >
                                  <td colSpan={3} className="py-1.5 px-4">
                                    <div className="flex items-center gap-3">
                                      <div className="flex-1 h-px bg-border" />
                                      <span className="text-xs font-semibold tracking-widest text-muted-foreground whitespace-nowrap">
                                        {label}
                                      </span>
                                      <div className="flex-1 h-px bg-border" />
                                    </div>
                                  </td>
                                </tr>
                              );
                              // Always insert divider before the current row.
                              // In ascending: divider sits above the first day-N row.
                              // In reversed: the reduce sees rows newest-first, so the day
                              // boundary is detected when we hit the first lower-day row;
                              // inserting the divider before that row places it correctly
                              // between the higher-day rows above and lower-day rows below.
                              acc.push(dividerRow);
                            }
                          }
                        }
                        acc.push(
                          <tr
                            key={row.id}
                            id={`sheet-row-${row.id}`}
                            className={
                              row.isLocked ? "row-locked" : "hover:bg-accent/20"
                            }
                          >
                            {/* Time */}
                            <td>
                              <TimePickerCell
                                value={row.time}
                                locked={row.isLocked || !canEdit}
                                dayOffset={(row as any).dayOffset ?? 0}
                                rowDate={(row as any).rowDate ?? null}
                                inferredRowDate={(() => {
                                  if (!sheetHasCrossedMidnight) return null;
                                  // Compute inferred date from day offset +
                                  // the sheet's picker date (falling back to
                                  // creation date only for legacy sheets with
                                  // no sheetDate).
                                  const dayOff =
                                    rowDayOffsetMap.get(row.id) ?? 0;
                                  if (sheet?.sheetDate) {
                                    return addDaysToYmd(
                                      sheet.sheetDate,
                                      dayOff
                                    );
                                  }
                                  const sheetStartMs = sheet?.createdAt
                                    ? new Date(sheet.createdAt).getTime()
                                    : Date.now();
                                  const d = new Date(
                                    sheetStartMs + dayOff * 86400000
                                  );
                                  return new Intl.DateTimeFormat("en-CA", {
                                    timeZone: PERTH_TIME_ZONE,
                                    year: "numeric",
                                    month: "2-digit",
                                    day: "2-digit",
                                  }).format(d);
                                })()}
                                sheetHasCrossedMidnight={
                                  sheetHasCrossedMidnight
                                }
                                sheetDate={sheet?.sheetDate ?? null}
                                sheetCreatedAt={
                                  sheet?.createdAt
                                    ? new Date(sheet.createdAt).getTime()
                                    : null
                                }
                                onSave={(display, mins, dayOff, rd) =>
                                  updateRow.mutate({
                                    id: row.id,
                                    time: display,
                                    timeMinutes: mins,
                                    dayOffset: dayOff,
                                    rowDate: rd,
                                  })
                                }
                              />
                            </td>

                            {/* Observation — reserves ~2 blank lines below
                              the text so rows read with breathing room
                              between them, on screen and not just in the
                              printed/exported sheet. Uses an inline style
                              rather than the pb-10 utility class: the
                              global ".running-sheet-table td" rule in
                              index.css sets its own "padding" shorthand
                              (including padding-bottom), and that selector
                              (class+element) has higher CSS specificity
                              than a bare Tailwind utility class, so pb-10
                              was silently losing to it and never actually
                              applying — confirmed as a real, reported bug,
                              not just a theoretical risk. An inline style
                              always wins regardless of selector
                              specificity, so don't "clean this up" back to
                              a className without re-checking that. */}
                            <td style={{ paddingBottom: "2.5rem" }}>
                              {tvLoadingRowId === row.id ? (
                                <div className="flex items-center gap-2 py-2 px-1 text-sm text-muted-foreground">
                                  <svg
                                    className="animate-spin h-4 w-4 shrink-0"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    />
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                                    />
                                  </svg>
                                  Fetching route streets…
                                </div>
                              ) : (
                                <EditableCell
                                  value={row.observation}
                                  rowId={row.id}
                                  autoEdit={justAddedRowId === row.id}
                                  autoEditKeyboard={justAddedKeyboard}
                                  onAutoEdited={() => {
                                    setJustAddedRowId(null);
                                    setJustAddedKeyboard(false);
                                  }}
                                  locked={row.isLocked || !canEdit}
                                  multiline
                                  placeholder="Enter observation…"
                                  onSave={val => {
                                    // ── TV trigger: detect case-insensitive "tv" as the entire cell value ──
                                    if (val.trim().toLowerCase() === "tv") {
                                      // Find this row's index in filteredRows
                                      const rowIdx = filteredRows.findIndex(
                                        (r: NonNullable<typeof rows>[0]) =>
                                          r.id === row.id
                                      );
                                      if (rowIdx < 0) {
                                        updateRowWithDupeCheck({
                                          id: row.id,
                                          observation: val,
                                        });
                                        return;
                                      }
                                      // Get the row immediately before and after in the display list
                                      const prevRow =
                                        rowIdx > 0
                                          ? filteredRows[rowIdx - 1]
                                          : null;
                                      const nextRow =
                                        rowIdx < filteredRows.length - 1
                                          ? filteredRows[rowIdx + 1]
                                          : null;
                                      if (!prevRow || !nextRow) {
                                        toast.error(
                                          "TV auto-fill: no surrounding rows found. Add a departing row above and arriving row below first."
                                        );
                                        updateRowWithDupeCheck({
                                          id: row.id,
                                          observation: val,
                                        });
                                        return;
                                      }
                                      // Extract address text from surrounding observation cells.
                                      // The observation text is a full sentence like:
                                      //   "Vehicle 1ICW519 STROP driver and sole occupant, departed 27 Olding Way, MELVILLE WA (27 Olding Way)"
                                      // Strategy (in priority order):
                                      //   1. Bracket code at end of text: "(27 Olding Way)" → "27 Olding Way"
                                      //   2. Street number pattern anywhere in text: "27 Olding Way" extracted from sentence
                                      //   3. "departed <Name>"/"arrived at <Name>" clause — a bare business/
                                      //      location name with no house number (e.g. "departed Attadale
                                      //      Kitchen and continued via:") — isolates just the name so the
                                      //      enrichment lookup below can actually find it. Without this the
                                      //      whole noisy sentence fell through to step 4 and got sent to
                                      //      Google's geocoder as-is, which only "worked" by luck when the
                                      //      business happened to be famous enough (a Bunnings, a well-known
                                      //      cafe) for Google's fuzzy matching to find it buried in the noise
                                      //      — a real but less-indexed business (e.g. a small local cafe)
                                      //      geocoded to a wrong, unrelated street instead.
                                      //   4. Full first line as last resort
                                      const prevObs = prevRow.observation ?? "";
                                      const nextObs = nextRow.observation ?? "";

                                      const extractAddressFromObs = (
                                        obs: string
                                      ): string => {
                                        if (!obs) return "";
                                        // 1. Bracket code at end: (27 Olding Way)
                                        const bracketMatch =
                                          obs.match(/\(([^)]{3,80})\)\s*$/);
                                        if (bracketMatch)
                                          return bracketMatch[1].trim();
                                        // 2. Street number pattern: digits followed by street name.
                                        //    Matches things like "27 Olding Way", "131A Lakey Street", "3/12 Smith St".
                                        //    Extra words must also be capitalised so this stops at the street name
                                        //    instead of swallowing trailing sentence text like "and continued via"
                                        //    (lowercase words never continue a street name).
                                        const streetMatch = obs.match(
                                          /\b(\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?)?\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/
                                        );
                                        if (streetMatch)
                                          return streetMatch[1].trim();
                                        // 3. "departed <Name>" / "arrived at <Name>" clause — a bare
                                        //    business/location name, no house number. Stops at the next
                                        //    clause boundary (comma, full stop, "and", or end of string).
                                        const clauseMatch = obs.match(
                                          /\b(?:departed|arrived at)\s+([A-Z][\w&'-]*(?:\s+[A-Z][\w&'-]*){0,5})(?=\s*(?:,|\.|;|:|and\b|$))/
                                        );
                                        if (clauseMatch)
                                          return clauseMatch[1].trim();
                                        // 4. Last resort: full text (server will try to geocode it)
                                        return obs.split("\n")[0].trim();
                                      };

                                      // A bare street mention like "departed 45 Scott Street and continued
                                      // via:" has no suburb, which Google's geocoder often can't resolve on
                                      // its own. Scan every row in the sheet for a bracketed full address
                                      // sighting of the same street (e.g. "45 Scott Street, KOONGAMIA WA (45
                                      // Scott Street)") and prefer that — same enrichment the RS Map feature
                                      // already does for its own address matching.
                                      const knownAddressMap = new Map<
                                        string,
                                        string
                                      >();
                                      const bracketedAddrRe =
                                        /\b(\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?)?\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3},\s*[A-Z][A-Z ]{1,30}(?:\s+WA)?)\s*\(([^)]{3,80})\)/g;
                                      for (const r of filteredRows) {
                                        if (!r.observation) continue;
                                        bracketedAddrRe.lastIndex = 0;
                                        let m: RegExpExecArray | null;
                                        while (
                                          (m = bracketedAddrRe.exec(
                                            r.observation
                                          )) !== null
                                        ) {
                                          const key = m[2].trim().toLowerCase();
                                          if (!knownAddressMap.has(key))
                                            knownAddressMap.set(
                                              key,
                                              m[1].trim()
                                            );
                                        }
                                      }
                                      // Exact match first (the common case once extractAddressFromObs
                                      // isolates the name cleanly); falls back to a substring search so an
                                      // imperfectly-isolated candidate (e.g. step 4's whole-line fallback)
                                      // still finds a known name buried inside it, rather than sending the
                                      // raw noisy sentence to Google and hoping its fuzzy matching gets
                                      // lucky. Guarded to keys of 4+ characters to avoid a short/common
                                      // name spuriously matching unrelated text.
                                      const enrichAddress = (
                                        addr: string
                                      ): string => {
                                        const lower = addr.toLowerCase();
                                        const exact =
                                          knownAddressMap.get(lower);
                                        if (exact) return exact;
                                        const substringMatch = Array.from(
                                          knownAddressMap.entries()
                                        ).find(
                                          ([key]) =>
                                            key.length > 3 &&
                                            lower.includes(key)
                                        );
                                        if (substringMatch)
                                          return substringMatch[1];
                                        return addr;
                                      };

                                      const departAddr = enrichAddress(
                                        extractAddressFromObs(prevObs)
                                      );
                                      const arriveAddr = enrichAddress(
                                        extractAddressFromObs(nextObs)
                                      );
                                      if (!departAddr || !arriveAddr) {
                                        toast.error(
                                          "TV auto-fill: could not extract addresses from surrounding rows."
                                        );
                                        updateRowWithDupeCheck({
                                          id: row.id,
                                          observation: val,
                                        });
                                        return;
                                      }
                                      // Show spinner and call the server
                                      setTvLoadingRowId(row.id);
                                      getTravelledViaStreets.mutate(
                                        {
                                          departAddress: departAddr,
                                          arriveAddress: arriveAddr,
                                          // Pass full observation text so server can extract
                                          // the correct suburb directly from the text
                                          departObsText: prevObs,
                                          arriveObsText: nextObs,
                                        },
                                        {
                                          onSuccess: data => {
                                            setTvLoadingRowId(null);
                                            updateRowWithDupeCheck({
                                              id: row.id,
                                              observation: data.streets,
                                            });
                                            toast.success(
                                              "Travelled via streets auto-filled"
                                            );
                                            // TV means the whole team travelled together — auto-add any
                                            // roster CINs not already on this row, sequenced the same way
                                            // as the "★ Add all team CINs" dropdown option below.
                                            if (rosterCinList.length > 0) {
                                              const existingNames = new Set(
                                                row.members.map(
                                                  m => m.memberName
                                                )
                                              );
                                              const missingCins =
                                                rosterCinList.filter(
                                                  cin => !existingNames.has(cin)
                                                );
                                              const addSequentially = (
                                                cins: string[],
                                                idx: number
                                              ) => {
                                                if (idx >= cins.length) return;
                                                addMember.mutate({
                                                  rowId: row.id,
                                                  memberName: cins[idx],
                                                });
                                                setTimeout(
                                                  () =>
                                                    addSequentially(
                                                      cins,
                                                      idx + 1
                                                    ),
                                                  80
                                                );
                                              };
                                              addSequentially(missingCins, 0);
                                            }
                                          },
                                          onError: () => {
                                            setTvLoadingRowId(null);
                                            // Error toast already shown by mutation onError
                                            updateRowWithDupeCheck({
                                              id: row.id,
                                              observation: val,
                                            });
                                          },
                                        }
                                      );
                                      return;
                                    }
                                    // Normal save
                                    updateRowWithDupeCheck({
                                      id: row.id,
                                      observation: val,
                                    });
                                  }}
                                  shortcuts={shortcutMap}
                                  usedBracketCodes={usedBracketCodes}
                                  usedVehicleRegos={usedVehicleRegos}
                                  usedAddressLabels={usedAddressLabels}
                                />
                              )}
                              <ObservationAttachments
                                row={row}
                                canEdit={canEdit && !row.isLocked}
                                onUpload={(rowId, blob, mimeType, fileName) =>
                                  uploadAttachment.mutateAsync({
                                    rowId,
                                    blob,
                                    mimeType,
                                    fileName,
                                  })
                                }
                                onDelete={id => deleteAttachment.mutate({ id })}
                                uploading={uploadAttachment.isPending}
                                deletePending={deleteAttachment.isPending}
                                operationId={sheet?.operationId}
                              />
                            </td>

                            {/* CIN / Certify */}
                            <td>
                              <CinCertifyCell
                                row={row}
                                canEdit={canEdit}
                                canCertify={canCertify}
                                onAddMember={(rowId, name) =>
                                  addMember.mutate({ rowId, memberName: name })
                                }
                                onRemoveMember={(id, rowId) => {
                                  const rowData = rows?.find(
                                    r => r.id === rowId
                                  );
                                  if (rowData?.isLocked) {
                                    // Row is locked — uncertify all first, then remove
                                    uncertifyAll.mutate(
                                      { rowId },
                                      {
                                        onSuccess: () =>
                                          removeMember.mutate({ id, rowId }),
                                      }
                                    );
                                  } else {
                                    removeMember.mutate({ id, rowId });
                                  }
                                }}
                                onCertify={(rowId, memberId) =>
                                  certify.mutate({ rowId, memberId })
                                }
                                onUncertify={(rowId, memberId) =>
                                  uncertify.mutate({ rowId, memberId })
                                }
                                onUncertifyAll={rowId =>
                                  uncertifyAll.mutate({ rowId })
                                }
                                onDeleteRow={
                                  canCertify
                                    ? rowId => {
                                        if (confirm("Delete this row?"))
                                          deleteRow.mutate({ id: rowId });
                                      }
                                    : undefined
                                }
                                rosterCins={rosterCinList}
                              />
                            </td>
                          </tr>
                        );
                        return acc;
                      },
                      [] as React.ReactNode[]
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--certified-color)]" />
            Certified
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[var(--certified-color)]" />
            Row locked (all members certified)
          </div>
          {canCertify && (
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              Click to certify a member
            </div>
          )}
        </div>
      </div>
      {/* Edit Sheet Title Dialog */}
      <Dialog open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sheet Details</DialogTitle>
          </DialogHeader>
          <div className="py-2 flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Date <span className="text-destructive">*</span>
              </label>
              <Input
                type="date"
                value={editSheetDate}
                onChange={e => setEditSheetDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                The sheet's title is generated automatically from this date, the
                author, operation and target.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Target
              </label>
              <div className="flex flex-col gap-2">
                {/* Operation's existing targets — selectable */}
                {(operationTargets ?? []).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (editSelectedTargetId === t.id) {
                        setEditSelectedTargetId(null);
                        setEditTargetMode("none");
                      } else {
                        setEditSelectedTargetId(t.id);
                        setEditTargetMode("link");
                      }
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors w-full ${
                      editSelectedTargetId === t.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <Target className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">
                      {t.name}
                    </span>
                    {editSelectedTargetId === t.id && (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    )}
                  </button>
                ))}

                {/* Link Existing search panel */}
                {editTargetMode === "link" && editSelectedTargetId === null && (
                  <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <Input
                        autoFocus
                        className="h-8 text-sm"
                        placeholder="Search by name, TGT code or operation…"
                        value={editTargetSearch}
                        onChange={e => setEditTargetSearch(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => {
                          setEditTargetMode("none");
                          setEditTargetSearch("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <div className="max-h-52 overflow-y-auto flex flex-col gap-1">
                      {(allTargetsForSheet ?? []).filter(t => {
                        const q = editTargetSearch.toLowerCase();
                        return (
                          t.name.toLowerCase().includes(q) ||
                          (t.tgt ?? "").toLowerCase().includes(q) ||
                          (t.operationName ?? "").toLowerCase().includes(q)
                        );
                      }).length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          {editTargetSearch
                            ? "No matching targets"
                            : "Start typing to search"}
                        </p>
                      ) : (
                        (allTargetsForSheet ?? [])
                          .filter(t => {
                            const q = editTargetSearch.toLowerCase();
                            return (
                              t.name.toLowerCase().includes(q) ||
                              (t.tgt ?? "").toLowerCase().includes(q) ||
                              (t.operationName ?? "").toLowerCase().includes(q)
                            );
                          })
                          .map(t => (
                            <button
                              key={t.id}
                              type="button"
                              className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 text-left transition-colors w-full"
                              onClick={() => {
                                setEditSelectedTargetId(t.id);
                                setEditTargetSearch("");
                                setEditTargetMode("link");
                              }}
                            >
                              <Target className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {t.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {t.tgt ? (
                                    <span className="font-mono mr-2">
                                      TGT: {t.tgt}
                                    </span>
                                  ) : null}
                                  {t.operationName ? (
                                    <span>Op: {t.operationName}</span>
                                  ) : null}
                                </p>
                              </div>
                            </button>
                          ))
                      )}
                    </div>
                  </div>
                )}

                {/* Selected linked target chip (not from operation) */}
                {editTargetMode === "link" &&
                  editSelectedTargetId !== null &&
                  !(operationTargets ?? []).find(
                    t => t.id === editSelectedTargetId
                  ) && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary bg-primary/10 text-primary">
                      <Target className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium flex-1 truncate">
                        {
                          (allTargetsForSheet ?? []).find(
                            t => t.id === editSelectedTargetId
                          )?.name
                        }
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditSelectedTargetId(null);
                          setEditTargetMode("none");
                        }}
                        className="hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                {/* Action buttons */}
                {!(
                  editTargetMode === "link" && editSelectedTargetId === null
                ) && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => setEditCreateTargetDialogOpen(true)}
                    >
                      <Plus className="w-3.5 h-3.5" /> New Target
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setEditTargetMode("link");
                        setEditSelectedTargetId(null);
                        setEditTargetSearch("");
                      }}
                    >
                      <Search className="w-3.5 h-3.5" /> Link Existing
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {/* Delete button — bottom left, admin only */}
            {user?.role === "admin" && (
              <Button
                variant="ghost"
                className="sm:mr-auto text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                disabled={deleteSheet.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Move "${sheet?.title}" to the Recycle Bin? It can be restored from there.`
                    )
                  ) {
                    deleteSheet.mutate({ id: sheetId });
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleteSheet.isPending ? "Deleting…" : "Delete Sheet"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                // Apply target change first if needed
                const currentTargetId = sheet?.targetId ?? null;
                const newTargetId =
                  editTargetMode === "link" ? editSelectedTargetId : null;
                if (
                  editTargetMode === "link" &&
                  newTargetId !== currentTargetId
                ) {
                  setSheetTarget.mutate({ sheetId, targetId: newTargetId });
                } else if (
                  editTargetMode === "none" &&
                  editSelectedTargetId === null &&
                  currentTargetId !== null
                ) {
                  setSheetTarget.mutate({ sheetId, targetId: null });
                }
                updateSheet.mutate({
                  id: sheetId,
                  sheetDate: editSheetDate,
                });
              }}
              disabled={!editSheetDate || updateSheet.isPending}
            >
              {updateSheet.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Target — same structured Add Target dialog used everywhere else */}
      <AddTargetDialog
        open={editCreateTargetDialogOpen}
        onClose={() => setEditCreateTargetDialogOpen(false)}
        initialOperation={
          sheet
            ? { id: sheet.operationId, name: sheetOperation?.name ?? "" }
            : undefined
        }
        onSave={async (payload: RegistryCreatePayload) => {
          const { existingAssociateId, ...rest } = payload;
          const result = existingAssociateId
            ? await createLinkedTargetForEditSheet.mutateAsync({
                ...rest,
                existingAssociateId,
              })
            : await createTargetForEditSheet.mutateAsync(rest);
          setEditSelectedTargetId(result.id);
          setEditTargetMode("link");
          return result;
        }}
      />

      {/* Edit Roster Dialog */}
      <Dialog open={editRosterOpen} onOpenChange={setEditRosterOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit TEAM</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <p className="text-xs text-muted-foreground">
              Add or remove CINs from today’s team. Mark the Team Leader and
              Running Sheet Author. The camera is added automatically for anyone
              on a row with a photo or video, or tick it if images were taken by
              that member.
            </p>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <CinInput
                  value={rosterInput}
                  onChange={setRosterInput}
                  onValidCin={cin => {
                    setRosterInput(cin);
                    setRosterInputValid(true);
                  }}
                  onInvalidCin={() => setRosterInputValid(false)}
                  placeholder="Enter CIN and press Add"
                  showValidation
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRosterCin}
                disabled={!rosterInputValid}
                className="gap-1.5 shrink-0 mt-0.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
            {allUsers &&
              myTeams.length > 0 &&
              allUsers.some(u => u.teamId != null) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    Add team:
                  </span>
                  {myTeams.map(t => (
                    <Button
                      key={t.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs font-semibold"
                      onClick={() => handleAddRosterTeam(t.id)}
                    >
                      {t.name.toUpperCase()}
                    </Button>
                  ))}
                </div>
              )}
            {rosterList.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_40px_40px_40px_32px] px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground">
                  <span className="flex items-center">CIN</span>
                  <span
                    className="flex items-center justify-center"
                    title="Team Leader"
                  >
                    <span className="text-yellow-400 text-sm">★</span>
                  </span>
                  <span
                    className="flex items-center justify-center"
                    title="Running Sheet Author"
                  >
                    <span className="text-sky-400 text-sm">✏</span>
                  </span>
                  <span
                    className="flex items-center justify-center"
                    title="Images taken"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </span>
                  <span></span>
                </div>
                {rosterList.map(entry => (
                  <div
                    key={entry.cin}
                    className="grid grid-cols-[1fr_40px_40px_40px_32px] px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <span className="flex items-center text-sm font-mono font-medium text-foreground">
                      {entry.cin}
                    </span>
                    {/* Team Leader — radio: selecting one clears all others */}
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={!!entry.isTeamLeader}
                        onCheckedChange={() =>
                          setRosterList(prev =>
                            prev.map(c => ({
                              ...c,
                              isTeamLeader:
                                c.cin === entry.cin
                                  ? !entry.isTeamLeader
                                  : false,
                            }))
                          )
                        }
                        className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                      />
                    </div>
                    {/* Author — radio: selecting one clears all others */}
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={!!entry.isAuthor}
                        onCheckedChange={() =>
                          setRosterList(prev =>
                            prev.map(c => ({
                              ...c,
                              isAuthor:
                                c.cin === entry.cin ? !entry.isAuthor : false,
                            }))
                          )
                        }
                        className="data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
                      />
                    </div>
                    {/* Images */}
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={
                          entry.hasImages || autoImageCins.has(entry.cin)
                        }
                        disabled={autoImageCins.has(entry.cin)}
                        title={
                          autoImageCins.has(entry.cin)
                            ? "Added automatically — on a row with images"
                            : "Images taken"
                        }
                        onCheckedChange={() =>
                          setRosterList(prev =>
                            prev.map(c =>
                              c.cin === entry.cin
                                ? { ...c, hasImages: !c.hasImages }
                                : c
                            )
                          )
                        }
                        className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                      />
                    </div>
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() =>
                          setRosterList(prev =>
                            prev.filter(c => c.cin !== entry.cin)
                          )
                        }
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No CINs in team yet.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRosterOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Sort before saving: TL first, then numerically
                const sorted = [...rosterList].sort((a, b) => {
                  if (a.isTeamLeader && !b.isTeamLeader) return -1;
                  if (!a.isTeamLeader && b.isTeamLeader) return 1;
                  const aNum = parseInt(a.cin, 10);
                  const bNum = parseInt(b.cin, 10);
                  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                  return a.cin.localeCompare(b.cin);
                });
                updateSheet.mutate({ id: sheetId, sheetCins: sorted });
              }}
              disabled={updateSheet.isPending}
            >
              {updateSheet.isPending ? "Saving…" : "Save TEAM"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(() => {
        const currentDupe = dupeQueue[dupeIndex];
        if (!currentDupe) return null;
        if (currentDupe.kind === "generic") {
          return (
            <EntityDuplicateDialog
              key={dupeIndex}
              open={dupeDialogOpen}
              onOpenChange={setDupeDialogOpen}
              type={currentDupe.type}
              mode="auto"
              candidate={{ label: currentDupe.label, rowCount: 0 }}
              existing={{
                label: currentDupe.match.label,
                rowCount: currentDupe.match.rowCount,
              }}
              reason={currentDupe.match.reason}
              onResolved={handleDupeDialogResolved}
            />
          );
        }
        if (currentDupe.kind === "crossOp") {
          return (
            <CrossOperationEntityAlert
              key={dupeIndex}
              warning={
                dupeDialogOpen
                  ? {
                      type: currentDupe.type,
                      label: currentDupe.label,
                      operationNames: currentDupe.operationNames,
                    }
                  : null
              }
              onAcknowledge={handleDupeDialogResolved}
            />
          );
        }
        if (currentDupe.kind === "missingLocation") {
          return (
            <MissingLocationAlert
              key={dupeIndex}
              warning={
                dupeDialogOpen
                  ? {
                      location: currentDupe.location,
                      source: currentDupe.source,
                    }
                  : null
              }
              onConfirm={() =>
                handleMissingLocationResolved(true, currentDupe.location)
              }
              onDecline={() =>
                handleMissingLocationResolved(false, currentDupe.location)
              }
            />
          );
        }
        if (currentDupe.kind === "vagueVehicle") {
          return (
            <VagueVehicleMatchAlert
              key={dupeIndex}
              warning={
                dupeDialogOpen
                  ? {
                      loserLabel: currentDupe.loserLabel,
                      winnerLabel: currentDupe.winnerLabel,
                      reason: currentDupe.reason,
                    }
                  : null
              }
              busy={vagueVehicleBusy}
              onConfirm={() => handleVagueVehicleResolved(true, currentDupe)}
              onDecline={() => handleVagueVehicleResolved(false, currentDupe)}
            />
          );
        }
        return (
          <TargetMatchDialog
            key={dupeIndex}
            open={dupeDialogOpen}
            onOpenChange={setDupeDialogOpen}
            spelling={currentDupe.rawShortForm}
            match={currentDupe.match}
            onResolved={correctSpelling =>
              handleTargetMatchResolved(
                currentDupe.rawShortForm,
                correctSpelling
              )
            }
          />
        );
      })()}
      {sheetId && <FaceMatchAckDialog sheetId={sheetId} />}
      {sheetId && sheetCheckOn && (
        <CheckRunningSheetDialog
          open={showCheckSheetDialog}
          onClose={() => setShowCheckSheetDialog(false)}
          sheetId={sheetId}
          onJumpToRow={handleJumpToCheckRow}
          onFixFinding={handleFixCheckFinding}
        />
      )}
    </Chrome>
  );
}
