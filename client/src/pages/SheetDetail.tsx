import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DashboardLayout from "@/components/DashboardLayout";
import { useIsMobile } from "@/hooks/useMobile";
import CinInput from "@/components/CinInput";
import { LinkAttachmentDialog } from "@/components/LinkAttachmentDialog";
import { AttachmentLinkBadge } from "@/components/AttachmentLinkBadge";
import { EntityDuplicateDialog, type DedupType } from "@/components/EntityDuplicateDialog";
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
  LockKeyhole,
  LockKeyholeOpen,
  ChevronLeft,
  ChevronRight,
  Tag,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useObservationFocus } from "@/contexts/ObservationFocusContext";
import { convertGoogleAddresses, extractShortAddress } from "@/lib/addressFormat";
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
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  ShadingType,
  VerticalAlign,
} from "docx";
import { useOffline } from "@/contexts/OfflineContext";
import {
  saveCachedSheet,
  getCachedSheet,
  addPendingRowToCachedSheet,
  editPendingRowInCachedSheet,
  deletePendingRowInCachedSheet,
  enqueueSyncAction,
  type CachedSheet,
} from "@/lib/offlineStore";

type Member = { id: number; rowId: number; memberName: string; sortOrder: number; createdAt: Date };
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
  rowId: number;
  url: string;
  mimeType: string;
  caption: string | null;
  uploadedByCIN: string | null;
  createdAt: Date;
  linkedCount?: number;
  linkedCategories?: string[];
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
const IMAGERY_PHRASE_PATTERN = /(PHOTOGRAPHS TAKEN|PHOTOGRAPH\/S TAKEN|PHOTOGRAPH TAKEN|VIDEO FOOTAGE TAKEN|VIDEO TAKEN|PHOTOS TAKEN|PHOTO TAKEN)/i;

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
  certifications: { memberId: number; certifiedByName: string; certifiedAt: number; isActive: boolean }[];
  attachments: { id: number; url: string }[];
};

// Renders attached photos as inline <img> tags at ~1/3 cell width, matching
// the live table's proportions (see ObservationAttachments).
function attachmentImagesHtml(attachments: { url: string }[]): string {
  if (attachments.length === 0) return "";
  return `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">` +
    attachments.map((a) => `<img src="${a.url}" style="width:33%;max-width:160px;border:1px solid #ccc;border-radius:4px" />`).join("") +
    `</div>`;
}

type OperationMeta = {
  name: string;
  promisNumber?: string | null;
  imsNumber?: string | null;
  investigationUnit?: string | null;
  createdAt: Date;
} | null;

type CinEntry = { cin: string; hasImages: boolean; isTeamLeader?: boolean; isAuthor?: boolean };

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
    .toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: PERTH_TIME_ZONE })
    .toUpperCase();
}

function getTodayPerthYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PERTH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function exportToPDF(
  sheetTitle: string,
  rows: ExportRow[],
  operation: OperationMeta,
  sheetCinsRaw: string | null,
  sheetCreatedAt: Date,
  targetFullName?: string | null,
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
      const aNum = parseInt(a.cin, 10); const bNum = parseInt(b.cin, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.cin.localeCompare(b.cin);
    });
  } catch { cinRoster = []; }

  // ── Page header (repeats on every page) ─────────────────────────────────────
  const operationName = operation?.name ?? "";
  const dateStr = format(new Date(sheetCreatedAt), "d MMMM yyyy");

  // Derive the author CIN from the roster (isAuthor flag)
  const authorEntry = cinRoster.find((c) => c.isAuthor);
  const authorCin = authorEntry?.cin ?? null;

  // Find the most recent active certification belonging to the author CIN
  let preparedByCell = "";
  if (authorCin) {
    let latestCert: { certifiedByCIN?: string; certifiedByName: string; certifiedAt: number } | null = null;
    for (const row of rows) {
      for (const cert of row.certifications) {
        if (!cert.isActive) continue;
        const certCin = ('certifiedByCIN' in cert ? (cert as any).certifiedByCIN : null) || cert.certifiedByName;
        if (certCin === authorCin) {
          if (!latestCert || cert.certifiedAt > latestCert.certifiedAt) {
            latestCert = cert as any;
          }
        }
      }
    }
    if (latestCert) {
      const certCin = ('certifiedByCIN' in latestCert ? (latestCert as any).certifiedByCIN : null) || latestCert.certifiedByName;
      const certTime = format(new Date(latestCert.certifiedAt), "d MMMM yyyy h:mmaaa");
      preparedByCell = `<span style='color:#22c55e;white-space:nowrap'>&#10003; ${certCin} &nbsp;<span style='color:#555;font-size:10px'>${certTime}</span></span>`;
    } else {
      // Author exists but hasn't certified yet — show CIN without tick
      preparedByCell = `<span style='color:#000'>${authorCin}</span>`;
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
    const hasImagery = IMAGERY_PHRASES.some((p) => obs.includes(p));
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
  const uniqueImageryEntries = imageryEntries.filter((e) => {
    const key = `${e.cin}|${e.time}`;
    if (seenImagery.has(key)) return false;
    seenImagery.add(key);
    return true;
  });
  const imageryRowHtml = uniqueImageryEntries.length > 0
    ? uniqueImageryEntries.map((e) => `${e.cin} (${e.time})`).join(", ")
    : "Nil";

  // ── Bold imagery keywords in observation text ────────────────────────────────
  function boldImageryKeywords(text: string): string {
    const pattern = /(PHOTOGRAPHS TAKEN|PHOTOGRAPH\/S TAKEN|PHOTOGRAPH TAKEN|VIDEO FOOTAGE TAKEN|VIDEO TAKEN|PHOTOS TAKEN|PHOTO TAKEN)/gi;
    return text.replace(pattern, "<strong>$1</strong>");
  }

  // ── Page headers ────────────────────────────────────────────────────────────
  // Strategy: use <thead> to repeat the meta table (without imagery) on every page.
  // Page 1: show first-page-header (title + meta + imagery) above the table.
  //         The <thead> meta rows are hidden on page 1 via beforeprint JS.
  // Pages 2+: <thead> shows (title + meta + column headers) via display:table-header-group.
  //
  // beforeprint: hides first-page-header, removes 'hide-on-print' from thead meta rows.
  // afterprint:  restores first-page-header, re-adds 'hide-on-print' to thead meta rows.

  const metaRowsHtml = `
    <tr><td class="meta-label">OPERATION:</td><td class="meta-value">${operationName}</td></tr>
    <tr><td class="meta-label">TARGET:</td><td class="meta-value">${targetFullName ?? ""}</td></tr>
    <tr><td class="meta-label">DATE:</td><td class="meta-value">${dateStr}</td></tr>
    ${authorCin ? `<tr><td class="meta-label">PREPARED BY:</td><td class="meta-value">${preparedByCell}</td></tr>` : ""}`;

  // First-page header block (shown on screen and on page 1 during print)
  const pageHeader = `
    <div class="first-page-header" id="first-page-header">
      <div class="page-title">WC SURVEILLANCE RUNNING SHEET</div>
      <table class="meta-table"><tbody>
        ${metaRowsHtml}
        <tr><td class="meta-label">IMAGERY:</td><td class="meta-value">${imageryRowHtml}</td></tr>
      </tbody></table>
    </div>`;

  // ── Running sheet table ──────────────────────────────────────────────────────
  // Spacer row inserted after each log entry for breathing room
  const spacerRow = `<tr><td colspan="3" style="padding:0;height:8px;border:none;background:transparent"></td></tr>`;

  // ── Build day-offset map for export rows (rowDate-aware, falls back to inference) ──
  const exportDayOffsetMap = new Map<number, number>();
  {
    const timedByRowNumber = [...rows]
      .filter((r) => r.timeMinutes != null)
      .sort((a, b) => a.rowNumber - b.rowNumber);
    const exportRowDates = timedByRowNumber.map((r) => r.rowDate).filter((d): d is string => !!d);
    const exportMinRowDate = exportRowDates.length > 0 ? exportRowDates.slice().sort()[0] : null;
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
      if (prevEff >= 0 && eff < prevEff - 120) { day++; }
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
        const rowOnDay = rows.find((r) => (exportDayOffsetMap.get(r.id) ?? 0) === day && r.rowDate);
        let divLabel: string;
        if (rowOnDay?.rowDate) {
          divLabel = formatPerthDateLabel(rowOnDay.rowDate);
        } else {
          const divDate = new Date(sheetCreatedAt);
          divDate.setDate(divDate.getDate() + day);
          divLabel = divDate.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: PERTH_TIME_ZONE }).toUpperCase();
        }
        parts.push(dateDividerRow(divLabel));
      }
      if (row.timeMinutes != null) prevDay = day;
      const rowBg = row.isLocked ? lockedBg : "transparent";
      // Only the very last rendered row of the whole sheet gets the card's rounded bottom
      // corners. Every row is followed by an invisible spacer <tr style="border:none"> for
      // breathing room, which is always tbody's true last-child and whose inline style always
      // wins over any stylesheet rule — so CSS structural selectors (:last-child / a class on
      // the <tr>) can never reliably find "the last real row" here. Compute the right border
      // per cell directly in JS instead, keyed off this flag.
      const isLastDataRow = row === rows[rows.length - 1];
      const edgeBottom = isLastDataRow ? "border-bottom:1.5px solid #1e3a8a" : bb;
      if (row.members.length === 0) {
        const obsHtml = boldImageryKeywords((row.observation ?? "").replace(/\n/g, "<br/>")) + attachmentImagesHtml(row.attachments);
        const leftRadius = isLastDataRow ? ";border-bottom-left-radius:10px" : "";
        const rightRadius = isLastDataRow ? ";border-bottom-right-radius:10px" : "";
        parts.push(`<tr style="background:${rowBg}">
          <td class="col-time" style="padding:6px 6px 8px;${edgeBottom}${leftRadius};${cb};font-family:monospace;font-size:11px;white-space:nowrap">${row.time ?? ""}</td>
          <td style="padding:6px 6px 8px;${edgeBottom};${cb}">${obsHtml}</td>
          <td style="padding:6px 6px 8px;${edgeBottom}${rightRadius};font-size:11px"></td>
        </tr>${spacerRow}`);
        continue;
      }
      // Render one <tr> per member so CIN and Certified columns align perfectly
      const memberRows = row.members.map((m, idx) => {
        const isSpacer = m.memberName === "__SPACE__";
        const cert = isSpacer ? undefined : row.certifications.find((c) => c.memberId === m.id && c.isActive);
        const isFirst = idx === 0;
        const rowspan = row.members.length;
        const timeLeftRadius = isLastDataRow ? ";border-bottom-left-radius:10px" : "";
        const timeTd = isFirst
          ? `<td class="col-time" style="padding:6px 6px 8px;${edgeBottom}${timeLeftRadius};${cb};font-family:monospace;font-size:11px;white-space:nowrap" rowspan="${rowspan}">${row.time ?? ""}</td>`
          : "";
        const obsTd = isFirst
          ? `<td style="padding:6px 6px 8px;${edgeBottom};${cb}" rowspan="${rowspan}">${boldImageryKeywords((row.observation ?? "").replace(/\n/g, "<br/>"))}${attachmentImagesHtml(row.attachments)}</td>`
          : "";
        const isLast = idx === row.members.length - 1;
        const certRightRadius = isLastDataRow && isLast ? ";border-bottom-right-radius:10px" : "";
        const memberBb = isLast ? `${edgeBottom}${certRightRadius}` : "border-bottom:none";
        const pt = isFirst ? "6px" : "2px";
        const pb = isLast ? "8px" : "2px";
        if (isSpacer) {
          return `<tr style="background:${rowBg}">
            ${timeTd}${obsTd}
            <td style="padding:${pt} 6px ${pb} 6px;${memberBb};font-size:11px">&nbsp;</td>
          </tr>`;
        }
        const certifierCIN = cert ? ('certifiedByCIN' in cert ? (cert as any).certifiedByCIN || cert.certifiedByName : cert.certifiedByName) : null;
        const cinCertCell = cert
          ? `<span class="pill pill-certified">&#10003; ${certifierCIN}</span>`
          : `<span class="pill pill-pending">${m.memberName}</span>`;
        return `<tr style="background:${rowBg}">
          ${timeTd}${obsTd}
          <td style="padding:${pt} 6px ${pb} 6px;${memberBb};font-size:11px">${cinCertCell}</td>
        </tr>`;
      }).join("");
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
    .page-title{font-size:20px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;text-align:center;margin-bottom:1.2em}
    .page-title-sm{font-size:15px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;text-align:center;margin-bottom:0.5em;margin-top:4px}
    /* Rounded blue card — wraps the meta info block only (page-1 header and the repeating page header).
       Deliberately NOT used around the log table itself: the log table draws its own card border
       directly on its cells (below) so it floats independently of the meta card above it, on every page. */
    .rs-card{border:1.5px solid #1e3a8a;border-radius:10px;overflow:hidden}
    /* Meta info table — light blue label cells */
    .meta-table{width:100%;border-collapse:collapse;table-layout:auto}
    .meta-table tr:not(:last-child) td{border-bottom:1px solid #c7d5ee}
    .meta-label{padding:5px 8px;font-weight:700;font-size:11px;white-space:nowrap;background:#dbeafe;border-right:1px solid #93c5fd;text-transform:uppercase;width:1%;color:#1e3a8a}
    .meta-value{padding:5px 8px;font-size:11px;color:#000;background:#fff}
    /* Log table — floats as its own rounded card, independent of the meta card above it.
       The card border is drawn directly on the header/body cells (not a wrapping div) so the
       rounded top corners reappear at the top of the table's own box on every printed page,
       since the header row repeats via thead but the meta card above it does not share this border. */
    /* border-collapse:separate (not collapse) — Chrome silently ignores border-radius on
       table cells under collapse, which is what was making the log table's corners square. */
    table.log-table{width:100%;border-collapse:separate;border-spacing:0;table-layout:auto}
    col.c-time{width:80px}
    col.c-obs{width:auto}
    col.c-cert{width:1%}
    .log-table thead tr:last-of-type th{background:#dbeafe;color:#1e3a8a;font-weight:700;padding:6px;text-align:left;
       border-top:1.5px solid #1e3a8a;border-bottom:2px solid #1e3a8a;border-right:1px solid #c7d5ee}
    .log-table thead tr:last-of-type th:first-child{border-left:1.5px solid #1e3a8a;border-top-left-radius:10px}
    .log-table thead tr:last-of-type th:last-child{border-right:1.5px solid #1e3a8a;border-top-right-radius:10px}
    .log-table td{vertical-align:top;word-break:break-word;overflow:hidden;color:#000;border-right:1px solid #e2e9f6;border-bottom:1px solid #eef2fb}
    .log-table td:last-child{white-space:nowrap;word-break:normal;border-right:none;width:1%}
    /* Target the actual Time column by class, not :first-child — member rows after the first
       don't repeat the (rowspanned) Time/Observation cells, so the CIN-certified <td> ends up
       as the sole/first child of its own <tr> and would wrongly catch a :first-child rule. */
    .log-table tbody td.col-time{border-left:1.5px solid #1e3a8a}
    .log-table tbody td:last-child{border-right:1.5px solid #1e3a8a}
    /* Bottom edge (border + rounded corners) is computed per-cell directly in the row-building
       JS below, not via CSS — every row is followed by an invisible spacer <tr style="border:
       none"> for breathing room, which is always tbody's actual last-child and whose inline
       style always wins over any stylesheet rule, so no CSS selector could reliably target
       "the last real row" here. */
    /* thead wrapper cell — no border/padding/bg so the meta card floats free of the log table's own border */
    .thead-meta-cell{padding:0 !important;border:none !important;background:transparent !important}
    .thead-meta-inner{padding-bottom:10px}
    /* Certification pills */
    .pill{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:9999px;font-size:10px;font-weight:700;white-space:nowrap}
    .pill-certified{background:#d1fae5;color:#059669;border:1px solid #6ee7b7}
    .pill-pending{background:#fee2e2;color:#dc2626;border:1px solid #fca5a5}
    /* Date divider — centered pill instead of a full-width bar */
    .date-divider-row td{background:#f1f6ff;text-align:center;padding:6px 0}
    .date-divider-pill{display:inline-block;padding:3px 14px;border-radius:9999px;background:#1e3a8a;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.06em}
    /* Screen: show first-page-header (with imagery); hide print-only blocks */
    .first-page-header{text-align:left;margin-bottom:10px}
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
  <!-- SCREEN VIEW: full header with imagery — hidden during print -->
  <div class="first-page-header" id="first-page-header">
    <div class="page-title">WC SURVEILLANCE RUNNING SHEET</div>
    <div class="rs-card">
      <table class="meta-table"><tbody>
        ${metaRowsHtml}
        <tr><td class="meta-label">IMAGERY:</td><td class="meta-value">${imageryRowHtml}</td></tr>
      </tbody></table>
    </div>
  </div>
  <table class="log-table">
    <colgroup>
      <col class="c-time"/>
      <col class="c-obs"/>
      <col class="c-cert"/>
    </colgroup>
    <thead>
      <!-- Full header repeats on every page via thead display:table-header-group.
           Hidden on screen (first-page-header shows instead); shown during print by JS.
           Includes imagery row so every page has the complete header. -->
      <tr class="print-only" data-pd="table-row">
        <td colspan="3" class="thead-meta-cell">
          <div class="thead-meta-inner">
            <div class="page-title-sm">WC SURVEILLANCE RUNNING SHEET</div>
            <div class="rs-card">
              <table class="meta-table"><tbody>
                ${metaRowsHtml}
                <tr><td class="meta-label">IMAGERY:</td><td class="meta-value">${imageryRowHtml}</td></tr>
              </tbody></table>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <th>Time</th>
        <th>Observation</th>
        <th>CIN Certified</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <!-- Close button: visible on screen, hidden during print -->
  <div id="close-bar" style="position:fixed;bottom:0;left:0;right:0;padding:12px 16px;background:#1e293b;display:flex;justify-content:flex-end;gap:12px;z-index:9999;box-shadow:0 -2px 8px rgba(0,0,0,0.4)">
    <button onclick="window.close()" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:10px 24px;font-size:14px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif">&#x2715; Close Preview</button>
    <button onclick="window.print()" style="background:#22c55e;color:#fff;border:none;border-radius:6px;padding:10px 24px;font-size:14px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif">&#128438; Print / Save PDF</button>
  </div>
  <div style="height:60px"></div>
  <style>#close-bar{display:flex !important} @media print{#close-bar{display:none !important}}</style>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) { toast.error("Pop-up blocked. Please allow pop-ups and try again."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// ─── Word Export ─────────────────────────────────────────────────────────────

async function exportToWord(
  sheetTitle: string,
  rows: ExportRow[],
  operation: OperationMeta,
  sheetCinsRaw: string | null,
  sheetCreatedAt: Date,
  targetFullName?: string | null,
) {
  // Parse TEAM roster — sort: TL first, then numerically
  let cinRoster: CinEntry[] = [];
  try {
    const raw: CinEntry[] = sheetCinsRaw ? JSON.parse(sheetCinsRaw) : [];
    cinRoster = [...raw].sort((a, b) => {
      if (a.isTeamLeader && !b.isTeamLeader) return -1;
      if (!a.isTeamLeader && b.isTeamLeader) return 1;
      const aNum = parseInt(a.cin, 10); const bNum = parseInt(b.cin, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.cin.localeCompare(b.cin);
    });
  } catch { cinRoster = []; }

  const operationName = operation?.name ?? "";
  const promisNumber = operation?.promisNumber ?? "";
  const imsNumber = operation?.imsNumber ?? "";
  const investigationUnit = operation?.investigationUnit ?? "";
  const dateStr = format(new Date(sheetCreatedAt), "d MMMM yyyy");

  // Derive author CIN
  const authorEntry = cinRoster.find((c) => c.isAuthor);
  const authorCin = authorEntry?.cin ?? null;

  // Find most recent active certification for the author
  let preparedByText = authorCin ?? "";
  if (authorCin) {
    let latestCert: { certifiedByName: string; certifiedAt: number } | null = null;
    for (const row of rows) {
      for (const cert of row.certifications) {
        if (!cert.isActive) continue;
        const certCin = ('certifiedByCIN' in cert ? (cert as any).certifiedByCIN : null) || cert.certifiedByName;
        if (certCin === authorCin) {
          if (!latestCert || cert.certifiedAt > latestCert.certifiedAt) latestCert = cert;
        }
      }
    }
    if (latestCert) {
      const certCin = ('certifiedByCIN' in latestCert ? (latestCert as any).certifiedByCIN : null) || latestCert.certifiedByName;
      const certTime = format(new Date(latestCert.certifiedAt), "d MMMM yyyy h:mmaaa");
      preparedByText = `${certCin} (certified ${certTime})`;
    }
  }

  // Imagery entries
  const IMAGERY_PHRASES = ["PHOTOGRAPHS TAKEN","PHOTOGRAPH/S TAKEN","PHOTOGRAPH TAKEN","VIDEO TAKEN","VIDEO FOOTAGE TAKEN","PHOTOS TAKEN","PHOTO TAKEN"];
  const imageryEntries: { cin: string; time: string }[] = [];
  for (const row of rows) {
    const obs = (row.observation ?? "").toUpperCase();
    const hasImagery = IMAGERY_PHRASES.some((p) => obs.includes(p));
    if (hasImagery && row.time) {
      for (const m of row.members) {
        if (m.memberName !== "__SPACE__") imageryEntries.push({ cin: m.memberName, time: row.time });
      }
    }
  }
  const seenImagery = new Set<string>();
  const uniqueImageryEntries = imageryEntries.filter((e) => {
    const key = `${e.cin}|${e.time}`;
    if (seenImagery.has(key)) return false;
    seenImagery.add(key);
    return true;
  });
  const imageryText = uniqueImageryEntries.length > 0
    ? uniqueImageryEntries.map((e) => `${e.cin} (${e.time})`).join(", ")
    : "Nil";

  // Team roster string
  const rosterText = cinRoster.length > 0
    ? cinRoster.map((c) => c.cin + (c.isTeamLeader ? " (TL)" : "")).join(", ")
    : "";

  // ── Shared border/shading helpers ───────────────────────────────────────────
  const FONT = "Roboto";
  const BODY_SIZE = 22; // 11pt (docx size is in half-points)
  const thinBorder = { style: BorderStyle.SINGLE, size: 6, color: "94A3B8" };
  const outerBorder = { style: BorderStyle.SINGLE, size: 12, color: "334155" };
  const headerShading = { type: ShadingType.SOLID, color: "DBEAFE", fill: "DBEAFE" };

  // ── Meta table (cover info) ──────────────────────────────────────────────────
  function metaRow(label: string, value: string) {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 22, type: WidthType.PERCENTAGE },
          shading: headerShading,
          borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [new TextRun({ text: label, font: FONT, bold: true, size: BODY_SIZE, color: "000000" })] })],
        }),
        new TableCell({
          width: { size: 78, type: WidthType.PERCENTAGE },
          borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [new TextRun({ text: value, font: FONT, size: BODY_SIZE, color: "000000" })] })],
        }),
      ],
    });
  }

  const metaRows = [
    metaRow("OPERATION:", operationName),
    ...(targetFullName ? [metaRow("TARGET:", targetFullName)] : []),
    metaRow("DATE:", dateStr),
    ...(promisNumber ? [metaRow("PROMIS:", promisNumber)] : []),
    ...(imsNumber ? [metaRow("IMS:", imsNumber)] : []),
    ...(investigationUnit ? [metaRow("UNIT:", investigationUnit)] : []),
    ...(preparedByText ? [metaRow("PREPARED BY:", preparedByText)] : []),
    ...(rosterText ? [metaRow("TEAM:", rosterText)] : []),
    metaRow("IMAGERY:", imageryText),
  ];

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: outerBorder, bottom: outerBorder, left: outerBorder, right: outerBorder,
      insideHorizontal: thinBorder, insideVertical: thinBorder,
    },
    rows: metaRows,
  });

  // ── Running sheet table ──────────────────────────────────────────────────────
  function thCell(text: string, widthPct: number) {
    return new TableCell({
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      shading: headerShading,
      borders: { top: outerBorder, bottom: outerBorder, left: thinBorder, right: thinBorder },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text, font: FONT, bold: true, size: BODY_SIZE, color: "000000" })] })],
    });
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      thCell("Time", 10),
      thCell("Observation", 72),
      thCell("CIN Certified", 18),
    ],
  });

  // ── Build day-offset map for Word export rows (rowDate-aware, falls back to inference) ──
  const wordDayOffsetMap = new Map<number, number>();
  {
    const timedByRowNumber = [...rows]
      .filter((r) => r.timeMinutes != null)
      .sort((a, b) => a.rowNumber - b.rowNumber);
    const wordRowDates = timedByRowNumber.map((r) => r.rowDate).filter((d): d is string => !!d);
    const wordMinRowDate = wordRowDates.length > 0 ? wordRowDates.slice().sort()[0] : null;
    // First pass: rowDate (highest priority) or stored dayOffset (legacy)
    for (const r of timedByRowNumber) {
      if (r.rowDate && wordMinRowDate) {
        const anchor = ymdToPerthMs(wordMinRowDate);
        const rowDay = ymdToPerthMs(r.rowDate);
        wordDayOffsetMap.set(r.id, Math.round((rowDay - anchor) / 86400000));
      } else if (r.dayOffset && r.dayOffset !== 0) {
        wordDayOffsetMap.set(r.id, r.dayOffset);
      }
    }
    // Second pass: infer for rows with no explicit date/offset
    let day = 0;
    let prevEff = -1;
    for (const r of timedByRowNumber) {
      if (wordDayOffsetMap.has(r.id)) {
        prevEff = r.timeMinutes! + wordDayOffsetMap.get(r.id)! * 1440;
        day = wordDayOffsetMap.get(r.id)!;
        continue;
      }
      const mins = r.timeMinutes!;
      const eff = mins + day * 1440;
      if (prevEff >= 0 && eff < prevEff - 120) { day++; }
      wordDayOffsetMap.set(r.id, day);
      prevEff = mins + day * 1440;
    }
  }

  const dataRows: TableRow[] = [];
  let wordPrevDay = -1;
  for (const row of rows) {
    const wordDay = wordDayOffsetMap.get(row.id) ?? 0;
    if (row.timeMinutes != null && wordDay > wordPrevDay && wordPrevDay >= 0) {
      // Prefer an explicit rowDate from a row on that day
      const wordRowOnDay = rows.find((r) => (wordDayOffsetMap.get(r.id) ?? 0) === wordDay && r.rowDate);
      let divLabel: string;
      if (wordRowOnDay?.rowDate) {
        divLabel = formatPerthDateLabel(wordRowOnDay.rowDate);
      } else {
        const divDate = new Date(sheetCreatedAt);
        divDate.setDate(divDate.getDate() + wordDay);
        divLabel = divDate.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: PERTH_TIME_ZONE }).toUpperCase();
      }
      dataRows.push(new TableRow({
        children: [
          new TableCell({
            columnSpan: 3,
            shading: { type: ShadingType.SOLID, color: "1E3A5F", fill: "1E3A5F" },
            borders: { top: outerBorder, bottom: outerBorder, left: outerBorder, right: outerBorder },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `── ${divLabel} ──`, font: FONT, bold: true, size: 18, color: "93C5FD" })],
            })],
          }),
        ],
      }));
    }
    if (row.timeMinutes != null) wordPrevDay = wordDay;
    const timeText = row.time ?? "";
    const obsText = row.observation ?? "";

    if (row.members.length === 0) {
      dataRows.push(new TableRow({
        children: [
          new TableCell({
            width: { size: 10, type: WidthType.PERCENTAGE },
            borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
            children: [new Paragraph({ children: [new TextRun({ text: timeText, size: 18, font: "Courier New", color: "000000" })] })],
          }),
          new TableCell({
            width: { size: 72, type: WidthType.PERCENTAGE },
            borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
            children: obsText.split("\n").map((line) => new Paragraph({ children: [new TextRun({ text: line, font: FONT, size: BODY_SIZE, color: "000000" })] })),
          }),
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
            children: [new Paragraph({ children: [] })],
          }),
        ],
      }));
    } else {
      // One row per member, time+obs span via rowspan emulation (repeat in first member row only)
      row.members.forEach((m, idx) => {
        const isSpacer = m.memberName === "__SPACE__";
        const cert = isSpacer ? undefined : row.certifications.find((c) => c.memberId === m.id && c.isActive);
        const certifierCIN = cert ? (('certifiedByCIN' in cert ? (cert as any).certifiedByCIN : null) || cert.certifiedByName) : null;
        const certText = cert
          ? `\u2713 ${certifierCIN} ${format(new Date(cert.certifiedAt), "dd/MM/yy h:mmaaa")}`
          : (isSpacer ? "" : `${m.memberName} Pending`);
        const certColor = cert ? "22C55E" : (isSpacer ? "000000" : "EF4444");

        // For multi-member rows, only show time and obs on the first member row
        const timePara = idx === 0
          ? [new Paragraph({ children: [new TextRun({ text: timeText, size: 18, font: "Courier New", color: "000000" })] })]
          : [new Paragraph({ children: [] })];
        const obsPara = idx === 0
          ? obsText.split("\n").map((line) => new Paragraph({ children: [new TextRun({ text: line, font: FONT, size: BODY_SIZE, color: "000000" })] }))
          : [new Paragraph({ children: [] })];

        dataRows.push(new TableRow({
          children: [
            new TableCell({
              width: { size: 10, type: WidthType.PERCENTAGE },
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
              children: timePara,
            }),
            new TableCell({
              width: { size: 72, type: WidthType.PERCENTAGE },
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
              children: obsPara,
            }),
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder },
              children: [new Paragraph({ children: [new TextRun({ text: certText, font: FONT, size: 18, color: certColor, bold: !!cert })] })],
            }),
          ],
        }));
      });
    }
  }

  const logTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: outerBorder, bottom: outerBorder, left: outerBorder, right: outerBorder,
      insideHorizontal: thinBorder, insideVertical: thinBorder,
    },
    rows: [headerRow, ...dataRows],
  });

  // ── Build document ───────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 }, // ~2cm margins
        },
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "WC SURVEILLANCE RUNNING SHEET", font: FONT, bold: true, size: 32, color: "000000", allCaps: true })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "PROTECTED", font: FONT, bold: true, size: 24, color: "DC2626", allCaps: true })],
          spacing: { after: 240 },
        }),
        metaTable,
        new Paragraph({ children: [], spacing: { after: 240 } }),
        logTable,
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "PROTECTED", font: FONT, bold: true, size: 24, color: "DC2626", allCaps: true })],
          spacing: { before: 240 },
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sheetTitle.replace(/[^a-zA-Z0-9\s_-]/g, "")}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Sortable CIN item ────────────────────────────────────────────────────────

const SPACER = "__SPACE__";

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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: member.id });
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
        <span className={`text-sm font-mono font-medium flex-1 min-w-0 ${cert ? "text-[var(--certified-color)]" : "text-foreground"}`}>
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
          <TooltipContent side="top" className="text-xs">{isSpacer ? "Remove space" : "Remove this CIN"}</TooltipContent>
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
    // If user typed 'team' (case-insensitive), expand to all roster CINs
    if (val.toLowerCase() === "team" && rosterCins && rosterCins.length > 0) {
      rosterCins.forEach((cin) => onAddMember(row.id, cin));
      setNewName("");
      setAdding(false);
      return;
    }
    onAddMember(row.id, val);
    setNewName("");
    setAdding(false);
  };

  // dnd-kit sensors — pointer (desktop) + touch with 250ms delay (mobile tap-hold)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = row.members.findIndex((m) => m.id === active.id);
    const newIndex = row.members.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(row.members, oldIndex, newIndex);
    // Mark this row as manually reordered so auto-sort is suppressed going forward
    onManualReorder?.(row.id);
    onReorderMembers(row.id, reordered.map((m) => m.id));
  };

  return (
    <div className="flex flex-col min-w-[40px]">
      {/* CIN list — drag handles allow full reordering */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={row.members.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          {row.members.map((member) => {
            const cert = !!row.certifications.find((c) => c.memberId === member.id && c.isActive);
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

      {/* Add button — sits below all CINs */}
      {canEdit && !row.isLocked && (
        adding ? (
          <div className="flex flex-col gap-1.5 mt-0.5">
            {rosterCins && rosterCins.length > 0 ? (
              /* Dropdown mode: pick from team roster — Space at top, duplicates allowed */
              <div className="flex items-center gap-1.5">
                <Select
                  value={newName}
                  onValueChange={(v) => {
                    if (v === "__all__") {
                      // Add sequentially to preserve team order (leader first, then ascending CIN)
                      const addSequentially = (cins: string[], idx: number) => {
                        if (idx >= cins.length) { setAdding(false); return; }
                        onAddMember(row.id, cins[idx]);
                        setTimeout(() => addSequentially(cins, idx + 1), 80);
                      };
                      addSequentially(rosterCins, 0);
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
                    <SelectItem value={SPACER} className="text-xs text-muted-foreground italic">
                      — Space —
                    </SelectItem>
                    {rosterCins.map((cin) => (
                      <SelectItem key={cin} value={cin} className="font-mono text-xs">{cin}</SelectItem>
                    ))}
                    {rosterCins.length > 1 && (
                      <SelectItem value="__all__" className="text-xs font-medium text-primary">
                        ★ Add all team CINs
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => { setAdding(false); setNewName(""); }}
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
                  onValidCin={(cin) => { setNewName(cin); setNewNameValid(true); }}
                  onInvalidCin={() => setNewNameValid(false)}
                  showValidation
                  className="h-7 text-xs px-2"
                />
                <Button size="icon" className="h-7 w-7 shrink-0" onClick={handleAdd} disabled={!newNameValid}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mt-0.5 w-fit"
          >
            <UserPlus className="w-3 h-3" />
            Add
          </button>
        )
      )}
    </div>
  );
}

// ─── Observation Photo Attachments ─────────────────────────────────────────────
// Shown inline under the observation text whenever it contains an imagery
// phrase (e.g. "PHOTOGRAPH/S TAKEN" from the PT shortcut). Photos render
// directly in the cell at ~1/3 width — same proportion used in the PDF export.

// Attachment photos are for display only, not evidentiary originals, so every
// upload is downscaled/re-encoded client-side to a consistent small JPEG —
// this also sidesteps the iOS HEIC→JPEG-on-share size blowup (see the 25MB
// cap below) since everything gets normalized regardless of source format.
const ATTACHMENT_MAX_DIMENSION = 1920;
const ATTACHMENT_JPEG_QUALITY = 0.82;

function drawToJpegBlob(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number
): Promise<Blob | null> {
  let width = srcWidth;
  let height = srcHeight;
  if (width > ATTACHMENT_MAX_DIMENSION || height > ATTACHMENT_MAX_DIMENSION) {
    const scale = ATTACHMENT_MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", ATTACHMENT_JPEG_QUALITY));
}

async function compressAttachmentImage(
  file: File
): Promise<{ blob: Blob; mimeType: string; fileName: string } | null> {
  const fileName = file.name.replace(/\.[^.]+$/, "") + ".jpg";

  // Primary path — fast, works for the vast majority of photos.
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const blob = await drawToJpegBlob(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    if (blob) return { blob, mimeType: "image/jpeg", fileName };
  } catch {
    // fall through to the <img>-based fallback below
  }

  // Fallback — Portrait-mode HEIC photos (embedded depth map, a multi-image
  // container) are known to fail createImageBitmap on iOS Safari even though
  // the browser can still render them fine via a plain <img>. Without this,
  // compression silently gives up and the full-size original (often several
  // MB) gets base64-JSON-uploaded as-is, which is much more likely to fail
  // outright on a weak mobile connection.
  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("image element failed to load"));
        el.src = objectUrl;
      });
      const blob = await drawToJpegBlob(img, img.naturalWidth, img.naturalHeight);
      if (blob) return { blob, mimeType: "image/jpeg", fileName };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    // fall through
  }

  return null; // both paths failed — fall back to uploading the original file untouched
}

function ObservationAttachments({
  row,
  canEdit,
  onUpload,
  onDelete,
  uploading,
}: {
  row: SheetRow;
  canEdit: boolean;
  onUpload: (rowId: number, blob: Blob, mimeType: string, fileName: string) => void;
  onDelete: (id: number) => void;
  uploading: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<number | null>(null);
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

      if (blob.size > 25 * 1024 * 1024) { toast.error("Photo must be under 25 MB."); return; }

      // If compression failed, the original may be a HEIC/HEIF file the browser
      // can't preview (it gets converted to JPEG server-side) — skip the
      // raw-bytes preview for it rather than show a broken image icon. Preview
      // generation is fire-and-forget and doesn't block the actual upload.
      const isHeic = !compressed && (/^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name));
      if (!isHeic) {
        const reader = new FileReader();
        reader.onload = () => setPreview(reader.result as string);
        reader.readAsDataURL(blob);
      }
      onUpload(row.id, blob, mimeType, fileName);
    } catch {
      toast.error("Couldn't process that photo — try again, or use a different photo.");
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      {row.attachments.map((a) => (
        <div key={a.id} className="relative group" style={{ width: "33%", minWidth: 90, maxWidth: 160 }}>
          <img
            src={a.url}
            alt="Attached photograph"
            className="w-full rounded border border-border cursor-zoom-in"
            onClick={() => setLightbox(a.url)}
          />
          <AttachmentLinkBadge
            linkedCount={a.linkedCount ?? 0}
            linkedCategories={a.linkedCategories}
            onClick={() => setLinkingId(a.id)}
            positionClassName="absolute -top-1.5 -left-1.5"
            iconSize="h-3.5 w-3.5 sm:h-4 sm:w-4"
            glyphSize="h-2 w-2 sm:h-2.5 sm:w-2.5"
          />
          {canEdit && (
            <button
              onClick={() => onDelete(a.id)}
              title="Delete photo"
              className="absolute -top-1.5 -right-1.5 h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 transition-opacity"
            >
              <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            </button>
          )}
        </div>
      ))}
      {preview && uploading && (
        <div style={{ width: "33%", minWidth: 90, maxWidth: 160 }}>
          <img src={preview} alt="Uploading…" className="w-full rounded border border-border opacity-50" />
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
          <input ref={inputRef} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={handleFile} />
        </>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Attached photograph" className="max-w-full max-h-full rounded shadow-2xl" />
        </div>
      )}

      {linkingId !== null && (
        <LinkAttachmentDialog
          attachmentId={linkingId}
          open={linkingId !== null}
          onOpenChange={(open) => { if (!open) setLinkingId(null); }}
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
}: {
  row: SheetRow;
  canCertify: boolean;
  onCertify: (rowId: number, memberId: number) => void;
  onUncertify: (rowId: number, memberId: number) => void;
  onUncertifyAll: (rowId: number) => void;
  onDeleteRow?: (rowId: number) => void;
}) {
  const total = row.members.length;
  const certified = row.certifications.filter((c) => c.isActive).length;

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

  return (
    <div className="flex flex-col items-center">
      {/* One row per member — same fixed height as MemberCell member rows */}
      {row.members.map((m) => {
        const cert = row.certifications.find((c) => c.memberId === m.id && c.isActive);
        return (
          <div key={m.id} className={`flex flex-col items-center justify-center ${ROW_H} w-full`}>
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
                      <span className="font-medium">Certified by {(cert as any).certifiedByCIN || cert.certifiedByName}</span>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(cert.certifiedAt), "MMM d, yyyy HH:mm:ss")}
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
                <span className="text-[10px] leading-none text-red-500 font-medium">Certify</span>
              </div>
            )}
          </div>
        );
      })}

      {/* Summary — at the bottom */}
      <div className="flex items-center justify-center gap-1.5 mt-1 w-full">
        {row.isLocked ? (
          <Badge variant="outline" className="gap-1 text-[var(--certified-color)] border-[var(--locked-border)] bg-[var(--locked-bg)] text-xs py-0 px-1.5">
            <Lock className="w-2.5 h-2.5" />
            Locked
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">{certified}/{total} certified</span>
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
          <TooltipContent side="top" className="text-xs">Remove all certifications and unlock row</TooltipContent>
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
  sheetCreatedAt,
  onSave,
}: {
  value: string | null;
  locked: boolean;
  dayOffset?: number;
  rowDate?: string | null;
  inferredRowDate?: string | null;
  sheetHasCrossedMidnight?: boolean;
  sheetCreatedAt?: number | null;
  onSave: (display: string, minutes: number, dayOffset: number, rowDate?: string) => void;
}) {
  // Derive the RS creation date in Perth (YYYY-MM-DD) — used as the default rowDate
  const sheetCreatedYmd = useMemo(() => {
    if (!sheetCreatedAt) return getTodayPerthYmd();
    return new Intl.DateTimeFormat("en-CA", { timeZone: PERTH_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(sheetCreatedAt));
  }, [sheetCreatedAt]);

  // Parse existing value into hour/minute/period; default to current time when empty
  const parsed = useMemo(() => {
    if (!value) {
      const now = new Date();
      const h24 = now.getHours();
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return { hour: String(h12), minute: String(now.getMinutes()).padStart(2, "0"), period: h24 < 12 ? "AM" : "PM" };
    }
    const m = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return { hour: "12", minute: "00", period: "AM" };
    return { hour: String(parseInt(m[1], 10)), minute: m[2].padStart(2, "0"), period: m[3].toUpperCase() };
  }, [value]);

  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState(parsed.period);
  const [localDayOffset, setLocalDayOffset] = useState(dayOffset);
  // Default to the explicit rowDate, then inferred, then RS creation date
  const [selectedRowDate, setSelectedRowDate] = useState<string>(() => rowDate ?? inferredRowDate ?? sheetCreatedYmd);
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
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
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
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

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
        onClick={() => setOpen((v) => !v)}
      >
        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {value || <span className="text-muted-foreground/50 italic text-xs">Set time</span>}
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-xl p-3">
          {/* Time selectors row + Now + Date inline */}
          <div className="flex items-center gap-1.5 mb-2 flex-nowrap">
            {/* Hour */}
            <Select
              value={hour}
              onOpenChange={(o) => setSelectOpen(o)}
              onValueChange={(v) => setHour(v)}
            >
              <SelectTrigger className="w-16 h-8 text-sm font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hours.map((h) => (
                  <SelectItem key={h} value={h} className="font-mono text-foreground">
                    {String(parseInt(h, 10)).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground font-mono text-lg">:</span>
            {/* Minute */}
            <Select
              value={minute}
              onOpenChange={(o) => setSelectOpen(o)}
              onValueChange={(v) => setMinute(v)}
            >
              <SelectTrigger className="w-16 h-8 text-sm font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {minutes.map((m) => (
                  <SelectItem key={m} value={m} className="font-mono text-foreground">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* AM/PM */}
            <Select
              value={period}
              onOpenChange={(o) => setSelectOpen(o)}
              onValueChange={(v) => setPeriod(v)}
            >
              <SelectTrigger className="w-16 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AM" className="text-foreground">AM</SelectItem>
                <SelectItem value="PM" className="text-foreground">PM</SelectItem>
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
              onClick={() => setShowDateStepper((v) => !v)}
            >
              Date
            </Button>
          </div>
          {/* Date stepper — only visible when Date button is active */}
          {showDateStepper && (
            <div className="flex items-center justify-between mb-2 px-1 py-1 rounded-md border border-border/70 bg-muted/30">
              <button
                className="px-2 py-0.5 text-base font-bold text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setSelectedRowDate(addDaysToYmd(selectedRowDate, -1))}
              >◀</button>
              <span className="text-[11px] font-semibold tracking-widest text-foreground font-mono">
                {formatPerthDateLabel(selectedRowDate)}
              </span>
              <button
                className="px-2 py-0.5 text-base font-bold text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setSelectedRowDate(addDaysToYmd(selectedRowDate, 1))}
              >▶</button>
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
}: {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  value: string | null;
  locked: boolean;
  multiline?: boolean;
  placeholder?: string;
  onSave: (val: string) => void;
  shortcuts?: Record<string, string>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const { notifyObservationFocus, notifyObservationBlur } = useObservationFocus();

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
  const handleShortcutKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            // Auto-convert Google Maps addresses pasted into the observation field
            const pasted = e.clipboardData.getData("text");
            const converted = convertGoogleAddresses(pasted);
            if (converted !== pasted) {
              e.preventDefault();
              const ta = e.currentTarget;
              const start = ta.selectionStart ?? draft.length;
              const end = ta.selectionEnd ?? draft.length;
              const newText = draft.slice(0, start) + converted + draft.slice(end);
              setDraft(newText);
            }
          }}
          onFocus={notifyObservationFocus}
          onBlur={() => { notifyObservationBlur(); const conv = convertGoogleAddresses(draft); if (conv !== draft) { setDraft(conv); commit(conv); } else { commit(draft); } }}
          onKeyDown={(e) => {
            handleShortcutKeyDown(e as React.KeyboardEvent<HTMLTextAreaElement>);
            if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
          }}
          className="text-sm min-h-[60px] resize-none"
          placeholder={placeholder}
        />
      );
    }
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
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
      {value || <span className="text-muted-foreground/50 italic text-xs">{placeholder}</span>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ── SortableChip — dnd-kit sortable chip for the target field chip row ──────
function SortableChip({ id, label, value, showValue, onInsert }: {
  id: string; label: string; value?: string | null; showValue: boolean; onInsert: () => void;
}) {
  const isMobile = useIsMobile();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      <button
        onMouseDown={(e) => e.preventDefault()}
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
            onMouseDown={(e) => e.stopPropagation()}
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
        <span className="text-[10px] font-bold text-primary uppercase tracking-wide">{label}</span>
        {showValue && value && <span className="text-[10px] font-mono text-foreground/80 max-w-[160px] truncate">{value}</span>}
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
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  // Offline-aware local row state — used when offline
  const [offlineRows, setOfflineRows] = useState<typeof rows | null>(null);
  const [hasPendingOfflineChanges, setHasPendingOfflineChanges] = useState(false);

  // Per-session manual reorder tracking — suppresses auto-sort for rows the user has dragged
  // (client-only; resets on page reload, which is acceptable since sortOrder is persisted)
  const manuallyReorderedRowsRef = useRef<Set<number>>(new Set());
  const markManualReorder = (rowId: number) => manuallyReorderedRowsRef.current.add(rowId);
  // Ref to the auto-sort function — set after parsedRoster and reorderMember are available
  const autoSortRef = useRef<((rowId: number) => void) | null>(null);

  const { data: sheet, isLoading: sheetLoading } = trpc.sheet.get.useQuery(
    { id: sheetId },
    { enabled: isAuthenticated && !!sheetId }
  );

  const { data: rows, isLoading: rowsLoading } = trpc.row.list.useQuery(
    { sheetId },
    { enabled: isAuthenticated && !!sheetId && isOnline, refetchInterval: isOnline ? 10000 : false }
  );

  const { data: entityChips } = trpc.row.entityChips.useQuery(
    { sheetId },
    { enabled: isAuthenticated && !!sheetId && isOnline, refetchInterval: isOnline ? 10000 : false }
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
      rows: rows.map((r) => ({
        id: r.id,
        rowNumber: r.rowNumber,
        time: r.time ?? undefined,
        observation: r.observation ?? undefined,
        members: r.members.map((m) => m.memberName).filter((n) => n !== "__SPACE__"),
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
    getCachedSheet(sheetId).then((cached) => {
      if (!cached) return;
      // Convert cached rows back to the expected shape
      const converted = cached.rows.map((r) => ({
        id: r.id,
        sheetId,
        rowNumber: r.rowNumber,
        time: r.time ?? null,
        observation: r.observation ?? null,
        timeMinutes: null,
        isLocked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        members: r.members.map((name, idx) => ({ id: idx, rowId: r.id, memberName: name, sortOrder: idx, createdAt: new Date() })),
        certifications: [] as NonNullable<typeof rows>[0]["certifications"],
      })) as unknown as NonNullable<typeof rows>;
      setOfflineRows(converted);
      const hasPending = cached.rows.some((r) => r.pendingLocalId || r.pendingEdit || r.pendingDelete);
      setHasPendingOfflineChanges(hasPending);
    }).catch(() => {});
  }, [isOnline, sheetId]);

  const _addRowOnline = trpc.row.create.useMutation({
    onSuccess: invalidateRows,
    onError: (e) => toast.error(e.message),
  });

  const _updateRowOnline = trpc.row.update.useMutation({
    onSuccess: invalidateRows,
    onError: (e) => toast.error(e.message),
  });

  const _deleteRowOnline = trpc.row.delete.useMutation({
    onSuccess: invalidateRows,
    onError: (e) => toast.error(e.message),
  });

  // Offline-aware wrappers — queue locally when offline, call server when online
  const addRow = useMemo(() => ({
    isPending: _addRowOnline.isPending,
    mutate: (input: { sheetId: number; time?: string; timeMinutes?: number; observation?: string }) => {
      if (isOnline) {
        _addRowOnline.mutate(input);
      } else {
        addPendingRowToCachedSheet(input.sheetId, { rowNumber: Date.now(), members: [] }).then((localId) => {
          enqueueSyncAction({ type: "addRowToServerSheet", localId, payload: { sheetServerId: input.sheetId, members: [] } });
          // Refresh offline rows from cache
          getCachedSheet(input.sheetId).then((cached) => {
            if (!cached) return;
            const converted = cached.rows.map((r) => ({
              id: r.id, sheetId: input.sheetId, rowNumber: r.rowNumber,
              time: r.time ?? null, observation: r.observation ?? null, timeMinutes: null,
              isLocked: false, createdAt: new Date(), updatedAt: new Date(),
              members: r.members.map((name, idx) => ({ id: idx, rowId: r.id, memberName: name, sortOrder: idx, createdAt: new Date() })),
              certifications: [] as NonNullable<typeof rows>[0]["certifications"],
            })) as unknown as NonNullable<typeof rows>;
            setOfflineRows(converted);
            setHasPendingOfflineChanges(true);
          });
        }).catch(() => toast.error("Failed to save row locally"));
      }
    },
  }), [isOnline, _addRowOnline, rows]);

  const updateRow = useMemo(() => ({
    isPending: _updateRowOnline.isPending,
    mutate: (input: { id: number; time?: string; timeMinutes?: number; dayOffset?: number; rowDate?: string; observation?: string }) => {
      if (isOnline) {
        _updateRowOnline.mutate(input);
      } else {
        const updates: { time?: string; observation?: string } = {};
        if (input.time !== undefined) updates.time = input.time;
        if (input.observation !== undefined) updates.observation = input.observation;
        editPendingRowInCachedSheet(sheetId, input.id, updates).then(async () => {
          // Look up the row's pendingLocalId to determine how to enqueue
          const cached = await getCachedSheet(sheetId);
          if (!cached) return;
          const cachedRow = cached.rows.find((r) => r.id === input.id);
          if (input.id > 0) {
            // Existing server row — enqueue direct update
            enqueueSyncAction({ type: "updateServerRow", serverId: input.id, payload: updates });
          } else if (cachedRow?.pendingLocalId) {
            // New offline row — enqueue update keyed by pendingLocalId
            enqueueSyncAction({ type: "updatePendingRow", pendingLocalId: cachedRow.pendingLocalId, payload: updates });
          }
          // Refresh offline rows display
          const converted = cached.rows.map((r) => ({
            id: r.id, sheetId, rowNumber: r.rowNumber,
            time: r.time ?? null, observation: r.observation ?? null, timeMinutes: null,
            isLocked: false, createdAt: new Date(), updatedAt: new Date(),
            members: r.members.map((name, idx) => ({ id: idx, rowId: r.id, memberName: name, sortOrder: idx, createdAt: new Date() })),
            certifications: [] as NonNullable<typeof rows>[0]["certifications"],
          })) as unknown as NonNullable<typeof rows>;
          setOfflineRows(converted);
          setHasPendingOfflineChanges(true);
        }).catch(() => {});
      }
    },
  }), [isOnline, _updateRowOnline, sheetId, rows]);

  // ── Live possible-duplicate check on observation save ──────────────────────
  // Before an edited observation actually saves, extract its entities the same
  // way the Intelligence folder does and fuzzy-check each one against every
  // existing entity. Any near-miss matches are queued and shown one at a time
  // via EntityDuplicateDialog; the real save only fires once the queue (which
  // may be empty) is drained, so this never silently loses an edit.
  type RowSaveInput = { id: number; time?: string; timeMinutes?: number; dayOffset?: number; rowDate?: string; observation?: string };
  interface PendingDupe {
    type: DedupType;
    label: string;
    match: { label: string; rowCount: number; reason: string };
  }
  const [dupeQueue, setDupeQueue] = useState<PendingDupe[]>([]);
  const [dupeIndex, setDupeIndex] = useState(0);
  const [dupeDialogOpen, setDupeDialogOpen] = useState(false);
  const [pendingSaveInput, setPendingSaveInput] = useState<RowSaveInput | null>(null);

  const updateRowWithDupeCheck = useCallback(async (input: RowSaveInput) => {
    // Offline, or no meaningful observation text — nothing to fuzzy-check, save directly.
    if (!isOnline || !input.observation || !input.observation.trim()) {
      updateRow.mutate(input);
      return;
    }
    try {
      const extracted = await utils.intelligence.previewEntities.fetch({ text: input.observation });
      const relevant = extracted.filter((e) => e.type !== "unknown");
      const queue: PendingDupe[] = [];
      const seen = new Set<string>();
      for (const e of relevant) {
        const dedupeKey = `${e.type}::${e.shortForm.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const matches = await utils.intelligence.checkPossibleDuplicates.fetch({
          type: e.type as DedupType,
          label: e.shortForm,
        });
        if (matches.length > 0) {
          queue.push({ type: e.type as DedupType, label: e.shortForm, match: matches[0] });
        }
      }
      if (queue.length === 0) {
        updateRow.mutate(input);
        return;
      }
      setPendingSaveInput(input);
      setDupeQueue(queue);
      setDupeIndex(0);
      setDupeDialogOpen(true);
    } catch {
      // If the duplicate check itself fails for any reason, don't block the save.
      updateRow.mutate(input);
    }
  }, [isOnline, updateRow, utils]);

  function handleDupeDialogResolved() {
    const nextIndex = dupeIndex + 1;
    if (nextIndex < dupeQueue.length) {
      setDupeIndex(nextIndex);
      setDupeDialogOpen(true);
    } else {
      setDupeDialogOpen(false);
      setDupeQueue([]);
      setDupeIndex(0);
      if (pendingSaveInput) {
        updateRow.mutate(pendingSaveInput);
        setPendingSaveInput(null);
      }
    }
  }

  const deleteRow = useMemo(() => ({
    isPending: _deleteRowOnline.isPending,
    mutate: (input: { id: number }) => {
      if (isOnline) {
        _deleteRowOnline.mutate(input);
      } else {
        deletePendingRowInCachedSheet(sheetId, input.id).then(() => {
          if (input.id > 0) {
            enqueueSyncAction({ type: "deleteServerRow", serverId: input.id });
          }
          getCachedSheet(sheetId).then((cached) => {
            if (!cached) return;
            const converted = cached.rows
              .filter((r) => !r.pendingDelete)
              .map((r) => ({
                id: r.id, sheetId, rowNumber: r.rowNumber,
                time: r.time ?? null, observation: r.observation ?? null, timeMinutes: null,
                isLocked: false, createdAt: new Date(), updatedAt: new Date(),
                members: r.members.map((name, idx) => ({ id: idx, rowId: r.id, memberName: name, sortOrder: idx, createdAt: new Date() })),
                certifications: [] as NonNullable<typeof rows>[0]["certifications"],
              })) as unknown as NonNullable<typeof rows>;
            setOfflineRows(converted);
            setHasPendingOfflineChanges(true);
          });
        }).catch(() => {});
      }
    },
  }), [isOnline, _deleteRowOnline, sheetId, rows]);

  const _addMemberOnline = trpc.member.add.useMutation({
    onSuccess: invalidateRows,
    onError: (e) => toast.error(e.message),
  });

  const _removeMemberOnline = trpc.member.remove.useMutation({
    onSuccess: invalidateRows,
    onError: (e) => toast.error(e.message),
  });

  // Offline-aware addMember — updates cached sheet and queues sync action
  const addMember = useMemo(() => ({
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
        getCachedSheet(sheetId).then(async (cached) => {
          if (!cached) return;
          const row = cached.rows.find((r) => r.id === input.rowId);
          if (!row) return;
          // Add member to cached row
          const updatedRows = cached.rows.map((r) =>
            r.id === input.rowId ? { ...r, members: [...r.members, input.memberName] } : r
          );
          await import("@/lib/offlineStore").then(({ saveCachedSheet }) =>
            saveCachedSheet({ ...cached, rows: updatedRows })
          );
          // Enqueue sync action
          if (input.rowId > 0) {
            enqueueSyncAction({ type: "addMemberToServerRow", serverId: input.rowId, memberName: input.memberName });
          } else if (row.pendingLocalId) {
            enqueueSyncAction({ type: "addMemberToServerRow", serverId: input.rowId, pendingLocalId: row.pendingLocalId, memberName: input.memberName });
          }
          // Refresh display
          const updatedCached = { ...cached, rows: updatedRows };
          const converted = updatedCached.rows.map((r) => ({
            id: r.id, sheetId, rowNumber: r.rowNumber,
            time: r.time ?? null, observation: r.observation ?? null, timeMinutes: null,
            isLocked: false, createdAt: new Date(), updatedAt: new Date(),
            members: r.members.map((name, idx) => ({ id: idx, rowId: r.id, memberName: name, sortOrder: idx, createdAt: new Date() })),
            certifications: [] as NonNullable<typeof rows>[0]["certifications"],
          })) as unknown as NonNullable<typeof rows>;
          setOfflineRows(converted);
          setHasPendingOfflineChanges(true);
        }).catch(() => toast.error("Failed to save member locally"));
      }
    },
  }), [isOnline, _addMemberOnline, sheetId, rows]);

  // Offline-aware removeMember — updates cached sheet and queues sync action
  const removeMember = useMemo(() => ({
    isPending: _removeMemberOnline.isPending,
    mutate: (input: { id: number; rowId: number }) => {
      if (isOnline) {
        _removeMemberOnline.mutate(input);
      } else {
        getCachedSheet(sheetId).then(async (cached) => {
          if (!cached) return;
          const row = cached.rows.find((r) => r.id === input.rowId);
          if (!row) return;
          // Remove member at index `input.id` (which we use as the member index offline)
          const updatedRows = cached.rows.map((r) => {
            if (r.id !== input.rowId) return r;
            // input.id is the member index (we set idx as id in the converted rows)
            const newMembers = r.members.filter((_, idx) => idx !== input.id);
            return { ...r, members: newMembers };
          });
          await import("@/lib/offlineStore").then(({ saveCachedSheet }) =>
            saveCachedSheet({ ...cached, rows: updatedRows })
          );
          // Enqueue sync — best effort (member removal by name)
          if (input.rowId > 0 && row.members[input.id]) {
            enqueueSyncAction({ type: "removeMemberFromServerRow", serverId: input.rowId, memberName: row.members[input.id] });
          }
          // Refresh display
          const updatedCached = { ...cached, rows: updatedRows };
          const converted = updatedCached.rows.map((r) => ({
            id: r.id, sheetId, rowNumber: r.rowNumber,
            time: r.time ?? null, observation: r.observation ?? null, timeMinutes: null,
            isLocked: false, createdAt: new Date(), updatedAt: new Date(),
            members: r.members.map((name, idx) => ({ id: idx, rowId: r.id, memberName: name, sortOrder: idx, createdAt: new Date() })),
            certifications: [] as NonNullable<typeof rows>[0]["certifications"],
          })) as unknown as NonNullable<typeof rows>;
          setOfflineRows(converted);
          setHasPendingOfflineChanges(true);
        }).catch(() => {});
      }
    },
  }), [isOnline, _removeMemberOnline, sheetId, rows]);

  const reorderMember = trpc.member.reorder.useMutation({
    onSuccess: invalidateRows,
    onError: (e) => toast.error(e.message),
  });

  // Uploads go straight to a plain HTTP route as raw bytes rather than
  // through tRPC's base64/JSON path — a several-MB Portrait-mode iPhone
  // photo, base64-encoded into one giant JSON string, was what intermittently
  // failed on weak mobile connections with a cryptic browser error. Raw
  // binary avoids both the ~33% base64 size inflation and that giant string.
  const uploadAttachment = useMutation({
    mutationFn: async ({ rowId, blob, mimeType, fileName }: { rowId: number; blob: Blob; mimeType: string; fileName: string }) => {
      const params = new URLSearchParams({ rowId: String(rowId), fileName, mimeType });
      const res = await fetch(`/api/attachments/upload-raw?${params.toString()}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": mimeType || "application/octet-stream" },
        body: blob,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      return res.json() as Promise<{ id: number; url: string }>;
    },
    // Field officers are often on weak signal — retry transient network
    // failures automatically rather than making them re-tap the photo.
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    onSuccess: invalidateRows,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAttachment = trpc.attachment.delete.useMutation({
    onSuccess: invalidateRows,
    onError: (e) => toast.error(e.message),
  });

  const certify = trpc.certification.certify.useMutation({
    onSuccess: (data) => {
      invalidateRows();
      if (data.rowLocked) toast.success("All members certified — row locked");
      else toast.success("Member certified");
    },
    onError: (e) => toast.error(e.message),
  });

  const uncertify = trpc.certification.uncertify.useMutation({
    onSuccess: () => { invalidateRows(); toast.success("Certification removed — row unlocked"); },
    onError: (e) => toast.error(e.message),
  });

  const uncertifyAll = trpc.certification.uncertifyAll.useMutation({
    onSuccess: () => { invalidateRows(); toast.success("All certifications removed — row unlocked"); },
    onError: (e) => toast.error(e.message),
  });

  const certifyAllForCin = trpc.certification.certifyAllForCin.useMutation({
    onSuccess: (data) => {
      invalidateRows();
      toast.success(`Certified ${data.certifiedCount} row(s) across the sheet`);
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Travelled Via auto-fill ────────────────────────────────────────────────
  // Tracks which row is currently being auto-filled (shows spinner in that cell)
  const [tvLoadingRowId, setTvLoadingRowId] = useState<number | null>(null);
  const getTravelledViaStreets = trpc.travelledVia.getStreets.useMutation({
    onError: (e) => {
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
    onSuccess: () => { utils.sheet.get.invalidate({ id: sheetId }); toast.success("Running sheet closed and locked."); },
    onError: (e) => toast.error(e.message),
  });
  const reopenSheet = trpc.sheet.reopen.useMutation({
    onSuccess: () => { utils.sheet.get.invalidate({ id: sheetId }); toast.success("Running sheet reopened."); },
    onError: (e) => toast.error(e.message),
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
      return raw.some((e) => e.isTeamLeader && e.cin.toUpperCase() === user.cin!.toUpperCase());
    } catch { return false; }
  }, [user?.cin, sheet?.sheetCins]);
  const canCloseByRole = user?.role === "admin" || isCurrentUserTeamLeader;

  // All rows certified check (same logic as Governance.tsx allSigned)
  const allRowsCertified = useMemo(() => {
    if (!rows || rows.length === 0) return false;
    return rows.every((r) => {
      const members = r.members ?? [];
      if (members.length === 0) return true;
      return members.every((m) =>
        (r.certifications ?? []).some((c) => c.memberId === m.id && c.isActive)
      );
    });
  }, [rows]);

  // Governance complete check
  const govComplete = useMemo(() => {
    if (!govRecord) return false;
    const g = govRecord as Record<string, unknown>;
    const tlDone = !!(g.summaryNotification) && !!(g.sentToIO);
    const opDone = !!(g.savedAsWord) && !!(g.savedAsPdf) && !!(g.uploadedToPromis) && !!(g.savedInOpFolder);
    return tlDone && opDone;
  }, [govRecord]);

  const canCloseSheet = canCloseByRole && allRowsCertified && govComplete && !isClosed;

  const canEdit = !isClosed && (user?.role === "member" || user?.role === "admin" || user?.role === "observer");
  const canCertify = !isClosed && (user?.role === "member" || user?.role === "admin");

  // Parse daily roster CINs for team expansion and Certify All
  // Sort: Team Leader first, then all others in numeric/alphabetic order
  const parsedRoster = useMemo(() => {
    try {
      const raw = sheet?.sheetCins ? (JSON.parse(sheet.sheetCins) as CinEntry[]) : [];
      return [...raw].sort((a, b) => {
        if (a.isTeamLeader && !b.isTeamLeader) return -1;
        if (!a.isTeamLeader && b.isTeamLeader) return 1;
        // Numeric sort: extract leading digits for comparison
        const aNum = parseInt(a.cin, 10);
        const bNum = parseInt(b.cin, 10);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.cin.localeCompare(b.cin);
      });
    } catch { return []; }
  }, [sheet?.sheetCins]);
  const rosterCinList = useMemo(() => parsedRoster.map((e) => e.cin), [parsedRoster]);

  // ─── CIN auto-sort helper ────────────────────────────────────────────────────
  // After any member is added, re-sort the row's CINs: TL first, then ascending CIN number.
  // Spacers keep their relative positions. Skipped if the user has manually dragged this row.
  const autoSortRowMembers = useCallback((rowId: number) => {
    if (manuallyReorderedRowsRef.current.has(rowId)) return; // user has custom order
    const currentRow = rows?.find((r) => r.id === rowId);
    if (!currentRow || currentRow.members.length < 2) return;

    // Build canonical CIN order: TL first, then ascending numeric CIN
    const tlCin = parsedRoster.find((e) => e.isTeamLeader)?.cin?.toUpperCase();
    const nonSpacers = currentRow.members.filter((m) => m.memberName !== SPACER);
    const spacers = currentRow.members.filter((m) => m.memberName === SPACER);

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
      reorderMember.mutate({ rowId, orderedIds: result.map((m) => m.id) });
    }
  }, [rows, parsedRoster, reorderMember]);

  // Keep the ref in sync so the addMember useMemo (declared earlier) can call it
  autoSortRef.current = autoSortRowMembers;

  // Compute which CINs have ALL their rows certified
  const cinFullyCertified = useMemo(() => {
    if (!rows || rows.length === 0) return new Set<string>();
    const certified = new Set<string>();
    for (const entry of parsedRoster) {
      const cin = entry.cin;
      // Find all rows where this CIN is a member
      const relevantRows = rows.filter((r) => r.members.some((m) => m.memberName === cin));
      if (relevantRows.length === 0) continue; // not in any row yet
      const allCertified = relevantRows.every((r) =>
        r.members
          .filter((m) => m.memberName === cin)
          .every((m) => r.certifications.some((c) => c.memberId === m.id && c.isActive))
      );
      if (allCertified) certified.add(cin);
    }
    return certified;
  }, [rows, parsedRoster]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  // Target panel collapsed state — expanded by default, persisted in localStorage
  const [teamPanelExpanded, setTeamPanelExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem("runsheet_team_panel_expanded") !== "false"; } catch { return true; }
  });
  const [targetPanelExpanded, setTargetPanelExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem("runsheet_target_panel_expanded") !== "false"; } catch { return true; }
  });
  // Shortcut chip order for the target panel — persisted per sheet in localStorage
  // Canonical default chip order — used when no saved order exists in localStorage
  // Generates: SC, HBF, V1F, V1, V2F, V2, V3F, V3, V4F, V4 ... (up to 8 vehicles), then fixed shortcuts, then DEP/ARR, then wild fields
  const CANONICAL_CHIP_ORDER = [
    "SC", "HBF",
    ...Array.from({ length: 8 }, (_, i) => [`V${i + 1}F`, `V${i + 1}`]).flat(),
    "TGT", "DSO", "DR", "FP", "US", "DE", "AR", "CV", "OOS", "COOS", "PU", "PT", "RACK",
    "DEP", "ARR",
    ...Array.from({ length: 10 }, (_, i) => `#${i + 1}`),
  ];
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
          localStorage.setItem(`runsheet_field_order_${sheetId}`, JSON.stringify(migrated));
        }
        return migrated;
      }
    } catch {}
    return CANONICAL_CHIP_ORDER;
  });
  const handleChipDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setTargetFieldOrder(prev => {
      // Ensure both chips are in the order array — new shortcuts/wildcards may not be
      let base = [...prev];
      if (!base.includes(active.id as string)) base = [...base, active.id as string];
      if (!base.includes(over.id as string)) base = [...base, over.id as string];
      const oldIndex = base.indexOf(active.id as string);
      const newIndex = base.indexOf(over.id as string);
      const next = arrayMove(base, oldIndex, newIndex);
      try { localStorage.setItem(`runsheet_field_order_${sheetId}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [sheetId]);
  // Track the last focused textarea/input so chip taps can insert text even after blur
  const focusedTextareaRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  // Track the last focused textarea/input via document focusin so chip taps can insert even after blur
  useEffect(() => {
    const handler = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        focusedTextareaRef.current = el as HTMLTextAreaElement | HTMLInputElement;
      }
    };
    document.addEventListener("focusin", handler, true);
    return () => document.removeEventListener("focusin", handler, true);
  }, []);

  // Persist sort preference in localStorage so it survives navigation
  const [sortReversed, setSortReversed] = useState<boolean>(() => {
    try { return localStorage.getItem("runsheet_sort_reversed") === "true"; } catch { return false; }
  });
  const toggleSortReversed = () => setSortReversed(v => {
    const next = !v;
    try { localStorage.setItem("runsheet_sort_reversed", String(next)); } catch {}
    return next;
  });

  // Edit sheet state
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editTargetName, setEditTargetName] = useState("");
  const [editTargetMode, setEditTargetMode] = useState<"none" | "new" | "link">("none");
  const [editNewTargetName, setEditNewTargetName] = useState("");
  const [editSelectedTargetId, setEditSelectedTargetId] = useState<number | null>(null);

  // Target selector
  const { data: operationTargets } = trpc.target.list.useQuery(
    { operationId: sheet?.operationId ?? 0 },
    { enabled: !!sheet?.operationId }
  );
  // All targets across all operations for the cross-op picker
  const { data: allUsers } = trpc.users.listForCin.useQuery(undefined, { enabled: isAuthenticated });

  const { data: allTargetsForSheet } = trpc.target.listAll.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const [editTargetSearch, setEditTargetSearch] = useState("");
  const setSheetTarget = trpc.target.setSheetTarget.useMutation({
    onSuccess: () => { utils.sheet.get.invalidate({ id: sheetId }); toast.success("Target updated"); },
    onError: (e) => toast.error(e.message),
  });

  // Shortcuts: fetch once and build a trigger→expansion map
  const { data: shortcutsData } = trpc.shortcuts.list.useQuery(undefined, { enabled: isAuthenticated, staleTime: 0 });
  // Per-target shortcuts for the sheet's assigned target
  const { data: targetShortcutsData } = trpc.targetShortcuts.listForSheet.useQuery(
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
    for (const s of shortcutsData ?? []) map[s.trigger.toLowerCase()] = s.expansion;
    // Target-aware shortcuts: overlay TGT/HBF/HB/V1F/V1/V2F/V2/DEP/ARR from the assigned target
    if (assignedTarget) {
      const t = assignedTarget;
      if (t.tgt) map['tgt'] = t.tgt;
      if (t.hbf) map['hbf'] = t.hbf;
      if (t.hb)  map['hb']  = t.hb;
      if (t.v1f) map['v1f'] = t.v1f;
      if (t.v1)  map['v1']  = t.v1;
      if (t.v2f) map['v2f'] = t.v2f;
      if (t.v2)  map['v2']  = t.v2;
      if (t.dep) map['dep'] = t.dep;
      if (t.arr) map['arr'] = t.arr;
      // Extra vehicles (V2F/V2, V3F/V3, …)
      try {
        const evs: Array<{ full: string; short: string }> = JSON.parse((t as any).extraVehicles ?? '[]');
        evs.forEach((ev, i) => {
          const num = i + 2;
          if (ev.full)  map[`v${num}f`] = ev.full;
          if (ev.short) map[`v${num}`]  = ev.short;
        });
      } catch {}
      // Wild fields (#1, #2, …)
      try {
        const wfs: Array<{ label: string; value: string }> = JSON.parse((t as any).wildFields ?? '[]');
        wfs.forEach((wf) => {
          if (wf.value) map[wf.label.toLowerCase()] = wf.value;
        });
      } catch {}
    }
    // Per-target custom shortcuts (override global if same trigger)
    for (const s of targetShortcutsData ?? []) map[s.trigger.toLowerCase()] = s.expansion;
    return map;
  }, [shortcutsData, targetShortcutsData, assignedTarget]);

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
    onError: (e) => toast.error(e.message),
  });

  const deleteSheet = trpc.sheet.delete.useMutation({
    onSuccess: () => {
      setEditSheetOpen(false);
      toast.success("Running sheet moved to Recycle Bin");
      // Navigate back to the operation page
      if (sheet) navigate(`/operation/${sheet.operationId}`);
      else navigate("/");
    },
    onError: (e) => toast.error(e.message),
  });

  const [pendingExportType, setPendingExportType] = useState<"pdf" | "word" | null>(null);
  const [exportEnabled, setExportEnabled] = useState(false);
  const { data: exportData, isFetching: exportFetching, refetch: refetchExport } = trpc.export.sheetData.useQuery(
    { id: sheetId },
    {
      enabled: isAuthenticated && !!sheetId && exportEnabled,
      staleTime: 0,
    }
  );

  // When export data arrives and there is a pending type, trigger the download
  useEffect(() => {
    if (exportData && pendingExportType && sheet) {
      if (pendingExportType === "pdf") {
        exportToPDF(
          sheet.title,
          exportData.rows,
          exportData.operation ?? null,
          exportData.sheet.sheetCins ?? null,
          exportData.sheet.createdAt,
          exportData.targetFullName ?? null,
        );
      } else if (pendingExportType === "word") {
        exportToWord(
          sheet.title,
          exportData.rows,
          exportData.operation ?? null,
          exportData.sheet.sheetCins ?? null,
          exportData.sheet.createdAt,
          exportData.targetFullName ?? null,
        ).catch((e) => toast.error("Word export failed: " + e.message));
      }
      setPendingExportType(null);
    }
  }, [exportData, pendingExportType, sheet]);

  const openEditSheet = () => {
    setEditTitle(sheet?.title ?? "");
    setEditTargetName(sheet?.targetName ?? "");
    setEditTargetMode("none");
    setEditNewTargetName("");
    setEditTargetSearch("");
    setEditSelectedTargetId(sheet?.targetId ?? null);
    setEditSheetOpen(true);
  };

  const openEditRoster = () => {
    const parsed: CinEntry[] = (() => {
      try { return sheet?.sheetCins ? JSON.parse(sheet.sheetCins) : []; }
      catch { return []; }
    })();
    setRosterList(parsed);
    setRosterInput("");
    setEditRosterOpen(true);
  };

  const handleAddRosterTeam = (teamKey: "TEAM1" | "TEAM2" | "PTT") => {
    if (!allUsers) { toast.error("User list not available"); return; }
    const members = allUsers.filter((u) => u.team === teamKey);
    if (members.length === 0) { toast.error("No members found in that team"); return; }
    let added = 0;
    setRosterList((prev) => {
      let updated = [...prev];
      for (const m of members) {
        if (!updated.some((c) => c.cin.toLowerCase() === m.cin.toLowerCase())) {
          updated = [...updated, { cin: m.cin, hasImages: false, isTeamLeader: false, isAuthor: false }];
          added++;
        }
      }
      return updated;
    });
    if (added === 0) toast.info("All team members already added");
    else toast.success(`Added ${added} member${added !== 1 ? "s" : ""} from ${teamKey.replace("TEAM", "TEAM ")}`);
  };

  const handleAddRosterCin = () => {
    const trimmed = rosterInput.trim().toUpperCase();
    if (!trimmed) return;
    // Must be a registered user
    const registeredCins = new Set((allUsers ?? []).map((u) => u.cin.toUpperCase()));
    if (!registeredCins.has(trimmed)) {
      toast.error(`CIN "${trimmed}" is not a registered user`);
      return;
    }
    if (rosterList.some((c) => c.cin.toUpperCase() === trimmed)) {
      toast.error("CIN already in team");
      return;
    }
    setRosterList((prev) => [...prev, { cin: trimmed, hasImages: false, isTeamLeader: false, isAuthor: false }]);
    setRosterInput("");
    setRosterInputValid(false);
  };

  const handleExport = useCallback((type: "pdf" | "word" = "pdf") => {
    if (!sheet) return;
    if (exportData && !exportFetching) {
      setPendingExportType(type);
      refetchExport();
      return;
    }
    setPendingExportType(type);
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
      .sort((a: NonNullable<typeof rows>[0], b: NonNullable<typeof rows>[0]) => a.rowNumber - b.rowNumber);
    const map = new Map<number, number>();

    // Find the earliest rowDate among all rows that have one (day-0 anchor)
    const allRowDates = timedByRowNumber
      .map((r: NonNullable<typeof rows>[0]) => (r as any).rowDate as string | null | undefined)
      .filter((d): d is string => !!d);
    const minRowDate = allRowDates.length > 0 ? allRowDates.slice().sort()[0] : null;

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
    return Array.from(rowDayOffsetMap.values()).some((v) => v > 0);
  }, [displayRows, rowDayOffsetMap]);

  const filteredRows = useMemo(() => {
    if (!displayRows) return [];
    const filtered = !searchQuery.trim() ? displayRows : displayRows.filter((row: NonNullable<typeof rows>[0]) => {
      const q = searchQuery.toLowerCase();
      if (row.time?.toLowerCase().includes(q)) return true;
      if (row.observation?.toLowerCase().includes(q)) return true;
      if (row.members?.some((m: { memberName: string }) => m.memberName.toLowerCase().includes(q))) return true;
      return false;
    });
    // Rows with no time set ALWAYS float to the top (newest/being filled in)
    const withTime = filtered.filter((row: NonNullable<typeof rows>[0]) => row.timeMinutes != null);
    const noTime = filtered.filter((row: NonNullable<typeof rows>[0]) => row.timeMinutes == null);
    const effectiveMinutes = (row: NonNullable<typeof rows>[0]) =>
      (row.timeMinutes ?? 0) + (rowDayOffsetMap.get(row.id) ?? 0) * 1440;
    // Sort timed rows by effective (day-offset) timeMinutes, then rowNumber as tie-break
    const sortedWithTime = [...withTime].sort((a: NonNullable<typeof rows>[0], b: NonNullable<typeof rows>[0]) => {
      const timeDiff = effectiveMinutes(a) - effectiveMinutes(b);
      if (timeDiff !== 0) return sortReversed ? -timeDiff : timeDiff;
      return sortReversed ? (b.rowNumber - a.rowNumber) : (a.rowNumber - b.rowNumber);
    });
    // No-time rows sorted by descending rowNumber (most recently added first)
    const sortedNoTime = [...noTime].sort((a: NonNullable<typeof rows>[0], b: NonNullable<typeof rows>[0]) =>
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
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex items-center gap-2">
            {sheetLoading ? (
              <Skeleton className="h-7 w-64" />
            ) : (
              <>
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-foreground truncate">{sheet?.title}</h1>
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
                      <Badge variant="secondary" className="gap-1.5 bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 shrink-0">
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
                    {hasPendingOfflineChanges ? "Offline — changes queued" : "Offline"}
                  </div>
                </TooltipTrigger>
                <TooltipContent>No internet connection. Changes are saved locally and will sync automatically when you reconnect.</TooltipContent>
              </Tooltip>
            )}
            {/* Close / Reopen button */}
            {canManageClose && (
              isClosed ? (
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
                  <TooltipContent>Reopen this running sheet for editing</TooltipContent>
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
                      onClick={() => canCloseSheet && closeSheet.mutate({ id: sheetId })}
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
              )
            )}
            {/* Export dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={exportFetching}
                >
                  <Download className="w-4 h-4" />
                  {exportFetching ? "Preparing..." : "Export"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onClick={() => handleExport("pdf")}
                >
                  <FileText className="w-4 h-4 text-rose-400" />
                  Print / Save PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onClick={() => handleExport("word")}
                >
                  <FileText className="w-4 h-4 text-blue-400" />
                  Download Word (.docx)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>


          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-5 border-b border-border">
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground border-b-2 border-primary -mb-px transition-colors"
          >
            <FileText className="w-4 h-4" />
            Running Sheet
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate(`/governance/${sheetId}`)}
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
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">This running sheet is closed and locked</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Closed by <span className="font-mono font-semibold">{sheet.closedByCIN}</span>
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
                  try { localStorage.setItem("runsheet_team_panel_expanded", String(next)); } catch {}
                }}
              >
                <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate flex-1">TEAM — CERTIFY</span>
                {/* Certified count badge */}
                {parsedRoster.length > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground mr-1">
                    {cinFullyCertified.size}/{parsedRoster.length}
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${teamPanelExpanded ? "" : "-rotate-90"}`} />
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
                    {parsedRoster.map((entry) => (
                      <button
                        key={entry.cin}
                        onClick={() => canCertify ? certifyAllForCin.mutate({ sheetId, cin: entry.cin }) : undefined}
                        disabled={certifyAllForCin.isPending || !canCertify}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono font-medium transition-colors disabled:opacity-50 ${
                          cinFullyCertified.has(entry.cin)
                            ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                            : canCertify ? "border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 text-foreground" : "border-border bg-muted/40 text-foreground cursor-default"
                        }`}
                        title={`${canCertify ? "Certify all rows for " : ""}CIN ${entry.cin}${entry.isTeamLeader ? " (Team Leader)" : ""}${entry.isAuthor ? " (Author)" : ""}`}
                      >
                        <ShieldCheck className={`w-3 h-3 ${cinFullyCertified.has(entry.cin) ? "text-emerald-500" : "text-primary"}`} />
                        {entry.isTeamLeader && <span className="text-yellow-400" title="Team Leader">★</span>}
                        {entry.isAuthor && <span className="text-sky-400" title="Running Sheet Author">✏️</span>}
                        {entry.cin}
                        {entry.hasImages && <Camera className="w-3 h-3 text-amber-400" />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No team members added — tap the pencil to add CINs.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* TARGET Panel — target card fields (when assigned) plus entity
            chips mined from this sheet's own observations, in one panel so
            officers see every quick-insert chip together. */}
        {((sheet?.targetId && assignedTarget) || (entityChips && entityChips.length > 0)) && (() => {
          const t = assignedTarget;
          const hasTarget = !!(sheet?.targetId && t);
          // Build dynamic extra vehicle fields from JSON
          const extraVehicleFields: { label: string; value: string | null }[] = [];
          if (t) {
            try {
              const evs: Array<{ full: string; short: string }> = JSON.parse((t as any).extraVehicles ?? '[]');
              evs.forEach((ev, i) => {
                const num = i + 2;
                if (ev.full)  extraVehicleFields.push({ label: `V${num}F`, value: ev.full });
                if (ev.short) extraVehicleFields.push({ label: `V${num}`,  value: ev.short });
              });
            } catch {}
          }
          // Build wild fields
          const wildFieldItems: { label: string; value: string | null }[] = [];
          if (t) {
            try {
              const wfs: Array<{ label: string; value: string }> = JSON.parse((t as any).wildFields ?? '[]');
              wfs.forEach((wf) => { if (wf.value) wildFieldItems.push({ label: wf.label, value: wf.value }); });
            } catch {}
          }
          const fields: { label: string; value: string | null }[] = t ? [
            { label: "TGT", value: t.tgt },
            { label: "HBF", value: t.hbf },
            { label: "HB",  value: t.hb  },
            { label: "V1F", value: t.v1f },
            { label: "V1",  value: t.v1 ?? null },
            ...extraVehicleFields,
            ...wildFieldItems,
            { label: "DEP", value: t.dep },
            // All shortcut-folder triggers as chips — only those with showInRs=true, exclude legacy 'D' chip
             ...(shortcutsData ?? []).filter((s) => s.trigger.toUpperCase() !== "D" && !!s.showInRs).map((s) => ({ label: s.trigger.toUpperCase(), value: s.expansion })),
          ] : [];
          const hasAnyField = fields.some((f) => f.value);
          const hasEntityChips = !!(entityChips && entityChips.length > 0);
          return (
            <div className="mb-4 rounded-lg border border-border bg-card/60 overflow-hidden">
              {/* Header — always visible. Tapping the main area toggles collapse; pencil navigates to edit */}
              <div className="flex items-center">
                <button
                  className="flex-1 flex items-center gap-2 px-4 py-3 hover:bg-muted/20 active:bg-muted/30 transition-colors select-none text-left min-w-0"
                  onClick={() => setTargetPanelExpanded(v => {
                    const next = !v;
                    try { localStorage.setItem("runsheet_target_panel_expanded", String(next)); } catch {}
                    return next;
                  })}
                >
                  {hasTarget ? <Target className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate flex-1">{hasTarget ? `TARGET — ${t!.name}` : "SHORTCUTS"}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${targetPanelExpanded ? "" : "-rotate-90"}`}
                  />
                </button>
                {/* Edit pencil — independent tap zone, doesn't trigger collapse */}
                {hasTarget && (
                  <button
                    className="px-3 py-3 text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 border-l border-border/30"
                    onClick={() => navigate(`/operation/${sheet!.operationId}?tab=target&targetId=${t!.id}&fromSheet=${sheetId}`)}
                    title="Edit Target"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {/* Collapsible details */}
              {targetPanelExpanded && (() => {
                // Apply saved order to the fields list
                const visibleFields = fields.filter((f) => f.value);
                const isWildcard = (lbl: string) => /^#\d+$/.test(lbl);
                const nonWildVisible = visibleFields.filter(f => !isWildcard(f.label));
                const wildcardVisible = visibleFields.filter(f => isWildcard(f.label));
                const orderedNonWild = targetFieldOrder.length > 0
                  ? [
                      ...targetFieldOrder.filter(lbl => !isWildcard(lbl)).map(lbl => nonWildVisible.find(f => f.label === lbl)).filter(Boolean) as typeof visibleFields,
                      ...nonWildVisible.filter(f => !targetFieldOrder.includes(f.label)),
                    ]
                  : nonWildVisible;
                // Wildcards always at the end, in their saved order
                const orderedWild = targetFieldOrder.length > 0
                  ? [
                      ...targetFieldOrder.filter(isWildcard).map(lbl => wildcardVisible.find(f => f.label === lbl)).filter(Boolean) as typeof visibleFields,
                      ...wildcardVisible.filter(f => !targetFieldOrder.includes(f.label)),
                    ]
                  : wildcardVisible;
                const orderedFields = [...orderedNonWild, ...orderedWild];
                return (
                  <div className="px-4 pb-3 border-t border-border/40">
                    {hasAnyField && (() => {
                      const shortcutFolderLabels = new Set((shortcutsData ?? []).map(s => s.trigger.toUpperCase()));
                      const TRIGGER_ONLY_LABELS = new Set(["TGT", "HBF", "HB", "V1F", "V2F", "DEP"]);
                      return (
                        <DndContext
                          sensors={chipSensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleChipDragEnd}
                        >
                          <SortableContext items={orderedFields.map(f => f.label)} strategy={horizontalListSortingStrategy}>
                            <div className="flex flex-wrap gap-1.5 pt-2">
                              {orderedFields.map((f) => {
                                const insertIntoFocused = () => {
                                  const el = focusedTextareaRef.current;
                                  if (el) {
                                    el.focus();
                                    const start = el.selectionStart ?? el.value.length;
                                    const end = el.selectionEnd ?? el.value.length;
                                    const before = el.value.slice(0, start);
                                    const after = el.value.slice(end);
                                    const insert = (before && !before.endsWith(" ")) ? ` ${f.value!}` : f.value!;
                                    try {
                                      document.execCommand("insertText", false, insert);
                                    } catch {
                                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
                                        || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                                      if (nativeInputValueSetter) {
                                        nativeInputValueSetter.call(el, before + insert + after);
                                        el.dispatchEvent(new Event("input", { bubbles: true }));
                                      }
                                    }
                                  }
                                };
                                const isVnShort = /^V\d+$/.test(f.label);
                                const isVnFull  = /^V\d+F$/.test(f.label);
                                const isStandard = !isVnShort && (shortcutFolderLabels.has(f.label) || TRIGGER_ONLY_LABELS.has(f.label) || isVnFull);
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
                        {entityChips!.map((chip) => {
                          const insertIntoFocused = () => {
                            const el = focusedTextareaRef.current;
                            if (!el) return;
                            el.focus();
                            const start = el.selectionStart ?? el.value.length;
                            const end = el.selectionEnd ?? el.value.length;
                            const before = el.value.slice(0, start);
                            const after = el.value.slice(end);
                            const insert = (before && !before.endsWith(" ")) ? ` ${chip.insertValue}` : chip.insertValue;
                            try {
                              document.execCommand("insertText", false, insert);
                            } catch {
                              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
                                || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                              if (nativeInputValueSetter) {
                                nativeInputValueSetter.call(el, before + insert + after);
                                el.dispatchEvent(new Event("input", { bubbles: true }));
                              }
                            }
                          };
                          return (
                            <button
                              key={chip.key}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={insertIntoFocused}
                              title={`Insert: ${chip.insertValue}`}
                              className="px-2 py-0.5 rounded border border-violet-500/30 bg-violet-500/5 text-violet-400 hover:bg-violet-500/15 active:scale-95 transition-all select-none cursor-pointer"
                            >
                              <span className="text-[10px] font-mono max-w-[140px] truncate">{chip.insertValue}</span>
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
            <TooltipContent>{sortReversed ? "Showing newest first — click to show oldest first" : "Showing oldest first — click to show newest first"}</TooltipContent>
          </Tooltip>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            ) : !rows || rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-muted-foreground text-sm">No rows yet. Click "Add Row" to begin.</p>
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
                    <tr><td colSpan={4} className="py-12 text-center text-sm text-muted-foreground italic">No rows match your search.</td></tr>
                  ) : filteredRows.reduce((acc: React.ReactNode[], row: NonNullable<typeof rows>[0], idx: number) => {
                    // ── Date-divider: insert a separator row when the day offset changes ──
                    // In ascending order: divider goes BEFORE the first day-N row.
                    // In reversed order: divider goes AFTER the last day-N row (i.e. before
                    // the current row which belongs to an earlier day).
                    if (row.timeMinutes != null) {
                      const prevTimedRow = [...filteredRows].slice(0, idx).reverse().find((r: NonNullable<typeof rows>[0]) => r.timeMinutes != null);
                      if (prevTimedRow) {
                        const prevDay = rowDayOffsetMap.get(prevTimedRow.id) ?? 0;
                        const curDay = rowDayOffsetMap.get(row.id) ?? 0;
                        if (curDay !== prevDay) {
                          // The divider label always shows the HIGHER day (the later calendar day)
                          const laterDay = Math.max(prevDay, curDay);
                          // Prefer an explicit rowDate from a row on that day
                          const rowOnLaterDay = filteredRows.find(
                            (r: NonNullable<typeof rows>[0]) =>
                              (rowDayOffsetMap.get(r.id) ?? 0) === laterDay && (r as any).rowDate
                          );
                          let label: string;
                          if (rowOnLaterDay && (rowOnLaterDay as any).rowDate) {
                            label = formatPerthDateLabel((rowOnLaterDay as any).rowDate as string);
                          } else {
                            const sheetStartMs = sheet?.createdAt ? new Date(sheet.createdAt).getTime() : Date.now();
                            const labelDate = new Date(sheetStartMs + laterDay * 24 * 60 * 60 * 1000);
                            label = labelDate.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: PERTH_TIME_ZONE }).toUpperCase();
                          }
                          const dividerRow = (
                            <tr key={`divider-${row.id}`} className="date-divider-row">
                              <td colSpan={4} className="py-1.5 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 h-px bg-border" />
                                  <span className="text-[10px] font-semibold tracking-widest text-muted-foreground whitespace-nowrap">{label}</span>
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
                      className={row.isLocked ? "row-locked" : "hover:bg-accent/20"}
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
                            // Compute inferred date from day offset + sheet start date
                            const dayOff = rowDayOffsetMap.get(row.id) ?? 0;
                            const sheetStartMs = sheet?.createdAt ? new Date(sheet.createdAt).getTime() : Date.now();
                            const d = new Date(sheetStartMs + dayOff * 86400000);
                            return new Intl.DateTimeFormat("en-CA", { timeZone: PERTH_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
                          })()}
                          sheetHasCrossedMidnight={sheetHasCrossedMidnight}
                          sheetCreatedAt={sheet?.createdAt ? new Date(sheet.createdAt).getTime() : null}
                          onSave={(display, mins, dayOff, rd) => updateRow.mutate({ id: row.id, time: display, timeMinutes: mins, dayOffset: dayOff, rowDate: rd })}
                        />
                      </td>

                      {/* Observation */}
                      <td>
                        {tvLoadingRowId === row.id ? (
                          <div className="flex items-center gap-2 py-2 px-1 text-sm text-muted-foreground">
                            <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                            Fetching route streets…
                          </div>
                        ) : (
                          <EditableCell
                            value={row.observation}
                            locked={row.isLocked}
                            multiline
                            placeholder="Enter observation…"
                            onSave={(val) => {
                              // ── TV trigger: detect case-insensitive "tv" as the entire cell value ──
                              if (val.trim().toLowerCase() === "tv") {
                                // Find this row's index in filteredRows
                                const rowIdx = filteredRows.findIndex((r: NonNullable<typeof rows>[0]) => r.id === row.id);
                                if (rowIdx < 0) { updateRowWithDupeCheck({ id: row.id, observation: val }); return; }
                                // Get the row immediately before and after in the display list
                                const prevRow = rowIdx > 0 ? filteredRows[rowIdx - 1] : null;
                                const nextRow = rowIdx < filteredRows.length - 1 ? filteredRows[rowIdx + 1] : null;
                                if (!prevRow || !nextRow) {
                                  toast.error("TV auto-fill: no surrounding rows found. Add a departing row above and arriving row below first.");
                                  updateRowWithDupeCheck({ id: row.id, observation: val });
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

                                const extractAddressFromObs = (obs: string): string => {
                                  if (!obs) return "";
                                  // 1. Bracket code at end: (27 Olding Way)
                                  const bracketMatch = obs.match(/\(([^)]{3,80})\)\s*$/);
                                  if (bracketMatch) return bracketMatch[1].trim();
                                  // 2. Street number pattern: digits followed by street name.
                                  //    Matches things like "27 Olding Way", "131A Lakey Street", "3/12 Smith St".
                                  //    Extra words must also be capitalised so this stops at the street name
                                  //    instead of swallowing trailing sentence text like "and continued via"
                                  //    (lowercase words never continue a street name).
                                  const streetMatch = obs.match(/\b(\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?)?\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/);
                                  if (streetMatch) return streetMatch[1].trim();
                                  // 3. Last resort: full text (server will try to geocode it)
                                  return obs.split("\n")[0].trim();
                                }

                                // A bare street mention like "departed 45 Scott Street and continued
                                // via:" has no suburb, which Google's geocoder often can't resolve on
                                // its own. Scan every row in the sheet for a bracketed full address
                                // sighting of the same street (e.g. "45 Scott Street, KOONGAMIA WA (45
                                // Scott Street)") and prefer that — same enrichment the RS Map feature
                                // already does for its own address matching.
                                const knownAddressMap = new Map<string, string>();
                                const bracketedAddrRe = /\b(\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?)?\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3},\s*[A-Z][A-Z ]{1,30}(?:\s+WA)?)\s*\(([^)]{3,80})\)/g;
                                for (const r of filteredRows) {
                                  if (!r.observation) continue;
                                  bracketedAddrRe.lastIndex = 0;
                                  let m: RegExpExecArray | null;
                                  while ((m = bracketedAddrRe.exec(r.observation)) !== null) {
                                    const key = m[2].trim().toLowerCase();
                                    if (!knownAddressMap.has(key)) knownAddressMap.set(key, m[1].trim());
                                  }
                                }
                                const enrichAddress = (addr: string): string => knownAddressMap.get(addr.toLowerCase()) ?? addr;

                                const departAddr = enrichAddress(extractAddressFromObs(prevObs));
                                const arriveAddr = enrichAddress(extractAddressFromObs(nextObs));
                                if (!departAddr || !arriveAddr) {
                                  toast.error("TV auto-fill: could not extract addresses from surrounding rows.");
                                  updateRowWithDupeCheck({ id: row.id, observation: val });
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
                                    onSuccess: (data) => {
                                      setTvLoadingRowId(null);
                                      updateRowWithDupeCheck({ id: row.id, observation: data.streets });
                                      toast.success("Travelled via streets auto-filled");
                                      // TV means the whole team travelled together — auto-add any
                                      // roster CINs not already on this row, sequenced the same way
                                      // as the "★ Add all team CINs" dropdown option below.
                                      if (rosterCinList.length > 0) {
                                        const existingNames = new Set(row.members.map((m) => m.memberName));
                                        const missingCins = rosterCinList.filter((cin) => !existingNames.has(cin));
                                        const addSequentially = (cins: string[], idx: number) => {
                                          if (idx >= cins.length) return;
                                          addMember.mutate({ rowId: row.id, memberName: cins[idx] });
                                          setTimeout(() => addSequentially(cins, idx + 1), 80);
                                        };
                                        addSequentially(missingCins, 0);
                                      }
                                    },
                                    onError: () => {
                                      setTvLoadingRowId(null);
                                      // Error toast already shown by mutation onError
                                      updateRowWithDupeCheck({ id: row.id, observation: val });
                                    },
                                  }
                                );
                                return;
                              }
                              // Normal save
                              updateRowWithDupeCheck({ id: row.id, observation: val });
                            }}
                            shortcuts={shortcutMap}
                          />
                        )}
                        <ObservationAttachments
                          row={row}
                          canEdit={canEdit && !row.isLocked}
                          onUpload={(rowId, blob, mimeType, fileName) => uploadAttachment.mutate({ rowId, blob, mimeType, fileName })}
                          onDelete={(id) => deleteAttachment.mutate({ id })}
                          uploading={uploadAttachment.isPending}
                        />
                      </td>

                      {/* Member / CIN */}
                      <td>
                        <MemberCell
                          row={row}
                          canEdit={canEdit}
                          onAddMember={(rowId, name) => addMember.mutate({ rowId, memberName: name })}
                          onRemoveMember={(id, rowId) => {
                            const rowData = rows?.find((r) => r.id === rowId);
                            if (rowData?.isLocked) {
                              // Row is locked — uncertify all first, then remove
                              uncertifyAll.mutate({ rowId }, {
                                onSuccess: () => removeMember.mutate({ id, rowId }),
                              });
                            } else {
                              removeMember.mutate({ id, rowId });
                            }
                          }}
                          onReorderMembers={(rowId, orderedIds) => reorderMember.mutate({ rowId, orderedIds })}
                          onManualReorder={markManualReorder}
                          rosterCins={rosterCinList}
                        />
                      </td>

                      {/* Certify */}
                      <td>
                        <CertifyCell
                          row={row}
                          canCertify={canCertify}
                          onCertify={(rowId, memberId) => certify.mutate({ rowId, memberId })}
                          onUncertify={(rowId, memberId) => uncertify.mutate({ rowId, memberId })}
                          onUncertifyAll={(rowId) => uncertifyAll.mutate({ rowId })}
                          onDeleteRow={canCertify ? (rowId) => {
                            if (confirm("Delete this row?")) deleteRow.mutate({ id: rowId });
                          } : undefined}
                        />
                      </td>


                    </tr>
                    );
                    return acc;
                  }, [] as React.ReactNode[])}
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
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Target</label>
              <div className="flex flex-col gap-2">
                {/* Operation's existing targets — selectable */}
                {(operationTargets ?? []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (editSelectedTargetId === t.id) { setEditSelectedTargetId(null); setEditTargetMode("none"); }
                      else { setEditSelectedTargetId(t.id); setEditTargetMode("link"); setEditNewTargetName(""); }
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors w-full ${
                      editSelectedTargetId === t.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <Target className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{t.name}</span>
                    {editSelectedTargetId === t.id && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  </button>
                ))}

                {/* New Target inline input */}
                {editTargetMode === "new" && (
                  <div className="flex gap-2 items-center">
                    <Input
                      placeholder="Full name, born (e.g. John SMITH, born 1 Jan 1980)"
                      value={editNewTargetName}
                      onChange={(e) => setEditNewTargetName(e.target.value)}
                      autoFocus
                      className="flex-1"
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setEditTargetMode("none"); setEditNewTargetName(""); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}

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
                        onChange={(e) => setEditTargetSearch(e.target.value)}
                      />
                      <Button size="sm" variant="ghost" className="shrink-0" onClick={() => { setEditTargetMode("none"); setEditTargetSearch(""); }}>Cancel</Button>
                    </div>
                    <div className="max-h-52 overflow-y-auto flex flex-col gap-1">
                      {(allTargetsForSheet ?? []).filter(t => {
                        const q = editTargetSearch.toLowerCase();
                        return t.name.toLowerCase().includes(q) || (t.tgt ?? "").toLowerCase().includes(q) || (t.operationName ?? "").toLowerCase().includes(q);
                      }).length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">{editTargetSearch ? "No matching targets" : "Start typing to search"}</p>
                      ) : (
                        (allTargetsForSheet ?? []).filter(t => {
                          const q = editTargetSearch.toLowerCase();
                          return t.name.toLowerCase().includes(q) || (t.tgt ?? "").toLowerCase().includes(q) || (t.operationName ?? "").toLowerCase().includes(q);
                        }).map(t => (
                          <button
                            key={t.id}
                            type="button"
                            className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 text-left transition-colors w-full"
                            onClick={() => { setEditSelectedTargetId(t.id); setEditTargetSearch(""); setEditTargetMode("link"); }}
                          >
                            <Target className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {t.tgt ? <span className="font-mono mr-2">TGT: {t.tgt}</span> : null}
                                {t.operationName ? <span>Op: {t.operationName}</span> : null}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Selected linked target chip (not from operation) */}
                {editTargetMode === "link" && editSelectedTargetId !== null && !(operationTargets ?? []).find(t => t.id === editSelectedTargetId) && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary bg-primary/10 text-primary">
                    <Target className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{(allTargetsForSheet ?? []).find(t => t.id === editSelectedTargetId)?.name}</span>
                    <button type="button" onClick={() => { setEditSelectedTargetId(null); setEditTargetMode("none"); }} className="hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                {/* Action buttons */}
                {editTargetMode !== "new" && !(editTargetMode === "link" && editSelectedTargetId === null) && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => { setEditTargetMode("new"); setEditSelectedTargetId(null); }}>
                      <Plus className="w-3.5 h-3.5" /> New Target
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => { setEditTargetMode("link"); setEditSelectedTargetId(null); setEditTargetSearch(""); }}>
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
                  if (confirm(`Move "${sheet?.title}" to the Recycle Bin? It can be restored from there.`)) {
                    deleteSheet.mutate({ id: sheetId });
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleteSheet.isPending ? "Deleting…" : "Delete Sheet"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditSheetOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                // Apply target change first if needed
                const currentTargetId = sheet?.targetId ?? null;
                const newTargetId = editTargetMode === "link" ? editSelectedTargetId : null;
                if (editTargetMode === "link" && newTargetId !== currentTargetId) {
                  setSheetTarget.mutate({ sheetId, targetId: newTargetId });
                } else if (editTargetMode === "none" && editSelectedTargetId === null && currentTargetId !== null) {
                  setSheetTarget.mutate({ sheetId, targetId: null });
                }
                updateSheet.mutate({
                  id: sheetId,
                  title: editTitle.trim(),
                  targetName: editTargetMode === "new" ? (editNewTargetName.trim() || null) : null,
                });
              }}
              disabled={!editTitle.trim() || updateSheet.isPending}
            >
              {updateSheet.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Roster Dialog */}
      <Dialog open={editRosterOpen} onOpenChange={setEditRosterOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit TEAM</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <p className="text-xs text-muted-foreground">
              Add or remove CINs from today’s team. Mark the Team Leader and Running Sheet Author. Tick the camera icon if images were taken by that member.
            </p>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <CinInput
                  value={rosterInput}
                  onChange={setRosterInput}
                  onValidCin={(cin) => { setRosterInput(cin); setRosterInputValid(true); }}
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
            {allUsers && allUsers.some((u) => u.team) && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Add team:</span>
                {(["TEAM1", "TEAM2", "PTT"] as const).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs font-semibold"
                    onClick={() => handleAddRosterTeam(t)}
                  >
                    {t === "TEAM1" ? "TEAM 1" : t === "TEAM2" ? "TEAM 2" : "PTT"}
                  </Button>
                ))}
              </div>
            )}
            {rosterList.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_40px_40px_40px_32px] px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground">
                  <span className="flex items-center">CIN</span>
                  <span className="flex items-center justify-center" title="Team Leader"><span className="text-yellow-400 text-sm">★</span></span>
                  <span className="flex items-center justify-center" title="Running Sheet Author"><span className="text-sky-400 text-sm">✏</span></span>
                  <span className="flex items-center justify-center" title="Images taken"><Camera className="w-3.5 h-3.5" /></span>
                  <span></span>
                </div>
                {rosterList.map((entry) => (
                  <div
                    key={entry.cin}
                    className="grid grid-cols-[1fr_40px_40px_40px_32px] px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <span className="flex items-center text-sm font-mono font-medium text-foreground">{entry.cin}</span>
                    {/* Team Leader — radio: selecting one clears all others */}
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={!!entry.isTeamLeader}
                        onCheckedChange={() =>
                          setRosterList((prev) =>
                            prev.map((c) => ({ ...c, isTeamLeader: c.cin === entry.cin ? !entry.isTeamLeader : false }))
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
                          setRosterList((prev) =>
                            prev.map((c) => ({ ...c, isAuthor: c.cin === entry.cin ? !entry.isAuthor : false }))
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
                          setRosterList((prev) =>
                            prev.map((c) => c.cin === entry.cin ? { ...c, hasImages: !c.hasImages } : c)
                          )
                        }
                        className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                      />
                    </div>
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() => setRosterList((prev) => prev.filter((c) => c.cin !== entry.cin))}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No CINs in team yet.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRosterOpen(false)}>Cancel</Button>
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

      {dupeQueue.length > 0 && dupeQueue[dupeIndex] && (
        <EntityDuplicateDialog
          key={dupeIndex}
          open={dupeDialogOpen}
          onOpenChange={setDupeDialogOpen}
          type={dupeQueue[dupeIndex].type}
          mode="auto"
          candidate={{ label: dupeQueue[dupeIndex].label, rowCount: 0 }}
          existing={{ label: dupeQueue[dupeIndex].match.label, rowCount: dupeQueue[dupeIndex].match.rowCount }}
          reason={dupeQueue[dupeIndex].match.reason}
          onResolved={handleDupeDialogResolved}
        />
      )}
    </DashboardLayout>
  );
}
