import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { RS_CANONICAL_CHIP_ORDER } from "@/lib/rsChipOrder";
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
import { AttachmentLinkBadge } from "@/components/AttachmentLinkBadge";
import { LinkedEntityPills } from "@/components/LinkedEntityPills";
import { DeletePhotoButton } from "@/components/DeletePhotoButton";
import {
  EntityDuplicateDialog,
  type DedupType,
} from "@/components/EntityDuplicateDialog";
import {
  TargetMatchDialog,
  type TargetMatchCandidate,
} from "@/components/TargetMatchDialog";
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
  computeUsedBracketCodes,
  computeUsedVehicleRegos,
  type PersonMentionSuggestion,
} from "@/lib/mentionAutocomplete";
import {
  bracketCodeFromRegisteredName,
  nameWithoutBornClause,
} from "@shared/addressFormat";
import { compressAttachmentImage } from "@/lib/imageCompress";
import { buildExportPreviewCloseBar } from "@/lib/exportPreviewCloseBar";
import { setLastActiveContext } from "@/lib/lastActiveContext";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useLocation, useParams } from "wouter";
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

// Same phrase list boldImageryKeywords() highlights — used to decide whether
// to show the "attach photo" affordance on an observation cell.
const IMAGERY_PHRASE_PATTERN =
  /(PHOTOGRAPHS TAKEN|PHOTOGRAPH\/S TAKEN|PHOTOGRAPH TAKEN|VIDEO FOOTAGE TAKEN|VIDEO TAKEN|PHOTOS TAKEN|PHOTO TAKEN)/i;

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
  attachments: { id: number; url: string }[];
};

// Renders attached photos as inline <img> tags at ~1/3 cell width, matching
// the live table's proportions (see ObservationAttachments). align-items
// must be set explicitly — flex's default "stretch" forces every image in a
// row to the height of its tallest sibling, distorting a landscape photo's
// proportions the moment it sits next to a portrait one. ObservationAttachments
// avoids this with its own "items-end" on the equivalent live container;
// matching that here so a photo prints/exports at its natural aspect ratio,
// same as it already appears on the running sheet itself.
function attachmentImagesHtml(attachments: { url: string }[]): string {
  if (attachments.length === 0) return "";
  return (
    `<div style="margin-top:6px;display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px">` +
    attachments
      .map(
        a =>
          `<img src="${a.url}" style="width:33%;max-width:160px;border:1px solid #ccc;border-radius:4px" />`
      )
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

  // ── Bold imagery keywords in observation text ────────────────────────────────
  function boldImageryKeywords(text: string): string {
    const pattern =
      /(PHOTOGRAPHS TAKEN|PHOTOGRAPH\/S TAKEN|PHOTOGRAPH TAKEN|VIDEO FOOTAGE TAKEN|VIDEO TAKEN|PHOTOS TAKEN|PHOTO TAKEN)/gi;
    return text.replace(pattern, "<strong>$1</strong>");
  }

  // ── Page headers ────────────────────────────────────────────────────────────
  // Styled to match the Intelligence Profile / CTO Weekly Tasking exports:
  // a full-bleed dark-blue cover-header banner with the meta info (Operation/
  // Target/Date/Prepared By) as rounded pills, instead of the old bordered
  // label/value table.
  //
  // Strategy: use <thead> to repeat a compact version of the banner on every
  // page. Page 1: show first-page-header (full banner + imagery) above the
  // table. The <thead> banner row is hidden on page 1 via beforeprint JS.
  // Pages 2+: <thead> shows (compact banner + column headers) via
  // display:table-header-group.
  //
  // beforeprint: hides first-page-header, removes 'hide-on-print' from thead meta rows.
  // afterprint:  restores first-page-header, re-adds 'hide-on-print' to thead meta rows.

  const metaPillsHtml = `
    <span class="meta-pill">Operation <strong>${operationName}</strong></span>
    ${targetFullName ? `<span class="meta-pill">Target <strong>${targetFullName}</strong></span>` : ""}
    <span class="meta-pill">Date <strong>${dateStr}</strong></span>
    ${authorCin ? `<span class="meta-pill">Prepared by <strong>${authorCin}</strong></span>` : ""}`;

  // Cover-header banner builder — `compact` is used for the repeating
  // per-page thead version (smaller title). The imagery line is included in
  // both: only the thead version actually prints (beforeprint hides
  // first-page-header entirely and shows the print-only thead row on every
  // page), so leaving it out of the compact variant meant it never appeared
  // on a printed/PDF page at all — only in the on-screen preview.
  function coverHeaderHtml(compact: boolean): string {
    return `
      <div class="cover-header">
        <div class="brand-label">RunLog &middot; Surveillance Running Sheet</div>
        <div class="rs-title${compact ? " rs-title-sm" : ""}">WC SURVEILLANCE RUNNING SHEET</div>
        <div class="meta-pills">${metaPillsHtml}</div>
        <div class="imagery-line">Imagery taken: <strong>${imageryRowHtml}</strong></div>
      </div>`;
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
          boldImageryKeywords((row.observation ?? "").replace(/\n/g, "<br/>")) +
          attachmentImagesHtml(row.attachments);
        parts.push(`<tr style="background:${rowBg}">
          <td style="padding:6px 6px 8px;${bb};${cb};font-family:monospace;font-size:11px;white-space:nowrap">${row.time ?? ""}</td>
          <td style="padding:6px 6px 8px;${bb};${cb}">${obsHtml}</td>
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
          boldImageryKeywords((row.observation ?? "").replace(/\n/g, "<br/>")) +
          attachmentImagesHtml(row.attachments);
        parts.push(`<tr style="background:${rowBg}">
          <td style="padding:6px 6px 8px;${bb};${cb};font-family:monospace;font-size:11px;white-space:nowrap">${row.time ?? ""}</td>
          <td style="padding:6px 6px 8px;${bb};${cb}">${obsHtml}</td>
          <td style="padding:6px 6px 8px;${bb};font-size:11px"><span class="pill pill-certified">&#10003; TEAM</span></td>
        </tr>${spacerRow}`);
        continue;
      }
      // Render one <tr> per member so CIN and Certified columns align perfectly
      const memberRows = row.members
        .map((m, idx) => {
          const isSpacer = m.memberName === "__SPACE__";
          const cert = isSpacer
            ? undefined
            : row.certifications.find(c => c.memberId === m.id && c.isActive);
          const isFirst = idx === 0;
          const rowspan = row.members.length;
          const timeTd = isFirst
            ? `<td style="padding:6px 6px 8px;${bb};${cb};font-family:monospace;font-size:11px;white-space:nowrap" rowspan="${rowspan}">${row.time ?? ""}</td>`
            : "";
          const obsTd = isFirst
            ? `<td style="padding:6px 6px 8px;${bb};${cb}" rowspan="${rowspan}">${boldImageryKeywords((row.observation ?? "").replace(/\n/g, "<br/>"))}${attachmentImagesHtml(row.attachments)}</td>`
            : "";
          const isLast = idx === row.members.length - 1;
          const memberBb = isLast ? bb : "border-bottom:none";
          const pt = isFirst ? "6px" : "2px";
          const pb = isLast ? "8px" : "2px";
          if (isSpacer) {
            return `<tr style="background:${rowBg}">
            ${timeTd}${obsTd}
            <td style="padding:${pt} 6px ${pb} 6px;${memberBb};font-size:11px">&nbsp;</td>
          </tr>`;
          }
          const certifierCIN = cert
            ? "certifiedByCIN" in cert
              ? (cert as any).certifiedByCIN || cert.certifiedByName
              : cert.certifiedByName
            : null;
          const cinCertCell = cert
            ? `<span class="pill pill-certified">&#10003; ${certifierCIN}</span>`
            : `<span class="pill pill-pending">${m.memberName}</span>`;
          return `<tr style="background:${rowBg}">
          ${timeTd}${obsTd}
          <td style="padding:${pt} 6px ${pb} 6px;${memberBb};font-size:11px">${cinCertCell}</td>
        </tr>`;
        })
        .join("");
      parts.push(memberRows + spacerRow);
    }
    return parts.join("");
  })();

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>${sheetTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet"/>
  <style>
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
    .cover-header{background:#1e3a8a;color:#fff;padding:16px 20px 14px}
    .brand-label{font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#93c5fd;margin-bottom:8px}
    .rs-title{font-size:18px;font-weight:700;letter-spacing:0.03em}
    .rs-title-sm{font-size:13px}
    .meta-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    .meta-pill{display:inline-flex;align-items:center;gap:4px;padding:4px 11px;border-radius:9999px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.28);font-size:9px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:rgba(255,255,255,0.72)}
    .meta-pill strong{color:#fff;font-weight:700;text-transform:none;letter-spacing:0;margin-left:2px}
    .imagery-line{font-size:10px;margin-top:10px;color:rgba(255,255,255,0.78)}
    .imagery-line strong{color:#fff;font-weight:700}
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
    }
  </style>
  <script>
    (function(){
      /*
       * PRINT STRATEGY (browser-compatible, no Prince XML):
       *
       * Screen view:
       *   - .first-page-header: visible (title + meta + imagery)
       *   - .print-only elements: hidden
       *
       * Print view (beforeprint):
       *   - Hide .first-page-header
       *   - Show .print-only elements:
       *       #p1-header div (before the table): title + meta + IMAGERY row
       *         → sits before the log table so it only appears on page 1
       *       .thead-meta-row (inside <thead>): title + meta WITHOUT imagery
       *         → repeats on every page via thead display:table-header-group
       *
       * Result:
       *   Page 1: p1-header (title+meta+imagery) + thead(title+meta+colhdrs) + rows
       *   Pages 2+: thead(title+meta+colhdrs) + rows
       *
       * The meta table appears twice on page 1 (once in p1-header, once in thead).
       * To eliminate the duplicate: we DON'T show the thead-meta-row on page 1.
       * Since CSS can't distinguish page 1 from page 2+, we use a different split:
       *   - p1-header shows ONLY the imagery row (not the full meta)
       *   - thead-meta-row shows the FULL meta (no imagery)
       * Page 1: imagery-only div + thead(title+meta+colhdrs) + rows
       * Pages 2+: thead(title+meta+colhdrs) + rows
       * Imagery appears above the meta table on page 1 (slightly non-ideal visually
       * but correct and avoids duplication).
       */
      window.addEventListener('beforeprint', function(){
        document.getElementById('first-page-header').style.display = 'none';
        document.querySelectorAll('.print-only').forEach(function(el){
          el.style.removeProperty('display');
          el.style.setProperty('display', el.dataset.pd || 'block', 'important');
        });
      });
      window.addEventListener('afterprint', function(){
        document.getElementById('first-page-header').style.display = '';
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
  setTimeout(() => {
    win.print();
  }, 400);
}

// ─── Sortable CIN item ────────────────────────────────────────────────────────

const SPACER = "__SPACE__";

// True when a row's real (non-spacer) members are exactly the full daily
// roster — same CINs, no more, no fewer, duplicates collapsed by set
// equality. Used to collapse a fully-certified row's member list down to a
// single "TEAM" pill (MemberCell) and a single certify/uncertify control
// (CertifyCell) — never for a row that merely happens to have every member
// certified, only one that IS the whole team.
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

function SortableCinItem({
  member,
  cert,
  canEdit,
  isLocked,
  onRemove,
}: {
  member: Member;
  cert: boolean;
  canEdit: boolean;
  isLocked: boolean;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: member.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const ROW_H = "h-8";
  const isSpacer = member.memberName === SPACER;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 group/member ${ROW_H}`}
    >
      {/* Drag handle — only shown when editable and row not locked */}
      {canEdit && !isLocked && (
        <button
          {...attributes}
          {...listeners}
          className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0 p-0.5 -ml-1"
          tabIndex={-1}
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-3 h-3" />
        </button>
      )}
      {isSpacer ? (
        /* Spacer — blank row for visual separation, remove on hover */
        <span className="flex-1 min-w-0" />
      ) : (
        <span
          className={`text-sm font-mono font-medium flex-1 min-w-0 ${cert ? "text-[var(--certified-color)]" : "text-foreground"}`}
        >
          {member.memberName}
        </span>
      )}
      {canEdit && !isLocked && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 opacity-0 group-hover/member:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
              onClick={onRemove}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {isSpacer ? "Remove space" : "Remove this CIN"}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ─── Member Cell ──────────────────────────────────────────────────────────────

function MemberCell({
  row,
  canEdit,
  onAddMember,
  onRemoveMember,
  onReorderMembers,
  onManualReorder,
  rosterCins,
}: {
  row: SheetRow;
  canEdit: boolean;
  onAddMember: (rowId: number, name: string) => void;
  onRemoveMember: (memberId: number, rowId: number) => void;
  onReorderMembers: (rowId: number, orderedIds: number[]) => void;
  /** Called when the user manually drags to reorder — disables auto-sort for this row */
  onManualReorder?: (rowId: number) => void;
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

  // dnd-kit sensors — pointer (desktop) + touch with 250ms delay (mobile tap-hold)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = row.members.findIndex(m => m.id === active.id);
    const newIndex = row.members.findIndex(m => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(row.members, oldIndex, newIndex);
    // Mark this row as manually reordered so auto-sort is suppressed going forward
    onManualReorder?.(row.id);
    onReorderMembers(
      row.id,
      reordered.map(m => m.id)
    );
  };

  // A fully-certified row (isLocked) whose members are exactly the full
  // daily roster collapses to a single green "TEAM" pill instead of every
  // CIN — the individual CINs are still the real data underneath (used by
  // Witness List generation and everywhere else); this is display only.
  // Uncertifying (via CertifyCell) drops row.isLocked, which reverts this
  // automatically since the check below no longer holds.
  const showTeamCollapse =
    row.isLocked && isFullTeamMembers(row.members, rosterCins);

  return (
    <div className="flex flex-col min-w-[40px]">
      {showTeamCollapse ? (
        <div className="flex items-center gap-1.5 h-8">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500" />
          <span className="text-sm font-mono font-semibold text-emerald-500">
            TEAM
          </span>
        </div>
      ) : (
        /* CIN list — drag handles allow full reordering */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={row.members.map(m => m.id)}
            strategy={verticalListSortingStrategy}
          >
            {row.members.map(member => {
              const cert = !!row.certifications.find(
                c => c.memberId === member.id && c.isActive
              );
              return (
                <SortableCinItem
                  key={member.id}
                  member={member}
                  cert={cert}
                  canEdit={canEdit}
                  isLocked={row.isLocked}
                  onRemove={() => onRemoveMember(member.id, row.id)}
                />
              );
            })}
          </SortableContext>
        </DndContext>
      )}

      {/* Add button — sits below all CINs */}
      {canEdit &&
        !row.isLocked &&
        (adding ? (
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
                      <SelectItem
                        key={cin}
                        value={cin}
                        className="font-mono text-xs"
                      >
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
        ) : (
          <div className="flex items-center gap-3 mt-0.5">
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors w-fit"
            >
              <UserPlus className="w-3 h-3" />
              Add
            </button>
            {rosterCins && rosterCins.length > 1 && (
              <button
                onClick={addAllTeamCins}
                className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors w-fit"
                title={`Add all ${rosterCins.length} rostered CINs`}
              >
                <Users className="w-3 h-3" />
                Team
              </button>
            )}
          </div>
        ))}
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
  ) => void;
  onDelete: (id: number) => void;
  uploading: boolean;
  deletePending?: boolean;
  operationId?: number;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [linking, setLinking] = useState<{ id: number; url: string } | null>(
    null
  );
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

      // If compression failed, the original may be a HEIC/HEIF file the browser
      // can't preview (it gets converted to JPEG server-side) — skip the
      // raw-bytes preview for it rather than show a broken image icon. Preview
      // generation is fire-and-forget and doesn't block the actual upload.
      const isHeic =
        !compressed &&
        (/^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name));
      if (!isHeic) {
        const reader = new FileReader();
        reader.onload = () => setPreview(reader.result as string);
        reader.readAsDataURL(blob);
      }
      onUpload(row.id, blob, mimeType, fileName);
    } catch {
      toast.error(
        "Couldn't process that photo — try again, or use a different photo."
      );
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      {row.attachments.map(a => (
        <div
          key={a.id}
          className="relative group"
          style={{ width: "33%", minWidth: 90, maxWidth: 160 }}
        >
          <img
            src={a.url}
            alt="Attached photograph"
            className="w-full rounded border border-border cursor-zoom-in"
            onClick={() => setLightbox(a.url)}
          />
          <AttachmentLinkBadge
            linkedCount={a.linkedCount ?? 0}
            onClick={() => setLinking({ id: a.id, url: a.url })}
            positionClassName="absolute -top-1.5 -left-1.5"
            iconSize="h-3.5 w-3.5 sm:h-4 sm:w-4"
            glyphSize="h-2 w-2 sm:h-2.5 sm:w-2.5"
          />
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
            onClick={() => setLinking({ id: a.id, url: a.url })}
          />
        </div>
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
        />
      )}
    </div>
  );
}

// ─── Certify Column ───────────────────────────────────────────────────────────

function CertifyCell({
  row,
  canCertify,
  onCertify,
  onUncertify,
  onUncertifyAll,
  onDeleteRow,
  rosterCins,
}: {
  row: SheetRow;
  canCertify: boolean;
  onCertify: (rowId: number, memberId: number) => void;
  onUncertify: (rowId: number, memberId: number) => void;
  onUncertifyAll: (rowId: number) => void;
  onDeleteRow?: (rowId: number) => void;
  rosterCins?: string[];
}) {
  const total = row.members.length;
  const certified = row.certifications.filter(c => c.isActive).length;

  if (total === 0) {
    // Empty row — show delete button immediately so accidental rows can be removed
    return (
      <div className="flex flex-col items-center">
        <span className="text-xs text-muted-foreground italic">No members</span>
        {onDeleteRow && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 mt-1"
            onClick={() => onDeleteRow(row.id)}
          >
            <Trash2 className="w-3 h-3" />
            Delete row
          </Button>
        )}
      </div>
    );
  }

  // Height of each member sub-row — must match MemberCell's member row height
  const ROW_H = "h-8";

  // Mirrors MemberCell's "TEAM" pill collapse — same condition, so the two
  // columns stay row-aligned. Certifications aren't touched by this at
  // all; "Uncertify All" below still un-collapses it, same as ever.
  const showTeamCollapse =
    row.isLocked && isFullTeamMembers(row.members, rosterCins);

  return (
    <div className="flex flex-col items-center">
      {/* One row per member — same fixed height as MemberCell member rows */}
      {showTeamCollapse ? (
        <div
          className={`flex flex-col items-center justify-center ${ROW_H} w-full`}
        >
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500" />
        </div>
      ) : (
        row.members.map(m => {
          const cert = row.certifications.find(
            c => c.memberId === m.id && c.isActive
          );
          return (
            <div
              key={m.id}
              className={`flex flex-col items-center justify-center ${ROW_H} w-full`}
            >
              {/* Shield: single certify/uncertify toggle — no cross, just the shield */}
              {cert ? (
                /* Certified: green shield + certifier CIN side by side */
                <div className="flex items-center justify-center gap-1">
                  {canCertify && !row.isLocked ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 shrink-0 text-emerald-500 hover:text-red-400 hover:bg-red-400/10"
                          onClick={() => onUncertify(row.id, m.id)}
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Uncertify {m.memberName}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500" />
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs font-mono font-medium text-emerald-500 cursor-default">
                        {(cert as any).certifiedByCIN || cert.certifiedByName}
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
                          {format(
                            new Date(cert.certifiedAt),
                            "MMM d, yyyy HH:mm:ss"
                          )}
                        </span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                /* Uncertified: red shield centred, "Certify" label below */
                <div className="flex flex-col items-center justify-center gap-0">
                  {canCertify && !row.isLocked ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 shrink-0 text-red-500 hover:text-emerald-500 hover:bg-emerald-500/10"
                          onClick={() => onCertify(row.id, m.id)}
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Certify {m.memberName}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <ShieldCheck className="w-4 h-4 shrink-0 text-red-500" />
                  )}
                  <span className="text-[10px] leading-none text-red-500 font-medium">
                    Certify
                  </span>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Summary — at the bottom */}
      <div className="flex items-center justify-center gap-1.5 mt-1 w-full">
        {row.isLocked ? (
          <Badge
            variant="outline"
            className="gap-1 text-[var(--certified-color)] border-[var(--locked-border)] bg-[var(--locked-bg)] text-xs py-0 px-1.5"
          >
            <Lock className="w-2.5 h-2.5" />
            Locked
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {certified}/{total} certified
          </span>
        )}
      </div>

      {/* Footer actions */}
      {row.isLocked && canCertify && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 mt-1"
              onClick={() => onUncertifyAll(row.id)}
            >
              <Unlock className="w-3 h-3" />
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
          className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 mt-1"
          onClick={() => onDeleteRow(row.id)}
        >
          <Trash2 className="w-3 h-3" />
          Delete row
        </Button>
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
          <span className="text-muted-foreground/50 italic text-xs">
            Set time
          </span>
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
              <span className="text-[11px] font-semibold tracking-widest text-foreground font-mono">
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
}) {
  const [editing, setEditing] = useState(false);
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

  function handleObservationInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setDraft(val);
    const cursorPos = e.target.selectionStart ?? val.length;

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

  /** Auto-expand shortcut triggers on Space or Tab */
  const handleShortcutKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (!shortcuts || (e.key !== " " && e.key !== "Tab")) return;
    const textarea = e.currentTarget;
    const pos = textarea.selectionStart ?? 0;
    const textBefore = draft.slice(0, pos);
    // Find the last word before the cursor
    const match = textBefore.match(/(\S+)$/);
    if (!match) return;
    const word = match[1].toLowerCase();
    const expansion = shortcuts[word];
    if (!expansion) return;
    e.preventDefault();
    const before = textBefore.slice(0, textBefore.length - match[1].length);
    const after = draft.slice(pos);
    const newText = before + expansion + " " + after;
    setDraft(newText);
    // Restore cursor position after the expansion
    requestAnimationFrame(() => {
      const newPos = before.length + expansion.length + 1;
      textarea.setSelectionRange(newPos, newPos);
    });
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
            onFocus={notifyObservationFocus}
            onBlur={() => {
              // A click on a suggestion fires its own onMouseDown (which
              // preventDefault's) before this blur — so by the time blur
              // actually runs here, mentionWord is only still set if focus
              // left for some other reason, in which case the dropdown
              // should just close rather than block the save.
              closeMentionDropdown();
              closeVehicleMentionDropdown();
              notifyObservationBlur();
              const conv = convertGoogleAddresses(draft);
              if (conv !== draft) {
                setDraft(conv);
                commit(conv);
              } else {
                commit(draft);
              }
            }}
            onKeyDown={e => {
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
        <span className="text-muted-foreground/50 italic text-xs">
          {placeholder}
        </span>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ── SortableChip — dnd-kit sortable chip for the target field chip row ──────
function SortableChip({
  id,
  label,
  value,
  showValue,
  onInsert,
}: {
  id: string;
  label: string;
  value?: string | null;
  showValue: boolean;
  onInsert: () => void;
}) {
  const isMobile = useIsMobile();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      <button
        onMouseDown={e => e.preventDefault()}
        onClick={onInsert}
        title={`Insert: ${value}`}
        className="flex items-center gap-1 pl-1 pr-2 py-0.5 rounded border border-primary/30 bg-primary/8 hover:bg-primary/15 active:scale-95 transition-all select-none cursor-pointer"
      >
        {/* Grip handle — desktop only */}
        {!isMobile && (
          <span
            {...attributes}
            {...listeners}
            className="flex flex-col gap-[2.5px] opacity-40 shrink-0 cursor-grab active:cursor-grabbing px-0.5 touch-none"
            onMouseDown={e => e.stopPropagation()}
          >
            <span className="flex gap-[2.5px]">
              <span className="w-[3px] h-[3px] rounded-full bg-primary" />
              <span className="w-[3px] h-[3px] rounded-full bg-primary" />
            </span>
            <span className="flex gap-[2.5px]">
              <span className="w-[3px] h-[3px] rounded-full bg-primary" />
              <span className="w-[3px] h-[3px] rounded-full bg-primary" />
            </span>
          </span>
        )}
        <span className="text-[10px] font-bold text-primary uppercase tracking-wide">
          {label}
        </span>
        {showValue && value && (
          <span className="text-[10px] font-mono text-foreground/80 max-w-[160px] truncate">
            {value}
          </span>
        )}
      </button>
    </div>
  );
}

export default function SheetDetail() {
  const { id } = useParams<{ id: string }>();
  const sheetId = parseInt(id ?? "0", 10);
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const utils = trpc.useUtils();
  const { isOnline, syncStatus } = useOffline();
  // Sensors for chip drag-to-reorder (separate from CinRow sensors)
  const chipSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  );

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

  const { data: entityChips } = trpc.row.entityChips.useQuery(
    { sheetId },
    {
      enabled: isAuthenticated && !!sheetId && isOnline,
      refetchInterval: isOnline ? 10000 : false,
    }
  );

  const invalidateRows = useCallback(() => {
    utils.row.list.invalidate({ sheetId });
    utils.row.entityChips.invalidate({ sheetId });
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
          _addRowOnline.mutate(input);
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

  // Appends " (<location>)" to the end of the observation, ahead of any
  // trailing sentence punctuation — used when the officer confirms the
  // MissingLocationAlert prompt. Deliberately WITH brackets, unlike the
  // vehicle-arriving chip's "subsequent mention" convention
  // (isAddressAlreadyMentioned in server/db.ts): that convention exists for
  // sheet-wide readability and doesn't need this row's own text to carry a
  // recognisable entity. This prompt exists specifically because
  // extractEntitiesFromText only registers an address for THIS row when it
  // sees a "(ShortForm)" bracket — bracket-less text here would leave the
  // row exactly as unlocated as before, and the prompt would keep firing
  // on every subsequent save (confirmed bug, see missingLocationSuggestion
  // test coverage for looksLikeUnlocatedVehiclePresenceRow).
  function appendLocationSuggestion(text: string, location: string): string {
    const trimmed = text.trimEnd();
    const bracket = `(${location})`;
    const trailingPunct = trimmed.match(/([.:])\s*$/);
    if (trailingPunct) {
      return `${trimmed.slice(0, -1)} ${bracket}${trailingPunct[1]}`;
    }
    return `${trimmed} ${bracket}.`;
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
    !isClosed &&
    (user?.role === "member" ||
      user?.role === "admin" ||
      user?.role === "observer");
  const canCertify =
    !isClosed && (user?.role === "member" || user?.role === "admin");

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
  // Shortcut chip order for the target panel — persisted per sheet in localStorage
  // Canonical default chip order — used when no saved order exists in localStorage
  // Generates: SC, HBF, V1F, V1, V2F, V2, V3F, V3, V4F, V4 ... (up to 8 vehicles), then fixed shortcuts, then DEP/ARR, then wild fields
  const CANONICAL_CHIP_ORDER = RS_CANONICAL_CHIP_ORDER;
  const [targetFieldOrder, setTargetFieldOrder] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem(`runsheet_field_order_${sheetId}`);
      if (s) {
        const saved: string[] = JSON.parse(s);
        // Migrate: ensure ARR is present after DEP in any saved order
        let migrated = [...saved];
        if (!migrated.includes("ARR")) {
          const depIdx = migrated.indexOf("DEP");
          if (depIdx >= 0) {
            migrated.splice(depIdx + 1, 0, "ARR");
          } else {
            migrated.push("ARR");
          }
          localStorage.setItem(
            `runsheet_field_order_${sheetId}`,
            JSON.stringify(migrated)
          );
        }
        return migrated;
      }
    } catch {}
    return CANONICAL_CHIP_ORDER;
  });
  const handleChipDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setTargetFieldOrder(prev => {
        // Ensure both chips are in the order array — new shortcuts/wildcards may not be
        let base = [...prev];
        if (!base.includes(active.id as string))
          base = [...base, active.id as string];
        if (!base.includes(over.id as string))
          base = [...base, over.id as string];
        const oldIndex = base.indexOf(active.id as string);
        const newIndex = base.indexOf(over.id as string);
        const next = arrayMove(base, oldIndex, newIndex);
        try {
          localStorage.setItem(
            `runsheet_field_order_${sheetId}`,
            JSON.stringify(next)
          );
        } catch {}
        return next;
      });
    },
    [sheetId]
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

  const handleAddRosterTeam = (teamKey: "TEAM1" | "TEAM2" | "PTT") => {
    if (!allUsers) {
      toast.error("User list not available");
      return;
    }
    const members = allUsers.filter(u => u.team === teamKey);
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
        `Added ${added} member${added !== 1 ? "s" : ""} from ${teamKey.replace("TEAM", "TEAM ")}`
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

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex items-center gap-2">
            {sheetLoading ? (
              <Skeleton className="h-7 w-64" />
            ) : (
              <>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-foreground truncate">
                    {sheet?.title}
                  </h1>
                </div>
                {sheet && (
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
                    {isClosed && (
                      <Badge
                        variant="secondary"
                        className="gap-1.5 bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0"
                      >
                        <LockKeyhole className="w-3 h-3" />
                        CLOSED
                      </Badge>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
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
                  No internet connection. Changes are saved locally and will
                  sync automatically when you reconnect.
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
                        canCloseSheet && closeSheet.mutate({ id: sheetId })
                      }
                      disabled={!canCloseSheet || closeSheet.isPending}
                    >
                      <LockKeyhole className="w-4 h-4" />
                      Close Sheet
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
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={exportFetching}
              onClick={handleExport}
            >
              <Download className="w-4 h-4" />
              {exportFetching ? "Preparing..." : "Export PDF"}
            </Button>
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
            onClick={() => navigate(`/summary/${sheetId}`, { replace: true })}
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
          <div className="mb-4 rounded-lg border border-border bg-card/60 overflow-hidden">
            {/* Header row — same structure as target panel: collapse button + separate pencil button */}
            <div className="flex items-center">
              <button
                className="flex-1 flex items-center gap-2 px-4 py-3 hover:bg-muted/20 active:bg-muted/30 transition-colors select-none text-left min-w-0"
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
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate flex-1">
                  TEAM — CERTIFY
                </span>
                {/* Certified count badge */}
                {parsedRoster.length > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground mr-1">
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
                  className="px-3 py-3 text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 border-l border-border/30"
                  onClick={openEditRoster}
                  title="Edit TEAM"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* Collapsible CIN badges */}
            {teamPanelExpanded && (
              <div className="px-4 pb-3">
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
                        {entry.hasImages && (
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
          (entityChips && entityChips.length > 0)) &&
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
            // Build wild fields
            const wildFieldItems: { label: string; value: string | null }[] =
              [];
            if (t) {
              try {
                const wfs: Array<{ label: string; value: string }> = JSON.parse(
                  (t as any).wildFields ?? "[]"
                );
                wfs.forEach(wf => {
                  if (wf.value)
                    wildFieldItems.push({ label: wf.label, value: wf.value });
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
                  ...wildFieldItems,
                  { label: "DEP", value: t.dep },
                  { label: "ARR", value: t.arr },
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
            const hasEntityChips = !!(entityChips && entityChips.length > 0);
            return (
              <div className="mb-4 rounded-lg border border-border bg-card/60 overflow-hidden">
                {/* Header — always visible. Tapping the main area toggles collapse; pencil navigates to edit */}
                <div className="flex items-center">
                  <button
                    className="flex-1 flex items-center gap-2 px-4 py-3 hover:bg-muted/20 active:bg-muted/30 transition-colors select-none text-left min-w-0"
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
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate flex-1">
                      {hasTarget ? `TARGET — ${t!.name}` : "SHORTCUTS"}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${targetPanelExpanded ? "" : "-rotate-90"}`}
                    />
                  </button>
                  {/* Edit pencil — independent tap zone, doesn't trigger collapse */}
                  {hasTarget && (
                    <button
                      className="px-3 py-3 text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 border-l border-border/30"
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
                    // Apply saved order to the fields list
                    const visibleFields = fields.filter(f => f.value);
                    const isWildcard = (lbl: string) => /^#\d+$/.test(lbl);
                    const nonWildVisible = visibleFields.filter(
                      f => !isWildcard(f.label)
                    );
                    const wildcardVisible = visibleFields.filter(f =>
                      isWildcard(f.label)
                    );
                    const orderedNonWild =
                      targetFieldOrder.length > 0
                        ? [
                            ...(targetFieldOrder
                              .filter(lbl => !isWildcard(lbl))
                              .map(lbl =>
                                nonWildVisible.find(f => f.label === lbl)
                              )
                              .filter(Boolean) as typeof visibleFields),
                            ...nonWildVisible.filter(
                              f => !targetFieldOrder.includes(f.label)
                            ),
                          ]
                        : nonWildVisible;
                    // Wildcards always at the end, in their saved order
                    const orderedWild =
                      targetFieldOrder.length > 0
                        ? [
                            ...(targetFieldOrder
                              .filter(isWildcard)
                              .map(lbl =>
                                wildcardVisible.find(f => f.label === lbl)
                              )
                              .filter(Boolean) as typeof visibleFields),
                            ...wildcardVisible.filter(
                              f => !targetFieldOrder.includes(f.label)
                            ),
                          ]
                        : wildcardVisible;
                    const orderedFields = [...orderedNonWild, ...orderedWild];
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
                              "DEP",
                              "ARR",
                            ]);
                            return (
                              <DndContext
                                sensors={chipSensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleChipDragEnd}
                              >
                                <SortableContext
                                  items={orderedFields.map(f => f.label)}
                                  strategy={horizontalListSortingStrategy}
                                >
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
                                            el.selectionEnd ?? el.value.length;
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
                                      const isVnShort = /^V\d+$/.test(f.label);
                                      const isVnFull = /^V\d+F$/.test(f.label);
                                      const isStandard =
                                        !isVnShort &&
                                        (shortcutFolderLabels.has(f.label) ||
                                          TRIGGER_ONLY_LABELS.has(f.label) ||
                                          isVnFull);
                                      return (
                                        <SortableChip
                                          key={f.label}
                                          id={f.label}
                                          label={f.label}
                                          value={f.value}
                                          showValue={isVnShort || !isStandard}
                                          onInsert={insertIntoFocused}
                                        />
                                      );
                                    })}
                                  </div>
                                </SortableContext>
                              </DndContext>
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
                                const end = el.selectionEnd ?? el.value.length;
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
                                  className="px-2 py-0.5 rounded border border-violet-500/30 bg-violet-500/5 text-violet-400 hover:bg-violet-500/15 active:scale-95 transition-all select-none cursor-pointer"
                                >
                                  <span className="text-[10px] font-mono max-w-[140px] truncate">
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
            );
          })()}

        {/* Search bar + sort toggle + add row */}
        <div className="mb-4 flex items-center gap-2">
          {/* Add Row — moved here, left of sort toggle, hidden when sheet is closed */}
          {!isClosed && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2 shrink-0"
              onClick={() => addRow.mutate({ sheetId })}
              disabled={addRow.isPending}
            >
              <Plus className="w-4 h-4" />
              Add Row
            </Button>
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
        <div className="rounded-xl border border-border overflow-hidden bg-card">
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
              <table className="running-sheet-table w-full">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="w-32">Time</th>
                    <th>Observation</th>
                    <th className="w-36">CIN</th>
                    <th className="w-24 text-center">Certify</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 && searchQuery ? (
                    <tr>
                      <td
                        colSpan={4}
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
                                  <td colSpan={4} className="py-1.5 px-4">
                                    <div className="flex items-center gap-3">
                                      <div className="flex-1 h-px bg-border" />
                                      <span className="text-[10px] font-semibold tracking-widest text-muted-foreground whitespace-nowrap">
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
                            className={
                              row.isLocked ? "row-locked" : "hover:bg-accent/20"
                            }
                          >
                            {/* Time */}
                            <td>
                              <TimePickerCell
                                value={row.time}
                                locked={row.isLocked}
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

                            {/* Observation */}
                            <td>
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
                                  locked={row.isLocked}
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
                                      //   3. Full first line as last resort
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
                                        // 3. Last resort: full text (server will try to geocode it)
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
                                      const enrichAddress = (
                                        addr: string
                                      ): string =>
                                        knownAddressMap.get(
                                          addr.toLowerCase()
                                        ) ?? addr;

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
                                />
                              )}
                              <ObservationAttachments
                                row={row}
                                canEdit={canEdit && !row.isLocked}
                                onUpload={(rowId, blob, mimeType, fileName) =>
                                  uploadAttachment.mutate({
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

                            {/* Member / CIN */}
                            <td>
                              <MemberCell
                                row={row}
                                canEdit={canEdit}
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
                                onReorderMembers={(rowId, orderedIds) =>
                                  reorderMember.mutate({ rowId, orderedIds })
                                }
                                onManualReorder={markManualReorder}
                                rosterCins={rosterCinList}
                              />
                            </td>

                            {/* Certify */}
                            <td>
                              <CertifyCell
                                row={row}
                                canCertify={canCertify}
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
                autoFocus
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
        onSave={async (payload: RegistryCreatePayload) => {
          const { existingAssociateId, ...rest } = payload;
          const result = existingAssociateId
            ? await createLinkedTargetForEditSheet.mutateAsync({
                ...rest,
                existingAssociateId,
                linkToOperationId: sheet?.operationId,
              })
            : await createTargetForEditSheet.mutateAsync({
                ...rest,
                linkToOperationId: sheet?.operationId,
              });
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
              Running Sheet Author. Tick the camera icon if images were taken by
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
            {allUsers && allUsers.some(u => u.team) && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Add team:</span>
                {(["TEAM1", "TEAM2", "PTT"] as const).map(t => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs font-semibold"
                    onClick={() => handleAddRosterTeam(t)}
                  >
                    {t === "TEAM1"
                      ? "TEAM 1"
                      : t === "TEAM2"
                        ? "TEAM 2"
                        : "PTT"}
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
                        checked={entry.hasImages}
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
    </DashboardLayout>
  );
}
