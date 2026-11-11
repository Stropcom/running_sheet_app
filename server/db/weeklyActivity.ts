import { and, inArray, isNull } from "drizzle-orm";
import { issuesToShow } from "@shared/summaryIssues";
import {
  aggregateWeeklyIntel,
  buildSheetIntel,
  type WeeklyIntelInput,
  type WeeklyIntelItem,
} from "@shared/sheetIntel";
import {
  operations,
  rowAttachments,
  runningSheets,
  sheetRows,
  targets,
  sheetSummaries,
  sheetIntelLines,
} from "../../drizzle/schema";
import { getDb } from "./core";
import { attachLinkedCounts, normalizeEntityLabel } from "./attachments";
import { getAllIntelligenceEntities } from "./intelEntities";
import {
  OBSERVATION_SIGNAL_RE,
  addDaysISO,
  isNonObservationRow,
  toPerthDateISO,
} from "./reportHelpers";

export interface WeeklyActivityIssue {
  /** The sheet's own date (sheetDate/createdAt fallback), not "when read". */
  date: string | null;
  text: string;
}

export interface WeeklyActivitySpecialProject {
  key: string;
  detail: string | null;
}

export interface WeeklyActivityImage {
  attachmentId: number;
  url: string;
  createdAt: Date;
  /** Same shape LinkedEntityPills renders under a photo on the running sheet. */
  linkedEntities: { category: string; label: string }[];
}

export interface WeeklyActivityNewIntel {
  persons: string[];
  vehicles: string[];
  locations: string[];
  images: WeeklyActivityImage[];
  /** "Actions and items this week": what the target carried, used, did with
   * money or at meetings — one entry per item or action, with straight counts
   * for the week. Built from each sheet's New Intelligence (the lines left
   * ticked, plus hand-added ones). */
  actions: WeeklyIntelItem[];
}

export interface WeeklyActivityTargetBlock {
  /** null = sheets this week with no target assigned. */
  targetId: number | null;
  targetName: string | null;
  officers: string[];
  teamLabel: string | null;
  /** Distinct sheet dates worked, ascending. */
  days: string[];
  /** Sum of (finish - start) across the week's sheets for this target, in hours. */
  coverageHours: number | null;
  /** Each sheet worked this week, earliest first: its date and the start and
   * finish times from its Supervisor Summary (minutes after midnight; null
   * where the Summary has none). The same times the coverage hours add up. */
  shifts: {
    date: string;
    startMinutes: number | null;
    finishMinutes: number | null;
  }[];
  investigator: string | null;
  intelSupport: string | null;
  contacted: string | null;
  specialProjects: WeeklyActivitySpecialProject[];
  objectives: string[];
  criticalDecisions: WeeklyActivityIssue[];
  issues: WeeklyActivityIssue[];
  targetActivity: { label: string; count: number }[];
  newIntel: WeeklyActivityNewIntel;
}

export interface WeeklyActivityOperationBlock {
  operationId: number;
  operationName: string;
  sheetsCount: number;
  rowsCount: number;
  targets: WeeklyActivityTargetBlock[];
}

export interface WeeklyActivityReport {
  weekStart: string;
  weekEnd: string;
  operations: WeeklyActivityOperationBlock[];
}

/** Defensive JSON-array parse for the Supervisor Summary's free-text-array
 * fields (objectives/specialProjects/criticalDecisions) — same tolerance as
 * the client's parseRollupJsonArray, duplicated here since this is the one
 * place server-side that needs to merge several sheets' arrays together
 * rather than just pass the raw string through to the client. */
function parseSummaryJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * "07:33" -> 453, "02:00 PM" -> 840. The Supervisor Summary's time fields
 * are entered 12-hour with an AM/PM suffix ("07:00 AM"–"02:00 PM"), so a
 * bare 24-hour read of the hour digits left every afternoon finish time
 * looking earlier than its own morning start time (2 read as 2am, not
 * 2pm) — coverage hours silently dropped to ~0 for every shift except the
 * one where the PM hour happened to still be numerically >= 12 (12:xx PM).
 * Returns null for anything that doesn't match.
 */
export function parseHHMMToMinutes(
  t: string | null | undefined
): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === "AM" && hour === 12) hour = 0;
  else if (ampm === "PM" && hour !== 12) hour += 12;
  return hour * 60 + minute;
}

/** weekStart is a Monday, YYYY-MM-DD (Perth-anchored). */
export async function getWeeklyActivityReport(
  weekStart: string
): Promise<WeeklyActivityReport> {
  const db = await getDb();
  const weekEnd = addDaysISO(weekStart, 6);
  const empty: WeeklyActivityReport = { weekStart, weekEnd, operations: [] };
  if (!db) return empty;

  const sheets = await db
    .select()
    .from(runningSheets)
    .where(isNull(runningSheets.deletedAt));
  if (!sheets.length) return empty;
  const sheetById = new Map(sheets.map(s => [s.id, s]));
  const opIds = Array.from(new Set(sheets.map(s => s.operationId)));

  // Targets are looked up by the ids the sheets actually reference, not by
  // targets.operationId — that column is a nullable legacy field (the real
  // association is the operation_target_links join table, since a registry
  // target can belong to several operations). Filtering on it silently
  // dropped every registry-created target, leaving Target Activity showing
  // "—" instead of a name.
  const referencedTargetIds = Array.from(
    new Set(
      sheets
        .map(s => s.targetId)
        .filter((id): id is number => typeof id === "number")
    )
  );

  const [ops, targetRows, rows, allEntities, summaryRows] = await Promise.all([
    db.select().from(operations).where(inArray(operations.id, opIds)),
    referencedTargetIds.length
      ? db
          .select()
          .from(targets)
          .where(inArray(targets.id, referencedTargetIds))
      : Promise.resolve([] as (typeof targets.$inferSelect)[]),
    db
      .select()
      .from(sheetRows)
      .where(
        inArray(
          sheetRows.sheetId,
          sheets.map(s => s.id)
        )
      ),
    getAllIntelligenceEntities(),
    db
      .select()
      .from(sheetSummaries)
      .where(
        inArray(
          sheetSummaries.sheetId,
          sheets.map(s => s.id)
        )
      ),
  ]);
  const opById = new Map(ops.map(o => [o.id, o]));
  const targetById = new Map(targetRows.map(t => [t.id, t]));
  const summaryBySheetId = new Map(summaryRows.map(s => [s.sheetId, s]));

  // Priority: explicit rowDate, then the sheet's picker date (sheetDate —
  // the authoritative calendar date for the sheet, distinct from createdAt),
  // then createdAt only as a last resort for legacy sheets with no
  // sheetDate. Falling straight to createdAt (as this used to) silently
  // misdated every row on a sheet created for a different day than it was
  // actually saved, dropping it out of every week's report entirely.
  function resolveRowDate(row: (typeof rows)[number]): string {
    if (row.rowDate) return row.rowDate;
    const sheet = sheetById.get(row.sheetId);
    return addDaysISO(
      sheet?.sheetDate ?? toPerthDateISO(sheet?.createdAt ?? new Date()),
      row.dayOffset
    );
  }
  function resolveSheetDate(sheetId: number): string | null {
    const sheet = sheetById.get(sheetId);
    if (!sheet) return null;
    return sheet.sheetDate ?? toPerthDateISO(sheet.createdAt);
  }
  const rowById = new Map(rows.map(r => [r.id, r]));
  const rowsInWeek = rows.filter(r => {
    const d = resolveRowDate(r);
    return d >= weekStart && d <= weekEnd;
  });

  // ── Group this week's sheets by operation, then by target (null = no
  // target assigned) — every other section below hangs off this grouping,
  // matching the "one report block per target" layout the Weekly Surveillance
  // Report renders. ────────────────────────────────────────────────────────
  type GroupKey = string; // `${operationId}:${targetId ?? "none"}`
  const groupKey = (operationId: number, targetId: number | null): GroupKey =>
    `${operationId}:${targetId ?? "none"}`;

  const opSheetIds = new Map<number, Set<number>>();
  const opRowsCount = new Map<number, number>();
  const groupSheetIds = new Map<GroupKey, Set<number>>();
  const groupMeta = new Map<
    GroupKey,
    { operationId: number; targetId: number | null }
  >();
  for (const r of rowsInWeek) {
    const sheet = sheetById.get(r.sheetId);
    if (!sheet) continue;
    if (!opSheetIds.has(sheet.operationId))
      opSheetIds.set(sheet.operationId, new Set());
    opSheetIds.get(sheet.operationId)!.add(sheet.id);
    opRowsCount.set(
      sheet.operationId,
      (opRowsCount.get(sheet.operationId) ?? 0) + 1
    );

    const targetId = sheet.targetId ?? null;
    const key = groupKey(sheet.operationId, targetId);
    if (!groupSheetIds.has(key)) {
      groupSheetIds.set(key, new Set());
      groupMeta.set(key, { operationId: sheet.operationId, targetId });
    }
    groupSheetIds.get(key)!.add(sheet.id);
  }

  // ── Deployment / Investigator / Special Projects / Objectives / Critical
  // Decisions / Issues — all sourced from each sheet's Supervisor Summary
  // (sheetSummaries), aggregated across every sheet in the group. ─────────
  const officersByGroup = new Map<GroupKey, Set<string>>();
  const teamLabelsByGroup = new Map<GroupKey, Set<string>>();
  const daysByGroup = new Map<GroupKey, Set<string>>();
  const coverageMinutesByGroup = new Map<GroupKey, number>();
  const shiftsByGroup = new Map<
    GroupKey,
    WeeklyActivityTargetBlock["shifts"]
  >();
  const investigatorByGroup = new Map<GroupKey, string>();
  const intelSupportByGroup = new Map<GroupKey, string>();
  const contactedByGroup = new Map<GroupKey, string>();
  // Keyed by normalized "key|detail" per group — the same special project
  // is typically re-typed into every sheet's Supervisor Summary for the
  // week it spans, so a plain push-per-sheet duplicated it once per day.
  const specialProjectsByGroup = new Map<
    GroupKey,
    Map<string, WeeklyActivitySpecialProject>
  >();
  const objectivesByGroup = new Map<GroupKey, Set<string>>();
  const criticalDecisionsByGroup = new Map<GroupKey, WeeklyActivityIssue[]>();
  const issuesByGroup = new Map<GroupKey, WeeklyActivityIssue[]>();

  for (const [key, sheetIds] of Array.from(groupSheetIds.entries())) {
    // Newest sheet first, so "latest wins" for investigator/intel/contacted.
    const orderedSheetIds = Array.from(sheetIds).sort((a, b) => {
      const da = resolveSheetDate(a) ?? "";
      const db_ = resolveSheetDate(b) ?? "";
      return db_.localeCompare(da);
    });
    for (const sheetId of orderedSheetIds) {
      const sheet = sheetById.get(sheetId);
      if (sheet?.sheetCins) {
        try {
          const cins: { cin: string }[] = JSON.parse(sheet.sheetCins);
          for (const c of cins) {
            if (!c.cin) continue;
            if (!officersByGroup.has(key)) officersByGroup.set(key, new Set());
            officersByGroup.get(key)!.add(c.cin);
          }
        } catch {
          // malformed roster JSON — skip officers for this sheet
        }
      }
      const date = resolveSheetDate(sheetId);
      if (date) {
        if (!daysByGroup.has(key)) daysByGroup.set(key, new Set());
        daysByGroup.get(key)!.add(date);
      }

      const summary = summaryBySheetId.get(sheetId);
      if (date) {
        if (!shiftsByGroup.has(key)) shiftsByGroup.set(key, []);
        shiftsByGroup.get(key)!.push({
          date,
          startMinutes: parseHHMMToMinutes(summary?.startTime),
          finishMinutes: parseHHMMToMinutes(summary?.finishTime),
        });
      }
      if (!summary) continue;

      if (summary.teamLabel) {
        if (!teamLabelsByGroup.has(key)) teamLabelsByGroup.set(key, new Set());
        teamLabelsByGroup.get(key)!.add(summary.teamLabel);
      }
      const startMin = parseHHMMToMinutes(summary.startTime);
      const finishMin = parseHHMMToMinutes(summary.finishTime);
      if (startMin !== null && finishMin !== null && finishMin > startMin) {
        coverageMinutesByGroup.set(
          key,
          (coverageMinutesByGroup.get(key) ?? 0) + (finishMin - startMin)
        );
      }
      if (summary.ioSupport?.trim() && !investigatorByGroup.has(key))
        investigatorByGroup.set(key, summary.ioSupport.trim());
      if (summary.intelSupport?.trim() && !intelSupportByGroup.has(key))
        intelSupportByGroup.set(key, summary.intelSupport.trim());
      const contactParts = [summary.ioContactTiming, summary.ioContactMethod]
        .map(p => p?.trim())
        .filter((p): p is string => !!p);
      if (contactParts.length && !contactedByGroup.has(key))
        contactedByGroup.set(key, contactParts.join(" — "));

      for (const p of parseSummaryJsonArray<{ key: string; detail?: string }>(
        summary.specialProjects
      )) {
        if (!p.key?.trim()) continue;
        const project: WeeklyActivitySpecialProject = {
          key: p.key.trim(),
          detail: p.detail?.trim() || null,
        };
        const dedupeKey = `${project.key.toLowerCase()}|${(project.detail ?? "").toLowerCase()}`;
        if (!specialProjectsByGroup.has(key))
          specialProjectsByGroup.set(key, new Map());
        if (!specialProjectsByGroup.get(key)!.has(dedupeKey))
          specialProjectsByGroup.get(key)!.set(dedupeKey, project);
      }
      for (const o of parseSummaryJsonArray<string>(summary.objectives)) {
        if (!o.trim()) continue;
        if (!objectivesByGroup.has(key)) objectivesByGroup.set(key, new Set());
        objectivesByGroup.get(key)!.add(o.trim());
      }
      for (const d of parseSummaryJsonArray<string>(
        summary.criticalDecisions
      )) {
        if (!d.trim()) continue;
        if (!criticalDecisionsByGroup.has(key))
          criticalDecisionsByGroup.set(key, []);
        criticalDecisionsByGroup.get(key)!.push({ date, text: d.trim() });
      }
      for (const issue of issuesToShow(summary.issues)) {
        if (!issuesByGroup.has(key)) issuesByGroup.set(key, []);
        issuesByGroup.get(key)!.push({ date, text: issue });
      }
    }
  }

  // ── New intelligence — persons/vehicles/locations whose *first-ever*
  // occurrence (all time, not just this week) falls inside the week, i.e.
  // genuinely new discoveries rather than repeat mentions of something
  // already known — plus images uploaded this week. Both attributed to the
  // target of the sheet the mention/photo actually happened on. ──────────
  const newPersonsByGroup = new Map<GroupKey, Set<string>>();
  const newVehiclesByGroup = new Map<GroupKey, Set<string>>();
  const newLocationsByGroup = new Map<GroupKey, Set<string>>();
  for (const entity of allEntities) {
    if (
      entity.type !== "address" &&
      entity.type !== "business" &&
      entity.type !== "vehicle" &&
      entity.type !== "person"
    )
      continue;
    let earliestDate: string | null = null;
    const groupsSeenThisWeek = new Set<GroupKey>();
    for (const occ of entity.occurrences) {
      if (occ.rowId === 0) continue; // target-card entry, not a real sighting
      const row = rowById.get(occ.rowId);
      const d = row ? resolveRowDate(row) : null;
      if (!d) continue;
      if (earliestDate === null || d < earliestDate) earliestDate = d;
      if (d >= weekStart && d <= weekEnd) {
        const sheet = row ? sheetById.get(row.sheetId) : undefined;
        if (!sheet) continue;
        groupsSeenThisWeek.add(
          groupKey(sheet.operationId, sheet.targetId ?? null)
        );
      }
    }
    if (
      earliestDate === null ||
      earliestDate < weekStart ||
      earliestDate > weekEnd
    )
      continue; // not newly discovered this week
    const targetMap =
      entity.type === "vehicle"
        ? newVehiclesByGroup
        : entity.type === "person"
          ? newPersonsByGroup
          : newLocationsByGroup;
    for (const key of Array.from(groupsSeenThisWeek)) {
      if (!targetMap.has(key)) targetMap.set(key, new Set());
      targetMap.get(key)!.add(entity.shortForm);
    }
  }

  // ── Actions and items — what the target carried, used, did with money or
  // at meetings (shared/sheetIntel.ts). Straight counts for the week: every
  // line counts, nothing is carried over from other weeks. A line the
  // supervisor unticked on the sheet's New Intelligence is left out; a
  // hand-added line is in and says who added it. ──────────────────────────
  const intelInputsByGroup = new Map<GroupKey, WeeklyIntelInput[]>();
  {
    const sheetIdsInGroups = Array.from(
      new Set(
        Array.from(groupSheetIds.values()).flatMap(ids => Array.from(ids))
      )
    );
    const manualBySheet = new Map<
      number,
      (typeof sheetIntelLines.$inferSelect)[]
    >();
    if (sheetIdsInGroups.length) {
      const manual = await db
        .select()
        .from(sheetIntelLines)
        .where(inArray(sheetIntelLines.sheetId, sheetIdsInGroups));
      for (const m of manual) {
        if (!manualBySheet.has(m.sheetId)) manualBySheet.set(m.sheetId, []);
        manualBySheet.get(m.sheetId)!.push(m);
      }
    }
    const weekRowsBySheet = new Map<number, typeof rowsInWeek>();
    for (const r of rowsInWeek) {
      if (!weekRowsBySheet.has(r.sheetId)) weekRowsBySheet.set(r.sheetId, []);
      weekRowsBySheet.get(r.sheetId)!.push(r);
    }
    for (const [key, sheetIds] of Array.from(groupSheetIds.entries())) {
      const inputs: WeeklyIntelInput[] = [];
      for (const sheetId of Array.from(sheetIds)) {
        const sheetDate = resolveSheetDate(sheetId);
        let hidden: string[] = [];
        try {
          const raw = summaryBySheetId.get(sheetId)?.intelHiddenKeys;
          const parsed = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed)) hidden = parsed;
        } catch {
          hidden = [];
        }
        // Only the week's rows; hand-added lines belong to the sheet, so they
        // are in when the sheet's own date is in the week.
        const manualLines =
          sheetDate && sheetDate >= weekStart && sheetDate <= weekEnd
            ? (manualBySheet.get(sheetId) ?? [])
            : [];
        const lines = buildSheetIntel({
          rows: weekRowsBySheet.get(sheetId) ?? [],
          manualLines,
          hiddenKeys: hidden,
        });
        for (const l of lines) {
          if (!l.included) continue;
          const date =
            l.source === "manual"
              ? sheetDate
              : (() => {
                  const row = l.rowId ? rowById.get(l.rowId) : undefined;
                  return row ? resolveRowDate(row) : null;
                })();
          if (!date) continue;
          inputs.push({
            category: l.category,
            heading: l.heading,
            group: l.group,
            sentence: l.sentence,
            matched: l.matched,
            also: l.alsoMatched,
            date,
            addedByCIN: l.source === "manual" ? l.addedByCIN : undefined,
          });
        }
      }
      if (inputs.length) intelInputsByGroup.set(key, inputs);
    }
  }

  const attachments = await db
    .select({
      id: rowAttachments.id,
      rowId: rowAttachments.rowId,
      operationId: rowAttachments.operationId,
      url: rowAttachments.url,
      createdAt: rowAttachments.createdAt,
    })
    .from(rowAttachments)
    .where(
      and(
        inArray(rowAttachments.operationId, opIds),
        isNull(rowAttachments.deletedAt)
      )
    );
  const attachmentsInWeek = attachments.filter(a => {
    const d = toPerthDateISO(a.createdAt);
    return d >= weekStart && d <= weekEnd;
  });
  const attachmentsWithLinks = await attachLinkedCounts(db, attachmentsInWeek);
  const imagesByGroup = new Map<GroupKey, WeeklyActivityImage[]>();
  for (const a of attachmentsWithLinks) {
    const row = a.rowId ? rowById.get(a.rowId) : undefined;
    const sheet = row ? sheetById.get(row.sheetId) : undefined;
    const key = groupKey(a.operationId, sheet?.targetId ?? null);
    if (!imagesByGroup.has(key)) imagesByGroup.set(key, []);
    imagesByGroup.get(key)!.push({
      attachmentId: a.id,
      url: a.url,
      createdAt: a.createdAt,
      linkedEntities: a.linkedEntities,
    });
  }

  // ── Target visit activity — same qualifying-mention + session-collapse
  // rules as the Heat Map (skip target-card entries, Surveillance
  // Commenced/Ceased and Travelled Via rows, require an observation-signal
  // keyword, collapse consecutive same-address mentions into one visit) —
  // grouped the same way as everything else above. ────────────────────────
  const previousObservationByRowId = new Map<number, string | null>();
  const rowOrderIndex = new Map<number, number>();
  {
    const bySheet = new Map<number, typeof rows>();
    for (const r of rows) {
      if (!bySheet.has(r.sheetId)) bySheet.set(r.sheetId, []);
      bySheet.get(r.sheetId)!.push(r);
    }
    for (const list of Array.from(bySheet.values())) {
      list.sort(
        (a, b) =>
          (a.timeMinutes ?? 0) - (b.timeMinutes ?? 0) ||
          a.rowNumber - b.rowNumber
      );
      list.forEach((r, i) => {
        previousObservationByRowId.set(
          r.id,
          i > 0 ? (list[i - 1].observation ?? null) : null
        );
        rowOrderIndex.set(r.id, i);
      });
    }
  }

  type QualifyingMention = {
    entityKey: string;
    label: string;
    groupKey: GroupKey;
    order: number;
  };
  const qualifying: QualifyingMention[] = [];
  for (const entity of allEntities) {
    if (entity.type !== "address" && entity.type !== "business") continue;
    for (const occ of entity.occurrences) {
      if (occ.rowId === 0) continue;
      const row = rowById.get(occ.rowId);
      if (!row?.observation) continue;
      const d = resolveRowDate(row);
      if (d < weekStart || d > weekEnd) continue;
      const sheet = sheetById.get(row.sheetId);
      if (!sheet?.targetId) continue; // no target assigned — not attributable
      if (
        isNonObservationRow(
          row.observation,
          previousObservationByRowId.get(occ.rowId) ?? null
        )
      )
        continue;
      if (!OBSERVATION_SIGNAL_RE.test(row.observation)) continue;
      qualifying.push({
        entityKey: normalizeEntityLabel(entity.shortForm),
        label: entity.shortForm,
        groupKey: groupKey(sheet.operationId, sheet.targetId),
        order: rowOrderIndex.get(occ.rowId) ?? 0,
      });
    }
  }
  const visitCountsByGroup = new Map<
    GroupKey,
    Map<string, { label: string; count: number }>
  >();
  const qualifyingByGroup = new Map<GroupKey, QualifyingMention[]>();
  for (const m of qualifying) {
    if (!qualifyingByGroup.has(m.groupKey))
      qualifyingByGroup.set(m.groupKey, []);
    qualifyingByGroup.get(m.groupKey)!.push(m);
  }
  for (const [key, mentions] of Array.from(qualifyingByGroup.entries())) {
    mentions.sort((a, b) => a.order - b.order);
    let lastEntityKey: string | null = null;
    const grouped = new Map<string, { label: string; count: number }>();
    for (const m of mentions) {
      if (m.entityKey === lastEntityKey) continue;
      lastEntityKey = m.entityKey;
      const existing = grouped.get(m.entityKey);
      if (existing) existing.count++;
      else grouped.set(m.entityKey, { label: m.label, count: 1 });
    }
    visitCountsByGroup.set(key, grouped);
  }

  // ── Assemble: one WeeklyActivityTargetBlock per group, nested under its
  // operation ──────────────────────────────────────────────────────────────
  const allGroupKeys = new Set<GroupKey>([
    ...Array.from(groupSheetIds.keys()),
    ...Array.from(imagesByGroup.keys()),
    ...Array.from(newPersonsByGroup.keys()),
    ...Array.from(newVehiclesByGroup.keys()),
    ...Array.from(newLocationsByGroup.keys()),
    ...Array.from(visitCountsByGroup.keys()),
  ]);
  const targetBlocksByOp = new Map<number, WeeklyActivityTargetBlock[]>();
  for (const key of Array.from(allGroupKeys)) {
    const meta = groupMeta.get(key);
    // A group can only come from imagesByGroup/newIntel/visitCounts (never
    // groupSheetIds) if a photo or mention landed on a sheet that itself had
    // no row in the week — shouldn't happen given how each map is built, but
    // skip defensively rather than render a block with no coverage data.
    if (!meta) continue;
    const { operationId, targetId } = meta;
    const target = targetId ? targetById.get(targetId) : null;
    const coverageMinutes = coverageMinutesByGroup.get(key) ?? null;

    const block: WeeklyActivityTargetBlock = {
      targetId,
      targetName: target?.name ?? null,
      officers: Array.from(officersByGroup.get(key) ?? []).sort(),
      teamLabel:
        Array.from(teamLabelsByGroup.get(key) ?? []).join(", ") || null,
      days: Array.from(daysByGroup.get(key) ?? []).sort(),
      coverageHours:
        coverageMinutes !== null
          ? Math.round((coverageMinutes / 60) * 10) / 10
          : null,
      shifts: (shiftsByGroup.get(key) ?? []).sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.startMinutes ?? 0) - (b.startMinutes ?? 0)
      ),
      investigator: investigatorByGroup.get(key) ?? null,
      intelSupport: intelSupportByGroup.get(key) ?? null,
      contacted: contactedByGroup.get(key) ?? null,
      specialProjects: Array.from(
        (specialProjectsByGroup.get(key) ?? new Map()).values()
      ),
      objectives: Array.from(objectivesByGroup.get(key) ?? []),
      criticalDecisions: (criticalDecisionsByGroup.get(key) ?? []).sort(
        (a, b) => (a.date ?? "").localeCompare(b.date ?? "")
      ),
      issues: (issuesByGroup.get(key) ?? []).sort((a, b) =>
        (a.date ?? "").localeCompare(b.date ?? "")
      ),
      targetActivity: Array.from(
        (visitCountsByGroup.get(key) ?? new Map()).values()
      ).sort((a, b) => b.count - a.count),
      newIntel: {
        persons: Array.from(newPersonsByGroup.get(key) ?? []).sort(),
        vehicles: Array.from(newVehiclesByGroup.get(key) ?? []).sort(),
        locations: Array.from(newLocationsByGroup.get(key) ?? []).sort(),
        images: (imagesByGroup.get(key) ?? []).sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        ),
        actions: aggregateWeeklyIntel(intelInputsByGroup.get(key) ?? []),
      },
    };
    if (!targetBlocksByOp.has(operationId))
      targetBlocksByOp.set(operationId, []);
    targetBlocksByOp.get(operationId)!.push(block);
  }
  for (const blocks of Array.from(targetBlocksByOp.values())) {
    // Named targets alphabetically first, the "no target" block (targetId
    // null) last — matches how the report reads: specific work first, the
    // catch-all bucket at the end.
    blocks.sort((a, b) => {
      if (a.targetId === null && b.targetId === null) return 0;
      if (a.targetId === null) return 1;
      if (b.targetId === null) return -1;
      return (a.targetName ?? "").localeCompare(b.targetName ?? "");
    });
  }

  const operationBlocks: WeeklyActivityOperationBlock[] = Array.from(
    opSheetIds.keys()
  )
    .map(opId => ({
      operationId: opId,
      operationName: opById.get(opId)?.name ?? "—",
      sheetsCount: opSheetIds.get(opId)?.size ?? 0,
      rowsCount: opRowsCount.get(opId) ?? 0,
      targets: targetBlocksByOp.get(opId) ?? [],
    }))
    .sort((a, b) => a.operationName.localeCompare(b.operationName));

  return { weekStart, weekEnd, operations: operationBlocks };
}
