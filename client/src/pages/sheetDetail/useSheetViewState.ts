// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen used to be one
// 4,900-line function; its state and handlers are now these step hooks, called in this order:
// useSheetData → useRowActions → useRowChecks → useRowMembers → useSheetViewState → useSheetEditing.
// Same code in the same order as before; see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useMyTeams } from "@/lib/teams";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  computeUsedBracketCodes,
  computeUsedVehicleRegos,
  computeUsedAddressLabels,
} from "@/lib/mentionAutocomplete";
import { toast } from "sonner";
import type { SheetDataState } from "./useSheetData";
import type { RowActionsState } from "./useRowActions";

export function useSheetViewState(
  s: Pick<
    SheetDataState,
    "setOpenDraft" | "rows" | "sheet" | "isAuthenticated" | "utils" | "sheetId"
  > &
    Pick<RowActionsState, "undoStack" | "setUndoStack" | "updateRow">
) {
  const {
    setOpenDraft,
    undoStack,
    setUndoStack,
    rows,
    updateRow,
    sheet,
    isAuthenticated,
    utils,
    sheetId,
  } = s;

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

  return {
    searchQuery,
    setSearchQuery,
    teamPanelExpanded,
    setTeamPanelExpanded,
    targetPanelExpanded,
    setTargetPanelExpanded,
    focusedTextareaRef,
    sortReversed,
    toggleSortReversed,
    handleUndo,
    editSheetOpen,
    setEditSheetOpen,
    editSheetDate,
    setEditSheetDate,
    setEditTargetName,
    editTargetMode,
    setEditTargetMode,
    editSelectedTargetId,
    setEditSelectedTargetId,
    editCreateTargetDialogOpen,
    setEditCreateTargetDialogOpen,
    operationTargets,
    allUsers,
    myTeams,
    allTargetsForSheet,
    editTargetSearch,
    setEditTargetSearch,
    setSheetTarget,
    shortcutsData,
    assignedTarget,
    shortcutMap,
    usedBracketCodes,
    usedVehicleRegos,
    usedAddressLabels,
  };
}

export type SheetViewStateState = ReturnType<typeof useSheetViewState>;
